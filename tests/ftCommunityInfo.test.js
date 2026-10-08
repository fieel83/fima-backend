import test from 'node:test';
import assert from 'node:assert/strict';
import { communityInfoPayload, publishCommunityInfo, startFtInfoWorker } from '../src/ftCommunityInfo.js';

const channels = new Map(['support', 'rules', 'roles', 'fima-macro', 'fake-headless'].map((name, index) => [String(index), { id: String(index), name, isTextBased: () => true }]));
channels.find = predicate => [...channels.values()].find(predicate);

test('profile removes the outdated biography and preserves verified socials and artwork', () => {
  const original = { title: 'About Fieel', description: '19 years old, best editor\n\n__Socials__\n[TikTok](https://www.tiktok.com/@fieel)\n[YouTube](https://youtube.com/@fieel)', thumbnail: { url: 'https://cdn.example.com/kaneki.png' } };
  const payload = communityInfoPayload('fieel-info', channels, original);
  assert.match(payload.embeds[0].description, /Fieel, 20/);
  assert.doesNotMatch(payload.embeds[0].description, /19 years|best editor|Kaan/);
  assert.match(payload.embeds[0].description, /https:\/\/www.tiktok.com\/@fieel/);
  assert.deepEqual(payload.embeds[0].thumbnail, original.thumbnail);
  assert.deepEqual(payload.allowedMentions.parse, []);
});

test('uneditable historical webhook blocks publication without creating a duplicate', async () => {
  let sent = false;
  let saved = false;
  const old = { id: '100', webhookId: 'webhook', embeds: [{ title: 'About Fieel' }] };
  const batch = new Map([['100', old]]);
  const channel = { id: 'channel', name: '⌁・fieel-info', guild: { id: '1419335632324657306' }, messages: { fetch: async () => batch }, fetchWebhooks: async () => new Map(), send: async () => { sent = true; } };
  await assert.rejects(publishCommunityInfo(channel, 'bot', channels, { findUnique: async () => null, upsert: async () => { saved = true; } }), /no duplicate created/);
  assert.equal(sent, false);
  assert.equal(saved, false);
});

test('publication edits the original webhook after backing it up and verifies the same message', async () => {
  const events = [];
  const embed = { title: 'About Fieel', description: '19 years old', toJSON() { return { title: this.title, description: this.description }; } };
  const old = { id: '100', webhookId: 'webhook', content: 'original link', embeds: [embed] };
  let payload;
  const webhook = { token: 'test', editMessage: async (id, next) => { events.push('edit'); assert.equal(id, old.id); payload = next; return { id }; } };
  const channel = { id: 'channel', name: '⌁・fieel-info', guild: { id: '1419335632324657306' }, messages: { fetch: async argument => typeof argument === 'string' ? { id: argument, embeds: payload.embeds } : new Map([['100', old]]) }, fetchWebhooks: async () => new Map([['webhook', webhook]]), send: async () => assert.fail('must edit original') };
  const writes = [];
  const settings = { findUnique: async () => null, upsert: async args => { events.push('save'); writes.push(args.update.value); } };
  const result = await publishCommunityInfo(channel, 'bot', channels, settings);
  assert.deepEqual(events, ['save', 'edit', 'save']);
  assert.equal(writes[0].source.content, 'original link');
  assert.equal(result.messageId, old.id);
  assert.equal(result.status, 'verified');
});

test('blocked historical profile does not prevent FAQ publication', async () => {
  const guild = { id: '1419335632324657306' };
  const old = { id: '100', webhookId: 'missing', embeds: [{ title: 'About Fieel' }] };
  const profile = { id: 'profile', name: '⌁・fieel-info', guild, messages: { fetch: async () => new Map([['100', old]]) }, fetchWebhooks: async () => new Map(), send: async () => assert.fail('must not duplicate profile') };
  let published;
  const faq = { id: 'faq', name: '⌁・faq', guild, messages: { fetch: async argument => typeof argument === 'string' ? { id: argument, embeds: published.embeds } : new Map() }, send: async payload => { published = payload; return { id: '200' }; } };
  const destinations = new Map([...channels, ['profile', profile], ['faq', faq]]);
  destinations.find = predicate => [...destinations.values()].find(predicate);
  const writes = [];
  guild.channels = { fetch: async () => destinations };
  startFtInfoWorker({ user: { id: 'bot' }, guilds: { fetch: async () => guild } }, { findUnique: async () => null, upsert: async args => writes.push(args.update.value) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(published.embeds[0].title, 'Support FAQ');
  assert.equal(writes.at(-1).messageId, '200');
  assert.equal(writes.at(-1).status, 'verified');
  assert.ok(writes.every(value => value.channelId === 'faq'));
});
