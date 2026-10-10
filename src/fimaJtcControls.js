import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, ModalBuilder,
  PermissionsBitField, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder } from 'discord.js';
import { fimaVoiceSettings, FIMA_VOICE_NAMES } from './fimaGuildArchitecture.js';
const roomMutations = new Map();
async function serializeRoom(key, operation) {
  const previous = roomMutations.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  roomMutations.set(key, current);
  try { return await current; }
  finally { if (roomMutations.get(key) === current) roomMutations.delete(key); }
}

export const JTC_TEXT = Object.freeze({
  en: { title: 'PRIVATE VOICE CONTROL', description: 'Manage your temporary voice channel.', lock: 'Lock / Unlock', hide: 'Hide / Unhide', limit: 'User Limit', rename: 'Rename', permit: 'Permit User', reject: 'Reject User', transfer: 'Transfer Owner', delete: 'Delete Room', controls: 'Open Controls', confirm: 'Confirm deletion', cancel: 'Cancel', name: 'New room name', number: 'User limit (0 = Unlimited, 1–99)', choose: 'Select a server member', denied: 'You cannot manage this temporary room.', invalid: 'Enter a whole number from 0 to 99.', invalidName: 'Use a safe room name with 1–80 characters.', cooldown: 'Please wait 30 seconds before renaming again.', member: 'Select a valid member. Ownership transfer requires a member in this room. Staff cannot be rejected by room owners.', success: 'Room updated.', removed: 'Temporary room deleted.', failed: 'FIMA could not complete this action. Check permissions and try again.', lobby: 'Create a Room', room: "{user}'s Room", setup: 'JTC configuration saved.', admin: 'Only server administrators can configure JTC.', category: 'Select an existing room category with the category option.', permissions: 'FIMA needs View Channel, Connect, Manage Channels, Manage Roles, Move Members, Send Messages and Embed Links in the selected category/lobby.', duplicate: 'Multiple existing lobbies match. Select one with the lobby option.', disabled: 'JTC disabled. Existing rooms remain managed.', status: 'JTC status', instructions: 'Use /setup module:jtc action:setup category:<category> [lobby:<voice channel>] [language:en|tr] [limit:0–99]. Use action:status or action:disable.' },
  tr: { title: 'ÖZEL SES ODASI YÖNETİMİ', description: 'Geçici ses odanı buradan yönetebilirsin.', lock: 'Kilitle / Kilidi Aç', hide: 'Gizle / Göster', limit: 'Kullanıcı Limiti', rename: 'Yeniden Adlandır', permit: 'Kullanıcıya İzin Ver', reject: 'Kullanıcıyı Engelle', transfer: 'Sahipliği Devret', delete: 'Odayı Sil', controls: 'Kontrolleri Aç', confirm: 'Silmeyi Onayla', cancel: 'Vazgeç', name: 'Yeni oda adı', number: 'Kullanıcı limiti (0 = Sınırsız, 1–99)', choose: 'Bir sunucu üyesi seç', denied: 'Bu geçici odayı yönetme yetkin yok.', invalid: '0 ile 99 arasında bir tam sayı gir.', invalidName: '1–80 karakter arasında güvenli bir oda adı kullan.', cooldown: 'Tekrar adlandırmadan önce 30 saniye bekle.', member: 'Geçerli bir üye seç. Sahiplik devri için üye bu odada olmalı. Oda sahipleri yetkili üyeleri engelleyemez.', success: 'Oda güncellendi.', removed: 'Geçici oda silindi.', failed: 'FIMA bu işlemi tamamlayamadı. İzinleri kontrol edip tekrar dene.', lobby: 'Oda Oluştur', room: '{user} Odası', setup: 'JTC yapılandırması kaydedildi.', admin: 'JTC sistemini yalnız sunucu yöneticileri yapılandırabilir.', category: 'category seçeneğiyle mevcut oda kategorisini seç.', permissions: 'FIMA seçilen kategori/lobide Kanalı Görüntüle, Bağlan, Kanalları Yönet, Rolleri Yönet, Üyeleri Taşı, Mesaj Gönder ve Bağlantı Yerleştir izinlerine ihtiyaç duyar.', duplicate: 'Birden fazla mevcut lobi bulundu. lobby seçeneğiyle birini seç.', disabled: 'JTC kapatıldı. Mevcut odaların yönetimi devam eder.', status: 'JTC durumu', instructions: '/setup module:jtc action:setup category:<kategori> [lobby:<ses kanalı>] [language:en|tr] [limit:0–99] kullan. Durum için action:status, kapatmak için action:disable.' }
});

