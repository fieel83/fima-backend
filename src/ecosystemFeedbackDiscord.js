import { ChannelType, PermissionsBitField } from "discord.js";

const snowflake = (value) => /^\d{15,22}$/.test(value || "");
const marker = (id) => `FIMA feedback ${id}`;
const mentions = { parse: [], users: [], roles: [], repliedUser: false };

// Uses the existing Discord bot client. No token storage, channel creation or permission edits.
export function createFeedbackDiscordAdapter({ getGuild, guildId, forumChannelId, inboxChannelId, staffRoleIds = [] }) {
  const channels = async () => {
    if (typeof getGuild !== "function" || ![guildId, forumChannelId, inboxChannelId].every(snowflake)) throw new Error("feedback_discord_config_missing");
    const guild = await getGuild(guildId);
    if (guild.id !== guildId || !guild.members.me) throw new Error("feedback_discord_guild_invalid");
    const [forum, inbox] = await Promise.all([guild.channels.fetch(forumChannelId), guild.channels.fetch(inboxChannelId)]);
    if (!forum || forum.guildId !== guildId || forum.type !== ChannelType.GuildForum || !inbox || inbox.guildId !== guildId || inbox.type !== ChannelType.GuildText) throw new Error("feedback_discord_channels_invalid");
    // The shared inbox must be hidden from @everyone; never repair production overwrites silently.
    if (inbox.permissionsFor(guild.roles.everyone)?.has(PermissionsBitField.Flags.ViewChannel) !== false) throw new Error("feedback_inbox_not_private");
    // @everyone denial alone does not make a channel private. Any public role/member
    // overwrite can grant access again; only explicitly configured staff and this bot may view it.
    if (!Array.isArray(staffRoleIds) || !staffRoleIds.length || !staffRoleIds.every(snowflake)) throw new Error("feedback_staff_roles_missing");
    const staffRoles = new Set(staffRoleIds);
    for (const roleId of staffRoles) {
      const role = await guild.roles.fetch(roleId);
      if (!role || role.id === guild.id || role.managed) throw new Error("feedback_staff_roles_invalid");
    }
    if (!inbox.permissionOverwrites?.cache) throw new Error("feedback_inbox_permissions_unknown");
    for (const overwrite of inbox.permissionOverwrites.cache.values()) {
      if (!overwrite.allow.has(PermissionsBitField.Flags.ViewChannel)) continue;
      if (overwrite.type === 0 && staffRoles.has(overwrite.id)) continue;
      if (overwrite.type === 1 && overwrite.id === guild.members.me.id) continue;
      throw new Error("feedback_inbox_not_private");
    }
    const botPermissions = [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory];
    if (!forum.permissionsFor(guild.members.me)?.has([...botPermissions, PermissionsBitField.Flags.SendMessagesInThreads]) || !inbox.permissionsFor(guild.members.me)?.has(botPermissions)) throw new Error("feedback_discord_permissions_missing");
    return { guild, forum, inbox };
  };
  const tags = (forum, report) => [report.kind, report.status].map((name) => {
    const tag = forum.availableTags.find((entry) => entry.name === name && !entry.moderated);
    if (!tag) throw new Error("feedback_forum_tags_missing");
    return tag.id;
  });
  const content = (report) => [marker(report.id), `Product: ${report.product}`, report.description, report.reproduction ? `Reproduction:\n${report.reproduction}` : "", Object.entries(report.diagnostics).map(([key, value]) => `${key}: ${value}`).join("\n")].filter(Boolean).join("\n\n").slice(0, 1950);
  return {
    async inspect() {
      const { forum, inbox } = await channels();
      const missingTags = ["Bug", "Suggestion", "Problem", "Review", "Open", "Reviewing", "Planned", "Fixed", "Closed"].filter((name) => !forum.availableTags.some((tag) => tag.name === name && !tag.moderated));
      return { ready: !missingTags.length, missingTags, forumChannelId: forum.id, inboxChannelId: inbox.id, inboxPrivate: true };
    },
    async publish(report) {
      const { forum, inbox } = await channels();
      // Validate everything before the first Discord mutation. Mention parsing always disabled.
      const appliedTags = tags(forum, report);
      const thread = await forum.threads.create({ name: `[${report.product}] ${report.title}`.slice(0, 100), appliedTags, message: { content: content(report), allowedMentions: mentions }, reason: marker(report.id) });
      const notice = await inbox.send({ content: `${marker(report.id)}\n${report.kind} · ${report.product}\n${report.title}\nhttps://discord.com/channels/${guildId}/${thread.id}`, allowedMentions: mentions });
      return { threadId: thread.id, inboxMessageId: notice.id };
    },
    async syncStatus(report) {
      const { guild, forum } = await channels();
      const thread = await guild.channels.fetch(report.delivery.threadId);
      if (!thread || thread.parentId !== forum.id || thread.ownerId !== guild.members.me.id) throw new Error("feedback_thread_ownership_invalid");
      const starter = await thread.fetchStarterMessage();
      if (starter?.author?.id !== guild.members.me.id || starter.content.split("\n", 1)[0] !== marker(report.id)) throw new Error("feedback_thread_ownership_invalid");
      await thread.setAppliedTags(tags(forum, report), marker(report.id));
    },
    async findReceipt(report) {
      const { guild, forum, inbox } = await channels();
      const [active, archived, notices] = await Promise.all([forum.threads.fetchActive(), forum.threads.fetchArchived({ limit: 100 }), inbox.messages.fetch({ limit: 100 })]);
      let threadId = null;
      for (const thread of new Map([...active.threads, ...archived.threads]).values()) {
        if (thread.parentId !== forum.id || thread.ownerId !== guild.members.me.id) continue;
        const starter = await thread.fetchStarterMessage();
        if (starter?.author?.id === guild.members.me.id && starter.content.split("\n", 1)[0] === marker(report.id)) { threadId = thread.id; break; }
      }
      const notice = threadId && notices.find((message) => message.author?.id === guild.members.me.id && message.content.split("\n", 1)[0] === marker(report.id) && message.content.includes(`/channels/${guildId}/${threadId}`));
      // Search bounds cannot prove absence. Null leaves uncertain delivery locked for manual review.
      return notice ? { threadId, inboxMessageId: notice.id } : null;
    }
  };
}
