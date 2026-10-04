import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, PermissionsBitField } from 'discord.js';
import { createFimaDiscordGateway } from '../src/fimaDiscordGateway.js';

const flags = PermissionsBitField.Flags;
function fixture({ deniedActorParent = false, deniedBotParent = false, parentGuild = 'guild', parentType = ChannelType.GuildCategory } = {}) {
  const edits = [];
  const fetched = [];
  const member = { id: 'actor', permissions: new PermissionsBitField([flags.ManageGuild, flags.ManageChannels]) };
  const bot = { id: 'bot', permissions: new PermissionsBitField([flags.ManageChannels]) };
  const channel = { permissionsFor: () => new PermissionsBitField([flags.ManageChannels]), edit: async data => edits.push(data) };
  const parent = { guildId: parentGuild, type: parentType, permissionsFor: subject =>
    new PermissionsBitField((subject === member ? deniedActorParent : deniedBotParent) ? [] : [flags.ManageChannels]) };
  const guild = { id: 'guild', members: { fetch: async () => member, fetchMe: async () => bot },
    channels: { fetch: async id => { fetched.push(id); return id === 'channel' ? channel : parent; } } };
  return { gateway: createFimaDiscordGateway(async () => guild), edits, fetched };
}

for (const direction of ['after', 'before']) {
  for (const options of [{ deniedActorParent: true }, { deniedBotParent: true }, { parentGuild: 'other' }, { parentType: ChannelType.GuildText }]) {
    test(`structural ${direction} checks destination before editing: ${JSON.stringify(options)}`, async () => {
      const f = fixture(options);
      await assert.rejects(f.gateway.editStructural('guild', 'actor', {
        kind: 'channel', objectId: 'channel', [direction]: { name: 'name', parentId: 'parent' }
      }, direction), error => error.code === 'migration_parent_permissions_missing');
      assert.deepEqual(f.edits, []);
      assert.deepEqual(f.fetched, ['channel', 'parent']);
    });
  }
  test(`structural ${direction} preserves overwrites when moving original channel`, async () => {
    const f = fixture();
    await f.gateway.editStructural('guild', 'actor', {
      kind: 'channel', objectId: 'channel', [direction]: { name: 'name', parentId: 'parent' }
    }, direction);
    assert.deepEqual(f.edits, [{ name: 'name', parent: 'parent', lockPermissions: false, reason: 'FIMA verified metadata migration' }]);
  });
}
