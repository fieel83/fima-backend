import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWebsiteApplicationScope,
  requireHelperWebsiteApplicationScope,
  verifyParadiseApplicationOAuthAccess
} from "../src/paradiseApplicationAccess.js";
import { buildParadisePrivateApplicationPreview } from "../src/paradise3a59.js";

const validLink = {
  providerSubject: "1234567890",
  scopes: "identify guilds",
  tokenExpiresAt: new Date(Date.now() + 60_000),
  accessTokenCipher: "synthetic-cipher"
};

function verify(overrides = {}) {
  return verifyParadiseApplicationOAuthAccess({
    link: validLink,
    requestedGuildId: "guild-a",
    decryptAccessToken: () => "synthetic-access-token",
    fetchGuildMemberships: async () => [{ id: "guild-a", name: "Synthetic Guild" }],
    ...overrides
  });
}

test("Helper website scope rejects non-Helper applications", () => {
  assert.deepEqual(requireHelperWebsiteApplicationScope({ workflow: "staff", type: "helper" }), {
    workflow: "staff", type: "helper"
  });
  assert.throws(() => requireHelperWebsiteApplicationScope({ workflow: "business", type: "helper" }), {
    code: "helper_application_scope_required", statusCode: 400
  });
  assert.throws(() => requireHelperWebsiteApplicationScope({ workflow: "staff", type: "moderator" }), {
    code: "helper_application_scope_required", statusCode: 400
  });
});

test("website application scope accepts bounded staff and business types and fails closed", () => {
  assert.deepEqual(normalizeWebsiteApplicationScope({ workflow: " STAFF ", type: " Helper " }), {
    workflow: "staff", type: "helper"
  });
  assert.deepEqual(normalizeWebsiteApplicationScope({ workflow: "business", type: "PARTNERSHIP" }), {
    workflow: "business", type: "partnership"
  });
  assert.deepEqual(normalizeWebsiteApplicationScope({ workflow: "business", type: "reseller" }), {
    workflow: "business", type: "reseller"
  });
  assert.deepEqual(normalizeWebsiteApplicationScope({ workflow: "business" }, { requireType: false }), {
    workflow: "business", type: null
  });

  for (const input of [
    { workflow: "unknown", type: "helper" },
    { workflow: "staff", type: "" },
    { workflow: "staff", type: "not-valid!" },
    { workflow: "staff", type: "synthetic_role" },
    { workflow: "staff", type: "partnership" },
    { workflow: "business", type: "helper" },
    { workflow: "business", type: `a${"b".repeat(48)}` }
  ]) {
    assert.throws(() => normalizeWebsiteApplicationScope(input), {
      statusCode: 400
    });
  }
});

test("website scope uses the full bounded application catalog instead of a Helper-only allowlist", () => {
  for (const type of [
    "helper", "staff", "moderator", "support", "training_hoster", "tryout_hoster",
    "referee", "event_staff", "giveaway_staff", "content_creator", "video_team",
    "developer", "clan_mainer", "fima_support", "macro_staff", "fflag_staff", "war_hoster"
  ]) {
    assert.deepEqual(normalizeWebsiteApplicationScope({ workflow: "staff", type }), {
      workflow: "staff",
      type
    });
  }
  for (const type of ["partnership", "creator", "reseller"]) {
    assert.deepEqual(normalizeWebsiteApplicationScope({ workflow: "business", type }), {
      workflow: "business",
      type
    });
  }
});

test("OAuth access fails closed for missing identity, scope, expiry and token", async () => {
  await assert.rejects(verify({ link: null }), { code: "discord_link_required", statusCode: 409 });
  await assert.rejects(verify({ link: { ...validLink, providerSubject: "" } }), { code: "discord_link_required", statusCode: 409 });
  await assert.rejects(verify({ link: { ...validLink, scopes: "identify" } }), { code: "discord_reauthorization_required", statusCode: 401 });
  await assert.rejects(verify({ link: { ...validLink, tokenExpiresAt: "invalid" } }), { code: "discord_reauthorization_required", statusCode: 401 });
  await assert.rejects(verify({ link: { ...validLink, tokenExpiresAt: new Date(Date.now() - 1) } }), { code: "discord_reauthorization_required", statusCode: 401 });
  await assert.rejects(verify({ decryptAccessToken: () => null }), { code: "discord_reauthorization_required", statusCode: 401 });
});

test("OAuth access distinguishes auth failure, outage and non-membership", async () => {
  await assert.rejects(verify({
    fetchGuildMemberships: async () => { throw Object.assign(new Error("synthetic"), { code: "discord_reauthorization_required" }); }
  }), { code: "discord_reauthorization_required", statusCode: 401 });
  await assert.rejects(verify({
    fetchGuildMemberships: async () => { throw new Error("synthetic outage"); }
  }), { code: "discord_membership_unavailable", statusCode: 503 });
  await assert.rejects(verify({ fetchGuildMemberships: async () => ({}) }), { code: "discord_membership_unavailable", statusCode: 503 });
  await assert.rejects(verify({ fetchGuildMemberships: async () => [{ id: "guild-b" }] }), { code: "discord_membership_required", statusCode: 403 });
  const access = await verify();
  assert.equal(access.discordUserId, validLink.providerSubject);
  assert.equal(access.guildIds.has("guild-a"), true);
});

test("private ticket preview masks answers and exposes accepted metadata only", () => {
  const preview = buildParadisePrivateApplicationPreview({
    id: "application-123",
    type: "helper",
    userId: "1234567890",
    answers: { Contact: "owner@example.test @everyone", Experience: "Synthetic answer" },
    evidence: [
      { status: "accepted", originalName: "proof.png", mimeType: "image/png", size: 42, storageName: "private-path-a" },
      { status: "quarantined", originalName: "unsafe.png", mimeType: "image/png", size: 99, storageName: "private-path-b" }
    ]
  });
  const serialized = JSON.stringify(preview);
  assert.match(serialized, /\[email\]/);
  assert.doesNotMatch(serialized, /owner@example\.test|@everyone|private-path|unsafe\.png/);
  assert.deepEqual(preview.attachments, [{ name: "proof.png", mimeType: "image/png", size: 42 }]);
  assert.match(preview.fields.at(-1).value, /Accepted after scan: \*\*1\*\*/);
  assert.match(preview.fields.at(-1).value, /Quarantined or awaiting scanner: \*\*1\*\*/);
});
