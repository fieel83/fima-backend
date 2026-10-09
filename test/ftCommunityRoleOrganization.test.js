import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFtRoleOrganizationPlan, buildFtRoleStepPlan, classifyFtRole, organizeFtRoles, inspectFtRoleOrganization, reconcileFtRoleOrganization } from '../src/ftCommunityRoleOrganization.js';

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
  assert.equal(classifyFtRole({ name: 'FIMA Macro Updates' }), 'Notifications');
});

test('controlled step submits one role and predicts its implicit adjacent shift', async () => {
  const f = fixture(); const journals = [];
  f.rows.find(row => row.id === '1420402168443306126').name = '◇・SYSTEM / XP / LEVELS';
  f.rows.find(row => row.id === 'lang').name = 'South America';
  f.rows.find(row => row.id === 'region').name = 'English';
  const original = structuredClone(f.rows);
  const plan = await organizeFtRoles({ guild: f.guild, singleStep: true });
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.implicitMoves.length, 1);
  assert.equal(plan.renames.length, 0);
  f.guild.roles.setPositions = async updates => {
    assert.deepEqual(updates, [{ role: plan.moves[0].id, position: plan.moves[0].position }]);
    assert.deepEqual(journals.at(-1).positionRequest.body, [{ id: plan.moves[0].id, position: plan.moves[0].position }]);
    f.calls.push(['positions']);
    for (const row of [...plan.moves, ...plan.implicitMoves]) f.rows.find(item => item.id === row.id).position = row.position;
  };
  const result = await organizeFtRoles({ guild: f.guild, singleStep: true, expectedDigest: plan.digest,
    actorUserId: 'owner', saveJournal: async journal => journals.push(journal) });
  assert.equal(f.calls.length, 1);
  for (const row of f.rows) {
    const prior = original.find(item => item.id === row.id);
    assert.deepEqual(row.permissions, prior.permissions);
    assert.equal(row.name, prior.name);
    if (row.managed || row.permissions.length || row.id === '1420402168443306126') assert.equal(row.position, prior.position);
  }
  assert.equal(result.status, 'role_step_verified');
});

test('controlled plan excludes managed crossings, position gaps and bot boundaries', () => {
  const f = fixture();
  const rows = f.rows.filter(row => ['bot', 'admin', 'level5', 'level50', GUILD].includes(row.id));
  rows.find(row => row.id === 'level5').managed = true;
  assert.equal(buildFtRoleStepPlan(rows, 9).moves.length, 0);
  rows.find(row => row.id === 'level5').managed = false;
  rows.find(row => row.id === 'level50').position = 4;
  assert.equal(buildFtRoleStepPlan(rows, 9).moves.length, 0);
  rows.find(row => row.id === 'level50').position = 5;
  assert.equal(buildFtRoleStepPlan(rows, 6).moves.length, 0);
});

test('controlled failure saves actual REST JSON without credentials and makes no second move', async () => {
  const f = fixture(); const journals = [];
  const payload = [{ id: '1557291939337080925', position: 5 }];
  const plan = await organizeFtRoles({ guild: f.guild, singleStep: true });
  f.guild.roles.setPositions = async () => {
    f.calls.push(['positions']);
    throw Object.assign(new Error('Missing Permissions'), { code: 50013, status: 403, method: 'PATCH',
      requestBody: { json: payload, headers: { Authorization: 'secret-test-token' } }, rawError: { message: 'secret-test-token' } });
  };
  await assert.rejects(organizeFtRoles({ guild: f.guild, singleStep: true, expectedDigest: plan.digest,
    actorUserId: 'owner', saveJournal: async journal => journals.push(journal) }), /Missing Permissions/);
  const journal = journals.at(-1);
  assert.equal(journal.status, 'recovery_required');
  assert.equal(journal.failureEvidence.discordCode, 50013);
  assert.equal(journal.failureEvidence.requestPayloadSource, 'discord_rest_error');
  assert.deepEqual(journal.failureEvidence.requestPayload, payload);
  assert.equal(JSON.stringify(journal).includes('secret-test-token'), false);
  assert.equal(f.calls.length, 1);
});

