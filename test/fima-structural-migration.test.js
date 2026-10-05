import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFimaStructuralBackup, buildFimaStructuralSteps, executeFimaStructuralMigration } from '../src/fimaStructuralMigration.js';
import { createParadiseBackupEnvelope } from '../src/paradiseBackupIntegrity.js';
const guildId = '1419335632324657306';
const inventory = () => ({ guildId, observedAt: '2026-10-04', channels: [
  { id: '100', name: 'chat', type: 0, parentId: '200', permissionOverwrites: [{ id: guildId, allow: '0', deny: '1024' }] },
  { id: '200', name: 'old-category', type: 4, parentId: null }, { id: '300', name: 'new-category', type: 4, parentId: null }
], roles: [{ id: '400', name: 'Member', managed: false, permissions: '1024' }], integrations: [], autoModRules: [], errors: [] });
const changes = [{ kind: 'channel', objectId: '100', name: 'community', parentId: '300' }, { kind: 'role', objectId: '400', name: 'Community Member' }];
test('explicit metadata takeover retains dependency audit and forbids permission or deletion writes', () => {
  const live = inventory();
  live.integrations = [{id: 'hook', destinationChannelId: '100'}, {id: 'app', dependencyScope: 'unknown'}];
  for (const stagedMetadataTakeover of [false, 'true', 1]) assert.throws(() => buildFimaStructuralSteps(live, changes, {stagedMetadataTakeover}), /external_dependency/);
  const steps = buildFimaStructuralSteps(live, changes, {stagedMetadataTakeover: true});
  assert.deepEqual(steps[0].applicationReview.integrationIds, ['hook', 'app']);
  assert.deepEqual(steps[1].applicationReview.integrationIds, ['app']);
  assert.equal(steps[0].permissionImpact, 'NO CHANGE');
  assert.deepEqual(steps[0].after, {name: 'community', parentId: '300'});
  for (const field of ['action', 'permissions', 'permissionOverwrites', 'hoist']) assert.throws(() => buildFimaStructuralSteps(live, [{...changes[0], [field]: true}], {stagedMetadataTakeover: true}), /unsupported/);
  live.errors.push('webhooks_not_accessible');
  assert.throws(() => buildFimaStructuralSteps(live, changes, {stagedMetadataTakeover: true}), /inventory_incomplete/);
});
test('role display is reversible metadata and cannot change permissions', async () => {
  const live = inventory(); live.roles[0].hoist = false;
  const steps = buildFimaStructuralSteps(live, [{kind: 'role', objectId: '400', hoist: true}]);
  assert.deepEqual(steps[0].before, {name: 'Member', hoist: false});
  assert.deepEqual(steps[0].after, {name: 'Member', hoist: true});
  assert.equal(steps[0].permissionImpact, 'NO CHANGE');
  for (const hoist of ['true', 1, null]) assert.throws(() => buildFimaStructuralSteps(live, [{kind: 'role', objectId: '400', hoist}]), /unsupported/);
  assert.throws(() => buildFimaStructuralSteps(live, [{kind: 'role', objectId: '400', hoist: true, permissions: '8'}]), /unsupported/);
  const io = {inspect: async () => structuredClone(live), edit: async (step, direction) => Object.assign(live.roles[0], step[direction]), save: async () => {}, checkVersion: async () => {}};
  const plan = {guildId, status: 'prepared', cursor: 0, steps, expectedInventory: structuredClone(live), journal: []};
  const applied = await executeFimaStructuralMigration(plan, io);
  assert.equal(live.roles[0].hoist, true); assert.equal(live.roles[0].permissions, '1024');
  await executeFimaStructuralMigration(applied, io, {rollback: true});
  assert.equal(live.roles[0].hoist, false); assert.equal(live.roles[0].permissions, '1024');
});
function fixture() {
  let live = inventory(), stored, edits = 0, fail = false, conflict = false;
  const plan = { id: 'migration', guildId, status: 'prepared', cursor: 0, steps: buildFimaStructuralSteps(live, changes), expectedInventory: live, journal: [] };
  const io = {
    inspect: async () => structuredClone(live),
    edit: async (step, direction) => { edits++; Object.assign(live[step.kind === 'channel' ? 'channels' : 'roles'].find(row => row.id === step.objectId), step[direction]); if (fail) { fail = false; throw new Error('Discord accepted, response lost'); } },
    save: async value => { stored = structuredClone(value); },
    checkVersion: async () => { if (conflict) throw new Error('version conflict'); }
  };
  return { plan, io, get stored() { return stored; }, get live() { return live; }, get edits() { return edits; }, fail: () => { fail = true; }, conflict: () => { conflict = true; } };
}
test('metadata migration and rollback preserve original IDs, private overwrites and role permissions', async () => {
  const f = fixture();
  const result = await executeFimaStructuralMigration(f.plan, f.io);
  assert.equal(result.status, 'completed'); assert.equal(f.edits, 2);
  assert.deepEqual(f.live.channels[0].permissionOverwrites, inventory().channels[0].permissionOverwrites);
  assert.equal(f.live.roles[0].permissions, '1024');
  await executeFimaStructuralMigration(f.stored, f.io); assert.equal(f.edits, 2);
  await executeFimaStructuralMigration(f.stored, f.io, { rollback: true });
  assert.deepEqual(f.live, inventory()); assert.equal(f.stored.status, 'rolled_back');
  await executeFimaStructuralMigration(f.stored, f.io, { rollback: true }); assert.equal(f.edits, 4);
});
test('restart reconciles a write accepted by Discord before checkpoint without duplicate edits', async () => {
  const f = fixture(); f.fail();
  await assert.rejects(executeFimaStructuralMigration(f.plan, f.io), /response lost/);
  assert.equal(f.stored.pendingStep, 0); assert.equal(f.edits, 1);
  const result = await executeFimaStructuralMigration(f.stored, f.io);
  assert.equal(result.status, 'completed'); assert.equal(f.edits, 2); assert.equal(result.journal.length, 2);
});
test('permissions or unrelated inventory drift stop before editing or rollback', async () => {
  const f = fixture(); f.live.channels[0].permissionOverwrites[0].deny = '0';
  // Initial expected inventory must be an immutable durable snapshot.
  f.plan.expectedInventory = inventory();
  await assert.rejects(executeFimaStructuralMigration(f.plan, f.io), /migration_drift_detected/); assert.equal(f.edits, 0);
  const g = fixture(); await executeFimaStructuralMigration(g.plan, g.io);
  g.live.roles[0].permissions = '8';
  await assert.rejects(executeFimaStructuralMigration(g.stored, g.io, { rollback: true }), /migration_drift_detected/); assert.equal(g.edits, 2);
});
test('unknown integration dependencies, deletion, permissions and managed roles cannot enter plan', () => {
  const live = inventory();
  live.integrations.push({ destinationChannelId: '100' });
  assert.throws(() => buildFimaStructuralSteps(live, changes), /external_dependency/);
  live.integrations = [{ dependencyScope: 'unknown' }]; assert.throws(() => buildFimaStructuralSteps(live, changes), /external_dependency/);
  live.integrations = [];
  for (const bad of [{ ...changes[0], action: 'delete' }, { ...changes[0], permissions: '8' }, { ...changes[0], parentId: 'unknown' }]) assert.throws(() => buildFimaStructuralSteps(live, [bad]));
  live.roles[0].managed = true; assert.throws(() => buildFimaStructuralSteps(live, [changes[1]]), /not_editable/);
  live.errors.push('applications_not_accessible'); assert.throws(() => buildFimaStructuralSteps(live, changes), /inventory_incomplete/);
});
test('backup requires readback checksum, guild ownership and all restoration capabilities', () => {
  const payload = { guildId, restoreCapabilities: Object.fromEntries(['guildIdentity','roles','memberRoles','channels','canonicalMessages','contentArchive','autoModRules','webhooks','tickets'].map(key => [key, true])), captureErrors: [] };
  const backup = createParadiseBackupEnvelope(payload); assert.doesNotThrow(() => assertFimaStructuralBackup(backup, guildId));
  assert.throws(() => assertFimaStructuralBackup(backup, 'other'));
  backup.restoreCapabilities.channels = false; assert.throws(() => assertFimaStructuralBackup(backup, guildId));
  payload.restoreCapabilities.contentArchive = false; assert.throws(() => assertFimaStructuralBackup(createParadiseBackupEnvelope(payload), guildId));
});

