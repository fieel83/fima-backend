ALTER TABLE "gift_codes"
ADD COLUMN IF NOT EXISTS "code_cipher" TEXT,
ADD COLUMN IF NOT EXISTS "buyer_user_id" TEXT,
ADD COLUMN IF NOT EXISTS "buyer_email" TEXT,
ADD COLUMN IF NOT EXISTS "buyer_discord_id" TEXT,
ADD COLUMN IF NOT EXISTS "buyer_roblox_id" TEXT,
ADD COLUMN IF NOT EXISTS "stripe_session_id" TEXT,
ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" TEXT,
ADD COLUMN IF NOT EXISTS "purchased_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "gift_codes_stripe_session_id_key" ON "gift_codes"("stripe_session_id");
CREATE INDEX IF NOT EXISTS "gift_codes_buyer_user_id_idx" ON "gift_codes"("buyer_user_id");
CREATE INDEX IF NOT EXISTS "gift_codes_buyer_email_idx" ON "gift_codes"("buyer_email");
