import assert from "node:assert/strict";
import test from "node:test";
import {
  createFimaContentBackup,
  createFimaContentDraft,
  normalizeFimaContentPayload,
  planFimaContentPublish,
  previewFimaContent,
  saveFimaContentVersion,
  verifyFimaContentPublishReadback
} from "../src/fimaBotContentStudioPolicy.js";

const ACTOR_ID = "1520519015661961258";
const TEST_GUILD_ID = "1520519015661961257";
const PRODUCTION_GUILD_ID = "1419335632324657306";

function draft() {
  return createFimaContentDraft({
    documentId: "welcome-board",
    guildId: TEST_GUILD_ID,
    managedWebhookRef: "managed:welcome",
    payload: {
      content: "FT Community'ye hoş geldin.",
      embeds: [{ title: "Kurallar", image: { url: "https://cdn.fimamacro.com/ft/welcome.webp" } }]
    }
  });
}

test("preview is pure, read-only and suppresses all mentions", () => {
  const document = draft();
  const before = JSON.stringify(document);
  const preview = previewFimaContent(document, "mobile");
  assert.equal(JSON.stringify(document), before);
  assert.equal(preview.readOnly, true);
  assert.equal(preview.viewportWidth, 360);
  assert.deepEqual(preview.payload.allowedMentions, { parse: [], users: [], roles: [], repliedUser: false });
});

test("arbitrary webhook data, secret-shaped payloads, insecure URLs and untrusted media hosts are rejected", () => {
  for (const payload of [
    { webhookUrl: "redacted" },
    { metadata: { webhookToken: "redacted" } },
    { content: "Bearer redacted-value" },
    { content: "https://discord.com/api/webhooks/123/redacted" }
  ]) assert.throws(() => normalizeFimaContentPayload(payload));
  assert.throws(() => normalizeFimaContentPayload({ embeds: [{ image: { url: "http://cdn.fimamacro.com/a.png" } }] }), {
    code: "content_url_https_required"
  });
  assert.throws(() => normalizeFimaContentPayload({ embeds: [{ image: { url: "https://untrusted.example/a.png" } }] }), {
    code: "content_media_host_forbidden"
  });
});

test("overwrites require a matching version backup", () => {
  const firstDraft = draft();
  const first = saveFimaContentVersion(firstDraft, previewFimaContent(firstDraft), {
    actorId: ACTOR_ID,
    savedAt: "2026-08-11T12:00:00.000Z"
  });
  const edited = { ...first, stage: "draft", payload: { ...first.payload, content: "Güncel karşılama metni." } };
  const editedPreview = previewFimaContent(edited);
  assert.throws(() => saveFimaContentVersion(edited, editedPreview, {
    actorId: ACTOR_ID,
    overwriteConfirmed: true
  }), { code: "content_archive_backup_missing" });
  const backup = createFimaContentBackup(first);
  const second = saveFimaContentVersion(edited, editedPreview, {
    actorId: ACTOR_ID,
    savedAt: "2026-08-11T12:05:00.000Z",
    overwriteConfirmed: true,
    backup
  });
  assert.equal(second.versions.length, 2);
  assert.equal(second.versions.at(-1).previousBackupDigest, backup.digest);
});

test("guarded publishing requires version, exact backup, owner proof and the test guild", () => {
  const initial = draft();
  const saved = saveFimaContentVersion(initial, previewFimaContent(initial), {
    actorId: ACTOR_ID,
    savedAt: "2026-08-11T12:00:00.000Z"
  });
  const backup = createFimaContentBackup(saved);
  const options = {
    testGuildId: TEST_GUILD_ID,
    ownerActionVerified: true,
    confirmationPhrase: "PUBLISH TEST CONTENT",
    backup
  };
  assert.throws(() => planFimaContentPublish(saved, { ...options, targetGuildId: PRODUCTION_GUILD_ID }), {
    code: "test_guild_only"
  });
  const plan = planFimaContentPublish(saved, { ...options, targetGuildId: TEST_GUILD_ID });
  assert.equal(Object.hasOwn(plan, "payload"), false);
  assert.equal(Object.hasOwn(plan.audit, "payload"), false);
  assert.equal(JSON.stringify(plan).includes("FT Community"), false);
  assert.deepEqual(plan.allowedMentions.parse, []);
  assert.equal(verifyFimaContentPublishReadback(plan, {
    guildId: TEST_GUILD_ID,
    managedWebhookRef: "managed:welcome",
    contentDigest: plan.contentDigest
  }).verified, true);
  assert.throws(() => verifyFimaContentPublishReadback(plan, {
    guildId: TEST_GUILD_ID,
    managedWebhookRef: "managed:welcome",
    contentDigest: "wrong"
  }), { code: "content_publish_readback_mismatch" });
});

test("publishing rejects forged backup snapshots and cross-guild documents", () => {
  const initial = draft();
  const saved = saveFimaContentVersion(initial, previewFimaContent(initial), {
    actorId: ACTOR_ID,
    savedAt: "2026-08-11T12:00:00.000Z"
  });
  const backup = createFimaContentBackup(saved);
  const options = {
    targetGuildId: TEST_GUILD_ID,
    testGuildId: TEST_GUILD_ID,
    ownerActionVerified: true,
    confirmationPhrase: "PUBLISH TEST CONTENT",
    backup
  };

  assert.throws(() => planFimaContentPublish(saved, {
    ...options,
    backup: { ...backup, snapshot: { content: "forged" } }
  }), { code: "content_archive_backup_missing" });

  assert.throws(() => planFimaContentPublish({ ...saved, guildId: "1234567890123456" }, options), {
    code: "content_guild_scope_mismatch"
  });
});
