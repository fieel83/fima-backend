import test from 'node:test';
import assert from 'node:assert/strict';
import { AuditLogEvent, PermissionsBitField } from 'discord.js';
import { ftStaffActionPayload, publishFtStaffAction } from '../src/ftCommunityStaffActions.js';

const guildId = '1419335632324657306';
const entry = { id: '1558000000000000001', action: AuditLogEvent.RoleUpdate, executorId: '1057874167447429120', targetId: '1420401457684938794', reason: 'password=secret', changes: [{ key: 'permissions', old: '0', new: '8' }] };
function fixture({ publicChannel = false, history = [] } = {}) {
  let sends = 0;
  const deny = new PermissionsBitField(publicChannel ? 0n : PermissionsBitField.Flags.ViewChannel);
  const overwrites = { cache: new Map([[guildId, { deny, allow: new PermissionsBitField(0n) }]]) };
  const parent = { name: 'MANAGEMENT', permissionOverwrites: overwrites };
  const channel = { id: '1558000000000000002', name: '⌁・staff-actions', parent, permissionOverwrites: overwrites, isTextBased: () => true,
    messages: { fetch: async () => new Map(history.map(row => [row.id, row])) }, send: async () => { sends++; return { id: '1558000000000000003' }; } };
  const guild = { id: guildId, client: { user: { id: '1511058472748454019' } }, channels: { fetch: async () => new Map([[channel.id, channel]]) }, roles: { cache: new Map() } };
  const store = new Map();
  const settings = { findUnique: async ({ where }) => store.get(where.key), upsert: async ({ where, create }) => { store.set(where.key, create); return create; } };
  return { guild, settings, sends: () => sends };
}
test('staff audit ignores other guilds and ordinary member roles, retains actor without copying audit reasons', () => {
  const { guild } = fixture();
  assert.equal(ftStaffActionPayload(entry, { ...guild, id: '1520519015661961257' }), null);
  assert.equal(ftStaffActionPayload({ ...entry, action: AuditLogEvent.MemberRoleUpdate, changes: [{ key: '$add', new: [{ id: '1420805456741404803' }] }] }, guild), null);
  const staff = ftStaffActionPayload({ ...entry, action: AuditLogEvent.MemberRoleUpdate, changes: [{ key: '$add', new: [{ id: '1420401457684938794' }] }] }, guild);
  assert.match(JSON.stringify(staff), /1057874167447429120/);
  assert.doesNotMatch(JSON.stringify(staff), /password|secret/);
  assert.deepEqual(staff.allowedMentions, { parse: [] });
});
test('public staff action destination fails before any write', async () => {
  const f = fixture({ publicChannel: true });
  await assert.rejects(publishFtStaffAction(entry, f.guild, f.settings), /private MANAGEMENT/);
  assert.equal(f.sends(), 0);
});
test('persisted Discord event is delivered once across repeated calls', async () => {
  const f = fixture();
  const results = await Promise.all([publishFtStaffAction(entry, f.guild, f.settings), publishFtStaffAction(entry, f.guild, f.settings)]);
  assert.deepEqual(results.map(result => result.status), ['logged', 'already_logged']);
  assert.equal(f.sends(), 1);
});
test('message history recovers a successful send with missing database receipt', async () => {
  const f = fixture({ history: [{ id: '1558000000000000004', author: { id: '1511058472748454019' }, embeds: [{ footer: { text: `FT staff action · ${entry.id}` } }] }] });
  assert.equal((await publishFtStaffAction(entry, f.guild, f.settings)).status, 'recovered');
  assert.equal(f.sends(), 0);
});
