import crypto from "node:crypto";

export const PARADISE_CONTENT_STUDIO_SCHEMA_VERSION = 2;
export const PARADISE_CONTENT_STUDIO_MAX_VERSIONS = 50;
export const PARADISE_CONTENT_DELIVERY_MODES = Object.freeze(["bot", "managed_webhook"]);
export const PARADISE_CONTENT_STAGES = Object.freeze(["starter_draft", "imported", "improved_draft", "production_version"]);
export const PARADISE_CONTENT_IMPORT_STATUSES = Object.freeze(["not_applicable", "pending_source_export", "captured"]);

const SOURCE_CAPTURED_AT = "2026-07-17T19:17:25.734Z";
const SOURCE_CAPTURED_BY_ACTOR_ID = "762858334440521739";
const SOURCE_GUILD_ID = "1419335632324657306";

function discordAttachment(containerId, id, name) {
  return Object.freeze({
    id,
    name,
    contentType: "image/png",
    size: 0,
    url: `https://cdn.discordapp.com/attachments/${containerId}/${id}/${name}`,
    proxyUrl: null
  });
}

function sourceLinks(payload, sourceUrl, assets) {
  const links = [sourceUrl, ...assets.map((asset) => asset.url)];
  for (const embed of payload.embeds) {
    links.push(embed.image?.url, embed.thumbnail?.url);
    for (const match of String(embed.description || "").matchAll(/https:\/\/[^\s<>]+/gi)) {
      links.push(match[0].replace(/[),.;!?]+$/, ""));
    }
  }
  return Object.freeze([...new Set(links.filter(Boolean))]);
}

function capturedSourceExport({
  name,
  templateKind,
  channelId,
  messageId,
  applicationName,
  messageCreatedAt,
  messageEditedAt = null,
  payload,
  assets,
  tags = []
}) {
  const sourceUrl = `https://discord.com/channels/${SOURCE_GUILD_ID}/${channelId}/${messageId}`;
  const metadata = Object.freeze({
    sourceGuildId: SOURCE_GUILD_ID,
    sourceChannelId: channelId,
    sourceMessageId: messageId,
    sourceUrl,
    author: Object.freeze({ username: applicationName, displayName: applicationName, bot: true }),
    application: Object.freeze({ name: applicationName }),
    webhook: Object.freeze({ name: applicationName }),
    messageCreatedAt,
    messageEditedAt,
    importedAt: SOURCE_CAPTURED_AT,
    importedByActorId: SOURCE_CAPTURED_BY_ACTOR_ID,
    language: "und",
    category: templateKind,
    tags: Object.freeze([
      "live-discord-read-only",
      "browser-verified-source",
      "secrets-free-source-export",
      "timestamp-derived-from-snowflake",
      ...tags
    ]),
    components: Object.freeze([]),
    links: sourceLinks(payload, sourceUrl, assets),
    assetReferences: Object.freeze(assets)
  });
  return Object.freeze({
    name,
    templateKind,
    stage: "imported",
    importStatus: "captured",
    deliveryMode: "bot",
    payload: Object.freeze(payload),
    metadata,
    capturedAt: SOURCE_CAPTURED_AT,
    capturedByActorId: SOURCE_CAPTURED_BY_ACTOR_ID
  });
}

const outfitsAssets = [
  discordAttachment("1402654195009716314", "1405201077413871698", "Ekran_goruntusu_2025-06-19_211952.png"),
  discordAttachment("1402654195009716314", "1405201076898238514", "Ekran_goruntusu_2025-06-19_212001.png"),
  discordAttachment("1402654195009716314", "1405201078471102644", "Ekran_goruntusu_2025-06-19_211914.png"),
  discordAttachment("1402654195009716314", "1405201077997142037", "Ekran_goruntusu_2025-06-19_211921.png"),
  discordAttachment("1402654195009716314", "1405201079473279147", "Ekran_goruntusu_2025-06-19_211837.png"),
  discordAttachment("1402654195009716314", "1405201079037202494", "Ekran_goruntusu_2025-06-19_211846.png"),
  discordAttachment("1402654195009716314", "1405201080433905695", "Ekran_goruntusu_2025-06-19_211747.png"),
  discordAttachment("1402654195009716314", "1405201080140300309", "Ekran_goruntusu_2025-06-19_211800.png"),
  discordAttachment("1402654195009716314", "1405201081050464447", "Ekran_goruntusu_2025-06-19_211656.png"),
  discordAttachment("1402654195009716314", "1405201080748347513", "Ekran_goruntusu_2025-06-19_211712.png")
];

