const activeTickets = new Set();
const claimPattern = /(?:^|\s)claimedBy:(\d{15,25})(?=\s|$)/;

export function ticketClaimant(topic) {
  return String(topic || "").match(claimPattern)?.[1] || null;
}

export function topicWithClaim(topic, userId) {
  if (!/^\d{15,25}$/.test(String(userId))) throw new Error("invalid_ticket_claimant");
  const current = ticketClaimant(topic);
  if (current && current !== userId) throw new Error("ticket_already_claimed");
  if (current) return String(topic);
  const next = `${String(topic || "").trimEnd()} claimedBy:${userId}`.trim();
  if (next.length > 1024) throw new Error("ticket_topic_full");
  return next;
}

export function topicWithAssignment(topic, userId) {
  if (!/^\d{15,25}$/.test(String(userId))) throw new Error("invalid_ticket_claimant");
  const next = String(topic || "").replace(claimPattern, (match) => `${/^\s/.test(match) ? match[0] : ""}claimedBy:${userId}`);
  if (next.length > 1024) throw new Error("ticket_topic_full");
  return ticketClaimant(next) ? next : topicWithClaim(next, userId);
}

// Reject overlapping lifecycle actions; never queue an expired interaction.
export async function withTicketLock(channelId, action) {
  if (activeTickets.has(channelId)) throw new Error("ticket_action_in_progress");
  activeTickets.add(channelId);
  try { return await action(); }
  finally { activeTickets.delete(channelId); }
}
