import test from 'node:test';
import assert from 'node:assert/strict';
import { fimaModuleStates, fimaInteractionModuleAllowed, fimaPublicConfig, assertFimaModuleSelection, fimaVoiceSettings } from '../src/fimaGuildArchitecture.js';
import { fimaGuildProfileProjection, ensureFimaGlobalProfileId } from '../src/fimaProfileProjection.js';
import { assertFimaPlan, fimaInventoryHash, normalizeFimaPoll, normalizeFimaSetup, fimaSetupDiff } from '../src/fimaGuildOperations.js';
const channelId = '1419335632324657306';
const inventory = { channels: [{ id: channelId, name: 'uploads', type: 0 }], roles: [], integrations: [] };
test('all presets enable Join to Create and expose its voice navigation', () => {
  for (const activeSetupMode of ['community', 'clan', 'tsbtr']) {
    const voice = fimaModuleStates({ activeSetupMode }).find(row => row.id === 'voice');
    assert.equal(voice.enabled, true);
    assert.equal(voice.navigation, 'voice');
    assert.deepEqual(voice.missingBindings, ['join_to_create']);
    const configured = fimaModuleStates({ activeSetupMode, voiceSettings: { joinToCreateChannelId: channelId } }).find(row => row.id === 'voice');
    assert.equal(configured.configured, true);
    assert.equal(fimaInteractionModuleAllowed({ activeSetupMode, modules: { voice: false } }, { customId: 'voice_lock_123' }), false);
  }
});
test('voice bindings require a guild voice channel and category, preserving legacy settings', () => {
  const voiceId = '1420401535204065311';
  const categoryId = '1420401494523383878';
  const voiceInventory = { ...inventory, channels: [...inventory.channels, { id: voiceId, type: 2 }, { id: categoryId, type: 4 }] };
  const old = { voiceSettings: { joinToCreateChannelId: channelId, defaultLimit: 5, autoDelete: false } };
  const next = normalizeFimaSetup({ setupType: 'community', channelMappings: { join_to_create: voiceId, private_voice: categoryId } }, old, voiceInventory);
  assert.deepEqual(fimaVoiceSettings(next), { joinToCreateChannelId: voiceId, privateVoiceCategoryId: categoryId, defaultLimit: 5, autoDelete: false });
  assert.equal(fimaSetupDiff(old, next, voiceInventory).discordMutationCount, 0);
  for (const channelMappings of [{ join_to_create: channelId }, { join_to_create: categoryId }, { private_voice: voiceId }]) {
    assert.throws(() => normalizeFimaSetup({ setupType: 'clan', channelMappings }, {}, voiceInventory), { code: 'invalid_voice_binding' });
  }
});

test('Community enables creator workflows without tickets or competitive modules', () => {
  const enabled = fimaModuleStates().filter(row => row.enabled).map(row => row.id);
  for (const id of ['profiles', 'content', 'polls', 'social']) assert.ok(enabled.includes(id));
  for (const id of ['tickets', 'challenge', 'leaderboards', 'sessions', 'roster']) assert.ok(!enabled.includes(id));
  assert.throws(() => assertFimaModuleSelection({ activeSetupMode: 'community', modules: { challenge: true } }), { code: 'module_dependency_or_compatibility_conflict' });
});
test('Clan dependency changes reject orphaned challenge workflows', () => {
  assert.throws(() => assertFimaModuleSelection({ activeSetupMode: 'clan', modules: { profiles: false } }), { code: 'module_dependency_or_compatibility_conflict' });
  const legacy = fimaModuleStates({ activeSetupMode: 'clan', enabledModules: { training: false } });
  assert.equal(legacy.find(row => row.id === 'sessions').enabled, false);
  assert.equal(legacy.find(row => row.id === 'sessions').healthy, null);
});
test('disabled modules deny commands and persistent legacy/versioned components', () => {
  const config = { activeSetupMode: 'clan', modules: { challenge: false } };
  for (const interaction of [{ commandName: 'challenge' }, { customId: 'challenge_accept_123' }, { customId: 'pv:v1:challenge:g:e:accept' }]) assert.equal(fimaInteractionModuleAllowed(config, interaction), false);
  assert.equal(fimaInteractionModuleAllowed(config, { commandName: 'profile' }), true);
});
test('guild projection cannot override identity or disclose competitive and provider fields', () => {
  const projection = fimaGuildProfileProjection({ profileId: 123, robloxId: 'global', visibility: 'private', token: 'secret', wins: 50 }, { profileId: 999, robloxId: 'local', visibility: 'public', region: 'EU', stageRank: { stage: 2 }, wins: 7 });
  assert.deepEqual(projection, { profileId: 123, robloxId: 'global', visibility: 'private', region: 'EU', stageRank: { stage: 2 } });
});
test('ID allocation preserves legacy IDs without issuing duplicate global identities', () => {
  const state = { profiles: { a: {}, b: { profileId: 111 }, c: {} }, guildProfiles: { g: { a: { profileId: 111 }, c: { profileId: 112 } } } };
  assert.equal(ensureFimaGlobalProfileId(state, 'a'), 113);
  assert.equal(ensureFimaGlobalProfileId(state, 'c'), 112);
  assert.equal(ensureFimaGlobalProfileId(state, 'a'), 113);
  assert.equal(state.guildProfiles.g.a.profileId, 111);
});
test('public projections remove nested credentials and webhook URLs', () => {
  const result = fimaPublicConfig({ nested: { botToken: 'SECRET', safe: 'x' }, url: 'https://discord.com/api/webhooks/123/SECRET', auth: 'Bearer SECRET' });
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
});
test('setup binds existing guild resources and previews zero Discord mutations', () => {
  const old = { unknownLegacy: { keep: true } };
  const next = normalizeFimaSetup({ setupType: 'community', channelMappings: { content: channelId } }, old, inventory);
  assert.deepEqual(next.unknownLegacy, old.unknownLegacy);
  assert.equal(fimaSetupDiff(old, next, inventory).discordMutationCount, 0);
  assert.throws(() => normalizeFimaSetup({ setupType: 'community', channelMappings: { content: '999999999999999999' } }, old, inventory), { code: 'binding_not_in_guild' });
});
test('plans reject actor/guild replay, expiry, version and inventory drift', () => {
  const plan = { guildId: 'g', actorId: 'a', version: 0, inventoryHash: fimaInventoryHash(inventory), expiresAt: 200 };
  const context = { ...plan, now: 100 };
  assert.doesNotThrow(() => assertFimaPlan(plan, context));
  for (const override of [{ guildId: 'other' }, { actorId: 'other' }, { version: 1 }, { inventoryHash: 'other' }, { now: 201 }]) assert.throws(() => assertFimaPlan(plan, { ...context, ...override }));
  assert.equal(fimaInventoryHash({ ...inventory, observedAt: 'a' }), fimaInventoryHash({ ...inventory, observedAt: 'b' }));
});
test('native polls reject invalid bounds and duplicate answers', () => {
  const poll = { channelId, question: 'Next stream?', options: ['Today', 'Tomorrow'], duration: 24, allowMultiselect: false };
  assert.deepEqual(normalizeFimaPoll(poll), poll);
  for (const override of [{ options: ['Yes'] }, { options: ['Yes', 'yes'] }, { question: 'x'.repeat(301) }, { duration: 769 }, { allowMultiselect: 'true' }]) assert.throws(() => normalizeFimaPoll({ ...poll, ...override }), { code: 'invalid_native_poll' });
});
