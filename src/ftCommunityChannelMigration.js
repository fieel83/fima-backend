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

const legacyCategoryIds = new Set(['1421240822866645113', '1557009769083047936',
  '1420401498332074018', '1420401497115459667', '1420401495471558769']);

const channelOrder = {
  START: ['rules', 'roles', 'fieel-info', 'joins-leaves'],
  COMMUNITY: ['general', 'media', 'turkce-sohbet', 'turkce-medya', 'vouches', 'outfits', 'capes'],
  EVENTS: ['announcements', 'updates', 'uploads', 'polls', 'turkce-duyurular'],
  HELP: ['support', 'support-faq', 'fima-macro', 'fake-headless'],
  STAFF: ['rules', 'mod-chat'],
  RECORDS: ['ticket-transcripts', 'transcripts', 'fima-logs', 'logs', 'message-logs', 'join-logs', 'un-bl-logs', 'wick-logs']
};
const orderName = name => String(name).normalize('NFKC').toLowerCase().replace(/^[^\p{L}\p{N}]+/u, '').replace(/[_\s]+/g, '-');

export async function orderFtChannels({ guild, expectedDigest, saveJournal, actorUserId }) {
  if (guild?.id !== FT_MIGRATION_GUILD_ID) throw fail('ft_community_guild_required');
  if (typeof saveJournal !== 'function') throw fail('migration_journal_required');
  if (running.has(guild.id)) throw fail('migration_already_running');
  running.add(guild.id);
  let journal;
  let mutationStarted = false;
  const persist = () => saveJournal(structuredClone(journal));
  try {
    const before = await captureFtChannelInventory(guild);
    const plan = buildFtCommunityMigrationPlan(before);
    if (expectedDigest !== plan.sourceDigest) throw fail('migration_stale_plan');
    if (plan.targetCategories.some(row => !row.existingId || row.decision !== 'keep')) throw fail('migration_categories_required');
    const positions = plan.targetCategories.map(row => ({ channel: row.existingId, position: row.position }));
    const siblingOrders = [];
    let position = 0;
    for (const category of plan.targetCategories) {
      const names = channelOrder[category.key] || [];
      const rank = row => { const index = names.indexOf(orderName(row.name)); return index < 0 ? names.length : index; };
      const children = before.channels.filter(row => row.parentId === category.existingId)
        .sort((a, b) => rank(a) - rank(b) || a.position - b.position || a.id.localeCompare(b.id));
      for (const type of [...new Set(children.map(row => row.type))]) {
        siblingOrders.push(children.filter(row => row.type === type).map(row => row.id));
      }
      positions.push(...children.map(row => ({ channel: row.id, position: position++ })));
    }
    journal = { id: randomUUID(), guildId: guild.id, actorUserId, phase: 'channel_order',
      status: 'applying', startedAt: new Date().toISOString(), before, createdCategoryIds: [],
      operations: [{ kind: 'order', status: 'pending', positions }] };
    await persist();
    mutationStarted = true;
    await guild.channels.setPositions(positions);
    journal.operations[0].status = 'applied';
    await persist();
    const after = await captureFtChannelInventory(guild);
    const allAfter = [...after.categories, ...after.channels];
    for (const original of [...before.categories, ...before.channels]) {
      const actual = allAfter.find(row => row.id === original.id);
      if (!actual || actual.name !== original.name || actual.type !== original.type || actual.parentId !== original.parentId ||
          canonicalPermissions(actual.permissionOverwrites) !== canonicalPermissions(original.permissionOverwrites)) throw fail('migration_final_verification_failed');
    }
    const verifyOrder = ids => ids.every((id, index) => index === 0 ||
      allAfter.find(row => row.id === ids[index - 1]).position < allAfter.find(row => row.id === id).position);
    if (!verifyOrder(plan.targetCategories.map(row => row.existingId)) || siblingOrders.some(ids => !verifyOrder(ids))) throw fail('migration_order_verification_failed');
    journal.after = after;
    journal.status = 'channels_ordered';
    journal.completedAt = new Date().toISOString();
    await persist();
    return journal;
  } catch (error) {
    if (journal && mutationStarted) {
      journal.status = 'rolling_back';
      journal.error = error.code || error.message;
      try {
        await persist();
        await guild.channels.setPositions([...journal.before.categories, ...journal.before.channels].map(row => ({ channel: row.id, position: row.position })));
        const restored = await captureFtChannelInventory(guild);
        for (const original of [...journal.before.categories, ...journal.before.channels]) {
          const actual = [...restored.categories, ...restored.channels].find(row => row.id === original.id);
          if (!actual || actual.position !== original.position) throw fail('migration_rollback_verification_failed');
        }
        journal.status = 'rolled_back';
        await persist();
      } catch { journal.status = 'rollback_incomplete'; await persist().catch(() => {}); }
      error.journal = journal;
    }
    throw error;
  } finally { running.delete(guild.id); }
}

