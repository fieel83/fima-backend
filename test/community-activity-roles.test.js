import test from "node:test";
import assert from "node:assert/strict";
import { communityActivityRoleTargets, reconcileCommunityActivityRoles } from "../src/communityActivityRoles.js";

test("recognition uses exact website ranks and lifetime XP with one highest level", () => {
  const targets = communityActivityRoleTargets({ text: { entries: [
    { rank: 1, discordUserId: "a", xp: 100 }, { rank: 2, discordUserId: "b", xp: 100 },
    { rank: 3, discordUserId: "c", xp: 90 }
  ] }, voice: { entries: [{ rank: 1, discordUserId: "b", xp: 30 }] } }, [
    { discordUserId: "a", _sum: { textXp: 3000, voiceXp: 2000 } },
    { discordUserId: "c", _sum: { textXp: 1249, voiceXp: null } }
  ]);
  assert.deepEqual([...targets.get("Text Top 1")], ["a"]);
  assert.deepEqual([...targets.get("Text Top 2")], ["b"]);
  assert.deepEqual([...targets.get("Voice Top 1")], ["b"]);
  assert.equal(targets.get("Voice Top 3").size, 0);
  assert.deepEqual([...targets.get("Level 10")], ["a"]);
  assert.equal(targets.get("Level 5").size, 0);
});

function fixture(permission = 0n) {
  const role = { id: "r", name: "Text Top 1", managed: false, permissions: { bitfield: permission }, position: 2, hoist: true };
  const mutations = [];
  const member = (id, has) => ({ id, user: { bot: false }, roles: { cache: new Map(has ? [["r", role]] : []),
    add: async () => mutations.push(`add:${id}`), remove: async () => mutations.push(`remove:${id}`) } });
  const members = new Map([["old", member("old", true)], ["new", member("new", false)]]);
  const guild = { roles: { cache: new Map([["r", role]]), fetch: async () => {} }, members: {
    me: { permissions: { has: () => true }, roles: { highest: { position: 10 } } }, fetch: async () => members
  } };
  return { guild, mutations };
}

test("reconciliation replaces stale winner using fetched member inventory", async () => {
  const { guild, mutations } = fixture();
  assert.deepEqual(await reconcileCommunityActivityRoles(guild, new Map([["Text Top 1", new Set(["new"])]])), { roles: 1, added: 1, removed: 1 });
  assert.deepEqual(mutations, ["remove:old", "add:new"]);
});

test("a privileged existing role is never self-assigned as recognition", async () => {
  const { guild, mutations } = fixture(8n);
  await assert.rejects(reconcileCommunityActivityRoles(guild, new Map([["Text Top 1", new Set(["new"])]])), /unsafe_existing_role/);
  assert.deepEqual(mutations, []);
});
