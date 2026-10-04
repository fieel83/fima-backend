import { AuditLogEvent, ChannelType, PermissionsBitField } from 'discord.js';
import { fimaOperationError } from './fimaGuildOperations.js';
import { captureParadiseGuildBackupSnapshot } from './paradiseGuildRestore.js';
import { createParadiseBackupEnvelope } from './paradiseBackupIntegrity.js';
const permissions = PermissionsBitField.Flags;
const overwriteProof = rows => JSON.stringify([...rows].map(ow => ({ id: ow.id, type: ow.type, allow: String(ow.allow?.bitfield ?? ow.allow), deny: String(ow.deny?.bitfield ?? ow.deny) })).sort((a,b) => a.id.localeCompare(b.id)));
export function verifyFimaVoiceCreation(channel, entries, plan, botId) {
  const proof = [...entries.values()].some(entry => entry.action === AuditLogEvent.ChannelCreate && entry.targetId === channel?.id
    && entry.executorId === botId && entry.reason === plan.reason && Number.isFinite(entry.createdTimestamp)
    && entry.createdTimestamp >= plan.deliveryStartedAt - 5000);
  if (!proof || channel?.guildId !== plan.guildId || channel.type !== ChannelType.GuildVoice || channel.name !== plan.payload.name
    || (channel.parentId || null) !== plan.payload.parentId
    || overwriteProof(channel.permissionOverwrites.cache.values()) !== overwriteProof(plan.payload.permissionOverwrites)) {
    throw fimaOperationError('voice_creation_proof_missing');
  }
  return channel.id;
}
export function verifyFimaPollDelivery(message, plan, botId) {
  const poll = message?.poll;
  const answers = poll ? [...poll.answers.values()].map(answer => answer.text) : [];
  const matches = message?.guildId === plan.guildId && message?.channelId === plan.payload.channelId
    && message?.author?.id === botId && String(message?.nonce || '') === plan.nonce
    && poll?.question?.text === plan.payload.question
    && JSON.stringify(answers) === JSON.stringify(plan.payload.options)
    && poll?.allowMultiselect === plan.payload.allowMultiselect
    && Number.isFinite(message.createdTimestamp) && message.createdTimestamp >= plan.deliveryStartedAt - 5000;
  if (!matches) throw fimaOperationError('poll_delivery_proof_missing', 409);
  return { guildId: plan.guildId, channelId: message.channelId, messageId: message.id, url: message.url,
    createdAt: new Date(message.createdTimestamp).toISOString(),
    expiresAt: new Date(message.createdTimestamp + plan.payload.duration * 3600000).toISOString(), lifecycle: 'published' };
}
export function createFimaDiscordGateway(getGuild) {
  async function managedGuild(guildId, actorId) {
    const guild = await getGuild(guildId);
    if (guild.id !== guildId) throw fimaOperationError('guild_scope_mismatch', 403);
    const member = await guild.members.fetch({ user: actorId, force: true }).catch(() => null);
    if (!member?.permissions.has(permissions.ManageGuild)) throw fimaOperationError('live_guild_not_authorized', 403);
    return { guild, member };
  }
  async function pollChannel(guildId, actorId, channelId) {
    const { guild, member } = await managedGuild(guildId, actorId);
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    const bot = await guild.members.fetchMe({ force: true });
    const required = [permissions.ViewChannel, permissions.SendMessages, permissions.SendPolls];
    if (!channel || channel.guildId !== guildId || channel.type !== ChannelType.GuildText) throw fimaOperationError('poll_channel_not_supported', 400);
    if (!channel.permissionsFor(bot)?.has(required) || !channel.permissionsFor(member)?.has(required)) throw fimaOperationError('poll_permissions_missing', 403);
    return channel;
  }
  async function voiceCreationGuild(guildId, actorId, payload) {
    const { guild, member } = await managedGuild(guildId, actorId);
    const bot = await guild.members.fetchMe({ force: true });
    if (!member.permissions.has(permissions.ManageChannels) || !bot.permissions.has([permissions.ManageChannels, permissions.ViewAuditLog])) throw fimaOperationError('voice_creation_permissions_missing', 403);
    if (payload.parentId) {
      const parent = await guild.channels.fetch(payload.parentId);
      if (!parent || parent.guildId !== guildId || parent.type !== ChannelType.GuildCategory
        || !parent.permissionsFor(member)?.has(permissions.ManageChannels) || !parent.permissionsFor(bot)?.has(permissions.ManageChannels)) throw fimaOperationError('voice_category_permissions_missing', 403);
      if (overwriteProof(parent.permissionOverwrites.cache.values()) !== overwriteProof(payload.permissionOverwrites)) throw fimaOperationError('voice_category_permission_drift');
    }
    return guild;
  }
  return {
    async checkVoiceCreation(guildId, actorId, payload) { await voiceCreationGuild(guildId, actorId, payload); },
    async createVoiceEntry(plan) {
      const guild = await voiceCreationGuild(plan.guildId, plan.actorId, plan.payload);
      const channel = await guild.channels.create({ name: plan.payload.name, type: ChannelType.GuildVoice,
        parent: plan.payload.parentId, permissionOverwrites: plan.payload.permissionOverwrites, reason: plan.reason });
      return channel.id;
    },
    async reconcileVoiceCreation(plan, channelId) {
      const guild = await voiceCreationGuild(plan.guildId, plan.actorId, plan.payload);
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 100 });
      return verifyFimaVoiceCreation(channel, logs.entries, plan, guild.client.user.id);
    },
    async inspect(guildId, actorId) {
      const { guild } = await managedGuild(guildId, actorId);
      const [channels, roles] = await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
      const errors = [];
      const webhooks = await guild.fetchWebhooks().catch(() => { errors.push('webhooks_not_accessible'); return new Map(); });
      const automod = await guild.autoModerationRules.fetch().catch(() => { errors.push('automod_not_accessible'); return new Map(); });
      const applications = await guild.fetchIntegrations().catch(() => { errors.push('applications_not_accessible'); return new Map(); });
      const integrations = [...webhooks.values()].map(hook => ({ id: hook.id, guildId, destinationChannelId: hook.channelId, provider: hook.name || 'External provider',
        applicationId: hook.applicationId || null, ownerId: hook.owner?.id || null, ownership: hook.applicationId ? 'application_owned' : 'not_verified',
        purpose: 'external_delivery', state: 'external_integration', health: 'not_observed', lastObservedDelivery: null, dependencyReferences: [hook.channelId], secretRef: null }));
      for (const app of applications.values()) integrations.push({ id: app.id, guildId, provider: app.name || 'External application',
        applicationId: app.application?.id || null, ownerId: app.user?.id || null, destinationChannelId: null,
        ownership: 'application_owned', purpose: 'external_application', state: 'external_integration', health: 'not_observed',
        lastObservedDelivery: null, dependencyReferences: [], dependencyScope: 'unknown', secretRef: null });
      return { guildId, observedAt: new Date().toISOString(), guild: { name: guild.name, afkChannelId: guild.afkChannelId, afkTimeout: guild.afkTimeout },
        channels: [...channels.values()].filter(Boolean).map(ch => ({ id: ch.id, name: ch.name, type: ch.type, parentId: ch.parentId, position: ch.rawPosition,
          topic: ch.topic || null, permissionOverwrites: [...(ch.permissionOverwrites?.cache.values() || [])].map(ow => ({ id: ow.id, type: ow.type, allow: ow.allow.bitfield.toString(), deny: ow.deny.bitfield.toString() })).sort((a,b) => a.id.localeCompare(b.id)) })).sort((a,b) => a.id.localeCompare(b.id)),
        roles: [...roles.values()].map(role => ({ id: role.id, name: role.name, type: 'role', position: role.position, managed: role.managed, permissions: role.permissions.bitfield.toString() })).sort((a,b) => a.id.localeCompare(b.id)),
        integrations: integrations.sort((a,b) => a.id.localeCompare(b.id)), autoModRules: [...automod.values()].map(rule => ({ id: rule.id, name: rule.name, enabled: rule.enabled, eventType: rule.eventType, triggerType: rule.triggerType, exemptChannels: [...rule.exemptChannels.keys()], exemptRoles: [...rule.exemptRoles.keys()] })).sort((a,b) => a.id.localeCompare(b.id)),
        errors, structuralMigrationReady: false };
    },
    async captureBackup(guildId, actorId, state) {
      const { guild } = await managedGuild(guildId, actorId);
      return createParadiseBackupEnvelope(await captureParadiseGuildBackupSnapshot(guild, { state }));
    },
    async editStructural(guildId, actorId, step, direction) {
      const { guild, member } = await managedGuild(guildId, actorId);
      const bot = await guild.members.fetchMe({ force: true });
      const required = step.kind === 'channel' ? permissions.ManageChannels : permissions.ManageRoles;
      if (!member.permissions.has(required) || !bot.permissions.has(required)) throw fimaOperationError('migration_permissions_missing', 403);
      const object = await (step.kind === 'channel' ? guild.channels : guild.roles).fetch(step.objectId);
      if (!object || (step.kind === 'role' && (!object.editable || object.managed || object.id === guildId))) throw fimaOperationError('migration_object_not_editable');
      if (step.kind === 'role' && member.id !== guild.ownerId && member.roles.highest.comparePositionTo(object) <= 0) throw fimaOperationError('migration_actor_role_hierarchy', 403);
      if (step.kind === 'channel' && (!object.permissionsFor(member)?.has(required) || !object.permissionsFor(bot)?.has(required))) throw fimaOperationError('migration_channel_permissions_missing', 403);
      const metadata = step[direction];
      if (step.kind === 'channel' && metadata.parentId) {
        const parent = await guild.channels.fetch(metadata.parentId);
        if (!parent || parent.guildId !== guildId || parent.type !== ChannelType.GuildCategory
          || !parent.permissionsFor(member)?.has(required) || !parent.permissionsFor(bot)?.has(required)) {
          throw fimaOperationError('migration_parent_permissions_missing', 403);
        }
      }
      // Moving a channel must preserve explicit overwrites, never sync category permissions.
      await object.edit({ name: metadata.name, ...(Object.hasOwn(metadata, 'parentId') ? { parent: metadata.parentId, lockPermissions: false } : {}), reason: 'FIMA verified metadata migration' });
    },
    async checkPoll(guildId, actorId, channelId) { const ch = await pollChannel(guildId, actorId, channelId); return { id: ch.id, name: ch.name, type: ch.type }; },
    async reconcilePoll(plan, messageId) {
      const ch = await pollChannel(plan.guildId, plan.actorId, plan.payload.channelId);
      const { guild, member } = await managedGuild(plan.guildId, plan.actorId);
      const bot = await guild.members.fetchMe({ force: true });
      if (!ch.permissionsFor(bot)?.has(permissions.ReadMessageHistory) || !ch.permissionsFor(member)?.has(permissions.ReadMessageHistory)) {
        throw fimaOperationError('poll_history_permissions_missing', 403);
      }
      const message = await ch.messages.fetch({ message: messageId, force: true }).catch(() => null);
      return verifyFimaPollDelivery(message, plan, guild.client.user.id);
    },
    async publishPoll(guildId, actorId, poll, nonce) {
      const ch = await pollChannel(guildId, actorId, poll.channelId);
      const message = await ch.send({ poll: { question: { text: poll.question }, answers: poll.options.map(text => ({ text })), duration: poll.duration, allowMultiselect: poll.allowMultiselect }, nonce, enforceNonce: true, allowedMentions: { parse: [] } });
      return { guildId, channelId: ch.id, messageId: message.id, url: message.url, createdAt: message.createdAt.toISOString(), expiresAt: new Date(message.createdTimestamp + poll.duration * 3600000).toISOString(), lifecycle: 'published' };
    }
  };
}
