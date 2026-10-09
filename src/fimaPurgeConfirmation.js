import { randomUUID } from 'node:crypto';

// In-memory, actor-bound previews deliberately expire across a process restart.
export function createPurgeConfirmations({ now = Date.now, ttlMs = 120_000, capacity = 100 } = {}) {
  const previews = new Map();
  const prune = () => {
    for (const [token, record] of previews) if (record.expiresAt <= now()) previews.delete(token);
  };
  const get = (token, context) => {
    prune();
    const record = previews.get(token);
    if (!record || ['guildId', 'channelId', 'actorId'].some(key => record[key] !== context[key])) return null;
    return record;
  };
  return {
    create(context, messages) {
      prune();
      const cutoff = now() - 14 * 24 * 60 * 60 * 1000 + 60_000;
      const ids = [...new Set([...messages].filter(message => !message.pinned &&
        Number.isFinite(message.createdTimestamp) && message.createdTimestamp > cutoff)
        .map(message => message.id).filter(id => /^\d{17,20}$/.test(id)))].slice(0, 100);
      if (!ids.length) return null;
      while (previews.size >= capacity) previews.delete(previews.keys().next().value);
      const token = randomUUID();
      const record = Object.freeze({ ...context, ids: Object.freeze(ids), expiresAt: now() + ttlMs, token });
      previews.set(token, record);
      return record;
    },
    get,
    async execute(token, context, phrase, { authorize, remove }) {
      const record = get(token, context);
      if (!record) return { status: 'expired' };
      if (phrase !== `DELETE ${record.ids.length}`) return { status: 'confirmation_required' };
      if (!await authorize(record)) return { status: 'denied' };
      // Recheck after the permission fetch; concurrent submits may have consumed it.
      if (get(token, context) !== record) return { status: 'expired' };
      previews.delete(token);
      const deleted = await remove([...record.ids]);
      return { status: 'deleted', count: deleted.size };
    }
  };
}
