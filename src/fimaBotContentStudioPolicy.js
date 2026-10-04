import { createHash } from "node:crypto";

const DISCORD_ID = /^\d{16,22}$/;
const SAFE_MANAGED_REF = /^managed:[a-z0-9][a-z0-9_-]{1,62}$/;
const SECRET_KEY = /(webhook.?url|webhook.?token|discord.?token|authorization|password|secret|private.?key|recovery.?code|cookie|session.?token)/i;
const SECRET_VALUE = /(discord(?:app)?\.com\/api\/webhooks\/|\bBearer\s+[A-Za-z0-9._~-]+|\b(?:token|password|secret|authorization)=|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.)/i;
const DEFAULT_MEDIA_HOSTS = Object.freeze([
  "cdn.discordapp.com",
  "media.discordapp.net",
  "fimamacro.com",
  "www.fimamacro.com",
  "cdn.fimamacro.com"
]);

const contentError = code => Object.assign(new Error(code), { code });

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function isMediaUrlPath(path) {
  const leaf = path.at(-1) || "";
  const parent = path.at(-2) || "";
  return /(image|thumbnail|banner|icon|attachment|media).*url/i.test(leaf)
    || (leaf === "url" && /(image|thumbnail|banner|icon|attachment|media|author|footer)/i.test(parent));
}

function normalizeUrl(value, path, allowedMediaHosts) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw contentError("content_url_invalid");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw contentError("content_url_https_required");
  if (isMediaUrlPath(path) && !allowedMediaHosts.has(parsed.hostname.toLowerCase())) throw contentError("content_media_host_forbidden");
  return parsed.toString();
}

function sanitize(value, path, allowedMediaHosts) {
  if (typeof value === "string") {
    if (SECRET_VALUE.test(value)) throw contentError("content_secret_forbidden");
    if (/^https?:\/\//i.test(value)) return normalizeUrl(value, path, allowedMediaHosts);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => sanitize(entry, [...path, String(index)], allowedMediaHosts));
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) throw contentError("content_secret_field_forbidden");
      output[key] = sanitize(entry, [...path, key], allowedMediaHosts);
    }
    return output;
  }
  if ([null, undefined].includes(value) || ["number", "boolean"].includes(typeof value)) return value;
  throw contentError("content_value_invalid");
}

function assertDocument(document) {
  if (!document || document.kind !== "fima_content_document") throw contentError("content_document_invalid");
}

function assertPreview(document, preview) {
  if (!preview || preview.kind !== "content_preview" || preview.documentId !== document.documentId) {
    throw contentError("content_preview_required");
  }
  if (preview.payloadDigest !== digest(document.payload)) throw contentError("content_preview_stale");
}

function assertCurrentVersionIntegrity(document) {
  const current = document.versions.at(-1);
  if (!current || typeof current !== "object" || !current.versionId || !current.digest
    || !current.payload || typeof current.payload !== "object" || Array.isArray(current.payload)) {
    throw contentError("content_version_required");
  }
  if (digest(current.payload) !== current.digest) throw contentError("content_version_integrity_failed");
  return current;
}

function assertMatchingBackup(document, current, backup) {
  if (!backup || backup.kind !== "content_backup" || backup.documentId !== document.documentId
    || backup.versionId !== current.versionId || backup.digest !== current.digest
    || digest(backup.snapshot) !== current.digest) {
    throw contentError("content_archive_backup_missing");
  }
}

export const FIMA_CONTENT_ALLOWED_MENTIONS = Object.freeze({
  parse: Object.freeze([]),
  users: Object.freeze([]),
  roles: Object.freeze([]),
  repliedUser: false
});

export function normalizeFimaContentPayload(payload, { allowedMediaHosts = DEFAULT_MEDIA_HOSTS } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw contentError("content_payload_invalid");
  const hosts = new Set(allowedMediaHosts.map(host => String(host).toLowerCase()));
  const normalized = sanitize(payload, [], hosts);
  if (typeof normalized.content === "string" && normalized.content.length > 2000) throw contentError("content_length_limit");
  if (normalized.embeds !== undefined && (!Array.isArray(normalized.embeds) || normalized.embeds.length > 10)) {
    throw contentError("content_embed_limit");
  }
  normalized.allowedMentions = structuredClone(FIMA_CONTENT_ALLOWED_MENTIONS);
  return normalized;
}

