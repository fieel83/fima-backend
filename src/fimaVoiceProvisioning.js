import { assertFimaPlan, fimaInventoryHash, fimaOperationError } from './fimaGuildOperations.js';
import { assertFimaStructuralBackup } from './fimaStructuralMigration.js';

// Registration uses the same authenticated guild scope and mutation lease as setup.
export function registerFimaVoiceProvisioning(router, { run, readConfig, preview, loadPlan, store, audit, prisma, gateway, now, versionOf }) {
  router.get('/voice/pending', run(async req => {
    const rows = await prisma.setting.findMany({ where: { key: { startsWith: 'fima_plan_' }, AND: [
      { value: { path: ['guildId'], equals: req.fima.guildId } }, { value: { path: ['actorId'], equals: req.fima.actorId } },
      { value: { path: ['kind'], equals: 'voice' } }, { value: { path: ['status'], equals: 'creating' } }
    ] }, take: 30, orderBy: { updatedAt: 'desc' } });
    return { pending: rows.map(row => row.value).filter(p => p.kind === 'voice' && p.status === 'creating' && p.guildId === req.fima.guildId && p.actorId === req.fima.actorId)
      .map(p => ({ planId: p.id, name: p.payload.name, parentId: p.payload.parentId, createdChannelId: p.createdChannelId || null })) };
  }));
  router.get('/voice/history', run(async req => {
    const rows = await prisma.setting.findMany({ where: { key: { startsWith: 'fima_plan_' }, AND: [
      { value: { path: ['guildId'], equals: req.fima.guildId } }, { value: { path: ['actorId'], equals: req.fima.actorId } },
      { value: { path: ['kind'], equals: 'voice' } }
    ] }, take: 30, orderBy: { updatedAt: 'desc' } });
    return { history: rows.map(row => row.value).filter(p => p.kind === 'voice' && p.guildId === req.fima.guildId && p.actorId === req.fima.actorId && ['completed', 'rolled_back'].includes(p.status))
      .map(p => ({ planId: p.id, name: p.payload.name, channelId: p.createdChannelId, status: p.status })) };
  }));
  router.post('/voice/preview', run(async req => {
    const unresolved = await prisma.setting.findMany({ where: { key: { startsWith: 'fima_plan_' }, AND: [
      { value: { path: ['guildId'], equals: req.fima.guildId } }, { value: { path: ['kind'], equals: 'voice' } },
      { value: { path: ['status'], equals: 'creating' } }
    ] }, take: 1 });
    if (unresolved.some(row => row.value?.guildId === req.fima.guildId && row.value?.kind === 'voice' && row.value?.status === 'creating')) throw fimaOperationError('voice_creation_requires_reconciliation');
    const { config } = await readConfig(prisma, req.fima.guildId);
    if (req.body?.expectedVersion !== versionOf(config)) throw fimaOperationError('workspace_version_conflict');
    const inventory = await gateway.inspect(req.fima.guildId, req.fima.actorId);
    if (inventory.errors?.length) throw fimaOperationError('voice_inventory_incomplete');
    const bound = config.channelMappings?.join_to_create || config.voiceSettings?.joinToCreateChannelId;
    if (inventory.channels.some(ch => ch.id === bound && ch.type === 2)) throw fimaOperationError('voice_entry_already_configured');
    const name = String(req.body?.name || 'Join to Create').trim();
    const parentId = req.body?.parentId || null;
    if (!name || name.length > 100) throw fimaOperationError('invalid_voice_name', 400);
    const parent = parentId ? inventory.channels.find(ch => ch.id === parentId && ch.type === 4) : null;
    if (parentId && !parent) throw fimaOperationError('invalid_voice_category', 400);
    const payload = { name, parentId, permissionOverwrites: structuredClone(parent?.permissionOverwrites || []) };
    await gateway.checkVoiceCreation(req.fima.guildId, req.fima.actorId, payload);
    return preview(req, 'voice', payload, inventory, config, { expectedInventory: inventory,
      diff: { action: 'CREATE_VOICE_CHANNEL', name, parentId, permissionImpact: parent ? 'COPY_CATEGORY_OVERWRITES' : 'INHERIT_GUILD_PERMISSIONS',
        existingObjects: 'NO_CHANGE', binding: 'join_to_create', rollback: 'configuration_only_channel_retained' } });
  }));
  async function complete(req, plan, channelId) {
    // Proof is required even after a successful create response: IDs alone are insufficient.
    await gateway.reconcileVoiceCreation(plan, channelId);
    const inventory = await gateway.inspect(plan.guildId, plan.actorId);
    const baseline = { ...inventory, channels: inventory.channels.filter(ch => ch.id !== channelId) };
    if (fimaInventoryHash(baseline) !== plan.inventoryHash) throw fimaOperationError('voice_inventory_drift');
    return prisma.$transaction(async tx => {
      const stored = (await tx.setting.findUnique({ where: { key: `fima_plan_${plan.id}` } }))?.value;
      if (stored?.status === 'completed') return { channelId: stored.createdChannelId, committedVersion: stored.committedVersion, replay: true };
      if (stored?.status !== 'creating') throw fimaOperationError('voice_reconciliation_not_ready');
      const { state, config } = await readConfig(tx, plan.guildId);
      if (versionOf(config) !== plan.version) throw fimaOperationError('workspace_version_conflict');
      const committedVersion = plan.version + 1;
      state.guildConfigs ||= {};
      state.guildConfigs[plan.guildId] = { ...config, customerWorkspaceVersion: committedVersion,
        modules: { ...config.modules, voice: true }, channelMappings: { ...config.channelMappings, join_to_create: channelId } };
      await store(tx, 'paradise_3a59_state_v1', state);
      await store(tx, `fima_plan_${plan.id}`, { ...stored, status: 'completed', createdChannelId: channelId, committedVersion, completedAt: now(),
        journal: [{ action: 'voice_channel_created_and_bound', channelId, existingObjectsChanged: 0 }] });
      await audit(tx, req, 'fima_voice_created_and_bound', { planId: plan.id, channelId, committedVersion });
      return { channelId, committedVersion, status: 'completed' };
    }, { isolationLevel: 'Serializable' });
  }
  router.post('/voice/apply', run(async req => {
    const plan = await loadPlan(req, 'voice');
    if (plan.status === 'completed') return { channelId: plan.createdChannelId, replay: true, status: 'completed' };
    if (plan.status !== 'preview') throw fimaOperationError('voice_creation_requires_reconciliation');
    const { state, config } = await readConfig(prisma, plan.guildId);
    const inventory = await gateway.inspect(plan.guildId, plan.actorId);
    assertFimaPlan(plan, { ...req.fima, version: versionOf(config), inventoryHash: fimaInventoryHash(inventory), now: now() });
    await gateway.checkVoiceCreation(plan.guildId, plan.actorId, plan.payload);
    const backup = await gateway.captureBackup(plan.guildId, plan.actorId, state);
    assertFimaStructuralBackup(backup, plan.guildId);
    await store(prisma, `fima_backup_${plan.id}`, backup);
    const readback = (await prisma.setting.findUnique({ where: { key: `fima_backup_${plan.id}` } }))?.value;
    assertFimaStructuralBackup(readback, plan.guildId);
    if (readback.integrity.digest !== backup.integrity.digest) throw fimaOperationError('voice_backup_readback_mismatch');
    const fresh = await readConfig(prisma, plan.guildId);
    assertFimaPlan(plan, { ...req.fima, version: versionOf(fresh.config), inventoryHash: fimaInventoryHash(await gateway.inspect(plan.guildId, plan.actorId)), now: now() });
    const reserved = { ...plan, status: 'creating', deliveryStartedAt: now(), reason: `FIMA voice ${plan.id}`, backupKey: `fima_backup_${plan.id}`, configBefore: structuredClone(fresh.config) };
    await store(prisma, `fima_plan_${plan.id}`, reserved);
    const channelId = await gateway.createVoiceEntry(reserved);
    await store(prisma, `fima_plan_${plan.id}`, { ...reserved, createdChannelId: channelId });
    return complete(req, reserved, channelId);
  }));
  router.post('/voice/reconcile', run(async req => {
    const plan = await loadPlan(req, 'voice');
    if (plan.status === 'completed') return { channelId: plan.createdChannelId, replay: true, status: 'completed' };
    if (plan.status !== 'creating') throw fimaOperationError('voice_reconciliation_not_ready');
    const channelId = req.body?.channelId || plan.createdChannelId;
    if (typeof channelId !== 'string' || !/^\d{16,22}$/.test(channelId)) throw fimaOperationError('invalid_voice_channel', 400);
    return complete(req, plan, channelId);
  }));
  router.post('/voice/rollback', run(async req => {
    const plan = await loadPlan(req, 'voice');
    if (plan.status === 'rolled_back') return { replay: true, status: 'rolled_back' };
    if (plan.status !== 'completed' || !plan.configBefore) throw fimaOperationError('voice_rollback_not_ready');
    return prisma.$transaction(async tx => {
      const { state, config } = await readConfig(tx, plan.guildId);
      if (versionOf(config) !== plan.committedVersion) throw fimaOperationError('workspace_version_conflict');
      const committedVersion = plan.committedVersion + 1;
      state.guildConfigs[plan.guildId] = { ...plan.configBefore, customerWorkspaceVersion: committedVersion };
      await store(tx, 'paradise_3a59_state_v1', state);
      await store(tx, `fima_plan_${plan.id}`, { ...plan, status: 'rolled_back', rollbackVersion: committedVersion, rolledBackAt: now() });
      await audit(tx, req, 'fima_voice_binding_rolled_back', { planId: plan.id, channelId: plan.createdChannelId, committedVersion, channelRetained: true });
      return { status: 'rolled_back', committedVersion, channelRetained: true };
    }, { isolationLevel: 'Serializable' });
  }));
}
