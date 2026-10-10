import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder, PermissionsBitField } from 'discord.js';
import { env, frontendUrl } from './env.js';
import { fimaSupportConfiguration } from './paradise3a59.js';
import crypto from 'node:crypto';
import { prisma } from './db.js';
import { SUPPORT_GUILD, store, configureSupportDiscord, startSupportWorker, addMessage, ticketAction, validateAttachments, verifiedSupportOwner } from './webSupport.js';

const rolesFor = key => String(env(key, '')).split(',').map(v => v.trim()).filter(v => /^\d{17,20}$/.test(v));
let configuredRoles = {}, configuredChannels = {};
const mappedRoles = keys => keys.map(key => configuredRoles[key]).filter(id => /^\d{17,20}$/.test(String(id || '')));
const managementRoles = () => [...mappedRoles(['moderator_role', 'senior_moderator_role', 'admin_role']), ...rolesFor('FIMA_TICKET_MODERATOR_ROLE_IDS'), ...rolesFor('FIMA_TICKET_SENIOR_ROLE_IDS'), ...rolesFor('FIMA_TICKET_ADMIN_ROLE_IDS')];
let discoveredLogId;
const logId = () => env('DISCORD_TICKET_TRANSCRIPT_CHANNEL_ID') || discoveredLogId;
const workRoles = () => [...mappedRoles(['helper_role', 'support_role', 'fima_support_role', 'support_staff_role', 'moderator_role', 'senior_moderator_role', 'admin_role']), ...rolesFor('DISCORD_FIMA_SUPPORT_ROLE_ID'), ...rolesFor('DISCORD_SUPPORT_ROLE_ID'), ...rolesFor('FIMA_TICKET_HELPER_ROLE_IDS'), ...rolesFor('FIMA_TICKET_JUNIOR_ROLE_IDS'), ...rolesFor('FIMA_TICKET_MODERATOR_ROLE_IDS'), ...rolesFor('FIMA_TICKET_SENIOR_ROLE_IDS'), ...rolesFor('FIMA_TICKET_ADMIN_ROLE_IDS')];
const topic = t => 'FIMA website ticket:' + t.id + '; owner:' + t.discordUserId;
const home = () => String(frontendUrl() || 'https://fimamacro.com').replace(/\/$/, '');
const url = t => home() + '/support?ticket=' + t.id;
const controlRow = t => new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('View ticket').setStyle(ButtonStyle.Link).setURL(url(t)), ...['claim', 'assign', 'escalate', 'close'].map(action => new ButtonBuilder().setCustomId('fima_webticket:' + action + ':' + t.id).setLabel(action[0].toUpperCase() + action.slice(1)).setStyle(action === 'close' ? ButtonStyle.Danger : ButtonStyle.Secondary)));
let access;
let stopWorker;

export async function verifyTicketPrivacy(c, t, permittedRoles) {
  if (c.type !== ChannelType.GuildText || c.guildId !== SUPPORT_GUILD || c.topic !== topic(t) || c.permissionsFor(c.guild.roles.everyone).has(PermissionsBitField.Flags.ViewChannel)) throw new Error('ticket_channel_not_private');
  const permittedMembers = [c.guild.members.me.id, t.discordUserId, t.assignedTo];
  const formerAssignees = new Set((t.events || []).filter(e => ['claim', 'assign'].includes(e.type)).map(e => e.assignedTo).filter(Boolean));
  // Reassignment commits before Discord synchronization. Revoke only recorded
  // former assignees; unexpected grants still fail closed for manual review.
  for (const overwrite of c.permissionOverwrites.cache.values()) {
    if (overwrite.type === 1 && formerAssignees.has(overwrite.id) && !permittedMembers.includes(overwrite.id)) await overwrite.delete('Ticket reassigned');
  }
  for (const overwrite of c.permissionOverwrites.cache.values()) {
    if (!overwrite.allow.has(PermissionsBitField.Flags.ViewChannel)) continue;
    const permitted = overwrite.type === 0 ? permittedRoles.includes(overwrite.id) : permittedMembers.includes(overwrite.id);
    if (!permitted) throw new Error('ticket_channel_acl_unverified');
  }
}

