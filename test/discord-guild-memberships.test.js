import test from "node:test";
import assert from "node:assert/strict";
import { createDiscordGuildMembershipFetcher } from "../src/discordGuildMemberships.js";

const ok = guilds => ({ ok: true, json: async () => guilds });
test("concurrent checks share a request, subsequent checks fetch fresh permissions", async () => {
  let calls = 0, release;
  const fetchMemberships = createDiscordGuildMembershipFetcher({ fetch: async () => {
    calls++;
    if (calls === 1) await new Promise(resolve => { release = resolve; });
    return ok([{ id: "guild", permissions: String(calls) }, null]);
  } });
  const a = fetchMemberships("token"), b = fetchMemberships("token");
  assert.equal(calls, 1); release();
  assert.deepEqual(await a, await b);
  assert.equal((await fetchMemberships("token"))[0].permissions, "2");
});
test("Discord retry delay is honored once and shared across concurrent callers", async () => {
  let calls = 0; const delays = [];
  const fetchMemberships = createDiscordGuildMembershipFetcher({ sleep: async ms => { delays.push(ms); }, fetch: async () => {
    calls++;
    return calls === 1 ? { ok: false, status: 429, headers: { get: () => null }, json: async () => ({ retry_after: 0.5 }) } : ok([{ id: "guild" }]);
  } });
  await Promise.all([fetchMemberships("token"), fetchMemberships("token")]);
  assert.equal(calls, 2); assert.deepEqual(delays, [550]);
});
test("authorization failures are never retried or cached and tokens stay isolated", async () => {
  let calls = 0;
  const fetchMemberships = createDiscordGuildMembershipFetcher({ fetch: async () => { calls++; return { ok: false, status: 401 }; } });
  await assert.rejects(fetchMemberships("a"), { code: "discord_reauthorization_required" });
  await assert.rejects(fetchMemberships("a"), { code: "discord_reauthorization_required" });
  await assert.rejects(fetchMemberships("b"), { code: "discord_reauthorization_required" });
  assert.equal(calls, 3);
});
test("long rate limits fail closed without an unbounded wait", async () => {
  const fetchMemberships = createDiscordGuildMembershipFetcher({ sleep: async () => assert.fail("must not wait"), fetch: async () => ({ ok: false, status: 429, headers: { get: () => "30" }, json: async () => ({}) }) });
  await assert.rejects(fetchMemberships("token"), { code: "discord_guilds_unavailable" });
});
