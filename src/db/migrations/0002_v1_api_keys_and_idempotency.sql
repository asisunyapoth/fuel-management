-- Migration: v1 REST API — API key store + idempotency key store
-- Apply with: psql $DATABASE_URL -f src/db/migrations/0002_v1_api_keys_and_idempotency.sql

-- ── api_keys ───────────────────────────────────────────────────────────────
-- Stores SHA-256 hashed API keys for programmatic (v1 REST API) access.
-- Keys are scoped to a dealer_license (brand HQ) or unscoped (admin).
CREATE TABLE IF NOT EXISTS "api_keys" (
  "key_id"      serial          PRIMARY KEY,
  "name"        varchar(200)    NOT NULL,
  "key_hash"    text            NOT NULL UNIQUE,       -- SHA-256(raw_key) hex
  "key_prefix"  varchar(16)     NOT NULL,              -- first 12 chars for display
  "license_no"  varchar(30)     REFERENCES "dealer_licenses"("license_no"),
  "created_by"  text            NOT NULL REFERENCES "auth_users"("id"),
  "created_at"  timestamptz     NOT NULL DEFAULT now(),
  "last_used_at" timestamptz,
  "revoked_at"  timestamptz,
  "is_active"   boolean         NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS "api_keys_hash_idx"      ON "api_keys"("key_hash");
CREATE INDEX IF NOT EXISTS "api_keys_license_idx"   ON "api_keys"("license_no") WHERE "license_no" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "api_keys_active_idx"    ON "api_keys"("is_active") WHERE "is_active" = true;

-- ── idempotency_keys ───────────────────────────────────────────────────────
-- Caches responses for POST/PUT requests that include an Idempotency-Key header.
-- Rows older than 24 hours are stale (query filters by age).
-- A nightly cron should run:
--   DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '24 hours';
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "id"              serial          PRIMARY KEY,
  "idem_key"        text            NOT NULL,
  "endpoint"        varchar(200)    NOT NULL,
  "api_key_id"      integer         NOT NULL REFERENCES "api_keys"("key_id"),
  "response_status" integer         NOT NULL,
  "response_body"   text            NOT NULL,
  "created_at"      timestamptz     NOT NULL DEFAULT now(),
  UNIQUE ("idem_key", "endpoint", "api_key_id")
);

CREATE INDEX IF NOT EXISTS "idempotency_keys_created_idx" ON "idempotency_keys"("created_at");
