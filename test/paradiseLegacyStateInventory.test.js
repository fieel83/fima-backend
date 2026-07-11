import assert from "node:assert/strict";
import test from "node:test";
import { buildParadiseLegacyStateInventory } from "../src/paradiseLegacyStateInventory.js";

test("legacy Paradise state inventory records counts and target tables without copying private records", () => {
  const inventory = buildParadiseLegacyStateInventory({
    profiles: { "guild-a:user-a": { private: "not-exported" } },
    guildConfigs: { "guild-a": { language: "tr" } },
    supportTickets: { ticket1: { message: "not-exported" } }
  });
  assert.equal(inventory.totalBuckets > 20, true);
  assert.equal(inventory.totalRecords, 3);
  assert.equal(inventory.buckets.find(item => item.legacyBucket === "profiles").target, "guild_profiles/global_verified_identities");
  assert.equal(JSON.stringify(inventory).includes("not-exported"), false);
});
