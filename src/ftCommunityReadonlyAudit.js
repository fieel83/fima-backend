import { createHash } from "node:crypto";
import {
  buildFieelsCommunityPersonaMatrix,
  buildFieelsCommunityStructureDraft,
  validateFieelsCommunityStructureDraft
} from "./fieelsCommunityStructure.js";

export const FT_COMMUNITY_AUDIT_SCHEMA = 1;
export const FT_COMMUNITY_TEST_GUILD_ID = "1520519015661961257";

const SECRET_KEY = /(authorization|cookie|password|secret|token|webhook.?url|transcript|content)/i;
const HTTPS = /^https:\/\/[^\s]+$/i;

function text(value, max = 160) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function id(value) {
  return text(value, 32);
}

function sorted(values, key = (value) => value.id || value.key || value.name || "") {
  return [...values].sort((a, b) => String(key(a)).localeCompare(String(key(b)), "en"));
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEY.test(key)));
}

function permissions(value) {
  const source = safeObject(value);
  return Object.fromEntries(Object.entries(source)
    .map(([key, enabled]) => [text(key, 64), Boolean(enabled)])
    .sort(([a], [b]) => a.localeCompare(b, "en")));
}

function channel(item = {}) {
  return {
    id: id(item.id),
    parentId: id(item.parentId),
    name: text(item.name),
    type: Number.isFinite(Number(item.type)) ? Number(item.type) : null,
    position: Number.isFinite(Number(item.position)) ? Number(item.position) : 0,
    permissionOverwrites: sorted((item.permissionOverwrites || []).map((overwrite) => ({
      id: id(overwrite.id),
      type: text(overwrite.type, 16),
      allow: sorted((overwrite.allow || []).map((entry) => text(entry, 64))),
      deny: sorted((overwrite.deny || []).map((entry) => text(entry, 64)))
    })), (entry) => `${entry.type}:${entry.id}`)
  };
}

function role(item = {}) {
  return {
    id: id(item.id),
    name: text(item.name),
    position: Number.isFinite(Number(item.position)) ? Number(item.position) : 0,
    managed: Boolean(item.managed),
    hoist: Boolean(item.hoist),
    mentionable: Boolean(item.mentionable),
    permissions: sorted((item.permissions || []).map((entry) => text(entry, 64)))
  };
}

function embed(item = {}) {
  return {
    messageId: id(item.messageId || item.id),
    channelId: id(item.channelId),
    embedCount: Number.isFinite(Number(item.embedCount)) ? Number(item.embedCount) : 0,
    hasTitle: Boolean(item.hasTitle),
    hasDescription: Boolean(item.hasDescription),
    fieldCount: Number.isFinite(Number(item.fieldCount)) ? Number(item.fieldCount) : 0,
    hasThumbnail: Boolean(item.hasThumbnail),
    hasImage: Boolean(item.hasImage),
    pinned: Boolean(item.pinned)
  };
}

function webhook(item = {}) {
  return {
    id: id(item.id),
    channelId: id(item.channelId),
    name: text(item.name),
    applicationId: id(item.applicationId),
    type: Number.isFinite(Number(item.type)) ? Number(item.type) : null
  };
}

function pin(item = {}) {
  return {
    messageId: id(item.messageId || item.id),
    channelId: id(item.channelId),
    authorType: item.authorType === "bot" ? "bot" : "member",
    hasEmbeds: Boolean(item.hasEmbeds),
    attachmentCount: Number.isFinite(Number(item.attachmentCount)) ? Number(item.attachmentCount) : 0
  };
}

function ticket(item = {}) {
  return {
    id: id(item.id),
    channelId: id(item.channelId),
    kind: text(item.kind || "support", 48),
    state: ["open", "closed", "archived"].includes(item.state) ? item.state : "unknown",
    ownerIdHash: item.ownerId ? sha256(`member:${id(item.ownerId)}`) : null,
    createdAt: /^\d{4}-\d{2}-\d{2}T/.test(String(item.createdAt || "")) ? String(item.createdAt) : null
  };
}

function bot(item = {}) {
  return {
    id: id(item.id),
    username: text(item.username || item.name),
    applicationId: id(item.applicationId),
    managedRoleIds: sorted((item.managedRoleIds || []).map(id)),
    integrationType: text(item.integrationType || "bot", 32)
  };
}

export function buildFtCommunityReadonlyInventory(raw = {}) {
  const payload = {
    schemaVersion: FT_COMMUNITY_AUDIT_SCHEMA,
    mode: "read_only",
    guild: { id: id(raw.guild?.id || raw.guildId), name: text(raw.guild?.name || raw.guildName) },
    channels: sorted((raw.channels || []).map(channel)),
    roles: sorted((raw.roles || []).map(role)),
    embeds: sorted((raw.embeds || raw.embedMetadata || []).map(embed), (entry) => `${entry.channelId}:${entry.messageId}`),
    webhooks: sorted((raw.webhooks || []).map(webhook)),
    pins: sorted((raw.pins || []).map(pin), (entry) => `${entry.channelId}:${entry.messageId}`),
    tickets: sorted((raw.tickets || []).map(ticket)),
    thirdPartyBots: sorted((raw.thirdPartyBots || raw.bots || []).map(bot))
  };
  return payload;
}

