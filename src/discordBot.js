import crypto from "node:crypto";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, GatewayIntentBits, PermissionsBitField, SlashCommandBuilder, StringSelectMenuBuilder } from "discord.js";
import { prisma } from "./db.js";
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

const TICKET_CATEGORIES = [
  { id: "payment_help", label: "Payment help", description: "Card checkout, invoice or payment question." },
  { id: "license_hwid_help", label: "License / HWID help", description: "Key, device lock or reset help." },
  { id: "trial_help", label: "Trial help", description: "Trial claim, expiry or setup help." },
  { id: "gift_redeem_help", label: "Gift / Redeem help", description: "Gift code, redeem or package help." },
  { id: "old_tgmacro_buyer", label: "Old TGMacro buyer proof", description: "Send proof for staff review." },
  { id: "app_bug", label: "App bug", description: "App crash, UI issue or launcher problem." },
  { id: "macro_timing_problem", label: "Macro timing problem", description: "Ping, FPS, MS or macro timing help." },
  { id: "security_report", label: "Security report", description: "Suspicious file, fake build or abuse report." },
  { id: "creator_partnership", label: "Creator / partnership", description: "Creator, macro or partnership request." },
  { id: "other", label: "Other", description: "Anything else." }
];

let client = null;
let started = false;
let readyAt = null;
let lastError = null;

export function startDiscordBot() {
  if (started) {
    console.info("Discord bot startup skipped; already started.");
    return;
  }
  started = true;

  const token = env("DISCORD_BOT_TOKEN");
  console.info("Starting Discord bot...", {
    discordBotTokenExists: Boolean(token),
    discordGuildIdExists: Boolean(env("DISCORD_GUILD_ID")),
    intents: ["Guilds", "GuildMembers"]
  });
  console.info(`DISCORD_BOT_TOKEN exists: ${Boolean(token)}`);

  if (!token) {
    lastError = "DISCORD_BOT_TOKEN is not configured";
    console.warn("Discord bot login skipped", {
      discordBotTokenExists: false,
      message: lastError
    });
    return;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers
    ]
  });

  client.once("ready", async () => {
    readyAt = new Date();
    lastError = null;
    console.info("Discord client ready event fired", {
      botUserTag: client.user?.tag || null,
      botUserId: client.user?.id || null
    });
    console.info("Discord bot login successful as ...", {
      bot: client.user?.tag || client.user?.id || "unknown",
      guildId: env("DISCORD_GUILD_ID", "")
    });
    await registerDiscordCommands().catch((error) => {
      lastError = error.message;
      console.warn("Discord command registration failed", { message: error.message });
    });
  });

  client.on("interactionCreate", (interaction) => {
    handleDiscordInteraction(interaction).catch((error) => {
      lastError = error.message;
      console.warn("Discord interaction failed", { message: error.message, command: interaction?.commandName || null });
      if (interaction?.isRepliable?.() && !interaction.replied && !interaction.deferred) {
        interaction.reply({ content: "Fima bot could not complete that action. Try again later.", ephemeral: true }).catch(() => {});
      }
    });
  });

  client.on("error", (error) => {
    lastError = error.message;
    console.warn("Discord bot error", { message: error.message });
  });

  client.on("shardError", (error) => {
    lastError = error.message;
    console.warn("Discord bot shard error", { message: error.message });
  });

  client.login(token).then(() => {
    console.info("Discord bot login promise resolved; waiting for ready event if not fired yet.");
  }).catch((error) => {
    lastError = error.message;
    console.warn("Discord bot login failed:", {
      message: error.message,
      code: error.code || null,
      name: error.name || null
    });
  });
}

