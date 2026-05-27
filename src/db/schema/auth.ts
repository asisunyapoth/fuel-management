/**
 * Auth.js (next-auth v5) tables for @auth/drizzle-adapter.
 *
 * Drizzle FIELD NAMES must match the adapter's expectations exactly.
 * DB column names (the string argument) are prefixed "auth_" to avoid conflicts.
 *
 * Also includes app-specific tables replacing Clerk publicMetadata:
 *   - user_roles          → replaces publicMetadata.roles
 *   - user_profiles       → DGA identity claim cache (all OIDC scopes)
 *   - user_personal_tokens → DGA personal_token (30-min TTL, for API auth)
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
  serial,
  varchar,
  real,
  boolean,
  unique,
} from "drizzle-orm/pg-core";

// ── Auth.js adapter tables ──────────────────────────────────────────────────

export const authUsers = pgTable("auth_users", {
  id:            text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name:          text("name"),
  email:         text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image:         text("image"),
});

export const authAccounts = pgTable(
  "auth_accounts",
  {
    userId:            text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    type:              text("type").notNull(),
    provider:          text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token:     text("refresh_token"),
    access_token:      text("access_token"),
    expires_at:        integer("expires_at"),
    token_type:        text("token_type"),
    scope:             text("scope"),
    id_token:          text("id_token"),
    session_state:     text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]
);

export const authSessions = pgTable("auth_sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId:       text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  expires:      timestamp("expires", { mode: "date" }).notNull(),
});

export const authVerificationTokens = pgTable(
  "auth_verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token:      text("token").notNull(),
    expires:    timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })]
);

// ── App-specific: roles ─────────────────────────────────────────────────────

/**
 * Replaces Clerk publicMetadata.roles.
 * Valid role values: "system_admin" | "pac_officer" | "doeb_admin"
 * A user can hold multiple roles.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    id:        serial("id").primaryKey(),
    userId:    text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    role:      varchar("role", { length: 30 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.role)]
);

// ── App-specific: DGA identity profile cache ────────────────────────────────

/**
 * Full DGA OIDC claim cache — upserted on every sign-in.
 *
 * Scope → claim mapping:
 *   profile           → preferred_username
 *   given_name        → given_name
 *   family_name       → family_name
 *   email             → email
 *   phone_number      → phone_number
 *   user_id           → user_id  (DGA's own user ID, distinct from OIDC sub)
 *   citizen_id        → citizen_id  (stored encrypted — PDPA)
 *   citizen_id_verified → citizen_id_verified
 *   ial_level         → ial_level
 *
 * citizen_id_encrypted: AES-256 encrypted Thai National ID (encryption added in M3).
 */
export const userProfiles = pgTable("user_profiles", {
  userId:              text("user_id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  // Name claims
  givenName:           varchar("given_name", { length: 100 }),
  familyName:          varchar("family_name", { length: 100 }),
  preferredUsername:   varchar("preferred_username", { length: 255 }),
  // Contact claims
  email:               varchar("email", { length: 255 }),
  phoneNumber:         varchar("phone_number", { length: 20 }),
  // DGA-specific identity claims
  dgaUserId:           varchar("dga_user_id", { length: 100 }),   // from user_id scope (≠ OIDC sub)
  citizenIdEncrypted:  text("citizen_id_encrypted"),              // citizen_id scope — AES-256 in M3
  citizenIdVerified:   boolean("citizen_id_verified"),            // citizen_id_verified scope
  ialLevel:            real("ial_level"),                         // ial_level scope
  // Housekeeping
  lastSeenAt:          timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── App-specific: DGA personal_token store ──────────────────────────────────

/**
 * DGA personal_token — short-lived (30 min), issued per sign-in.
 *
 * Used to authenticate direct API calls in a way that is:
 *   - Traceable: every call maps to a real DGA Digital ID user
 *   - Verifiable: validated against DGA's /connect/userinfo endpoint
 *   - Separable: future standalone API projects can accept this token
 *     without needing our session cookie infrastructure
 *
 * The token is validated server-side by calling DGA /connect/userinfo with
 * it as a Bearer token. A valid response proves the token is live and reveals
 * the user's DGA sub for traceability.
 */
export const userPersonalTokens = pgTable("user_personal_tokens", {
  userId:    text("user_id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  token:     text("token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