export function jtcGuildConfig(state, guildId) { return state.guildConfigs?.[guildId] || {}; }
export function jtcGuildLanguage(config = {}, guildId) {
  const language = config.guildLanguage || config.language || config.locale;
  return language ? (String(language).startsWith('tr') ? 'tr' : 'en') : 'en';
}
export function jtcUserLanguage(state, interaction, config) {
  const preference = state.languagePreferences?.[interaction.user.id];
  if (preference === 'en' || preference === 'tr') return preference;
  if (preference === 'later') return jtcGuildLanguage(config, interaction.guildId);
  const profile = state.profiles?.[interaction.user.id];
  if (['en', 'tr'].includes(profile?.preferredLanguage)) return profile.preferredLanguage;
  return interaction.locale ? (interaction.locale.startsWith('tr') ? 'tr' : 'en') : jtcGuildLanguage(config, interaction.guildId);
}
export function parseJtcLimit(value) {
  const text = String(value ?? '').trim();
  return /^(0|[1-9]\d?)$/.test(text) ? Number(text) : null;
}
export function jtcRoomMatches(record, channel, guildId) {
  return Boolean(record && channel && record.guildId === guildId && channel.guildId === guildId
    && record.channelId === channel.id && channel.type === ChannelType.GuildVoice);
}
export function temporaryVoicePanel(channelId, language = 'en', personal = false) {
  const t = JTC_TEXT[language] || JTC_TEXT.en;
  const actions = personal ? ['lock', 'hide', 'limit', 'rename', 'delete', 'permit', 'reject', 'transfer'] : ['controls'];
  const buttons = actions.map(action => new ButtonBuilder().setCustomId(`paradise_voice_${action}:${channelId}`)
    .setLabel(t[action]).setStyle(action === 'delete' ? ButtonStyle.Danger : ButtonStyle.Secondary));
  return { embeds: [new EmbedBuilder().setColor(0x40d6ff).setTitle(t.title).setDescription(`${t.description}\n\n${['lock', 'hide', 'limit', 'rename', 'permit', 'reject', 'transfer', 'delete'].map(key => `• ${t[key]}`).join('\n')}`)],
    components: [new ActionRowBuilder().addComponents(buttons.slice(0, 5)), ...(buttons.length > 5 ? [new ActionRowBuilder().addComponents(buttons.slice(5))] : [])] };
}

const reply = (interaction, content, extra = {}) => interaction.deferred || interaction.replied
  ? interaction.editReply({ content, ...extra }) : interaction.reply({ content, ephemeral: true, ...extra });
const required = ['ViewChannel', 'Connect', 'ManageChannels', 'ManageRoles', 'MoveMembers', 'SendMessages', 'EmbedLinks'].map(key => PermissionsBitField.Flags[key]);

