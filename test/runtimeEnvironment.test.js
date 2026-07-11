import assert from "node:assert/strict";
import test from "node:test";
import {
  PARADISE_TEST_GUILD_ID,
  assertParadiseGuildMutation,
  paradiseGuildMutationPolicy,
  paradiseTestGuildAllowlist,
  resolveRuntimeEnvironment
} from "../src/runtimeEnvironment.js";

test("missing or malformed runtime marker never defaults to production", () => {
  assert.deepEqual(resolveRuntimeEnvironment({}), {
    name: "development", source: "implicit-development", markerValid: false, production: false
  });
  assert.deepEqual(resolveRuntimeEnvironment({ PARADISE_RUNTIME_ENV: "unsafe" }), {
    name: "development", source: "PARADISE_RUNTIME_ENV", markerValid: false, production: false
  });
});

test("production permits read-only access but blocks non-test guild mutation", () => {
  const source = { PARADISE_RUNTIME_ENV: "production" };
  assert.equal(paradiseGuildMutationPolicy({ guildId: "main-guild", operation: "read_only", source }).allowed, true);
  const blocked = paradiseGuildMutationPolicy({ guildId: "main-guild", operation: "create_missing", source });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.code, "production_guild_mutation_blocked");
  assert.throws(() => assertParadiseGuildMutation({ guildId: "main-guild", operation: "create_missing", source }), { code: "production_guild_mutation_blocked" });
});

test("only the explicit test-guild allowlist can mutate in every environment", () => {
  const source = { PARADISE_RUNTIME_ENV: "production", PARADISE_TEST_GUILD_IDS: "extra-test-guild" };
  assert.deepEqual(paradiseTestGuildAllowlist(source), [PARADISE_TEST_GUILD_ID, "extra-test-guild"]);
  assert.equal(paradiseGuildMutationPolicy({ guildId: PARADISE_TEST_GUILD_ID, operation: "rebuild", source }).allowed, true);
  assert.equal(paradiseGuildMutationPolicy({ guildId: "extra-test-guild", operation: "repair", source }).allowed, true);
  assert.equal(paradiseGuildMutationPolicy({ guildId: "production-guild", operation: "repair", source }).allowed, false);
});
