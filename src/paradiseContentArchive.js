import { validateParadiseBackupEnvelope } from "./paradiseBackupIntegrity.js";
import { importParadiseDiscordMessage } from "./paradiseContentStudio.js";

const ARCHIVE_SENSITIVE_KEY = /(authorization|cookie|credential|password|secret|token)/i;
const ARCHIVE_SENSITIVE_NORMALIZED_KEYS = Object.freeze([
  "apikey",
  "accesskey",
  "privatekey",
  "signingkey",
  "clientsecret",
  "sessionid",
  "refreshtoken"
]);
const ARCHIVE_WEBHOOK_FIELDS = new Set(["id", "name", "applicationId", "application_id"]);

function archiveError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function snowflake(value) {
  const normalized = String(value || "").trim();
  return /^\d{16,22}$/.test(normalized) ? normalized : null;
}

function backupGuildId(backup) {
  return snowflake(backup?.guildId || backup?.guild?.id);
}

function assertNoArchiveSensitiveFields(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = String(key).replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (ARCHIVE_SENSITIVE_KEY.test(key)
      || ARCHIVE_SENSITIVE_NORMALIZED_KEYS.some(sensitive => normalizedKey.includes(sensitive))) {
      throw archiveError("content_archive_sensitive_field_forbidden");
    }
    assertNoArchiveSensitiveFields(child);
  }
}

function assertSafeArchiveWebhook(webhook) {
  if (webhook == null) return;
  if (Array.isArray(webhook) || typeof webhook !== "object") {
    throw archiveError("content_archive_webhook_invalid");
  }
  assertNoArchiveSensitiveFields(webhook);
  for (const key of Object.keys(webhook)) {
    if (!ARCHIVE_WEBHOOK_FIELDS.has(key)) {
      throw archiveError("content_archive_webhook_invalid");
    }
  }
}

function assertSafeArchiveRecordData(record) {
  assertSafeArchiveWebhook(record?.webhook);
  for (const field of ["embeds", "components", "attachments"]) {
    assertNoArchiveSensitiveFields(record?.[field]);
  }
}

function archiveRecords(backup, expectedGuildId) {
  if (!backup || typeof backup !== "object") throw archiveError("content_archive_backup_missing");
  const validation = validateParadiseBackupEnvelope(backup);
  if (!validation.valid) throw archiveError(validation.code, { validation });
  const expected = snowflake(expectedGuildId);
  const actual = backupGuildId(backup);
  if (!expected || !actual || actual !== expected) {
    throw archiveError("content_archive_guild_mismatch", {
      expectedGuildId: expected,
      actualGuildId: actual
    });
  }
  if (!Array.isArray(backup.contentArchive)) throw archiveError("content_archive_missing");
  for (const record of backup.contentArchive) {
    if (snowflake(record?.guildId) !== expected) {
      throw archiveError("content_archive_record_guild_mismatch", {
        expectedGuildId: expected,
        actualGuildId: snowflake(record?.guildId)
      });
    }
    if (!snowflake(record?.channelId) || !snowflake(record?.id)) {
      throw archiveError("content_archive_record_invalid");
    }
    if (record.restorePolicy !== "content_studio_import_only" || record.automaticRestore !== false) {
      throw archiveError("content_archive_restore_policy_invalid");
    }
    assertSafeArchiveRecordData(record);
  }
  return backup.contentArchive;
}

function cleanText(value, limit) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function archiveSourceUrl(record) {
  const value = String(record?.sourceUrl || "");
  const match = /^https:\/\/(?:www\.)?(?:discord\.com|discordapp\.com)\/channels\/(\d{16,22})\/(\d{16,22})\/(\d{16,22})$/i.exec(value);
  if (!match) return null;
  return match[1] === snowflake(record?.guildId)
    && match[2] === snowflake(record?.channelId)
    && match[3] === snowflake(record?.id)
    ? value
    : null;
}

function archiveSummary(record) {
  return {
    guildId: snowflake(record.guildId),
    channelId: snowflake(record.channelId),
    messageId: snowflake(record.id),
    channelName: cleanText(record.channelName, 100) || null,
    categoryName: cleanText(record.categoryName, 100) || null,
    author: {
      username: cleanText(record.author?.username, 100) || null,
      globalName: cleanText(record.author?.globalName, 100) || null,
      bot: Boolean(record.author?.bot),
      isGuildOwner: Boolean(record.author?.isGuildOwner),
      isCurrentBot: Boolean(record.author?.isCurrentBot)
    },
    sourceKind: ["owner", "bot", "webhook", "member"].includes(record.sourceKind) ? record.sourceKind : "member",
    pinned: Boolean(record.pinned),
    createdTimestamp: Number.isFinite(Number(record.createdTimestamp)) ? Number(record.createdTimestamp) : 0,
    sourceUrl: archiveSourceUrl(record),
    contentPreview: cleanText(record.content, 180) || null,
    embedCount: Array.isArray(record.embeds) ? Math.min(record.embeds.length, 10) : 0,
    componentCount: Array.isArray(record.components) ? Math.min(record.components.length, 25) : 0,
    attachmentCount: Array.isArray(record.attachments) ? Math.min(record.attachments.length, 100) : 0,
    restorePolicy: "content_studio_import_only",
    automaticRestore: false
  };
}

export function listParadiseContentArchive(backup, { expectedGuildId } = {}) {
  return archiveRecords(backup, expectedGuildId)
    .map(archiveSummary)
    .sort((left, right) => right.createdTimestamp - left.createdTimestamp);
}

export function importParadiseContentArchiveMessage(backup, {
  expectedGuildId,
  channelId,
  messageId,
  importedByActorId,
  importedAt = new Date()
} = {}) {
  const expectedChannelId = snowflake(channelId);
  const expectedMessageId = snowflake(messageId);
  if (!expectedChannelId || !expectedMessageId) throw archiveError("content_archive_record_invalid");
  const records = archiveRecords(backup, expectedGuildId);
  const record = records.find(item => snowflake(item.channelId) === expectedChannelId && snowflake(item.id) === expectedMessageId);
  if (!record) throw archiveError("content_archive_record_not_found");
  const source = archiveSummary(record);
  const imported = importParadiseDiscordMessage({
    id: record.id,
    guildId: record.guildId,
    channelId: record.channelId,
    channel: {
      name: cleanText(record.channelName, 100),
      parent: { name: cleanText(record.categoryName, 100) }
    },
    author: record.author,
    webhookId: record.webhook?.id,
    webhookName: record.webhook?.name,
    applicationId: record.webhook?.applicationId,
    content: record.content,
    embeds: Array.isArray(record.embeds) ? record.embeds : [],
    components: Array.isArray(record.components) ? record.components : [],
    attachments: Array.isArray(record.attachments) ? record.attachments : [],
    pinned: Boolean(record.pinned),
    createdTimestamp: record.createdTimestamp,
    url: source.sourceUrl,
    tags: ["validated-backup-archive", "content-studio-import-only"]
  }, {
    name: `Archived #${cleanText(record.channelName, 70) || record.channelId}`,
    importedByActorId,
    importedAt,
    sourceGuildId: expectedGuildId
  });
  return {
    ...imported,
    archiveSource: source
  };
}
