import test from 'node:test';
import assert from 'node:assert/strict';
import { withTemporaryVoiceJoin, moveToTemporaryVoice, recoverTemporaryVoices, reserveTemporaryVoiceCreation, persistTemporaryVoice } from '../src/fimaTemporaryVoiceLifecycle.js';

test('creation cooldown blocks repeated attempts, expires and isolates members and guilds', () => {
  assert.equal(reserveTemporaryVoiceCreation('cooldown-guild:a', 1000), true);
  assert.equal(reserveTemporaryVoiceCreation('cooldown-guild:a', 30999), false);
  assert.equal(reserveTemporaryVoiceCreation('cooldown-guild:b', 30999), true);
  assert.equal(reserveTemporaryVoiceCreation('other-guild:a', 30999), true);
  assert.equal(reserveTemporaryVoiceCreation('cooldown-guild:a', 31000), true);
});

test('persistence failure removes an empty new room and preserves the original error', async () => {
  let deleted = 0;
  const channel = { members: { size: 0 }, delete: async () => { deleted++; } };
  const failure = new Error('storage unavailable');
  await assert.rejects(persistTemporaryVoice({ channel, persist: async () => { throw failure; } }), error => error === failure);
  assert.equal(deleted, 1);
  channel.members.size = 1;
  await assert.rejects(persistTemporaryVoice({ channel, persist: async () => { throw failure; } }), error => error === failure);
  assert.equal(deleted, 1);
  channel.members.size = 0;
  channel.delete = async () => { throw new Error('delete denied'); };
  await assert.rejects(persistTemporaryVoice({ channel, persist: async () => { throw failure; } }),
    error => error === failure && error.cleanupError.message === 'delete denied');
});

test('concurrent events create once and release the member lock after failure', async () => {
  let calls = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const operation = async () => { calls++; await barrier; throw new Error('move failed'); };
  const first = withTemporaryVoiceJoin('guild:member', operation);
  const second = withTemporaryVoiceJoin('guild:member', operation);
  assert.equal(first, second);
  release();
  await assert.rejects(first, /move failed/);
  assert.equal(calls, 1);
  await withTemporaryVoiceJoin('guild:member', async () => { calls++; });
  assert.equal(calls, 2);
});

test('failed move deletes only a newly created empty room, before removing its record', async () => {
  const events = [];
  const channel = { id: 'room', members: { size: 0 }, delete: async () => { events.push('delete'); } };
  const move = async () => { throw new Error('move failed'); };
  const removeRecord = async () => { events.push('record'); };
  await assert.rejects(moveToTemporaryVoice({ channel, move, removeRecord, created: true }), /move failed/);
  assert.deepEqual(events, ['delete', 'record']);
  events.length = 0;
  await assert.rejects(moveToTemporaryVoice({ channel, move, removeRecord }), /move failed/);
  channel.members.size = 1;
  await assert.rejects(moveToTemporaryVoice({ channel, move, removeRecord, created: true }), /move failed/);
  assert.deepEqual(events, []);
});

test('failed deletion retains the record for recovery', async () => {
  let removed = false;
  const channel = { id: 'room', members: { size: 0 }, delete: async () => { throw new Error('permission denied'); } };
  await assert.rejects(moveToTemporaryVoice({ channel, created: true,
    move: async () => { throw new Error('move failed'); }, removeRecord: async () => { removed = true; } }),
  error => error.message === 'move failed' && error.cleanupError.message === 'permission denied');
  assert.equal(removed, false);
});

test('restart recovery respects occupied rooms, disabled guilds, missing channels and delete failures', async () => {
  const deleted = [];
  const removed = [];
  const channels = {
    empty: { type: 2, members: { size: 0 }, delete: async () => { deleted.push('empty'); } },
    occupied: { type: 2, members: { size: 1 } },
    text: { type: 0, members: { size: 0 } },
    denied: { type: 2, members: { size: 0 }, delete: async () => { throw new Error('denied'); } }
  };
  const records = Object.fromEntries(['empty', 'occupied', 'text', 'missing', 'denied', 'disabled'].map(id =>
    [id, { channelId: id, guildId: id === 'disabled' ? 'off' : 'guild' }]));
  const result = await recoverTemporaryVoices({ records,
    getGuild: () => ({ channels: { fetch: async id => channels[id] || null } }),
    enabled: id => id !== 'off', removeRecord: async id => { removed.push(id); } });
  assert.deepEqual(deleted, ['empty']);
  assert.deepEqual(removed, ['empty', 'missing']);
  assert.deepEqual(result.map(row => row.status), ['deleted', 'missing', 'retry']);
});

test('independent members do not block one another', async () => {
  let release;
  const first = withTemporaryVoiceJoin('guild:a', () => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  assert.equal(await withTemporaryVoiceJoin('guild:b', async () => 'done'), 'done');
  release();
  await first;
});
