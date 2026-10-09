// Setup presets select shared modules; they never generate Discord channel trees.
export const FIMA_SETUP_TYPES = Object.freeze(['community', 'clan', 'tsbtr']);
const competitive = new Set(['leaderboards', 'challenge', 'availability', 'sessions', 'roster']);
export const fimaCanonicalModule = id => ({ leaderboard: 'leaderboards', training: 'sessions', tryout: 'sessions', referee: 'sessions', lineups: 'roster', war: 'roster', fima_support: 'ai' })[id] || id;
const commandModules = { profiles: ['profile', 'verifyroblox'], tickets: ['ticket'], challenge: ['challenge'], availability: ['availability'], sessions: ['training', 'tryout', 'referee'], roster: ['roster', 'lineup', 'spar', 'war'], leaderboards: ['leaderboard', 'rank'], moderation: ['mod', 'channel'], applications: ['application'], ai: ['fima_support_ai', 'fima_license_check', 'fima_license_repair'] };
const defaults = {
  community: ['welcome', 'roles', 'profiles', 'security', 'moderation', 'social', 'content', 'polls', 'events', 'voice', 'logs'],
  clan: ['welcome', 'roles', 'profiles', 'security', 'moderation', 'applications', 'tickets', 'leaderboards', 'challenge', 'availability', 'sessions', 'voice', 'logs'],
  tsbtr: ['welcome', 'roles', 'profiles', 'security', 'moderation', 'applications', 'tickets', 'leaderboards', 'challenge', 'availability', 'sessions', 'events', 'voice', 'logs']
};
const dependencies = { challenge: ['profiles', 'leaderboards'], availability: ['profiles'], sessions: ['profiles'], polls: ['content'] };
const bindings = { welcome: ['welcome'], tickets: ['tickets'], logs: ['logs'], social: ['uploads'], polls: ['content'], content: ['content'], voice: ['join_to_create'] };
export const FIMA_VOICE_NAMES = Object.freeze({
  joinToCreate: Object.freeze(['◦・join-to-create', '◦・create-room', 'Create Room', '⌁・join-to-create', '◜・oda-oluştur', 'Join to Create', 'Create a Room']),
  privateCategory: Object.freeze(['◉・VOICE', 'VOICE', '⌁・VOICE', '━━ ÖZEL SESLER ━━', 'PRIVATE VOICE'])
});
export function fimaVoiceSettings(config = {}) {
  return { ...(config.voiceSettings || {}),
    joinToCreateChannelId: config.channelMappings?.join_to_create || config.voiceSettings?.joinToCreateChannelId || null,
    privateVoiceCategoryId: config.channelMappings?.private_voice || config.voiceSettings?.privateVoiceCategoryId || null };
}
export const FIMA_MODULE_CATALOG = Object.freeze([...new Set([...Object.values(defaults).flat(), 'roster', 'levels', 'voice', 'ai', 'commands'])].map(id => Object.freeze({
  id, version: 1, compatibleTypes: competitive.has(id) ? ['clan', 'tsbtr'] : FIMA_SETUP_TYPES,
  defaultTypes: FIMA_SETUP_TYPES.filter(type => defaults[type].includes(id)),
  dependencies: dependencies[id] || [], bindings: bindings[id] || [],
  permissions: id === 'polls' ? ['ViewChannel', 'SendMessages', 'SendPolls'] : id === 'voice' ? ['ViewChannel', 'Connect', 'ManageChannels', 'MoveMembers'] : [],
  commands: commandModules[id] || [], navigation: id, retainHistoryOnDisable: true
})));
export function fimaSetupType(config = {}, card = {}) {
  return FIMA_SETUP_TYPES.includes(config.activeSetupMode) ? config.activeSetupMode
    : FIMA_SETUP_TYPES.includes(card.activeTemplate) ? card.activeTemplate : 'community';
}
export function fimaModuleStates(config = {}, card = {}) {
  const type = fimaSetupType(config, card);
  const legacyIds = Array.isArray(config.enabledModules) ? config.enabledModules.map(fimaCanonicalModule) : null;
  const legacy = legacyIds ? Object.fromEntries(FIMA_MODULE_CATALOG.map(row => [row.id, legacyIds.includes(row.id)])) : Object.fromEntries(Object.entries(config.enabledModules || {}).map(([id, value]) => [fimaCanonicalModule(id), value]));
  const selected = { ...Object.fromEntries(defaults[type].map(id => [id, true])), ...legacy, ...(config.modules || {}) };
  return FIMA_MODULE_CATALOG.map(module => {
    const compatible = module.compatibleTypes.includes(type);
    const enabled = compatible && selected[module.id] === true;
    const missingBindings = module.bindings.filter(key => !/^\d{16,22}$/.test(String((key === 'join_to_create' ? fimaVoiceSettings(config).joinToCreateChannelId : config.channelMappings?.[key]) || '')));
    const missingDependencies = module.dependencies.filter(id => selected[id] !== true);
    const configured = missingBindings.length === 0 && missingDependencies.length === 0;
    return { ...module, compatible, installed: config.moduleInstallations?.[module.id]?.version ? true : null, botInstalled: card.botInstalled === true, configured, enabled,
      healthy: null, healthStatus: 'not_observed', missingBindings, missingDependencies };
  });
}
export function assertFimaModuleSelection(config = {}, card = {}) {
  const invalid = fimaModuleStates(config, card).filter(item =>
    ((config.modules?.[item.id] ?? config.enabledModules?.[item.id]) === true && !item.compatible)
    || (item.enabled && item.missingDependencies.length));
  if (invalid.length) throw Object.assign(new Error('module_dependency_or_compatibility_conflict'), { code: 'module_dependency_or_compatibility_conflict', statusCode: 409 });
}
export function fimaWorkspaceRoutes(routes, config, card) {
  const modules = new Map(fimaModuleStates(config, card).map(item => [item.id, item]));
  return routes.filter(route => !modules.has(route.id) || modules.get(route.id).enabled);
}
// Legacy installations keep their rollout policy until a reviewed module map exists.
export function fimaRuntimeModuleAllowed(config = {}, module) {
  if (!config.modules || Array.isArray(config.modules)) return true;
  return fimaModuleStates(config).some(row => row.id === fimaCanonicalModule(module) && row.enabled);
}
// A reviewed map is enforced for slash commands and already-posted components.
export function fimaInteractionModuleAllowed(config, { commandName, customId = '' } = {}) {
  if (!config.modules || Array.isArray(config.modules)) return true;
  let module = FIMA_MODULE_CATALOG.find(row => row.commands.includes(commandName))?.id;
  if (!module && customId.startsWith('pv:')) {
    const family = customId.split(':')[2];
    const canonical = fimaCanonicalModule(family);
    module = FIMA_MODULE_CATALOG.some(row => row.id === canonical) ? canonical : ({ profile: 'profiles', verify: 'profiles', ticket: 'tickets', application: 'applications', giveaway: 'events' })[family];
  }
  const componentFamilies = [
    ['profiles', /^(?:paradise_)?(?:verify|profile)_/],
    ['challenge', /^(?:paradise_)?(?:challenge|approval)_/],
    ['availability', /^(?:paradise_)?(?:availability|loa)_/],
    ['sessions', /^(?:paradise_)?(?:tryout|training|session|referee)_/],
    ['applications', /^(?:paradise_)?application_/],
    ['tickets', /^(?:paradise_)?support_/],
    ['moderation', /^(?:paradise_)?mod_/],
    ['voice', /^(?:paradise_)?voice_/],
    ['events', /^(?:paradise_)?(?:payout|qotd|giveaway|rsvp)[_:]/]
  ];
  if (!module) module = componentFamilies.find(([, pattern]) => pattern.test(customId))?.[0];
  return !module || fimaRuntimeModuleAllowed(config, module);
}
// Generic workspace projections must never expose nested provider credentials.
export function fimaPublicConfig(value, depth = 0) {
  if (depth > 10) return null;
  if (Array.isArray(value)) return value.slice(0, 100).map(item => fimaPublicConfig(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/(secret|token|password|cookie|webhook|authorization|credential|private.?key)/i.test(key))
    .map(([key, item]) => [key, fimaPublicConfig(item, depth + 1)]));
  if (typeof value === 'string' && /(?:discord(?:app)?\.com\/api\/webhooks|Bearer\s)/i.test(value)) return '[redacted]';
  return value;
}
