import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFieelInfoReplacement, replaceFieelInfoCanonical, publishCommunityInfo } from '../src/ftCommunityInfo.js';

const GUILD_ID = '1419335632324657306';
const BOT_ID = '1511058472748454019';

function settingsStore(initial = []) {
  const values = new Map(initial.map(item => [item.key, item.value]));
  return {
    values,
    findUnique: async ({ where }) => values.has(where.key) ? { key: where.key, value: structuredClone(values.get(where.key)) } : null,
    upsert: async ({ where, create, update }) => { const value = structuredClone(update?.value ?? create.value); values.set(where.key, value); return { key: where.key, value }; }
  };
}

function channel({ webhookToken = null, sourceAuthor = 'legacy-user', sourceId = '100' } = {}) {
  const source = { id: sourceId, content: '', webhookId: 'hook-1', author: { id: sourceAuthor },
    embeds: [{ title: 'About Fieel', description: 'Creator\nSocials: https://example.test/fieel', image: { url: 'https://example.test/art.png' } }] };
  const sent = [];
  const messages = { fetch: async options => options?.message
    ? sent.find(item => item.id === options.message) || source
    : new Map([[source.id, source], ...sent.map(item => [item.id, item])]) };
  return {
    id: '1420401524953186415', name: '⌁・fieel-info', guild: { id: GUILD_ID }, messages,
    fetchWebhooks: async () => new Map([['hook-1', { token: webhookToken }]]),
    send: async payload => { const message = { id: '200', author: { id: BOT_ID }, embeds: payload.embeds, ...payload }; sent.push(message); return message; },
    sent
  };
}

test('Owner replacement requires reviewed plan and preserves original', async () => {
  const settings = settingsStore();
  const target = channel();
  const channels = [target];
  const plan = await prepareFieelInfoReplacement(target, BOT_ID, channels, settings);
  const value = await replaceFieelInfoCanonical(target, BOT_ID, channels, plan.digest, 'owner-1', settings);
  assert.equal(value.status, 'verified');
  assert.equal(value.replacement.originalRetained, true);
  assert.equal(value.source.id, '100');
  assert.equal(target.sent.length, 1);
  assert.equal(target.sent[0].embeds[0].title, 'About Fieel');
});

test('Replacement blocks editable webhooks and ambiguous sources', async () => {
  const settings = settingsStore();
  await assert.rejects(() => prepareFieelInfoReplacement(channel({ webhookToken: 'secret' }), BOT_ID, [], settings), /edited in place/);
  const ambiguous = channel();
  ambiguous.messages.fetch = async () => new Map([
    ['100', { id: '100', author: { id: 'x' }, embeds: [{ title: 'About Fieel' }] }],
    ['101', { id: '101', author: { id: 'y' }, embeds: [{ title: 'About Fieel' }] }]
  ]);
  await assert.rejects(() => prepareFieelInfoReplacement(ambiguous, BOT_ID, [], settings), /ambiguous/);
});

test('Publish never duplicates an uneditable existing info message', async () => {
  const settings = settingsStore();
  const target = channel();
  await assert.rejects(() => publishCommunityInfo(target, BOT_ID, [target], settings), /cannot be edited/);
  assert.equal(target.sent.length, 0);
});

test('Changed source rejects the reviewed digest before posting', async () => {
  const settings = settingsStore();
  const target = channel();
  const plan = await prepareFieelInfoReplacement(target, BOT_ID, [target], settings);
  const source = await target.messages.fetch({ message: '100' });
  source.embeds[0].description += '\nChanged';
  await assert.rejects(() => replaceFieelInfoCanonical(target, BOT_ID, [target], plan.digest, 'owner-1', settings), /plan stale/);
  assert.equal(target.sent.length, 0);
  assert.equal(settings.values.size, 0);
});

test('Uncertain send persists a recovery lock and blocks all automatic retries', async () => {
  const settings = settingsStore();
  const target = channel();
  const plan = await prepareFieelInfoReplacement(target, BOT_ID, [target], settings);
  let attempts = 0;
  target.send = async () => { attempts++; throw new Error('network timeout'); };
  await assert.rejects(() => replaceFieelInfoCanonical(target, BOT_ID, [target], plan.digest, 'owner-1', settings), /network timeout/);
  assert.equal(settings.values.get(`ft_info:${target.id}`).status, 'replacement_pending');
  await assert.rejects(() => replaceFieelInfoCanonical(target, BOT_ID, [target], plan.digest, 'owner-1', settings), /requires recovery/);
  await assert.rejects(() => publishCommunityInfo(target, BOT_ID, [target], settings), /requires recovery/);
  assert.equal(attempts, 1);
});

test('Failed live readback retains the posted ID without marking verified', async () => {
  const settings = settingsStore();
  const target = channel();
  const plan = await prepareFieelInfoReplacement(target, BOT_ID, [target], settings);
  const fetch = target.messages.fetch;
  target.messages.fetch = async options => options?.message === '200' ? { author: { id: 'other' }, embeds: [] } : fetch(options);
  await assert.rejects(() => replaceFieelInfoCanonical(target, BOT_ID, [target], plan.digest, 'owner-1', settings), /readback mismatch/);
  const stored = settings.values.get(`ft_info:${target.id}`);
  assert.equal(stored.status, 'replacement_pending');
  assert.equal(stored.messageId, '200');
  assert.equal(stored.source.id, '100');
});
