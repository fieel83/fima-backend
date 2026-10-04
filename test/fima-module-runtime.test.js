import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fimaRuntimeModuleAllowed, fimaVoiceSettings } from '../src/fimaGuildArchitecture.js';

const source = fs.readFileSync(new URL('../src/paradise3a59.js', import.meta.url), 'utf8');
function handler(name, next, config) {
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
    configuredChannel: () => { throw new Error('Unexpected Discord access'); },
    mergeParadiseCommunityAssetDefaults: () => { throw new Error('Unexpected welcome rendering'); },
    clearTimeout: () => { throw new Error('Unexpected staff refresh'); }
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