export function createFimaContentDraft({ documentId, guildId, payload, managedWebhookRef } = {}) {
  if (!/^[a-z][a-z0-9_-]{2,63}$/.test(String(documentId || ""))) throw contentError("content_document_id_invalid");
  if (!DISCORD_ID.test(String(guildId || ""))) throw contentError("content_guild_invalid");
  if (!SAFE_MANAGED_REF.test(String(managedWebhookRef || ""))) throw contentError("managed_webhook_reference_required");
  return {
    kind: "fima_content_document",
    documentId: String(documentId),
    guildId: String(guildId),
    managedWebhookRef: String(managedWebhookRef),
    stage: "draft",
    payload: normalizeFimaContentPayload(payload),
    versions: []
  };
}

export function previewFimaContent(document, viewport = "desktop") {
  assertDocument(document);
  if (!new Set(["desktop", "mobile"]).has(viewport)) throw contentError("content_preview_viewport_invalid");
  return Object.freeze({
    kind: "content_preview",
    documentId: document.documentId,
    guildId: document.guildId,
    viewport,
    viewportWidth: viewport === "mobile" ? 360 : 720,
    payloadDigest: digest(document.payload),
    payload: structuredClone(document.payload),
    readOnly: true
  });
}

export function createFimaContentBackup(document) {
  assertDocument(document);
  const current = assertCurrentVersionIntegrity(document);
  return Object.freeze({
    kind: "content_backup",
    documentId: document.documentId,
    versionId: current.versionId,
    digest: current.digest,
    snapshot: structuredClone(current.payload)
  });
}

export function saveFimaContentVersion(document, preview, {
  actorId,
  savedAt,
  overwriteConfirmed = false,
  backup = null
} = {}) {
  assertDocument(document);
  assertPreview(document, preview);
  if (!DISCORD_ID.test(String(actorId || ""))) throw contentError("content_actor_invalid");
  const timestamp = new Date(savedAt || Date.now());
  if (Number.isNaN(timestamp.getTime())) throw contentError("content_saved_at_invalid");
  const current = document.versions.at(-1);
  if (current) {
    assertCurrentVersionIntegrity(document);
    if (!overwriteConfirmed) throw contentError("content_overwrite_confirmation_required");
    assertMatchingBackup(document, current, backup);
  }
  const versionDigest = digest(document.payload);
  const versionId = `v_${versionDigest.slice(0, 16)}`;
  const version = Object.freeze({
    versionId,
    digest: versionDigest,
    actorId: String(actorId),
    savedAt: timestamp.toISOString(),
    payload: structuredClone(document.payload),
    previewDigest: preview.payloadDigest,
    previousBackupDigest: backup?.digest || null
  });
  return {
    ...structuredClone(document),
    stage: "saved_version",
    versions: [...document.versions.map(entry => structuredClone(entry)), version]
  };
}

export function planFimaContentPublish(document, {
  targetGuildId,
  testGuildId,
  ownerActionVerified = false,
  confirmationPhrase = "",
  backup
} = {}) {
  assertDocument(document);
  const current = assertCurrentVersionIntegrity(document);
  assertMatchingBackup(document, current, backup);
  if (!ownerActionVerified) throw contentError("owner_action_required");
  if (!DISCORD_ID.test(String(testGuildId || "")) || String(targetGuildId || "") !== String(testGuildId)) {
    throw contentError("test_guild_only");
  }
  if (String(document.guildId) !== String(targetGuildId)) throw contentError("content_guild_scope_mismatch");
  if (confirmationPhrase !== "PUBLISH TEST CONTENT") throw contentError("publish_confirmation_required");
  return Object.freeze({
    kind: "content_publish_plan",
    documentId: document.documentId,
    targetGuildId: String(targetGuildId),
    managedWebhookRef: document.managedWebhookRef,
    versionId: current.versionId,
    contentDigest: current.digest,
    backupDigest: backup.digest,
    allowedMentions: FIMA_CONTENT_ALLOWED_MENTIONS,
    requiresExactReadback: true,
    audit: Object.freeze({
      action: "content_publish_planned",
      documentId: document.documentId,
      targetGuildId: String(targetGuildId),
      versionId: current.versionId,
      contentDigest: current.digest,
      backupDigest: backup.digest
    })
  });
}

export function verifyFimaContentPublishReadback(plan, readback = {}) {
  if (!plan || plan.kind !== "content_publish_plan") throw contentError("content_publish_plan_invalid");
  if (String(readback.guildId || "") !== plan.targetGuildId
    || readback.managedWebhookRef !== plan.managedWebhookRef
    || readback.contentDigest !== plan.contentDigest) {
    throw contentError("content_publish_readback_mismatch");
  }
  return Object.freeze({
    verified: true,
    documentId: plan.documentId,
    targetGuildId: plan.targetGuildId,
    versionId: plan.versionId,
    contentDigest: plan.contentDigest
  });
}
