-- Additive Discord-first community profile fields. Existing accounts remain
-- valid and can complete the profile later.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "preferred_language" TEXT,
  ADD COLUMN IF NOT EXISTS "country_region" TEXT,
  ADD COLUMN IF NOT EXISTS "nationality" TEXT,
  ADD COLUMN IF NOT EXISTS "nationality_visible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "timezone" TEXT,
  ADD COLUMN IF NOT EXISTS "language_onboarding_status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "language_onboarding_completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "language_onboarding_deferred_at" TIMESTAMP(3);
