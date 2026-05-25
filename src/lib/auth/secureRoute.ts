import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export type UserContext = {
  userId: string;
  role: string | null;
  provinceCode: string | null;
  linkedLicenses: string[];
};

type Handler = (ctx: UserContext, req: Request) => Promise<NextResponse>;

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
      role: (metadata.role as string) ?? null,
      provinceCode: (metadata.province_code as string) ?? null,
      linkedLicenses: (metadata.linked_licenses as string[]) ?? [],
    };

    return handler(ctx, req);
  };
}

/**
 * Guard that additionally requires a specific role.
 * Returns 403 if the verified role doesn't match.
 */
export function requireRole(role: string, handler: Handler) {
  return secureRoute(async (ctx, req) => {
    if (ctx.role !== role) {
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
    if (ctx.role !== "pac_officer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const requestedProvince = getProvinceCode(req);
    if (requestedProvince && requestedProvince !== ctx.provinceCode) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return handler(ctx, req);
  });
}
