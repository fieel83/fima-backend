import test from "node:test";
import assert from "node:assert/strict";
import {
  PARADISE_CONTENT_SOURCE_EXPORTS,
  assertSafeParadiseContentDelivery,
  emptyParadiseContentStudioState,
  importParadiseDiscordMessage,
  loadParadiseContentDocument,
  normalizeParadiseContentPayload,
  normalizeParadiseContentStudioState,
  paradiseContentPreset,
  paradiseContentPreview,
  rollbackParadiseContentDocument,
  saveParadiseContentDocument
} from "../src/paradiseContentStudio.js";

const GUILD_ID = "1520519015661961257";
const ACTOR_ID = "762858334440521739";

test("normalizes Discord payload limits, URLs, and mention safety", () => {
  const payload = normalizeParadiseContentPayload({
    content: "Hello @everyone",
    embeds: [{
      color: "#40d6ff",
      title: "Guide",
      url: "javascript:alert(1)",
      imageUrl: "https://cdn.discordapp.com/attachments/123/456/guide.png?ex=signed&is=legacy&hm=secret&format=webp&quality=lossless&width=800&height=600",
      fields: [{ name: "Safe", value: "Approved only", inline: true }]
    }]
  });
  assert.equal(payload.embeds[0].color, 0x40d6ff);
  assert.equal(payload.embeds[0].url, undefined);
  assert.equal(payload.embeds[0].image.url, "https://cdn.discordapp.com/attachments/123/456/guide.png");
  assert.deepEqual(payload.allowedMentions, { parse: [], users: [], roles: [], repliedUser: false });
});

test("save, load, overwrite, version history, and rollback preserve snapshots", () => {
  const initial = emptyParadiseContentStudioState(GUILD_ID);
  const first = saveParadiseContentDocument(initial, {
    name: "Welcome",
    payload: { content: "Version one" }
  }, {
    actorId: ACTOR_ID,
    now: new Date("2026-07-17T10:00:00.000Z"),
    idFactory: (() => { const ids = ["document-one", "version-one"]; return () => ids.shift(); })()
  });
  assert.equal(first.document.current.content, "Version one");
  assert.equal(first.document.versions.length, 1);
  assert.throws(() => saveParadiseContentDocument(first.state, {
    id: first.document.id,
    payload: { content: "Unconfirmed overwrite" }
  }), { code: "overwrite_confirmation_required" });

  const second = saveParadiseContentDocument(first.state, {
    id: first.document.id,
    overwrite: true,
    name: "Welcome",
    payload: { content: "Version two" }
  }, {
    actorId: ACTOR_ID,
    now: new Date("2026-07-17T11:00:00.000Z"),
    idFactory: () => "version-two"
  });
  assert.equal(loadParadiseContentDocument(second.state, first.document.id).versions.length, 2);

  const rolledBack = rollbackParadiseContentDocument(second.state, {
    documentId: first.document.id,
    versionId: first.version.id
  }, {
    actorId: ACTOR_ID,
    now: new Date("2026-07-17T12:00:00.000Z"),
    idFactory: () => "rollback-version"
  });
  assert.equal(rolledBack.document.current.content, "Version one");
  assert.equal(rolledBack.document.versions.length, 3);
});

test("supports multi-embed payloads and desktop/mobile previews", () => {
  const payload = { embeds: [{ title: "One" }, { title: "Two" }] };
  assert.equal(paradiseContentPreview(payload, "desktop").viewportWidth, 720);
  assert.equal(paradiseContentPreview(payload, "mobile").viewportWidth, 360);
  assert.equal(paradiseContentPreview(payload, "mobile").payload.embeds.length, 2);
});

test("imports complete Discord source metadata without executable webhook credentials", () => {
  const imported = importParadiseDiscordMessage({
    id: "1520519015661961299",
    channelId: "1520519015661961288",
    guildId: GUILD_ID,
    webhookId: "1520519015661961277",
    webhookToken: "must-never-be-stored",
    webhookUrl: "https://discord.com/api/webhooks/1520519015661961277/secret-token",
    applicationId: "1520519015661961266",
    author: { id: "1520519015661961258", username: "Paradise", globalName: "Paradise Content", bot: true },
    channel: { name: "outfits", parent: { name: "Fieel Style" } },
    createdAt: new Date("2026-07-17T09:00:00.000Z"),
    editedAt: new Date("2026-07-17T09:30:00.000Z"),
    content: "Imported",
    embeds: [{ title: "Existing", description: "Read https://example.test/outfits", image: { url: "https://cdn.example.test/outfit.png" } }],
    components: [{
      type: 1,
      components: [{ type: 2, style: 5, label: "Open collection", url: "https://example.test/collection" }]
    }],
    attachments: new Map([["1520519015661961200", {
      id: "1520519015661961200",
      name: "outfit.png",
      contentType: "image/png",
      size: 2048,
      url: "https://cdn.example.test/attachment.png"
    }]])
  }, {
    importedByActorId: ACTOR_ID,
    importedAt: new Date("2026-07-17T10:00:00.000Z")
  });
  assert.equal(imported.deliveryMode, "managed_webhook");
  assert.equal(imported.stage, "imported");
  assert.equal(imported.importStatus, "captured");
  assert.equal(imported.targetMessageId, "1520519015661961299");
  assert.equal(imported.metadata.sourceGuildId, GUILD_ID);
  assert.equal(imported.metadata.author.username, "Paradise");
  assert.equal(imported.metadata.webhook.id, "1520519015661961277");
  assert.equal(imported.metadata.webhook.applicationId, "1520519015661961266");
  assert.equal(imported.metadata.components[0].components[0].label, "Open collection");
  assert.ok(imported.metadata.links.includes("https://example.test/collection"));
  assert.equal(imported.metadata.assetReferences[0].name, "outfit.png");
  assert.deepEqual(imported.originalSnapshot.payload, imported.payload);
  assert.equal(Object.hasOwn(imported, "webhookUrl"), false);
  const serialized = JSON.stringify(imported);
  assert.doesNotMatch(serialized, /must-never-be-stored|secret-token/);
});

