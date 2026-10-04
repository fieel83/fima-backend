import { ChannelType, WebhookType } from "discord.js";
import {
  buildParadiseRestoreDryRun,
  paradiseBackupStateDigest,
  validateParadiseBackupEnvelope
} from "./paradiseBackupIntegrity.js";
import { FIMA_COMMUNITY_PRODUCTION_GUILD_ID } from "./communityGuildPolicy.js";
import { verifyParadiseProductionRebuildExecutionProof } from "./paradiseProductionRebuildPlan.js";
import { assertParadiseTestGuildMutation } from "./runtimeEnvironment.js";

const UNKNOWN_DISCORD_RESOURCE_CODES = new Set([10003, 10008, 10011, "10003", "10008", "10011"]);
const IMAGE_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);
const ARCHIVE_SENSITIVE_KEY = /(authorization|cookie|credential|password|secret|token)/i;
const ARCHIVE_URL_KEY = /(^|_)(url|uri|href)$/i;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

function discordCdnUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === "https:" && IMAGE_HOSTS.has(parsed.hostname) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function safeDiscordMessageUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === "https:"
      && ["discord.com", "www.discord.com"].includes(parsed.hostname)
      && /^\/channels\/\d{16,22}\/\d{16,22}\/\d{16,22}\/?$/.test(parsed.pathname)
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function safeArchiveUrl(value) {
  return discordCdnUrl(value) || safeDiscordMessageUrl(value);
}

function redactArchiveText(value) {
  return String(value || "").replace(URL_PATTERN, candidate => safeArchiveUrl(candidate) || "[unsafe-url-removed]");
}

function sanitizeArchiveValue(value, key = "") {
  if (ARCHIVE_SENSITIVE_KEY.test(key)) return undefined;
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    if (ARCHIVE_URL_KEY.test(key)) return safeArchiveUrl(value) || undefined;
    return redactArchiveText(value);
  }
  if (Array.isArray(value)) return value.map(item => sanitizeArchiveValue(item)).filter(item => item !== undefined);
  if (typeof value !== "object") return undefined;
  const serialized = typeof value.toJSON === "function" ? value.toJSON() : value;
  return Object.fromEntries(Object.entries(serialized).flatMap(([childKey, childValue]) => {
    const safeValue = sanitizeArchiveValue(childValue, childKey);
    return safeValue === undefined ? [] : [[childKey, safeValue]];
  }));
}

function finiteInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function values(collection) {
  if (!collection) return [];
  if (typeof collection.values === "function") return [...collection.values()];
  if (Array.isArray(collection)) return collection;
  return Object.values(collection);
}

function discordResourceIds(collection) {
  if (!collection) return [];
  const candidates = typeof collection.entries === "function" && !Array.isArray(collection)
    ? [...collection.entries()].map(([key, value]) => value?.id || key)
    : values(collection).map(value => value?.id || value);
  return [...new Set(candidates
    .map(value => String(value || "").trim())
    .filter(value => /^\d{16,22}$/.test(value)))];
}

function bitfield(value) {
  return String(value?.bitfield ?? value ?? "0");
}

function jsonValue(value) {
  if (value == null) return null;
  if (typeof value.toJSON === "function") return value.toJSON();
  return structuredClone(value);
}

function imageUrl(resource) {
  if (typeof resource !== "function") return null;
  return discordCdnUrl(resource({ extension: "png", size: 4096 })) || null;
}

function serializeOverwrite(overwrite) {
  return {
    id: String(overwrite.id || ""),
    type: Number(overwrite.type || 0),
    allow: bitfield(overwrite.allow),
    deny: bitfield(overwrite.deny)
  };
}

function serializeRole(role) {
  return {
    id: String(role.id || ""),
    name: String(role.name || ""),
    position: Number(role.position ?? role.rawPosition ?? 0),
    color: Number(role.color || 0),
    permissions: bitfield(role.permissions),
    managed: Boolean(role.managed),
    hoist: Boolean(role.hoist),
    mentionable: Boolean(role.mentionable),
    unicodeEmoji: role.unicodeEmoji || null,
    iconUrl: imageUrl(role.iconURL?.bind(role))
  };
}

function serializeChannel(channel) {
  return {
    id: String(channel.id || ""),
    name: String(channel.name || ""),
    type: Number(channel.type),
    parentId: channel.parentId ? String(channel.parentId) : null,
    position: Number(channel.rawPosition ?? channel.position ?? 0),
    topic: channel.topic ?? null,
    nsfw: Boolean(channel.nsfw),
    rateLimitPerUser: Number(channel.rateLimitPerUser || 0),
    bitrate: channel.bitrate == null ? null : Number(channel.bitrate),
    userLimit: channel.userLimit == null ? null : Number(channel.userLimit),
    rtcRegion: channel.rtcRegion ?? null,
    videoQualityMode: channel.videoQualityMode ?? null,
    defaultAutoArchiveDuration: channel.defaultAutoArchiveDuration ?? null,
    defaultThreadRateLimitPerUser: channel.defaultThreadRateLimitPerUser ?? null,
    defaultSortOrder: channel.defaultSortOrder ?? null,
    defaultForumLayout: channel.defaultForumLayout ?? null,
    defaultReactionEmoji: jsonValue(channel.defaultReactionEmoji),
    availableTags: values(channel.availableTags).map(tag => jsonValue(tag)),
    permissionOverwrites: values(channel.permissionOverwrites?.cache).map(serializeOverwrite)
  };
}