const outfitsPayload = {
  content: "||[@everyone]||",
  embeds: [
    {
      color: 0x4f4f4f,
      description: "1 - __Grey Flower Outfit__\n- Grey Flowers Shirt Of Fieel Community: https://www.roblox.com/de/catalog/102373891173352/Grey-Flowers-Shirt-Of-Fieel-Community\n- Grey Flowers Pant Of Fieel Community: https://www.roblox.com/de/catalog/136285965063147/Grey-Flowers-Pant-Of-Fieel-Community",
      image: { url: outfitsAssets[0].url },
      thumbnail: { url: outfitsAssets[1].url }
    },
    {
      color: 0x006eff,
      description: "2 - __White&Blue Tiger Outfit__\n- White&Blue Tiger Shirt of Fieel Community: https://www.roblox.com/de/catalog/76552202104112/White-Blue-Tiger-Shirt-of-Fieel-Community\n- White&Blue Tiger Pant of Fieel Community: https://www.roblox.com/de/catalog/123448946204225/White-Blue-Tiger-Plant-of-Fieel-Community",
      image: { url: outfitsAssets[2].url },
      thumbnail: { url: outfitsAssets[3].url }
    },
    {
      color: 0x876000,
      description: "3 - __Yellow Tiger Outfit__\n- Yellow Tiger Shirt of Fieel Community: https://www.roblox.com/de/catalog/130862807538974/Yellow-Tiger-Shirt-of-Fieel-Community\n- Yellow Tiger Pant of Fieel Community: https://www.roblox.com/de/catalog/111607488127486/Yellow-Tiger-Pant-of-Fieel-Community",
      image: { url: outfitsAssets[4].url },
      thumbnail: { url: outfitsAssets[5].url }
    },
    {
      color: 0x004902,
      description: "4 - __Black&Green Outfit__\n- Black&Green Fieel Official Shirt: https://www.roblox.com/de/catalog/136026370247797/Black-Green-Fieel-Official-Shirt\n- Short Black Pant: https://www.roblox.com/de/catalog/79627770244243/Short-Black-Pant",
      image: { url: outfitsAssets[6].url },
      thumbnail: { url: outfitsAssets[7].url }
    },
    {
      color: 0x7b0000,
      description: "5 - __Recep ıvedık Style Outfit__\n- Recep ıvedık Style Fıeel Shırt: https://www.roblox.com/de/catalog/137554825139048/Recep-ved-k-Style-F-eel-Sh-rt\n- Short Black Pant: https://www.roblox.com/de/catalog/79627770244243/Short-Black-Pant",
      image: { url: outfitsAssets[8].url },
      thumbnail: { url: outfitsAssets[9].url }
    }
  ]
};

const capesAssets = [
  discordAttachment("1421246732750028840", "1424492245364506654", "Ekran_goruntusu_2025-06-15_174906.png"),
  discordAttachment("1421246732750028840", "1424492245708705862", "Ekran_goruntusu_2025-06-14_182845.png"),
  discordAttachment("1421246732750028840", "1424492246107029595", "Ekran_goruntusu_2025-06-14_182815.png"),
  discordAttachment("1421246732750028840", "1424492246421475521", "Ekran_goruntusu_2025-06-14_182743.png"),
  discordAttachment("1421246732750028840", "1424492246878781450", "Ekran_goruntusu_2025-06-14_182709.png"),
  discordAttachment("1421246732750028840", "1424492247293886494", "Ekran_goruntusu_2025-06-14_182632.png"),
  discordAttachment("1421246732750028840", "1424492248397123775", "Ekran_goruntusu_2025-06-14_182235.png"),
  discordAttachment("1421246732750028840", "1424492248032215341", "Ekran_goruntusu_2025-06-14_182539.png")
];

