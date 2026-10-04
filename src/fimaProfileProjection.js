const GLOBAL_FIELDS = ['profileId', 'discordUserId', 'robloxId', 'robloxUsername', 'verifiedAt', 'createdAt', 'updatedAt', 'displayName', 'avatarUrl', 'visibility', 'region'];
const GUILD_FIELDS = ['region', 'visibility', 'privacyUpdatedAt', 'profileUpdatedAt', 'stageRank'];
// A legacy guild row cannot override portable identity, IDs, or verification.
export function fimaGuildProfileProjection(identity = {}, local = {}) {
  const pick = (source, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(source, key)).map(key => [key, structuredClone(source[key])]));
  const global = pick(identity, GLOBAL_FIELDS);
  const guild = pick(local, GUILD_FIELDS);
  // Preserve IDs from legacy guild-only records until their audited migration.
  if (!global.profileId && local.profileId) global.profileId = local.profileId;
  const projected = { ...global, ...guild };
  if (global.visibility === 'private') projected.visibility = 'private';
  return projected;
}

// Called only under the shared-state serializable transaction (or fallback lock).
// Existing guild IDs stay untouched; only the portable identity receives an ID.
export function ensureFimaGlobalProfileId(state, discordId) {
  const identity = state.profiles?.[discordId];
  if (!identity) return null;
  if (Number.isSafeInteger(identity.profileId) && identity.profileId > 0) return identity.profileId;
  const otherIds = new Set(Object.entries(state.profiles).filter(([id]) => id !== discordId).map(([, row]) => row.profileId));
  const localIds = Object.values(state.guildProfiles || {}).map(rows => rows?.[discordId]?.profileId).filter(id => Number.isSafeInteger(id) && id > 0);
  const legacy = localIds.find(id => !otherIds.has(id));
  const allIds = [...otherIds, ...Object.values(state.guildProfiles || {}).flatMap(rows => Object.values(rows || {}).map(row => row.profileId))].filter(Number.isSafeInteger);
  identity.profileId = legacy || allIds.reduce((maximum, id) => Math.max(maximum, id), Math.max(100, Number(state.globalProfileMeta?.nextProfileId) || 100)) + 1;
  state.globalProfileMeta = { ...(state.globalProfileMeta || {}), nextProfileId: Math.max(identity.profileId, Number(state.globalProfileMeta?.nextProfileId) || 100) };
  return identity.profileId;
}
