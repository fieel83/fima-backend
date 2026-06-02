CREATE TABLE "referral_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referral_code_id" TEXT NOT NULL,
    "referrer_user_id" TEXT NOT NULL,
    "referred_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "status_reason" TEXT,
    "verification" JSONB,
    "ip_hash" TEXT,
    "user_agent_hash" TEXT,
    "reward_granted" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "referral_rewards" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "license_id" TEXT,
    "reward_number" INTEGER NOT NULL,
    "valid_count_at_award" INTEGER NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 15,
    "status" TEXT NOT NULL DEFAULT 'granted',
    "referral_ids" JSONB,
    "granted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "referral_abuse_flags" (
    "id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_abuse_flags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referral_codes_user_id_key" ON "referral_codes"("user_id");
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");
CREATE INDEX "referral_codes_code_idx" ON "referral_codes"("code");

CREATE UNIQUE INDEX "referrals_referred_user_id_key" ON "referrals"("referred_user_id");
CREATE INDEX "referrals_referral_code_id_idx" ON "referrals"("referral_code_id");
CREATE INDEX "referrals_referrer_user_id_idx" ON "referrals"("referrer_user_id");
CREATE INDEX "referrals_status_idx" ON "referrals"("status");
CREATE INDEX "referrals_created_at_idx" ON "referrals"("created_at");

CREATE UNIQUE INDEX "referral_rewards_user_id_reward_number_key" ON "referral_rewards"("user_id", "reward_number");
CREATE INDEX "referral_rewards_user_id_idx" ON "referral_rewards"("user_id");
CREATE INDEX "referral_rewards_license_id_idx" ON "referral_rewards"("license_id");
CREATE INDEX "referral_rewards_status_idx" ON "referral_rewards"("status");

CREATE INDEX "referral_abuse_flags_referral_id_idx" ON "referral_abuse_flags"("referral_id");
CREATE INDEX "referral_abuse_flags_type_idx" ON "referral_abuse_flags"("type");
CREATE INDEX "referral_abuse_flags_status_idx" ON "referral_abuse_flags"("status");

ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referral_code_id_fkey" FOREIGN KEY ("referral_code_id") REFERENCES "referral_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_user_id_fkey" FOREIGN KEY ("referrer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "referral_abuse_flags" ADD CONSTRAINT "referral_abuse_flags_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
