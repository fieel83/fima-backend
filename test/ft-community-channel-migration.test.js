import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFtCommunityMigrationPlan, FT_MIGRATION_GUILD_ID } from '../src/ftCommunityMigrationPlan.js';
import { captureFtChannelInventory, migrateFtChannels, addFtMissingChannels, cleanupFtEmptyCategories } from '../src/ftCommunityChannelMigration.js';

function fixture() {
  const channels = new Map(), writes = [], saved = [];
  let sequence = 0, failMove = false;
  const make = (id, name, type, parentId = null, permissions = []) => {
    const channel = { id, name, type, parentId, rawPosition: sequence++, isThread: () => false,
      permissionOverwrites: { cache: new Map(), async set(rows) { setPermissions(rows); } },
      async setName(value) { writes.push(['rename', id]); channel.name = value; return channel; },
      async delete() { writes.push(['delete', id]); channels.delete(id); },
      async setParent(value, options) {
        assert.equal(options.lockPermissions, false);
        writes.push(['move', id]);
        // Simulate a Discord response failing after the move has already happened.
        channel.parentId = value;
        if (failMove && id === 'support' && value !== 'legacy') {
          failMove = false; throw new Error('network_failure_after_move');
        }
        return channel;
      }
    };
    function setPermissions(rows) {
      channel.permissionOverwrites.cache = new Map(rows.map(row => [row.id, {
        id: row.id, type: row.type ?? (row.id === 'bot' ? 1 : 0),
        allow: { toArray: () => row.allow || [] }, deny: { toArray: () => row.deny || [] }
      }]));
    }
    setPermissions(permissions); channels.set(id, channel); return channel;
  };
  make('start', 'START', 4);
  make('staff', 'STAFF', 4);
  make('legacy', 'SUPPORT', 4);
  make('rules', 'rules', 0, 'start');
  make('staff-rules', 'rules', 0, 'staff', [{ id: FT_MIGRATION_GUILD_ID, type: 0,
    allow: [], deny: ['ViewChannel'] }]);
  make('support', 'support', 0, 'legacy', [{ id: 'staff-role', type: 0,
    allow: ['SendMessages', 'ViewChannel'], deny: [] }]);
  const guild = { id: FT_MIGRATION_GUILD_ID, members: { me: { id: 'bot' } }, channels: {
    async fetch(id) { return id ? channels.get(id) : channels; },
    async create(options) {
      writes.push(['create', options.name]);
      return make(`new-${sequence}`, options.name, options.type, options.parent || null, options.permissionOverwrites);
    }
  } };
  return { guild, channels, writes, saved,
    saveJournal: async journal => { saved.push(structuredClone(journal)); },
    failNextMove: () => { failMove = true; } };
}
async function request(f) {
  return { guild: f.guild, expectedDigest: buildFtCommunityMigrationPlan(await captureFtChannelInventory(f.guild)).sourceDigest,
    saveJournal: f.saveJournal, actorUserId: 'owner' };
}

test('additive phase preserves originals, inherits access, and is idempotent', async () => {
  const f = fixture();
  await migrateFtChannels(await request(f));
  const before = await captureFtChannelInventory(f.guild);
  const result = await addFtMissingChannels(await request(f));
  assert.equal(result.status, 'missing_channels_added');
  assert.deepEqual(result.operations.map(row => row.name), ['general', 'media', 'polls', 'support-faq']);
  for (const original of before.channels) {
    assert.deepEqual(result.after.channels.find(row => row.id === original.id), original);
  }
  for (const created of result.operations) {
    const actual = f.channels.get(created.id);
    assert.deepEqual(actual.permissionOverwrites.cache, f.channels.get(actual.parentId).permissionOverwrites.cache);
  }
  const again = await addFtMissingChannels(await request(f));
  assert.deepEqual(again.operations, []);
});

test('additive phase refuses stale plans and absent destination categories', async () => {
  const f = fixture();
  await assert.rejects(addFtMissingChannels({ ...await request(f), expectedDigest: 'stale' }), { code: 'migration_stale_plan' });
  await assert.rejects(addFtMissingChannels(await request(f)), { code: 'migration_categories_required' });
  assert.deepEqual(f.writes, []);
});

test('additive phase stops before mutation when durable journal cannot be written', async () => {
  const f = fixture();
  await migrateFtChannels(await request(f));
  f.writes.length = 0;
  await assert.rejects(addFtMissingChannels({ ...await request(f), saveJournal: async () => { throw new Error('database_down'); } }), /database_down/);
  assert.deepEqual(f.writes, []);
});

