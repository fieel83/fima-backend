import test from 'node:test';
import assert from 'node:assert/strict';
import { ftWelcomeDestinations } from '../src/ftCommunityWelcome.js';

function fixture() {
  const channels = new Map([
    ['1', { id: '1', name: 'rules', isTextBased: () => true }],
    ['2', { id: '2', name: 'roles', isTextBased: () => true }],
    ['3', { id: '3', name: 'general', isTextBased: () => true }],
    ['4', { id: '4', name: 'turkce-sohbet', isTextBased: () => true }],
    ['5', { id: '5', name: 'support', isTextBased: () => true }],
    ['6', { id: '6', name: 'VOICE', isTextBased: () => false }]
  ]);
  channels.find = predicate => [...channels.values()].find(predicate);
  return { channels: { cache: channels } };
}

test('migrated channels remain visible with deleted or non-text mappings; missing destinations are omitted', () => {
  const result = ftWelcomeDestinations(fixture(), { channelMappings: { rules_channel: 'deleted', role_guide_channel: '6' } }, { tickets: true });
  assert.equal(result.length, 4);
  assert.match(result.join('\n'), /<#1>/);
  assert.match(result.join('\n'), /language, region.*<#2>/);
  assert.match(result.join('\n'), /<#3>/);
  assert.match(result.join('\n'), /<#5>/);
  assert.doesNotMatch(result.join('\n'), /undefined|<#6>|<#4>/);
});

test('Turkish onboarding selects Turkish chat and suppresses disabled support', () => {
  const result = ftWelcomeDestinations(fixture(), {}, { tr: true });
  assert.equal(result.length, 3);
  assert.match(result.join('\n'), /Dilini, bölgeni/);
  assert.match(result.join('\n'), /<#4>/);
  assert.doesNotMatch(result.join('\n'), /<#3>|<#5>/);
});
