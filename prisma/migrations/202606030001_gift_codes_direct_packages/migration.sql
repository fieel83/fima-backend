CREATE TABLE "gift_codes" (
    "id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "masked_code" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unused',
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "recipient_email" TEXT,
    "recipient_user_id" TEXT,
    "requires_discord" BOOLEAN NOT NULL DEFAULT true,
    "requires_roblox" BOOLEAN NOT NULL DEFAULT true,
    "created_by_admin_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gift_redemptions" (
    "id" TEXT NOT NULL,
    "gift_code_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "redeemed_email" TEXT NOT NULL,
    "discord_user_id" TEXT,
    "roblox_user_id" TEXT,
    "hwid" TEXT,
    "license_id" TEXT,
    "result" TEXT NOT NULL DEFAULT 'success',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "direct_gift_packages" (
    "id" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requires_discord" BOOLEAN NOT NULL DEFAULT true,
    "requires_roblox" BOOLEAN NOT NULL DEFAULT true,
    "sent_by_admin_id" TEXT,
    "message" TEXT,
    "notes" TEXT,
    "claim_expires_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "claimed_by_user_id" TEXT,
    "claimed_email" TEXT,
    "claimed_discord_id" TEXT,
    "claimed_roblox_id" TEXT,
    "claimed_hwid" TEXT,
    "license_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direct_gift_packages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gift_codes_code_hash_key" ON "gift_codes"("code_hash");
CREATE INDEX "gift_codes_plan_idx" ON "gift_codes"("plan");
CREATE INDEX "gift_codes_status_idx" ON "gift_codes"("status");
CREATE INDEX "gift_codes_expires_at_idx" ON "gift_codes"("expires_at");
CREATE INDEX "gift_codes_recipient_email_idx" ON "gift_codes"("recipient_email");
CREATE INDEX "gift_codes_recipient_user_id_idx" ON "gift_codes"("recipient_user_id");

CREATE INDEX "gift_redemptions_gift_code_id_idx" ON "gift_redemptions"("gift_code_id");
CREATE INDEX "gift_redemptions_user_id_idx" ON "gift_redemptions"("user_id");
CREATE INDEX "gift_redemptions_license_id_idx" ON "gift_redemptions"("license_id");
CREATE INDEX "gift_redemptions_result_idx" ON "gift_redemptions"("result");

CREATE INDEX "direct_gift_packages_recipient_email_idx" ON "direct_gift_packages"("recipient_email");
CREATE INDEX "direct_gift_packages_recipient_user_id_idx" ON "direct_gift_packages"("recipient_user_id");
CREATE INDEX "direct_gift_packages_status_idx" ON "direct_gift_packages"("status");
CREATE INDEX "direct_gift_packages_claim_expires_at_idx" ON "direct_gift_packages"("claim_expires_at");
CREATE INDEX "direct_gift_packages_license_id_idx" ON "direct_gift_packages"("license_id");

ALTER TABLE "gift_redemptions" ADD CONSTRAINT "gift_redemptions_gift_code_id_fkey" FOREIGN KEY ("gift_code_id") REFERENCES "gift_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gift_redemptions" ADD CONSTRAINT "gift_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gift_redemptions" ADD CONSTRAINT "gift_redemptions_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "direct_gift_packages" ADD CONSTRAINT "direct_gift_packages_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "direct_gift_packages" ADD CONSTRAINT "direct_gift_packages_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
