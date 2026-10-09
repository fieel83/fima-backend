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
  assert.equal(plan.targetCategories.find(row => row.key === 'START').existingId, 'cat');
  assert.equal(plan.targetCategories.find(row => row.key === 'START').decision, 'rename');
  assert.equal(plan.matrix.find(row => row.id === 'rules').decision, 'keep');
  assert.equal(plan.matrix.find(row => row.id === 'voice').targetCategory, '◉・VOICE');
  assert.equal(plan.matrix.find(row => row.id === 'private').decision, 'archive');
  assert.deepEqual(plan.unresolvedChannelIds, ['unknown']);
  assert.ok(plan.matrix.every(row => row.preserveId && row.preserveHistory && row.preservePermissionOverwrites));
  assert.equal(plan.productionMutationAllowed, false);
  assert.deepEqual(plan.deletionOperations, []);
});

test('audited legacy voice names change without touching IDs, access or unrelated rooms', () => {
  const input = audit();
  input.categories.push({ id: 'voice-category', name: '◉・VOICE' });
  input.channels = ['1552741177642455121', '1512019964192620594', 'unrelated'].map(id => ({
    id, name: '◦・v1', type: 'GuildVoice', parentId: 'voice-category',
    permissionOverwrites: [{ id: FT_MIGRATION_GUILD_ID, type: 0, deny: ['ViewChannel'], allow: [] }]
  }));
  const before = structuredClone(input);
  const plan = buildFtCommunityMigrationPlan(input);
  assert.equal(plan.matrix.find(row => row.id === '1552741177642455121').targetName, '◦・general-voice');
  assert.equal(plan.matrix.find(row => row.id === '1512019964192620594').targetName, '◦・private-voice');
  assert.equal(plan.matrix.find(row => row.id === 'unrelated').targetName, '◦・v1');
  assert.ok(plan.matrix.every(row => row.decision === 'keep' && row.preserveId
    && row.preservePermissionOverwrites && !row.permissionReviewRequired));
  assert.deepEqual(input, before);
  input.channels.forEach(channel => { channel.name = plan.matrix.find(row => row.id === channel.id).targetName; });
  assert.ok(buildFtCommunityMigrationPlan(input).matrix.every(row => row.name === row.targetName));
});

test('a channel without a parent must move when its target category does not exist', () => {
  const input = audit(); input.channels.push({ id: 'help', name: 'support', type: 0, parentId: null });
  assert.equal(buildFtCommunityMigrationPlan(input).matrix.find(row => row.id === 'help').decision, 'move');
});

test('vouches moves to HELP with its history and buyer overrides preserved', () => {
  const input = audit();
  input.categories.push({ id: 'community', name: '⌗・COMMUNITY' }, { id: 'help', name: '◇・HELP' });
  input.channels = [{ id: 'vouches', name: '⌁・vouches', type: 0, parentId: 'community',
    permissionOverwrites: [{ id: 'buyer', type: 0, allow: ['SendMessages'], deny: [] }] }];
  const before = structuredClone(input);
  const row = buildFtCommunityMigrationPlan(input).matrix[0];
  assert.equal(row.targetCategoryId, 'help');
  assert.equal(row.targetName, '›・vouches');
  assert.equal(row.decision, 'move');
  assert.equal(row.accessRequirement, 'public_read_verified_buyers_write');
  assert.ok(row.preserveId && row.preserveHistory && row.preservePermissionOverwrites);
  assert.deepEqual(input, before);
  input.channels[0].name = row.targetName;
  input.channels[0].parentId = row.targetCategoryId;
  const after = buildFtCommunityMigrationPlan(input).matrix[0];
  assert.equal(after.decision, 'keep');
  assert.equal(after.targetName, row.targetName);
  assert.equal(after.permissionReviewRequired, true);
});

test('canonical rotating showcases retain their information prefix and channel identity', () => {
  const input = audit();
  input.categories = [{ id: 'community', name: '⌗・COMMUNITY' }];
  input.channels = ['outfits', 'capes'].map(id => ({ id, name: `⌁・${id}`, type: 0, parentId: 'community' }));
  const plan = buildFtCommunityMigrationPlan(input);
  for (const row of plan.matrix) {
    assert.equal(row.targetName, row.name);
    assert.equal(row.decision, 'keep');
    assert.equal(row.targetCategoryId, 'community');
    assert.ok(row.preserveId && row.preserveHistory && row.preservePermissionOverwrites);
  }
});

