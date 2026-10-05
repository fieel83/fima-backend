import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createFimaGuildOperationsRouter } from '../src/fimaGuildOperationsRouter.js';
import { createParadiseBackupEnvelope } from '../src/paradiseBackupIntegrity.js';
const guildId = '1419335632324657306', otherGuild = '1469750386033430661', actorId = '1419335632324657307', channelId = '1420401535204065311';
const stateKey = 'paradise_3a59_state_v1';
test('welcome wizard binds join and leave to the same channel through preview and apply', async () => {
  const f = await operationsFixture();
  try {
    const preview = await f.request('/setup/preview', {setupType: 'community', expectedVersion: 0, channelMappings: {welcome: channelId}});
    assert.equal(preview.status, 200);
    const result = await f.request('/setup/apply', {planId: preview.data.planId});
    assert.equal(result.status, 200);
    const mappings = f.rows.get(stateKey).guildConfigs[guildId].channelMappings;
    assert.equal(mappings.welcome_channel, channelId);
    assert.equal(mappings.leave_channel, channelId);
    f.inventory.channels.push({id: 'voice', type: 2, name: 'Voice'});
    const rejected = await f.request('/setup/preview', {setupType: 'community', expectedVersion: 1, channelMappings: {welcome: 'voice'}});
    assert.equal(rejected.data.error, 'invalid_welcome_binding');
  } finally { await f.close(); }
});
export async function operationsFixture() {
  let rows = new Map([[stateKey, { guildConfigs: { [guildId]: { activeSetupMode: 'community', customerWorkspaceVersion: 0 }, [otherGuild]: { untouched: true } } }]]);
  let queue = Promise.resolve();
  const audit = [];
  const api = map => ({ setting: {
    findUnique: async ({ where }) => map.has(where.key) ? { key: where.key, value: structuredClone(map.get(where.key)) } : null,
    upsert: async ({ where, create, update }) => { const value = map.has(where.key) ? update.value : create.value; map.set(where.key, structuredClone(value)); return { value }; },
    findMany: async ({ where }) => [...map.entries()].filter(([key]) => key.startsWith(where.key.startsWith)).map(([key, value]) => ({ key, value: structuredClone(value) }))
  }, auditLog: { create: async ({ data }) => { audit.push(data); } } });
  const prisma = { ...api(rows), $transaction: fn => {
    const operation = queue.then(async () => { const draft = new Map(structuredClone([...rows])); const result = await fn(api(draft)); rows.clear(); for (const [key, value] of draft) rows.set(key, value); return result; });
    queue = operation.catch(() => {}); return operation;
  } };
  const inventory = { guildId, observedAt: '2026-10-04', guild: { name: 'TEST DATA — FT Community' }, channels: [{ id: channelId, name: 'uploads', type: 0 }], roles: [], integrations: [], autoModRules: [], errors: [] };
  const delivery = { count: 0, fail: false, permissionDenied: false };
  const gateway = {
    inspect: async () => structuredClone(inventory),
    checkPoll: async () => { if (delivery.permissionDenied) throw Object.assign(new Error('poll_permissions_missing'), { code: 'poll_permissions_missing', statusCode: 403 }); return inventory.channels[0]; },
    publishPoll: async () => { ++delivery.count; if (delivery.fail) throw new Error('uncertain delivery'); return { guildId, channelId, messageId: '1555567483329712270', url: `https://discord.com/channels/${guildId}/${channelId}/1555567483329712270`, lifecycle: 'published' }; },
    reconcilePoll: async (plan, messageId) => {
      if (messageId !== '1555567483329712270') throw Object.assign(new Error('poll_delivery_proof_missing'), { code: 'poll_delivery_proof_missing', statusCode: 409 });
      return { guildId, channelId: plan.payload.channelId, messageId, lifecycle: 'published' };
    }
  };
  let time = Date.now();
  gateway.captureBackup = async () => createParadiseBackupEnvelope({ guildId,
    channels: structuredClone(inventory.channels), roles: structuredClone(inventory.roles), captureErrors: [],
    restoreCapabilities: Object.fromEntries(['guildIdentity','roles','memberRoles','channels','canonicalMessages','contentArchive','autoModRules','webhooks','tickets'].map(key => [key, true])) });
  gateway.editStructural = async (id, actor, step, direction) => {
    delivery.edits = (delivery.edits || 0) + 1;
    Object.assign(inventory[step.kind === 'channel' ? 'channels' : 'roles'].find(row => row.id === step.objectId), step[direction]);
    if (delivery.failEdit) { delivery.failEdit = false; throw new Error('accepted, response lost'); }
  };
  gateway.checkVoiceCreation = async () => { if (delivery.permissionDenied) throw Object.assign(new Error('voice_creation_permissions_missing'), { statusCode: 403 }); };
  gateway.createVoiceEntry = async plan => {
    delivery.voiceCreates = (delivery.voiceCreates || 0) + 1;
    const id = '1555567483329712290';
    inventory.channels.push({ id, type: 2, name: plan.payload.name, parentId: plan.payload.parentId, permissionOverwrites: plan.payload.permissionOverwrites });
    delivery.voicePlan = plan.id;
    if (delivery.failVoice) throw new Error('accepted, response lost');
    return id;
  };
  gateway.reconcileVoiceCreation = async (plan, id) => {
    if (delivery.voicePlan !== plan.id || id !== '1555567483329712290') throw Object.assign(new Error('voice_creation_proof_missing'), { code: 'voice_creation_proof_missing', statusCode: 409 });
    return id;
  };
  const app = express(); app.use(express.json());
  app.use('/api/fima-bot/customer/workspaces/:guildId/operations', createFimaGuildOperationsRouter({ prisma, gateway, now: () => time,
    authenticate: (req, res, next) => { req.user = { id: 'fixture-user' }; next(); },
    csrf: (req, res, next) => req.get('x-csrf-token') === 'fixture-token' ? next() : res.status(403).json({ error: 'csrf_failed' }),
    trustedOrigin: origin => origin === 'http://localhost',
    authorize: async (user, id) => ({ card: id === guildId ? { guildId, botInstalled: true } : null, discordUserId: actorId })
  }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  async function request(path, body, headers = {}, id = guildId) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/fima-bot/customer/workspaces/${id}/operations${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-csrf-token': 'fixture-token', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  return { app, request, rows, inventory, delivery, audit, gateway, advance: ms => { time += ms; }, close: () => new Promise(resolve => server.close(resolve)) };
}
test('HTTP setup applies once, retains other guild data, and rolls back once', async () => {
  const f = await operationsFixture();
  try {
    const preview = await f.request('/setup/preview', { setupType: 'clan', expectedVersion: 0 });
    assert.equal(preview.status, 200); assert.equal(preview.data.diff.discordMutationCount, 0);
    const body = { planId: preview.data.planId };
    assert.equal((await f.request('/setup/apply', body)).data.committedVersion, 1);
    assert.equal((await f.request('/setup/apply', body)).data.replay, true);
    assert.deepEqual(f.rows.get(stateKey).guildConfigs[otherGuild], { untouched: true });
    assert.equal((await f.request('/setup/rollback', body)).data.committedVersion, 2);
    assert.equal(f.rows.get(stateKey).guildConfigs[guildId].activeSetupMode, 'community');
    assert.equal((await f.request('/setup/rollback', body)).data.replay, true);
    assert.equal(f.audit.filter(row => row.action === 'fima_setup_applied').length, 1);
  } finally { await f.close(); }
});

test('HTTP voice provisioning binds one new channel, preserves other guild and original objects', async () => {
  const f = await operationsFixture();
  try {
    const before = structuredClone(f.inventory.channels);
    const preview = await f.request('/voice/preview', { expectedVersion: 0 });
    assert.equal(preview.status, 200); assert.equal(preview.data.diff.permissionImpact, 'INHERIT_GUILD_PERMISSIONS');
    const body = { planId: preview.data.planId };
    const replies = await Promise.all([f.request('/voice/apply', body), f.request('/voice/apply', body)]);
    assert.ok(replies.every(r => r.status === 200)); assert.equal(f.delivery.voiceCreates, 1);
    assert.deepEqual(f.inventory.channels.slice(0, 1), before);
    const config = f.rows.get(stateKey).guildConfigs[guildId];
    assert.equal(config.channelMappings.join_to_create, '1555567483329712290'); assert.equal(config.modules.voice, true);
    assert.deepEqual(f.rows.get(stateKey).guildConfigs[otherGuild], { untouched: true });
    assert.equal((await f.request('/voice/preview', { expectedVersion: 1 })).data.error, 'voice_entry_already_configured');
    assert.equal((await f.request('/voice/history')).data.history.length, 1);
    assert.equal((await f.request('/voice/rollback', body)).data.channelRetained, true);
    assert.equal((await f.request('/voice/rollback', body)).data.replay, true);
    assert.deepEqual(f.rows.get(stateKey).guildConfigs[guildId], { activeSetupMode: 'community', customerWorkspaceVersion: 2 });
    assert.equal(f.inventory.channels.length, 2);
    assert.deepEqual(f.rows.get(stateKey).guildConfigs[otherGuild], { untouched: true });
  } finally { await f.close(); }
});

test('HTTP voice uncertain delivery requires proof, never recreates, and rejects unrelated drift', async () => {
  const f = await operationsFixture();
  try {
    const preview = await f.request('/voice/preview', { expectedVersion: 0 });
    const body = { planId: preview.data.planId }; f.delivery.failVoice = true;
    assert.equal((await f.request('/voice/apply', body)).status, 503);
    assert.equal((await f.request('/voice/apply', body)).data.error, 'voice_creation_requires_reconciliation');
    assert.equal((await f.request('/voice/pending')).data.pending.length, 1);
    assert.equal((await f.request('/voice/preview', { expectedVersion: 0 })).data.error, 'voice_creation_requires_reconciliation');
    assert.equal((await f.request('/voice/reconcile', { ...body, channelId })).data.error, 'voice_creation_proof_missing');
    f.inventory.channels[0].name = 'external-change';
    assert.equal((await f.request('/voice/reconcile', { ...body, channelId: '1555567483329712290' })).data.error, 'voice_inventory_drift');
    f.inventory.channels[0].name = 'uploads';
    assert.equal((await f.request('/voice/reconcile', { ...body, channelId: '1555567483329712290' })).status, 200);
    assert.equal(f.delivery.voiceCreates, 1);
    assert.equal((await f.request('/voice/pending')).data.pending.length, 0);
  } finally { await f.close(); }
});

test('HTTP voice creation rejects missing permissions, invalid categories, stale and incomplete inventory', async () => {
  const f = await operationsFixture();
  try {
    f.delivery.permissionDenied = true;
    assert.equal((await f.request('/voice/preview', { expectedVersion: 0 })).status, 403);
    f.delivery.permissionDenied = false;
    assert.equal((await f.request('/voice/preview', { expectedVersion: 0, parentId: channelId })).status, 400);
    const preview = await f.request('/voice/preview', { expectedVersion: 0 });
    f.advance(16 * 60000);
    assert.equal((await f.request('/voice/apply', { planId: preview.data.planId })).status, 409);
    f.inventory.errors.push('applications_not_accessible');
    assert.equal((await f.request('/voice/preview', { expectedVersion: 0 })).data.error, 'voice_inventory_incomplete');
    assert.equal(f.delivery.voiceCreates || 0, 0);
  } finally { await f.close(); }
});
test('HTTP boundaries reject CSRF, origin, foreign guilds, and inventory drift', async () => {
  const f = await operationsFixture();
  try {
    const body = { setupType: 'community', expectedVersion: 0 };
    assert.equal((await f.request('/setup/preview', body, { 'x-csrf-token': '' })).status, 403);
    assert.equal((await f.request('/setup/preview', body, { origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await f.request('/inspect', null, {}, otherGuild)).status, 403);
    const preview = await f.request('/setup/preview', body);
    f.inventory.channels[0].name = 'changed-after-preview';
    assert.equal((await f.request('/setup/apply', { planId: preview.data.planId })).data.error, 'plan_drift_detected');
    assert.equal(f.rows.get(stateKey).guildConfigs[guildId].customerWorkspaceVersion, 0);
  } finally { await f.close(); }
});
const poll = { expectedVersion: 0, channelId, question: 'Which stream?', options: ['Today', 'Tomorrow'], duration: 24 };
test('HTTP native poll stores minimal reference and repeated publication never sends twice', async () => {
  const f = await operationsFixture();
  try {
    const preview = await f.request('/polls/preview', poll); assert.equal(preview.status, 200);
    const body = { planId: preview.data.planId };
    const results = await Promise.all([f.request('/polls/publish', body), f.request('/polls/publish', body)]);
    assert.ok(results.some(result => result.status === 200)); assert.equal(f.delivery.count, 1);
    assert.equal((await f.request('/polls/publish', body)).data.replay, true);
    const list = await f.request('/polls'); assert.equal(list.data.polls.length, 1);
    assert.equal(Object.hasOwn(list.data.polls[0], 'voters'), false);
    assert.equal(Object.hasOwn(list.data.polls[0], 'options'), false);
  } finally { await f.close(); }
});
test('uncertain HTTP delivery retains durable reservation and forbids automatic resend', async () => {
  const f = await operationsFixture();
  try {
    const preview = await f.request('/polls/preview', poll);
    f.delivery.fail = true;
    const body = { planId: preview.data.planId };
    assert.equal((await f.request('/polls/publish', body)).status, 503);
    assert.equal((await f.request('/polls/publish', body)).data.error, 'poll_delivery_requires_reconciliation');
    assert.equal(f.delivery.count, 1);
    assert.equal(f.rows.get(`fima_plan_${preview.data.planId}`).status, 'publishing');
  } finally { await f.close(); }
});
test('HTTP poll preview denies missing permissions and disabled modules', async () => {
  const f = await operationsFixture();
  try {
    f.delivery.permissionDenied = true;
    assert.equal((await f.request('/polls/preview', poll)).status, 403);
    f.delivery.permissionDenied = false;
    f.rows.get(stateKey).guildConfigs[guildId].modules = { polls: false };
    assert.equal((await f.request('/polls/preview', poll)).data.error, 'poll_module_disabled');
    assert.equal(f.delivery.count, 0);
  } finally { await f.close(); }
});

test('uncertain delivery can be reconciled once without resending or retaining poll contents', async () => {
  const f = await operationsFixture();
  try {
    const preview = await f.request('/polls/preview', poll);
    const body = { planId: preview.data.planId };
    f.delivery.fail = true;
    await f.request('/polls/publish', body);
    const pending = await f.request('/polls/pending');
    assert.equal(pending.data.pending[0].planId, body.planId);
    assert.equal(Object.hasOwn(pending.data.pending[0], 'question'), false);
    assert.equal((await f.request('/polls/reconcile', { ...body, messageId: '1555567483329712271' })).status, 409);
    assert.equal(f.rows.get(`fima_plan_${body.planId}`).status, 'publishing');
    const replies = await Promise.all([0, 1].map(() => f.request('/polls/reconcile', { ...body, messageId: '1555567483329712270' })));
    assert.ok(replies.every(reply => reply.status === 200));
    assert.equal(f.delivery.count, 1);
    assert.equal(f.audit.filter(row => row.action === 'fima_poll_reconciled').length, 1);
    assert.equal((await f.request('/polls/pending')).data.pending.length, 0);
    assert.equal(Object.hasOwn(f.rows.get(`fima_plan_${body.planId}`), 'payload'), false);
  } finally { await f.close(); }
});

test('HTTP migration resumes accepted write, preserves IDs, and rolls back original metadata', async () => {
  const f = await operationsFixture();
  try {
    const before = structuredClone(f.inventory);
    const preview = await f.request('/migration/preview', { expectedVersion: 0, changes: [{ kind: 'channel', objectId: channelId, name: 'community-uploads' }] });
    assert.equal(preview.status, 200);
    const body = { planId: preview.data.planId };
    f.delivery.failEdit = true;
    assert.equal((await f.request('/migration/apply', body)).status, 503);
    assert.equal(f.rows.get(`fima_plan_${body.planId}`).pendingStep, 0);
    const recovery = await f.request('/migration');
    assert.equal(recovery.data.migrations[0].status, 'applying');
    assert.equal(Object.hasOwn(recovery.data.migrations[0], 'expectedInventory'), false);
    assert.equal((await f.request('/migration/apply', body)).data.status, 'completed');
    assert.equal(f.delivery.edits, 1);
    assert.equal((await f.request('/migration/apply', body)).data.replay, true);
    assert.equal((await f.request('/migration/rollback', body)).data.status, 'rolled_back');
    assert.deepEqual(f.inventory, before);
    assert.equal(f.delivery.edits, 2);
    assert.equal((await f.request('/migration/rollback', body)).data.status, 'rolled_back');
    assert.equal(f.delivery.edits, 2);
  } finally { await f.close(); }
});

test('HTTP migration cannot bypass backup, expiry during capture, or integration dependencies', async () => {
  const f = await operationsFixture();
  try {
    const change = { expectedVersion: 0, changes: [{ kind: 'channel', objectId: channelId, name: 'new-name' }] };
    const preview = await f.request('/migration/preview', change);
    const capture = f.gateway.captureBackup;
    f.gateway.captureBackup = async () => ({ guildId });
    assert.equal((await f.request('/migration/apply', { planId: preview.data.planId })).data.error, 'migration_backup_not_verified');
    f.gateway.captureBackup = async () => { const backup = await capture(); f.advance(16 * 60000); return backup; };
    assert.equal((await f.request('/migration/apply', { planId: preview.data.planId })).data.error, 'plan_expired');
    assert.equal(f.delivery.edits || 0, 0);
    assert.equal(f.rows.get(`fima_plan_${preview.data.planId}`).status, 'preview');
    f.inventory.integrations = [{ dependencyScope: 'unknown' }];
    assert.equal((await f.request('/migration/preview', change)).data.error, 'migration_external_dependency_unverified');
  } finally { await f.close(); }
});

test('HTTP category review deferral is explicit, durable and cannot allow channel edits', async () => {
  const f = await operationsFixture();
  try {
    const categoryId = '1420401493260894248';
    f.inventory.channels.push({ id: categoryId, name: 'WELCOME', type: 4, parentId: null });
    f.inventory.integrations = [{ id: 'external-app', dependencyScope: 'unknown' }];
    const body = { expectedVersion: 0, changes: [{ kind: 'channel', objectId: categoryId, name: 'START' }] };
    assert.equal((await f.request('/migration/preview', body)).data.error, 'migration_external_dependency_unverified');
    const preview = await f.request('/migration/preview', { ...body, deferCategoryApplicationReview: true });
    assert.equal(preview.status, 200);
    const stored = f.rows.get(`fima_plan_${preview.data.planId}`);
    assert.equal(stored.actorId, actorId);
    assert.deepEqual(stored.steps[0].applicationReview.integrationIds, ['external-app']);
    assert.equal(preview.data.steps[0].applicationReview.status, 'deferred_category_label_only');
    assert.equal((await f.request('/migration/preview', { ...body, deferCategoryApplicationReview: true, changes: [{ kind: 'channel', objectId: channelId, name: 'changed' }] })).data.error, 'migration_external_dependency_unverified');
    f.gateway.captureBackup = async () => ({ guildId });
    assert.equal((await f.request('/migration/apply', { planId: preview.data.planId })).data.error, 'migration_backup_not_verified');
    assert.equal(f.delivery.edits || 0, 0);
  } finally { await f.close(); }
});