function serializeMessage(message) {
  return {
    id: String(message.id || ""),
    channelId: String(message.channelId || message.channel?.id || ""),
    authorId: String(message.author?.id || ""),
    content: String(message.content || ""),
    embeds: values(message.embeds).map(embed => jsonValue(embed)),
    components: values(message.components).map(component => jsonValue(component)),
    attachments: values(message.attachments).map(attachment => {
      const url = discordCdnUrl(attachment.url);
      return url ? {
        id: String(attachment.id || ""),
        name: attachment.name || null,
        url,
        contentType: attachment.contentType || null,
        description: attachment.description || null,
        spoiler: Boolean(attachment.spoiler)
      } : null;
    }).filter(Boolean),
    pinned: Boolean(message.pinned),
    createdTimestamp: Number(message.createdTimestamp || 0)
  };
}

function serializeArchiveMessage(message, guild, channel) {
  const guildId = String(guild?.id || "");
  const channelId = String(message.channelId || channel?.id || "");
  const messageId = String(message.id || "");
  const authorId = String(message.author?.id || "");
  const botUserId = String(guild?.client?.user?.id || guild?.members?.me?.id || "");
  const webhookId = String(message.webhookId || message.webhook_id || "");
  const sourceUrl = safeDiscordMessageUrl(message.url)
    || safeDiscordMessageUrl(`https://discord.com/channels/${guildId}/${channelId}/${messageId}`);
  const sourceKind = authorId && authorId === String(guild?.ownerId || "") ? "owner"
    : webhookId ? "webhook"
      : Boolean(message.author?.bot) || (botUserId && authorId === botUserId) ? "bot"
        : "member";
  return {
    id: messageId,
    guildId,
    channelId,
    channelName: String(channel?.name || message.channel?.name || ""),
    categoryId: channel?.parentId ? String(channel.parentId) : null,
    categoryName: channel?.parent?.name || null,
    author: {
      id: authorId,
      username: message.author?.username || null,
      globalName: message.author?.globalName || null,
      bot: Boolean(message.author?.bot),
      isGuildOwner: Boolean(authorId && authorId === String(guild?.ownerId || "")),
      isCurrentBot: Boolean(botUserId && authorId === botUserId)
    },
    webhook: webhookId ? {
      id: webhookId,
      applicationId: message.applicationId || message.application_id || null,
      name: message.webhookName || message.author?.username || null
    } : null,
    sourceKind,
    content: redactArchiveText(message.content),
    embeds: values(message.embeds).map(embed => sanitizeArchiveValue(jsonValue(embed))).filter(Boolean),
    components: values(message.components).map(component => sanitizeArchiveValue(jsonValue(component))).filter(Boolean),
    attachments: serializeMessage(message).attachments,
    reactions: values(message.reactions?.cache || message.reactions).map(reaction => ({
      emoji: {
        id: reaction.emoji?.id ? String(reaction.emoji.id) : null,
        name: reaction.emoji?.name || null,
        animated: Boolean(reaction.emoji?.animated)
      },
      count: Math.max(0, Number(reaction.count || 0)),
      me: Boolean(reaction.me)
    })).filter(reaction => reaction.emoji.id || reaction.emoji.name),
    pinned: Boolean(message.pinned),
    createdTimestamp: Number(message.createdTimestamp || 0),
    sourceUrl,
    restorePolicy: "content_studio_import_only",
    automaticRestore: false
  };
}

function hasArchiveContent(message) {
  return Boolean(message?.pinned)
    || values(message?.embeds).length > 0
    || values(message?.components).length > 0
    || values(message?.attachments).some(attachment => Boolean(discordCdnUrl(attachment?.url)))
    || values(message?.reactions?.cache || message?.reactions).length > 0;
}

function serializeAutoModRule(rule) {
  return {
    id: String(rule.id || ""),
    name: String(rule.name || ""),
    creatorId: rule.creatorId ? String(rule.creatorId) : null,
    eventType: finiteInteger(rule.eventType),
    triggerType: finiteInteger(rule.triggerType),
    triggerMetadata: jsonValue(rule.triggerMetadata) || {},
    actions: values(rule.actions).map(action => jsonValue(action)),
    enabled: Boolean(rule.enabled),
    exemptRoleIds: discordResourceIds(rule.exemptRoles),
    exemptChannelIds: discordResourceIds(rule.exemptChannels)
  };
}

function serializeWebhook(webhook) {
  return {
    id: String(webhook.id || ""),
    name: webhook.name || null,
    type: Number(webhook.type || 0),
    channelId: webhook.channelId ? String(webhook.channelId) : null,
    applicationId: webhook.applicationId ? String(webhook.applicationId) : null,
    userId: webhook.owner?.id || webhook.user?.id || null,
    avatarUrl: imageUrl(webhook.avatarURL?.bind(webhook))
  };
}

function collectReferenceIds(value, path = [], output = { messageIds: new Set(), channelIds: new Set(), roleIds: new Set() }) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectReferenceIds(item, [...path, String(index)], output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, item] of Object.entries(value)) {
    const nextPath = [...path, key];
    const normalizedKey = key.toLowerCase();
    const target = /messageids?$/.test(normalizedKey) ? output.messageIds
      : /channelids?$/.test(normalizedKey) ? output.channelIds
        : /roleids?$/.test(normalizedKey) ? output.roleIds
          : null;
    if (target) {
      const candidates = Array.isArray(item) ? item : item && typeof item === "object" ? Object.values(item) : [item];
      candidates.forEach(candidate => {
        const id = String(candidate || "").trim();
        if (/^\d{16,22}$/.test(id)) target.add(id);
      });
    }
    collectReferenceIds(item, nextPath, output);
  }
  return output;
}

function scopedGuildState(state, guildId) {
  const config = structuredClone(state?.guildConfigs?.[guildId] || (guildId ? state?.config : {}) || {});
  const tickets = values(state?.supportTickets?.[guildId])
    .filter(ticket => ticket && ticket.status !== "deleted")
    .map(ticket => structuredClone(ticket));
  return {
    config,
    references: collectReferenceIds(config),
    tickets,
    legacyTranscripts: Object.fromEntries(Object.entries(state?.transcripts || {})
      .filter(([key, transcript]) => String(transcript?.guildId || "") === guildId || String(key).includes(`:${guildId}:`))
      .map(([key, transcript]) => [key, structuredClone(transcript)]))
  };
}

