import test from "node:test";
import assert from "node:assert/strict";
import { createParadiseBackupEnvelope } from "../src/paradiseBackupIntegrity.js";
import {
  importParadiseContentArchiveMessage,
  listParadiseContentArchive
} from "../src/paradiseContentArchive.js";

const GUILD_ID = "1520519015661961257";
const CHANNEL_ID = "1520519015661961258";
const MESSAGE_ID = "1520519015661961259";
const ACTOR_ID = "762858334440521739";

function archiveRecord(overrides = {}) {
  return {
    id: MESSAGE_ID,
    guildId: GUILD_ID,
    channelId: CHANNEL_ID,
    channelName: "announcements",
    categoryName: "FIMA Community",
    author: {
      id: ACTOR_ID,
      username: "Fieel",
      globalName: "Fieel",
      bot: false,
      isGuildOwner: true,
      isCurrentBot: false
    },
    webhook: null,
    sourceKind: "owner",
    content: "Archived announcement",
    embeds: [{ title: "FIMA", description: "Verified source", color: 0x20d9c4 }],
    components: [],
    attachments: [],
    pinned: true,
    createdTimestamp: 1784743200000,
    sourceUrl: `https://discord.com/channels/${GUILD_ID}/${CHANNEL_ID}/${MESSAGE_ID}`,
    restorePolicy: "content_studio_import_only",
    automaticRestore: false,
    ...overrides
  };
}

function backup(records = [archiveRecord()], overrides = {}) {
  return createParadiseBackupEnvelope({
    guildId: GUILD_ID,
    guild: { id: GUILD_ID, name: "FIMA" },
    contentArchive: records,
    ...overrides
  }, new Date("2026-07-22T12:00:00.000Z"));
}

test("lists only sanitized archive summaries from a validated guild backup", () => {
  const records = listParadiseContentArchive(backup(), { expectedGuildId: GUILD_ID });
  assert.equal(records.length, 1);
  assert.equal(records[0].messageId, MESSAGE_ID);
  assert.equal(records[0].contentPreview, "Archived announcement");
  assert.equal(records[0].embedCount, 1);
  assert.equal(records[0].restorePolicy, "content_studio_import_only");
  assert.equal(records[0].automaticRestore, false);
  assert.equal(Object.hasOwn(records[0].author, "id"), false);
  assert.equal(Object.hasOwn(records[0], "embeds"), false);
});

test("imports a validated archive record with an independent immutable Original snapshot", () => {
  const imported = importParadiseContentArchiveMessage(backup(), {
    expectedGuildId: GUILD_ID,
    channelId: CHANNEL_ID,
    messageId: MESSAGE_ID,
    importedByActorId: ACTOR_ID,
    importedAt: new Date("2026-07-22T12:30:00.000Z")
  });
  assert.equal(imported.source, "discord_import");
  assert.equal(imported.stage, "imported");
  assert.equal(imported.importStatus, "captured");
  assert.equal(imported.metadata.sourceGuildId, GUILD_ID);
  assert.equal(imported.metadata.sourceChannelId, CHANNEL_ID);
  assert.equal(imported.metadata.sourceMessageId, MESSAGE_ID);
  assert.equal(imported.originalSnapshot.payload.content, "Archived announcement");
  assert.deepEqual(imported.payload.allowedMentions, { parse: [], users: [], roles: [], repliedUser: false });
  imported.payload.content = "edited draft";
  assert.equal(imported.originalSnapshot.payload.content, "Archived announcement");
  assert.equal(imported.archiveSource.automaticRestore, false);
});

test("drops Discord source URLs whose guild, channel, or message lineage does not match the archive record", () => {
  const mismatchedUrl = `https://discord.com/channels/${GUILD_ID}/${CHANNEL_ID}/1520519015661961299`;
  const source = backup([archiveRecord({ sourceUrl: mismatchedUrl })]);
  const listed = listParadiseContentArchive(source, { expectedGuildId: GUILD_ID });
  const imported = importParadiseContentArchiveMessage(source, {
    expectedGuildId: GUILD_ID,
    channelId: CHANNEL_ID,
    messageId: MESSAGE_ID,
    importedByActorId: ACTOR_ID
  });
  const canonicalUrl = `https://discord.com/channels/${GUILD_ID}/${CHANNEL_ID}/${MESSAGE_ID}`;
  assert.equal(listed[0].sourceUrl, null);
  assert.equal(imported.metadata.sourceUrl, canonicalUrl);
  assert.equal(imported.archiveSource.sourceUrl, null);
  assert.doesNotMatch(JSON.stringify(imported), new RegExp(mismatchedUrl.replaceAll("/", "\\/")));
});

