// Read-only evidence. A cache miss is never evidence that a role is unused.
export function auditFimaRoleDependencies({ guildId, roles = [], channels = [], autoModRules = [], config = {}, configAvailable = true, autoModAvailable = true, cachedMemberCount = 0, guildMemberCount = null, botRolePosition = 0 }) {
  const references = new Map(roles.map(role => [String(role.id), []]));
  let visited = 0, truncated = false;
  const seen = new WeakSet();
  function record(id, path) {
    const entries = references.get(String(id));
    if (entries && !entries.includes(path)) entries.push(path);
  }
  function walk(value, path, depth = 0) {
    if (++visited > 20000 || depth > 20) { truncated = true; return; }
    if (typeof value === 'string') {
      record(value, path);
      for (const match of value.matchAll(/<@&(\d{17,20})>/g)) record(match[1], path);
    } else if (value && typeof value === 'object' && !seen.has(value)) {
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        // Never include config values, URLs, tokens or arbitrary user text in evidence.
        const segment = /^\w{1,64}$/.test(key) ? key : '[redacted-key]';
        const childPath = `${path}.${segment}`;
        record(key, `${path}.[role-key]`);
        walk(child, childPath, depth + 1);
        if (visited > 20000) break;
      }
    }
  }
  if (configAvailable) walk(config, 'guildConfig');
  const rows = roles.map(role => {
    const channelReferences = channels.filter(channel => (channel.permissionOverwrites || []).some(overwrite => Number(overwrite.type) === 0 && String(overwrite.id) === String(role.id))).map(channel => ({ channelId: channel.id, channelName: channel.name }));
    const autoModReferences = autoModRules.filter(rule => (rule.exemptRoleIds || []).map(String).includes(String(role.id))).map(rule => ({ ruleId: rule.id, enabled: Boolean(rule.enabled) }));
    const configReferences = references.get(String(role.id));
    const knownDependencies = channelReferences.length + autoModReferences.length + configReferences.length;
    const blockers = ['member_inventory_incomplete', 'external_provider_dependencies_unverified'];
    if (String(role.id) === String(guildId)) blockers.push('everyone_role');
    if (role.managed) blockers.push('discord_managed_role');
    if (role.position >= botRolePosition) blockers.push('at_or_above_bot_hierarchy');
    if (knownDependencies) blockers.push('known_dependencies');
    if (role.cachedMemberCount > 0) blockers.push('observed_members');
    if (!configAvailable) blockers.push('guild_config_unavailable');
    if (truncated) blockers.push('guild_config_scan_incomplete');
    if (!autoModAvailable) blockers.push('automod_discovery_unavailable');
    return { roleId: role.id, roleName: role.name, position: role.position, managed: Boolean(role.managed), managedTags: role.managedTags || {}, cachedMemberCount: role.cachedMemberCount || 0, memberCountCoverage: 'CACHE_ONLY', channelReferences, autoModReferences, configReferences, usage: knownDependencies || role.cachedMemberCount > 0 ? 'USED' : 'UNKNOWN', removalStatus: 'BLOCKED', blockers };
  });
  return { status: 'READ_ONLY_PARTIAL', memberCoverage: { status: 'CACHE_ONLY', cachedMemberCount, guildMemberCount, complete: false }, configCoverage: { available: configAvailable, complete: configAvailable && !truncated }, autoModCoverage: { available: autoModAvailable }, externalProviderCoverage: 'UNVERIFIED', deletionAuthorized: false, roles: rows };
}
