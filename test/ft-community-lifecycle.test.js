import test from 'node:test';
import assert from 'node:assert/strict';
import { ftLifecyclePresentation } from '../src/ftCommunityWelcome.js';

function fixture() {
  const cache = new Map(['⌁・rules', '◇・roles', '›・general', '⌁・uploads', '◇・support'].map((name, index) => [String(index + 10), { id: String(index + 10), name, isTextBased: () => true }]));
  cache.find = predicate => [...cache.values()].find(predicate);
  return { id: '123456789012345678', guild: { memberCount: 871, channels: { cache } } };
}

test('FT welcome uses approved copy and migrated channel mentions', () => {
  const message = ftLifecyclePresentation(fixture(), { channelMappings: { rules_channel: 'deleted' } }, { tickets: true });
  assert.equal(message.title, '⌂・WELCOME TO FT COMMUNITY');
  assert.match(message.description, /Welcome, \*\*<@123456789012345678>\*\*/);
  assert.match(message.description, /⌗・MEMBER #871/);
  for (const id of [10, 11, 12, 13, 14]) assert.ok(message.description.includes(`›・**<#${id}>**`));
  assert.doesNotMatch(message.description, /Made By|fieel-info|undefined|deleted/);
});

test('disabled tickets and missing channels do not produce dead welcome links', () => {
  const member = fixture();
  member.guild.channels.cache.delete('13');
  const message = ftLifecyclePresentation(member, {}, { tickets: false });
  assert.doesNotMatch(message.description, /<#13>|<#14>|latest content|Need help/);
});

test('leave has distinct copy and current member count without author footer', () => {
  const message = ftLifecyclePresentation(fixture(), {}, { joined: false });
  assert.equal(message.title, '⌂・GOODBYE FROM FT COMMUNITY');
  assert.match(message.description, /<@123456789012345678>/);
  assert.match(message.description, /MEMBERS 871/);
  assert.doesNotMatch(message.description, /WELCOME|GET STARTED|Made By/);
});
