import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyFimaPollDelivery } from '../src/fimaDiscordGateway.js';
const plan = { guildId: '1419335632324657306', nonce: 'verified-nonce', deliveryStartedAt: 100000,
  payload: { channelId: '1420401535204065311', question: 'When?', options: ['Today', 'Tomorrow'], duration: 24, allowMultiselect: false } };
const message = () => ({ guildId: plan.guildId, channelId: plan.payload.channelId, id: '1555567483329712270',
  author: { id: 'bot' }, nonce: plan.nonce, createdTimestamp: 100100, url: 'https://discord.com/channels/test',
  poll: { question: { text: 'When?' }, answers: new Map([[1, { text: 'Today' }], [2, { text: 'Tomorrow' }]]), allowMultiselect: false } });
test('reconciliation requires scoped bot message, original nonce, contents and creation time', () => {
  assert.equal(verifyFimaPollDelivery(message(), plan, 'bot').messageId, '1555567483329712270');
  const variants = [null, { ...message(), guildId: 'foreign' }, { ...message(), channelId: 'foreign' },
    { ...message(), author: { id: 'human' } }, { ...message(), nonce: null }, { ...message(), nonce: 'other' },
    { ...message(), createdTimestamp: 1000 }, { ...message(), poll: null },
    { ...message(), poll: { ...message().poll, question: { text: 'Other poll' } } },
    { ...message(), poll: { ...message().poll, allowMultiselect: true } }];
  for (const candidate of variants) assert.throws(() => verifyFimaPollDelivery(candidate, plan, 'bot'), { code: 'poll_delivery_proof_missing' });
  const reference = verifyFimaPollDelivery(message(), plan, 'bot');
  for (const key of ['question', 'options', 'voters', 'nonce']) assert.equal(Object.hasOwn(reference, key), false);
});