export async function cleanupFtEmptyCategories({ guild, expectedDigest, saveJournal, actorUserId }) {
  if (guild?.id !== FT_MIGRATION_GUILD_ID) throw fail('ft_community_guild_required');
  if (typeof saveJournal !== 'function') throw fail('migration_journal_required');
  if (running.has(guild.id)) throw fail('migration_already_running');
  running.add(guild.id);
  let journal;
  const persist = () => saveJournal(structuredClone(journal));
  try {
    const before = await captureFtChannelInventory(guild);
    const plan = buildFtCommunityMigrationPlan(before);
    if (expectedDigest !== plan.sourceDigest) throw fail('migration_stale_plan');
    if (plan.targetCategories.some(row => !row.existingId || row.decision !== 'keep')) throw fail('migration_categories_required');
    const targets = new Set(plan.targetCategories.map(row => row.existingId));
    const candidates = before.categories.filter(row => legacyCategoryIds.has(row.id) && !targets.has(row.id));
    if (candidates.some(row => before.channels.some(channel => channel.parentId === row.id))) throw fail('migration_category_not_empty');
    journal = { id: randomUUID(), guildId: guild.id, actorUserId, phase: 'empty_categories',
      status: 'applying', startedAt: new Date().toISOString(), before, operations: [], createdCategoryIds: [] };
    await persist();
    for (const candidate of candidates) {
      // Refetch all children immediately before deletion; never rely only on the audit snapshot.
      const fresh = await guild.channels.fetch();
      if ([...fresh.values()].some(row => row?.parentId === candidate.id)) throw fail('migration_category_not_empty');
      const category = fresh.get(candidate.id);
      if (!category || category.type !== 4 || category.name !== candidate.name ||
          canonicalPermissions(overwrites(category)) !== canonicalPermissions(candidate.permissionOverwrites)) throw fail('migration_stale_plan');
      journal.operations.push({ kind: 'delete_empty_category', id: candidate.id, name: candidate.name, status: 'pending' });
      await persist();
      await category.delete('FT Community: remove verified empty legacy category');
      journal.operations.at(-1).status = 'applied';
      await persist();
    }
    const after = await captureFtChannelInventory(guild);
    for (const original of before.channels) {
      const actual = after.channels.find(row => row.id === original.id);
      if (!actual || actual.name !== original.name || actual.type !== original.type || actual.parentId !== original.parentId ||
          canonicalPermissions(actual.permissionOverwrites) !== canonicalPermissions(original.permissionOverwrites)) throw fail('migration_final_verification_failed');
    }
    if ([...targets].some(id => !after.categories.some(row => row.id === id))) throw fail('migration_final_verification_failed');
    journal.after = after;
    journal.status = 'empty_categories_removed';
    journal.completedAt = new Date().toISOString();
    await persist();
    return journal;
  } catch (error) {
    if (journal) {
      journal.status = 'cleanup_review_required';
      journal.error = error.code || error.message;
      await persist().catch(() => {});
      error.journal = journal;
    }
    throw error;
  } finally { running.delete(guild.id); }
}

export async function addFtMissingChannels({ guild, expectedDigest, saveJournal, actorUserId }) {
  if (guild?.id !== FT_MIGRATION_GUILD_ID) throw fail('ft_community_guild_required');
  if (typeof saveJournal !== 'function') throw fail('migration_journal_required');
  if (running.has(guild.id)) throw fail('migration_already_running');
  running.add(guild.id);
  let journal;
  const persist = () => saveJournal(structuredClone(journal));
  try {
    const before = await captureFtChannelInventory(guild);
    const plan = buildFtCommunityMigrationPlan(before);
    if (expectedDigest !== plan.sourceDigest) throw fail('migration_stale_plan');
    const specs = [
      { name: 'general', category: 'COMMUNITY', topic: 'FT Community — chat, share and meet the community. / Topluluk sohbeti.' },
      { name: 'media', category: 'COMMUNITY', topic: 'Share your clips, edits and creations. / Kliplerini ve çalışmalarını paylaş.' },
      { name: 'polls', category: 'EVENTS', topic: 'Community polls and votes. / Topluluk anketleri ve oylamaları.' },
      { name: 'support-faq', category: 'HELP', topic: 'Support answers and guidance. / Destek soruları ve rehberi.' }
    ];
    const targets = new Map(plan.targetCategories.map(row => [row.key, row.existingId]));
    if (specs.some(spec => !targets.get(spec.category))) throw fail('migration_categories_required');
    journal = { id: randomUUID(), guildId: guild.id, actorUserId, phase: 'missing_channels',
      status: 'applying', startedAt: new Date().toISOString(), before, operations: [], createdCategoryIds: [] };
    await persist();
    for (const spec of specs) {
      if (before.channels.some(row => row.name === spec.name)) continue;
      const parent = await guild.channels.fetch(targets.get(spec.category));
      journal.operations.push({ kind: 'create_channel', name: spec.name, parentId: parent.id, status: 'pending' });
      await persist();
      const channel = await guild.channels.create({ name: spec.name, type: 0, parent: parent.id,
        topic: spec.topic, rateLimitPerUser: 5, permissionOverwrites: overwrites(parent),
        reason: 'FT Community: add missing channels without changing existing channels' });
      Object.assign(journal.operations.at(-1), { id: channel.id, status: 'applied' });
      await persist();
    }
    const after = await captureFtChannelInventory(guild);
    for (const original of before.channels) {
      const actual = after.channels.find(row => row.id === original.id);
      if (!actual || actual.name !== original.name || actual.type !== original.type || actual.parentId !== original.parentId ||
          canonicalPermissions(actual.permissionOverwrites) !== canonicalPermissions(original.permissionOverwrites)) {
        throw fail('migration_final_verification_failed');
      }
    }
    for (const spec of specs) {
      if (!after.channels.some(row => row.name === spec.name && row.type === 0 && row.parentId === targets.get(spec.category))) {
        throw fail('migration_created_channel_verification_failed');
      }
    }
    journal.after = after;
    journal.status = 'missing_channels_added';
    journal.completedAt = new Date().toISOString();
    await persist();
    return journal;
  } catch (error) {
    if (journal) {
      // Preserve any created channels and their history; recovery requires a fresh inventory.
      journal.status = 'additive_review_required';
      journal.error = error.code || error.message;
      await persist().catch(() => {});
      error.journal = journal;
    }
    throw error;
  } finally { running.delete(guild.id); }
}

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
