import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField } from 'discord.js';
import { handleJtcControl, handleJtcSetup, jtcUserLanguage, parseJtcLimit, temporaryVoicePanel } from '../src/fimaJtcControls.js';

function fixture(action = 'limit_modal', userId = 'owner') {
  let state = { guildConfigs: { guild: { guildLanguage: 'en' }, other: { voiceSettings: { enabled: true } } }, temporaryVoices: { room: { guildId: 'guild', channelId: 'room', ownerId: 'owner', locked: false } }, languagePreferences: {} };
  const events = [];
  const actor = { id: userId, permissions: { has: () => false }, roles: { highest: { comparePositionTo: () => 1 } } };
  const target = { id: 'target', user: { bot: false }, voice: { channelId: 'room', disconnect: async () => events.push('disconnect') }, permissions: { has: () => false }, roles: { highest: {} } };
  const room = { id: 'room', guildId: 'guild', type: 2, name: 'Room', userLimit: 0, permissionsFor: () => ({ has: () => true }),
    permissionOverwrites: { cache: new Map([['role', { id: 'role', type: 0, allow: new PermissionsBitField(PermissionsBitField.Flags.Connect), deny: new PermissionsBitField() }]]), edit: async (id, permissions) => events.push([typeof id === 'object' ? id.id : id, permissions]) },
    setUserLimit: async value => { events.push(['limit', value]); room.userLimit = value; }, setName: async value => { events.push(['rename', value]); room.name = value; }, delete: async () => events.push('delete') };
  const guild = { id: 'guild', ownerId: 'guild-owner', channels: { cache: new Map([['room', room]]), fetch: async () => {} }, members: { cache: new Map([[userId, actor]]), fetch: async () => target, fetchMe: async () => ({ id: 'bot' }) } };
  const interaction = { customId: `paradise_voice_${action}:room`, guildId: 'guild', guild, user: { id: userId }, locale: 'en-US', values: ['target'], fields: { getTextInputValue: () => '37' }, isButton: () => false,
    deferReply: async () => { interaction.deferred = true; }, reply: async payload => { interaction.result = payload; }, editReply: async payload => { interaction.result = payload; }, showModal: async modal => { interaction.modal = modal.toJSON(); } };
  const adapter = { loadState: async () => state, saveState: async update => { state = update(state); }, sanitizeName: value => value.includes('unsafe') ? '__rejected__' : value };
  return { interaction, adapter, events, room, actor, guild, get state() { return state; } };
}

test('limit modal writes an arbitrary valid limit and denies invalid values/nonowners/other guilds', async () => {
  const f = fixture(); await handleJtcControl(f.interaction, f.adapter);
  assert.equal(f.room.userLimit, 37); assert.equal(f.state.temporaryVoices.room.userLimit, 37);
  for (const value of ['-1', '100', '1.5', '2e1', 'abc', '']) {
    const bad = fixture(); bad.interaction.fields.getTextInputValue = () => value;
    await handleJtcControl(bad.interaction, bad.adapter); assert.deepEqual(bad.events, []); assert.match(bad.interaction.result.content, /whole number/);
  }
  for (const type of ['nonowner', 'other-guild']) {
    const denied = fixture('limit_modal', type === 'nonowner' ? 'member' : 'owner');
    if (type === 'other-guild') denied.interaction.guildId = 'other';
    await handleJtcControl(denied.interaction, denied.adapter); assert.deepEqual(denied.events, []);
  }
  assert.equal(parseJtcLimit('0'), 0); assert.equal(parseJtcLimit('99'), 99);
});

test('personal language takes priority, decide later follows guild and public panel remains guild language', () => {
  const f = fixture(); f.state.languagePreferences.owner = 'tr';
  assert.equal(jtcUserLanguage(f.state, f.interaction, { guildLanguage: 'en' }), 'tr');
  f.state.languagePreferences.owner = 'later'; assert.equal(jtcUserLanguage(f.state, f.interaction, { guildLanguage: 'en' }), 'en');
  const panel = temporaryVoicePanel('room', 'en'); assert.equal(panel.embeds[0].toJSON().title, 'PRIVATE VOICE CONTROL');
  assert.equal(panel.embeds[0].toJSON().footer, undefined);
  assert.equal(temporaryVoicePanel('room', 'tr', true).components.flatMap(row => row.components).length, 8);
});

