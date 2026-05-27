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
 * Validates a DGA personal_token by calling DGA's /connect/userinfo endpoint.
 *
 * DGA personal_tokens are short-lived (30 min) Bearer tokens issued as part
 * of the OIDC flow when the `personal_token` scope is requested. Sending the
 * token to userinfo acts as both validation and user-identity resolution:
 * — if DGA returns 200 with claims → token is live, user is identified
 * — if DGA returns 401/403        → token is expired or invalid
 *
 * This makes every API call traceable: token → DGA Digital ID → real person.
 *
 * @param token  The raw personal_token value from the Authorization header
 * @returns      Parsed identity claims, or null if the token is invalid
 */
export async function validatePersonalToken(
  token: string
): Promise<PersonalTokenClaims | null> {
  try {
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

    const claims = await res.json() as Record<string, unknown>;

    if (!claims.sub) return null;

    return {
      sub:               claims.sub as string,
      dgaUserId:         (claims.user_id as string) ?? undefined,
      preferredUsername: (claims.preferred_username as string) ?? undefined,
      name:              (claims.name as string) ?? undefined,
      email:             (claims.email as string) ?? undefined,
      ialLevel:          claims.ial_level != null ? Number(claims.ial_level) : undefined,
    };
  } catch {
    // Network error, timeout, or parse failure — treat as invalid
    return null;
  }
}
