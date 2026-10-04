const snowflake = (value) => /^\d{15,22}$/.test(value || "");

// Only the existing Discord gateway may call this bridge. Channel names, topics,
// user messages and local flags never establish ownership or ticket provenance.
export function createAiSupportDiscordBridge({ queue, guildId, resolveTicket }) {
  if (!queue?.enqueue || !snowflake(guildId) || typeof resolveTicket !== "function") throw new Error("support_discord_bridge_config_invalid");
  const verifiedTicket = async (channelId, observedGuildId) => {
    if (observedGuildId !== guildId || !snowflake(channelId)) return null;
    const ticket = await resolveTicket(channelId, guildId);
    if (!ticket || ticket.channelId !== channelId || ticket.guildId !== guildId || !snowflake(ticket.openerId)) return null;
    return ticket;
  };
  return {
    async opened({ channelId, guildId: observedGuildId }) {
      if (!await verifiedTicket(channelId, observedGuildId)) return { ignored: true };
      return queue.enqueue({ eventId: `discord.ticket.opened:${channelId}`, ticketId: channelId, kind: "empty_ticket", question: "Ask the ticket owner what they need help with, once, after staff review.", product: "bot" });
    },
    async message(message) {
      if (!message || message.author?.bot || message.webhookId || !snowflake(message.id) || !snowflake(message.author?.id) || typeof message.content !== "string" || !message.content.trim()) return { ignored: true };
      const ticket = await verifiedTicket(message.channelId, message.guildId);
      // Staff corrections use a separately authenticated moderation hook; do not
      // infer their authority from message text, copied roles or channel topic.
      if (!ticket || ticket.openerId !== message.author.id) return { ignored: true };
      return queue.enqueue({ eventId: `discord.message:${message.id}`, ticketId: message.channelId, kind: "ticket_message", question: message.content, product: "bot" });
    },
    async closed({ channelId, guildId: observedGuildId, eventId }) {
      if (!snowflake(eventId) || !await verifiedTicket(channelId, observedGuildId)) return { ignored: true };
      return queue.enqueue({ eventId: `discord.ticket.closed:${eventId}`, ticketId: channelId, kind: "learning_candidate", event: "ticket_closed", product: "bot" });
    }
  };
}