test("normalizes Discord numeric timestamps and rejects invalid capture times", () => {
  const createdTimestamp = Date.parse("2026-07-17T09:00:00.000Z");
  const imported = importParadiseDiscordMessage({
    id: "1520519015661961299",
    channelId: "1520519015661961288",
    guildId: GUILD_ID,
    content: "Timestamp import",
    createdTimestamp
  }, { importedAt: "2026-07-17T10:00:00.000Z" });
  assert.equal(imported.metadata.messageCreatedAt, "2026-07-17T09:00:00.000Z");
  assert.equal(imported.originalSnapshot.capturedAt, "2026-07-17T10:00:00.000Z");
  assert.throws(() => importParadiseDiscordMessage({ content: "Invalid time" }, {
    importedAt: "not-a-date"
  }), { code: "invalid_imported_at" });
});

test("does not mislabel legacy Discord documents without an Original as captured imports", () => {
  const legacy = normalizeParadiseContentStudioState({
    guildId: GUILD_ID,
    documents: {
      legacy_import: {
        id: "legacy_import",
        name: "Legacy import",
        source: "discord_import",
        stage: "imported",
        current: { content: "Historical current copy" },
        versions: []
      }
    }
  }, GUILD_ID);
  assert.equal(legacy.documents.legacy_import.importStatus, "pending_source_export");
  assert.equal(legacy.documents.legacy_import.stage, "improved_draft");
  assert.equal(legacy.documents.legacy_import.originalSnapshot, null);
});

