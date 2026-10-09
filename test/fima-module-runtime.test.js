import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fimaRuntimeModuleAllowed, fimaVoiceSettings, FIMA_VOICE_NAMES } from '../src/fimaGuildArchitecture.js';

const source = fs.readFileSync(new URL('../src/paradise3a59.js', import.meta.url), 'utf8');
function handler(name, next, config, overrides = {}) {
  const start = source.indexOf(`async function ${name}(`);
  assert.ok(start >= 0);
  const end = source.indexOf(next, start);
  assert.ok(end > start);
  const body = source.slice(start, end).replace(/\bexport\s*$/, '');
  return vm.runInNewContext(`(${body})`, {
    loadState: async () => ({ guildConfigs: { g: config } }),
    configForGuild: (state, id) => state.guildConfigs[id],
    fimaRuntimeModuleAllowed,
    fimaVoiceSettings,
    FIMA_VOICE_NAMES,
    configuredChannel: () => { throw new Error('Unexpected Discord access'); },
    mergeParadiseCommunityAssetDefaults: () => { throw new Error('Unexpected welcome rendering'); },
    clearTimeout: () => { throw new Error('Unexpected staff refresh'); },
    ...overrides
  });
}
test('disabled voice does not create or inspect a temporary Discord channel', async () => {
  const run = handler('handleParadiseVoiceStateUpdate', '\nfunction levelFromXp', { activeSetupMode: 'clan', modules: { voice: false } });
  const guild = { id: 'g', channels: { create: () => assert.fail('channel created') } };
  assert.equal(await run({ guild }, { guild, member: { user: { bot: false } }, channel: { type: 2, name: 'Join to Create' } }), false);
});
test('disabled levels do not award XP for an eligible guild message', async () => {
  const run = handler('handleMemberLevelMessage', '\nasync function handleRankCommand', { activeSetupMode: 'clan', modules: { levels: false } });
  assert.equal(await run({ guild: { id: 'g' }, author: { bot: false }, member: {}, content: 'hello', channel: { id: 'c' } }), false);
});
test('disabled welcome does not render or send lifecycle messages', async () => {
  const run = handler('sendMemberLifecycleMessage', '\nasync function handleLifecyclePreview', { activeSetupMode: 'community', modules: { welcome: false } });
  assert.equal(await run({ guild: { id: 'g' } }, 'join'), false);
});
test('disabled roles do not schedule staff-directory refreshes', async () => {
  const run = handler('handleParadiseGuildMemberUpdate', '\nfunction localizedHelpLegacy', { activeSetupMode: 'clan', modules: { roles: false } });
  assert.equal(await run({}, { guild: { id: 'g' } }), false);
});


test('canonical Unicode JTC dispatches while explicit channel bindings retain priority', async () => {
  const guild = { id: 'g' };
  const oldState = { guild, channelId: null };
  const newState = { guild, channelId: 'lobby', channel: { id: 'lobby', type: 2, name: '◦・join-to-create' }, member: { id: 'm', user: { bot: false } } };
  let entered = 0;
  const overrides = { ChannelType: { GuildVoice: 2 }, withTemporaryVoiceJoin: async () => { entered++; return true; } };
  const legacy = handler('handleParadiseVoiceStateUpdate', '\nfunction levelFromXp', { activeSetupMode: 'community' }, overrides);
  for (const name of ['◦・join-to-create', '◦・create-room']) {
    newState.channel.name = name;
    assert.equal(await legacy(oldState, newState), true);
  }
  const bound = handler('handleParadiseVoiceStateUpdate', '\nfunction levelFromXp', { activeSetupMode: 'community', channelMappings: { join_to_create: 'explicit' } }, overrides);
  assert.equal(await bound(oldState, newState), false);
  assert.equal(entered, 2);
});

test('setup discovers canonical Unicode voice resources without channel creation', () => {
  const start = source.indexOf('function paradiseVoiceSetupIds(');
  const end = source.indexOf('\n}', start) + 2;
  const run = vm.runInNewContext(`(${source.slice(start, end)})`, { ChannelType: { GuildVoice: 2, GuildCategory: 4 }, FIMA_VOICE_NAMES });
  for (const name of ['◦・join-to-create', '◦・create-room']) {
    const channels = [{ id: 'lobby', type: 2, name }, { id: 'private', type: 4, name: '◉・VOICE' }];
    const result = run({ channels: { cache: { find: predicate => channels.find(predicate) } } });
    assert.equal(result.joinToCreateChannelId, 'lobby');
    assert.equal(result.privateVoiceCategoryId, 'private');
  }
});
