import { auth, getUserRoles } from "@/auth";
import { NextResponse } from "next/server";

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

type Handler = (ctx: UserContext, req: Request) => Promise<NextResponse>;

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
