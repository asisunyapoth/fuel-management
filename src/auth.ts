import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import {
  authUsers,
  authAccounts,
  authSessions,
  authVerificationTokens,
  userRoles,
  userProfiles,
  userPersonalTokens,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashConsumerSecret } from "@/lib/auth/hashSecret";

export const dgaBaseUrl =
  process.env.DGA_ENVIRONMENT === "production"
    ? "https://connect.egov.go.th"
    : "https://connect.dga.or.th";

// Pre-hash the consumer secret once at module load — never re-hash per request
const hashedSecret = hashConsumerSecret(process.env.DGA_CLIENT_SECRET!);

export const { handlers, auth, signIn, signOut } = NextAuth({
  // ── Drizzle adapter: use our prefixed table names ──────────────────────
  adapter: DrizzleAdapter(db, {
    usersTable: authUsers,
    accountsTable: authAccounts,
    sessionsTable: authSessions,
    verificationTokensTable: authVerificationTokens,
  }),

  // ── Session: DB-backed (revocable, auditable) ──────────────────────────
  session: { strategy: "database" },

  // ── DGA Digital ID OIDC provider ──────────────────────────────────────
  providers: [
    {
      id: "dga-digital-id",
      name: "DGA Digital ID (ทางรัฐ)",
      type: "oidc",
      issuer: dgaBaseUrl,
      clientId: process.env.DGA_CLIENT_ID!,
      /**
       * DGA requires the consumer secret to be MD5-hashed 7 times with salt "EGA"
       * before use in the Authorization: Basic header.
       * Auth.js constructs: Basic base64(clientId:clientSecret)
       * By passing the pre-hashed value here, the header is correct automatically.
       */
      clientSecret: hashedSecret,
      authorization: {
        url: `${dgaBaseUrl}/connect/authorize`,
        params: {
          scope:
            "openid profile given_name family_name email phone_number " +
            "user_id citizen_id citizen_id_verified ial_level " +
            "preferred_username personal_token",
          response_type: "code",
        },
      },
      token: `${dgaBaseUrl}/connect/token`,
      userinfo: `${dgaBaseUrl}/connect/userinfo`,
      checks: ["state", "nonce"],
      profile(profile) {
        const name =
          [profile.given_name, profile.family_name].filter(Boolean).join(" ") ||
          (profile.preferred_username as string | undefined) ||
          (profile.sub as string);
        return {
          id: profile.sub as string,
          name,
          email: (profile.email as string | undefined) ?? null,
          image: null,
        };
      },
    },
  ],

  // ── Pages ──────────────────────────────────────────────────────────────
  pages: {
    signIn: "/sign-in",
    error:  "/sign-in",
  },

  // ── Callbacks ─────────────────────────────────────────────────────────
  callbacks: {
    session({ session, user }) {
      // Attach internal user ID to the session for use in API routes
      session.user.id = user.id;
      return session;
    },
  },

  // ── Events: upsert full DGA profile + personal_token on every sign-in ─
  events: {
    async signIn({ user, account, profile }) {
      if (!user.id || !profile) return;

      const p = profile as Record<string, unknown>;

      // ── Fallback: fetch userinfo directly if OIDC flow didn't return profile ──
      // This happens when the scope was limited (e.g. "openid profile email")
      // or when DGA didn't include all claims in the initial id_token / userinfo
      // response. Re-calling userinfo with the access_token returns any claims
      // DGA is willing to provide for the granted scopes.
      const missingProfile =
        !p.given_name && !p.family_name && !p.preferred_username && !p.email;

      if (missingProfile && account?.access_token) {
        try {
          const res = await fetch(`${dgaBaseUrl}/connect/userinfo`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${account.access_token}`,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const fresh = (await res.json()) as Record<string, unknown>;
            // Merge fresh claims into p — only fill gaps, don't overwrite existing data
            for (const [k, v] of Object.entries(fresh)) {
              if (p[k] == null && v != null) p[k] = v;
            }
          }
        } catch {
          // Non-fatal: proceed with whatever we have
        }
      }

      // ── 1. Upsert full profile from DGA userinfo claims ────────────────
      await db
        .insert(userProfiles)
        .values({
          userId:             user.id,
          givenName:          (p.given_name as string) ?? null,
          familyName:         (p.family_name as string) ?? null,
          preferredUsername:  (p.preferred_username as string) ?? null,
          email:              (p.email as string) ?? null,
          phoneNumber:        (p.phone_number as string) ?? null,
          dgaUserId:          (p.user_id as string) ?? null,
          // citizen_id stored as-is for now — AES-256 encryption added in M3
          citizenIdEncrypted: (p.citizen_id as string) ?? null,
          citizenIdVerified:  p.citizen_id_verified != null
                                ? Boolean(p.citizen_id_verified)
                                : null,
          ialLevel:           p.ial_level != null ? Number(p.ial_level) : null,
          lastSeenAt:         new Date(),
        })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            givenName:          (p.given_name as string) ?? null,
            familyName:         (p.family_name as string) ?? null,
            preferredUsername:  (p.preferred_username as string) ?? null,
            email:              (p.email as string) ?? null,
            phoneNumber:        (p.phone_number as string) ?? null,
            dgaUserId:          (p.user_id as string) ?? null,
            citizenIdEncrypted: (p.citizen_id as string) ?? null,
            citizenIdVerified:  p.citizen_id_verified != null
                                  ? Boolean(p.citizen_id_verified)
                                  : null,
            ialLevel:           p.ial_level != null ? Number(p.ial_level) : null,
            lastSeenAt:         new Date(),
          },
        });

      // ── 2. Upsert personal_token ───────────────────────────────────────
      // TTL: read exp from JWT payload if token is a JWT, else assume 30 min.
      const personalToken = p.personal_token as string | undefined;
      if (personalToken) {
        let expiresAt: Date;
        try {
          const isJwt =
            personalToken.startsWith("ey") && personalToken.split(".").length === 3;
          if (isJwt) {
            // Decode payload without verifying (signature already verified by DGA's flow)
            const payload = JSON.parse(
              Buffer.from(personalToken.split(".")[1], "base64url").toString("utf8")
            );
            expiresAt = payload.exp
              ? new Date(payload.exp * 1000)
              : new Date(Date.now() + 30 * 60 * 1000);
          } else {
            expiresAt = new Date(Date.now() + 30 * 60 * 1000);
          }
        } catch {
          expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        }

        await db
          .insert(userPersonalTokens)
          .values({ userId: user.id, token: personalToken, expiresAt })
          .onConflictDoUpdate({
            target: userPersonalTokens.userId,
            set: { token: personalToken, expiresAt, updatedAt: new Date() },
          });
      }
    },
  },
});

// ── Helper: load roles from DB for a given user ID ────────────────────────
export async function getUserRoles(userId: string): Promise<string[]> {
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role);
}
