-- Migration: DGA full profile fields + personal_token store
-- Adds missing DGA OIDC claim columns to user_profiles and creates
-- the user_personal_tokens table for API authentication.

-- ── user_profiles: new DGA claim columns ──────────────────────────────────
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "preferred_username" varchar(255),
  ADD COLUMN IF NOT EXISTS "dga_user_id"        varchar(100),
  ADD COLUMN IF NOT EXISTS "citizen_id_verified" boolean;

-- ── user_personal_tokens: short-lived DGA personal_token store ─────────────
CREATE TABLE IF NOT EXISTS "user_personal_tokens" (
  "user_id"    text PRIMARY KEY NOT NULL
               REFERENCES "auth_users"("id") ON DELETE CASCADE,
  "token"      text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
