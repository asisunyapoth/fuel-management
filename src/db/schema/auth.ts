/**
 * Auth.js (next-auth v5) tables for @auth/drizzle-adapter.
 *
 * Drizzle FIELD NAMES must match the adapter's expectations exactly.
 * DB column names (the string argument) are prefixed "auth_" to avoid conflicts.
 *
 * Also includes app-specific tables replacing Clerk publicMetadata:
 *   - user_roles    → replaces publicMetadata.roles
 *   - user_profiles → DGA identity claim cache
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
    // Drizzle field names must match what the adapter accesses
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
 * Cached DGA claims, upserted on every sign-in.
 * citizen_id_encrypted: AES-256 encrypted Thai National ID (PDPA).
 * province_code: set when the user completes อบจ. officer onboarding.
 */
export const userProfiles = pgTable("user_profiles", {
  userId:             text("user_id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  givenName:          varchar("given_name", { length: 100 }),
  familyName:         varchar("family_name", { length: 100 }),
  email:              varchar("email", { length: 255 }),
  phoneNumber:        varchar("phone_number", { length: 20 }),
  citizenIdEncrypted: text("citizen_id_encrypted"),
  ialLevel:           real("ial_level"),
  provinceCode:       varchar("province_code", { length: 10 }),
  lastSeenAt:         timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});
