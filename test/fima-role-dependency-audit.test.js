import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFimaRoleDependencies } from '../src/fimaRoleDependencyAudit.js';

const roleId = '1420401457684938794';
const base = { guildId: '1419335632324657306', botRolePosition: 99, roles: [{ id: roleId, name: 'Admin', position: 70, cachedMemberCount: 2 }] };

test('role audit finds overwrite, disabled automod, reward-map keys and self-role mentions without leaking config', () => {
  const result = auditFimaRoleDependencies({ ...base,
    channels: [{ id: 'channel', name: 'staff', permissionOverwrites: [{ id: roleId, type: 0 }] }, { id: 'other', permissionOverwrites: [{ id: roleId, type: 1 }] }],
    autoModRules: [{ id: 'rule', enabled: false, exemptRoleIds: [roleId] }],
    config: { staff: { adminRoleId: roleId }, xp: { rewards: { [roleId]: 20 } }, roles: { description: `<@&${roleId}>` }, token: 'private-token', webhook: 'https://secret.test/token' }
  });
  const row = result.roles[0];
  assert.equal(row.usage, 'USED');
  assert.equal(row.channelReferences.length, 1);
  assert.equal(row.autoModReferences[0].enabled, false);
  assert.deepEqual(row.configReferences, ['guildConfig.staff.adminRoleId', 'guildConfig.xp.rewards.[role-key]', 'guildConfig.roles.description']);
  assert.ok(!JSON.stringify(result).includes('private-token'));
  assert.ok(!JSON.stringify(result).includes('secret.test'));
});

test('empty member caches and absence of references never qualify a role for removal', () => {
  const result = auditFimaRoleDependencies({ ...base, cachedMemberCount: 1, guildMemberCount: 1, roles: [{ id: roleId, position: 1 }] });
  assert.equal(result.memberCoverage.complete, false);
  assert.equal(result.roles[0].usage, 'UNKNOWN');
  assert.equal(result.roles[0].removalStatus, 'BLOCKED');
  assert.ok(result.roles[0].blockers.includes('external_provider_dependencies_unverified'));
  assert.equal(result.deletionAuthorized, false);
});

test('managed roles, hierarchy and incomplete discovery remain explicit blockers', () => {
  const result = auditFimaRoleDependencies({ ...base, configAvailable: false, autoModAvailable: false, roles: [{ id: base.guildId, position: 99, managed: true, managedTags: { botId: 'bot' } }] });
  assert.deepEqual(result.roles[0].managedTags, { botId: 'bot' });
  for (const reason of ['everyone_role', 'discord_managed_role', 'at_or_above_bot_hierarchy', 'guild_config_unavailable', 'automod_discovery_unavailable']) assert.ok(result.roles[0].blockers.includes(reason));
});

test('oversized and deeply nested configuration cannot masquerade as complete coverage', () => {
  let config = { role: roleId };
  for (let i = 0; i < 25; i++) config = { nested: config };
  const result = auditFimaRoleDependencies({ ...base, config });
  assert.equal(result.configCoverage.complete, false);
  assert.ok(result.roles[0].blockers.includes('guild_config_scan_incomplete'));
});
