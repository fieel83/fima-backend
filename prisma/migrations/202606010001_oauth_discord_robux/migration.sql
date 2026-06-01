-- OAuth, Discord bot, and manual Robux payment support.
-- This migration only adds nullable columns and new tables. Existing sales/license data is preserved.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "discord_user_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "discord_username" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "discord_email" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "discord_avatar_url" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_discord_user_id_key" ON "users"("discord_user_id");
CREATE INDEX IF NOT EXISTS "users_discord_user_id_idx" ON "users"("discord_user_id");
CREATE INDEX IF NOT EXISTS "users_roblox_user_id_idx" ON "users"("roblox_user_id");

CREATE TABLE IF NOT EXISTS "oauth_links" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_subject" TEXT NOT NULL,
  "provider_username" TEXT,
  "provider_email" TEXT,
  "access_token_cipher" TEXT,
  "refresh_token_cipher" TEXT,
  "token_expires_at" TIMESTAMP(3),
  "scopes" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "oauth_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_links_provider_provider_subject_key" ON "oauth_links"("provider", "provider_subject");
CREATE INDEX IF NOT EXISTS "oauth_links_user_id_idx" ON "oauth_links"("user_id");
CREATE INDEX IF NOT EXISTS "oauth_links_provider_idx" ON "oauth_links"("provider");

ALTER TABLE "oauth_links"
  DROP CONSTRAINT IF EXISTS "oauth_links_user_id_fkey";
ALTER TABLE "oauth_links"
  ADD CONSTRAINT "oauth_links_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "payment_submissions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "type" TEXT NOT NULL DEFAULT 'robux_manual',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "plan" TEXT NOT NULL,
  "customer_email" TEXT,
  "discord_user_id" TEXT,
  "discord_username" TEXT,
  "roblox_user_id" TEXT,
  "roblox_username" TEXT,
  "premium_plus" BOOLEAN,
  "robux_amount" INTEGER,
  "proof_url" TEXT,
  "proof_text" TEXT,
  "notes" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payment_submissions_user_id_idx" ON "payment_submissions"("user_id");
CREATE INDEX IF NOT EXISTS "payment_submissions_status_idx" ON "payment_submissions"("status");
CREATE INDEX IF NOT EXISTS "payment_submissions_plan_idx" ON "payment_submissions"("plan");
CREATE INDEX IF NOT EXISTS "payment_submissions_discord_user_id_idx" ON "payment_submissions"("discord_user_id");
CREATE INDEX IF NOT EXISTS "payment_submissions_roblox_username_idx" ON "payment_submissions"("roblox_username");
CREATE INDEX IF NOT EXISTS "payment_submissions_created_at_idx" ON "payment_submissions"("created_at");

ALTER TABLE "payment_submissions"
  DROP CONSTRAINT IF EXISTS "payment_submissions_user_id_fkey";
ALTER TABLE "payment_submissions"
  ADD CONSTRAINT "payment_submissions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
