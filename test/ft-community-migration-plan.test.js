import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFtCommunityMigrationPlan, FT_MIGRATION_GUILD_ID } from '../src/ftCommunityMigrationPlan.js';

const audit = () => ({ guild: { id: FT_MIGRATION_GUILD_ID }, capturedAt: '2026-10-07',
  categories: [{ id: 'cat', name: 'START', permissionOverwrites: [{ id: 'role', deny: ['ViewChannel'] }] }],
  channels: [{ id: 'rules', name: 'rules', type: 'GuildText', parentId: 'cat' },
    { id: 'voice', name: 'Create a Room', type: 'GuildVoice', parentId: 'old' },
    { id: 'private', name: 'openclaw-private', type: 'GuildText', parentId: 'old' },
    { id: 'unknown', name: 'integration-not-reviewed', type: 'GuildText', parentId: 'old' }] });

test('live audit categories and string channel types produce an ID preserving review plan', () => {
  const input = audit(), before = structuredClone(input), plan = buildFtCommunityMigrationPlan(input);
  assert.deepEqual(input, before);
  assert.equal(plan.targetCategories[0].existingId, 'cat');
  assert.equal(plan.targetCategories[0].decision, 'rename');
  assert.equal(plan.matrix.find(row => row.id === 'rules').decision, 'keep');
  assert.equal(plan.matrix.find(row => row.id === 'voice').targetCategory, '◉ VOICE');
  assert.equal(plan.matrix.find(row => row.id === 'private').decision, 'archive');
  assert.deepEqual(plan.unresolvedChannelIds, ['unknown']);
  assert.ok(plan.matrix.every(row => row.preserveId && row.preserveHistory && row.preservePermissionOverwrites));
  assert.equal(plan.productionMutationAllowed, false);
  assert.deepEqual(plan.deletionOperations, []);
});

test('a channel without a parent must move when its target category does not exist', () => {
  const input = audit(); input.channels.push({ id: 'help', name: 'support', type: 0, parentId: null });
  assert.equal(buildFtCommunityMigrationPlan(input).matrix.find(row => row.id === 'help').decision, 'move');
});

test('duplicate categories need review and cannot become automatic destinations', () => {
  const input = audit(); input.categories.push({ id: 'other', name: '⌂ START' });
  const plan = buildFtCommunityMigrationPlan(input);
  assert.equal(plan.targetCategories[0].decision, 'review');
  assert.equal(plan.targetCategories[0].existingId, null);
});

test('digest detects category permission changes and is stable across inventory order', () => {
  const input = audit(), first = buildFtCommunityMigrationPlan(input).sourceDigest;
  input.channels.reverse();
  assert.equal(buildFtCommunityMigrationPlan(input).sourceDigest, first);
  input.categories[0].permissionOverwrites[0].deny = [];
  assert.notEqual(buildFtCommunityMigrationPlan(input).sourceDigest, first);
});

test('other guilds and missing snapshots cannot generate an FT migration plan', () => {
  assert.equal(buildFtCommunityMigrationPlan(null).status, 'unavailable');
  assert.equal(buildFtCommunityMigrationPlan({ guild: { id: 'other' } }).status, 'unavailable');
});