test("accepts metadata-only webhook provenance without importing executable credentials", () => {
  const imported = importParadiseContentArchiveMessage(backup([
    archiveRecord({
      webhook: {
        id: "1520519015661961277",
        applicationId: "1520519015661961266",
        name: "FIMA Content Studio"
      },
      sourceKind: "webhook"
    })
  ]), {
    expectedGuildId: GUILD_ID,
    channelId: CHANNEL_ID,
    messageId: MESSAGE_ID,
    importedByActorId: ACTOR_ID
  });
  assert.equal(imported.metadata.webhook.id, "1520519015661961277");
  assert.equal(imported.metadata.webhook.applicationId, "1520519015661961266");
  assert.equal(Object.hasOwn(imported.metadata.webhook, "token"), false);
  assert.equal(Object.hasOwn(imported, "webhookUrl"), false);
});

test("rejects signed archive embeds, components, and webhooks carrying secret-like fields", () => {
  for (const record of [
    archiveRecord({ webhook: { id: "1520519015661961277", token: "must-not-leak" } }),
    archiveRecord({ embeds: [{ title: "FIMA", authorization: "must-not-leak" }] }),
    archiveRecord({ components: [{ type: 1, credential: "must-not-leak" }] }),
    archiveRecord({ attachments: [{ name: "unsafe.txt", metadata: { apiKey: "must-not-leak" } }] })
  ]) {
    assert.throws(() => listParadiseContentArchive(backup([record]), { expectedGuildId: GUILD_ID }), error => {
      assert.equal(error.code, "content_archive_sensitive_field_forbidden");
      assert.doesNotMatch(String(error), /must-not-leak/);
      return true;
    });
  }
});

test("rejects archive webhook fields outside non-executable provenance metadata", () => {
  assert.throws(() => listParadiseContentArchive(backup([
    archiveRecord({ webhook: { id: "1520519015661961277", url: "https://discord.com/api/webhooks/unsafe" } })
  ]), { expectedGuildId: GUILD_ID }), { code: "content_archive_webhook_invalid" });
});

test("fails closed for missing, corrupt, incompatible, and cross-guild backups", () => {
  assert.throws(() => listParadiseContentArchive(null, { expectedGuildId: GUILD_ID }), { code: "content_archive_backup_missing" });

  const corrupt = backup();
  corrupt.contentArchive[0].content = "tampered";
  assert.throws(() => listParadiseContentArchive(corrupt, { expectedGuildId: GUILD_ID }), { code: "backup_checksum_mismatch" });

  const incompatible = backup();
  incompatible.backupSchemaVersion += 1;
  assert.throws(() => listParadiseContentArchive(incompatible, { expectedGuildId: GUILD_ID }), { code: "backup_schema_invalid" });

  assert.throws(() => listParadiseContentArchive(backup(), { expectedGuildId: "1419335632324657306" }), {
    code: "content_archive_guild_mismatch"
  });

  assert.throws(() => listParadiseContentArchive(createParadiseBackupEnvelope({ guildId: GUILD_ID }), { expectedGuildId: GUILD_ID }), {
    code: "content_archive_missing"
  });
});

test("rejects cross-guild archive records, unsafe restore policies, and missing records", () => {
  assert.throws(() => listParadiseContentArchive(backup([
    archiveRecord({ guildId: "1419335632324657306" })
  ]), { expectedGuildId: GUILD_ID }), { code: "content_archive_record_guild_mismatch" });

  assert.throws(() => listParadiseContentArchive(backup([
    archiveRecord({ automaticRestore: true })
  ]), { expectedGuildId: GUILD_ID }), { code: "content_archive_restore_policy_invalid" });

  assert.throws(() => importParadiseContentArchiveMessage(backup(), {
    expectedGuildId: GUILD_ID,
    channelId: CHANNEL_ID,
    messageId: "1520519015661961299"
  }), { code: "content_archive_record_not_found" });
});