export async function handleJtcSetup(interaction, { loadState, saveState, lock }) {
  const state = await loadState();
  const config = jtcGuildConfig(state, interaction.guildId);
  const language = interaction.options.getString('language') || jtcGuildLanguage(config, interaction.guildId);
  const t = JTC_TEXT[language];
  if (!interaction.guild || !interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) return reply(interaction, t.admin);
  await interaction.deferReply({ ephemeral: true });
  const action = interaction.options.getString('action') || 'status';
  try {
    return await lock(interaction.guild, 'jtc_setup', async () => {
      const current = jtcGuildConfig(await loadState(), interaction.guildId);
      const settings = fimaVoiceSettings(current);
      if (action === 'disable') {
        await saveState(next => { next.guildConfigs[interaction.guildId] = { ...jtcGuildConfig(next, interaction.guildId), voiceSettings: { ...settings, enabled: false } }; return next; });
        return reply(interaction, t.disabled);
      }
      if (action !== 'setup') return reply(interaction, `${t.status}: ${settings.enabled !== false && settings.joinToCreateChannelId ? 'ON' : 'OFF'}\n${language === 'tr' ? 'Lobi' : 'Lobby'}: ${settings.joinToCreateChannelId ? `<#${settings.joinToCreateChannelId}>` : '—'}\n${language === 'tr' ? 'Kategori' : 'Category'}: ${settings.privateVoiceCategoryId ? `<#${settings.privateVoiceCategoryId}>` : '—'}\n${t.instructions}`);
      await interaction.guild.channels.fetch();
      const explicitLobby = interaction.options.getChannel('lobby');
      let lobby = explicitLobby || interaction.guild.channels.cache.get(settings.joinToCreateChannelId);
      if (!lobby) {
        const candidates = [...interaction.guild.channels.cache.values()].filter(ch => ch.type === ChannelType.GuildVoice && [...FIMA_VOICE_NAMES.joinToCreate, 'Oda Oluştur'].includes(ch.name));
        if (candidates.length > 1) return reply(interaction, t.duplicate);
        lobby = candidates[0];
      }
      const category = interaction.options.getChannel('category') || interaction.guild.channels.cache.get(settings.privateVoiceCategoryId) || lobby?.parent;
      if (lobby && (lobby.guildId !== interaction.guildId || lobby.type !== ChannelType.GuildVoice)) return reply(interaction, t.denied);
      if (!category || category.guildId !== interaction.guildId || category.type !== ChannelType.GuildCategory) return reply(interaction, t.category);
      const bot = await interaction.guild.members.fetchMe();
      if (!category.permissionsFor(bot)?.has(required) || (lobby && !lobby.permissionsFor(bot)?.has(required))) return reply(interaction, t.permissions);
      const created = !lobby;
      if (created) lobby = await interaction.guild.channels.create({ name: t.lobby, type: ChannelType.GuildVoice, parent: category.id, reason: 'FIMA JTC setup' });
      try {
        await saveState(next => {
          const previous = jtcGuildConfig(next, interaction.guildId);
          next.guildConfigs[interaction.guildId] = { ...previous, guildLanguage: language,
            channelMappings: { ...previous.channelMappings, join_to_create: lobby.id, private_voice: category.id },
            voiceSettings: { ...previous.voiceSettings, enabled: true, autoDelete: true, joinToCreateChannelId: lobby.id,
              privateVoiceCategoryId: category.id, defaultLimit: interaction.options.getInteger('limit') ?? settings.defaultLimit ?? 0,
              defaultRoomName: settings.defaultRoomName || t.room } };
          return next;
        });
      } catch (error) { if (created && lobby.members.size === 0) await lobby.delete('FIMA JTC setup persistence failure'); throw error; }
      // Refresh only FIMA's own control messages in recorded temporary rooms.
      const saved = await loadState();
      for (const record of Object.values(saved.temporaryVoices || {})) {
        const room = interaction.guild.channels.cache.get(record.channelId);
        if (!jtcRoomMatches(record, room, interaction.guildId) || !room.messages) continue;
        const messages = await room.messages.fetch({ limit: 50 }).catch(() => null);
        if (!messages) continue;
        for (const message of messages.values()) {
          if (message.author.id === bot.id && message.components.some(row => row.components.some(component =>
            component.customId?.startsWith('paradise_voice_') && component.customId.endsWith(`:${room.id}`)))) {
            await message.edit(temporaryVoicePanel(room.id, language)).catch(() => {});
          }
        }
      }
      return reply(interaction, `${t.setup}\n<#${lobby.id}> → <#${category.id}>\n${t.instructions}`);
    });
  } catch { return reply(interaction, t.failed); }
}

export async function handleJtcControl(interaction, { loadState, saveState, sanitizeName }) {
  const [action, channelId] = String(interaction.customId || '').replace('paradise_voice_', '').split(':');
  const state = await loadState();
  const config = jtcGuildConfig(state, interaction.guildId);
  const t = JTC_TEXT[jtcUserLanguage(state, interaction, config)];
  let record = state.temporaryVoices?.[channelId];
  const channel = interaction.guild?.channels.cache.get(channelId);
  const actor = interaction.guild?.members.cache.get(interaction.user.id) || (interaction.guild ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null) : null);
  const staff = actor?.permissions.has(PermissionsBitField.Flags.ManageChannels);
  if (!jtcRoomMatches(record, channel, interaction.guildId) || !actor || !channel.permissionsFor(actor)?.has(PermissionsBitField.Flags.ViewChannel)
    || (record.ownerId !== actor.id && !(staff && ['delete', 'delete_confirm'].includes(action)))) return reply(interaction, t.denied);
  if (action === 'controls') return reply(interaction, '', { ...temporaryVoicePanel(channelId, jtcUserLanguage(state, interaction, config), true) });
  if (interaction.isButton?.() && ['limit', 'rename'].includes(action)) {
    const modal = new ModalBuilder().setCustomId(`paradise_voice_${action}_modal:${channelId}`).setTitle(t[action]);
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(action === 'limit' ? 'voice_limit' : 'voice_name')
      .setLabel(action === 'limit' ? t.number : t.name).setValue(action === 'limit' ? String(channel.userLimit) : channel.name)
      .setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(action === 'limit' ? 2 : 80).setRequired(true)));
    return interaction.showModal(modal);
  }
  if (interaction.isButton?.() && ['permit', 'reject', 'transfer'].includes(action)) return reply(interaction, t.choose, { components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`paradise_voice_${action}_select:${channelId}`).setPlaceholder(t.choose).setMinValues(1).setMaxValues(1))] });
  if (action === 'delete') return reply(interaction, `${t.delete}?`, { components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_voice_delete_confirm:${channelId}`).setLabel(t.confirm).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`paradise_voice_cancel:${channelId}`).setLabel(t.cancel).setStyle(ButtonStyle.Secondary))] });
  if (action === 'cancel') return reply(interaction, t.cancel, { components: [] });
  await interaction.deferReply({ ephemeral: true });
  // Serialize mutations for one room; different owners/guilds remain independent.
  try {
    await serializeRoom(`control:${interaction.guildId}:${channelId}`, async () => {
      record = (await loadState()).temporaryVoices?.[channelId];
      if (!jtcRoomMatches(record, channel, interaction.guildId) || (record.ownerId !== actor.id && !(staff && action === 'delete_confirm'))) throw new Error('jtc_denied');
      const bot = await interaction.guild.members.fetchMe();
      if (!channel.permissionsFor(bot)?.has(required)) throw new Error('jtc_permissions');
      const patch = {};
      if (action === 'lock' || action === 'hide') {
        const key = action === 'lock' ? 'locked' : 'hidden';
        const permission = action === 'lock' ? 'Connect' : 'ViewChannel';
        // Role allows override @everyone denies: restrict every role overwrite,
        // preserving member permits and the exact baseline for unlock/unhide.
        const flag = PermissionsBitField.Flags[permission];
        const baselineKey = `${key}Baseline`;
        let baseline = record[baselineKey];
        if (!record[key] && !baseline) {
          baseline = [...channel.permissionOverwrites.cache.values()].filter(overwrite => overwrite.type === 0)
            .map(overwrite => ({ id: overwrite.id, value: overwrite.deny.has(flag) ? false : overwrite.allow.has(flag) ? true : null }));
          if (!baseline.some(item => item.id === interaction.guild.id)) baseline.push({ id: interaction.guild.id, value: null });
          await saveState(next => { next.temporaryVoices[channelId] = { ...next.temporaryVoices[channelId], [baselineKey]: baseline }; return next; });
        }
        if (!baseline) throw new Error('jtc_permissions');
        if (!record[key]) await channel.permissionOverwrites.edit(bot.id, { ViewChannel: true, Connect: true }, { reason: 'FIMA JTC bot access' });
        for (const item of baseline) {
          await channel.permissionOverwrites.edit(item.id, { [permission]: record[key] ? item.value : false }, { reason: 'FIMA JTC owner control' });
        }
        patch[baselineKey] = record[key] ? null : baseline;
        patch[key] = !record[key];
      } else if (action === 'limit_modal') {
        const limit = parseJtcLimit(interaction.fields.getTextInputValue('voice_limit'));
        if (limit === null) throw new Error('jtc_invalid');
        await channel.setUserLimit(limit, 'FIMA JTC user limit'); patch.userLimit = limit;
      } else if (action === 'rename_modal') {
        const requested = interaction.fields.getTextInputValue('voice_name').normalize('NFKC').trim();
        if (!requested || requested.length > 80 || sanitizeName(requested, '__rejected__') !== requested) throw new Error('jtc_invalidName');
        if (record.renamedAt && Date.now() - Date.parse(record.renamedAt) < 30_000) throw new Error('jtc_cooldown');
        await channel.setName(requested, 'FIMA JTC rename'); patch.currentName = requested; patch.renamedAt = new Date().toISOString();
      } else if (/^(permit|reject|transfer)_(select|modal)$/.test(action)) {
        const operation = action.split('_')[0];
        const targetId = interaction.values?.[0] || interaction.fields?.getTextInputValue('target_user')?.match(/\d{15,22}/)?.[0];
        const member = targetId ? await interaction.guild.members.fetch(targetId).catch(() => null) : null;
        if (!member || member.user.bot || member.id === actor.id || member.id === record.ownerId
          || (operation === 'transfer' && member.voice.channelId !== channelId)
          || (operation === 'reject' && (member.id === interaction.guild.ownerId || member.permissions.has(PermissionsBitField.Flags.ManageChannels)
            || actor.roles.highest.comparePositionTo(member.roles.highest) < 0))) throw new Error('jtc_member');
        if (operation === 'transfer') {
          await channel.permissionOverwrites.edit(member, { ViewChannel: true, Connect: true, ManageChannels: null, MoveMembers: null }, { reason: 'FIMA JTC transfer' });
          await channel.permissionOverwrites.edit(record.ownerId, { ManageChannels: null, MoveMembers: null }, { reason: 'FIMA JTC transfer' });
          patch.ownerId = member.id; patch.transferredAt = new Date().toISOString();
        } else {
          await channel.permissionOverwrites.edit(member, { ViewChannel: operation === 'permit', Connect: operation === 'permit' }, { reason: `FIMA JTC ${operation}` });
          if (operation === 'reject' && member.voice.channelId === channelId) await member.voice.disconnect('FIMA JTC rejected member');
          patch.permittedUserIds = operation === 'permit' ? [...new Set([...(record.permittedUserIds || []), member.id])] : (record.permittedUserIds || []).filter(id => id !== member.id);
          patch.rejectedUserIds = operation === 'reject' ? [...new Set([...(record.rejectedUserIds || []), member.id])] : (record.rejectedUserIds || []).filter(id => id !== member.id);
        }
      } else if (action === 'delete_confirm') {
        await channel.delete('FIMA JTC confirmed temporary room deletion');
        await saveState(next => { delete next.temporaryVoices[channelId]; return next; }); return;
      } else throw new Error('jtc_denied');
      await saveState(next => { const current = next.temporaryVoices[channelId]; if (current?.guildId === interaction.guildId) next.temporaryVoices[channelId] = { ...current, ...patch }; return next; });
    });
    return reply(interaction, action === 'delete_confirm' ? t.removed : `${t.success}${action === 'limit_modal' ? ` (${channel.userLimit || (t === JTC_TEXT.tr ? 'Sınırsız' : 'Unlimited')})` : ''}`, { components: [] });
  } catch (error) { return reply(interaction, t[error.message?.replace('jtc_', '')] || t.failed, { components: [] }); }
}
