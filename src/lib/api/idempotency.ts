import { eq, and, gte } from "drizzle-orm";
import { db } from "@/db";
import { idempotencyKeys } from "@/db/schema";
import { NextResponse } from "next/server";

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Wraps a v1 API handler with idempotency-key support.
 *
 * If `idemKey` is non-null and a matching cached response exists (same key,
 * same endpoint, same API key, created within 24 h), the cached response is
 * returned immediately with an `Idempotent-Replayed: true` header.
 *
 * Otherwise the handler runs, and its response (status + JSON body) is stored
 * for future replay.
 *
 * Uniqueness constraint: (idem_key, endpoint, api_key_id) — so the same
 * Idempotency-Key value can be safely reused across different endpoints.
 *
 * @param idemKey   Value of the Idempotency-Key request header (null = skip)
 * @param endpoint  Canonical endpoint string, e.g. "POST /api/v1/reports"
 * @param apiKeyId  ID of the calling API key (ties idempotency to the caller)
 * @param handler   The actual business logic to run on a cache miss
 */
export async function withIdempotency(
  idemKey: string | null,
  endpoint: string,
  apiKeyId: number,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  // No key → bypass idempotency entirely
  if (!idemKey) return handler();

  const cutoff = new Date(Date.now() - TTL_MS);

  // ── Check cache ─────────────────────────────────────────────────
  const [cached] = await db
    .select({
      responseStatus: idempotencyKeys.responseStatus,
      responseBody:   idempotencyKeys.responseBody,
    })
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.idemKey,   idemKey),
        eq(idempotencyKeys.endpoint,  endpoint),
        eq(idempotencyKeys.apiKeyId,  apiKeyId),
        gte(idempotencyKeys.createdAt, cutoff)
      )
    )
    .limit(1);

  if (cached) {
    return new NextResponse(cached.responseBody, {
      status: cached.responseStatus,
      headers: {
        "Content-Type":       "application/json",
        "Idempotent-Replayed": "true",
      },
    });
  }

  // ── Execute handler ─────────────────────────────────────────────
  const response = await handler();
  const body = await response.clone().text();

  // Store for replay (ignore conflict — concurrent duplicate request)
  await db
    .insert(idempotencyKeys)
    .values({
      idemKey,
      endpoint,
      apiKeyId,
      responseStatus: response.status,
      responseBody:   body,
    })
    .onConflictDoNothing();

  return response;
}
