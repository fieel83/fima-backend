ALTER TABLE "email_verification_tokens"
  ADD COLUMN IF NOT EXISTS "email" TEXT;
