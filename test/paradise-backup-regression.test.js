import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotGuild } from '../src/paradise3a59.js';

test('structure backup includes threads without permission overwrite managers', async () => {
  let fetches = 0;
  const overwrite = { id: 'role', allow: '1024', deny: '0' };
  const guild = {
    id: 'guild', name: 'Community',
    channels: {
      fetch: async () => { fetches++; },
      cache: new Map([
        ['text', { id: 'text', name: 'chat', type: 0, permissionOverwrites: { cache: new Map([['role', { toJSON: () => overwrite }]]) } }],
        ['thread', { id: 'thread', name: 'discussion', type: 11, parentId: 'text' }],
        ['missing', null]
      ])
    },
    roles: { fetch: async () => { fetches++; }, cache: new Map([['role', { id: 'role', name: 'Member', permissions: { bitfield: 1024n } }]]) }
  };
  const backup = await snapshotGuild(guild);
  assert.equal(fetches, 2);
  assert.deepEqual(backup.channels.map(channel => channel.id), ['text', 'thread']);
  assert.deepEqual(backup.channels[0].permissionOverwrites, [overwrite]);
  assert.deepEqual(backup.channels[1].permissionOverwrites, []);
  assert.equal(backup.channels[1].parentId, 'text');
  assert.equal(backup.roles[0].permissions, '1024');
});
