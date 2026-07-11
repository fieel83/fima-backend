-- Additive Paradise multi-tenant foundation. This migration leaves the legacy
-- `paradise_3a59_state_v1` Setting envelope unchanged.
CREATE TABLE IF NOT EXISTS "paradise_guild_configs" (
  "guild_id" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "config" JSONB NOT NULL,
  "updated_by_user_id" TEXT,
  "source" TEXT NOT NULL DEFAULT 'unknown',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "paradise_guild_configs_pkey" PRIMARY KEY ("guild_id")
);

CREATE INDEX IF NOT EXISTS "paradise_guild_configs_updated_at_idx"
  ON "paradise_guild_configs"("updated_at");

CREATE TABLE IF NOT EXISTS "paradise_guild_records" (
  "id" TEXT NOT NULL,
  "guild_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "record_key" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "paradise_guild_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "paradise_guild_records_guild_id_kind_record_key_key"
  ON "paradise_guild_records"("guild_id", "kind", "record_key");
CREATE INDEX IF NOT EXISTS "paradise_guild_records_guild_id_kind_idx"
  ON "paradise_guild_records"("guild_id", "kind");
CREATE INDEX IF NOT EXISTS "paradise_guild_records_updated_at_idx"
  ON "paradise_guild_records"("updated_at");