async function fetchPinnedMessages(messageManager) {
  if (typeof messageManager?.fetchPins !== "function") {
    return values(await messageManager.fetchPinned());
  }
  const collected = new Map();
  let before;
  for (let page = 0; page < 100; page += 1) {
    const response = await messageManager.fetchPins(before ? { before } : {});
    const items = values(response?.items);
    let oldestTimestamp = Number.POSITIVE_INFINITY;
    let added = 0;
    for (const item of items) {
      const message = item?.message;
      if (!message?.id) continue;
      if (!collected.has(String(message.id))) added += 1;
      collected.set(String(message.id), message);
      const timestamp = Number(item?.pinnedTimestamp);
      if (Number.isFinite(timestamp)) oldestTimestamp = Math.min(oldestTimestamp, timestamp);
    }
    if (!response?.hasMore) break;
    if (!items.length || !added || !Number.isFinite(oldestTimestamp)) {
      const error = new Error("pinned_message_pagination_stalled");
      error.code = "pinned_message_pagination_stalled";
      throw error;
    }
    before = new Date(oldestTimestamp - 1);
  }
  return [...collected.values()];
}

async function fetchMessageCollections(guild, mappedMessageIds, captureErrors) {
  const botUserId = String(guild.client?.user?.id || guild.members?.me?.id || "");
  const channels = values(guild.channels?.cache).filter(channel => !channel.isThread?.() && channel.isTextBased?.());
  const collected = new Map();
  const contentArchive = new Map();
  const unresolved = new Set(mappedMessageIds);
  for (const channel of channels) {
    if ((!channel.messages?.fetchPins && !channel.messages?.fetchPinned) || !channel.messages?.fetch) {
      captureErrors.push({ scope: "canonicalMessages", channelId: channel.id, code: "message_fetch_api_unavailable" });
      captureErrors.push({ scope: "contentArchive", channelId: channel.id, code: "message_fetch_api_unavailable" });
      continue;
    }
    try {
      const [pinned, recent] = await Promise.all([
        fetchPinnedMessages(channel.messages),
        channel.messages.fetch({ limit: 100 })
      ]);
      for (const message of [...values(pinned), ...values(recent)]) {
        if (hasArchiveContent(message)) {
          contentArchive.set(String(message.id), serializeArchiveMessage(message, guild, channel));
        }
        if ((message.pinned && (!botUserId || message.author?.id === botUserId)) || unresolved.has(String(message.id))) {
          collected.set(String(message.id), serializeMessage(message));
          unresolved.delete(String(message.id));
        }
      }
    } catch (error) {
      captureErrors.push({ scope: "canonicalMessages", channelId: channel.id, code: String(error?.code || "message_fetch_failed") });
      captureErrors.push({ scope: "contentArchive", channelId: channel.id, code: String(error?.code || "message_fetch_failed") });
    }
  }
  for (const messageId of [...unresolved]) {
    let resolved = false;
    for (const channel of channels) {
      try {
        const message = await channel.messages.fetch(messageId);
        collected.set(messageId, serializeMessage(message));
        resolved = true;
        break;
      } catch (error) {
        if (!UNKNOWN_DISCORD_RESOURCE_CODES.has(error?.code)) {
          captureErrors.push({ scope: "canonicalMessages", channelId: channel.id, messageId, code: String(error?.code || "mapped_message_fetch_failed") });
          break;
        }
      }
    }
    if (!resolved) captureErrors.push({ scope: "canonicalMessages", messageId, code: "mapped_message_not_found", informational: true });
  }
  return {
    canonicalMessages: [...collected.values()].sort((left, right) => left.createdTimestamp - right.createdTimestamp),
    contentArchive: [...contentArchive.values()].sort((left, right) => left.createdTimestamp - right.createdTimestamp)
  };
}