test('limit opens a modal; delete requires confirmation and unknown actions never delete', async () => {
  const modal = fixture('limit'); modal.interaction.isButton = () => true;
  await handleJtcControl(modal.interaction, modal.adapter); assert.match(modal.interaction.modal.custom_id, /limit_modal/);
  const f = fixture('delete'); await handleJtcControl(f.interaction, f.adapter); assert.deepEqual(f.events, []);
  f.interaction.customId = 'paradise_voice_delete_confirm:room'; await handleJtcControl(f.interaction, f.adapter);
  assert.deepEqual(f.events, ['delete']); assert.equal(f.state.temporaryVoices.room, undefined);
  const unknown = fixture('unknown'); await handleJtcControl(unknown.interaction, unknown.adapter); assert.deepEqual(unknown.events, []);
});

test('lock restores role allow and neutral everyone baseline; concurrent controls both persist', async () => {
  const f = fixture('lock'); await handleJtcControl(f.interaction, f.adapter);
  assert.equal(f.state.temporaryVoices.room.locked, true);
  assert.ok(f.events.some(([id, permissions] = []) => id === 'role' && permissions.Connect === false));
  await handleJtcControl(f.interaction, f.adapter);
  assert.equal(f.state.temporaryVoices.room.locked, false);
  assert.ok(f.events.some(([id, permissions] = []) => id === 'role' && permissions.Connect === true));
  assert.ok(f.events.some(([id, permissions] = []) => id === 'guild' && permissions.Connect === null));
  const limit = { ...f.interaction, customId: 'paradise_voice_limit_modal:room' };
  const name = { ...f.interaction, customId: 'paradise_voice_rename_modal:room', fields: { getTextInputValue: () => 'New Room' } };
  await Promise.all([handleJtcControl(limit, f.adapter), handleJtcControl(name, f.adapter)]);
  assert.equal(f.state.temporaryVoices.room.userLimit, 37); assert.equal(f.state.temporaryVoices.room.currentName, 'New Room');
});

test('transfer updates backend owner without granting channel management; former owner is rejected', async () => {
  const f = fixture('transfer_select'); await handleJtcControl(f.interaction, f.adapter);
  assert.equal(f.state.temporaryVoices.room.ownerId, 'target');
  assert.ok(f.events.some(([id, permissions]) => id === 'target' && permissions.ManageChannels === null));
  f.events.length = 0; f.interaction.customId = 'paradise_voice_limit_modal:room';
  await handleJtcControl(f.interaction, f.adapter); assert.deepEqual(f.events, []);
});

test('setup reuses lobby idempotently, isolates guild and disable preserves room records', async () => {
  const f = fixture(); const category = { id: 'category', guildId: 'guild', type: 4, permissionsFor: () => ({ has: () => true }) };
  f.room.parent = category; f.guild.channels.cache.set('category', category);
  f.state.guildConfigs.guild.voiceSettings = { joinToCreateChannelId: 'room', privateVoiceCategoryId: 'category' };
  f.interaction.memberPermissions = { has: () => true }; let action = 'setup';
  f.interaction.options = { getString: key => key === 'action' ? action : key === 'language' ? 'en' : null, getChannel: () => null, getInteger: () => 11 };
  f.guild.channels.create = async () => { throw new Error('duplicate lobby'); };
  const adapter = { ...f.adapter, lock: async (_guild, _key, operation) => operation() };
  await handleJtcSetup(f.interaction, adapter); await handleJtcSetup(f.interaction, adapter);
  assert.equal(f.state.guildConfigs.guild.voiceSettings.defaultLimit, 11);
  assert.deepEqual(f.state.guildConfigs.other, { voiceSettings: { enabled: true } });
  action = 'disable'; await handleJtcSetup(f.interaction, adapter);
  assert.equal(f.state.guildConfigs.guild.voiceSettings.enabled, false); assert.ok(f.state.temporaryVoices.room);
});
