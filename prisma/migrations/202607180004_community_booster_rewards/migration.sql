-- Monthly Discord booster evidence and idempotent FIMA Macro entitlement grants.
-- This migration is intentionally separate from the unapplied activity migration.
CREATE TABLE "community_booster_states" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "discord_user_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "verified_boost_count" INTEGER NOT NULL DEFAULT 0,
    "count_provenance" TEXT NOT NULL,
    "premium_since" TIMESTAMP(3),
    "last_boost_event_at" TIMESTAMP(3),
    "last_observed_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_booster_states_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_booster_observations" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "discord_user_id" TEXT NOT NULL,
    "message_type" TEXT NOT NULL,
    "count_after" INTEGER NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_booster_observations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_booster_rewards" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "period_starts_at" TIMESTAMP(3) NOT NULL,
    "period_ends_at" TIMESTAMP(3) NOT NULL,
    "discord_user_id" TEXT NOT NULL,
    "boost_ordinal" INTEGER NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 3,
    "provenance" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "user_id" TEXT,
    "license_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_booster_rewards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "macro_booster_entitlement_grants" (
    "id" TEXT NOT NULL,
    "reward_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "license_id" TEXT,
    "days" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "previous_expires_at" TIMESTAMP(3),
    "resulting_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "macro_booster_entitlement_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "community_booster_states_guild_id_discord_user_id_key" ON "community_booster_states"("guild_id", "discord_user_id");
CREATE INDEX "community_booster_states_guild_id_active_idx" ON "community_booster_states"("guild_id", "active");
CREATE INDEX "community_booster_states_discord_user_id_idx" ON "community_booster_states"("discord_user_id");

CREATE UNIQUE INDEX "community_booster_observations_message_id_key" ON "community_booster_observations"("message_id");
CREATE INDEX "community_booster_observations_guild_id_discord_user_id_obs_idx" ON "community_booster_observations"("guild_id", "discord_user_id", "observed_at");

CREATE UNIQUE INDEX "community_booster_rewards_idempotency_key_key" ON "community_booster_rewards"("idempotency_key");
CREATE UNIQUE INDEX "community_booster_rewards_guild_id_period_starts_at_discord_key" ON "community_booster_rewards"("guild_id", "period_starts_at", "discord_user_id", "boost_ordinal");
CREATE INDEX "community_booster_rewards_guild_id_period_starts_at_status_idx" ON "community_booster_rewards"("guild_id", "period_starts_at", "status");
CREATE INDEX "community_booster_rewards_discord_user_id_status_idx" ON "community_booster_rewards"("discord_user_id", "status");

CREATE UNIQUE INDEX "macro_booster_entitlement_grants_reward_id_key" ON "macro_booster_entitlement_grants"("reward_id");
CREATE UNIQUE INDEX "macro_booster_entitlement_grants_idempotency_key_key" ON "macro_booster_entitlement_grants"("idempotency_key");
CREATE INDEX "macro_booster_entitlement_grants_user_id_created_at_idx" ON "macro_booster_entitlement_grants"("user_id", "created_at");
CREATE INDEX "macro_booster_entitlement_grants_license_id_idx" ON "macro_booster_entitlement_grants"("license_id");

ALTER TABLE "community_booster_observations" ADD CONSTRAINT "community_booster_observations_guild_id_discord_user_id_fkey"
FOREIGN KEY ("guild_id", "discord_user_id") REFERENCES "community_booster_states"("guild_id", "discord_user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "macro_booster_entitlement_grants" ADD CONSTRAINT "macro_booster_entitlement_grants_reward_id_fkey"
FOREIGN KEY ("reward_id") REFERENCES "community_booster_rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
