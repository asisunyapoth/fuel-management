import { createRemoteJWKSet, jwtVerify } from "jose";
import { dgaBaseUrl } from "@/auth";

/**
 * DGA personal_token validation result.
 * Returned when a token is valid; null means invalid or expired.
 */
export type PersonalTokenClaims = {
  /** OIDC subject — DGA Digital ID unique user identifier */
  sub: string;
  /** DGA's own user ID (from user_id scope, may differ from sub) */
  dgaUserId?: string;
  /** Preferred username */
  preferredUsername?: string;
  /** Full name from DGA claims */
  name?: string;
  /** Email */
  email?: string;
  /** Identity Assurance Level */
  ialLevel?: number;
};

/**
 * Remote JWKS keyset for DGA — created once at module level so jose can
 * cache the fetched keys across requests within the same execution context.
 * JWKS URI is from DGA's OpenID discovery document:
 *   https://connect.dga.or.th/.well-known/openid-configuration
 *   → jwks_uri: https://connect.dga.or.th/.well-known/openid-configuration/jwks
 */
const getDgaJwks = () =>
  createRemoteJWKSet(
    new URL(`${dgaBaseUrl}/.well-known/openid-configuration/jwks`)
  );

// Singleton — lazy-initialised the first time validatePersonalToken is called
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function jwks() {
  if (!_jwks) _jwks = getDgaJwks();
  return _jwks;
}

/**
 * Validates a DGA personal_token by:
 *   (a) **JWT path** — if the token has three base64url segments ("ey…") it is
 *       verified locally against DGA's JWKS (RS256). No outbound call needed;
 *       signature + exp + iss are checked by `jose`.
 *   (b) **Opaque path** — any other format is sent to DGA's /connect/userinfo
 *       endpoint as a Bearer token. A 200 response proves the token is live.
 *
 * DGA started issuing personal_tokens as RS256 JWTs. The opaque path remains
 * as a fallback for legacy or transitional tokens.
 *
 * @param token  Raw personal_token value from the Authorization header
 * @returns      Parsed identity claims, or null if the token is invalid
 */
export async function validatePersonalToken(
  token: string
): Promise<PersonalTokenClaims | null> {
  try {
    const isJwt =
      token.startsWith("ey") && token.split(".").length === 3;

    if (isJwt) {
      return await validateJwt(token);
    }

    return await validateViaUserinfo(token);
  } catch {
    return null;
  }
}

/* ── JWT path ───────────────────────────────────────────────────────────── */

async function validateJwt(token: string): Promise<PersonalTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, jwks(), {
      issuer: dgaBaseUrl,
      // Note: we do not assert audience here because personal_token may target
      // a different resource server than the web app's client ID.
      // The signature + iss + exp check is sufficient for identity proof.
    });

    if (!payload.sub) return null;

    return mapClaims(payload as Record<string, unknown>);
  } catch {
    // Signature invalid, expired, wrong issuer, etc.
    return null;
  }
}

/* ── Opaque path (userinfo round-trip) ─────────────────────────────────── */

async function validateViaUserinfo(token: string): Promise<PersonalTokenClaims | null> {
  const res = await fetch(`${dgaBaseUrl}/connect/userinfo`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    // Abort if DGA takes longer than 5 s — fail closed
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) return null;

  const claims = (await res.json()) as Record<string, unknown>;
  if (!claims.sub) return null;

  return mapClaims(claims);
}

/* ── Shared claim mapper ────────────────────────────────────────────────── */

function mapClaims(c: Record<string, unknown>): PersonalTokenClaims {
  return {
    sub:               c.sub as string,
    dgaUserId:         (c.user_id as string)             ?? undefined,
    preferredUsername: (c.preferred_username as string)  ?? undefined,
    name:              (c.name as string)                ?? undefined,
    email:             (c.email as string)               ?? undefined,
    ialLevel:          c.ial_level != null ? Number(c.ial_level) : undefined,
  };
}