const capesPayload = {
  content: "||[@everyone]||",
  embeds: [
    { color: 0xa9a9a9, description: "## Grey Kaneki Cape\n### ID: 93555949341734\n- By: <@672483728630611973>", image: { url: capesAssets[0].url } },
    { color: 0x595959, description: "## Grey Cape\n### ID: 76453434637842\n- By: <@672483728630611973>", image: { url: capesAssets[1].url } },
    { color: 0xfffb00, description: "## Jojo's Jesus Cape\n### ID: 123459187910598\n- By: <@672483728630611973>", image: { url: capesAssets[2].url } },
    { color: 0xd20000, description: "## Red Spider Flower Cape\n### ID: 71983998158386\n- By: <@672483728630611973>", image: { url: capesAssets[3].url } },
    { color: 0x979797, description: "## Jojo's Cape\n### ID: 132434873230971\n- By: <@672483728630611973>", image: { url: capesAssets[4].url } },
    { color: 0xeaff00, description: "## Noob Cape\n### ID: 123588968498583\n- By: <@672483728630611973>", image: { url: capesAssets[5].url } },
    { color: 0x03a200, description: "## Dragon Cape\n### ID: 107387633291038\n- By: <@672483728630611973>", image: { url: capesAssets[6].url } },
    { color: 0xa60000, description: "## Kaneki Cape\n### ID: 93181831660454\n- By: <@1170055415896211476>", image: { url: capesAssets[7].url } }
  ]
};

export const PARADISE_CONTENT_SOURCE_EXPORTS = Object.freeze({
  outfits: capturedSourceExport({
    name: "Outfits",
    templateKind: "outfits",
    channelId: "1420404387645493268",
    messageId: "1421249039634141307",
    applicationName: "Fieel's Outfits",
    messageCreatedAt: "2025-09-26T21:36:16.579Z",
    payload: outfitsPayload,
    assets: outfitsAssets
  }),
  capes: capturedSourceExport({
    name: "Capes",
    templateKind: "capes",
    channelId: "1421524161695580210",
    messageId: "1424526371295592448",
    applicationName: "Capes",
    messageCreatedAt: "2025-10-05T22:39:13.337Z",
    messageEditedAt: "2025-10-06T11:54:00.000Z",
    payload: capesPayload,
    assets: capesAssets,
    tags: ["edited-time-minute-precision"]
  })
});

export const PARADISE_CONTENT_PRESETS = PARADISE_CONTENT_SOURCE_EXPORTS;

function studioError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, maxLength);
}

function snowflake(value) {
  const normalized = String(value || "").trim();
  return /^\d{16,22}$/.test(normalized) ? normalized : null;
}