test('controlled execution rejects old bulk digest and missing Owner before any mutation', async () => {
  const f = fixture();
  const bulk = await organizeFtRoles({ guild: f.guild });
  const step = await organizeFtRoles({ guild: f.guild, singleStep: true });
  await assert.rejects(organizeFtRoles({ guild: f.guild, singleStep: true, expectedDigest: bulk.digest, actorUserId: 'owner', saveJournal() {} }), /migration_stale_plan/);
  await assert.rejects(organizeFtRoles({ guild: f.guild, singleStep: true, expectedDigest: step.digest, saveJournal() {} }), /owner_actor_required/);
  assert.equal(f.calls.length, 0);
});

test('invalid positions and unresolved role IDs remain diagnostic evidence without arbitrary strings', async () => {
  const f = fixture(); const journals = [];
  const plan = await organizeFtRoles({ guild: f.guild, singleStep: true });
  f.guild.roles.setPositions = async () => { throw Object.assign(new Error('Invalid payload'), { code: 50035, status: 400,
    method: 'PATCH', requestBody: { json: [{ id: null, position: -1 }, { id: '1557291939337080925', position: 2.5 },
      { id: 'secret-test-token', position: 'secret-test-token' }] } }); };
  await assert.rejects(organizeFtRoles({ guild: f.guild, singleStep: true, expectedDigest: plan.digest,
    actorUserId: 'owner', saveJournal: async journal => journals.push(journal) }), /Invalid payload/);
  assert.deepEqual(journals.at(-1).failureEvidence.requestPayload, [{ id: null, position: -1 },
    { id: '1557291939337080925', position: 2.5 }, { id: 'invalid_role_id', position: 'invalid_position_type' }]);
  assert.equal(JSON.stringify(journals).includes('secret-test-token'), false);
});

