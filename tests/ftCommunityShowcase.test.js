import test from 'node:test';
import assert from 'node:assert/strict';
import { showcaseItems, showcasePayload, readShowcaseHistory, initializeShowcaseChannel } from '../src/ftCommunityShowcase.js';

test('restart recovers the existing bot panel and saved pause/index without another message', async () => {
  let saved;
  let edits = 0;
  const canonical = { id: '30', author: { id: 'bot' }, embeds: [{ footer: { text: 'FIMA showcase v1 • 1/2' } }], edit: async () => { edits++; return canonical; } };
  const history = new Map([
    ['30', canonical],
    ['20', { id: '20', embeds: [{ title: 'Cape', image: { url: 'https://example.com/cape.png' } }] }],
    ['10', { id: '10', embeds: [{ title: 'Outfit', image: { url: 'https://example.com/outfit.png' } }] }]
  ]);
  const channel = { id: 'restart-test', name: 'outfits', messages: { fetch: async () => history }, send: async () => { assert.fail('restart must not post a duplicate'); } };
  const settings = { findUnique: async () => ({ value: { messageId: '30', index: 1, paused: true } }), upsert: async record => { saved = record.update.value; } };
  const state = await initializeShowcaseChannel(channel, 'bot', settings);
  assert.equal(edits, 1);
  assert.equal(state.messageId, '30');
  assert.equal(state.index, 1);
  assert.equal(state.paused, true);
  assert.equal(saved.items.length, 2);
  assert.equal(saved.messageId, '30');
});

test('showcase preserves historical links and creator IDs, excludes canonical panels and duplicates', () => {
  const embed = { title: 'Kaneki Cape', description: 'ID: 93181831660454 • By <@1170055415896211476>\nhttps://www.roblox.com/catalog/93181831660454', image: { url: 'https://example.com/cape.png' } };
  const messages = [
    { id: '3', embeds: [{ ...embed, footer: { text: 'FIMA showcase v1 • 1/2' } }] },
    { id: '2', embeds: [embed] },
    { id: '1', embeds: [embed] }
  ];
  const result = showcaseItems(messages);
  assert.equal(result.length, 1);
  assert.equal(result[0].sourceId, '1');
  assert.deepEqual(result[0].embed, embed);
  assert.equal(messages[0].id, '3');
});

test('pagination reads older products beyond the first Discord message page', async () => {
  const calls = [];
  const first = new Map(Array.from({ length: 100 }, (_, i) => [String(200 - i), { id: String(200 - i), embeds: [] }]));
  first.last = () => [...first.values()].at(-1);
  const last = new Map([['100', { id: '100', embeds: [{ title: 'Old outfit', image: { url: 'https://example.com/old.png' } }] }]]);
  last.last = () => [...last.values()].at(-1);
  const channel = { messages: { fetch: async options => { calls.push(options); return calls.length === 1 ? first : last; } } };
  const result = await readShowcaseHistory(channel);
  assert.equal(result.length, 101);
  assert.deepEqual(calls[1], { limit: 100, before: '101' });
  assert.equal(showcaseItems(result)[0].embed.title, 'Old outfit');
});

test('stalled pagination fails instead of silently creating an incomplete showcase', async () => {
  const batch = new Map(Array.from({ length: 100 }, (_, i) => [String(i), { id: String(i) }]));
  batch.last = () => ({ id: 'same' });
  await assert.rejects(readShowcaseHistory({ messages: { fetch: async () => batch } }), /did not advance/);
});

test('navigation wraps, preserves product content and links to original without pings', () => {
  const state = { channelId: '55', index: -1, paused: true, items: [
    { sourceId: '1', embed: { title: 'Outfit', image: { url: 'https://example.com/one.png' } } },
    { sourceId: '2', embed: { title: 'Cape', description: 'By <@123>', image: { url: 'https://example.com/two.png' } } }
  ] };
  const payload = showcasePayload(state);
  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.title, 'Cape');
  assert.equal(embed.description, 'By <@123>');
  assert.match(embed.footer.text, /2\/2.*Paused/);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.equal(payload.components[0].toJSON().components[3].url, 'https://discord.com/channels/1419335632324657306/55/2');
});
