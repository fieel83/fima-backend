import test from "node:test";
import assert from "node:assert/strict";
import { consumeOAuthState, pruneConsumedOAuthStates } from "../src/oauthStateReplay.js";

const now = 1790899200000;
const input = { provider: "discord", state: "signed-cookie-bound-state", expiresAt: now + 600000 };

function client(rows = new Map()) {
  return { setting: {
    async create({ data }) {
      if (rows.has(data.key)) throw Object.assign(new Error("unique"), { code: "P2002" });
      rows.set(data.key, structuredClone(data));
      return data;
    },
    async deleteMany(args) { return args; }
  } };
}

test("restart and replica clients reject a persisted state claim", async () => {
  const persistedRows = new Map();
  await consumeOAuthState(client(persistedRows), input, now);
  for (const instance of [client(persistedRows), client(persistedRows)]) {
    await assert.rejects(consumeOAuthState(instance, input, now + 1), { code: "duplicate_oauth_callback" });
  }
  assert.equal(persistedRows.size, 1);
  const [key, value] = [...persistedRows][0];
  assert.match(key, /^oauth_state_consumed:v1:discord:[a-f0-9]{64}$/);
  assert.deepEqual(value.value, { expiresAt: input.expiresAt, consumedAt: now });
  assert.ok(!JSON.stringify([...persistedRows]).includes(input.state));
});

test("concurrent callback replicas have exactly one successful claim", async () => {
  const rows = new Map();
  const outcomes = await Promise.allSettled(Array.from({ length: 12 }, () => consumeOAuthState(client(rows), input, now)));
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((item) => item.reason?.code === "duplicate_oauth_callback").length, 11);
});

test("database errors fail closed instead of using local replay state", async () => {
  const unavailable = { setting: { async create() { throw new Error("database credentials must not leak"); } } };
  await assert.rejects(consumeOAuthState(unavailable, input, now), { code: "oauth_state_store_unavailable", message: "oauth_state_store_unavailable" });
});

test("expired, missing and unbounded expiry cannot create replay records", async () => {
  const rows = new Map();
  for (const expiresAt of [now, now - 1, undefined, Infinity, now + 900001]) {
    await assert.rejects(consumeOAuthState(client(rows), { ...input, expiresAt }, now), { code: "expired_oauth_state" });
  }
  assert.equal(rows.size, 0);
});

test("maintenance touches only replay tombstones older than accepted TTL", async () => {
  const args = await pruneConsumedOAuthStates(client(), now);
  assert.deepEqual(args.where, {
    key: { startsWith: "oauth_state_consumed:v1:" },
    updatedAt: { lt: new Date(now - 86400000) }
  });
});
