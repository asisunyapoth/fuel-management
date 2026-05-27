import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { dealerLicenses } from "./dealers";

/**
 * REST API keys for programmatic access (Brand HQ, external integrators).
 *
 * Key format: `rfdrs_<32 random hex chars>` (44 chars total)
 * Storage:    key_hash = SHA-256(key) — enables O(1) exact lookup without bcrypt
 * Display:    key_prefix shows first 12 chars in admin UI (e.g., "rfdrs_a1b2c3")
 *
 * licenseNo scope:
 *   null       → full admin key (can access any station)
 *   <license>  → scoped to stations under that dealer_license
 */
export const apiKeys = pgTable("api_keys", {
  keyId:     serial("key_id").primaryKey(),
  name:      varchar("name", { length: 200 }).notNull(),
  keyHash:   text("key_hash").notNull().unique(),        // SHA-256 hex of raw key
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(), // first 12 chars for display

  // Optional scope: if set, only stations with this dealer_license_no are accessible
  licenseNo: varchar("license_no", { length: 30 }).references(() => dealerLicenses.licenseNo),

  createdBy: text("created_by").notNull().references(() => authUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt:  timestamp("revoked_at",  { withTimezone: true }),
  isActive:   boolean("is_active").notNull().default(true),
});

/**
 * Idempotency key store for v1 API POST/PUT operations.
 *
 * Clients send `Idempotency-Key: <uuid>` header.
 * Replayed requests (same key + endpoint + api_key_id) within 24 h
 * receive the cached response without re-executing the handler.
 *
 * Cleanup: rows older than 24 h are effectively stale (query filters by age);
 * a nightly cron should `DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '24 hours'`.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id:             serial("id").primaryKey(),
    idemKey:        text("idem_key").notNull(),
    endpoint:       varchar("endpoint", { length: 200 }).notNull(), // e.g. "POST /api/v1/reports"
    apiKeyId:       integer("api_key_id").notNull().references(() => apiKeys.keyId),
    responseStatus: integer("response_status").notNull(),
    responseBody:   text("response_body").notNull(),
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.idemKey, t.endpoint, t.apiKeyId)]
);