async function registerDiscordCommands() {
  if (!client?.application) return;
  const commands = [
    new SlashCommandBuilder().setName("fima_account").setDescription("Show your linked Fima account."),
    new SlashCommandBuilder().setName("fima_recovery").setDescription("Send a password reset code to your Discord DM."),
    new SlashCommandBuilder().setName("fima_help").setDescription("Show Fima account, trial and support help."),
    new SlashCommandBuilder()
      .setName("fima_embed")
      .setDescription("Send the Fima Macro info embed.")
      .addChannelOption((option) => option.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    new SlashCommandBuilder()
      .setName("fima_announce")
      .setDescription("Send the Fima Macro announcement embed.")
      .addChannelOption((option) => option.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    new SlashCommandBuilder()
      .setName("fima_update")
      .setDescription("Send the latest Fima update embed.")
      .addChannelOption((option) => option.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    new SlashCommandBuilder()
      .setName("fima_roles_setup")
      .setDescription("Check or create the Fima Buyer and Trial roles.")
      .addChannelOption((option) => option.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    new SlashCommandBuilder()
      .setName("fima_ticket")
      .setDescription("Open the Fima support ticket menu."),
    new SlashCommandBuilder()
      .setName("fima_ticket_setup")
      .setDescription("Send the Fima support ticket panel.")
      .addChannelOption((option) => option.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    new SlashCommandBuilder()
      .setName("fima_trust_setup")
      .setDescription("Send the Fima FAQ and safety panel.")
      .addChannelOption((option) => option.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(false))
  ].map((command) => command.toJSON());
  const guildId = env("DISCORD_GUILD_ID");
  if (guildId) await client.application.commands.set(commands, guildId);
  else await client.application.commands.set(commands);
}

async function handleDiscordInteraction(interaction) {
  if (interaction?.isStringSelectMenu?.() && interaction.customId === "fima_ticket_category") {
    return handleTicketCategorySelect(interaction);
  }

  if (interaction?.isButton?.() && String(interaction.customId || "").startsWith("fima_ticket_")) {
    return handleTicketButton(interaction);
  }

  if (!interaction?.isChatInputCommand?.()) return;

  if (interaction.commandName === "fima_help") {
    return interaction.reply({ embeds: [fimaHelpEmbed()], ephemeral: true });
  }

  if (interaction.commandName === "fima_account") {
    const user = await prisma.user.findFirst({ where: { discordUserId: interaction.user.id } });
    const description = user
      ? `Linked account: **${displayFimaUser(user)}**\nRecovery: **Discord DM enabled**`
      : "No Fima account is linked to this Discord user yet. Link Discord from Account Settings on fimamacro.com.";
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x9b5cff).setTitle("Fima Account").setDescription(description)], ephemeral: true });
  }

  if (interaction.commandName === "fima_recovery") {
    const user = await prisma.user.findFirst({ where: { discordUserId: interaction.user.id } });
    if (!user) {
      return interaction.reply({ content: "No Fima account is linked to this Discord user. Link Discord from Account Settings or contact support.", ephemeral: true });
    }
    const { token, resetUrl } = await createDiscordResetToken(user.id);
    await sendPasswordResetDm(interaction.user.id, token, resetUrl);
    return interaction.reply({ content: "I sent your Fima password reset code by DM. It expires in 15 minutes.", ephemeral: true });
  }

  if (["fima_embed", "fima_announce", "fima_update"].includes(interaction.commandName)) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Only admins can send Fima embeds.", ephemeral: true });
    }
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel?.isTextBased?.()) return interaction.reply({ content: "Choose a text channel.", ephemeral: true });
    await channel.send(fimaAnnouncementPayload(interaction.commandName));
    return interaction.reply({ content: "Fima embed sent.", ephemeral: true });
  }

  if (interaction.commandName === "fima_roles_setup") {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Only admins can set up Fima roles.", ephemeral: true });
    }
    const result = await ensureFimaRoles({ organize: true, actorId: interaction.user.id });
    const lines = [
      `Buyer role: ${result.roles.buyer?.name || "missing"} (${result.roles.buyer?.created ? "created" : "ready"})`,
      `Trial role: ${result.roles.trial?.name || "missing"} (${result.roles.trial?.created ? "created" : "ready"})`,
      result.position?.attempted
        ? `Position: ${result.position.success ? "updated" : "checked"}`
        : "Position: not changed"
    ];
    if (result.position?.warnings?.length) lines.push(`Note: ${result.position.warnings.join(" ")}`);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x9b5cff).setTitle("Fima roles").setDescription(lines.join("\n"))],
      ephemeral: true
    });
  }

  if (interaction.commandName === "fima_ticket") {
    return interaction.reply({ ...fimaTicketMenuPayload(), ephemeral: true });
  }

  if (interaction.commandName === "fima_ticket_setup") {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Only admins can set up the ticket panel.", ephemeral: true });
    }
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel?.isTextBased?.()) return interaction.reply({ content: "Choose a text channel.", ephemeral: true });
    await channel.send(fimaTicketPanelPayload());
    await auditDiscordBotAction("discord_ticket_panel_sent", "discord_channel", channel.id, {
      actorId: interaction.user.id
    });
    return interaction.reply({ content: "Ticket panel sent.", ephemeral: true });
  }

  if (interaction.commandName === "fima_trust_setup") {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Only admins can set up Fima FAQ and safety posts.", ephemeral: true });
    }
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel?.isTextBased?.()) return interaction.reply({ content: "Choose a text channel.", ephemeral: true });
    await channel.send(fimaTrustPanelPayload());
    await auditDiscordBotAction("discord_trust_panel_sent", "discord_channel", channel.id, {
      actorId: interaction.user.id
    });
    return interaction.reply({ content: "FAQ and safety panel sent.", ephemeral: true });
  }
}

