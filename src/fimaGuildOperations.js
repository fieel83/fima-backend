import crypto from 'node:crypto';
import { FIMA_MODULE_CATALOG, FIMA_SETUP_TYPES, assertFimaModuleSelection, fimaModuleStates } from './fimaGuildArchitecture.js';
export const fimaOperationError = (code, statusCode = 409) => Object.assign(new Error(code), { code, statusCode });
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const fimaSnapshotHash = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function fimaInventoryHash(inventory) {
  const { observedAt, ...stable } = inventory;
  return fimaSnapshotHash(stable);
}
export function normalizeFimaSetup(input, config, inventory) {
  if (!FIMA_SETUP_TYPES.includes(input?.setupType)) throw fimaOperationError('invalid_setup_type', 400);
  const known = new Set(FIMA_MODULE_CATALOG.map(row => row.id));
  const modules = input.modules || Object.fromEntries(fimaModuleStates({ activeSetupMode: input.setupType }).map(row => [row.id, row.enabled]));
  if (!modules || Array.isArray(modules) || Object.entries(modules).some(([key, value]) => !known.has(key) || typeof value !== 'boolean')) throw fimaOperationError('invalid_modules', 400);
  const channelMappings = { ...(config.channelMappings || {}) };
  const roleMappings = { ...(config.roleMappings || {}) };
  for (const [target, source, resources] of [[channelMappings, input.channelMappings, inventory.channels], [roleMappings, input.roleMappings, inventory.roles]]) {
    if (!source) continue;
    if (Array.isArray(source) || typeof source !== 'object' || Object.keys(source).length > 100) throw fimaOperationError('invalid_bindings', 400);
    for (const [key, id] of Object.entries(source)) {
      if (!/^[a-z][a-z0-9_]{0,48}$/.test(key) || /(secret|token|owner|webhook)/i.test(key) || !resources.some(row => row.id === id && (resources !== inventory.roles || (!row.managed && row.id !== inventory.guildId)))) throw fimaOperationError('binding_not_in_guild', 400);
      target[key] = id;
    }
  }
  for (const [key, type] of [['join_to_create', 2], ['private_voice', 4]]) {
    const id = channelMappings[key] || (key === 'join_to_create' ? config.voiceSettings?.joinToCreateChannelId : config.voiceSettings?.privateVoiceCategoryId);
    if (id && !inventory.channels.some(row => row.id === id && row.type === type)) throw fimaOperationError('invalid_voice_binding', 400);
  }
  const next = { ...structuredClone(config), activeSetupMode: input.setupType, modules: { ...Object.fromEntries([...known].map(key => [key, false])), ...modules }, channelMappings, roleMappings };
  assertFimaModuleSelection(next);
  return next;
}
// Initial wizard only binds existing resources and changes FIMA configuration.
// A Discord tree mutation cannot enter this endpoint or bypass dependency review.
export function fimaSetupDiff(previous, next, inventory) {
  const resourceDiff = [...inventory.channels, ...inventory.roles].map(row => ({
    objectId: row.id, currentName: row.name, proposedName: row.name,
    currentParent: row.parentId || null, proposedParent: row.parentId || null,
    type: row.type, permissionImpact: 'NO CHANGE', dependencyOwner: row.managed ? 'external_application' : 'not_verified',
    action: 'NO CHANGE', rollbackCapability: 'preserved_original_object'
  }));
  const configDiff = ['activeSetupMode', 'modules', 'channelMappings', 'roleMappings'].filter(key => fimaSnapshotHash(previous[key] ?? null) !== fimaSnapshotHash(next[key] ?? null))
    .map(key => ({ key, before: previous[key] ?? null, after: next[key] ?? null, action: 'CONFIG UPDATE' }));
  return { resourceDiff, configDiff, discordMutationCount: 0, rollbackCapability: 'configuration_snapshot', warnings: ['Discord objects, permissions, integrations and history are preserved. Structural migration requires a separately verified backup and dependency plan.'] };
}
export function normalizeFimaPoll(input) {
  const question = typeof input?.question === 'string' ? input.question.trim() : '';
  const options = Array.isArray(input?.options) ? input.options.map(option => typeof option === 'string' ? option.trim() : '') : [];
  const duration = input?.duration;
  if (!/^\d{16,22}$/.test(input?.channelId || '') || !question || question.length > 300 || options.length < 2 || options.length > 10
    || options.some(option => !option || option.length > 55) || new Set(options.map(option => option.toLowerCase())).size !== options.length
    || !Number.isInteger(duration) || duration < 1 || duration > 768 || (input.allowMultiselect != null && typeof input.allowMultiselect !== 'boolean')) throw fimaOperationError('invalid_native_poll', 400);
  return { channelId: input.channelId, question, options, duration, allowMultiselect: input.allowMultiselect === true };
}
export function assertFimaPlan(plan, { guildId, actorId, version, inventoryHash, now = Date.now() }) {
  if (!plan || plan.guildId !== guildId || plan.actorId !== actorId) throw fimaOperationError('plan_not_authorized', 403);
  if (plan.expiresAt <= now) throw fimaOperationError('plan_expired');
  if (plan.version !== version || plan.inventoryHash !== inventoryHash) throw fimaOperationError('plan_drift_detected');
}