test('staged takeover defers only category label review and records outstanding applications', () => {
  const live = inventory();
  live.integrations = [{ id: 'external-app', dependencyScope: 'unknown' }];
  const category = { kind: 'channel', objectId: '200', name: 'START' };
  const options = { deferCategoryApplicationReview: true };
  assert.throws(() => buildFimaStructuralSteps(live, [category]), /external_dependency/);
  assert.throws(() => buildFimaStructuralSteps(live, [category], { deferCategoryApplicationReview: 'true' }), /external_dependency/);
  const [step] = buildFimaStructuralSteps(live, [category], options);
  assert.deepEqual(step.applicationReview, { status: 'deferred_category_label_only', integrationIds: ['external-app'] });
  assert.deepEqual(step.after, { name: 'START' });
  assert.equal(step.permissionImpact, 'NO CHANGE');
  for (const change of [...changes, { ...category, parentId: null }, { ...category, permissions: '8' }]) {
    assert.throws(() => buildFimaStructuralSteps(live, [change], options));
  }
  for (const reference of [{ destinationChannelId: '200' }, { dependencyReferences: ['200'] }]) {
    live.integrations.push(reference);
    assert.throws(() => buildFimaStructuralSteps(live, [category], options), /external_dependency/);
    live.integrations.pop();
  }
  live.errors.push('applications_not_accessible');
  assert.throws(() => buildFimaStructuralSteps(live, [category], options), /inventory_incomplete/);
});