export function connectWebSupport(getGuild) {
  async function guild() { const config = await fimaSupportConfiguration(SUPPORT_GUILD); configuredRoles = config.roleMappings; configuredChannels = config.channelMappings; return getGuild(SUPPORT_GUILD); }
  async function permissions(id) {
    if (!/^\d{17,20}$/.test(String(id || ''))) return {};
    const g = await guild(), member = await g.members.fetch(id);
    if (await verifiedSupportOwner(id)) return { work: true, manage: true, delete: true, assignedOnly: false };
    const has = ids => ids.some(id => member.roles.cache.has(id));
    // Role IDs are explicitly scoped to the FIMA guild. Discord Administrator alone
    // is not an Owner Dashboard or ticket deletion grant.
    const manage = has(managementRoles());
    const work = manage || has(workRoles());
    return { work, manage, delete: has([...mappedRoles(['admin_role']), ...rolesFor('FIMA_TICKET_ADMIN_ROLE_IDS')]), assignedOnly: !manage && has(rolesFor('FIMA_TICKET_JUNIOR_ROLE_IDS')) };
  }
  async function channel(t) {
    const g = await guild();
    const c = await g.channels.fetch(t.channelId);
    if (!c || c.guildId !== t.guildId || c.topic !== topic(t)) throw Object.assign(new Error('channel_scope_mismatch'), { code: 'channel_scope_mismatch' });
    await verifyTicketPrivacy(c, t, workRoles().filter(id => !rolesFor('FIMA_TICKET_JUNIOR_ROLE_IDS').includes(id)));
    return c;
  }
  async function archiveChannel() {
    const g = await guild(), channels = await g.channels.fetch();
    discoveredLogId = channels.find(c => c?.name === '⌁・ticket-logs')?.id;
    if (!logId()) throw new Error('transcript_log_unconfigured');
    const c = await g.channels.fetch(logId());
    if (c?.name !== '⌁・ticket-logs' || !c.isTextBased() || c.guildId !== SUPPORT_GUILD || c.permissionsFor(g.roles.everyone).has(PermissionsBitField.Flags.ViewChannel)) throw new Error('transcript_log_not_private');
    for (const overwrite of c.permissionOverwrites.cache.values()) {
      if (!overwrite.allow.has(PermissionsBitField.Flags.ViewChannel) || overwrite.id === g.members.me.id) continue;
      const allowed = overwrite.type === 0 ? workRoles().filter(r => !rolesFor('FIMA_TICKET_JUNIOR_ROLE_IDS').includes(r)).includes(overwrite.id) : (await permissions(overwrite.id)).manage;
      if (!allowed) throw new Error('transcript_log_acl_unverified');
    }
    return c;
  }
  async function verifyArchive(saved, transcript) {
    const attachment = saved.attachments.first(), u = attachment && new URL(attachment.url);
    if (!u || u.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(u.hostname) || saved.author.id !== saved.client.user.id || !saved.content.includes('FIMA-transcript:' + transcript.id) || !saved.content.includes('SHA256: ' + transcript.sha256)) throw new Error('transcript_log_readback_failed');
    const response = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok || Number(response.headers.get('content-length')) > 20000000) throw new Error('transcript_log_readback_failed');
    const chunks = []; let total = 0;
    for await (const chunk of response.body) { total += chunk.length; if (total > 20000000) throw new Error('transcript_log_readback_failed'); chunks.push(Buffer.from(chunk)); }
    if (crypto.createHash('sha256').update(Buffer.concat(chunks)).digest('hex') !== transcript.sha256) throw new Error('transcript_log_readback_failed');
    return saved.id;
  }
  const gateway = {
    permissions,
    async ensureChannel(t) {
      const g = await guild();
      const channels = await g.channels.fetch();
      const existing = channels.find(c => c?.topic === topic(t));
      if (existing) { await verifyTicketPrivacy(existing, t, workRoles().filter(id => !rolesFor('FIMA_TICKET_JUNIOR_ROLE_IDS').includes(id))); return existing.id; }
      await g.members.fetch(t.discordUserId);
      const allow = [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks];
      const overwrites = [{ id: g.id, deny: [PermissionsBitField.Flags.ViewChannel] }, { id: t.discordUserId, allow }, { id: g.members.me.id, allow: [...allow, PermissionsBitField.Flags.ManageChannels] }, ...[...new Set(workRoles())].filter(id => !rolesFor('FIMA_TICKET_JUNIOR_ROLE_IDS').includes(id)).map(id => ({ id, allow }))];
      const c = await g.channels.create({ name: 'ticket-' + t.id.slice(0, 8), type: ChannelType.GuildText, parent: env('DISCORD_TICKET_CATEGORY_ID', '1557526017378091110'), topic: topic(t), permissionOverwrites: overwrites, reason: 'Website support ticket ' + t.id });
      return c.id;
    },
    async send(t, m) {
      const c = await channel(t);
      // Deterministic nonce plus marker readback protects crash retries and echo loops.
      const marker = 'FIMA:' + m.id;
      let before;
      for (;;) {
        const batch = await c.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        const found = batch.find(x => x.author.id === c.client.user.id && x.embeds.some(e => e.footer?.text === marker));
        if (found) return found.id;
        if (batch.size < 100) break;
        before = batch.last().id;
      }
      const body = m.text || 'Attachment';
      const embeds = [new EmbedBuilder().setTitle((m.author + ' · ' + m.role).slice(0,256)).setDescription(body.slice(0,4000)).setColor(0x9b5cff).setTimestamp(new Date(m.createdAt)).setFooter({ text: marker })];
      const overflow = body.length > 4000 ? [{ attachment: Buffer.from(body, 'utf8'), name: 'message-' + m.id + '.txt' }] : [];
      if (overflow.length) embeds[0].setDescription(body.slice(0, 3900) + '\n\nFull message attached as a text file.');
      if (m.id === t.messages[0].id) embeds[0].addFields({ name: 'Category', value: t.category }, { name: 'Ticket', value: t.id });
      const sent = await c.send({ embeds, files: [...m.attachments.map(f => ({ attachment: Buffer.from(f.data, 'base64'), name: f.name })), ...overflow], allowedMentions: { parse: [] }, nonce: BigInt('0x' + Buffer.from(m.id).toString('hex').slice(0, 16)).toString(), enforceNonce: true, ...(m.id === t.messages[0].id ? { components: [controlRow(t)] } : {}) });
      return sent.id;
    },
    async controls(t) {
      const c = await channel(t);
      const g = c.guild;
      const allow = { ViewChannel: true, SendMessages: t.status !== 'CLOSED', ReadMessageHistory: true, AttachFiles: t.status !== 'CLOSED' };
      await c.permissionOverwrites.edit(t.discordUserId, allow);
      for (const overwrite of c.permissionOverwrites.cache.values()) if (overwrite.type === 1 && ![g.members.me.id, t.discordUserId, t.assignedTo].includes(overwrite.id)) await overwrite.delete('Ticket reassigned');
      if (t.assignedTo) await c.permissionOverwrites.edit(t.assignedTo, { ViewChannel: true, SendMessages: t.status !== 'CLOSED', ReadMessageHistory: true });
      await c.setName((t.status === 'CLOSED' ? 'closed-' : 'ticket-') + t.id.slice(0, 8));
      const marker = 'FIMA-control:' + t.events.length;
      const recent = await c.messages.fetch({ limit: 100 });
      if (!recent.some(m => m.author.id === c.client.user.id && m.embeds.some(e => e.footer?.text === marker))) await c.send({ ...(t.status === 'ESCALATED' ? { content: [...new Set(managementRoles())].map(id => '<@&' + id + '>').join(' ') || 'Senior staff review requested.' } : {}), embeds: [new EmbedBuilder().setTitle('Ticket ' + t.status.replaceAll('_', ' ')).setDescription('Assigned: ' + (t.assignedTo || 'Unassigned') + '\n' + (t.events.at(-1)?.reason || '')).setColor(0x9b5cff).setFooter({ text: marker })], allowedMentions: { parse: [], roles: t.status === 'ESCALATED' ? [...new Set(managementRoles())] : [] } });
    },
    async logTranscript(t, transcript) {
      const c = await archiveChannel();
      const marker = 'FIMA-transcript:' + transcript.id;
      let before;
      for (;;) {
        const batch = await c.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        const existing = batch.find(m => m.author.id === c.client.user.id && m.content.includes(marker));
        if (existing) return verifyArchive(existing, transcript);
        if (batch.size < 100) break;
        before = batch.last().id;
      }
      const sent = await c.send({ content: marker + '\n' + url(t) + '\nSHA256: ' + transcript.sha256, files: [{ attachment: Buffer.from(transcript.html), name: 'ticket-' + t.id + '.html' }], allowedMentions: { parse: [] } });
      return verifyArchive(await c.messages.fetch(sent.id), transcript);
    },
    async reconcileMessages(t) {
      if (t.status === 'CLOSED') return;
      const c = await channel(t);
      let cursor = t.discordCursor;
      if (!cursor) cursor = ((BigInt(new Date(t.createdAt).getTime() - 1420070400000) << 22n)).toString();
      for (let page = 0; page < 5; page++) {
        const messages = await c.messages.fetch({ limit: 100, after: cursor });
        if (!messages.size) break;
        const ordered = [...messages.values()].sort((a,b) => a.createdTimestamp - b.createdTimestamp);
        for (const message of ordered) {
          if (!message.author.bot && !message.webhookId) {
            try { await ingestWebSupportMessage(message); }
            catch (e) {
              const permanent = ['attachment_size_limit', 'attachment_count_limit', 'attachment_content_mismatch', 'unsafe_attachment', 'unsafe_discord_attachment', 'ticket_not_found', 'staff_only', 'ticket_closed', 'ticket_message_limit', 'ticket_storage_limit'];
              if (!permanent.includes(e.code || e.message)) throw e;
              await store.change(t.id, { id: 'worker', action: 'discord_message_rejected', noTouch: true }, v => { if (v.events.some(x => x.discordMessageId === message.id)) return false; v.events.push({ type: 'discord_message_rejected', discordMessageId: message.id, actor: message.member?.displayName || message.author.username, at: message.createdAt.toISOString(), reason: (e.code || e.message) + ' (' + message.id + ')' }); });
              await c.send({ content: 'Message ' + message.id + ' could not be saved to the website: ' + (e.code || e.message) + '. Please send a supported file or contact ticket staff.', allowedMentions: { parse: [] } });
            }
          }
          cursor = message.id;
          await store.change(t.id, { id: 'worker', action: 'discord_cursor', noTouch: true }, v => { v.discordCursor = cursor; });
        }
        if (messages.size < 100) break;
      }
    },
    async delete(t) {
      const c = await channel(t);
      if (t.status !== 'CLOSED' || !t.transcripts.at(-1)?.verified || !t.transcripts.at(-1)?.logMessageId) throw new Error('delete_preconditions_failed');
      const log = await archiveChannel();
      await verifyArchive(await log.messages.fetch(t.transcripts.at(-1).logMessageId), t.transcripts.at(-1));
      await c.delete('Confirmed deletion; website history and verified transcript retained: ' + t.id);
    }
  };
  access = gateway;
  configureSupportDiscord(gateway);
  if (!stopWorker) stopWorker = startSupportWorker();
  void publishSupportPanel().catch(e => console.warn('[web-support] panel unavailable:', e.code || 'discord_unavailable'));
  async function publishSupportPanel() {
    const g = await guild(), channels = await g.channels.fetch();
    const c = channels.find(c => c?.name === '◇・support');
    if (!c?.isTextBased()) throw new Error('support_panel_channel_unavailable');
    const marker = 'FIMA-WEB-SUPPORT:2A';
    let panel, before;
    for (;;) {
      const recent = await c.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      panel = recent.find(m => m.author.id === g.members.me.id && m.embeds.some(e => e.footer?.text === marker));
      if (panel || recent.size < 100) break;
      before = recent.last().id;
    }
    const payload = { embeds: [new EmbedBuilder().setTitle('FIMA Care · Support / Destek').setDescription('**EN** — Choose your issue, share details and follow the same conversation on the website and Discord. Never share passwords, full license keys or card details.\n\n**TR** — Sorununuzu seçin, ayrıntıları paylaşın; aynı konuşmayı website ve Discord üzerinden takip edin. Şifre, tam lisans anahtarı veya kart bilgisi paylaşmayın.').setColor(0x9b5cff).setFooter({ text: marker })], components: [new ActionRowBuilder().addComponents(...[['Open support / Destek',home() + '/support'],['My tickets / Ticketlarım',home() + '/support'],['FAQ / SSS','https://discord.com/channels/' + SUPPORT_GUILD + '/1557555440643084369/1557555461916459020'],['Account recovery / Hesap kurtarma',home() + '/forgot-password']].map(([label, href]) => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(href)))], allowedMentions: { parse: [] } };
    if (panel) await panel.edit(payload); else panel = await c.send(payload);
    const saved = await c.messages.fetch(panel.id);
    if (saved.author.id !== g.members.me.id || !saved.embeds.some(e => e.footer?.text === marker) || saved.components[0]?.components.length !== 4) throw new Error('support_panel_readback_failed');
    const key = 'web-support:v1:panel';
    await prisma.setting.upsert({ where: { key }, create: { key, value: { guildId: SUPPORT_GUILD, channelId: c.id, messageId: panel.id, legacyPanelsPreserved: true, dependency: 'Existing bots and component handlers remain active; legacy panels retained.', verifiedAt: new Date().toISOString() } }, update: { value: { guildId: SUPPORT_GUILD, channelId: c.id, messageId: panel.id, legacyPanelsPreserved: true, dependency: 'Existing bots and component handlers remain active; legacy panels retained.', verifiedAt: new Date().toISOString() } } });
  }
}

