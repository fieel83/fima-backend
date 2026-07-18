-- FIMA community activity seasons, abuse-resistant event records, and
-- idempotent FIMA Macro entitlement grants. Runtime code only permits writes
-- for the owner-designated Discord test guild.
CREATE TABLE "community_activity_seasons" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "finalized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "community_activity_seasons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_activity_members" (
    "id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "discord_user_id" TEXT NOT NULL,
    "text_xp" INTEGER NOT NULL DEFAULT 0,
    "text_messages" INTEGER NOT NULL DEFAULT 0,
    "voice_xp" INTEGER NOT NULL DEFAULT 0,
    "voice_seconds" INTEGER NOT NULL DEFAULT 0,
    "voice_remainder_seconds" INTEGER NOT NULL DEFAULT 0,
    "last_text_at" TIMESTAMP(3),
    "last_voice_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "community_activity_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_text_activity" (
    "id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "discord_user_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "xp" INTEGER NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "community_text_activity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_voice_sessions" (
    "id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "discord_user_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL,
    "last_accrued_at" TIMESTAMP(3) NOT NULL,
    "left_at" TIMESTAMP(3),
    "accrued_seconds" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "community_voice_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "community_activity_rewards" (
    "id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "member_id" TEXT,
    "guild_id" TEXT NOT NULL,
    "discord_user_id" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "user_id" TEXT,
    "license_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "community_activity_rewards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "macro_entitlement_grants" (
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
    CONSTRAINT "macro_entitlement_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "community_activity_seasons_guild_id_starts_at_key" ON "community_activity_seasons"("guild_id", "starts_at");
CREATE INDEX "community_activity_seasons_guild_id_status_idx" ON "community_activity_seasons"("guild_id", "status");
CREATE INDEX "community_activity_seasons_ends_at_status_idx" ON "community_activity_seasons"("ends_at", "status");
CREATE UNIQUE INDEX "community_activity_members_season_id_discord_user_id_key" ON "community_activity_members"("season_id", "discord_user_id");
CREATE INDEX "community_activity_members_guild_id_text_xp_idx" ON "community_activity_members"("guild_id", "text_xp");
CREATE INDEX "community_activity_members_guild_id_voice_xp_idx" ON "community_activity_members"("guild_id", "voice_xp");
CREATE INDEX "community_activity_members_discord_user_id_idx" ON "community_activity_members"("discord_user_id");
CREATE UNIQUE INDEX "community_text_activity_message_id_key" ON "community_text_activity"("message_id");
CREATE INDEX "community_text_activity_season_id_discord_user_id_accepted_at_idx" ON "community_text_activity"("season_id", "discord_user_id", "accepted_at");
CREATE INDEX "community_text_activity_season_id_discord_user_id_content_hash_accepted_at_idx" ON "community_text_activity"("season_id", "discord_user_id", "content_hash", "accepted_at");
CREATE INDEX "community_voice_sessions_guild_id_active_idx" ON "community_voice_sessions"("guild_id", "active");
CREATE INDEX "community_voice_sessions_season_id_discord_user_id_active_idx" ON "community_voice_sessions"("season_id", "discord_user_id", "active");
CREATE INDEX "community_voice_sessions_channel_id_active_idx" ON "community_voice_sessions"("channel_id", "active");
CREATE UNIQUE INDEX "community_activity_rewards_idempotency_key_key" ON "community_activity_rewards"("idempotency_key");
CREATE UNIQUE INDEX "community_activity_rewards_season_id_board_rank_key" ON "community_activity_rewards"("season_id", "board", "rank");
CREATE INDEX "community_activity_rewards_discord_user_id_status_idx" ON "community_activity_rewards"("discord_user_id", "status");
CREATE INDEX "community_activity_rewards_season_id_board_idx" ON "community_activity_rewards"("season_id", "board");
CREATE UNIQUE INDEX "macro_entitlement_grants_reward_id_key" ON "macro_entitlement_grants"("reward_id");
CREATE UNIQUE INDEX "macro_entitlement_grants_idempotency_key_key" ON "macro_entitlement_grants"("idempotency_key");
CREATE INDEX "macro_entitlement_grants_user_id_created_at_idx" ON "macro_entitlement_grants"("user_id", "created_at");
CREATE INDEX "macro_entitlement_grants_license_id_idx" ON "macro_entitlement_grants"("license_id");

ALTER TABLE "community_activity_members" ADD CONSTRAINT "community_activity_members_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "community_activity_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_text_activity" ADD CONSTRAINT "community_text_activity_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "community_activity_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_text_activity" ADD CONSTRAINT "community_text_activity_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "community_activity_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_voice_sessions" ADD CONSTRAINT "community_voice_sessions_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "community_activity_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_voice_sessions" ADD CONSTRAINT "community_voice_sessions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "community_activity_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_activity_rewards" ADD CONSTRAINT "community_activity_rewards_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "community_activity_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_activity_rewards" ADD CONSTRAINT "community_activity_rewards_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "community_activity_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "macro_entitlement_grants" ADD CONSTRAINT "macro_entitlement_grants_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "community_activity_rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
