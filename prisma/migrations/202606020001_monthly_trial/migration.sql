ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_used_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_expires_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "next_trial_available_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_status" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "monthly_trial_claim_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "users_next_trial_available_at_idx" ON "users"("next_trial_available_at");
CREATE INDEX IF NOT EXISTS "users_trial_status_idx" ON "users"("trial_status");
