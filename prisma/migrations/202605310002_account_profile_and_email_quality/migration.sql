-- Adds account profile fields without touching existing orders, licenses, downloads or update files.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_normalized" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roblox_username" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roblox_user_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roblox_avatar_url" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP(3);

UPDATE "users"
SET "email_normalized" = LOWER(TRIM("email"))
WHERE "email_normalized" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_normalized_key" ON "users"("email_normalized");