function fimaHelpEmbed() {
  return new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle("Fima help")
    .setDescription("Need a hand? Use `/fima_account` to check your link or `/fima_recovery` for a reset code. For setup, payments, or old TGMacro proof, open a ticket.");
}

function fimaAnnouncementPayload(commandName = "fima_embed") {
  const siteUrl = env("FRONTEND_URL") || "https://fimamacro.com";
  const downloadUrl = `${siteUrl.replace(/\/+$/, "")}/download.html`;
  const pricingUrl = `${siteUrl.replace(/\/+$/, "")}/pricing.html`;
  const tutorialUrl = `${siteUrl.replace(/\/+$/, "")}/macros.html`;
  const supportUrl = env("DISCORD_SUPPORT_URL") || env("SUPPORT_URL") || siteUrl;
  const title = commandName === "fima_update" ? "Fima Macro Update" : "Fima Macro";
  const embed = new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle(title)
    .setDescription("Need Fima? Start here.")
    .addFields(
      { name: "Setup", value: "Download the app, log in, paste your key, and you are ready.", inline: false },
      { name: "Price", value: "Use the website for the current EUR prices and active trial offer.", inline: true },
      { name: "Buy Options", value: "Card checkout, gift codes and support-assisted Robux orders.", inline: true },
      { name: "Recommended", value: "Start with the trial if it is active, then pick the plan that fits you.", inline: false },
      { name: "Tutorial", value: "Open the Macros page for setup notes and video slots.", inline: true },
      { name: "Support", value: "Stuck? Open a ticket and we will help.", inline: true },
      { name: "Download", value: "Use the website download page so the link always follows the latest public release.", inline: false },
      { name: "Old TGMacro buyer?", value: "Open a ticket and send proof. Staff can check if a 3-day Fima trial applies.", inline: false }
    )
    .setImage(`${siteUrl.replace(/\/+$/, "")}/assets/social-preview.png?v=20260531-1`);
  const mainRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Website").setStyle(ButtonStyle.Link).setURL(siteUrl),
    new ButtonBuilder().setLabel("Download").setStyle(ButtonStyle.Link).setURL(downloadUrl),
    new ButtonBuilder().setLabel("Pricing").setStyle(ButtonStyle.Link).setURL(pricingUrl),
    new ButtonBuilder().setLabel("Support").setStyle(ButtonStyle.Link).setURL(supportUrl)
  );
  const extraRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Tutorial").setStyle(ButtonStyle.Link).setURL(tutorialUrl)
  );
  return { embeds: [embed], components: [mainRow, extraRow] };
}

function fimaTicketPanelPayload() {
  const siteUrl = (env("FRONTEND_URL") || "https://fimamacro.com").replace(/\/+$/, "");
  const embed = new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle("Fima Support")
    .setDescription([
      "Need help? Pick a category and we will open a private ticket.",
      "Do not post full license keys, passwords, cookies, tokens or payment details in public.",
      "Old TGMacro buyer? Choose that category and send proof after staff opens the ticket."
    ].join("\n"))
    .addFields(
      { name: "Helpful links", value: `[Website](${siteUrl}) · [Download](${siteUrl}/download) · [Pricing](${siteUrl}/pricing) · [Security](${siteUrl}/security)`, inline: false }
    );
  return { embeds: [embed], components: [ticketCategoryRow()] };
}

function fimaTicketMenuPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle("Open a Fima ticket")
    .setDescription("Choose the closest category. A private ticket opens for you and staff.");
  return { embeds: [embed], components: [ticketCategoryRow()] };
}

function ticketCategoryRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("fima_ticket_category")
      .setPlaceholder("Choose a ticket category")
      .addOptions(TICKET_CATEGORIES.map((category) => ({
        label: category.label,
        value: category.id,
        description: category.description.slice(0, 100)
      })))
  );
}

