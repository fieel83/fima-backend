import { fimaInventoryHash, fimaOperationError, fimaSnapshotHash } from './fimaGuildOperations.js';
import { validateParadiseBackupEnvelope } from './paradiseBackupIntegrity.js';

// This executor deliberately has no delete, create, permission or webhook operation.
// Every write targets the original Discord object and can be reconciled by reading it.
export function buildFimaStructuralSteps(inventory, changes, { deferCategoryApplicationReview = false, stagedMetadataTakeover = false } = {}) {
  if (inventory.errors?.length) throw fimaOperationError('migration_inventory_incomplete');
  if (!Array.isArray(changes) || !changes.length || changes.length > 100) throw fimaOperationError('invalid_migration_changes', 400);
  const seen = new Set();
  return changes.map(change => {
    if (!change || Object.keys(change).some(key => !['kind', 'objectId', 'name', 'parentId', 'hoist'].includes(key))
      || !['channel', 'role'].includes(change.kind)) throw fimaOperationError('unsupported_migration_operation', 400);
    const rows = change.kind === 'channel' ? inventory.channels : inventory.roles;
    const row = rows.find(item => item.id === change.objectId);
    if (!row || row.managed || row.id === inventory.guildId || seen.has(row.id)) throw fimaOperationError('migration_object_not_editable');
    seen.add(row.id);
    // An explicit staged takeover can defer unknown application settings ONLY for
    // category labels. Known references, channel/role edits and parent changes
    // remain protected; this does not certify a provider as migrated or healthy.
    const deferReview = deferCategoryApplicationReview === true && change.kind === 'channel'
      && row.type === 4 && !Object.hasOwn(change, 'parentId');
    const dependencies = (inventory.integrations || []).filter(item => item.destinationChannelId === row.id
      || item.dependencyReferences?.includes(row.id)
      || (item.dependencyScope === 'unknown' && !deferReview));
    // An explicitly requested takeover may edit metadata while preserving the
    // exact IDs, permissions and deliveries used by installed producers. Record
    // every unresolved provider; this is not permission to disable or delete it.
    if (dependencies.length && stagedMetadataTakeover !== true) throw fimaOperationError('migration_external_dependency_unverified');
    const before = { name: row.name };
    const after = { name: row.name };
    if (Object.hasOwn(change, 'hoist')) {
      if (change.kind !== 'role' || typeof change.hoist !== 'boolean') throw fimaOperationError('unsupported_migration_operation', 400);
      before.hoist = row.hoist === true; after.hoist = change.hoist;
    }
    if (Object.hasOwn(change, 'name')) {
      if (typeof change.name !== 'string' || !change.name.trim() || change.name.length > 100) throw fimaOperationError('invalid_migration_name', 400);
      after.name = change.name.trim();
    }
    if (Object.hasOwn(change, 'parentId')) {
      if (change.kind !== 'channel' || row.type === 4 || (change.parentId !== null && !inventory.channels.some(item => item.id === change.parentId && item.type === 4))) throw fimaOperationError('invalid_migration_parent', 400);
      before.parentId = row.parentId ?? null; after.parentId = change.parentId;
    }
    if (fimaSnapshotHash(before) === fimaSnapshotHash(after)) throw fimaOperationError('migration_has_no_change', 400);
    return { kind: change.kind, objectId: row.id, type: row.type, before, after, permissionImpact: 'NO CHANGE', action: 'EDIT ORIGINAL', rollbackCapability: 'original_object_metadata',
      ...(stagedMetadataTakeover === true && dependencies.length ? { applicationReview: { status: 'staged_metadata_only_producers_preserved', integrationIds: dependencies.map(item => item.id) } }
        : deferReview ? { applicationReview: { status: 'deferred_category_label_only', integrationIds: (inventory.integrations || []).filter(item => item.dependencyScope === 'unknown').map(item => item.id) } } : {}) };
  });
}

export function assertFimaStructuralBackup(backup, guildId) {
  if (!validateParadiseBackupEnvelope(backup).valid || backup.guildId !== guildId
    || !['guildIdentity', 'roles', 'memberRoles', 'channels', 'canonicalMessages', 'contentArchive', 'autoModRules', 'webhooks', 'tickets'].every(key => backup.restoreCapabilities?.[key] === true)
    || backup.captureErrors?.some(error => !error.informational)) throw fimaOperationError('migration_backup_not_verified');
}

function advance(inventory, step, direction) {
  const next = structuredClone(inventory);
  const row = next[step.kind === 'channel' ? 'channels' : 'roles'].find(item => item.id === step.objectId);
  if (!row) throw fimaOperationError('migration_object_missing');
  Object.assign(row, step[direction]);
  return next;
}

// save must durably commit before returning. The caller holds a guild mutation lease.
// A crash after Discord accepts a write is recovered by exact whole-inventory comparison.
export async function executeFimaStructuralMigration(plan, { inspect, edit, save, checkVersion }, { rollback = false } = {}) {
  const direction = rollback ? 'before' : 'after';
  const completed = rollback ? 'rolled_back' : 'completed';
  if (plan.status === completed) return plan;
  if (rollback && !['completed', 'rolling_back'].includes(plan.status)) throw fimaOperationError('migration_rollback_not_ready');
  if (!rollback && !['prepared', 'applying'].includes(plan.status)) throw fimaOperationError('migration_not_ready');
  await checkVersion();
  if (rollback && plan.status === 'completed') {
    plan = { ...plan, status: 'rolling_back', cursor: 0, expectedInventory: plan.expectedInventory };
    await save(plan);
  } else if (plan.status === 'prepared') {
    plan = { ...plan, status: 'applying', cursor: 0 };
    await save(plan);
  }
  const steps = rollback ? [...plan.steps].reverse() : plan.steps;
  for (let cursor = plan.cursor; cursor < steps.length; cursor++) {
    await checkVersion();
    const step = steps[cursor];
    const expectedNext = advance(plan.expectedInventory, step, direction);
    const actual = await inspect();
    if (fimaInventoryHash(actual) !== fimaInventoryHash(expectedNext)) {
      if (fimaInventoryHash(actual) !== fimaInventoryHash(plan.expectedInventory)) throw fimaOperationError('migration_drift_detected');
      // Persist intent before making the request; no blind replay after uncertain delivery.
      await save({ ...plan, pendingStep: cursor });
      await edit(step, direction);
      if (fimaInventoryHash(await inspect()) !== fimaInventoryHash(expectedNext)) throw fimaOperationError('migration_write_requires_reconciliation');
    }
    plan = { ...plan, cursor: cursor + 1, expectedInventory: expectedNext, pendingStep: null,
      journal: [...(plan.journal || []), { cursor, objectId: step.objectId, direction, verified: true }] };
    await save(plan);
  }
  await checkVersion();
  if (fimaInventoryHash(await inspect()) !== fimaInventoryHash(plan.expectedInventory)) throw fimaOperationError('migration_drift_detected');
  plan = { ...plan, status: completed };
  await save(plan);
  return plan;
}