test('stale inventory is rejected before any Discord mutation', async () => {
  const f = fixture(), args = await request(f);
  f.channels.get('support').name = 'different';
  await assert.rejects(migrateFtChannels(args), { code: 'migration_stale_plan' });
  assert.deepEqual(f.writes, []);
});

test('successful move preserves channel IDs, private staff rules and all channel overwrites', async () => {
  const f = fixture(), before = await captureFtChannelInventory(f.guild);
  const result = await migrateFtChannels(await request(f));
  assert.equal(result.status, 'channels_moved');
  assert.equal(f.channels.get('staff-rules').parentId, 'staff');
  assert.equal(f.channels.get('support').parentId,
    [...f.channels.values()].find(row => row.name === '◇ HELP').id);
  for (const row of before.channels) {
    assert.deepEqual(result.after.channels.find(item => item.id === row.id).permissionOverwrites, row.permissionOverwrites);
  }
  assert.equal(f.channels.get('legacy').name, 'SUPPORT');
  for (const name of ['□ MANAGEMENT', '▤ RECORDS', '▤ ARCHIVE']) {
    const category = [...f.channels.values()].find(row => row.name === name);
    assert.deepEqual(category.permissionOverwrites.cache.get(f.guild.id).deny.toArray(), ['ViewChannel']);
  }
  assert.ok(f.saved[0].before);
  assert.equal(f.saved.at(-1).status, 'channels_moved');
});

test('failure after an ambiguous Discord response restores parent and category names', async () => {
  const f = fixture(), before = await captureFtChannelInventory(f.guild);
  f.failNextMove();
  await assert.rejects(migrateFtChannels(await request(f)), error => {
    assert.equal(error.journal.status, 'rolled_back');
    return error.message === 'network_failure_after_move';
  });
  assert.equal(f.channels.get('support').parentId, 'legacy');
  assert.equal(f.channels.get('start').name, 'START');
  assert.equal(f.channels.get('staff').name, 'STAFF');
  const after = await captureFtChannelInventory(f.guild);
  assert.deepEqual(after.channels, before.channels);
});

test('backup persistence failure prevents every Discord mutation', async () => {
  const f = fixture(), args = await request(f);
  args.saveJournal = async () => { throw new Error('database_unavailable'); };
  await assert.rejects(migrateFtChannels(args), /database_unavailable/);
  assert.deepEqual(f.writes, []);
});

test('unreviewed channels block the executor', async () => {
  const f = fixture(); f.channels.get('support').name = 'unknown-purpose';
  await assert.rejects(migrateFtChannels(await request(f)), { code: 'migration_unresolved_inventory' });
  assert.deepEqual(f.writes, []);
});

test('simultaneous requests cannot interleave mutations in the same guild', async () => {
  const f = fixture(), args = await request(f);
  let release, reached;
  const barrier = new Promise(resolve => { reached = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  let first = true;
  args.saveJournal = async journal => {
    await f.saveJournal(journal);
    if (first) { first = false; reached(); await blocked; }
  };
  const active = migrateFtChannels(args);
  await barrier;
  await assert.rejects(migrateFtChannels(args), { code: 'migration_already_running' });
  release(); await active;
});

test('cleanup deletes only known empty legacy categories and preserves all channels', async () => {
  const f = fixture();
  await migrateFtChannels(await request(f));
  const legacy = f.channels.get('legacy');
  f.channels.delete('legacy');
  legacy.id = '1421240822866645113';
  legacy.delete = async () => { f.writes.push(['delete', legacy.id]); f.channels.delete(legacy.id); };
  f.channels.set(legacy.id, legacy);
  const before = await captureFtChannelInventory(f.guild);
  const result = await cleanupFtEmptyCategories(await request(f));
  assert.equal(result.status, 'empty_categories_removed');
  assert.deepEqual(result.after.channels, before.channels);
  assert.deepEqual(result.operations.map(row => row.id), [legacy.id]);
  assert.deepEqual((await cleanupFtEmptyCategories(await request(f))).operations, []);
});

test('cleanup refuses populated legacy categories and journal failure before deletion', async () => {
  const f = fixture();
  await migrateFtChannels(await request(f));
  const legacy = f.channels.get('legacy');
  f.channels.delete('legacy');
  legacy.id = '1421240822866645113';
  f.channels.set(legacy.id, legacy);
  f.channels.get('support').parentId = legacy.id;
  f.writes.length = 0;
  await assert.rejects(cleanupFtEmptyCategories(await request(f)), { code: 'migration_category_not_empty' });
  f.channels.get('support').parentId = null;
  await assert.rejects(cleanupFtEmptyCategories({ ...await request(f), saveJournal: async () => { throw new Error('database_down'); } }), /database_down/);
  assert.deepEqual(f.writes, []);
});