export function createFtCommunityBackupManifest(raw, capturedAt = new Date().toISOString()) {
  const inventory = buildFtCommunityReadonlyInventory(raw);
  const components = Object.fromEntries(
    ["channels", "roles", "embeds", "webhooks", "pins", "tickets", "thirdPartyBots"]
      .map((key) => [key, { count: inventory[key].length, sha256: sha256(inventory[key]) }])
  );
  return {
    backupSchemaVersion: FT_COMMUNITY_AUDIT_SCHEMA,
    capturedAt,
    readOnly: true,
    productionMutated: false,
    inventory,
    integrity: {
      algorithm: "sha256",
      canonicalPayloadSha256: sha256(inventory),
      components
    }
  };
}

export function validateFtCommunityBackupManifest(manifest) {
  if (manifest?.backupSchemaVersion !== FT_COMMUNITY_AUDIT_SCHEMA) return { valid: false, code: "schema_invalid" };
  if (manifest.readOnly !== true || manifest.productionMutated !== false) return { valid: false, code: "safety_flags_invalid" };
  const actualPayloadHash = sha256(manifest.inventory);
  if (actualPayloadHash !== manifest.integrity?.canonicalPayloadSha256) {
    return { valid: false, code: "payload_hash_mismatch" };
  }
  const actualComponents = Object.fromEntries(
    ["channels", "roles", "embeds", "webhooks", "pins", "tickets", "thirdPartyBots"]
      .map((key) => [key, {
        count: Array.isArray(manifest.inventory?.[key]) ? manifest.inventory[key].length : 0,
        sha256: sha256(Array.isArray(manifest.inventory?.[key]) ? manifest.inventory[key] : [])
      }])
  );
  if (JSON.stringify(actualComponents) !== JSON.stringify(manifest.integrity.components)) {
    return { valid: false, code: "component_hash_mismatch" };
  }
  return { valid: true, code: "backup_valid", digest: manifest.integrity.canonicalPayloadSha256 };
}

export function buildFtCommunityTestGuildRehearsal({
  guildId = FT_COMMUNITY_TEST_GUILD_ID
} = {}) {
  if (String(guildId) !== FT_COMMUNITY_TEST_GUILD_ID) {
    return {
      status: "blocked",
      code: "test_guild_not_allowlisted",
      productionMutationAllowed: false,
      requestedGuildId: text(guildId, 32)
    };
  }
  const structure = buildFieelsCommunityStructureDraft({ language: "en" });
  const validation = validateFieelsCommunityStructureDraft(structure);
  return {
    schemaVersion: 1,
    status: validation.ok ? "ready" : "blocked",
    targetGuildId: FT_COMMUNITY_TEST_GUILD_ID,
    executionMode: "fixture_rehearsal_only",
    productionMutationAllowed: false,
    idempotencyKey: `ft-community-rehearsal:${FT_COMMUNITY_TEST_GUILD_ID}:${structure.revision}`,
    persona: {
      name: "FIMA",
      tone: ["clear", "welcoming", "security-aware", "international-first"],
      primaryLanguage: "en",
      localizedCategory: "turkish",
      matrix: buildFieelsCommunityPersonaMatrix()
    },
    structure,
    permissionChecks: [
      { actor: "everyone", resource: "personnel", expected: { view: false } },
      { actor: "turkish", resource: "turkish", expected: { view: true, send: true } },
      { actor: "helper", resource: "applications", expected: { review: true, approve: false } },
      { actor: "administrator", resource: "applications", expected: { review: true, approve: true } }
    ],
    applicationFixture: {
      // The public, website-first application surface is intentionally
      // multi-type.  Keep role assignment manual and review-gated; an
      // application type must never imply an automatic Discord role grant.
      type: "multi_type",
      supportedTypes: [
        "helper",
        "staff",
        "moderator",
        "support",
        "training_hoster",
        "tryout_hoster",
        "referee",
        "event_staff",
        "giveaway_staff",
        "content_creator",
        "partnership",
        "clan_mainer",
        "fima_support",
        "macro_staff",
        "fflag_staff",
        "war_hoster",
        "creator",
        "reseller"
      ],
      websiteFirst: true,
      requiresDiscordOAuth: true,
      requiresGuildMembership: true,
      supportsDraftResume: true,
      questionMediaPolicy: "per_question_optional_or_required",
      ticketVisibility: "applicant_and_authorized_staff",
      actions: ["approve", "deny", "more_info"],
      approvedRoleKeys: [],
      roleGrantPolicy: "manual_staff_review_only"
    },
    embedFixtures: [
      { key: "welcome", layout: ["banner", "title_image", "body", "thumbnail", "divider"], locale: "en" },
      { key: "rules", layout: ["banner", "title_image", "body", "thumbnail", "divider"], locale: "en" },
      { key: "turkish_welcome", layout: ["banner", "title_image", "body", "thumbnail", "divider"], locale: "tr" }
    ],
    ticketFixture: {
      kinds: ["support", "application"],
      states: ["open", "more_info", "approved", "denied", "closed"],
      transcriptPolicy: "private_redacted",
      duplicateOpenTicketPolicy: "deny"
    },
    dashboardChecks: [
      "guild_picker_scoped_to_test_guild",
      "permission_preview",
      "application_preview",
      "embed_mobile_desktop_preview",
      "ticket_lifecycle_preview",
      "save_load_version_rollback",
      "no_webhook_url_exposure"
    ],
    validation
  };
}

export function containsFtCommunitySecretMaterial(value) {
  const serialized = JSON.stringify(value);
  return /(https?:\/\/(?:discord(?:app)?\.com\/api\/webhooks|discord\.com\/webhooks)\/|authorization["':\s]|password["':\s]|token["':\s]|webhookUrl)/i.test(serialized)
    || Object.keys(value && typeof value === "object" ? value : {}).some((key) => SECRET_KEY.test(key));
}
