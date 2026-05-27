import { NextResponse } from "next/server";
import { secureRoute } from "@/lib/auth/secureRoute";
import { db } from "@/db";
import { userPersonalTokens } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/internal/auth/token
 *
 * Returns the current DGA personal_token for the authenticated user.
 * The browser calls this endpoint to obtain a token it can then include
 * as `Authorization: Bearer <token>` in direct API calls.
 *
 * Response:
 *   200 { token: string; expiresAt: string }  — valid token available
 *   404 { error: "no_token" }                 — user has no token (must re-sign-in)
 *   401                                        — not authenticated
 *
 * Security note: personal_tokens expire after 30 minutes. The client should
 * check expiresAt and re-authenticate (or call this endpoint again after
 * re-authentication) when the token has expired.
 */
export const GET = secureRoute(async (ctx) => {
  const [row] = await db
    .select({
      token:     userPersonalTokens.token,
      expiresAt: userPersonalTokens.expiresAt,
    })
    .from(userPersonalTokens)
    .where(eq(userPersonalTokens.userId, ctx.userId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "no_token" }, { status: 404 });
  }

  const now = new Date();
  const isExpired = row.expiresAt <= now;

  if (isExpired) {
    return NextResponse.json(
      { error: "token_expired", expiredAt: row.expiresAt },
      { status: 404 }
    );
  }

  return NextResponse.json({
    token:     row.token,
    expiresAt: row.expiresAt,
  });
});
