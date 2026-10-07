import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField as Permissions } from 'discord.js';
import { temporaryVoiceOverwrites } from '../src/fimaVoicePermissions.js';

test('temporary rooms retain category privacy and staff access', () => {
  const source = [
    { id: 'everyone', type: 0, allow: 0n, deny: Permissions.Flags.ViewChannel },
    { id: 'staff', type: 0, allow: Permissions.Flags.ViewChannel | Permissions.Flags.Connect, deny: 0n }
  ];
  const result = temporaryVoiceOverwrites(source.values(), 'owner');
  assert.deepEqual(result.slice(0, 2), source);
  assert.equal(result[2].id, 'owner');
  assert.ok(result[2].allow & Permissions.Flags.ManageChannels);
  assert.equal(source.length, 2);
});

test('owner override preserves other permissions and removes conflicting owner denies', () => {
  const result = temporaryVoiceOverwrites([
    { id: 'owner', type: 1, allow: Permissions.Flags.Stream, deny: Permissions.Flags.Connect | Permissions.Flags.Speak }
  ], 'owner');
  assert.equal(result.length, 1);
  assert.ok(result[0].allow & Permissions.Flags.Stream);
  assert.ok(result[0].allow & Permissions.Flags.Connect);
  assert.equal(result[0].deny, Permissions.Flags.Speak);
  assert.equal(temporaryVoiceOverwrites(undefined, 'owner').length, 1);
});