function ticketActionRows({ claimed = false } = {}) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("fima_ticket_close").setLabel("Close").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("fima_ticket_claim").setLabel(claimed ? "Claimed" : "Claim").setStyle(ButtonStyle.Primary).setDisabled(claimed),
      new ButtonBuilder().setCustomId("fima_ticket_note").setLabel("Add note").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("fima_ticket_escalate").setLabel("Escalate").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("fima_ticket_transcript").setLabel("Transcript").setStyle(ButtonStyle.Secondary)
    )
  ];
}

function fimaTrustPanelPayload() {
  const siteUrl = (env("FRONTEND_URL") || "https://fimamacro.com").replace(/\/+$/, "");
  const embed = new EmbedBuilder()
    .setColor(0x40d6ff)
    .setTitle("Fima FAQ and Safety")
    .setDescription("Short answers for new users.")
    .addFields(
      { name: "Official download", value: `Use ${siteUrl}/download. Do not trust random reuploads.`, inline: false },
      { name: "Is Fima safe?", value: "Fima does not ask for Roblox passwords, Roblox cookies, Discord tokens or browser passwords.", inline: false },
      { name: "Fake/cracked files", value: "Modified builds are not supported and can be unsafe. Use the public release only.", inline: false },
      { name: "Pricing and trial", value: `Check ${siteUrl}/pricing for current plans and trial info.`, inline: false },
      { name: "Old TGMacro buyer", value: "Open a ticket, send proof, and staff can review 3-day access.", inline: false }
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Website").setStyle(ButtonStyle.Link).setURL(siteUrl),
    new ButtonBuilder().setLabel("Download").setStyle(ButtonStyle.Link).setURL(`${siteUrl}/download`),
    new ButtonBuilder().setLabel("Pricing").setStyle(ButtonStyle.Link).setURL(`${siteUrl}/pricing`),
    new ButtonBuilder().setLabel("Security").setStyle(ButtonStyle.Link).setURL(`${siteUrl}/security`)
  );
  return { embeds: [embed], components: [row] };
}

async function handleTicketCategorySelect(interaction) {
  const categoryId = interaction.values?.[0] || "other";
  const category = TICKET_CATEGORIES.find((item) => item.id === categoryId) || TICKET_CATEGORIES.at(-1);
  const guild = interaction.guild || await getGuild();
  const ticketChannel = await createTicketChannel(guild, interaction.user, category);
  await ticketChannel.send({
    content: `<@${interaction.user.id}>`,
    embeds: [ticketCreatedEmbed(category, interaction.user.id)],
    components: ticketActionRows()
  });
  await auditDiscordBotAction("discord_ticket_created", "discord_channel", ticketChannel.id, {
    category: category.id,
    userId: interaction.user.id,
    fullKeysMasked: true,
    fullEmailsMasked: true
  });
  return interaction.reply({ content: `Ticket opened: ${ticketChannel}`, ephemeral: true });
}

async function createTicketChannel(guild, user, category) {
  const me = guild.members.me || await guild.members.fetchMe();
  if (!me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    const error = new Error("discord_bot_missing_manage_channels");
    error.code = "discord_bot_missing_manage_channels";
    throw error;
  }

  const safeUser = String(user.username || user.id).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 20) || "user";
  const name = `ticket-${category.id.replace(/_/g, "-").slice(0, 18)}-${safeUser}`;
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
    { id: me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] }
  ];
  const supportRoleId = env("DISCORD_SUPPORT_ROLE_ID");
  if (supportRoleId) {
    const role = await guild.roles.fetch(supportRoleId).catch(() => null);
    if (role) overwrites.push({ id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] });
  }
  const parent = env("DISCORD_TICKET_CATEGORY_ID") || null;
  return guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent,
    permissionOverwrites: overwrites,
    topic: `Fima ticket: ${category.label}. Keep keys, emails and payment details masked.`,
    reason: `Fima ticket opened: ${category.id}`
  });
}

function ticketCreatedEmbed(category, userId) {
  const guidance = category.id === "old_tgmacro_buyer"
    ? "Send proof here. Staff will review and can approve 3-day access if it applies."
    : "Tell us what happened. Staff will help from here.";
  return new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle(category.label)
    .setDescription([
      guidance,
      "",
      "Please mask license keys, gift codes, emails and payment details unless staff asks in private."
    ].join("\n"))
    .addFields(
      { name: "Opened by", value: `<@${userId}>`, inline: true },
      { name: "Category", value: category.label, inline: true }
    );
}