test('fresh bot hierarchy drift aborts controlled PATCH and preserves recovery lock', async () => {
  const f = fixture(); const journals = [];
  const plan = await organizeFtRoles({ guild: f.guild, singleStep: true });
  let reads = 0;
  f.guild.members.fetchMe = async () => ({ permissions: { has: () => true }, roles: { highest: { position: ++reads === 1 ? 9 : 8 } } });
  await assert.rejects(organizeFtRoles({ guild: f.guild, singleStep: true, expectedDigest: plan.digest,
    actorUserId: 'owner', saveJournal: async journal => journals.push(journal) }), /bot_hierarchy_changed/);
  assert.equal(f.calls.length, 0);
  assert.equal(journals.at(-1).status, 'recovery_required');
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

async function failedPositionFixture() {
  const f = fixture(); const journals = [];
  const plan = await organizeFtRoles({ guild: f.guild });
  f.guild.roles.setPositions = async () => { throw Object.assign(new Error('Missing Permissions'), { code: 50013, status: 403, method: 'PATCH' }); };
  await assert.rejects(organizeFtRoles({ guild: f.guild, expectedDigest: plan.digest,
    actorUserId: 'owner', saveJournal: async journal => journals.push(journal) }), /Missing Permissions/);
  return { ...f, journal: journals.at(-1) };
}

test('50013 records exact failure stage, target roles and current hierarchy', async () => {
  const f = await failedPositionFixture();
  const evidence = f.journal.failureEvidence;
  assert.equal(evidence.stage, 'positions');
  assert.equal(evidence.httpStatus, 403);
  assert.equal(evidence.method, 'PATCH');
  assert.deepEqual(evidence.targetRoleIds, f.journal.plan.moves.map(row => row.id));
  assert.equal(evidence.permissions.highestPosition, 9);
  assert.equal(evidence.permissions.manageRoles, true);
  assert.equal(evidence.permissions.roles.find(row => row.id === 'bot').movable, false);
});

test('reviewed partial-write recovery preserves evidence and never writes Discord', async () => {
  const f = await failedPositionFixture(); const original = structuredClone(f.journal);
  const initialCalls = structuredClone(f.calls); const saved = [];
  const review = await reconcileFtRoleOrganization({ guild: f.guild, journal: f.journal });
  assert.equal(review.disposition, 'recovered_partial');
  assert.equal(review.discordWrites, 0);
  assert.deepEqual(f.journal, original);
  await assert.rejects(reconcileFtRoleOrganization({ guild: f.guild, journal: f.journal,
    expectedDigest: review.digest, saveJournal: async journal => saved.push(journal) }), /migration_journal_required/);
  const recovered = await reconcileFtRoleOrganization({ guild: f.guild, journal: f.journal,
    expectedDigest: review.digest, actorUserId: 'owner', saveJournal: async journal => saved.push(journal) });
  assert.equal(recovered.status, 'recovered_partial');
  assert.equal(saved.length, 1);
  assert.deepEqual(recovered.before, original.before);
  assert.deepEqual(recovered.observed, original.observed);
  assert.equal(recovered.error, 50013);
  assert.deepEqual(f.calls, initialCalls);
  assert.deepEqual(f.journal, original);
});

test('recovery rejects stale digest and external inventory changes', async () => {
  const f = await failedPositionFixture(); let saves = 0;
  await assert.rejects(reconcileFtRoleOrganization({ guild: f.guild, journal: f.journal,
    expectedDigest: '0'.repeat(64), actorUserId: 'owner', saveJournal: async () => saves++ }), /migration_stale_plan/);
  f.rows.find(row => row.id === 'member').name = 'External change';
  await assert.rejects(reconcileFtRoleOrganization({ guild: f.guild, journal: f.journal }), /role_recovery_inventory_drift/);
  assert.equal(saves, 0);
});

test('recovery refuses permission changes and ambiguous partially moved roles', async () => {
  const f = await failedPositionFixture();
  f.rows.find(row => row.id === 'member').permissions.push('ManageMessages');
  f.journal.observed.find(row => row.id === 'member').permissions.push('ManageMessages');
  await assert.rejects(reconcileFtRoleOrganization({ guild: f.guild, journal: f.journal }), /role_recovery_invariant_drift/);
  const g = await failedPositionFixture();
  g.rows.find(row => row.id === 'level50').position = 6;
  g.journal.observed.find(row => row.id === 'level50').position = 6;
  await assert.rejects(reconcileFtRoleOrganization({ guild: g.guild, journal: g.journal }), /role_recovery_ambiguous_changes/);
});

test('lost successful position response reconciles as complete without replay', async () => {
  const f = await failedPositionFixture();
  for (const row of f.journal.plan.positions) f.rows.find(item => item.id === row.id).position = row.position;
  f.journal.observed = structuredClone(f.rows).sort((a, b) => a.id.localeCompare(b.id));
  const review = await reconcileFtRoleOrganization({ guild: f.guild, journal: f.journal });
  assert.equal(review.disposition, 'recovered_complete');
  assert.equal(f.calls.length, 1);
});

test('final inventory readback and journal persistence failures keep original recovery locked', async () => {
  const f = await failedPositionFixture();
  const review = await reconcileFtRoleOrganization({ guild: f.guild, journal: f.journal });
  await assert.rejects(reconcileFtRoleOrganization({ guild: f.guild, journal: f.journal,
    expectedDigest: review.digest, actorUserId: 'owner', saveJournal: async () => { throw new Error('db unavailable'); } }), /db unavailable/);
  let fetches = 0; let saves = 0;
  f.setFetchHook(() => { if (++fetches === 2) f.rows.find(row => row.id === 'member').name = 'Concurrent edit'; });
  await assert.rejects(reconcileFtRoleOrganization({ guild: f.guild, journal: f.journal,
    expectedDigest: review.digest, actorUserId: 'owner', saveJournal: async () => saves++ }), /role_recovery_inventory_drift/);
  assert.equal(saves, 0);
  assert.equal(f.journal.status, 'recovery_required');
});