export async function ingestWebSupportMessage(message) {
  if (!access || message.author?.bot || message.webhookId || message.guildId !== SUPPORT_GUILD) return false;
  const t = (await store.all()).find(t => t.channelId === message.channelId && !t.channelDeleted);
  if (!t) return false;
  const perms = await access.permissions(message.author.id).catch(() => ({}));
  const actor = { id: message.author.id === t.discordUserId ? t.ownerId : 'discord:' + message.author.id, discordId: message.author.id, guildId: SUPPORT_GUILD, name: message.member?.displayName || message.author.username, ...perms };
  const files = [];
  for (const f of message.attachments.values()) {
    if (f.size > 5242880 || files.length >= 4) throw new Error('attachment_size_limit');
    const u = new URL(f.url);
    if (!['cdn.discordapp.com', 'media.discordapp.net'].includes(u.hostname) || u.protocol !== 'https:') throw new Error('unsafe_discord_attachment');
    const response = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('attachment_download_failed');
    const reader = response.body.getReader(); let size = 0; const chunks = [];
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 5242880) { await reader.cancel(); throw new Error('attachment_size_limit'); } chunks.push(Buffer.from(value)); }
    files.push({ name: f.name, data: Buffer.concat(chunks).toString('base64') });
  }
  validateAttachments(files);
  await addMessage(t.id, actor, { requestId: 'discord-' + message.id, text: message.content, attachments: files, createdAt: message.createdAt.toISOString() }, 'discord');
  return true;
}

