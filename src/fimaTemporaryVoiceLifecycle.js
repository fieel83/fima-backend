const pending = new Map();
const creationAttempts = new Map();

export function reserveTemporaryVoiceCreation(key, now = Date.now()) {
  for (const [member, expiresAt] of creationAttempts) {
    if (expiresAt <= now) creationAttempts.delete(member);
  }
  if (creationAttempts.has(key)) return false;
  creationAttempts.set(key, now + 30_000);
  return true;
}

export async function persistTemporaryVoice({ channel, persist }) {
  try {
    await persist();
  } catch (error) {
    // Never move a member into a room that restart recovery cannot identify.
    if (channel.members.size === 0) {
      try {
        await channel.delete('FIMA Bot temporary voice persistence failure cleanup');
      } catch (cleanupError) {
        error.cleanupError = cleanupError;
      }
    }
    throw error;
  }
}

// Duplicate gateway events share the same operation for this guild/member.
export function withTemporaryVoiceJoin(key, operation) {
  if (pending.has(key)) return pending.get(key);
  const task = Promise.resolve().then(operation).finally(() => {
    if (pending.get(key) === task) pending.delete(key);
  });
  pending.set(key, task);
  return task;
}

export async function moveToTemporaryVoice({ channel, move, removeRecord, created = false }) {
  try {
    await move(channel);
  } catch (error) {
    // A reused or occupied room must survive a failed move.
    if (created && channel.members.size === 0) {
      try {
        await channel.delete('FIMA Bot failed temporary voice move cleanup');
        await removeRecord(channel.id);
      } catch (cleanupError) {
        // Retain the record so a subsequent cleanup can retry safely.
        error.cleanupError = cleanupError;
      }
    }
    throw error;
  }
}

export async function recoverTemporaryVoices({ records, getGuild, enabled, removeRecord }) {
  const results = [];
  for (const record of Object.values(records || {})) {
    const guild = getGuild(record.guildId);
    if (!guild || !enabled(record.guildId)) continue;
    // Only persisted bot-created rooms are eligible; never infer ownership from names.
    try {
      const channel = await guild.channels.fetch(record.channelId);
      if (!channel) {
        await removeRecord(record.channelId);
        results.push({ channelId: record.channelId, status: 'missing' });
      } else if (channel.guildId && channel.guildId !== record.guildId) {
        results.push({ channelId: record.channelId, status: 'guild_mismatch' });
      } else if (channel.type === 2 && channel.members.size === 0) {
        await channel.delete('FIMA Bot temporary voice restart cleanup');
        await removeRecord(record.channelId);
        results.push({ channelId: record.channelId, status: 'deleted' });
      }
    } catch (error) {
      if (error.code === 10003) {
        await removeRecord(record.channelId);
        results.push({ channelId: record.channelId, status: 'missing' });
      } else {
        results.push({ channelId: record.channelId, status: 'retry', message: error.message });
      }
    }
  }
  return results;
}