export async function captureParadiseGuildBackupSnapshot(guild, { state = {} } = {}) {
  const captureErrors = [];
  const capabilities = {
    version: 2,
    guildIdentity: Boolean(guild?.id),
    roles: false,
    memberRoles: false,
    channels: false,
    canonicalMessages: false,
    contentArchive: false,
    autoModRules: false,
    webhooks: false,
    tickets: Boolean(state && typeof state === "object")
  };
  const scopedState = scopedGuildState(state, String(guild?.id || ""));

  let channels = [];
  let roles = [];
  let members = [];
  let autoModRules = [];
  let webhooks = [];
  let canonicalMessages = [];
  let contentArchive = [];
  try {
    await guild.channels.fetch();
    channels = values(guild.channels.cache).filter(channel => !channel.isThread?.());
    capabilities.channels = true;
  } catch (error) {
    captureErrors.push({ scope: "channels", code: String(error?.code || "channel_fetch_failed") });
  }
  try {
    await guild.roles.fetch();
    roles = values(guild.roles.cache);
    capabilities.roles = true;
  } catch (error) {
    captureErrors.push({ scope: "roles", code: String(error?.code || "role_fetch_failed") });
  }
  try {
    let fetched;
    let memberCollectionComplete = false;
    try {
      fetched = await guild.members.fetch();
      memberCollectionComplete = true;
    } catch (error) {
      const cachedMembers = values(guild?.members?.cache);
      const expectedMemberCount = Number(guild?.memberCount);
      const completeCache = Number.isInteger(expectedMemberCount)
        && expectedMemberCount >= 0
        && cachedMembers.length >= expectedMemberCount;
      if (!completeCache) throw error;
      fetched = guild.members.cache;
      memberCollectionComplete = true;
      captureErrors.push({
        scope: "memberRoles",
        code: "member_fetch_reused_complete_cache",
        informational: true
      });
    }
    const capturedMembers = new Map(values(fetched?.size != null ? fetched : guild.members.cache)
      .map(member => [String(member?.id || member?.user?.id || ""), member])
      .filter(([memberId]) => memberId));
    const requiredMembers = [
      ["owner", String(guild?.ownerId || "")],
      ["bot", String(guild?.client?.user?.id || guild?.members?.me?.id || "")]
    ];
    for (const [kind, memberId] of requiredMembers) {
      if (!memberId) {
        captureErrors.push({ scope: "memberRoles", code: `${kind}_member_identity_missing` });
        continue;
      }
      try {
        const member = capturedMembers.get(memberId)
          || guild.members.cache?.get?.(memberId)
          || await guild.members.fetch(memberId);
        const capturedId = String(member?.id || member?.user?.id || "");
        if (capturedId !== memberId) throw Object.assign(new Error("member_not_captured"), { code: `${kind}_member_not_captured` });
        capturedMembers.set(memberId, member);
      } catch (error) {
        captureErrors.push({ scope: "memberRoles", code: String(error?.code || `${kind}_member_fetch_failed`) });
      }
    }
    members = [...capturedMembers.values()];
    capabilities.memberRoles = memberCollectionComplete
      && !captureErrors.some(error => error.scope === "memberRoles" && !error.informational);
  } catch (error) {
    captureErrors.push({ scope: "memberRoles", code: String(error?.code || "member_fetch_failed") });
  }
  try {
    const fetched = await guild.autoModerationRules.fetch();
    autoModRules = values(fetched);
    const invalidRules = autoModRules.filter(rule => finiteInteger(rule.eventType) == null || finiteInteger(rule.triggerType) == null);
    capabilities.autoModRules = invalidRules.length === 0;
    if (invalidRules.length) {
      captureErrors.push({ scope: "autoModRules", code: "automod_enum_invalid", ruleIds: invalidRules.map(rule => String(rule.id || "")) });
    }
  } catch (error) {
    captureErrors.push({ scope: "autoModRules", code: String(error?.code || "automod_fetch_failed") });
  }
  try {
    const fetched = await guild.fetchWebhooks();
    webhooks = values(fetched);
    capabilities.webhooks = true;
  } catch (error) {
    captureErrors.push({ scope: "webhooks", code: String(error?.code || "webhook_fetch_failed") });
  }
  try {
    const messages = await fetchMessageCollections(guild, scopedState.references.messageIds, captureErrors);
    canonicalMessages = messages.canonicalMessages;
    contentArchive = messages.contentArchive;
    capabilities.canonicalMessages = !captureErrors.some(error => error.scope === "canonicalMessages" && !error.informational);
    capabilities.contentArchive = !captureErrors.some(error => error.scope === "contentArchive" && !error.informational);
  } catch (error) {
    captureErrors.push({ scope: "canonicalMessages", code: String(error?.code || "canonical_message_capture_failed") });
    captureErrors.push({ scope: "contentArchive", code: String(error?.code || "content_archive_capture_failed") });
  }

  const serializedChannels = channels.map(serializeChannel);
  return {
    capturedAt: new Date().toISOString(),
    guildId: String(guild.id),
    guildName: String(guild.name || ""),
    guild: {
      id: String(guild.id),
      name: String(guild.name || ""),
      description: guild.description ?? null,
      ownerId: guild.ownerId ? String(guild.ownerId) : null,
      preferredLocale: guild.preferredLocale ?? null,
      verificationLevel: guild.verificationLevel ?? null,
      explicitContentFilter: guild.explicitContentFilter ?? null,
      defaultMessageNotifications: guild.defaultMessageNotifications ?? null,
      afkChannelId: guild.afkChannelId ? String(guild.afkChannelId) : null,
      afkTimeout: guild.afkTimeout ?? null,
      systemChannelId: guild.systemChannelId ? String(guild.systemChannelId) : null,
      rulesChannelId: guild.rulesChannelId ? String(guild.rulesChannelId) : null,
      publicUpdatesChannelId: guild.publicUpdatesChannelId ? String(guild.publicUpdatesChannelId) : null,
      premiumProgressBarEnabled: guild.premiumProgressBarEnabled ?? null,
      iconUrl: imageUrl(guild.iconURL?.bind(guild)),
      bannerUrl: imageUrl(guild.bannerURL?.bind(guild)),
      splashUrl: imageUrl(guild.splashURL?.bind(guild))
    },
    categories: serializedChannels.filter(channel => channel.type === ChannelType.GuildCategory),
    channels: serializedChannels.filter(channel => channel.type !== ChannelType.GuildCategory),
    roles: roles.map(serializeRole),
    memberRoles: members.map(member => ({
      memberId: String(member.id || member.user?.id || ""),
      roleIds: values(member.roles?.cache).map(role => String(role.id || role)).filter(roleId => roleId !== String(guild.id))
    })).filter(member => member.memberId),
    canonicalMessages,
    contentArchive,
    autoModRules: autoModRules.map(serializeAutoModRule),
    webhooks: webhooks.map(serializeWebhook),
    tickets: scopedState.tickets,
    legacyTranscripts: scopedState.legacyTranscripts,
    guildConfig: scopedState.config,
    guildConfigReferences: {
      messageIds: [...scopedState.references.messageIds],
      channelIds: [...scopedState.references.channelIds],
      roleIds: [...scopedState.references.roleIds]
    },
    restoreCapabilities: capabilities,
    captureErrors
  };
}

export function paradiseRestoreConfirmation(backup) {
  return `RESTORE TEST ${String(backup?.guildId || backup?.guild?.id || "")} ${String(backup?.integrity?.digest || "").slice(0, 12).toUpperCase()}`;
}

