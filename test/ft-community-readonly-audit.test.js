import assert from "node:assert/strict";
import test from "node:test";
import {
  FT_COMMUNITY_TEST_GUILD_ID,
  buildFtCommunityReadonlyInventory,
  buildFtCommunityTestGuildRehearsal,
  containsFtCommunitySecretMaterial,
  createFtCommunityBackupManifest,
  validateFtCommunityBackupManifest
} from "../src/ftCommunityReadonlyAudit.js";

const syntheticSnapshot = () => ({
  guild: { id: "production-placeholder", name: "FT Community" },
  channels: [
    { id: "2", parentId: "1", name: "general", type: 0, position: 2, permissionOverwrites: [{ id: "r2", type: "role", deny: ["SendMessages"], allow: ["ViewChannel"] }] },
    { id: "1", name: "START", type: 4, position: 1 }
  ],
  roles: [{ id: "r2", name: "Helper", position: 2, permissions: ["ViewChannel"] }],
  embeds: [{ messageId: "m1", channelId: "2", embedCount: 1, hasTitle: true, hasDescription: true, fieldCount: 2, pinned: true, content: "must not survive" }],
  webhooks: [{ id: "w1", name: "FIMA News", channelId: "2", applicationId: "a1", token: "synthetic-secret", url: "https://discord.com/api/webhooks/redacted" }],
  pins: [{ messageId: "m1", channelId: "2", authorType: "bot", hasEmbeds: true, attachmentCount: 0, content: "private message" }],
  tickets: [{ id: "t1", channelId: "2", kind: "support", state: "open", ownerId: "member-1", transcript: "private transcript" }],
  thirdPartyBots: [{ id: "b1", username: "Utility Bot", applicationId: "a2", managedRoleIds: ["r2"], token: "nope" }]
});

test("read-only inventory is canonical, redacted and independent of source ordering", () => {
  const first = buildFtCommunityReadonlyInventory(syntheticSnapshot());
  const reordered = syntheticSnapshot();
  reordered.channels.reverse();
  const second = buildFtCommunityReadonlyInventory(reordered);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first).includes("synthetic-secret"), false);
  assert.equal(JSON.stringify(first).includes("must not survive"), false);
  assert.equal(JSON.stringify(first).includes("private transcript"), false);
  assert.equal(first.channels[1].permissionOverwrites[0].allow[0], "ViewChannel");
  assert.match(first.tickets[0].ownerIdHash, /^[a-f0-9]{64}$/);
});

test("backup manifest has stable canonical and component hashes", () => {
  const first = createFtCommunityBackupManifest(syntheticSnapshot(), "2026-07-29T00:00:00.000Z");
  const second = createFtCommunityBackupManifest(syntheticSnapshot(), "2026-07-30T00:00:00.000Z");
  assert.equal(first.integrity.canonicalPayloadSha256, second.integrity.canonicalPayloadSha256);
  assert.equal(first.readOnly, true);
  assert.equal(first.productionMutated, false);
  assert.deepEqual(validateFtCommunityBackupManifest(first), {
    valid: true, code: "backup_valid", digest: first.integrity.canonicalPayloadSha256
  });
  first.inventory.channels[0].name = "tampered";
  assert.equal(validateFtCommunityBackupManifest(first).code, "payload_hash_mismatch");
});

test("test-guild rehearsal is allowlisted, English-first and has a separate Turkish category", () => {
  const rehearsal = buildFtCommunityTestGuildRehearsal();
  assert.equal(rehearsal.status, "ready");
  assert.equal(rehearsal.targetGuildId, FT_COMMUNITY_TEST_GUILD_ID);
  assert.equal(rehearsal.productionMutationAllowed, false);
  assert.equal(rehearsal.structure.language, "en");
  assert.equal(rehearsal.structure.categories.filter((entry) => entry.key === "turkish").length, 1);
  assert.equal(rehearsal.applicationFixture.type, "multi_type");
  assert.deepEqual(rehearsal.applicationFixture.supportedTypes, [
    "helper", "staff", "moderator", "support", "training_hoster", "tryout_hoster",
    "referee", "event_staff", "giveaway_staff", "content_creator", "partnership",
    "clan_mainer", "fima_support", "macro_staff", "fflag_staff", "war_hoster",
    "creator", "reseller"
  ]);
  assert.deepEqual(rehearsal.applicationFixture.approvedRoleKeys, []);
  assert.equal(rehearsal.applicationFixture.roleGrantPolicy, "manual_staff_review_only");
  assert.equal(rehearsal.embedFixtures.some((entry) => entry.locale === "tr"), true);
  assert.equal(rehearsal.dashboardChecks.includes("no_webhook_url_exposure"), true);
});

test("rehearsal blocks every guild except the explicit disposable test guild", () => {
  const blocked = buildFtCommunityTestGuildRehearsal({ guildId: "production-placeholder" });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.code, "test_guild_not_allowlisted");
  assert.equal(blocked.productionMutationAllowed, false);
});

test("secret detector recognizes forbidden webhook and credential material", () => {
  assert.equal(containsFtCommunitySecretMaterial({ safe: "metadata only" }), false);
  assert.equal(containsFtCommunitySecretMaterial({ webhookUrl: "https://example.invalid" }), true);
  assert.equal(containsFtCommunitySecretMaterial({ value: "https://discord.com/api/webhooks/1/secret" }), true);
});
