import test from 'node:test';
import assert from 'node:assert/strict';
import { createPurgeConfirmations } from '../src/fimaPurgeConfirmation.js';

const context = { guildId: 'guild', channelId: 'channel', actorId: 'moderator' };
const clock = 1_800_000_000_000;
const message = (n, extra = {}) => ({ id: String(100000000000000000n + BigInt(n)), createdTimestamp: clock - 1000, pinned: false, ...extra });

test('purge previews cap at 100 and exclude pinned, expired, malformed and duplicate messages', () => {
  const store = createPurgeConfirmations({ now: () => clock });
  assert.equal(store.create(context, [message(0, { pinned: true }), message(1, { createdTimestamp: clock - 14 * 86400000 }), message(2, { id: 'invalid' })]), null);
  const preview = store.create(context, [...Array.from({ length: 110 }, (_, i) => message(i)), message(0)]);
  assert.equal(preview.ids.length, 100);
  assert.equal(new Set(preview.ids).size, 100);
  assert.ok(Object.isFrozen(preview.ids));
});

test('purge confirmation binds actor, guild, channel, exact count, expiration and fresh authority', async () => {
  let current = clock;
  const store = createPurgeConfirmations({ now: () => current });
  const preview = store.create(context, [message(1)]);
  let removed = 0;
  const callbacks = { authorize: async () => true, remove: async () => { removed++; return new Map(); } };
  for (const key of ['guildId', 'channelId', 'actorId']) {
    assert.equal((await store.execute(preview.token, { ...context, [key]: 'other' }, 'DELETE 1', callbacks)).status, 'expired');
  }
  assert.equal((await store.execute(preview.token, context, 'DELETE 2', callbacks)).status, 'confirmation_required');
  assert.equal((await store.execute(preview.token, context, 'DELETE 1', { ...callbacks, authorize: async () => false })).status, 'denied');
  current += 120000;
  assert.equal((await store.execute(preview.token, context, 'DELETE 1', callbacks)).status, 'expired');
  assert.equal(removed, 0);
});

test('simultaneous submissions delete the fixed snapshot once; failure cannot replay', async () => {
  const store = createPurgeConfirmations({ now: () => clock });
  const preview = store.create(context, [message(1), message(2)]);
  let removed = 0;
  const callbacks = { authorize: async () => true, remove: async ids => {
    removed++;
    assert.deepEqual(ids, [message(1).id, message(2).id]);
    return new Map([[ids[0], {}]]);
  } };
  const results = await Promise.all([store.execute(preview.token, context, 'DELETE 2', callbacks), store.execute(preview.token, context, 'DELETE 2', callbacks)]);
  assert.equal(removed, 1);
  assert.deepEqual(results.map(result => result.status).sort(), ['deleted', 'expired']);
  assert.equal(results.find(result => result.status === 'deleted').count, 1);
  const failed = store.create(context, [message(3)]);
  await assert.rejects(store.execute(failed.token, context, 'DELETE 1', { ...callbacks, remove: async () => { throw new Error('Discord failed'); } }));
  assert.equal(store.get(failed.token, context), null);
});

test('previews are bounded and expiry during authority refresh prevents deletion', async () => {
  let current = clock;
  const store = createPurgeConfirmations({ now: () => current, capacity: 2 });
  const first = store.create(context, [message(1)]);
  store.create(context, [message(2)]);
  const last = store.create(context, [message(3)]);
  assert.equal(store.get(first.token, context), null);
  const result = await store.execute(last.token, context, 'DELETE 1', {
    authorize: async () => { current += 120000; return true; },
    remove: async () => assert.fail('Expired preview must never delete')
  });
  assert.equal(result.status, 'expired');
});