export function paradiseProductionRestoreConfirmation(backup) {
  return `RESTORE FT COMMUNITY ${FIMA_COMMUNITY_PRODUCTION_GUILD_ID} ${paradiseBackupStateDigest(backup)}`;
}

function findByIdOrName(items, desired) {
  return items.find(item => String(item.id || "") === String(desired.id || ""))
    || items.find(item => String(item.name || "") === String(desired.name || ""))
    || items.find(item => String(item.name || "").normalize("NFKC").toLowerCase() === String(desired.name || "").normalize("NFKC").toLowerCase())
    || null;
}

async function resolveDiscordImage(url) {
  const safeUrl = discordCdnUrl(url);
  if (!safeUrl) return null;
  const parsed = new URL(safeUrl);
  const response = await fetch(parsed, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw Object.assign(new Error("restore_image_fetch_failed"), { code: "restore_image_fetch_failed" });
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > 10 * 1024 * 1024) throw Object.assign(new Error("restore_image_too_large"), { code: "restore_image_too_large" });
  return body;
}

function mapId(id, ...maps) {
  const value = String(id || "");
  for (const map of maps) if (map.has(value)) return map.get(value);
  return value || null;
}

function autoModRestoreError(code, operation, index) {
  const error = new Error(code);
  error.code = code;
  error.context = Object.freeze({
    operation,
    resourceKind: "auto_mod_rule",
    index: Number(index)
  });
  return error;
}

async function runAutoModRestoreOperation(operation, index, callback) {
  try {
    return await callback();
  } catch (error) {
    if (error?.code === "restore_automod_action_channel_missing") throw error;
    throw autoModRestoreError(`restore_automod_${operation}_failed`, operation, index);
  }
}

function roleEditPayload(role) {
  return {
    name: role.name,
    color: Number(role.color || 0),
    permissions: BigInt(role.permissions || "0"),
    hoist: Boolean(role.hoist),
    mentionable: Boolean(role.mentionable),
    unicodeEmoji: role.unicodeEmoji || null
  };
}

function channelPayload(channel, roleMap, channelMap) {
  const payload = {
    name: channel.name,
    type: Number(channel.type),
    parent: channel.parentId ? mapId(channel.parentId, channelMap) : null,
    permissionOverwrites: (channel.permissionOverwrites || []).map(overwrite => ({
      id: mapId(overwrite.id, roleMap),
      type: Number(overwrite.type || 0),
      allow: BigInt(overwrite.allow || "0"),
      deny: BigInt(overwrite.deny || "0")
    }))
  };
  for (const key of ["topic", "nsfw", "rateLimitPerUser", "bitrate", "userLimit", "rtcRegion", "videoQualityMode", "defaultAutoArchiveDuration", "defaultThreadRateLimitPerUser", "defaultSortOrder", "defaultForumLayout", "defaultReactionEmoji", "availableTags"]) {
    if (channel[key] !== undefined && channel[key] !== null) payload[key] = channel[key];
  }
  return payload;
}

async function applyChannelPositions({ guild, desiredChannels, channelMap, reason }) {
  if (typeof guild?.channels?.setPositions !== "function") {
    throw Object.assign(new Error("restore_channel_position_api_unavailable"), {
      code: "restore_channel_position_api_unavailable"
    });
  }
  const positions = desiredChannels
    .map((channel, sourceIndex) => ({
      channel: mapId(channel.id, channelMap),
      position: Number(channel.position || 0),
      sourceIndex
    }))
    .filter(item => item.channel)
    .sort((left, right) => left.position - right.position || left.sourceIndex - right.sourceIndex)
    .map(({ channel, position }) => ({ channel, position }));
  if (positions.length !== desiredChannels.length) {
    throw Object.assign(new Error("restore_channel_position_mapping_incomplete"), {
      code: "restore_channel_position_mapping_incomplete"
    });
  }
  if (positions.length > 0) await guild.channels.setPositions(positions, reason);
  await guild.channels.fetch();
}

function autoModPayload(rule, roleMap, channelMap, {
  validRoleIds,
  validChannelIds,
  report
} = {}) {
  const exemptRoles = [];
  for (const sourceId of rule.exemptRoleIds || []) {
    const mappedId = mapId(sourceId, roleMap);
    if (mappedId && validRoleIds.has(String(mappedId))) exemptRoles.push(String(mappedId));
    else report.autoModRules.droppedExemptRoles += 1;
  }
  const exemptChannels = [];
  for (const sourceId of rule.exemptChannelIds || []) {
    const mappedId = mapId(sourceId, channelMap);
    if (mappedId && validChannelIds.has(String(mappedId))) exemptChannels.push(String(mappedId));
    else report.autoModRules.droppedExemptChannels += 1;
  }
  return {
    name: rule.name,
    eventType: Number(rule.eventType),
    triggerType: Number(rule.triggerType),
    triggerMetadata: rule.triggerMetadata || {},
    actions: (rule.actions || []).map((action, actionIndex) => {
      const clone = structuredClone(action);
      if (clone.metadata?.channelId) {
        const mappedChannelId = mapId(clone.metadata.channelId, channelMap);
        if (!mappedChannelId || !validChannelIds.has(String(mappedChannelId))) {
          throw autoModRestoreError("restore_automod_action_channel_missing", "payload", actionIndex);
        }
        clone.metadata.channelId = String(mappedChannelId);
      }
      return clone;
    }),
    enabled: Boolean(rule.enabled),
    exemptRoles: [...new Set(exemptRoles)],
    exemptChannels: [...new Set(exemptChannels)]
  };
}

function remapReferences(value, maps) {
  if (Array.isArray(value)) return value.map(item => remapReferences(item, maps));
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return value;
    return mapId(value, maps.messageMap, maps.channelMap, maps.roleMap) || value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapReferences(item, maps)]));
}

