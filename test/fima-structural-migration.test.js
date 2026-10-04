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
