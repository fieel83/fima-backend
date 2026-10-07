import { randomUUID } from 'node:crypto';
import { buildFtCommunityMigrationPlan, FT_MIGRATION_GUILD_ID } from './ftCommunityMigrationPlan.js';

const running = new Set();
const privateGroups = new Set(['STAFF', 'MANAGEMENT', 'RECORDS', 'ARCHIVE']);
const fail = code => Object.assign(new Error(code), { code });
const overwrites = channel => [...channel.permissionOverwrites.cache.values()].map(row => ({
  id: row.id, type: row.type, allow: row.allow.toArray(), deny: row.deny.toArray()
}));
const canonicalPermissions = rows => JSON.stringify((rows || []).map(row => ({
  id: row.id, type: row.type, allow: [...row.allow].sort(), deny: [...row.deny].sort()
})).sort((a, b) => a.id.localeCompare(b.id)));

export async function captureFtChannelInventory(guild) {
  const fetched = await guild.channels.fetch();
  const inventory = [...fetched.values()].filter(channel => channel && !channel.isThread());
  const fields = channel => ({ id: channel.id, name: channel.name,
    position: channel.rawPosition, permissionOverwrites: overwrites(channel) });
  return { guild: { id: guild.id }, capturedAt: new Date().toISOString(),
    categories: inventory.filter(channel => channel.type === 4).map(fields),
    channels: inventory.filter(channel => channel.type !== 4).map(channel => ({
      ...fields(channel), type: channel.type, parentId: channel.parentId
    })) };
}

// Existing channels are moved in place. This phase never deletes channels or messages.
// A durable write must succeed before each Discord mutation, including rollback intents.
export async function migrateFtChannels({ guild, expectedDigest, saveJournal, actorUserId }) {
  if (guild?.id !== FT_MIGRATION_GUILD_ID) throw fail('ft_community_guild_required');
  if (typeof saveJournal !== 'function') throw fail('migration_journal_required');
  if (running.has(guild.id)) throw fail('migration_already_running');
  running.add(guild.id);
  let journal;
  const persist = async () => saveJournal(structuredClone(journal));
  const reason = 'FT Community: preserve channel IDs, history and access';
  try {
    const before = await captureFtChannelInventory(guild);
    const plan = buildFtCommunityMigrationPlan(before);
    if (!expectedDigest || expectedDigest !== plan.sourceDigest) throw fail('migration_stale_plan');
    if (plan.unresolvedChannelIds.length || plan.targetCategories.some(row => row.decision === 'review')) {
      throw fail('migration_unresolved_inventory');
    }
    journal = { id: randomUUID(), guildId: guild.id, actorUserId,
      startedAt: new Date().toISOString(), status: 'applying', before, sourceDigest: plan.sourceDigest,
      operations: [], createdCategoryIds: [], oldCategories: plan.oldCategories };
    await persist();
    const apply = async (operation, mutate) => {
      journal.operations.push({ ...operation, status: 'pending' });
      await persist();
      await mutate();
      journal.operations.at(-1).status = 'applied';
      await persist();
    };
    const targets = new Map();
    for (const target of plan.targetCategories) {
      if (target.existingId) {
        const category = await guild.channels.fetch(target.existingId);
        if (category.name !== target.name) await apply({ kind: 'rename', id: category.id,
          beforeName: category.name, afterName: target.name }, () => category.setName(target.name, reason));
        targets.set(target.name, category.id);
      } else {
        const permissionOverwrites = privateGroups.has(target.key)
          ? [{ id: guild.id, deny: ['ViewChannel'] },
            { id: guild.members.me.id, allow: ['ViewChannel', 'ManageChannels'] }] : [];
        await apply({ kind: 'create_category', name: target.name }, async () => {
          const category = await guild.channels.create({ name: target.name, type: 4,
            position: target.position, permissionOverwrites, reason });
          journal.operations.at(-1).id = category.id;
          journal.createdCategoryIds.push(category.id);
          targets.set(target.name, category.id);
        });
      }
    }
    for (const row of plan.matrix) {
      const destination = targets.get(row.targetCategory);
      if (row.parentId === destination) continue;
      const channel = await guild.channels.fetch(row.id);
      const original = before.channels.find(item => item.id === row.id);
      if (channel.parentId !== original.parentId || canonicalPermissions(overwrites(channel)) !==
          canonicalPermissions(original.permissionOverwrites)) throw fail('migration_channel_changed');
      await apply({ kind: 'move', id: row.id, beforeParentId: original.parentId,
        afterParentId: destination, permissionOverwrites: original.permissionOverwrites },
      () => channel.setParent(destination, { lockPermissions: false, reason }));
      const verified = await guild.channels.fetch(row.id);
      if (verified.parentId !== destination || canonicalPermissions(overwrites(verified)) !==
          canonicalPermissions(original.permissionOverwrites)) throw fail('migration_move_verification_failed');
    }
    const after = await captureFtChannelInventory(guild);
    for (const original of before.channels) {
      const actual = after.channels.find(row => row.id === original.id);
      const target = plan.matrix.find(row => row.id === original.id);
      if (!actual || actual.name !== original.name || actual.type !== original.type ||
          actual.parentId !== targets.get(target.targetCategory) || canonicalPermissions(actual.permissionOverwrites) !==
          canonicalPermissions(original.permissionOverwrites)) throw fail('migration_final_verification_failed');
    }
    journal.after = after;
    journal.status = 'channels_moved';
    journal.completedAt = new Date().toISOString();
    journal.remaining = ['Review and remove empty legacy categories.',
      'Create missing channels and finish content, integration and flow checks.'];
    await persist();
    return journal;
  } catch (error) {
    if (journal) {
      journal.status = 'rolling_back';
      journal.error = error.code || error.message;
      journal.rollbackErrors = [];
      for (const operation of [...journal.operations].reverse()) {
        if (!['move', 'rename'].includes(operation.kind)) continue;
        try {
          operation.rollbackStatus = 'pending';
          await persist();
          const channel = await guild.channels.fetch(operation.id);
          if (operation.kind === 'move') {
            await channel.setParent(operation.beforeParentId, { lockPermissions: false, reason });
            await channel.permissionOverwrites.set(operation.permissionOverwrites, reason);
            const restored = await guild.channels.fetch(operation.id);
            if (restored.parentId !== operation.beforeParentId || canonicalPermissions(overwrites(restored)) !==
                canonicalPermissions(operation.permissionOverwrites)) throw fail('migration_rollback_verification_failed');
          } else await channel.setName(operation.beforeName, reason);
          operation.rollbackStatus = 'restored';
          await persist();
        } catch (rollbackError) {
          journal.rollbackErrors.push({ id: operation.id, error: rollbackError.code || rollbackError.message });
        }
      }
      journal.status = journal.rollbackErrors.length ? 'rollback_incomplete' : 'rolled_back';
      // Newly created empty categories remain recorded; no history is removed on failure.
      await persist().catch(() => {});
      error.journal = journal;
    }
    throw error;
  } finally {
    running.delete(guild.id);
  }
}