export async function restoreParadiseGuildBackup({
  guild,
  backup,
  confirmation,
  allowedGuildId,
  productionAuthorization = null,
  currentState = {},
  persistRestoredState = null,
  reason = "FIMA verified test-guild backup restore"
} = {}) {
  const guildId = String(guild?.id || "");
  if (guildId !== String(allowedGuildId || "")) throw Object.assign(new Error("restore_target_not_allowlisted"), { code: "restore_target_not_allowlisted" });
  const validation = validateParadiseBackupEnvelope(backup);
  if (!validation.valid) throw Object.assign(new Error(validation.code), { code: validation.code, validation });
  const backupGuildId = String(backup?.guildId || backup?.guild?.id || "");
  const isProduction = guildId === FIMA_COMMUNITY_PRODUCTION_GUILD_ID;
  if (isProduction) {
    if (backupGuildId !== FIMA_COMMUNITY_PRODUCTION_GUILD_ID
        || String(allowedGuildId || "") !== FIMA_COMMUNITY_PRODUCTION_GUILD_ID) {
      throw Object.assign(new Error("restore_production_target_mismatch"), { code: "restore_production_target_mismatch" });
    }
    const expectedConfirmation = paradiseProductionRestoreConfirmation(backup);
    if (String(confirmation || "").trim().toUpperCase() !== expectedConfirmation.toUpperCase()) {
      throw Object.assign(new Error("restore_confirmation_mismatch"), { code: "restore_confirmation_mismatch" });
    }
    const authorization = productionAuthorization || {};
    let proof;
    try {
      proof = verifyParadiseProductionRebuildExecutionProof(authorization.executionProof, {
        secret: authorization.executionProofSecret,
        guildId,
        mode: authorization.mode,
        backupDigest: paradiseBackupStateDigest(backup),
        planId: authorization.planId,
        nowMs: authorization.nowMs ?? Date.now()
      });
    } catch {
      throw Object.assign(new Error("production_rebuild_execution_proof_invalid"), {
        code: "production_rebuild_execution_proof_invalid"
      });
    }
    if (!proof.ok || authorization.mode !== "community") {
      const code = proof.ok ? "production_rebuild_execution_proof_scope_mismatch" : proof.code;
      throw Object.assign(new Error(code), { code });
    }
  } else {
    assertParadiseTestGuildMutation({ guildId, operation: "discord_backup_restore" });
    const expectedConfirmation = paradiseRestoreConfirmation(backup);
    if (String(confirmation || "").trim().toUpperCase() !== expectedConfirmation.toUpperCase()) {
      throw Object.assign(new Error("restore_confirmation_mismatch"), { code: "restore_confirmation_mismatch", expectedConfirmation });
    }
  }
  const currentSnapshot = await captureParadiseGuildBackupSnapshot(guild, { state: currentState });
  const dryRun = buildParadiseRestoreDryRun({
    backup,
    currentSnapshot,
    expectedGuildId: guildId,
    allowedGuildId
  });
  if (!dryRun.canRestore) throw Object.assign(new Error(dryRun.code), { code: dryRun.code, dryRun });
  const immediateValidation = validateParadiseBackupEnvelope(backup);
  if (!immediateValidation.valid) throw Object.assign(new Error(immediateValidation.code), { code: immediateValidation.code });

  const roleMap = new Map([[String(backup.guildId), guildId]]);
  const channelMap = new Map();
  const messageMap = new Map();
  const report = {
    status: "restoring",
    guildId,
    backupDigest: backup.integrity.digest,
    startedAt: new Date().toISOString(),
    roles: { created: 0, updated: 0, removed: 0, alreadyAbsent: 0, protected: [] },
    channels: { created: 0, updated: 0, removed: 0, alreadyAbsent: 0 },
    memberRoles: { updated: 0, missingMembers: [] },
    canonicalMessages: { restored: 0, removed: 0, matched: 0, missingChannels: [] },
    autoModRules: { created: 0, updated: 0, removed: 0, droppedExemptRoles: 0, droppedExemptChannels: 0 },
    webhooks: { created: 0, updated: 0, removed: 0, protected: [] }
  };
  const me = guild.members.me || await guild.members.fetchMe();
  const ownerId = String(guild.ownerId || backup.guild?.ownerId || "");
  const protectedMemberIds = new Set([ownerId, String(me?.id || "")].filter(Boolean));

  await guild.roles.fetch();
  for (const desired of backup.roles || []) {
    if (desired.managed) {
      const current = findByIdOrName(values(guild.roles.cache), desired);
      if (current) roleMap.set(String(desired.id), String(current.id));
      report.roles.protected.push({ sourceId: desired.id, reason: "managed_role" });
      continue;
    }
    if (String(desired.id) === guildId || desired.name === "@everyone") {
      const everyone = guild.roles.everyone || guild.roles.cache.get(guildId);
      roleMap.set(String(desired.id), String(everyone.id));
      if (everyone?.setPermissions) {
        await everyone.setPermissions(BigInt(desired.permissions || "0"), reason);
        report.roles.updated += 1;
      }
      continue;
    }
    let role = findByIdOrName(values(guild.roles.cache).filter(item => !item.managed), desired);
    const icon = await resolveDiscordImage(desired.iconUrl).catch(() => null);
    const payload = { ...roleEditPayload(desired), reason };
    if (icon) payload.icon = icon;
    if (!role) {
      role = await guild.roles.create(payload);
      report.roles.created += 1;
    } else if (role.editable !== false && Number(role.position || 0) < Number(me.roles?.highest?.position || Infinity)) {
      await role.edit(payload);
      report.roles.updated += 1;
    }
    roleMap.set(String(desired.id), String(role.id));
    if (role.setPosition && Number(desired.position) < Number(me.roles?.highest?.position || Infinity)) {
      await role.setPosition(Number(desired.position), { reason }).catch(() => null);
    }
  }

  await guild.channels.fetch();
  const desiredChannels = [...(backup.categories || []), ...(backup.channels || [])];
  for (const desired of desiredChannels.filter(channel => Number(channel.type) === ChannelType.GuildCategory)) {
    let channel = findByIdOrName(values(guild.channels.cache).filter(item => Number(item.type) === Number(desired.type)), desired);
    const payload = { ...channelPayload(desired, roleMap, channelMap), reason };
    if (!channel) {
      channel = await guild.channels.create(payload);
      report.channels.created += 1;
    } else {
      await channel.edit(payload);
      report.channels.updated += 1;
    }
    channelMap.set(String(desired.id), String(channel.id));
  }
  for (const desired of desiredChannels.filter(channel => Number(channel.type) !== ChannelType.GuildCategory)) {
    let channel = findByIdOrName(values(guild.channels.cache).filter(item => Number(item.type) === Number(desired.type)), desired);
    const payload = { ...channelPayload(desired, roleMap, channelMap), reason };
    if (!channel) {
      channel = await guild.channels.create(payload);
      report.channels.created += 1;
    } else {
      await channel.edit(payload);
      report.channels.updated += 1;
    }
    channelMap.set(String(desired.id), String(channel.id));
  }

  await guild.members.fetch();
  for (const desired of backup.memberRoles || []) {
    const memberId = String(desired.memberId || "");
    const member = guild.members.cache.get(memberId) || await guild.members.fetch(memberId).catch(() => null);
    if (!member) {
      report.memberRoles.missingMembers.push(memberId);
      continue;
    }
    if (protectedMemberIds.has(memberId)) {
      report.roles.protected.push({ memberId, reason: memberId === ownerId ? "owner_access_preserved" : "bot_access_preserved" });
    }
    const preserveEveryCurrentRole = protectedMemberIds.has(memberId);
    const preserved = values(member.roles?.cache)
      .filter(role => preserveEveryCurrentRole || role.managed || role.editable === false || Number(role.position || 0) >= Number(me.roles?.highest?.position || Infinity))
      .map(role => String(role.id));
    const desiredIds = (desired.roleIds || []).map(id => mapId(id, roleMap)).filter(id => id && id !== guildId);
    await member.roles.set([...new Set([...preserved, ...desiredIds])], reason);
    report.memberRoles.updated += 1;
  }

  const desiredRoleIds = new Set((backup.roles || []).map(role => mapId(role.id, roleMap)).filter(Boolean));
  for (const role of values(guild.roles.cache).sort((left, right) => Number(left.position || 0) - Number(right.position || 0))) {
    if (role.id === guildId || role.managed || desiredRoleIds.has(String(role.id))) continue;
    if (role.editable === false || Number(role.position || 0) >= Number(me.roles?.highest?.position || Infinity)) {
      report.roles.protected.push({ currentId: role.id, reason: "bot_hierarchy" });
      continue;
    }
    if (values(role.members).some(member => protectedMemberIds.has(String(member.id)))) {
      report.roles.protected.push({ currentId: role.id, reason: "owner_or_bot_access" });
      continue;
    }
    try {
      await role.delete(reason);
      report.roles.removed += 1;
    } catch (error) {
      if (!UNKNOWN_DISCORD_RESOURCE_CODES.has(error?.code)) throw error;
      guild.roles.cache.delete(role.id);
      report.roles.alreadyAbsent += 1;
    }
  }

  const desiredChannelIds = new Set(desiredChannels.map(channel => mapId(channel.id, channelMap)).filter(Boolean));
  for (const channel of values(guild.channels.cache)
    .filter(item => !item.isThread?.() && !desiredChannelIds.has(String(item.id)))
    .sort((left, right) => Number(Boolean(left.parentId)) - Number(Boolean(right.parentId)))) {
    try {
      await channel.delete(reason);
      report.channels.removed += 1;
    } catch (error) {
      if (!UNKNOWN_DISCORD_RESOURCE_CODES.has(error?.code)) throw error;
      guild.channels.cache.delete(channel.id);
      report.channels.alreadyAbsent += 1;
    }
  }

  // Channel position edits are intentionally deferred until every channel has
  // its final parent and stale channels are gone. Discord reindexes siblings on
  // each individual edit; one bulk request makes backup restoration stable and
  // prevents a permanent position-only reconciliation loop.
  await applyChannelPositions({ guild, desiredChannels, channelMap, reason });

  const guildEdit = {
    name: backup.guild?.name || backup.guildName,
    description: backup.guild?.description ?? null,
    preferredLocale: backup.guild?.preferredLocale,
    verificationLevel: backup.guild?.verificationLevel,
    explicitContentFilter: backup.guild?.explicitContentFilter,
    defaultMessageNotifications: backup.guild?.defaultMessageNotifications,
    afkChannel: mapId(backup.guild?.afkChannelId, channelMap),
    afkTimeout: backup.guild?.afkTimeout,
    systemChannel: mapId(backup.guild?.systemChannelId, channelMap),
    rulesChannel: mapId(backup.guild?.rulesChannelId, channelMap),
    publicUpdatesChannel: mapId(backup.guild?.publicUpdatesChannelId, channelMap),
    premiumProgressBarEnabled: backup.guild?.premiumProgressBarEnabled,
    reason
  };
  for (const [key, sourceKey] of [["icon", "iconUrl"], ["banner", "bannerUrl"], ["splash", "splashUrl"]]) {
    const image = await resolveDiscordImage(backup.guild?.[sourceKey]).catch(() => null);
    if (image) guildEdit[key] = image;
  }
  await guild.edit(Object.fromEntries(Object.entries(guildEdit).filter(([, value]) => value !== undefined)));

  const currentRules = values(await guild.autoModerationRules.fetch());
  const consumedRules = new Set();
  const validRoleIds = new Set(values(guild.roles.cache).map(role => String(role.id || "")).filter(Boolean));
  const validChannelIds = new Set(values(guild.channels.cache).map(channel => String(channel.id || "")).filter(Boolean));
  for (const [ruleIndex, desired] of (backup.autoModRules || []).entries()) {
    let rule = findByIdOrName(currentRules.filter(item => !consumedRules.has(item)), desired);
    const payload = await runAutoModRestoreOperation("payload", ruleIndex, async () => ({
      ...autoModPayload(desired, roleMap, channelMap, {
        validRoleIds,
        validChannelIds,
        report
      }),
      reason
    }));
    if (!rule) {
      rule = await runAutoModRestoreOperation("create", ruleIndex, () => guild.autoModerationRules.create(payload));
      report.autoModRules.created += 1;
    } else {
      await runAutoModRestoreOperation("edit", ruleIndex, () => rule.edit(payload));
      report.autoModRules.updated += 1;
      consumedRules.add(rule);
    }
  }
  for (const [ruleIndex, rule] of currentRules.filter(item => !consumedRules.has(item)).entries()) {
    await runAutoModRestoreOperation("delete", ruleIndex, () => rule.delete(reason));
    report.autoModRules.removed += 1;
  }

  const currentWebhooks = values(await guild.fetchWebhooks());
  const editableCurrentWebhooks = currentWebhooks.filter(webhook => !webhook.applicationId && Number(webhook.type) === WebhookType.Incoming);
  const consumedWebhooks = new Set();
  for (const desired of backup.webhooks || []) {
    if (desired.applicationId || Number(desired.type) !== WebhookType.Incoming) {
      report.webhooks.protected.push({ sourceId: desired.id, reason: desired.applicationId ? "application_webhook" : "non_incoming_webhook" });
      continue;
    }
    let webhook = findByIdOrName(editableCurrentWebhooks.filter(item => !consumedWebhooks.has(item)), desired);
    const targetChannel = guild.channels.cache.get(mapId(desired.channelId, channelMap));
    if (!targetChannel?.createWebhook && !webhook) throw Object.assign(new Error("restore_webhook_channel_unavailable"), { code: "restore_webhook_channel_unavailable" });
    const avatar = await resolveDiscordImage(desired.avatarUrl).catch(() => null);
    if (!webhook) {
      webhook = await targetChannel.createWebhook({ name: desired.name || "FIMA", avatar, reason });
      report.webhooks.created += 1;
    } else {
      await webhook.edit({ name: desired.name || "FIMA", avatar, channel: targetChannel?.id, reason });
      report.webhooks.updated += 1;
      consumedWebhooks.add(webhook);
    }
  }
  for (const webhook of currentWebhooks.filter(item => !consumedWebhooks.has(item))) {
    if (webhook.applicationId || Number(webhook.type) !== WebhookType.Incoming) {
      report.webhooks.protected.push({ currentId: webhook.id, reason: webhook.applicationId ? "application_webhook" : "non_incoming_webhook" });
      continue;
    }
    await webhook.delete(reason);
    report.webhooks.removed += 1;
  }

  for (const match of dryRun.plan.canonicalMessageMatches || []) {
    if (match.sourceId && match.currentId) messageMap.set(String(match.sourceId), String(match.currentId));
  }
  report.canonicalMessages.matched = messageMap.size;
  for (const removal of dryRun.plan.canonicalMessageRemovals || []) {
    const channel = guild.channels.cache.get(String(removal.channelId || ""));
    const message = channel?.messages?.fetch
      ? await channel.messages.fetch(String(removal.currentId || "")).catch(() => null)
      : null;
    if (!message) continue;
    await message.delete();
    report.canonicalMessages.removed += 1;
  }

  const canonicalRestores = (dryRun.plan.canonicalMessages || [])
    .map(action => action.message)
    .filter(Boolean)
    .sort((left, right) => Number(left.createdTimestamp || 0) - Number(right.createdTimestamp || 0));
  for (const desired of canonicalRestores) {
    const channel = guild.channels.cache.get(mapId(desired.channelId, channelMap));
    if (!channel?.isTextBased?.()) {
      report.canonicalMessages.missingChannels.push(desired.channelId);
      continue;
    }
    const files = (desired.attachments || []).map(item => {
      const attachment = discordCdnUrl(item.url);
      return attachment ? { attachment, name: item.name || undefined, description: item.description || undefined } : null;
    }).filter(Boolean);
    const message = await channel.send({
      content: desired.content || undefined,
      embeds: desired.embeds || [],
      components: desired.components || [],
      files,
      allowedMentions: { parse: [], repliedUser: false }
    });
    messageMap.set(String(desired.id), String(message.id));
    if (desired.pinned) await message.pin(reason);
    report.canonicalMessages.restored += 1;
  }

  const maps = { roleMap, channelMap, messageMap };
  const restoredTickets = remapReferences(backup.tickets || [], maps);
  const restoredLegacyTranscripts = remapReferences(backup.legacyTranscripts || {}, maps);
  const restoredGuildConfig = remapReferences(backup.guildConfig || {}, maps);
  if (persistRestoredState) {
    await persistRestoredState({
      guildId,
      roleMap,
      channelMap,
      messageMap,
      tickets: restoredTickets,
      legacyTranscripts: restoredLegacyTranscripts,
      guildConfig: restoredGuildConfig,
      remap: value => remapReferences(value, maps)
    });
  }
  report.status = "restored";
  report.completedAt = new Date().toISOString();
  report.dryRun = { code: dryRun.code, mutationsPlanned: dryRun.mutationsPlanned };
  report.reconciliation = {
    protectedOwnerAndBot: [...protectedMemberIds],
    missingMembers: report.memberRoles.missingMembers,
    missingMessageChannels: report.canonicalMessages.missingChannels
  };
  return report;
}
