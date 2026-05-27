import { createHash } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { NextResponse } from "next/server";

/**
 * Context injected into v1 API route handlers authenticated via API key.
 */
export type ApiKeyContext = {
  /** Primary key of the api_keys row */
  apiKeyId: number;
  /**
   * Dealer license scope. Non-null means this key can only access stations
   * whose dealer_license_no matches. Null = full / admin access.
   */
  licenseNo: string | null;
  /** Human-readable name set when the key was generated */
  keyName: string;
};

type ApiKeyHandler = (ctx: ApiKeyContext, req: Request) => Promise<NextResponse>;

function sha256hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * HOF that authenticates requests via a static API key in the Authorization header.
 *
 * Usage:
 *   export const GET = requireApiKey(async (ctx, req) => { ... });
 *
 * Callers must send:
 *   Authorization: Bearer rfdrs_<32hexchars>
 *
 * Validation flow:
 *   1. Extract Bearer token from Authorization header
 *   2. SHA-256 the token → exact lookup in api_keys.key_hash
 *   3. Verify key is active and not revoked
 *   4. Fire-and-forget update of last_used_at
 *   5. Inject ApiKeyContext into handler
 *
 * Returns 401 if key is missing, unknown, revoked, or inactive.
 */
export function requireApiKey(handler: ApiKeyHandler) {
  return async (req: Request): Promise<NextResponse> => {
    // ── 1. Extract Bearer token ─────────────────────────────────
    const authHeader = req.headers.get("authorization") ?? "";
    const key = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;

    if (!key) {
      return NextResponse.json(
        { error: "Unauthorized", detail: "Authorization: Bearer <api_key> required" },
        { status: 401 }
      );
    }

    // ── 2. Lookup by SHA-256 hash ───────────────────────────────
    const hash = sha256hex(key);

    const [row] = await db
      .select({
        keyId:     apiKeys.keyId,
        licenseNo: apiKeys.licenseNo,
        name:      apiKeys.name,
        isActive:  apiKeys.isActive,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.isActive, true), isNull(apiKeys.revokedAt)))
      .limit(1);

    if (!row) {
      return NextResponse.json(
        { error: "Unauthorized", detail: "Invalid or revoked API key" },
        { status: 401 }
      );
    }

    // ── 3. Touch last_used_at (fire and forget) ─────────────────
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.keyId, row.keyId))
      .catch(() => {/* non-fatal */});

    const ctx: ApiKeyContext = {
      apiKeyId:  row.keyId,
      licenseNo: row.licenseNo,
      keyName:   row.name,
    };

    return handler(ctx, req);
  };
}
