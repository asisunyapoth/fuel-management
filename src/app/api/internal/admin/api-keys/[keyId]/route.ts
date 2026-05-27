import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { requireRole } from "@/lib/auth/secureRoute";

/**
 * DELETE /api/internal/admin/api-keys/[keyId]
 *
 * Revokes an API key. Sets revokedAt and isActive = false.
 * Revocation is immediate — the key will be rejected on the next request.
 *
 * Requires: system_admin role
 */
export const DELETE = requireRole("system_admin", async (_ctx, req) => {
  const segments = new URL(req.url).pathname.split("/");
  const keyId = parseInt(segments[segments.length - 1]);
  if (isNaN(keyId)) {
    return NextResponse.json({ error: "Invalid keyId" }, { status: 400 });
  }

  const [existing] = await db
    .select({ keyId: apiKeys.keyId, isActive: apiKeys.isActive })
    .from(apiKeys)
    .where(eq(apiKeys.keyId, keyId))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!existing.isActive) {
    return NextResponse.json({ error: "Key is already revoked" }, { status: 409 });
  }

  await db
    .update(apiKeys)
    .set({ isActive: false, revokedAt: new Date() })
    .where(eq(apiKeys.keyId, keyId));

  return NextResponse.json({ success: true });
});
