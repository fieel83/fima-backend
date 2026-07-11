import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  assertParadiseGuildRecordScope,
  buildParadiseGuildConfigUpsert,
  buildParadiseGuildRecordUpsert
} from "../src/paradiseGuildStateRepository.js";

test("guild configuration upserts remain scoped and versioned", () => {
  const query = buildParadiseGuildConfigUpsert({ guildId: "guild-a", config: { language: "tr" }, actorId: "owner-a", source: "dashboard", revision: 3 });
  assert.equal(query.where.guildId, "guild-a");
  assert.equal(query.create.revision, 3);
  assert.equal(query.update.source, "dashboard");
  assert.throws(() => buildParadiseGuildConfigUpsert({ guildId: "", config: {} }), { code: "guild_id_required" });
});

test("guild record compound keys and reads reject cross-guild access", () => {
  const query = buildParadiseGuildRecordUpsert({ guildId: "guild-a", kind: "profile", recordKey: "user-a", payload: { verified: true } });
  assert.deepEqual(query.where.guildId_kind_recordKey, { guildId: "guild-a", kind: "profile", recordKey: "user-a" });
  assert.equal(assertParadiseGuildRecordScope({ guildId: "guild-a", payload: {} }, "guild-a").guildId, "guild-a");
  assert.throws(() => assertParadiseGuildRecordScope({ guildId: "guild-a" }, "guild-b"), { code: "cross_guild_record_access_denied" });
});

test("Milestone 1 guild-scope migration is additive and preserves the legacy state envelope", async () => {
  const migration = await fs.readFile(new URL("../prisma/migrations/202607110001_paradise_guild_scope_foundation/migration.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "paradise_guild_configs"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "paradise_guild_records"/);
  assert.doesNotMatch(migration, /\b(DROP|DELETE|TRUNCATE)\b/i);
  assert.doesNotMatch(migration, /ALTER TABLE "settings"/i);
});
