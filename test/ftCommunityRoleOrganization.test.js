import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFtRoleOrganizationPlan, classifyFtRole, organizeFtRoles, inspectFtRoleOrganization } from '../src/ftCommunityRoleOrganization.js';

const GUILD = '1419335632324657306';
test('recovery inspection identifies partial writes and external edits without mutating or unlocking', async () => {
  const f = fixture();
  const before = structuredClone(f.rows).sort((a, b) => a.id.localeCompare(b.id));
  f.rows.find(row => row.id === '1420402168443306126').name = '◇・SYSTEM / XP / LEVELS';
  const observed = structuredClone(f.rows);
  f.rows.find(row => row.id === 'member').permissions.push('ManageMessages');
  const journal = { id: 'failed', guildId: GUILD, status: 'recovery_required', error: 50013,
    before, observed, appliedRenames: [], plan: { moves: [] } };
  const original = structuredClone(journal);
  const result = await inspectFtRoleOrganization({ guild: f.guild, journals: [journal, { guildId: 'other' }] });
  assert.equal(result.readOnly, true);
  assert.equal(result.journals.length, 1);
  assert.deepEqual(result.journals[0].comparedWithBefore.changed.map(row => row.id), ['1420402168443306126', 'member']);
  assert.deepEqual(result.journals[0].comparedWithFailure.changed[0].fields, ['permissions']);
  assert.deepEqual(journal, original);
  assert.equal(f.calls.length, 0);
  await assert.rejects(inspectFtRoleOrganization({ guild: { id: 'other' }, journals: [] }), /ft_community_guild_required/);
});
function fixture() {
  const calls = [];
  const row = (id, name, position, permissions = [], managed = false) => ({ id, name, position,
    permissions, managed, editable: !managed && position < 9, color: 0, hoist: false, mentionable: false });
  const rows = [row(GUILD, '@everyone', 0), row('bot', 'FIMA Bot', 9, ['ManageRoles'], true),
    row('admin', 'Admin', 8, ['Administrator']), row('1420402168443306126', 'old divider', 7),
    row('level5', 'Level 5', 6), row('level50', 'Level 50', 5), row('lang', 'English', 4),
    row('region', 'South America', 3), row('privileged', 'Creators', 2, ['ManageRoles']), row('member', 'Members', 1)];
  const cache = new Map(rows.map(item => [item.id, {
    ...item, permissions: { toArray: () => [...item.permissions] },
    async setName(name) { calls.push(['rename', item.id]); item.name = name; }
  }]));
  let fetchHook;
  const guild = { id: GUILD, members: { fetchMe: async () => ({ permissions: { has: () => true }, roles: { highest: { position: 9 } } }) },
    roles: { cache, fetch: async () => { if (fetchHook) fetchHook(); for (const item of rows) Object.assign(cache.get(item.id), { name: item.name, position: item.position }); return cache; },
      setPositions: async updates => { calls.push(['positions']); for (const update of updates) rows.find(item => item.id === update.role).position = update.position; } } };
  return { rows, guild, calls, setFetchHook: hook => { fetchHook = hook; } };
}

test('sorting never crosses privileged, managed or divider boundaries', () => {
  const { rows } = fixture();
  const plan = buildFtRoleOrganizationPlan(rows, 9);
  for (const id of ['bot', 'admin', 'privileged', GUILD, '1420402168443306126']) {
    assert.equal(plan.positions.find(item => item.id === id).position, rows.find(item => item.id === id).position);
  }
  assert.deepEqual(plan.positions.map(item => item.id).sort(), rows.map(item => item.id).sort());
  assert.equal(plan.positions.find(item => item.id === 'level50').position, 6);
  assert.equal(plan.renames.length, 1);
  assert.equal(classifyFtRole({ id: '1420402470990905365', name: 'F T' }), 'Owner / Management');
  assert.equal(classifyFtRole({ name: 'Trial Users' }), 'Community');
});

test('fresh reviewed plan journals before writes and verifies exact readback', async () => {
  const f = fixture(); const journals = [];
  const plan = await organizeFtRoles({ guild: f.guild });
  const result = await organizeFtRoles({ guild: f.guild, expectedDigest: plan.digest, actorUserId: 'owner',
    saveJournal: async journal => { if (!journals.length) assert.equal(f.calls.length, 0); journals.push(journal); } });
  assert.equal(result.status, 'roles_organized');
  assert.equal(result.after.length, f.rows.length);
  assert.equal(result.after.find(item => item.id === 'level50').position, 6);
  assert.deepEqual(f.rows.find(item => item.id === 'privileged').permissions, ['ManageRoles']);
  assert.deepEqual(f.calls.map(item => item[0]), ['rename', 'positions']);
  assert.equal(journals[0].status, 'applying');
});

test('stale plan and unavailable journal perform no mutation', async () => {
  const f = fixture(); const plan = await organizeFtRoles({ guild: f.guild });
  await assert.rejects(organizeFtRoles({ guild: f.guild, expectedDigest: 'stale' }), /migration_stale_plan/);
  await assert.rejects(organizeFtRoles({ guild: f.guild, expectedDigest: plan.digest, saveJournal: async () => { throw new Error('db unavailable'); } }), /db unavailable/);
  assert.equal(f.calls.length, 0);
});

test('concurrent administrator edit aborts and records recovery without overwriting', async () => {
  const f = fixture(); const plan = await organizeFtRoles({ guild: f.guild }); const journals = [];
  let changed = false;
  await assert.rejects(organizeFtRoles({ guild: f.guild, expectedDigest: plan.digest,
    saveJournal: async journal => { journals.push(journal); if (!changed) { changed = true; f.rows.find(item => item.id === 'member').name = 'Changed by admin'; } } }), /concurrent_change/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.rows.find(item => item.id === 'member').name, 'Changed by admin');
  assert.equal(journals.at(-1).status, 'recovery_required');
});

test('lost response retains observed role change and recovery journal', async () => {
  const f = fixture(); const plan = await organizeFtRoles({ guild: f.guild }); const journals = [];
  f.guild.roles.cache.get('1420402168443306126').setName = async name => { f.rows.find(item => item.id === '1420402168443306126').name = name; throw new Error('network timeout'); };
  await assert.rejects(organizeFtRoles({ guild: f.guild, expectedDigest: plan.digest, saveJournal: async journal => journals.push(journal) }), /network timeout/);
  assert.equal(journals.at(-1).status, 'recovery_required');
  assert.equal(journals.at(-1).observed.find(item => item.id === '1420402168443306126').name, '◇・SYSTEM / XP / LEVELS');
  assert.equal(f.calls.length, 0);
});

test('wrong guild or missing ManageRoles fails before role inventory', async () => {
  const f = fixture();
  await assert.rejects(organizeFtRoles({ guild: { id: 'other' } }), /ft_community_guild_required/);
  f.guild.members.fetchMe = async () => ({ permissions: { has: () => false } });
  await assert.rejects(organizeFtRoles({ guild: f.guild }), /manage_roles_required/);
  assert.equal(f.calls.length, 0);
});
