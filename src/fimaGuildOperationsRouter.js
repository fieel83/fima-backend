import { Router } from 'express';
import crypto from 'node:crypto';
import { fimaModuleStates, fimaPublicConfig } from './fimaGuildArchitecture.js';
import { assertFimaPlan, fimaInventoryHash, fimaOperationError, fimaSetupDiff, normalizeFimaPoll, normalizeFimaSetup } from './fimaGuildOperations.js';
import { assertFimaStructuralBackup, buildFimaStructuralSteps, executeFimaStructuralMigration } from './fimaStructuralMigration.js';
import { withParadiseGuildMutationLease } from './paradiseMutationLease.js';
import { registerFimaVoiceProvisioning } from './fimaVoiceProvisioning.js';
const STATE_KEY = 'paradise_3a59_state_v1';
const versionOf = config => Number.isSafeInteger(config?.customerWorkspaceVersion) ? config.customerWorkspaceVersion : 0;
const store = (tx, key, value) => tx.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
export function createFimaGuildOperationsRouter({ prisma, authenticate, csrf, authorize, gateway, trustedOrigin = () => false, now = Date.now }) {
  const router = Router({ mergeParams: true });
  router.use(authenticate);
  router.use(async (req, res, next) => {
    try {
      const guildId = String(req.params.guildId || '');
      // Router mergeParams retains the explicitly scoped parent guild ID.
      if (!/^\d{16,22}$/.test(guildId)) throw fimaOperationError('invalid_guild', 400);
      const access = await authorize(req.user, guildId);
      if (!access?.card || !access.discordUserId) throw fimaOperationError('guild_not_authorized', 403);
      if (!access.card.botInstalled) throw fimaOperationError('bot_invite_required');
      req.fima = { guildId, actorId: access.discordUserId, siteActorId: req.user.id, card: access.card };
      next();
    } catch (error) { next(error); }
  });
  router.use((req, res, next) => {
    if (req.method === 'GET') return next();
    const origin = req.get('origin');
    if (origin && !trustedOrigin(origin)) return next(fimaOperationError('origin_mismatch', 403));
    return csrf(req, res, next);
  });
  const run = fn => async (req, res, next) => { try {
    const result = req.method === 'GET' ? await fn(req) : await withParadiseGuildMutationLease(req.fima.guildId, 'fima_guild_operation', () => fn(req), { expectedGuildId: req.fima.guildId, waitTimeoutMs: 15000 });
    res.json({ success: true, ...result });
  } catch (error) { next(error); } };
  async function readConfig(tx, guildId) {
    const row = await tx.setting.findUnique({ where: { key: STATE_KEY } });
    const state = structuredClone(row?.value || {});
    return { state, config: state.guildConfigs?.[guildId] || {} };
  }
  async function audit(tx, req, action, details) {
    await tx.auditLog.create({ data: { action, targetType: 'discord_guild', targetId: req.fima.guildId, metadata: { actorUserId: req.fima.siteActorId, discordActorId: req.fima.actorId, ...details } } });
  }
  async function preview(req, kind, payload, inventory, config, extra) {
    const plan = { id: crypto.randomUUID(), kind, guildId: req.fima.guildId, actorId: req.fima.actorId, version: versionOf(config), inventoryHash: fimaInventoryHash(inventory),
      createdAt: now(), expiresAt: now() + 15 * 60000, status: 'preview', payload, ...extra };
    await prisma.$transaction(async tx => {
      const current = await readConfig(tx, plan.guildId);
      if (versionOf(current.config) !== plan.version) throw fimaOperationError('plan_drift_detected');
      await store(tx, `fima_plan_${plan.id}`, plan);
      await audit(tx, req, `fima_${kind}_previewed`, { planId: plan.id });
    }, { isolationLevel: 'Serializable' });
    return { planId: plan.id, guildId: plan.guildId, version: plan.version, inventoryHash: plan.inventoryHash, expiresAt: new Date(plan.expiresAt).toISOString(), ...fimaPublicConfig(extra || {}) };
  }
  async function loadPlan(req, kind) {
    const id = req.body?.planId;
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw fimaOperationError('invalid_plan', 400);
    const row = await prisma.setting.findUnique({ where: { key: `fima_plan_${id}` } });
    const plan = row?.value;
    if (!plan || plan.kind !== kind || plan.guildId !== req.fima.guildId || plan.actorId !== req.fima.actorId) throw fimaOperationError('plan_not_authorized', 403);
    return plan;
  }
  registerFimaVoiceProvisioning(router, { run, readConfig, preview, loadPlan, store, audit, prisma, gateway, now, versionOf });
  router.get('/inspect', run(async req => ({ inventory: await gateway.inspect(req.fima.guildId, req.fima.actorId) })));
  router.get('/integrations', run(async req => {
    const inventory = await gateway.inspect(req.fima.guildId, req.fima.actorId);
    return { integrations: inventory.integrations, observedAt: inventory.observedAt, errors: inventory.errors, producerPolicy: 'external_producers_preserved_native_tiktok_disabled' };
  }));
  router.post('/migration/preview', run(async req => {
    const { config } = await readConfig(prisma, req.fima.guildId);
    if (req.body?.expectedVersion !== versionOf(config)) throw fimaOperationError('workspace_version_conflict');
    const inventory = await gateway.inspect(req.fima.guildId, req.fima.actorId);
    const steps = buildFimaStructuralSteps(inventory, req.body?.changes, { deferCategoryApplicationReview: req.body?.deferCategoryApplicationReview === true });
    return preview(req, 'migration', null, inventory, config, { steps, expectedInventory: inventory, journal: [], cursor: 0 });
  }));
  router.get('/migration', run(async req => {
    const rows = await prisma.setting.findMany({ where: { key: { startsWith: 'fima_plan_' }, AND: [
      { value: { path: ['guildId'], equals: req.fima.guildId } }, { value: { path: ['actorId'], equals: req.fima.actorId } },
      { value: { path: ['kind'], equals: 'migration' } }
    ] }, take: 30, orderBy: { updatedAt: 'desc' } });
    return { migrations: rows.map(row => row.value).filter(plan => plan.kind === 'migration' && plan.guildId === req.fima.guildId && plan.actorId === req.fima.actorId)
      .map(plan => ({ planId: plan.id, status: plan.status, cursor: plan.cursor, steps: plan.steps, expiresAt: new Date(plan.expiresAt).toISOString() })) };
  }));
  router.post('/migration/apply', run(async req => {
    let plan = await loadPlan(req, 'migration');
    if (plan.status === 'completed') return { status: 'completed', replay: true };
    if (plan.status === 'preview') {
      const { state, config } = await readConfig(prisma, plan.guildId);
      const inventory = await gateway.inspect(plan.guildId, plan.actorId);
      assertFimaPlan(plan, { ...req.fima, version: versionOf(config), inventoryHash: fimaInventoryHash(inventory), now: now() });
      const backup = await gateway.captureBackup(plan.guildId, plan.actorId, state);
      assertFimaStructuralBackup(backup, plan.guildId);
      await store(prisma, `fima_backup_${plan.id}`, backup);
      const readback = (await prisma.setting.findUnique({ where: { key: `fima_backup_${plan.id}` } }))?.value;
      assertFimaStructuralBackup(readback, plan.guildId);
      if (readback.integrity.digest !== backup.integrity.digest) throw fimaOperationError('migration_backup_readback_mismatch');
      const fresh = await readConfig(prisma, plan.guildId);
      assertFimaPlan(plan, { ...req.fima, version: versionOf(fresh.config), inventoryHash: fimaInventoryHash(await gateway.inspect(plan.guildId, plan.actorId)), now: now() });
      plan = { ...plan, status: 'prepared', backupKey: `fima_backup_${plan.id}`, backupDigest: backup.integrity.digest };
      await store(prisma, `fima_plan_${plan.id}`, plan);
    }
    return runMigration(req, plan, false);
  }));
  router.post('/migration/rollback', run(async req => runMigration(req, await loadPlan(req, 'migration'), true)));
  async function runMigration(req, plan, rollback) {
    const backup = (await prisma.setting.findUnique({ where: { key: plan.backupKey || '' } }))?.value;
    assertFimaStructuralBackup(backup, plan.guildId);
    if (backup.integrity.digest !== plan.backupDigest) throw fimaOperationError('migration_backup_readback_mismatch');
    const result = await executeFimaStructuralMigration(plan, {
      inspect: () => gateway.inspect(plan.guildId, plan.actorId),
      edit: (step, direction) => gateway.editStructural(plan.guildId, plan.actorId, step, direction),
      checkVersion: async () => { const { config } = await readConfig(prisma, plan.guildId); if (versionOf(config) !== plan.version) throw fimaOperationError('migration_configuration_drift'); },
      save: value => prisma.$transaction(async tx => {
        await store(tx, `fima_plan_${plan.id}`, value);
        await audit(tx, req, 'fima_migration_checkpoint', { planId: plan.id, status: value.status, cursor: value.cursor, pendingStep: value.pendingStep ?? null });
      }, { isolationLevel: 'Serializable' })
    }, { rollback });
    return { planId: result.id, status: result.status, completedSteps: result.cursor, journal: result.journal };
  }
  router.post('/setup/preview', run(async req => {
    const { config } = await readConfig(prisma, req.fima.guildId);
    if (req.body?.expectedVersion !== versionOf(config)) throw fimaOperationError('workspace_version_conflict');
    const inventory = await gateway.inspect(req.fima.guildId, req.fima.actorId);
    const next = normalizeFimaSetup(req.body, config, inventory);
    return preview(req, 'setup', next, inventory, config, { diff: fimaSetupDiff(config, next, inventory), moduleStates: fimaModuleStates(next, req.fima.card) });
  }));
  router.post('/setup/apply', run(async req => {
    const plan = await loadPlan(req, 'setup');
    if (plan.status === 'completed') return { planId: plan.id, status: 'completed', committedVersion: plan.committedVersion, replay: true };
    if (plan.status !== 'preview') throw fimaOperationError('setup_plan_not_ready');
    const inventory = await gateway.inspect(req.fima.guildId, req.fima.actorId);
    return prisma.$transaction(async tx => {
      const stored = (await tx.setting.findUnique({ where: { key: `fima_plan_${plan.id}` } })).value;
      if (stored.status === 'completed') return { planId: plan.id, status: 'completed', committedVersion: stored.committedVersion, replay: true };
      if (stored.status !== 'preview') throw fimaOperationError('setup_plan_not_ready');
      const { state, config } = await readConfig(tx, req.fima.guildId);
      assertFimaPlan(stored, { ...req.fima, version: versionOf(config), inventoryHash: fimaInventoryHash(inventory), now: now() });
      const committedVersion = versionOf(config) + 1;
      // Backup and journal are durable in the same commit as the config update.
      await store(tx, `fima_backup_${plan.id}`, { guildId: plan.guildId, config, inventory, capturedAt: now(), revision: versionOf(config), scope: 'configuration_only' });
      state.guildConfigs ||= {};
      state.guildConfigs[plan.guildId] = { ...stored.payload, customerWorkspaceVersion: committedVersion };
      await store(tx, STATE_KEY, state);
      await store(tx, `fima_plan_${plan.id}`, { ...stored, status: 'completed', committedVersion, completedAt: now(), journal: [{ action: 'config_updated', discordMutations: 0, rollbackKey: `fima_backup_${plan.id}` }] });
      await audit(tx, req, 'fima_setup_applied', { planId: plan.id, committedVersion, discordMutations: 0 });
      return { planId: plan.id, status: 'completed', committedVersion };
    }, { isolationLevel: 'Serializable' });
  }));
  router.post('/setup/rollback', run(async req => {
    const plan = await loadPlan(req, 'setup');
    return prisma.$transaction(async tx => {
      const currentPlan = (await tx.setting.findUnique({ where: { key: `fima_plan_${plan.id}` } })).value;
      if (currentPlan.status === 'rolled_back') return { status: 'rolled_back', replay: true };
      if (currentPlan.status !== 'completed') throw fimaOperationError('rollback_not_ready');
      const { state, config } = await readConfig(tx, plan.guildId);
      if (versionOf(config) !== currentPlan.committedVersion) throw fimaOperationError('rollback_revision_conflict');
      const backup = (await tx.setting.findUnique({ where: { key: `fima_backup_${plan.id}` } }))?.value;
      if (!backup || backup.guildId !== plan.guildId) throw fimaOperationError('rollback_backup_missing');
      state.guildConfigs[plan.guildId] = { ...backup.config, customerWorkspaceVersion: versionOf(config) + 1 };
      await store(tx, STATE_KEY, state);
      await store(tx, `fima_plan_${plan.id}`, { ...currentPlan, status: 'rolled_back', rolledBackAt: now() });
      await audit(tx, req, 'fima_setup_rolled_back', { planId: plan.id });
      return { status: 'rolled_back', committedVersion: versionOf(config) + 1 };
    }, { isolationLevel: 'Serializable' });
  }));
  function pollEnabled(config, card) {
    if (!fimaModuleStates(config, card).find(row => row.id === 'polls')?.enabled) throw fimaOperationError('poll_module_disabled');
  }
  router.get('/polls', run(async req => {
    const rows = await prisma.setting.findMany({ where: { key: { startsWith: `fima_poll_${req.fima.guildId}_` } }, take: 30, orderBy: { updatedAt: 'desc' } });
    return { polls: rows.map(row => row.value) };
  }));
  router.get('/polls/pending', run(async req => {
    const rows = await prisma.setting.findMany({ where: { key: { startsWith: 'fima_plan_' }, AND: [
      { value: { path: ['guildId'], equals: req.fima.guildId } }, { value: { path: ['actorId'], equals: req.fima.actorId } },
      { value: { path: ['kind'], equals: 'poll' } }, { value: { path: ['status'], equals: 'publishing' } }
    ] }, take: 30, orderBy: { updatedAt: 'desc' } });
    return { pending: rows.map(row => row.value).filter(plan => plan.kind === 'poll' && plan.guildId === req.fima.guildId
      && plan.actorId === req.fima.actorId && plan.status === 'publishing').slice(0, 30)
      .map(plan => ({ planId: plan.id, channelId: plan.payload.channelId, deliveryStartedAt: new Date(plan.deliveryStartedAt).toISOString() })) };
  }));
  router.post('/polls/reconcile', run(async req => {
    const plan = await loadPlan(req, 'poll');
    if (plan.status === 'completed') return { reference: plan.reference, replay: true };
    if (plan.status !== 'publishing') throw fimaOperationError('poll_reconciliation_not_ready');
    const messageId = req.body?.messageId;
    if (typeof messageId !== 'string' || !/^\d{16,22}$/.test(messageId)) throw fimaOperationError('invalid_poll_message', 400);
    const reference = await gateway.reconcilePoll(plan, messageId);
    return prisma.$transaction(async tx => {
      const current = (await tx.setting.findUnique({ where: { key: `fima_plan_${plan.id}` } }))?.value;
      if (current?.status === 'completed') return { reference: current.reference, replay: true };
      if (current?.status !== 'publishing' || current.nonce !== plan.nonce) throw fimaOperationError('poll_reconciliation_not_ready');
      await store(tx, `fima_poll_${plan.guildId}_${reference.messageId}`, reference);
      await store(tx, `fima_plan_${plan.id}`, { id: plan.id, kind: 'poll', guildId: plan.guildId, actorId: plan.actorId, status: 'completed', reference, completedAt: now() });
      await audit(tx, req, 'fima_poll_reconciled', { planId: plan.id, messageId: reference.messageId, channelId: reference.channelId });
      return { reference };
    }, { isolationLevel: 'Serializable' });
  }));
  router.post('/polls/preview', run(async req => {
    const { config } = await readConfig(prisma, req.fima.guildId);
    if (req.body?.expectedVersion !== versionOf(config)) throw fimaOperationError('workspace_version_conflict');
    pollEnabled(config, req.fima.card);
    const poll = normalizeFimaPoll(req.body);
    const channel = await gateway.checkPoll(req.fima.guildId, req.fima.actorId, poll.channelId);
    const inventory = await gateway.inspect(req.fima.guildId, req.fima.actorId);
    return preview(req, 'poll', poll, inventory, config, { poll, channel });
  }));
  router.post('/polls/publish', run(async req => {
    const plan = await loadPlan(req, 'poll');
    if (plan.status === 'completed') return { reference: plan.reference, replay: true };
    if (plan.status !== 'preview') throw fimaOperationError('poll_delivery_requires_reconciliation');
    const inventory = await gateway.inspect(req.fima.guildId, req.fima.actorId);
    await gateway.checkPoll(req.fima.guildId, req.fima.actorId, plan.payload.channelId);
    const nonce = crypto.createHash('sha256').update(plan.id).digest('hex').slice(0, 24);
    await prisma.$transaction(async tx => {
      const currentPlan = (await tx.setting.findUnique({ where: { key: `fima_plan_${plan.id}` } })).value;
      if (currentPlan.status !== 'preview') throw fimaOperationError('poll_delivery_requires_reconciliation');
      const { config } = await readConfig(tx, plan.guildId);
      pollEnabled(config, req.fima.card);
      assertFimaPlan(currentPlan, { ...req.fima, version: versionOf(config), inventoryHash: fimaInventoryHash(inventory), now: now() });
      await store(tx, `fima_plan_${plan.id}`, { ...currentPlan, status: 'publishing', nonce, deliveryStartedAt: now() });
      await audit(tx, req, 'fima_poll_delivery_reserved', { planId: plan.id, channelId: plan.payload.channelId });
    }, { isolationLevel: 'Serializable' });
    // No retry after an uncertain Discord response. The durable reservation
    // survives restarts; an operator must reconcile the message before retrying.
    const reference = await gateway.publishPoll(plan.guildId, plan.actorId, plan.payload, nonce);
    await prisma.$transaction(async tx => {
      await store(tx, `fima_poll_${plan.guildId}_${reference.messageId}`, reference);
      await store(tx, `fima_plan_${plan.id}`, { id: plan.id, kind: 'poll', guildId: plan.guildId, actorId: plan.actorId, status: 'completed', reference, completedAt: now() });
      await audit(tx, req, 'fima_poll_published', { planId: plan.id, messageId: reference.messageId, channelId: reference.channelId });
    }, { isolationLevel: 'Serializable' });
    return { reference };
  }));
  router.use((error, req, res, next) => { if (res.headersSent) return next(error); res.status(error.code === 'P2034' ? 409 : error.statusCode || 503).json({ success: false, error: error.code === 'P2034' ? 'workspace_version_conflict' : error.code || 'guild_operation_failed' }); });
  return router;
}
