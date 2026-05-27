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
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashConsumerSecret } from "@/lib/auth/hashSecret";

const dgaBaseUrl =
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
          scope: "openid profile email",
          response_type: "code",
        },
      },
      token: `${dgaBaseUrl}/connect/token`,
      userinfo: `${dgaBaseUrl}/connect/userinfo`,
      checks: ["state", "nonce"],
      profile(profile) {
        return {
          id: profile.sub,
          name: [profile.given_name, profile.family_name].filter(Boolean).join(" ") || profile.preferred_username || profile.sub,
          email: profile.email ?? null,
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

  // ── Events: upsert DGA profile claims on every sign-in ────────────────
  events: {
    async signIn({ user, account, profile }) {
      if (!user.id || !profile) return;

      // Upsert user profile from DGA claims
      await db
        .insert(userProfiles)
        .values({
          userId:      user.id,
          givenName:   (profile.given_name as string) ?? null,
          familyName:  (profile.family_name as string) ?? null,
          email:       (profile.email as string) ?? null,
          phoneNumber: (profile.phone_number as string) ?? null,
          // citizen_id stored encrypted — for now store raw (encryption to be added in M3)
          citizenIdEncrypted: (profile.citizen_id as string) ?? null,
          ialLevel:    profile.ial_level != null ? Number(profile.ial_level) : null,
          lastSeenAt:  new Date(),
        })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            givenName:   (profile.given_name as string) ?? null,
            familyName:  (profile.family_name as string) ?? null,
            email:       (profile.email as string) ?? null,
            phoneNumber: (profile.phone_number as string) ?? null,
            citizenIdEncrypted: (profile.citizen_id as string) ?? null,
            ialLevel:    profile.ial_level != null ? Number(profile.ial_level) : null,
            lastSeenAt:  new Date(),
          },
        });
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
