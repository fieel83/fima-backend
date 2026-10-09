import { createHash } from "node:crypto";

/** Guild-visible signals only. Stores hashes and IDs, never message text or private tickets. */
export function createFtBehaviorSafety({ now = Date.now, maxAuthors = 5000, windowMs = 120000, alertCooldownMs = 300000 } = {}) {
  const authors = new Map();
  return function observe({ guildId, authorId, messageId, channelId, content = "", attachments = [], privateTicket = false, authorCreatedAt = null } = {}) {
    if (privateTicket || !guildId || !authorId || !messageId || !channelId) return null;
    const time = now();
    for (const [key, value] of authors) if (time - value.touchedAt > Math.max(windowMs, alertCooldownMs)) authors.delete(key);
    const key = `${guildId}:${authorId}`;
    const entry = authors.get(key) || { messages: [], lastAlertAt: null };
    entry.messages = entry.messages.filter(item => time - item.at <= windowMs);
    const text = String(content).normalize("NFKC").replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "").trim().toLowerCase().slice(0, 16000);
    const files = attachments.slice(0, 2).map(file => [file.name || file.filename, file.size]);
    const fingerprint = text.length >= 20 || files.length ? createHash("sha256").update(JSON.stringify([text, files])).digest("hex") : null;
    const mentionCount = new Set([...text.matchAll(/<@!?(\d{15,25})>/g)].slice(0, 50).map(match => match[1])).size;
    const previous = entry.messages.find(item => item.id === messageId);
    const observed = { id: messageId, channelId, fingerprint, mentionCount, at: previous?.at ?? time };
    if (previous) Object.assign(previous, observed);
    else entry.messages.push(observed);
    entry.messages = entry.messages.slice(-40);
    entry.touchedAt = time;
    authors.delete(key);
    authors.set(key, entry);
    while (authors.size > maxAuthors) authors.delete(authors.keys().next().value);
    const repeated = fingerprint ? entry.messages.filter(item => item.fingerprint === fingerprint) : [];
    const channels = new Set(repeated.map(item => item.channelId)).size;
    const newAccount = Number.isFinite(authorCreatedAt) && authorCreatedAt <= time && time - authorCreatedAt < 7 * 86400000;
    const evidence = [];
    if (channels >= 4) evidence.push("repeated_campaign_four_channels");
    if (newAccount && repeated.length >= 5) evidence.push("new_account_repeated_campaign");
    if (entry.messages.filter(item => item.mentionCount >= 10).length >= 3) evidence.push("repeated_mention_blast");
    if (!evidence.length || (entry.lastAlertAt !== null && time - entry.lastAlertAt < alertCooldownMs)) return null;
    entry.lastAlertAt = time;
    return Object.freeze({ risk: "MEDIUM", reason: "guild_behavior_review", evidence, repeatedMessages: repeated.length,
      distinctChannels: channels, windowMs, observedMessages: entry.messages.length, privateDmsObserved: false });
  };
}