async function handleTicketButton(interaction) {
  const action = String(interaction.customId || "").replace("fima_ticket_", "");
  const isStaff = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels) || interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
  if (!isStaff && !["transcript"].includes(action)) {
    return interaction.reply({ content: "Staff will handle that button.", ephemeral: true });
  }

  await auditDiscordBotAction(`discord_ticket_${action}`, "discord_channel", interaction.channelId, {
    actorId: interaction.user.id,
    channelId: interaction.channelId,
    contentStored: false,
    fullKeysMasked: true,
    fullEmailsMasked: true
  });

  if (action === "claim") {
    await interaction.message.edit({ components: ticketActionRows({ claimed: true }) }).catch(() => {});
    return interaction.reply({ content: `Claimed by ${interaction.user}.`, ephemeral: false });
  }
  if (action === "close") {
    await interaction.channel?.setName?.(`closed-${String(interaction.channel?.name || "ticket").replace(/^closed-/, "").slice(0, 80)}`).catch(() => {});
    return interaction.reply({ content: "Ticket marked closed. Staff can archive or delete it after review.", ephemeral: false });
  }
  if (action === "note") {
    return interaction.reply({ content: "Add your staff note as a normal message. Keep keys and emails masked.", ephemeral: true });
  }
  if (action === "escalate") {
    return interaction.reply({ content: "Escalated for senior staff review.", ephemeral: false });
  }
  if (action === "transcript") {
    return interaction.reply({ content: "Transcript marker saved. Full message export is intentionally manual until safe storage is configured.", ephemeral: true });
  }
  return interaction.reply({ content: "Ticket action saved.", ephemeral: true });
}

async function createDiscordResetToken(userId) {
  const token = String(crypto.randomInt(100000, 1000000));
  const resetUrl = `${(env("FRONTEND_URL") || "https://fimamacro.com").replace(/\/+$/, "")}/reset-password.html?token=${encodeURIComponent(token)}`;
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() }
    }),
    prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      }
    })
  ]);
  return { token, resetUrl };
}

function displayFimaUser(user) {
  const email = String(user?.email || "");
  if (email.endsWith("@username.fimamacro.local")) return email.split("@")[0];
  return email || user?.id || "Fima account";
}

export async function discordBotHealth() {
  const botConfigured = Boolean(env("DISCORD_BOT_TOKEN") && env("DISCORD_GUILD_ID"));
  const botReady = Boolean(client?.isReady?.());
  const guild = await getGuild().catch(() => null);
  const me = guild?.members?.me || (guild ? await guild.members.fetchMe().catch(() => null) : null);
  const permissions = me?.permissions || null;
  const manageRolesPermission = permissions ? permissions.has(PermissionsBitField.Flags.ManageRoles) : false;
  const roleChecks = {};

  for (const [type, config] of Object.entries(ROLE_TYPES)) {
    const role = guild ? await findRole(guild, config) : null;
    roleChecks[type] = {
      configuredRoleId: env(config.envName) || null,
      fallbackName: config.fallbackName,
      found: Boolean(role),
      roleId: role?.id || null
    };
  }

  return {
    botConfigured,
    tokenConfigured: Boolean(env("DISCORD_BOT_TOKEN")),
    guildConfigured: Boolean(env("DISCORD_GUILD_ID")),
    botReady,
    botUserTag: client?.user?.tag || null,
    botUserId: client?.user?.id || null,
    guildId: env("DISCORD_GUILD_ID", "") || null,
    guildFound: Boolean(guild),
    manageRolesPermission,
    buyerRoleFound: Boolean(roleChecks.buyer?.found),
    buyerRoleId: roleChecks.buyer?.roleId || null,
    trialRoleFound: Boolean(roleChecks.trial?.found),
    trialRoleId: roleChecks.trial?.roleId || null,
    lastBotError: lastError,
    readyAt: readyAt ? readyAt.toISOString() : null,
    started,
    configured: botConfigured,
    ready: botReady,
    botUser: client?.user ? { id: client.user.id, tag: client.user.tag } : null,
    guildAvailable: Boolean(guild),
    canManageRoles: manageRolesPermission,
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

export async function sendPasswordResetDm(discordUserId, code, resetUrl) {
  const userId = String(discordUserId || "").trim();
  if (!userId) {
    const error = new Error("discord_user_not_linked");
    error.code = "discord_user_not_linked";
    throw error;
  }
  if (!client?.isReady?.()) {
    const error = new Error(lastError || "discord_bot_not_ready");
    error.code = "discord_bot_not_ready";
    throw error;
  }

  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) {
    const error = new Error("discord_user_not_found");
    error.code = "discord_user_not_found";
    throw error;
  }

  const embed = new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle("Fima Account Recovery")
    .setDescription([
      "Your password reset code is:",
      "",
      `**${code}**`,
      "",
      "This code expires in 15 minutes.",
      "If you did not request this, ignore this message."
    ].join("\n"));

  const components = resetUrl ? [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Open Reset Page")
        .setStyle(ButtonStyle.Link)
        .setURL(resetUrl)
    )
  ] : [];

  try {
    await user.send({ embeds: [embed], components });
    return { sent: true, provider: "discord_dm", discordUserId: userId };
  } catch (error) {
    const dmError = new Error("discord_dm_blocked");
    dmError.code = "discord_dm_blocked";
    dmError.cause = error;
    throw dmError;
  }
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

  await auditDiscordBotAction(`discord_${type}_role_${action}`, "discord_user", userId, {
    type,
    action,
    roleId: role.id,
    roleName: role.name
  });

  return {
    success: true,
    action,
    type,
    userId,
    roleId: role.id,
    roleName: role.name
  };
}