test("loads verified Outfits and Capes source exports with immutable, secrets-free lineage", () => {
  const outfits = paradiseContentPreset("outfits");
  const capes = paradiseContentPreset("capes");

  assert.equal(Object.isFrozen(PARADISE_CONTENT_SOURCE_EXPORTS.outfits), true);
  assert.equal(outfits.source, "outfits");
  assert.equal(outfits.stage, "imported");
  assert.equal(outfits.importStatus, "captured");
  assert.equal(outfits.importPending, false);
  assert.equal(outfits.metadata.sourceGuildId, "1419335632324657306");
  assert.equal(outfits.metadata.sourceChannelId, "1420404387645493268");
  assert.equal(outfits.metadata.sourceMessageId, "1421249039634141307");
  assert.equal(outfits.metadata.sourceUrl, "https://discord.com/channels/1419335632324657306/1420404387645493268/1421249039634141307");
  assert.equal(outfits.metadata.messageCreatedAt, "2025-09-26T21:36:16.579Z");
  assert.equal(outfits.metadata.application.name, "Fieel's Outfits");
  assert.equal(outfits.metadata.webhook.name, "Fieel's Outfits");
  assert.equal(outfits.payload.embeds.length, 5);
  assert.equal(outfits.metadata.assetReferences.length, 10);
  assert.match(outfits.payload.embeds[0].description, /Grey Flower Outfit/);
  assert.match(outfits.payload.embeds[4].description, /Recep ıvedık Style Outfit/);
  assert.deepEqual(outfits.originalSnapshot.payload, outfits.payload);
  assert.deepEqual(outfits.originalSnapshot.metadata, outfits.metadata);

  assert.equal(capes.stage, "imported");
  assert.equal(capes.importStatus, "captured");
  assert.equal(capes.importPending, false);
  assert.equal(capes.metadata.sourceChannelId, "1421524161695580210");
  assert.equal(capes.metadata.sourceMessageId, "1424526371295592448");
  assert.equal(capes.metadata.sourceUrl, "https://discord.com/channels/1419335632324657306/1421524161695580210/1424526371295592448");
  assert.equal(capes.metadata.messageCreatedAt, "2025-10-05T22:39:13.337Z");
  assert.equal(capes.metadata.messageEditedAt, "2025-10-06T11:54:00.000Z");
  assert.equal(capes.metadata.application.name, "Capes");
  assert.equal(capes.metadata.webhook.name, "Capes");
  assert.equal(capes.payload.embeds.length, 8);
  assert.equal(capes.metadata.assetReferences.length, 8);
  assert.match(capes.payload.embeds[0].description, /ID: 93555949341734/);
  assert.match(capes.payload.embeds[7].description, /<@1170055415896211476>/);
  assert.deepEqual(capes.originalSnapshot.payload, capes.payload);
  assert.deepEqual(capes.originalSnapshot.metadata, capes.metadata);

  for (const preset of [outfits, capes]) {
    const serialized = JSON.stringify(preset);
    assert.doesNotMatch(serialized, /discord(?:app)?\.com\/api\/webhooks|webhookToken|webhookUrl|authorization|cookie/i);
    for (const match of serialized.matchAll(/https:\/\/[^"\\]+/g)) {
      const url = new URL(match[0]);
      if (["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname)) assert.equal(url.search, "");
    }
  }

  const first = saveParadiseContentDocument(emptyParadiseContentStudioState(GUILD_ID), outfits, {
    actorId: ACTOR_ID,
    now: new Date("2026-07-17T19:30:00.000Z"),
    idFactory: (() => { const ids = ["outfits-source", "outfits-source-v1"]; return () => ids.shift(); })()
  });
  const improved = saveParadiseContentDocument(first.state, {
    ...first.document,
    overwrite: true,
    payload: { content: "Improved Outfits draft" },
    stage: "improved_draft",
    originalSnapshot: { payload: { content: "Attempted source replacement" } }
  }, {
    actorId: ACTOR_ID,
    now: new Date("2026-07-17T19:35:00.000Z"),
    idFactory: () => "outfits-source-v2"
  });
  assert.equal(improved.document.originalSnapshot.metadata.sourceMessageId, "1421249039634141307");
  assert.equal(improved.document.originalSnapshot.payload.embeds.length, 5);
});

test("keeps the imported Original immutable and enforces content stage transitions", () => {
  const imported = importParadiseDiscordMessage({
    id: "1520519015661961299",
    channelId: "1520519015661961288",
    guildId: GUILD_ID,
    content: "Original owner message"
  }, {
    importedByActorId: ACTOR_ID,
    importedAt: new Date("2026-07-17T10:00:00.000Z")
  });
  const first = saveParadiseContentDocument(emptyParadiseContentStudioState(GUILD_ID), imported, {
    actorId: ACTOR_ID,
    now: new Date("2026-07-17T10:05:00.000Z"),
    idFactory: (() => { const ids = ["imported-doc", "imported-version"]; return () => ids.shift(); })()
  });
  assert.equal(first.document.originalSnapshot.payload.content, "Original owner message");

  assert.throws(() => saveParadiseContentDocument(first.state, {
    ...first.document,
    overwrite: true,
    payload: { content: "Edited but mislabeled" },
    stage: "imported"
  }), { code: "imported_stage_requires_original_payload" });

  const improved = saveParadiseContentDocument(first.state, {
    ...first.document,
    overwrite: true,
    payload: { content: "Improved draft" },
    stage: "improved_draft",
    originalSnapshot: { payload: { content: "Attempted overwrite" } }
  }, {
    actorId: ACTOR_ID,
    now: new Date("2026-07-17T10:10:00.000Z"),
    idFactory: () => "improved-version"
  });
  assert.equal(improved.document.current.content, "Improved draft");
  assert.equal(improved.document.originalSnapshot.payload.content, "Original owner message");
  assert.equal(improved.document.versions.at(-1).stage, "improved_draft");

  const production = saveParadiseContentDocument(improved.state, {
    ...improved.document,
    overwrite: true,
    payload: improved.document.current,
    stage: "production_version"
  }, {
    actorId: ACTOR_ID,
    now: new Date("2026-07-17T10:15:00.000Z"),
    idFactory: () => "production-version"
  });
  assert.equal(production.document.stage, "production_version");
  assert.equal(production.document.originalSnapshot.payload.content, "Original owner message");
});

test("safe webhook policy rejects arbitrary URLs and disables mentions", () => {
  assert.throws(() => assertSafeParadiseContentDelivery({
    deliveryMode: "managed_webhook",
    webhookUrl: "https://discord.com/api/webhooks/123/token"
  }), { code: "arbitrary_webhook_forbidden" });
  const policy = assertSafeParadiseContentDelivery({ deliveryMode: "managed_webhook" });
  assert.equal(policy.managedWebhookOnly, true);
  assert.deepEqual(policy.allowedMentions.parse, []);
});

test("rejects Discord's combined 6000-character embed limit", () => {
  assert.throws(() => normalizeParadiseContentPayload({
    embeds: [{ description: "a".repeat(4000) }, { description: "b".repeat(3000) }]
  }), { code: "embed_character_limit" });
});
