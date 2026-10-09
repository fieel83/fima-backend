import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFtRulesReplacement, replaceFtRulesCanonical } from '../src/ftCommunityRules.js';

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

function channel({ webhookToken = null, sourceAuthor = 'legacy-user', sourceId = '1421220818498879543' } = {}) {
  const source = { id: sourceId, content: '', webhookId: 'hook-1', author: { id: sourceAuthor },
    embeds: [{ title: 'FT Community Rules', description: 'Creator\nSocials: https://example.test/fieel', image: { url: 'https://example.test/art.png' } }] };
  const sent = [];
  const messages = { fetch: async options => options?.message
    ? sent.find(item => item.id === options.message) || source
    : new Map([[source.id, source], ...sent.map(item => [item.id, item])]) };
  return {
    id: '1420401536571543593', name: '⌁・rules', guild: { id: GUILD_ID }, messages,
    fetchWebhooks: async () => new Map([['hook-1', { token: webhookToken }]]),
    send: async payload => { const message = { id: '200', author: { id: BOT_ID }, embeds: payload.embeds, ...payload }; sent.push(message); return message; },
    sent
  };
}

test('Owner replacement requires reviewed plan and preserves original', async () => {
  const settings = settingsStore();
  const target = channel();
  const channels = [target];
  const plan = await prepareFtRulesReplacement(target, BOT_ID, settings);
  const value = await replaceFtRulesCanonical(target, BOT_ID, plan.digest, 'owner-1', settings);
  assert.equal(value.status, 'verified');
  assert.equal(value.replacement.originalRetained, true);
  assert.equal(value.source.id, '1421220818498879543');
  assert.equal(target.sent.length, 1);
  assert.equal(target.sent[0].embeds[0].title, 'FT Community Rules');
  assert.equal(target.sent[0].embeds[1].title, 'FT Community Kuralları');
  assert.match(target.sent[0].embeds[1].description, /Spam, flood ve raid/);
  assert.equal(target.sent[0].embeds[0].description.includes('No hate speech'), true);
});

test('Replacement blocks editable webhooks and ambiguous sources', async () => {
  const settings = settingsStore();
  await assert.rejects(() => prepareFtRulesReplacement(channel({ webhookToken: 'secret' }), BOT_ID, settings), /edited in place/);
  const ambiguous = channel();
  ambiguous.messages.fetch = async () => new Map([
    ['1421220818498879543', { id: '1421220818498879543', author: { id: 'x' }, embeds: [{ title: 'FT Community Rules' }] }],
    ['101', { id: '1421220818498879543', author: { id: 'y' }, embeds: [{ title: 'FT Community Rules' }] }]
  ]);
  await assert.rejects(() => prepareFtRulesReplacement(ambiguous, BOT_ID, settings), /ambiguous/);
});

test('Changed source rejects the reviewed digest before posting', async () => {
  const settings = settingsStore();
  const target = channel();
  const plan = await prepareFtRulesReplacement(target, BOT_ID, settings);
  const source = await target.messages.fetch({ message: '1421220818498879543' });
  source.embeds[0].description += '\nChanged';
  await assert.rejects(() => replaceFtRulesCanonical(target, BOT_ID, plan.digest, 'owner-1', settings), /plan stale/);
  assert.equal(target.sent.length, 0);
  assert.equal(settings.values.size, 0);
});

test('Uncertain send persists a recovery lock and blocks all automatic retries', async () => {
  const settings = settingsStore();
  const target = channel();
  const plan = await prepareFtRulesReplacement(target, BOT_ID, settings);
  let attempts = 0;
  target.send = async () => { attempts++; throw new Error('network timeout'); };
  await assert.rejects(() => replaceFtRulesCanonical(target, BOT_ID, plan.digest, 'owner-1', settings), /network timeout/);
  assert.equal(settings.values.get(`ft_rules:${target.id}`).status, 'replacement_pending');
  await assert.rejects(() => replaceFtRulesCanonical(target, BOT_ID, plan.digest, 'owner-1', settings), /requires recovery/);
  assert.equal(attempts, 1);
});

test('Failed live readback retains the posted ID without marking verified', async () => {
  const settings = settingsStore();
  const target = channel();
  const plan = await prepareFtRulesReplacement(target, BOT_ID, settings);
  const fetch = target.messages.fetch;
  target.messages.fetch = async options => options?.message === '200' ? { author: { id: 'other' }, embeds: [] } : fetch(options);
  await assert.rejects(() => replaceFtRulesCanonical(target, BOT_ID, plan.digest, 'owner-1', settings), /readback mismatch/);
  const stored = settings.values.get(`ft_rules:${target.id}`);
  assert.equal(stored.status, 'replacement_pending');
  assert.equal(stored.messageId, '200');
  assert.equal(stored.source.id, '1421220818498879543');
});


test('Rejects other guilds and channels before any write', async () => {
  const target = channel();
  target.id = 'other';
  await assert.rejects(() => prepareFtRulesReplacement(target, BOT_ID, settingsStore()), /scope mismatch/);
  assert.equal(target.sent.length, 0);
});

test('Verifies Turkish readback as well as English', async () => {
  const settings = settingsStore();
  const target = channel();
  const plan = await prepareFtRulesReplacement(target, BOT_ID, settings);
  const fetch = target.messages.fetch;
  target.messages.fetch = async options => {
    const result = await fetch(options);
    if (options?.message === '200') return { ...result, embeds: [result.embeds[0], { ...result.embeds[1], description: 'Changed' }] };
    return result;
  };
  await assert.rejects(() => replaceFtRulesCanonical(target, BOT_ID, plan.digest, 'owner-1', settings), /readback mismatch/);
  assert.equal(settings.values.get(`ft_rules:${target.id}`).status, 'replacement_pending');
});
