import crypto from "node:crypto";

export const PARADISE_BACKUP_SCHEMA_VERSION = 3;

const RESTORE_CAPABILITY_VERSION = 2;
const REQUIRED_RESTORE_CAPABILITIES = Object.freeze([
  "guildIdentity",
  "roles",
  "memberRoles",
  "channels",
  "canonicalMessages",
  "contentArchive",
  "autoModRules",
  "webhooks",
  "tickets"
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

function stableValue(value) {
  return JSON.stringify(canonicalize(value ?? null));
}

function normalizedName(value) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function snapshotGuildId(snapshot) {
  return String(snapshot?.guildId || snapshot?.guild?.id || "").trim();
}

function snapshotCollections(snapshot = {}) {
  const categories = Array.isArray(snapshot.categories) ? snapshot.categories : [];
  const channels = Array.isArray(snapshot.channels) ? snapshot.channels : [];
  const categoryIds = new Set(categories.map(item => String(item?.id || "")).filter(Boolean));
  return {
    categories,
    channels: channels.filter(item => !categoryIds.has(String(item?.id || ""))),
    roles: Array.isArray(snapshot.roles) ? snapshot.roles : [],
    memberRoles: Array.isArray(snapshot.memberRoles) ? snapshot.memberRoles : [],
    canonicalMessages: Array.isArray(snapshot.canonicalMessages) ? snapshot.canonicalMessages : [],
    contentArchive: Array.isArray(snapshot.contentArchive) ? snapshot.contentArchive : [],
    autoModRules: Array.isArray(snapshot.autoModRules) ? snapshot.autoModRules : [],
    webhooks: Array.isArray(snapshot.webhooks) ? snapshot.webhooks : [],
    tickets: Array.isArray(snapshot.tickets) ? snapshot.tickets : []
  };
}

function backupCounts(snapshot = {}) {
  const collections = snapshotCollections(snapshot);
  return {
    categories: collections.categories.length,
    channels: collections.channels.length,
    roles: collections.roles.length,
    memberRoles: collections.memberRoles.length,
    canonicalMessages: collections.canonicalMessages.length,
    contentArchive: collections.contentArchive.length,
    autoModRules: collections.autoModRules.length,
    webhooks: collections.webhooks.length,
    tickets: collections.tickets.length
  };
}

function blocked(code, reason, extra = {}) {
  return {
    status: "blocked",
    canRestore: false,
    code,
    mutationsPlanned: 0,
    reason,
    ...extra
  };
}

function envelopePayload(backup) {
  const { integrity, backupSchemaVersion, ...payload } = backup || {};
  return payload;
}

function comparableRole(role = {}) {
  return {
    name: String(role.name || ""),
    color: Number(role.color || 0),
    permissions: String(role.permissions ?? "0"),
    hoist: Boolean(role.hoist),
    mentionable: Boolean(role.mentionable),
    unicodeEmoji: role.unicodeEmoji || null,
    iconUrl: role.iconUrl || null
  };
}

function comparableChannel(channel = {}) {
  return {
    name: String(channel.name || ""),
    type: Number(channel.type),
    parentId: channel.parentId ? String(channel.parentId) : null,
    position: Number(channel.position ?? channel.rawPosition ?? 0),
    topic: channel.topic ?? null,
    nsfw: Boolean(channel.nsfw),
    rateLimitPerUser: Number(channel.rateLimitPerUser || 0),
    bitrate: channel.bitrate == null ? null : Number(channel.bitrate),
    userLimit: channel.userLimit == null ? null : Number(channel.userLimit),
    rtcRegion: channel.rtcRegion ?? null,
    permissionOverwrites: [...(channel.permissionOverwrites || [])]
      .map(item => ({
        id: String(item.id || ""),
        type: Number(item.type || 0),
        allow: String(item.allow ?? "0"),
        deny: String(item.deny ?? "0")
      }))
      .sort((left, right) => left.id.localeCompare(right.id) || left.type - right.type)
  };
}

function comparableGuild(snapshot = {}, channelSourceToCurrent = new Map()) {
  const guild = snapshot.guild || snapshot;
  const mappedChannelId = value => value ? channelSourceToCurrent.get(String(value)) || String(value) : null;
  return {
    name: String(guild.guildName || guild.name || ""),
    description: guild.description ?? null,
    preferredLocale: guild.preferredLocale ?? null,
    verificationLevel: guild.verificationLevel == null ? null : Number(guild.verificationLevel),
    explicitContentFilter: guild.explicitContentFilter == null ? null : Number(guild.explicitContentFilter),
    defaultMessageNotifications: guild.defaultMessageNotifications == null ? null : Number(guild.defaultMessageNotifications),
    afkChannelId: mappedChannelId(guild.afkChannelId),
    afkTimeout: guild.afkTimeout == null ? null : Number(guild.afkTimeout),
    systemChannelId: mappedChannelId(guild.systemChannelId),
    rulesChannelId: mappedChannelId(guild.rulesChannelId),
    publicUpdatesChannelId: mappedChannelId(guild.publicUpdatesChannelId),
    premiumProgressBarEnabled: guild.premiumProgressBarEnabled == null ? null : Boolean(guild.premiumProgressBarEnabled)
  };
}

function messageFingerprint(message = {}, channelSourceToCurrent = new Map()) {
  return crypto.createHash("sha256").update(stableValue({
    channelId: channelSourceToCurrent.get(String(message.channelId || "")) || String(message.channelId || ""),
    content: String(message.content || ""),
    embeds: message.embeds || [],
    components: message.components || [],
    pinned: Boolean(message.pinned),
    attachments: (message.attachments || []).map(item => ({
      name: item.name || null,
      contentType: item.contentType || null,
      description: item.description || null,
      spoiler: Boolean(item.spoiler)
    }))
  })).digest("hex");
}

function remapComparableChannel(channel, {
  roleSourceToCurrent = new Map(),
  channelSourceToCurrent = new Map(),
  backupGuildId = "",
  currentGuildId = ""
} = {}) {
  const comparable = comparableChannel(channel);
  const mapRoleId = value => {
    const id = String(value || "");
    if (id === String(backupGuildId || "")) return String(currentGuildId || id);
    return roleSourceToCurrent.get(id) || id;
  };
  return {
    ...comparable,
    parentId: comparable.parentId
      ? channelSourceToCurrent.get(String(comparable.parentId)) || String(comparable.parentId)
      : null,
    permissionOverwrites: comparable.permissionOverwrites
      .map(overwrite => ({ ...overwrite, id: mapRoleId(overwrite.id) }))
      .sort((left, right) => left.id.localeCompare(right.id) || left.type - right.type)
  };
}

function comparableAutoModRule(rule = {}, {
  roleSourceToCurrent = new Map(),
  channelSourceToCurrent = new Map(),
  validRoleSourceIds = null,
  validChannelSourceIds = null
} = {}) {
  const mapRoleId = value => roleSourceToCurrent.get(String(value || "")) || String(value || "");
  const mapChannelId = value => channelSourceToCurrent.get(String(value || "")) || String(value || "");
  const validRoleId = value => validRoleSourceIds == null || validRoleSourceIds.has(String(value || ""));
  const validChannelId = value => validChannelSourceIds == null || validChannelSourceIds.has(String(value || ""));
  return {
    name: String(rule.name || ""),
    eventType: Number(rule.eventType),
    triggerType: Number(rule.triggerType),
    triggerMetadata: rule.triggerMetadata || {},
    actions: (rule.actions || []).map(action => ({
      ...action,
      metadata: action?.metadata ? {
        ...action.metadata,
        channelId: action.metadata.channelId ? mapChannelId(action.metadata.channelId) : action.metadata.channelId
      } : action?.metadata
    })),
    enabled: Boolean(rule.enabled),
    exemptRoleIds: [...(rule.exemptRoleIds || [])].filter(validRoleId).map(mapRoleId).sort(),
    exemptChannelIds: [...(rule.exemptChannelIds || [])].filter(validChannelId).map(mapChannelId).sort()
  };
}

function comparableWebhook(webhook = {}, channelSourceToCurrent = new Map()) {
  return {
    name: webhook.name || null,
    channelId: webhook.channelId
      ? channelSourceToCurrent.get(String(webhook.channelId)) || String(webhook.channelId)
      : null,
    avatarUrl: webhook.avatarUrl || null
  };
}

function findRoleMatch(desired, currentRoles, consumed) {
  const candidates = currentRoles.filter(item => !consumed.has(item));
  return candidates.find(item => String(item.id || "") === String(desired.id || ""))
    || candidates.find(item => !item.managed && String(item.name || "") === String(desired.name || ""))
    || candidates.find(item => !item.managed && normalizedName(item.name) === normalizedName(desired.name))
    || null;
}

function findChannelMatch(desired, currentChannels, consumed, backupParentNames, currentParentNames) {
  const candidates = currentChannels.filter(item => !consumed.has(item) && Number(item.type) === Number(desired.type));
  const desiredParentName = normalizedName(backupParentNames.get(String(desired.parentId || "")) || "");
  return candidates.find(item => String(item.id || "") === String(desired.id || ""))
    || candidates.find(item => String(item.name || "") === String(desired.name || "")
      && desiredParentName === normalizedName(currentParentNames.get(String(item.parentId || "")) || ""))
    || candidates.find(item => normalizedName(item.name) === normalizedName(desired.name)
      && desiredParentName === normalizedName(currentParentNames.get(String(item.parentId || "")) || ""))
    || candidates.find(item => String(item.name || "") === String(desired.name || ""))
    || candidates.find(item => normalizedName(item.name) === normalizedName(desired.name))
    || null;
}

function planRoles(backupSnapshot, currentSnapshot) {
  const desiredRoles = snapshotCollections(backupSnapshot).roles;
  const currentRoles = snapshotCollections(currentSnapshot).roles;
  const consumed = new Set();
  const sourceToCurrent = new Map();
  const create = [];
  const update = [];
  const protectedRoles = [];

  for (const desired of desiredRoles) {
    const sourceId = String(desired?.id || "");
    const everyone = sourceId === snapshotGuildId(backupSnapshot) || desired?.name === "@everyone";
    const match = everyone
      ? currentRoles.find(item => String(item.id || "") === snapshotGuildId(currentSnapshot) || item?.name === "@everyone")
      : findRoleMatch(desired, currentRoles, consumed);
    if (match) {
      consumed.add(match);
      sourceToCurrent.set(sourceId, String(match.id || ""));
    }
    if (everyone || desired?.managed) {
      protectedRoles.push({
        sourceId,
        currentId: match?.id || null,
        name: desired?.name || null,
        reason: everyone ? "everyone_role" : "managed_role"
      });
      continue;
    }
    if (!match) {
      create.push({ action: "create_role", sourceId, role: comparableRole(desired), position: Number(desired.position || 0) });
    } else if (stableValue(comparableRole(desired)) !== stableValue(comparableRole(match))
      || Number(desired.position || 0) !== Number(match.position || 0)) {
      update.push({
        action: "update_role",
        sourceId,
        currentId: String(match.id || ""),
        role: comparableRole(desired),
        position: Number(desired.position || 0)
      });
    }
  }

  const remove = currentRoles
    .filter(item => !consumed.has(item)
      && !item?.managed
      && String(item?.id || "") !== snapshotGuildId(currentSnapshot)
      && item?.name !== "@everyone")
    .map(item => ({ action: "remove_role", currentId: String(item.id || ""), name: item.name || null }));
  return { create, update, remove, protected: protectedRoles, sourceToCurrent };
}

function planChannels(backupSnapshot, currentSnapshot, roleSourceToCurrent = new Map()) {
  const desired = snapshotCollections(backupSnapshot);
  const current = snapshotCollections(currentSnapshot);
  const desiredChannels = [...desired.categories, ...desired.channels];
  const currentChannels = [...current.categories, ...current.channels];
  const backupParentNames = new Map(desiredChannels.map(item => [String(item.id || ""), item.name]));
  const currentParentNames = new Map(currentChannels.map(item => [String(item.id || ""), item.name]));
  const consumed = new Set();
  const sourceToCurrent = new Map();
  const create = [];
  const update = [];

  for (const wanted of desiredChannels) {
    const match = findChannelMatch(wanted, currentChannels, consumed, backupParentNames, currentParentNames);
    if (match) {
      consumed.add(match);
      sourceToCurrent.set(String(wanted.id || ""), String(match.id || ""));
    }
    if (!match) {
      create.push({ action: "create_channel", sourceId: String(wanted.id || ""), channel: comparableChannel(wanted) });
      continue;
    }
    const desiredComparable = remapComparableChannel(wanted, {
      roleSourceToCurrent,
      channelSourceToCurrent: sourceToCurrent,
      backupGuildId: snapshotGuildId(backupSnapshot),
      currentGuildId: snapshotGuildId(currentSnapshot)
    });
    const currentComparable = comparableChannel(match);
    if (stableValue(desiredComparable) !== stableValue(currentComparable)) {
      update.push({
        action: desiredComparable.parentId !== currentComparable.parentId ? "update_or_reparent_channel" : "update_channel",
        sourceId: String(wanted.id || ""),
        currentId: String(match.id || ""),
        channel: desiredComparable
      });
    }
  }

  const remove = currentChannels
    .filter(item => !consumed.has(item) && !item?.isThread)
    .map(item => ({ action: "remove_channel", currentId: String(item.id || ""), name: item.name || null, type: Number(item.type) }));
  return { create, update, remove, sourceToCurrent };
}

function planMemberRoles(backupSnapshot, currentSnapshot, roleSourceToCurrent) {
  const desiredMembers = snapshotCollections(backupSnapshot).memberRoles;
  const currentMembers = new Map(snapshotCollections(currentSnapshot).memberRoles
    .map(item => [String(item.memberId || item.id || ""), item]));
  return desiredMembers.flatMap(member => {
    const memberId = String(member.memberId || member.id || "");
    if (!memberId) return [];
    const desiredRoleIds = [...new Set((member.roleIds || [])
      .map(id => roleSourceToCurrent.get(String(id)) || String(id))
      .filter(Boolean))].sort();
    const currentRoleIds = [...new Set((currentMembers.get(memberId)?.roleIds || []).map(String))].sort();
    return stableValue(desiredRoleIds) === stableValue(currentRoleIds)
      ? []
      : [{ action: "set_member_roles", memberId, sourceRoleIds: (member.roleIds || []).map(String), mappedRoleIds: desiredRoleIds }];
  });
}

function planNamedResources(
  desired = [],
  current = [],
  kind,
  compare = value => value,
  protectedPredicate = () => false,
  currentCompare = compare
) {
  const desiredMutable = desired.filter(item => !protectedPredicate(item));
  const currentMutable = current.filter(item => !protectedPredicate(item));
  const protectedResources = [
    ...desired.filter(protectedPredicate).map(item => ({ sourceId: String(item.id || ""), name: item.name || null })),
    ...current.filter(protectedPredicate).map(item => ({ currentId: String(item.id || ""), name: item.name || null }))
  ];
  const consumed = new Set();
  const create = [];
  const update = [];
  for (const item of desiredMutable) {
    const match = currentMutable.find(candidate => !consumed.has(candidate) && String(candidate.id || "") === String(item.id || ""))
      || currentMutable.find(candidate => !consumed.has(candidate) && normalizedName(candidate.name) === normalizedName(item.name));
    if (match) consumed.add(match);
    if (!match) create.push({ action: `create_${kind}`, sourceId: String(item.id || ""), value: item });
    else if (stableValue(compare(item)) !== stableValue(currentCompare(match))) {
      update.push({ action: `update_${kind}`, sourceId: String(item.id || ""), currentId: String(match.id || ""), value: item });
    }
  }
  const remove = currentMutable.filter(item => !consumed.has(item))
    .map(item => ({ action: `remove_${kind}`, currentId: String(item.id || ""), name: item.name || null }));
  return { create, update, remove, protected: protectedResources };
}

function planCanonicalMessages(backupSnapshot, currentSnapshot, channelSourceToCurrent = new Map()) {
  const desired = snapshotCollections(backupSnapshot).canonicalMessages;
  const current = snapshotCollections(currentSnapshot).canonicalMessages;
  const currentFingerprints = new Map();
  for (const message of current) {
    const key = messageFingerprint(message);
    const bucket = currentFingerprints.get(key) || [];
    bucket.push(message);
    currentFingerprints.set(key, bucket);
  }
  const restore = [];
  const matches = [];
  const consumedCurrentIds = new Set();
  for (const message of desired) {
    const key = messageFingerprint(message, channelSourceToCurrent);
    const match = currentFingerprints.get(key)?.shift();
    if (match) {
      consumedCurrentIds.add(String(match.id || ""));
      matches.push({ sourceId: String(message.id || ""), currentId: String(match.id || "") });
    } else {
      restore.push({ action: "restore_canonical_message", sourceId: String(message.id || ""), message });
    }
  }
  const remove = current
    .filter(message => !consumedCurrentIds.has(String(message.id || "")))
    .map(message => ({
      action: "remove_canonical_message",
      currentId: String(message.id || ""),
      channelId: String(message.channelId || "")
    }));
  return { restore, remove, matches };
}

export function paradiseBackupDigest(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

export function paradiseBackupStateDigest(payload) {
  const snapshot = envelopePayload(payload);
  const { capturedAt: _capturedAt, ...stableSnapshot } = snapshot;
  return paradiseBackupDigest(stableSnapshot);
}

export function createParadiseBackupEnvelope(payload, now = new Date()) {
  const snapshot = structuredClone(payload || {});
  const counts = backupCounts(snapshot);
  return {
    ...snapshot,
    backupSchemaVersion: PARADISE_BACKUP_SCHEMA_VERSION,
    integrity: {
      algorithm: "sha256",
      digest: paradiseBackupDigest(snapshot),
      stateDigest: paradiseBackupStateDigest(snapshot),
      capturedAt: new Date(now).toISOString(),
      counts,
      validated: true
    }
  };
}

export function validateParadiseBackupEnvelope(backup) {
  if (!backup || backup.backupSchemaVersion !== PARADISE_BACKUP_SCHEMA_VERSION) {
    return {
      valid: false,
      code: "backup_schema_invalid",
      expectedSchemaVersion: PARADISE_BACKUP_SCHEMA_VERSION,
      actualSchemaVersion: backup?.backupSchemaVersion ?? null
    };
  }
  if (backup.integrity?.algorithm !== "sha256" || !/^[a-f0-9]{64}$/i.test(String(backup.integrity?.digest || ""))) {
    return { valid: false, code: "backup_integrity_missing" };
  }
  const payload = envelopePayload(backup);
  const expected = paradiseBackupDigest(payload);
  if (expected !== backup.integrity.digest) return { valid: false, code: "backup_checksum_mismatch" };
  if (backup.integrity.stateDigest != null) {
    if (!/^[a-f0-9]{64}$/i.test(String(backup.integrity.stateDigest))) {
      return { valid: false, code: "backup_state_integrity_invalid" };
    }
    if (paradiseBackupStateDigest(payload) !== backup.integrity.stateDigest) {
      return { valid: false, code: "backup_state_checksum_mismatch" };
    }
  }
  const counts = backupCounts(payload);
  if (stableValue(counts) !== stableValue(backup.integrity.counts)) {
    return { valid: false, code: "backup_count_metadata_mismatch" };
  }
  return { valid: true, code: "backup_valid", counts };
}

export function validateParadiseBackupArtifactCopies({
  timestampedBackup,
  canonicalBackup,
  expectedBackup,
  expectedGuildId
} = {}) {
  const expectedValidation = validateParadiseBackupEnvelope(expectedBackup);
  if (!expectedValidation.valid) {
    return {
      valid: false,
      code: "expected_backup_invalid",
      artifact: "expected",
      validation: expectedValidation
    };
  }

  const requiredGuildId = String(expectedGuildId || "").trim();
  const sourceGuildId = snapshotGuildId(expectedBackup);
  if (!requiredGuildId || sourceGuildId !== requiredGuildId) {
    return {
      valid: false,
      code: "expected_backup_guild_mismatch",
      artifact: "expected",
      expectedGuildId: requiredGuildId || null,
      actualGuildId: sourceGuildId || null
    };
  }

  const expectedDigest = expectedBackup.integrity.digest;
  const expectedCounts = expectedValidation.counts;
  const artifacts = [
    ["timestamped", timestampedBackup],
    ["canonical", canonicalBackup]
  ];
  const validations = {};
  for (const [artifact, candidate] of artifacts) {
    const validation = validateParadiseBackupEnvelope(candidate);
    const actualGuildId = snapshotGuildId(candidate);
    const countsMatch = stableValue(validation.counts || null) === stableValue(expectedCounts);
    validations[artifact] = {
      validation,
      digest: candidate?.integrity?.digest || null,
      guildId: actualGuildId || null,
      countsMatch
    };
    if (!validation.valid) {
      return {
        valid: false,
        code: `${artifact}_backup_invalid`,
        artifact,
        ...validations[artifact]
      };
    }
    if (candidate.integrity.digest !== expectedDigest) {
      return {
        valid: false,
        code: `${artifact}_backup_digest_mismatch`,
        artifact,
        expectedDigest,
        ...validations[artifact]
      };
    }
    if (actualGuildId !== requiredGuildId) {
      return {
        valid: false,
        code: `${artifact}_backup_guild_mismatch`,
        artifact,
        expectedGuildId: requiredGuildId,
        ...validations[artifact]
      };
    }
    if (!countsMatch) {
      return {
        valid: false,
        code: `${artifact}_backup_counts_mismatch`,
        artifact,
        expectedCounts,
        ...validations[artifact]
      };
    }
  }

  return {
    valid: true,
    code: "backup_artifact_copies_valid",
    digest: expectedDigest,
    guildId: requiredGuildId,
    counts: expectedCounts,
    artifacts: validations
  };
}

export function buildParadiseRestoreDryRun({
  backup,
  currentSnapshot = null,
  expectedGuildId = null,
  allowedGuildId = null
} = {}) {
  const validation = validateParadiseBackupEnvelope(backup);
  if (!validation.valid) {
    return blocked(validation.code, "Backup integrity and schema must validate before any restore operation.", {
      validation
    });
  }
  const payload = envelopePayload(backup);
  const backupGuildId = snapshotGuildId(payload);
  const targetGuildId = String(expectedGuildId || "").trim();
  const allowlistedGuildId = String(allowedGuildId || "").trim();
  if (!targetGuildId) return blocked("expected_guild_id_required", "Restore target must be explicit.");
  if (!allowlistedGuildId || targetGuildId !== allowlistedGuildId) {
    return blocked("restore_target_not_allowlisted", "Restore is available only for the explicitly allowlisted disposable test guild.", {
      targetGuildId,
      allowlistedGuildId: allowlistedGuildId || null
    });
  }
  if (!backupGuildId) return blocked("backup_guild_id_missing", "Backup has no guild identity.");
  if (backupGuildId !== targetGuildId) {
    return blocked("backup_guild_mismatch", "Backup belongs to a different guild.", { backupGuildId, targetGuildId });
  }
  if (!currentSnapshot) return blocked("current_snapshot_required", "A fresh target snapshot is required for a restore plan.");
  const currentGuildId = snapshotGuildId(currentSnapshot);
  if (currentGuildId !== targetGuildId) {
    return blocked("current_guild_mismatch", "Current snapshot belongs to a different guild.", { currentGuildId, targetGuildId });
  }

  const capabilities = payload.restoreCapabilities || {};
  const missingCapabilities = REQUIRED_RESTORE_CAPABILITIES.filter(key => capabilities[key] !== true);
  if (Number(capabilities.version) !== RESTORE_CAPABILITY_VERSION || missingCapabilities.length) {
    return blocked("backup_restore_scope_incomplete", "Backup does not prove every required restore scope was captured.", {
      requiredCapabilityVersion: RESTORE_CAPABILITY_VERSION,
      actualCapabilityVersion: capabilities.version ?? null,
      missingCapabilities
    });
  }

  const roles = planRoles(payload, currentSnapshot);
  const channels = planChannels(payload, currentSnapshot, roles.sourceToCurrent);
  const memberRoles = planMemberRoles(payload, currentSnapshot, roles.sourceToCurrent);
  const canonicalMessages = planCanonicalMessages(payload, currentSnapshot, channels.sourceToCurrent);
  const backupCollections = snapshotCollections(payload);
  const currentCollections = snapshotCollections(currentSnapshot);
  const backupRoleIds = new Set(backupCollections.roles.map(item => String(item?.id || "")).filter(Boolean));
  const backupChannelIds = new Set(
    [...backupCollections.categories, ...backupCollections.channels].map(item => String(item?.id || "")).filter(Boolean)
  );
  const currentRoleIds = new Set(currentCollections.roles.map(item => String(item?.id || "")).filter(Boolean));
  const currentChannelIds = new Set(
    [...currentCollections.categories, ...currentCollections.channels].map(item => String(item?.id || "")).filter(Boolean)
  );
  const autoModRules = planNamedResources(
    backupCollections.autoModRules,
    currentCollections.autoModRules,
    "automod_rule",
    value => comparableAutoModRule(value, {
      roleSourceToCurrent: roles.sourceToCurrent,
      channelSourceToCurrent: channels.sourceToCurrent,
      validRoleSourceIds: backupRoleIds,
      validChannelSourceIds: backupChannelIds
    }),
    () => false,
    value => comparableAutoModRule(value, {
      validRoleSourceIds: currentRoleIds,
      validChannelSourceIds: currentChannelIds
    })
  );
  const webhooks = planNamedResources(
    backupCollections.webhooks,
    currentCollections.webhooks,
    "webhook",
    value => comparableWebhook(value, channels.sourceToCurrent),
    value => Boolean(value.applicationId) || Number(value.type) !== 1,
    value => comparableWebhook(value)
  );
  const guildIdentity = stableValue(comparableGuild(payload, channels.sourceToCurrent)) === stableValue(comparableGuild(currentSnapshot))
    ? []
    : [{ action: "update_guild_identity", guild: comparableGuild(payload) }];
  const plan = {
    guildIdentity,
    roles: { create: roles.create, update: roles.update, remove: roles.remove, protected: roles.protected },
    channels: { create: channels.create, update: channels.update, remove: channels.remove },
    memberRoles,
    canonicalMessages: canonicalMessages.restore,
    canonicalMessageRemovals: canonicalMessages.remove,
    canonicalMessageMatches: canonicalMessages.matches,
    autoModRules,
    webhooks,
    ticketRecords: backupCollections.tickets.length
  };
  const mutationsPlanned = guildIdentity.length
    + roles.create.length + roles.update.length + roles.remove.length
    + channels.create.length + channels.update.length + channels.remove.length
    + memberRoles.length + canonicalMessages.restore.length + canonicalMessages.remove.length
    + autoModRules.create.length + autoModRules.update.length + autoModRules.remove.length
    + webhooks.create.length + webhooks.update.length + webhooks.remove.length;
  const currentCounts = backupCounts(currentSnapshot);
  const countDelta = Object.fromEntries(Object.keys(validation.counts).map(key => [
    key,
    Number(validation.counts[key] || 0) - Number(currentCounts[key] || 0)
  ]));
  return {
    status: "ready",
    canRestore: true,
    code: "restore_dry_run_valid",
    targetGuildId,
    backupDigest: backup.integrity.digest,
    mutationsPlanned,
    backupCounts: validation.counts,
    currentCounts,
    countDelta,
    plan,
    requiredBeforeRestore: [
      "exact typed confirmation",
      "test-guild mutation guard",
      "exclusive persistent guild lease",
      "checksum revalidation immediately before mutation",
      "owner and bot access preservation",
      "post-restore reconciliation artifact"
    ]
  };
}