export async function handleWebSupportInteraction(i) {
  if (!String(i.customId || '').startsWith('fima_webticket:')) return false;
  if (i.guildId !== SUPPORT_GUILD) { await i.reply({ content: 'This ticket belongs to the FIMA guild.', ephemeral: true }); return true; }
  const [, action, id] = i.customId.split(':');
  const t = await store.get(id);
  if (!t || t.channelId !== i.channelId) { await i.reply({ content: 'Ticket unavailable.', ephemeral: true }); return true; }
  const permissions = await access.permissions(i.user.id).catch(() => ({}));
  const actor = { id: i.user.id === t.discordUserId ? t.ownerId : 'discord:' + i.user.id, discordId: i.user.id, guildId: SUPPORT_GUILD, name: i.member?.displayName || i.user.username, ...permissions };
  if (!permissions.work && !(i.user.id === t.discordUserId && action === 'close')) { await i.reply({ content: 'Ticket staff access required.', ephemeral: true }); return true; }
  if (i.isButton() && action === 'assign') {
    if (!permissions.manage) { await i.reply({ content: 'Ticket manage access required.', ephemeral: true }); return true; }
    await i.reply({ content: 'Choose authorized ticket staff.', components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('fima_webticket:assign:' + id).setPlaceholder('Assign staff'))], ephemeral: true }); return true;
  }
  if (i.isButton() && ['close', 'escalate'].includes(action)) {
    if (action === 'escalate' && !permissions.work) { await i.reply({ content: 'Ticket manage access required.', ephemeral: true }); return true; }
    await i.showModal(new ModalBuilder().setCustomId('fima_webticket:' + action + ':' + id).setTitle(action === 'close' ? 'Close ticket and save transcript' : 'Escalate ticket').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason (required)').setStyle(TextInputStyle.Paragraph).setMinLength(5).setMaxLength(1000).setRequired(true)))); return true;
  }
  await i.deferReply({ ephemeral: true });
  try {
    const assignedTo = i.isUserSelectMenu() ? i.values[0] : undefined;
    if (assignedTo && !(await access.permissions(assignedTo)).work) throw new Error('Assignee is not authorized ticket staff.');
    await ticketAction(id, actor, { action, assignedTo, reason: i.isModalSubmit() ? i.fields.getTextInputValue('reason') : undefined });
    await i.editReply('Saved. Discord synchronization will retry automatically.');
  } catch (e) { await i.editReply(String(e.code || e.message).slice(0, 150)); }
  return true;
}
