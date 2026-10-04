import test from 'node:test';
import assert from 'node:assert/strict';
import { AuditLogEvent } from 'discord.js';
import { verifyFimaVoiceCreation } from '../src/fimaDiscordGateway.js';
test('voice reconciliation proves guild, bot, audit reason, time, category, type and permissions', () => {
  const plan = { guildId: '1419335632324657306', reason: 'FIMA voice unique-plan', deliveryStartedAt: 10000,
    payload: { name: 'Join to Create', parentId: null, permissionOverwrites: [] } };
  const channel = { id: '1555567483329712290', guildId: plan.guildId, name: plan.payload.name, type: 2, parentId: null, permissionOverwrites: { cache: new Map() } };
  const proof = { action: AuditLogEvent.ChannelCreate, targetId: channel.id, executorId: 'bot', reason: plan.reason, createdTimestamp: 10001 };
  const verify = (ch = channel, entry = proof) => verifyFimaVoiceCreation(ch, new Map([['proof', entry]]), plan, 'bot');
  assert.equal(verify(), channel.id);
  for (const change of [{ executorId: 'other' }, { reason: 'wrong' }, { targetId: 'other' }, { createdTimestamp: 1 }, { action: AuditLogEvent.ChannelUpdate }]) assert.throws(() => verify(channel, { ...proof, ...change }), /voice_creation_proof_missing/);
  for (const change of [{ guildId: 'other' }, { type: 0 }, { parentId: 'other' }, { name: 'other' }, { permissionOverwrites: { cache: new Map([['role', { id: 'role', type: 0, allow: '1', deny: '0' }]]) } }]) assert.throws(() => verify({ ...channel, ...change }), /voice_creation_proof_missing/);
  assert.throws(() => verify(null), /voice_creation_proof_missing/);
});
