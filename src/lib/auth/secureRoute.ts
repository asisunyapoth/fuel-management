import { auth, getUserRoles } from "@/auth";
import { NextResponse } from "next/server";
import {
  validatePersonalToken,
  type PersonalTokenClaims,
} from "@/lib/auth/validatePersonalToken";
import { eq, and } from "drizzle-orm";

export type UserContext = {
  userId: string;
  /**
   * All roles assigned to this user (e.g. ["system_admin", "pac_officer"]).
   * Loaded from the user_roles DB table on every protected request.
   */
  roles: string[];
  provinceCode: string | null;
  linkedLicenses: string[];
};

/**
 * UserContext for routes authenticated via DGA personal_token.
 * Roles are loaded from the DB the same way as session-based routes;
 * DGA identity claims are also available for auditing.
 */
export type TokenUserContext = UserContext & {
  /** Raw DGA identity claims resolved from the personal_token */
  dgaClaims: PersonalTokenClaims;
};

type Handler = (ctx: UserContext, req: Request) => Promise<NextResponse>;
type TokenHandler = (ctx: TokenUserContext, req: Request) => Promise<NextResponse>;

/**
 * HOF that wraps route handlers with Auth.js session verification.
 * Extracts userId strictly from the server-side session — never trusts client payloads.
 * Loads roles from the user_roles DB table on every request.
 */
export function secureRoute(handler: Handler) {
  return async (req: Request): Promise<NextResponse> => {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const roles = await getUserRoles(userId);

    // province_code and linked_licenses come from user_profiles / user_province_links
    // They are loaded lazily in route handlers that need them (via DB join).
    // For backwards compatibility, expose provinceCode = null here; routes that
    // need it should query user_province_links directly.
    const ctx: UserContext = {
      userId,
      roles,
      provinceCode: null,
      linkedLicenses: [],
    };

    return handler(ctx, req);
  };
}

/**
 * Guard that additionally requires a specific role.
 * Returns 403 if the user does not hold that role.
 */
export function requireRole(role: string, handler: Handler) {
  return secureRoute(async (ctx, req) => {
    if (!ctx.roles.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return handler(ctx, req);
  });
}

/**
 * Guard for อบจ. officers — requires pac_officer role AND verifies
 * that the queried province matches the officer's linked province (via DB).
 */
export function requireProvinceAccess(
  getProvinceCode: (req: Request) => string | null,
  handler: Handler
) {
  return secureRoute(async (ctx, req) => {
    if (!ctx.roles.includes("pac_officer")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const requestedProvince = getProvinceCode(req);
    if (requestedProvince) {
      // Verify this officer is actually linked to the requested province
      const { db } = await import("@/db");
      const { userProvinceLinks } = await import("@/db/schema");
      const { eq, and } = await import("drizzle-orm");
      const [link] = await db
        .select({ provinceCode: userProvinceLinks.provinceCode })
        .from(userProvinceLinks)
        .where(
          and(
            eq(userProvinceLinks.userId, ctx.userId),
            eq(userProvinceLinks.provinceCode, requestedProvince)
          )
        )
        .limit(1);
      if (!link) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    return handler(ctx, req);
  });
}

/**
 * HOF that authenticates via DGA personal_token in the Authorization header.
 *
 * Usage:
 *   export const GET = requirePersonalToken(async (ctx, req) => { ... });
 *
 * The caller must send:
 *   Authorization: Bearer <personal_token>
 *
 * Validation flow:
 *   1. Extract Bearer token from Authorization header
 *   2. Call DGA /connect/userinfo with the token — proves it is live and
 *      resolves the token back to a real DGA Digital ID identity
 *   3. Look up the matching internal user by DGA sub (auth_users.id = sub)
 *   4. Load roles from user_roles DB table
 *   5. Inject full TokenUserContext (userId + roles + dgaClaims) into handler
 *
 * Security properties:
 *   - Short-lived (30 min) — limits exposure window
 *   - Every call validated against DGA live — no stale tokens accepted
 *   - dgaClaims.sub provides immutable DGA identity for audit trails
 *   - Future standalone API services can use this HOF without session cookies
 *
 * Returns 401 if token is missing or expired, 404 if user not in our DB.
 */
export function requirePersonalToken(handler: TokenHandler) {
  return async (req: Request): Promise<NextResponse> => {
    // ── 1. Extract Bearer token ────────────────────────────────────────
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized", detail: "Authorization: Bearer <personal_token> required" },
        { status: 401 }
      );
    }

    // ── 2. Validate against DGA /connect/userinfo ──────────────────────
    const dgaClaims = await validatePersonalToken(token);
    if (!dgaClaims) {
      return NextResponse.json(
        { error: "Unauthorized", detail: "personal_token invalid or expired" },
        { status: 401 }
      );
    }

    // ── 3. Resolve internal user ID via auth_accounts ─────────────────
    // Auth.js DrizzleAdapter generates its own UUID for auth_users.id and
    // stores DGA's sub as auth_accounts.provider_account_id. We must join
    // through auth_accounts to get the correct internal user ID.
    const { db } = await import("@/db");
    const { authAccounts } = await import("@/db/schema");
    const [account] = await db
      .select({ userId: authAccounts.userId })
      .from(authAccounts)
      .where(
        and(
          eq(authAccounts.provider, "dga-digital-id"),
          eq(authAccounts.providerAccountId, dgaClaims.sub)
        )
      )
      .limit(1);

    if (!account) {
      // DGA identity is valid but not linked to any account in our system
      return NextResponse.json(
        { error: "Unauthorized", detail: "DGA identity not linked to any account" },
        { status: 401 }
      );
    }

    const userId = account.userId;

    // ── 4. Load roles ──────────────────────────────────────────────────
    const roles = await getUserRoles(userId);

    const ctx: TokenUserContext = {
      userId,
      roles,
      provinceCode: null,
      linkedLicenses: [],
      dgaClaims,
    };

    return handler(ctx, req);
  };
}

/**
 * Combined guard: accepts EITHER a valid session cookie OR a DGA personal_token.
 * Useful for routes that should be callable from both the web app and direct API clients.
 *
 * Order of precedence:
 *   1. If Authorization: Bearer header is present → validate personal_token
 *   2. Otherwise                                  → validate session cookie
 */
export function secureRouteAny(handler: Handler) {
  return async (req: Request): Promise<NextResponse> => {
    const authHeader = req.headers.get("authorization") ?? "";

    if (authHeader.startsWith("Bearer ")) {
      // Delegate to personal_token path
      return requirePersonalToken(handler as unknown as TokenHandler)(req);
    }

    // Fall back to session-cookie path
    return secureRoute(handler)(req);
  };
}
