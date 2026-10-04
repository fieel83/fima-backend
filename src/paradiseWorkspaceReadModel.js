/** Read-only, guild-scoped projection. Never expose tokens, private file paths or arbitrary metadata. */
export function paradiseWorkspaceReadModel(state, guildId) {
  const clean = (v, max = 180) => String(v ?? '').slice(0, max);
  const nested = key => Object.values(state[key]?.[guildId] || {}).filter(v => v && (!v.guildId || v.guildId === guildId));
  const scoped = key => Object.values(state[key] || {}).filter(v => v?.guildId === guildId);
  function list(records, kind) {
    const counts = Object.create(null);
    for (const r of records) counts[clean(r.status || 'unknown', 32)] = (counts[clean(r.status || 'unknown', 32)] || 0) + 1;
    const items = records.slice().sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))).slice(0, 200).map(r => ({
      id: clean(r.id, 100), kind, userId: clean(r.userId || r.targetId, 24),
      title: clean(r.username || r.type || r.action || r.prize || r.id),
      type: clean(r.type || r.categoryLabel || r.category || r.action, 80),
      status: clean(r.status || 'unknown', 32), createdAt: clean(r.createdAt, 40), updatedAt: clean(r.updatedAt, 40),
      channelId: clean(r.reviewChannelId || r.channelId, 24), messageId: clean(r.reviewMessageId, 24),
      reason: clean(r.reason, 2000),
      answers: kind === 'applications' ? Object.entries(r.answers || {}).slice(0,30).map(([key,value]) => ({key:clean(key,80),value:clean(typeof value === 'string' ? value : '',2000)})) : [],
      evidenceCount: Array.isArray(r.evidence) ? r.evidence.length : Object.values(r.evidence || {}).reduce((n,v) => n + (Array.isArray(v) ? v.length : 1), 0),
      reviewedBy: clean(r.reviewedBy || r.updatedBy, 24)
    }));
    return {total: records.length, counts, items, truncated: records.length > items.length};
  }
  return {
    applications: list(nested('applications'), 'applications'),
    tickets: list(nested('supportTickets'), 'tickets'),
    moderation: list(nested('moderationCases'), 'moderation'),
    events: list(scoped('giveaways'), 'events'),
    activity: (Array.isArray(state.paradiseLogs?.[guildId]) ? state.paradiseLogs[guildId] : []).slice(-12).reverse().map(r => ({title:clean(r.title || r.action || r.type),createdAt:clean(r.createdAt || r.timestamp,40)}))
  };
}