test('already placed restricted channels still require effective access review', () => {
  const input = audit();
  input.categories = [{ id: 'staff', name: '□・STAFF' }, { id: 'community', name: '⌗・COMMUNITY' }];
  input.channels = [{ id: 'staff-chat', name: '›・staff-chat', type: 0, parentId: 'staff' },
    { id: 'turkish', name: '›・sohbet', type: 0, parentId: 'community' }];
  const plan = buildFtCommunityMigrationPlan(input);
  assert.ok(plan.matrix.every(row => row.decision === 'keep' && row.permissionReviewRequired));
  assert.equal(plan.matrix.find(row => row.id === 'staff-chat').accessRequirement, 'reviewed_staff_only');
  assert.equal(plan.matrix.find(row => row.id === 'turkish').accessRequirement, 'turkish_role_and_reviewed_staff');
  assert.equal(plan.targetCategories.find(row => row.key === 'STAFF').permissionReviewRequired, true);
});

test('duplicate categories need review and cannot become automatic destinations', () => {
  const input = audit(); input.categories.push({ id: 'other', name: '⌂・START' });
  const plan = buildFtCommunityMigrationPlan(input);
  assert.equal(plan.targetCategories.find(row => row.key === 'START').decision, 'review');
  assert.equal(plan.targetCategories.find(row => row.key === 'START').existingId, null);
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

test('digest ignores overwrite and permission ordering but detects actual access changes', () => {
  const input = audit();
  input.channels[0].permissionOverwrites = [
    { id: 'b', type: 0, allow: ['ViewChannel', 'SendMessages'], deny: ['ManageChannels', 'ManageMessages'] },
    { id: 'a', type: 1, allow: [], deny: ['ViewChannel'] }
  ];
  const first = buildFtCommunityMigrationPlan(input).sourceDigest;
  input.channels[0].permissionOverwrites.reverse();
  for (const row of input.channels[0].permissionOverwrites) { row.allow.reverse(); row.deny.reverse(); }
  assert.equal(buildFtCommunityMigrationPlan(input).sourceDigest, first);
  input.channels[0].permissionOverwrites[0].deny = [];
  assert.notEqual(buildFtCommunityMigrationPlan(input).sourceDigest, first);
});

test('private staff rules and procedures keep their purpose while old material is archived', () => {
  const input = audit();
  input.categories.push({ id: 'staff', name: 'STAFF' });
  input.channels.push(...[
    ['staff-rules', 'rules', 'GuildText'], ['mods', 'moderator-only', 'GuildText'],
    ['steps', 'steps', 'GuildText'], ['forum', 'macro-steps', 'GuildForum'],
    ['old-material', 'old-things', 'GuildText']
  ].map(([id, name, type]) => ({ id, name, type, parentId: 'staff' })));
  const plan = buildFtCommunityMigrationPlan(input);
  for (const id of ['staff-rules', 'mods', 'steps', 'forum']) {
    assert.equal(plan.matrix.find(row => row.id === id).targetCategory, '□・STAFF');
  }
  assert.equal(plan.matrix.find(row => row.id === 'rules').targetCategory, '⌂・START');
  assert.equal(plan.matrix.find(row => row.id === 'forum').type, 15);
  assert.equal(plan.matrix.find(row => row.id === 'old-material').decision, 'archive');
  assert.deepEqual(plan.unresolvedChannelIds, ['unknown']);
});


test('master category order preserves archived procedures and private support conversations', () => {
  const input = audit();
  input.categories.push({ id: 'archive', name: '▤・ARCHIVE' }, { id: 'help', name: '◇・HELP' });
  input.channels = [
    { id: 'steps', name: 'steps', type: 0, parentId: 'archive' },
    { id: 'forum', name: 'macro-steps', type: 15, parentId: 'archive' },
    { id: 'ticket', name: 'ticket-product-support-user', type: 0, parentId: 'help',
      permissionOverwrites: [{ id: FT_MIGRATION_GUILD_ID, type: 0, deny: ['ViewChannel'], allow: [] }] },
    { id: 'public-ticket', name: 'ticket-public-unknown', type: 0, parentId: 'help' },
    { id: 'faq', name: '⌁・faq', type: 0, parentId: 'help' }
  ];
  const plan = buildFtCommunityMigrationPlan(input);
  assert.deepEqual(plan.targetCategories.map(row => row.key),
    ['STAFF', 'MANAGEMENT', 'RECORDS', 'START', 'COMMUNITY', 'EVENTS', 'HELP', 'VOICE', 'ARCHIVE']);
  for (const id of ['steps', 'forum']) assert.equal(plan.matrix.find(row => row.id === id).targetCategoryId, 'archive');
  assert.equal(plan.matrix.find(row => row.id === 'ticket').decision, 'keep');
  assert.deepEqual(plan.unresolvedChannelIds, ['public-ticket']);
  assert.ok(!plan.missingChannels.includes('support-faq'));
});
