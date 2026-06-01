import { Client, GatewayIntentBits, PermissionsBitField } from "discord.js";
import { env } from "./env.js";

const ROLE_TYPES = {
  buyer: {
    envName: "DISCORD_BUYER_ROLE_ID",
    fallbackName: "Fima Buyer",
    color: 0x9b5cff
  },
  trial: {
    envName: "DISCORD_TRIAL_ROLE_ID",
    fallbackName: "Fima Trial",
    color: 0x40d6ff
  }
};

let client = null;
let started = false;
let readyAt = null;
let lastError = null;

export function startDiscordBot() {
  if (started) return;
  started = true;

  const token = env("DISCORD_BOT_TOKEN");
  if (!token) {
    lastError = "DISCORD_BOT_TOKEN is not configured";
    return;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers
    ]
  });

  client.once("ready", () => {
    readyAt = new Date();
    lastError = null;
    console.info("Discord bot ready", {
      bot: client.user?.tag || client.user?.id || "unknown",
      guildId: env("DISCORD_GUILD_ID", "")
    });
  });

  client.on("error", (error) => {
    lastError = error.message;
    console.warn("Discord bot error", { message: error.message });
  });

  client.login(token).catch((error) => {
    lastError = error.message;
    console.warn("Discord bot login failed", { message: error.message });
  });
}

export async function discordBotHealth() {
  const configured = Boolean(env("DISCORD_BOT_TOKEN") && env("DISCORD_GUILD_ID"));
  const guild = await getGuild().catch(() => null);
  const me = guild?.members?.me || (guild ? await guild.members.fetchMe().catch(() => null) : null);
  const permissions = me?.permissions || null;
  const canManageRoles = permissions ? permissions.has(PermissionsBitField.Flags.ManageRoles) : false;
  const roleChecks = {};

  for (const [type, config] of Object.entries(ROLE_TYPES)) {
    const configuredRoleId = env(config.envName);
    const role = configuredRoleId
      ? await guild?.roles.fetch(configuredRoleId).catch(() => null)
      : guild?.roles.cache.find((item) => item.name === config.fallbackName);
    roleChecks[type] = {
      configuredRoleId: configuredRoleId || null,
      fallbackName: config.fallbackName,
      found: Boolean(role),
      roleId: role?.id || null
    };
  }

  return {
    configured,
    ready: Boolean(client?.isReady?.()),
    readyAt: readyAt ? readyAt.toISOString() : null,
    botUser: client?.user ? { id: client.user.id, tag: client.user.tag } : null,
    guildId: env("DISCORD_GUILD_ID", "") || null,
    guildAvailable: Boolean(guild),
    canManageRoles,
    roles: roleChecks,
    lastError
  };
}

export async function giveDiscordRole(discordUserId, type) {
  return changeDiscordRole(discordUserId, type, "add");
}

export async function removeDiscordRole(discordUserId, type) {
  return changeDiscordRole(discordUserId, type, "remove");
}

export async function sendPaymentSubmissionLog(submission) {
  const channelId = env("DISCORD_LOG_CHANNEL_ID");
  if (!channelId || !client?.isReady?.()) return { sent: false, reason: "not_configured" };

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return { sent: false, reason: "channel_not_found" };

  const lines = [
    `Manual Robux payment submitted`,
    `Plan: ${submission.plan}`,
    `Email: ${submission.customerEmail || "-"}`,
    `Discord: ${submission.discordUsername || submission.discordUserId || "-"}`,
    `Roblox: ${submission.robloxUsername || submission.robloxUserId || "-"}`,
    `Premium/Plus: ${submission.premiumPlus === null || submission.premiumPlus === undefined ? "unknown" : submission.premiumPlus ? "yes" : "no"}`,
    `Robux: ${submission.robuxAmount || "-"}`,
    `Submission ID: ${submission.id}`
  ];

  await channel.send({ content: lines.join("\n") });
  return { sent: true };
}

async function changeDiscordRole(discordUserId, type, action) {
  const userId = String(discordUserId || "").trim();
  if (!userId) {
    const error = new Error("discord_user_id_required");
    error.code = "discord_user_id_required";
    throw error;
  }

  const guild = await getGuild();
  const role = await getOrCreateRole(guild, type);
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    const error = new Error("discord_member_not_found");
    error.code = "discord_member_not_found";
    throw error;
  }

  if (action === "add") await member.roles.add(role.id);
  else await member.roles.remove(role.id);

  return {
    success: true,
    action,
    type,
    userId,
    roleId: role.id,
    roleName: role.name
  };
}

async function getOrCreateRole(guild, type) {
  const config = ROLE_TYPES[type];
  if (!config) {
    const error = new Error("invalid_role_type");
    error.code = "invalid_role_type";
    throw error;
  }

  const configuredRoleId = env(config.envName);
  if (configuredRoleId) {
    const role = await guild.roles.fetch(configuredRoleId).catch(() => null);
    if (role) return role;
  }

  const existing = guild.roles.cache.find((role) => role.name === config.fallbackName);
  if (existing) return existing;

  const me = guild.members.me || await guild.members.fetchMe();
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    const error = new Error("discord_bot_missing_manage_roles");
    error.code = "discord_bot_missing_manage_roles";
    throw error;
  }

  return guild.roles.create({
    name: config.fallbackName,
    color: config.color,
    reason: "Fima Macro role sync"
  });
}

async function getGuild() {
  if (!client?.isReady?.()) {
    const error = new Error(lastError || "discord_bot_not_ready");
    error.code = "discord_bot_not_ready";
    throw error;
  }

  const guildId = env("DISCORD_GUILD_ID");
  if (!guildId) {
    const error = new Error("DISCORD_GUILD_ID is not configured");
    error.code = "missing_discord_guild";
    throw error;
  }

  const guild = await client.guilds.fetch(guildId);
  if (!guild.members.me) await guild.members.fetchMe().catch(() => null);
  return guild;
}