function safeHttpsUrl(value) {
  const raw = text(value, 2048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeStoredUrl(value) {
  const normalized = safeHttpsUrl(value);
  if (!normalized) return null;
  const url = new URL(normalized);
  const hostname = url.hostname.toLowerCase();
  if (hostname === "cdn.discordapp.com" || hostname === "media.discordapp.net") {
    url.search = "";
    url.hash = "";
  }
  return url.toString();
}

function isoDate(value) {
  let date = null;
  if (value instanceof Date) date = value;
  else if (typeof value === "number" && Number.isFinite(value)) date = new Date(value);
  else if (typeof value === "string" && value.trim()) date = new Date(value);
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function boundedInteger(value, fallback = null) {
  const normalized = Number(value);
  return Number.isInteger(normalized) ? normalized : fallback;
}

function normalizeIdentity(raw = {}) {
  raw = raw && typeof raw === "object" ? raw : {};
  const id = snowflake(raw.id);
  const username = text(raw.username, 100);
  const globalName = text(raw.globalName || raw.global_name, 100);
  const displayName = text(raw.displayName || raw.display_name, 100);
  if (!id && !username && !globalName && !displayName) return null;
  return {
    id,
    username: username || null,
    globalName: globalName || null,
    displayName: displayName || null,
    bot: raw.bot === true
  };
}

function normalizeWebhookIdentity(raw = {}) {
  raw = raw && typeof raw === "object" ? raw : {};
  const id = snowflake(raw.id || raw.webhookId || raw.webhook_id);
  const name = text(raw.name || raw.webhookName || raw.webhook_name, 100);
  const applicationId = snowflake(raw.applicationId || raw.application_id);
  if (!id && !name && !applicationId) return null;
  return {
    id,
    name: name || null,
    applicationId
  };
}

function normalizeApplicationIdentity(raw = {}) {
  raw = raw && typeof raw === "object" ? raw : {};
  const id = snowflake(raw.id || raw.applicationId || raw.application_id);
  const name = text(raw.name || raw.applicationName || raw.application_name, 100);
  if (!id && !name) return null;
  return { id, name: name || null };
}

function normalizeEmoji(raw = {}) {
  raw = raw && typeof raw === "object" ? raw : {};
  const id = snowflake(raw.id);
  const name = text(raw.name, 100);
  if (!id && !name) return null;
  return { id, name: name || null, animated: raw.animated === true };
}

function normalizeComponent(raw = {}) {
  raw = raw && typeof raw === "object" ? raw : {};
  const component = {
    type: boundedInteger(raw.type, 0),
    style: boundedInteger(raw.style),
    label: text(raw.label, 80) || null,
    customId: text(raw.customId || raw.custom_id, 200) || null,
    url: safeHttpsUrl(raw.url),
    disabled: raw.disabled === true,
    emoji: normalizeEmoji(raw.emoji)
  };
  const children = Array.isArray(raw.components)
    ? raw.components.slice(0, 25).map(normalizeComponent)
    : [];
  if (children.length) component.components = children;
  const options = Array.isArray(raw.options)
    ? raw.options.slice(0, 25).map((option) => ({
      label: text(option?.label, 100),
      value: text(option?.value, 100),
      description: text(option?.description, 100) || null,
      emoji: normalizeEmoji(option?.emoji),
      default: option?.default === true
    })).filter((option) => option.label && option.value)
    : [];
  if (options.length) component.options = options;
  return component;
}

function normalizeAssetReference(raw = {}) {
  raw = raw && typeof raw === "object" ? raw : {};
  const url = safeStoredUrl(raw.url);
  const proxyUrl = safeStoredUrl(raw.proxyUrl || raw.proxy_url);
  if (!url && !proxyUrl) return null;
  return {
    id: snowflake(raw.id),
    name: text(raw.name || raw.filename, 256) || null,
    contentType: text(raw.contentType || raw.content_type, 100) || null,
    size: Math.max(0, boundedInteger(raw.size, 0)),
    url,
    proxyUrl
  };
}

function normalizeStringList(values, maxItems, maxLength) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => text(value, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function normalizeUrlList(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(safeStoredUrl).filter(Boolean))].slice(0, 100);
}

export function normalizeParadiseContentMetadata(raw = {}) {
  raw = raw && typeof raw === "object" ? raw : {};
  return {
    sourceGuildId: snowflake(raw.sourceGuildId || raw.source_guild_id),
    sourceChannelId: snowflake(raw.sourceChannelId || raw.source_channel_id),
    sourceMessageId: snowflake(raw.sourceMessageId || raw.source_message_id),
    sourceUrl: safeStoredUrl(raw.sourceUrl || raw.source_url),
    sourceChannelName: text(raw.sourceChannelName || raw.source_channel_name, 100) || null,
    sourceCategoryName: text(raw.sourceCategoryName || raw.source_category_name, 100) || null,
    author: normalizeIdentity(raw.author),
    application: normalizeApplicationIdentity(raw.application),
    webhook: normalizeWebhookIdentity(raw.webhook),
    messageCreatedAt: isoDate(raw.messageCreatedAt || raw.message_created_at),
    messageEditedAt: isoDate(raw.messageEditedAt || raw.message_edited_at),
    importedAt: isoDate(raw.importedAt || raw.imported_at),
    importedByActorId: snowflake(raw.importedByActorId || raw.imported_by_actor_id),
    language: text(raw.language, 20).toLowerCase() || "und",
    category: text(raw.category, 100) || null,
    tags: normalizeStringList(raw.tags, 25, 100),
    components: Array.isArray(raw.components) ? raw.components.slice(0, 25).map(normalizeComponent) : [],
    links: normalizeUrlList(raw.links),
    assetReferences: Array.isArray(raw.assetReferences || raw.asset_references)
      ? (raw.assetReferences || raw.asset_references).slice(0, 100).map(normalizeAssetReference).filter(Boolean)
      : []
  };
}

function normalizeColor(value) {
  if (typeof value === "string" && /^#?[0-9a-f]{6}$/i.test(value.trim())) return Number.parseInt(value.trim().replace(/^#/, ""), 16);
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 0xffffff ? number : 0x9b5cff;
}

function normalizeEmbed(raw = {}) {
  raw = raw && typeof raw === "object" ? raw : {};
  const fields = Array.isArray(raw.fields)
    ? raw.fields.slice(0, 25).map((field) => ({
      name: text(field?.name, 256),
      value: text(field?.value, 1024),
      inline: field?.inline === true
    })).filter((field) => field.name && field.value)
    : [];
  const embed = {
    color: normalizeColor(raw.color),
    title: text(raw.title, 256),
    description: text(raw.description, 4096),
    fields
  };
  const url = safeHttpsUrl(raw.url);
  const imageUrl = safeStoredUrl(raw.image?.url || raw.imageUrl);
  const thumbnailUrl = safeStoredUrl(raw.thumbnail?.url || raw.thumbnailUrl);
  const authorName = text(raw.author?.name || raw.authorName, 256);
  const authorUrl = safeHttpsUrl(raw.author?.url || raw.authorUrl);
  const authorIconUrl = safeStoredUrl(raw.author?.icon_url || raw.authorIconUrl);
  const footerText = text(raw.footer?.text || raw.footerText, 2048);
  const footerIconUrl = safeStoredUrl(raw.footer?.icon_url || raw.footerIconUrl);
  const timestamp = raw.timestamp && !Number.isNaN(Date.parse(raw.timestamp)) ? new Date(raw.timestamp).toISOString() : null;
  if (url) embed.url = url;
  if (imageUrl) embed.image = { url: imageUrl };
  if (thumbnailUrl) embed.thumbnail = { url: thumbnailUrl };
  if (authorName) embed.author = { name: authorName, ...(authorUrl ? { url: authorUrl } : {}), ...(authorIconUrl ? { icon_url: authorIconUrl } : {}) };
  if (footerText) embed.footer = { text: footerText, ...(footerIconUrl ? { icon_url: footerIconUrl } : {}) };
  if (timestamp) embed.timestamp = timestamp;
  return embed;
}

function embedCharacterCount(embed) {
  return (embed.title?.length || 0)
    + (embed.description?.length || 0)
    + (embed.author?.name?.length || 0)
    + (embed.footer?.text?.length || 0)
    + (embed.fields || []).reduce((sum, field) => sum + field.name.length + field.value.length, 0);
}

export function normalizeParadiseContentPayload(raw = {}) {
  raw = raw && typeof raw === "object" ? raw : {};
  const embeds = Array.isArray(raw.embeds) ? raw.embeds.slice(0, 10).map(normalizeEmbed) : [];
  if (embeds.reduce((sum, embed) => sum + embedCharacterCount(embed), 0) > 6000) {
    throw studioError("embed_character_limit", "Discord embeds may contain at most 6000 characters in total.");
  }
  const content = text(raw.content, 2000);
  if (!content && !embeds.length) throw studioError("content_required", "A message needs content or at least one embed.");
  return {
    content,
    embeds,
    allowedMentions: { parse: [], users: [], roles: [], repliedUser: false }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function payloadFingerprint(payload) {
  return JSON.stringify(normalizeParadiseContentPayload(payload));
}

function normalizeOriginalSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  try {
    return {
      payload: normalizeParadiseContentPayload(raw.payload || raw.current || raw),
      metadata: normalizeParadiseContentMetadata(raw.metadata),
      capturedAt: isoDate(raw.capturedAt || raw.captured_at),
      capturedByActorId: snowflake(raw.capturedByActorId || raw.captured_by_actor_id)
    };
  } catch {
    return null;
  }
}

function normalizeStage(value, fallback = "improved_draft") {
  return PARADISE_CONTENT_STAGES.includes(value) ? value : fallback;
}

function normalizeImportStatus(value, fallback = "not_applicable") {
  return PARADISE_CONTENT_IMPORT_STATUSES.includes(value) ? value : fallback;
}

function defaultStageForSource(source) {
  if (source === "discord_import" || source === "outfits" || source === "capes") return "imported";
  return "improved_draft";
}

function defaultImportStatusForSource(source) {
  if (source === "discord_import" || source === "outfits" || source === "capes") return "captured";
  return "not_applicable";
}

function assertStageTransition(previous, next, { rollback = false } = {}) {
  if (!previous || previous === next || rollback) return;
  const allowed = {
    starter_draft: new Set(["improved_draft"]),
    imported: new Set(["improved_draft"]),
    improved_draft: new Set(["production_version"]),
    production_version: new Set(["improved_draft"])
  };
  if (!allowed[previous]?.has(next)) throw studioError("content_stage_transition_invalid");
}

function normalizeVersion(version) {
  try {
    const savedAt = isoDate(version?.savedAt);
    const id = text(version?.id, 80);
    if (!id || !savedAt) return null;
    return {
      id,
      savedAt,
      actorId: snowflake(version?.actorId),
      stage: normalizeStage(version?.stage),
      importStatus: normalizeImportStatus(version?.importStatus),
      payload: normalizeParadiseContentPayload(version?.payload || {}),
      metadata: normalizeParadiseContentMetadata(version?.metadata)
    };
  } catch {
    return null;
  }
}

export function emptyParadiseContentStudioState(guildId = "") {
  return {
    schemaVersion: PARADISE_CONTENT_STUDIO_SCHEMA_VERSION,
    guildId: snowflake(guildId) || "",
    documents: {},
    updatedAt: null
  };
}

export function normalizeParadiseContentStudioState(raw, guildId = "") {
  const state = emptyParadiseContentStudioState(guildId);
  if (!raw || typeof raw !== "object") return state;
  const expectedGuildId = snowflake(guildId);
  const storedGuildId = snowflake(raw.guildId);
  if (expectedGuildId && storedGuildId && expectedGuildId !== storedGuildId) return state;
  state.guildId = expectedGuildId || storedGuildId || "";
  state.updatedAt = raw.updatedAt && !Number.isNaN(Date.parse(raw.updatedAt)) ? new Date(raw.updatedAt).toISOString() : null;
  for (const [id, document] of Object.entries(raw.documents && typeof raw.documents === "object" ? raw.documents : {})) {
    if (!/^[a-zA-Z0-9_-]{6,80}$/.test(id) || !document || typeof document !== "object") continue;
    try {
      const current = normalizeParadiseContentPayload(document.current || document);
      const source = ["new", "discord_import", "outfits", "capes"].includes(document.source) ? document.source : "new";
      let stage = normalizeStage(document.stage, defaultStageForSource(source));
      let importStatus = normalizeImportStatus(document.importStatus, defaultImportStatusForSource(source));
      const originalSnapshot = normalizeOriginalSnapshot(document.originalSnapshot);
      if (["discord_import", "outfits", "capes"].includes(source)) {
        importStatus = originalSnapshot ? "captured" : "pending_source_export";
        if (!originalSnapshot && stage === "imported") stage = "improved_draft";
      }
      state.documents[id] = {
        id,
        name: text(document.name, 100) || "Untitled message",
        current,
        stage,
        importStatus,
        metadata: normalizeParadiseContentMetadata(document.metadata),
        originalSnapshot,
        deliveryMode: PARADISE_CONTENT_DELIVERY_MODES.includes(document.deliveryMode) ? document.deliveryMode : "bot",
        targetChannelId: snowflake(document.targetChannelId),
        targetMessageId: snowflake(document.targetMessageId),
        canonicalGuildId: snowflake(document.canonicalGuildId),
        canonicalChannelId: snowflake(document.canonicalChannelId),
        canonicalMessageId: snowflake(document.canonicalMessageId),
        source,
        createdAt: isoDate(document.createdAt),
        updatedAt: isoDate(document.updatedAt),
        createdByActorId: snowflake(document.createdByActorId),
        updatedByActorId: snowflake(document.updatedByActorId),
        versions: Array.isArray(document.versions)
          ? document.versions.slice(-PARADISE_CONTENT_STUDIO_MAX_VERSIONS).map(normalizeVersion).filter(Boolean)
          : []
      };
    } catch {
      // A corrupt document is ignored; other documents remain recoverable.
    }
  }
  return state;
}

export function saveParadiseContentDocument(rawState, input = {}, { actorId, now = new Date(), idFactory = () => crypto.randomUUID(), rollback = false } = {}) {
  const state = normalizeParadiseContentStudioState(rawState, rawState?.guildId);
  const requestedId = text(input.id, 80);
  const id = requestedId || `content_${idFactory().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (!/^[a-zA-Z0-9_-]{6,80}$/.test(id)) throw studioError("invalid_document_id");
  const existing = state.documents[id] || null;
  if (requestedId && !existing && input.overwrite === true) throw studioError("document_not_found");
  if (existing && input.overwrite !== true) throw studioError("overwrite_confirmation_required");
  const savedAt = isoDate(now);
  if (!savedAt) throw studioError("invalid_saved_at");
  const payload = normalizeParadiseContentPayload(input.payload || input);
  const source = ["new", "discord_import", "outfits", "capes"].includes(input.source) ? input.source : existing?.source || "new";
  const stage = normalizeStage(input.stage, existing?.stage || defaultStageForSource(source));
  const importStatus = normalizeImportStatus(input.importStatus, existing?.importStatus || defaultImportStatusForSource(source));
  assertStageTransition(existing?.stage, stage, { rollback });
  const metadata = normalizeParadiseContentMetadata(input.metadata || existing?.metadata);
  const incomingOriginal = normalizeOriginalSnapshot(input.originalSnapshot);
  const originalSnapshot = existing?.originalSnapshot || incomingOriginal;
  if (["discord_import", "outfits", "capes"].includes(source) && (!originalSnapshot || importStatus !== "captured")) {
    throw studioError("original_snapshot_required");
  }
  if (stage === "imported" && originalSnapshot && payloadFingerprint(payload) !== payloadFingerprint(originalSnapshot.payload)) {
    throw studioError("imported_stage_requires_original_payload");
  }
  const version = {
    id: `v_${idFactory().replace(/[^a-zA-Z0-9_-]/g, "")}`,
    savedAt,
    actorId: snowflake(actorId),
    stage,
    importStatus,
    payload: clone(payload),
    metadata: clone(metadata)
  };
  const document = {
    id,
    name: text(input.name, 100) || existing?.name || "Untitled message",
    current: clone(payload),
    stage,
    importStatus,
    metadata,
    originalSnapshot: clone(originalSnapshot),
    deliveryMode: PARADISE_CONTENT_DELIVERY_MODES.includes(input.deliveryMode) ? input.deliveryMode : existing?.deliveryMode || "bot",
    targetChannelId: snowflake(input.targetChannelId) || existing?.targetChannelId || null,
    targetMessageId: snowflake(input.targetMessageId) || existing?.targetMessageId || null,
    canonicalGuildId: snowflake(input.canonicalGuildId) || existing?.canonicalGuildId || null,
    canonicalChannelId: snowflake(input.canonicalChannelId) || existing?.canonicalChannelId || null,
    canonicalMessageId: snowflake(input.canonicalMessageId) || existing?.canonicalMessageId || null,
    source,
    createdAt: existing?.createdAt || savedAt,
    updatedAt: savedAt,
    createdByActorId: existing?.createdByActorId || snowflake(actorId),
    updatedByActorId: snowflake(actorId),
    versions: [...(existing?.versions || []), version].slice(-PARADISE_CONTENT_STUDIO_MAX_VERSIONS)
  };
  state.documents[id] = document;
  state.updatedAt = savedAt;
  return { state, document: clone(document), version: clone(version) };
}

export function loadParadiseContentDocument(rawState, documentId) {
  const state = normalizeParadiseContentStudioState(rawState, rawState?.guildId);
  const document = state.documents[text(documentId, 80)];
  if (!document) throw studioError("document_not_found");
  return clone(document);
}

export function rollbackParadiseContentDocument(rawState, { documentId, versionId } = {}, options = {}) {
  const state = normalizeParadiseContentStudioState(rawState, rawState?.guildId);
  const document = state.documents[text(documentId, 80)];
  if (!document) throw studioError("document_not_found");
  const version = document.versions.find((item) => item.id === text(versionId, 80));
  if (!version) throw studioError("version_not_found");
  return saveParadiseContentDocument(state, {
    id: document.id,
    overwrite: true,
    name: document.name,
    payload: version.payload,
    stage: version.stage,
    importStatus: version.importStatus,
    metadata: version.metadata,
    originalSnapshot: document.originalSnapshot,
    deliveryMode: document.deliveryMode,
    targetChannelId: document.targetChannelId,
    targetMessageId: document.targetMessageId,
    canonicalGuildId: document.canonicalGuildId,
    canonicalChannelId: document.canonicalChannelId,
    canonicalMessageId: document.canonicalMessageId,
    source: document.source
  }, { ...options, rollback: true });
}

function messageComponents(message) {
  return Array.isArray(message.components)
    ? message.components.map((component) => typeof component?.toJSON === "function" ? component.toJSON() : component)
    : [];
}

function messageAssets(message) {
  if (Array.isArray(message.attachments)) return message.attachments;
  if (message.attachments?.values) return [...message.attachments.values()];
  return [];
}

function collectMetadataLinks(payload, components, assets) {
  const candidates = [];
  const appendTextLinks = (value) => {
    for (const match of String(value || "").matchAll(/https:\/\/[^\s<>]+/gi)) candidates.push(match[0].replace(/[),.;!?]+$/, ""));
  };
  appendTextLinks(payload.content);
  for (const embed of payload.embeds || []) {
    candidates.push(embed.url, embed.image?.url, embed.thumbnail?.url, embed.author?.url, embed.author?.icon_url, embed.footer?.icon_url);
    appendTextLinks(embed.description);
    for (const field of embed.fields || []) appendTextLinks(field.value);
  }
  const visit = (items) => {
    for (const component of items || []) {
      candidates.push(component?.url);
      visit(component?.components);
    }
  };
  visit(components);
  for (const asset of assets) candidates.push(asset.url, asset.proxyUrl || asset.proxy_url);
  return normalizeUrlList(candidates);
}

export function importParadiseDiscordMessage(message = {}, { name, importedByActorId, importedAt = new Date(), sourceGuildId } = {}) {
  message = message && typeof message === "object" ? message : {};
  const capturedAt = isoDate(importedAt);
  if (!capturedAt) throw studioError("invalid_imported_at");
  const resolvedGuildId = snowflake(message.guildId || message.guild_id || sourceGuildId);
  const resolvedChannelId = snowflake(message.channelId || message.channel_id);
  const resolvedMessageId = snowflake(message.id);
  const sourceUrl = safeStoredUrl(message.url) || (resolvedGuildId && resolvedChannelId && resolvedMessageId
    ? `https://discord.com/channels/${resolvedGuildId}/${resolvedChannelId}/${resolvedMessageId}`
    : null);
  const payload = normalizeParadiseContentPayload({
    content: message.content,
    embeds: Array.isArray(message.embeds) ? message.embeds.map((embed) => typeof embed?.toJSON === "function" ? embed.toJSON() : embed) : []
  });
  const components = messageComponents(message);
  const assets = messageAssets(message);
  const webhook = message.webhookId || message.webhook_id ? {
    id: message.webhookId || message.webhook_id,
    name: message.webhookName || message.author?.username,
    applicationId: message.applicationId || message.application_id
  } : null;
  const metadata = normalizeParadiseContentMetadata({
    sourceGuildId: resolvedGuildId,
    sourceChannelId: resolvedChannelId,
    sourceMessageId: resolvedMessageId,
    sourceUrl,
    sourceChannelName: message.channel?.name,
    sourceCategoryName: message.channel?.parent?.name,
    author: message.author,
    application: message.application || {
      id: message.applicationId || message.application_id,
      name: message.applicationName || message.application_name
    },
    webhook,
    messageCreatedAt: message.createdAt || message.created_at || message.createdTimestamp,
    messageEditedAt: message.editedAt || message.edited_at || message.editedTimestamp,
    importedAt: capturedAt,
    importedByActorId,
    language: message.language || "und",
    category: message.category || message.channel?.parent?.name,
    tags: message.tags || message.appliedTags,
    components,
    assetReferences: assets,
    links: collectMetadataLinks(payload, components, assets)
  });
  const originalSnapshot = {
    payload: clone(payload),
    metadata: clone(metadata),
    capturedAt,
    capturedByActorId: snowflake(importedByActorId)
  };
  return {
    name: text(name, 100) || `Imported message ${snowflake(message.id) || "draft"}`,
    payload,
    stage: "imported",
    importStatus: "captured",
    metadata,
    originalSnapshot,
    targetChannelId: snowflake(message.channelId || message.channel_id),
    targetMessageId: snowflake(message.id),
    source: "discord_import",
    deliveryMode: message.webhookId || message.webhook_id ? "managed_webhook" : "bot"
  };
}

export function paradiseContentPreset(name) {
  const id = text(name, 40).toLowerCase();
  const preset = PARADISE_CONTENT_PRESETS[id];
  if (!preset) throw studioError("preset_not_found");
  const payload = normalizeParadiseContentPayload(preset.payload);
  const metadata = normalizeParadiseContentMetadata(preset.metadata);
  const originalSnapshot = normalizeOriginalSnapshot({
    payload,
    metadata,
    capturedAt: preset.capturedAt,
    capturedByActorId: preset.capturedByActorId
  });
  if (!originalSnapshot) throw studioError("original_snapshot_required");
  return {
    name: preset.name,
    source: id,
    templateKind: preset.templateKind,
    stage: preset.stage,
    importStatus: preset.importStatus,
    importPending: false,
    originalSnapshot,
    metadata,
    deliveryMode: preset.deliveryMode,
    payload
  };
}

export function paradiseContentPreview(payload, mode = "desktop") {
  const normalized = normalizeParadiseContentPayload(payload);
  const previewMode = mode === "mobile" ? "mobile" : "desktop";
  return {
    mode: previewMode,
    viewportWidth: previewMode === "mobile" ? 360 : 720,
    payload: normalized
  };
}

export function assertSafeParadiseContentDelivery({ deliveryMode, webhookUrl } = {}) {
  const mode = PARADISE_CONTENT_DELIVERY_MODES.includes(deliveryMode) ? deliveryMode : "bot";
  if (webhookUrl) throw studioError("arbitrary_webhook_forbidden", "Content Studio never accepts webhook URLs or tokens.");
  return {
    deliveryMode: mode,
    managedWebhookOnly: mode === "managed_webhook",
    allowedMentions: { parse: [], users: [], roles: [], repliedUser: false }
  };
}
