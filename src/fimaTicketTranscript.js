// Fetch every page before closing a ticket; an incomplete export must fail closed.
export async function collectTicketMessages(messages) {
  const result = new Map();
  let before;
  for (;;) {
    const page = await messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!page.size) break;
    let oldest;
    for (const message of page.values()) {
      result.set(message.id, message);
      if (!oldest || BigInt(message.id) < BigInt(oldest)) oldest = message.id;
    }
    if (before && BigInt(oldest) >= BigInt(before)) throw new Error("transcript_pagination_stalled");
    before = oldest;
    if (page.size < 100) break;
  }
  return [...result.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

export function ticketMessageText(message, mask) {
  const parts = [message.content || ""];
  for (const embed of message.embeds || []) {
    parts.push(embed.title || "", embed.description || "");
    for (const field of embed.fields || []) parts.push(`${field.name}: ${field.value}`);
  }
  for (const attachment of message.attachments?.values?.() || []) {
    parts.push(`[attachment: ${attachment.name || "file"}] ${attachment.url || ""}`);
  }
  return mask(parts.filter(Boolean).join("\n"));
}