async function ensureFimaRoles({ organize = false, actorId = null } = {}) {
  const guild = await getGuild();
  const roles = {};
  for (const type of Object.keys(ROLE_TYPES)) {
    const before = await findRole(guild, ROLE_TYPES[type]);
    const role = await getOrCreateRole(guild, type);
    roles[type] = {
      id: role.id,
      name: role.name,
      created: !before,
      position: role.position
    };
  }
  const position = organize ? await organizeRolePositions(guild, roles) : { attempted: false, success: false, warnings: [] };
  await auditDiscordBotAction("discord_roles_setup", "discord_guild", guild.id, {
    actorId,
    roleTypes: Object.keys(roles),
    created: Object.fromEntries(Object.entries(roles).map(([type, row]) => [type, row.created])),
    positionAttempted: Boolean(position.attempted),
    positionSuccess: Boolean(position.success)
  });
  return { roles, position };
}

async function organizeRolePositions(guild, roleSummary) {
  const warnings = [];
  const me = guild.members.me || await guild.members.fetchMe();
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return { attempted: true, success: false, warnings: ["Bot is missing Manage Roles."] };
  }
  const highest = me.roles.highest?.position || 0;
  let moved = 0;
  for (const [index, type] of Object.keys(ROLE_TYPES).entries()) {
    const role = await guild.roles.fetch(roleSummary[type]?.id).catch(() => null);
    if (!role) {
      warnings.push(`${ROLE_TYPES[type].fallbackName} was not found.`);
      continue;
    }
    if (role.managed || role.position >= highest) {
      warnings.push(`${role.name} cannot be moved by the bot.`);
      continue;
    }
    const targetPosition = Math.max(1, highest - 1 - index);
    if (role.position !== targetPosition) {
      await role.setPosition(targetPosition, "Fima role setup").catch((error) => {
        warnings.push(`${role.name} position unchanged: ${error.message}`);
      });
      moved += 1;
    }
  }
  return { attempted: true, success: warnings.length === 0, moved, warnings };
}

async function getOrCreateRole(guild, type) {
  const config = ROLE_TYPES[type];
  if (!config) {
    const error = new Error("invalid_role_type");
    error.code = "invalid_role_type";
    throw error;
  }

  const role = await findRole(guild, config);
  if (role) return role;

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

async function findRole(guild, config) {
  const configuredRoleId = env(config.envName);
  if (configuredRoleId) {
    const role = await guild.roles.fetch(configuredRoleId).catch(() => null);
    if (role) return role;
  }

  await guild.roles.fetch().catch(() => null);
  return guild.roles.cache.find((role) => role.name === config.fallbackName) || null;
}

async function auditDiscordBotAction(action, targetType = null, targetId = null, metadata = {}) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        targetType,
        targetId,
        metadata
      }
    });
  } catch (error) {
    console.warn("Discord audit log failed", { action, message: error.message });
  }
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
