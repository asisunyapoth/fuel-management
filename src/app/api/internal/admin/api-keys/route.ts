import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { eq, desc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { requireRole } from "@/lib/auth/secureRoute";
import { z } from "zod";

function sha256hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

const createSchema = z.object({
  name:      z.string().min(1).max(200),
  licenseNo: z.string().max(30).optional(),
});

/**
 * POST /api/internal/admin/api-keys
 *
 * Generates a new API key for programmatic access.
 * Returns the full key ONCE — it is not stored in cleartext and cannot be
 * retrieved again. The admin must copy it immediately.
 *
 * Body: { name: string, licenseNo?: string }
 *
 * Response 201:
 * {
 *   "keyId": 1,
 *   "key": "rfdrs_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",  ← shown ONCE
 *   "keyPrefix": "rfdrs_a1b2c3",
 *   "name": "Brand HQ Production"
 * }
 *
 * Requires: system_admin role
 */
export const POST = requireRole("system_admin", async (ctx, req) => {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { name, licenseNo } = parsed.data;

  // Generate: rfdrs_ + 32 random hex chars = 38 chars total
  const rawKey    = "rfdrs_" + randomBytes(16).toString("hex");
  const keyHash   = sha256hex(rawKey);
  const keyPrefix = rawKey.slice(0, 12);  // "rfdrs_a1b2c3"

  const [row] = await db
    .insert(apiKeys)
    .values({
      name,
      keyHash,
      keyPrefix,
      licenseNo: licenseNo ?? null,
      createdBy: ctx.userId,
    })
    .returning({ keyId: apiKeys.keyId });

  return NextResponse.json(
    {
      keyId:     row.keyId,
      key:       rawKey,      // ONLY time this is returned — not stored in DB
      keyPrefix,
      name,
    },
    { status: 201 }
  );
});

/**
 * GET /api/internal/admin/api-keys
 *
 * Lists all API keys (active + revoked). Never returns the raw key value.
 *
 * Requires: system_admin role
 */
export const GET = requireRole("system_admin", async () => {
  const rows = await db
    .select({
      keyId:      apiKeys.keyId,
      name:       apiKeys.name,
      keyPrefix:  apiKeys.keyPrefix,
      licenseNo:  apiKeys.licenseNo,
      isActive:   apiKeys.isActive,
      createdAt:  apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt:  apiKeys.revokedAt,
    })
    .from(apiKeys)
    .orderBy(desc(apiKeys.createdAt));

  return NextResponse.json({ keys: rows });
});
