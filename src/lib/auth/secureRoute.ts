import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export type UserContext = {
  userId: string;
  /**
   * All roles assigned to this user (e.g. ["system_admin", "pac_officer"]).
   * Use `ctx.roles.includes("some_role")` to check for a specific role.
   *
   * Backward-compatible: if the legacy single `role` string is present in
   * publicMetadata (pre-migration accounts), it is normalised into this array.
   */
  roles: string[];
  provinceCode: string | null;
  linkedLicenses: string[];
};

type Handler = (ctx: UserContext, req: Request) => Promise<NextResponse>;

/** Derive the roles array from Clerk publicMetadata, supporting both the legacy
 *  `role: "pac_officer"` (single string) and the new `roles: ["pac_officer"]` format. */
function extractRoles(metadata: Record<string, unknown>): string[] {
  const arr = metadata.roles as string[] | undefined;
  if (Array.isArray(arr) && arr.length > 0) return arr;
  const single = metadata.role as string | undefined;
  if (single) return [single];
  return [];
}

/**
 * HOF that wraps route handlers with Clerk auth.
 * Extracts userId strictly from the verified JWT — never trusts client payloads.
 * Business logic receives only the verified UserContext.
 */
export function secureRoute(handler: Handler) {
  return async (req: Request): Promise<NextResponse> => {
    const { userId, sessionClaims } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const metadata = (sessionClaims?.metadata ?? {}) as Record<string, unknown>;

    const ctx: UserContext = {
      userId,
      roles: extractRoles(metadata),
      provinceCode: (metadata.province_code as string) ?? null,
      linkedLicenses: (metadata.linked_licenses as string[]) ?? [],
    };

    return handler(ctx, req);
  };
}

/**
 * Guard that additionally requires a specific role.
 * Returns 403 if the user does not hold that role.
 * Works with multi-role users — checks roles.includes(role).
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
 * that the queried province matches the officer's linked province.
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
    if (requestedProvince && requestedProvince !== ctx.provinceCode) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return handler(ctx, req);
  });
}
