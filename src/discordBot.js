import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, GatewayIntentBits, PermissionsBitField, SlashCommandBuilder, StringSelectMenuBuilder } from "discord.js";
import { prisma } from "./db.js";
import { env } from "./env.js";
import {
  applyParadiseTemplateMissingOnly,
  handleParadiseGuildMemberAdd,
  handleParadiseGuildMemberRemove,
  handleParadiseGuildMemberUpdate,
  handleParadiseInteraction,
  handleParadiseMessage,
  handleParadiseVoiceStateUpdate,
  initializeParadise,
  PARADISE_SETUP_SCHEMAS,
  paradiseCommandAllowedForMode,
  paradiseCommands,
  publishParadiseGuidesFromDashboard,
  rebuildParadiseTestTemplate,
  runParadiseTestSmokeSuite,
  syncParadiseMappedPanels
} from "./paradise3a59.js";

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
  },
  mediaLinksApproved: {
    envName: "DISCORD_MEDIA_LINKS_APPROVED_ROLE_ID",
    fallbackName: "Media & Links Approved",
    color: 0x2ecc71
  },
  coachHelper: {
    envName: "DISCORD_COACH_HELPER_ROLE_ID",
    fallbackName: "Fima Coach Helper",
    color: 0xffc857
  },
  fimaSupport: {
    envName: "DISCORD_FIMA_SUPPORT_ROLE_ID",
    fallbackName: "Fima Support",
    color: 0x9b5cff
  },
  securityStaff: {
    envName: "DISCORD_SECURITY_STAFF_ROLE_ID",
    fallbackName: "Security Staff",
    color: 0xff4d6d
  },
  trainingHoster: {
    envName: "DISCORD_TRAINING_HOSTER_ROLE_ID",
    fallbackName: "Training Hoster",
    color: 0xffc857
  },
  referee: {
    envName: "DISCORD_REFEREE_ROLE_ID",
    fallbackName: "Referee",
    color: 0x40d6ff
  },
  appUpdatesPing: {
    envName: "DISCORD_APP_UPDATES_ROLE_ID",
    fallbackName: "Ping: App Updates",
    color: 0x9b5cff
  },
  macroUpdatesPing: {
    envName: "DISCORD_MACRO_UPDATES_ROLE_ID",
    fallbackName: "Ping: Macro Updates",
    color: 0x40d6ff
  },
  trainingPing: {
    envName: "DISCORD_TRAINING_PING_ROLE_ID",
    fallbackName: "Ping: Training",
    color: 0xffc857
  },
  tournamentPing: {
    envName: "DISCORD_TOURNAMENT_PING_ROLE_ID",
    fallbackName: "Ping: Tournament",
    color: 0xff8a4d
  },
  eventPing: {
    envName: "DISCORD_EVENT_PING_ROLE_ID",
    fallbackName: "Ping: Events",
    color: 0x2ecc71
  },
  giveawayPing: {
    envName: "DISCORD_GIVEAWAY_PING_ROLE_ID",
    fallbackName: "Ping: Giveaways",
    color: 0xf1c40f
  },
  gamenightPing: {
    envName: "DISCORD_GAMENIGHT_PING_ROLE_ID",
    fallbackName: "Ping: Gamenight",
    color: 0xe67e22
  },
  languageTurkish: {
    envName: "DISCORD_LANGUAGE_TR_ROLE_ID",
    fallbackName: "Language: Turkish",
    color: 0xe74c3c
  },
  languageEnglish: {
    envName: "DISCORD_LANGUAGE_EN_ROLE_ID",
    fallbackName: "Language: English",
    color: 0x3498db
  },
  languageGerman: {
    envName: "DISCORD_LANGUAGE_DE_ROLE_ID",
    fallbackName: "Language: German",
    color: 0xf1c40f
  },
  languageFrench: {
    envName: "DISCORD_LANGUAGE_FR_ROLE_ID",
    fallbackName: "Language: French",
    color: 0x5865f2
  },
  languageBosnian: {
    envName: "DISCORD_LANGUAGE_BS_ROLE_ID",
    fallbackName: "Language: Bosnian",
    color: 0x1abc9c
  }
};

const LANGUAGE_CHOICES = [
  { id: "tr", label: "Turkish", roleType: "languageTurkish" },
  { id: "en", label: "English", roleType: "languageEnglish" },
  { id: "de", label: "German", roleType: "languageGerman" },
  { id: "fr", label: "French", roleType: "languageFrench" },
  { id: "bs", label: "Bosnian", roleType: "languageBosnian" }
];

const PING_ROLE_CHOICES = [
  { id: "app_updates", label: "App Updates", roleType: "appUpdatesPing" },
  { id: "macro_updates", label: "Macro Updates", roleType: "macroUpdatesPing" },
  { id: "training", label: "Training", roleType: "trainingPing" },
  { id: "tournament", label: "Tournament", roleType: "tournamentPing" },
  { id: "events", label: "Events", roleType: "eventPing" },
  { id: "giveaways", label: "Giveaways", roleType: "giveawayPing" },
  { id: "gamenight", label: "Gamenight", roleType: "gamenightPing" }
];

const COMMUNITY_CHANNEL_BLUEPRINT = [
  { name: "official-downloads", topic: "Official Fima download links and build hash notices." },
  { name: "security-and-trust", topic: "Trust copy, fake file warnings and security notes." },
  { name: "how-to-get-key", topic: "Friendly license/key guide and My Products links." },
  { name: "open-ticket", topic: "Open support tickets from the Fima support panel." },
  { name: "macro-help", topic: "Macro setup, timing and MS/sensitivity help." },
  { name: "media", topic: "Approved media, clips and showcase posts." },
  { name: "training-signup", topic: "Community training queue and practice signup." },
  { name: "training-results", topic: "Training and event result submissions." },
  { name: "event-results", topic: "Event result summaries and highlights." }
];

const FIMA_KNOWLEDGE_BASE = [
  { id: "download.official", title: "Official download", summary: "Use fimamacro.com/download and verify hashes on the security page." },
  { id: "security.no-secrets", title: "No cookie/token/password stealing", summary: "Fima never asks for Roblox cookies, Discord tokens or browser passwords." },
  { id: "license.hwid", title: "License and HWID", summary: "Keys bind to an account/device after activation. HWID help belongs in a private ticket with masked details." },
  { id: "pricing.trial", title: "Pricing, trial and gifts", summary: "Pricing, trials, referrals and gifts live on fimamacro.com. Support can help with Robux orders only inside a ticket." },
  { id: "setup.basics", title: "App setup basics", summary: "Choose language, set sensitivity/MS, configure screen, assign a bind, then test safely." },
  { id: "fpsms.honesty", title: "FPS/MS source", summary: "Fima labels values exact, estimated or unavailable and does not read Roblox panels as source." },
  { id: "community.training", title: "Training and events", summary: "Fima training queues are community practice/support systems, not clan membership requirements." },
  { id: "oldtgmacro.proof", title: "Old TGMacro proof", summary: "Old TGMacro buyer proof belongs in a private ticket. Staff can review masked proof manually." },
  { id: "support.escalate", title: "Escalation", summary: "If the bot is unsure, it should open or escalate a ticket for staff." }
];

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

const GUILD_SETUP_SCHEMAS = {
  community: {
    label: "Fieel's Community",
    description: "Fima support, outfits/capes resources, events, training and safe community channels.",
    categories: [
      {
        name: "INFO",
        channels: [
          "rules-and-info",
          "announcements",
          "security-trust",
          "how-to-get-key",
          "faq",
          "status"
        ]
      },
      {
        name: "ONBOARDING",
        channels: [
          "start-here",
          "choose-roles",
          "server-guide-resources"
        ]
      },
      {
        name: "SUPPORT",
        channels: [
          "open-ticket",
          "license-help",
          "payment-help",
          "account-help",
          "macro-help",
          "bug-reports",
          "suggestions"
        ]
      },
      {
        name: "COMMUNITY",
        channels: [
          "general",
          "media",
          "clips",
          "outfits",
          "capes",
          "vouches",
          "macro-discussion",
          "success-results"
        ]
      },
      {
        name: "TRAINING & EVENTS",
        channels: [
          "training-feed",
          "training-results",
          "tournament-feed",
          "tournament-results",
          "event-feed",
          "event-results",
          "leaderboards"
        ]
      },
      {
        name: "STAFF",
        private: true,
        channels: [
          "staff-chat",
          "activity-logs",
          "moderation-logs",
          "ticket-logs",
          "training-staff",
          "bot-logs",
          "security-audit"
        ]
      }
    ],
    preserveChannels: ["outfits", "capes", "vouches", "fake-headless-korbox", "fima-macro", "announcements", "updates", "rules"]
  },
  clan: {
    label: "Fieel's Clan",
    description: "Optional TSB-inspired clan/training operations for queues, score approvals and hoster/referee workflow.",
    categories: [
      {
        name: "CLAN INFO",
        channels: ["rules-and-info", "clan-announcements", "challenge-rules", "regions", "roster-info"]
      },
      {
        name: "OPERATIONS",
        channels: ["lineups", "challenges", "challenge-results", "scrims", "tournament-ops", "referee-room", "hoster-room"]
      },
      {
        name: "APPLICATIONS",
        channels: ["tryouts", "staff-applications", "referee-applications", "hoster-applications", "reseller-applications"]
      },
      {
        name: "LOGS",
        private: true,
        channels: ["clan-activity-logs", "match-logs", "moderation-logs", "bot-logs"]
      }
    ],
    preserveChannels: ["training-results", "global-tryout-results", "challenge-results", "leaderboard-na", "leaderboard-eu", "scores"]
  }
};

const TRAINING_MODES = ["timing practice", "5v5", "glads", "movement", "macro setup", "scrim"];

let client = null;
let started = false;
let readyAt = null;
let lastError = null;
let lastCommandSyncAt = null;
let lastCommandSyncError = null;
let lastCommandSyncCount = 0;
const lastCommandSyncCountsByGuild = new Map();
let lastDeepAuditStartedAt = null;
let lastDeepAuditCompletedAt = null;
let lastDeepAuditGuildCount = 0;
let lastStructureBackupGuildCount = 0;
let lastSetupPreviewGuildCount = 0;
let lastDeepAuditError = null;

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
    intents: ["Guilds", "GuildMembers", "GuildMessages", "GuildVoiceStates", ...(env("DISCORD_MESSAGE_CONTENT_INTENT", "false") === "true" ? ["MessageContent"] : [])]
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

  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates
  ];
  if (env("DISCORD_MESSAGE_CONTENT_INTENT", "false") === "true") intents.push(GatewayIntentBits.MessageContent);
  client = new Client({ intents });

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
    await initializeParadise(client).catch((error) => {
      lastError = error.message;
      console.warn("Paradise initialization failed", { message: error.message });
    });
    const auditTimer = setTimeout(() => {
      runAutomaticManagedServerAudits().catch(error => {
        lastDeepAuditError = error.message;
        console.warn("Paradise automatic managed-server audit failed", { message: error.message });
      });
    }, 5_000);
    auditTimer.unref?.();
  });

  client.on("interactionCreate", (interaction) => {
    handleDiscordInteraction(interaction).catch((error) => {
      lastError = error.message;
      console.warn("Discord interaction failed", { message: error.message, command: interaction?.commandName || null });
      if (interaction?.isRepliable?.() && !interaction.replied && !interaction.deferred) {
        interaction.reply({ content: "Paradise could not complete that action. Try again later.", ephemeral: true }).catch(() => {});
      }
    });
  });

  client.on("messageCreate", (message) => {
    handleParadiseMessage(message).catch((error) => {
      lastError = error.message;
      console.warn("Paradise sticky message handler failed", { message: error.message, channelId: message?.channelId || null });
    });
  });

  client.on("guildMemberUpdate", (oldMember, newMember) => {
    handleParadiseGuildMemberUpdate(oldMember, newMember).catch((error) => {
      lastError = error.message;
      console.warn("Paradise staff-team refresh failed", { message: error.message, guildId: newMember?.guild?.id || null });
    });
  });

  client.on("guildMemberAdd", (member) => {
    handleParadiseGuildMemberAdd(member).catch((error) => {
      lastError = error.message;
      console.warn("Paradise welcome automation failed", { message: error.message, guildId: member?.guild?.id || null });
    });
  });

  client.on("guildMemberRemove", (member) => {
    handleParadiseGuildMemberRemove(member).catch((error) => {
      lastError = error.message;
      console.warn("Paradise leave automation failed", { message: error.message, guildId: member?.guild?.id || null });
    });
  });

  client.on("voiceStateUpdate", (oldState, newState) => {
    handleParadiseVoiceStateUpdate(oldState, newState).catch((error) => {
      lastError = error.message;
      console.warn("Paradise temporary voice automation failed", { message: error.message, guildId: newState?.guild?.id || oldState?.guild?.id || null });
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
  const allCommands = [
    ...paradiseCommands(),
    new SlashCommandBuilder().setName("fima_account").setDescription("Show your linked Fima account."),
    new SlashCommandBuilder().setName("fima_recovery").setDescription("Send a password reset code to your Discord DM."),
    new SlashCommandBuilder().setName("fima_help").setDescription("Show Fima account, trial and support help."),
    new SlashCommandBuilder()
      .setName("fima_support_ai")
      .setDescription("Ask the safe Fima knowledge-base helper.")
      .addStringOption((option) => option.setName("question").setDescription("Your Fima support question").setRequired(true)),
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
      .setName("fima_roles_sync")
      .setDescription("Check or create the Fima Buyer and Trial roles."),
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
      .addChannelOption((option) => option.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    new SlashCommandBuilder()
      .setName("fima_faq_setup")
      .setDescription("Send the Fima FAQ panel.")
      .addChannelOption((option) => option.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    new SlashCommandBuilder()
      .setName("fima_buy_setup")
      .setDescription("Send the Fima buy/options panel.")
      .addChannelOption((option) => option.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    new SlashCommandBuilder()
      .setName("fima_language_setup")
      .setDescription("Send the Fima language selector.")
      .addChannelOption((option) => option.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    new SlashCommandBuilder()
      .setName("fima_server_audit")
      .setDescription("Audit Fima server roles and channels without deleting anything."),
    new SlashCommandBuilder()
      .setName("setupfieelscommunity")
      .setDescription("Preview or safely apply the Fieel's Community channel/role system.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addStringOption((option) => option
        .setName("action")
        .setDescription("Preview, repair missing items, or repost handbooks.")
        .setRequired(false)
        .addChoices(
          { name: "preview", value: "preview" },
          { name: "repair_existing", value: "repair" },
          { name: "repost_handbooks", value: "guides" }
        )),
    new SlashCommandBuilder()
      .setName("setupfieelsclan")
      .setDescription("Preview the dedicated Paradise clan/training system.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addStringOption((option) => option
        .setName("action")
        .setDescription("Preview, repair missing items, or repost handbooks.")
        .setRequired(false)
        .addChoices(
          { name: "preview", value: "preview" },
          { name: "repair_existing", value: "repair" },
          { name: "repost_handbooks", value: "guides" }
        )),
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Preview a Community, Clan or future TSBTR-style setup.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addStringOption((option) => option
        .setName("mode")
        .setDescription("Which setup schema to preview.")
        .setRequired(true)
        .addChoices(
          { name: "community", value: "community" },
          { name: "clan", value: "clan" },
          { name: "tsbtr-style", value: "tsbtr" }
        ))
      .addStringOption((option) => option
        .setName("action")
        .setDescription("Preview, repair missing items, or repost handbooks.")
        .setRequired(false)
        .addChoices(
          { name: "preview", value: "preview" },
          { name: "repair_existing", value: "repair" },
          { name: "repost_handbooks", value: "guides" }
        )),
    new SlashCommandBuilder()
      .setName("fima_status")
      .setDescription("Show Fima bot and community system status."),
    new SlashCommandBuilder()
      .setName("rolepicker_setup")
      .setDescription("Send Fima language and ping role picker panels.")
      .addChannelOption((option) => option.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    new SlashCommandBuilder()
      .setName("language")
      .setDescription("Choose your Fima support language.")
      .addStringOption((option) => option
        .setName("choice")
        .setDescription("Language")
        .setRequired(false)
        .addChoices(
          { name: "Turkish", value: "tr" },
          { name: "English", value: "en" },
          { name: "German", value: "de" },
          { name: "French", value: "fr" },
          { name: "Bosnian", value: "bs" }
        )),
    new SlashCommandBuilder()
      .setName("language_broadcast")
      .setDescription("Staff-only reminder for users to choose a language role.")
      .addChannelOption((option) => option.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    new SlashCommandBuilder()
      .setName("fima_security_setup")
      .setDescription("Send anti-scam and official-download safety guidance.")
      .addChannelOption((option) => option.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    new SlashCommandBuilder()
      .setName("fima_training_setup")
      .setDescription("Send the Fima community training panel.")
      .addChannelOption((option) => option.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    new SlashCommandBuilder()
      .setName("fima_training_signup")
      .setDescription("Join the Fima community training queue.")
      .addStringOption((option) => option.setName("mode").setDescription("Training mode, e.g. 5v5, glads, timing practice").setRequired(false)),
    new SlashCommandBuilder()
      .setName("fima_training_result")
      .setDescription("Submit a training or event result summary.")
      .addStringOption((option) => option.setName("mode").setDescription("Training mode").setRequired(true))
      .addStringOption((option) => option.setName("result").setDescription("Short result summary").setRequired(true))
      .addStringOption((option) => option.setName("notes").setDescription("Optional notes").setRequired(false)),
    new SlashCommandBuilder()
      .setName("training_create")
      .setDescription("Create a structured Fima training session card.")
      .addStringOption((option) => option.setName("mode").setDescription("Mode such as 5v5, glads or timing practice").setRequired(true))
      .addStringOption((option) => option.setName("region").setDescription("Region such as EU, NA, TR or mixed").setRequired(false))
      .addStringOption((option) => option.setName("ruleset").setDescription("Ruleset or notes").setRequired(false))
      .addStringOption((option) => option.setName("link").setDescription("Optional private/server link or code").setRequired(false)),
    new SlashCommandBuilder()
      .setName("training_end")
      .setDescription("Post a training end/result summary.")
      .addStringOption((option) => option.setName("result").setDescription("Result summary").setRequired(true))
      .addStringOption((option) => option.setName("note").setDescription("Optional note").setRequired(false)),
    new SlashCommandBuilder()
      .setName("training_cancel")
      .setDescription("Cancel a training session with a short reason.")
      .addStringOption((option) => option.setName("reason").setDescription("Why it was cancelled").setRequired(false)),
    new SlashCommandBuilder()
      .setName("tournament_create")
      .setDescription("Create a Fima event/tournament announcement card.")
      .addStringOption((option) => option.setName("title").setDescription("Event title").setRequired(true))
      .addStringOption((option) => option.setName("format").setDescription("Format such as 5v5, bracket or practice cup").setRequired(false))
      .addStringOption((option) => option.setName("time").setDescription("Time or date text").setRequired(false)),
    new SlashCommandBuilder()
      .setName("tournament_result")
      .setDescription("Submit a tournament/event result summary.")
      .addStringOption((option) => option.setName("winner").setDescription("Winner").setRequired(true))
      .addStringOption((option) => option.setName("score").setDescription("Score").setRequired(false))
      .addStringOption((option) => option.setName("proof").setDescription("Proof link or note").setRequired(false)),
    new SlashCommandBuilder()
      .setName("event_create")
      .setDescription("Create a community event/gamenight/giveaway card.")
      .addStringOption((option) => option.setName("title").setDescription("Event title").setRequired(true))
      .addStringOption((option) => option.setName("type").setDescription("training, gamenight, giveaway or announcement").setRequired(false))
      .addStringOption((option) => option.setName("time").setDescription("Time or date text").setRequired(false)),
    new SlashCommandBuilder()
      .setName("activity_log")
      .setDescription("Staff-only activity log entry for hosters/referees/helpers.")
      .addStringOption((option) => option.setName("summary").setDescription("Activity summary").setRequired(true))
      .addStringOption((option) => option.setName("type").setDescription("hoster, referee, support, moderation").setRequired(false)),
    new SlashCommandBuilder()
      .setName("activity_summary")
      .setDescription("Staff-only activity summary placeholder.")
      .addStringOption((option) => option.setName("period").setDescription("week, month or custom").setRequired(false)),
    new SlashCommandBuilder()
      .setName("staff_quota")
      .setDescription("Staff-only quota/review helper. It recommends; it does not auto-demote.")
      .addStringOption((option) => option.setName("period").setDescription("week, month or custom").setRequired(false)),
    new SlashCommandBuilder()
      .setName("application_setup")
      .setDescription("Send staff/referee/hoster/reseller application guidance.")
      .addChannelOption((option) => option.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(false))
  ].map((command) => command.toJSON());
  try {
    const guildIds = [...new Set([env("DISCORD_GUILD_ID"), ...client.guilds.cache.keys()].filter(Boolean))];
    const stateRow = await prisma.setting.findUnique({ where: { key: "paradise_3a59_state_v1" } }).catch(() => null);
    const state = stateRow?.value && typeof stateRow.value === "object" ? stateRow.value : {};
    const inferMode = guild => {
      const configured = state.guildConfigs?.[guild.id]?.activeSetupMode;
      if (["community", "clan", "tsbtr"].includes(configured)) return configured;
      if (/fieel'?s community/i.test(guild.name)) return "community";
      if (/tsbtr|yedek/i.test(guild.name)) return "tsbtr";
      return "clan";
    };
    const registeredSets = guildIds.length
      ? await Promise.all(guildIds.map(async guildId => {
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
        const mode = inferMode(guild);
        const scopedCommands = allCommands.filter(command => paradiseCommandAllowedForMode(command.name, mode));
        const registered = await client.application.commands.set(scopedCommands, guildId);
        lastCommandSyncCountsByGuild.set(guildId, registered.size);
        return registered;
      }))
      : [await client.application.commands.set(allCommands)];
    lastCommandSyncAt = new Date();
    lastCommandSyncError = null;
    lastCommandSyncCount = Math.max(0, ...registeredSets.map(registered => registered.size));
  } catch (error) {
    lastCommandSyncError = error.message;
    throw error;
  }
}

async function handleDiscordInteraction(interaction) {
  if (await handleParadiseInteraction(interaction)) return;
  if (interaction?.isStringSelectMenu?.() && interaction.customId === "fima_ticket_category") {
    return handleTicketCategorySelect(interaction);
  }

  if (interaction?.isStringSelectMenu?.() && interaction.customId === "fima_language_select") {
    return handleLanguageSelect(interaction);
  }

  if (interaction?.isStringSelectMenu?.() && interaction.customId === "fima_ping_roles_select") {
    return handlePingRoleSelect(interaction);
  }

  if (interaction?.isButton?.() && String(interaction.customId || "").startsWith("fima_ticket_")) {
    return handleTicketButton(interaction);
  }

  if (!interaction?.isChatInputCommand?.()) return;

  if (interaction.commandName === "fima_help") {
    return interaction.reply({ embeds: [fimaHelpEmbed()], ephemeral: true });
  }

  if (interaction.commandName === "fima_support_ai") {
    const question = interaction.options.getString("question") || "";
    const answer = fimaKnowledgeAnswer(question);
    await auditDiscordBotAction("discord_ai_support_answered", "discord_user", interaction.user.id, {
      matched: answer.matchedIds,
      risky: answer.risky,
      questionLength: question.length
    });
    return interaction.reply({ embeds: [answer.embed], ephemeral: true });
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

  if (interaction.commandName === "fima_roles_setup" || interaction.commandName === "fima_roles_sync") {
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

  if (interaction.commandName === "fima_faq_setup") {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Only admins can set up Fima FAQ posts.", ephemeral: true });
    }
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel?.isTextBased?.()) return interaction.reply({ content: "Choose a text channel.", ephemeral: true });
    await channel.send(fimaFaqPanelPayload());
    await auditDiscordBotAction("discord_faq_panel_sent", "discord_channel", channel.id, {
      actorId: interaction.user.id
    });
    return interaction.reply({ content: "FAQ panel sent.", ephemeral: true });
  }

  if (interaction.commandName === "fima_buy_setup") {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Only admins can set up Fima buy posts.", ephemeral: true });
    }
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel?.isTextBased?.()) return interaction.reply({ content: "Choose a text channel.", ephemeral: true });
    await channel.send(fimaBuyPanelPayload());
    await auditDiscordBotAction("discord_buy_panel_sent", "discord_channel", channel.id, {
      actorId: interaction.user.id
    });
    return interaction.reply({ content: "Buy panel sent.", ephemeral: true });
  }

  if (interaction.commandName === "fima_language_setup") {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Only admins can set up language selection.", ephemeral: true });
    }
    await ensureFimaRoles({ organize: true, actorId: interaction.user.id });
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel?.isTextBased?.()) return interaction.reply({ content: "Choose a text channel.", ephemeral: true });
    await channel.send(fimaLanguagePanelPayload());
    await auditDiscordBotAction("discord_language_panel_sent", "discord_channel", channel.id, {
      actorId: interaction.user.id,
      languages: LANGUAGE_CHOICES.map((item) => item.id)
    });
    return interaction.reply({ content: "Language panel sent.", ephemeral: true });
  }

  if (interaction.commandName === "fima_server_audit") {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Only admins can run a server audit.", ephemeral: true });
    }
    const audit = await buildServerAudit(interaction.guild || await getGuild());
    await writeDiscordArtifact("3a57-discord-guild-snapshot-before-setup.json", audit);
    await auditDiscordBotAction("discord_server_audit", "discord_guild", audit.guildId, {
      actorId: interaction.user.id,
      rolesChecked: audit.roles.length,
      channelsChecked: audit.channels.length
    });
    return interaction.reply({ embeds: [serverAuditEmbed(audit)], ephemeral: true });
  }

  if (interaction.commandName === "setupfieelscommunity" || interaction.commandName === "setupfieelsclan" || interaction.commandName === "setup") {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Only admins can preview or apply Fima server setup.", ephemeral: true });
    }
    const mode = interaction.commandName === "setupfieelsclan"
      ? "clan"
      : interaction.commandName === "setupfieelscommunity"
        ? "community"
        : interaction.options.getString("mode");
    const action = interaction.options.getString("action") || "preview";
    return handleGuildSetupCommand(interaction, mode, action);
  }

  if (interaction.commandName === "fima_status") {
    const health = await discordBotHealth();
    return interaction.reply({ embeds: [discordStatusEmbed(health)], ephemeral: true });
  }

  if (interaction.commandName === "rolepicker_setup") {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Only admins can set up role pickers.", ephemeral: true });
    }
    await ensureFimaRoles({ organize: true, actorId: interaction.user.id });
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel?.isTextBased?.()) return interaction.reply({ content: "Choose a text channel.", ephemeral: true });
    await channel.send(fimaLanguagePanelPayload());
    await channel.send(fimaPingRolePanelPayload());
    await auditDiscordBotAction("discord_rolepicker_panel_sent", "discord_channel", channel.id, {
      actorId: interaction.user.id
    });
    return interaction.reply({ content: "Language and ping role picker panels sent.", ephemeral: true });
  }

  if (interaction.commandName === "language") {
    const choice = interaction.options.getString("choice");
    if (!choice) return interaction.reply({ ...fimaLanguagePanelPayload(), ephemeral: true });
    return applyLanguageChoice(interaction, choice);
  }

  if (interaction.commandName === "language_broadcast") {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Only admins can send language reminders.", ephemeral: true });
    }
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel?.isTextBased?.()) return interaction.reply({ content: "Choose a text channel.", ephemeral: true });
    await channel.send(fimaLanguagePanelPayload());
    await auditDiscordBotAction("discord_language_broadcast", "discord_channel", channel.id, {
      actorId: interaction.user.id
    });
    return interaction.reply({ content: "Language selector posted. It is not a repeated DM spam flow.", ephemeral: true });
  }

  if (interaction.commandName === "fima_security_setup") {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Only admins can set up Fima security posts.", ephemeral: true });
    }
    await ensureFimaRoles({ organize: true, actorId: interaction.user.id });
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel?.isTextBased?.()) return interaction.reply({ content: "Choose a text channel.", ephemeral: true });
    await channel.send(fimaSecurityPanelPayload());
    await auditDiscordBotAction("discord_security_panel_sent", "discord_channel", channel.id, {
      actorId: interaction.user.id
    });
    return interaction.reply({ content: "Security panel sent. Use Discord AutoMod for link/image enforcement where possible.", ephemeral: true });
  }

  if (interaction.commandName === "fima_training_setup") {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Only admins can set up Fima training posts.", ephemeral: true });
    }
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel?.isTextBased?.()) return interaction.reply({ content: "Choose a text channel.", ephemeral: true });
    await channel.send(fimaTrainingPanelPayload());
    await auditDiscordBotAction("discord_training_panel_sent", "discord_channel", channel.id, {
      actorId: interaction.user.id
    });
    return interaction.reply({ content: "Training panel sent.", ephemeral: true });
  }

  if (interaction.commandName === "fima_training_signup") {
    const mode = interaction.options.getString("mode") || "timing practice";
    await auditDiscordBotAction("discord_training_signup", "discord_user", interaction.user.id, {
      mode: mode.slice(0, 80)
    });
    return interaction.reply({
      content: `Training signup received for **${mode.slice(0, 80)}**. Staff/helpers can organize the queue from the training channel.`,
      ephemeral: true
    });
  }

  if (interaction.commandName === "fima_training_result") {
    const mode = interaction.options.getString("mode");
    const result = interaction.options.getString("result");
    const notes = interaction.options.getString("notes") || "";
    await auditDiscordBotAction("discord_training_result", "discord_user", interaction.user.id, {
      mode: mode.slice(0, 80),
      result: result.slice(0, 160),
      notesLength: notes.length
    });
    return interaction.reply({
      embeds: [trainingResultEmbed(interaction.user.id, mode, result, notes)],
      ephemeral: false
    });
  }

  if (interaction.commandName === "training_create") {
    const mode = interaction.options.getString("mode");
    const region = interaction.options.getString("region") || "mixed";
    const ruleset = interaction.options.getString("ruleset") || "friendly practice";
    const link = interaction.options.getString("link") || "";
    await auditDiscordBotAction("discord_training_created", "discord_user", interaction.user.id, {
      mode: mode.slice(0, 80),
      region: region.slice(0, 40),
      hasLink: Boolean(link)
    });
    return interaction.reply({ embeds: [trainingSessionEmbed(interaction.user.id, { mode, region, ruleset, link })], ephemeral: false });
  }

  if (interaction.commandName === "training_end") {
    const result = interaction.options.getString("result");
    const note = interaction.options.getString("note") || "";
    await auditDiscordBotAction("discord_training_ended", "discord_user", interaction.user.id, {
      result: result.slice(0, 160),
      noteLength: note.length
    });
    return interaction.reply({ embeds: [trainingResultEmbed(interaction.user.id, "training", result, note)], ephemeral: false });
  }

  if (interaction.commandName === "training_cancel") {
    const reason = interaction.options.getString("reason") || "not enough players / reschedule";
    await auditDiscordBotAction("discord_training_cancelled", "discord_user", interaction.user.id, {
      reason: reason.slice(0, 160)
    });
    return interaction.reply({ content: `Training cancelled: **${reason.slice(0, 160)}**`, ephemeral: false });
  }

  if (interaction.commandName === "tournament_create" || interaction.commandName === "event_create") {
    const title = interaction.options.getString("title");
    const format = interaction.options.getString("format") || interaction.options.getString("type") || "community event";
    const time = interaction.options.getString("time") || "time to be announced";
    await auditDiscordBotAction(`discord_${interaction.commandName}`, "discord_user", interaction.user.id, {
      title: title.slice(0, 120),
      format: format.slice(0, 80)
    });
    return interaction.reply({ embeds: [eventCardEmbed(interaction.user.id, { title, format, time })], ephemeral: false });
  }

  if (interaction.commandName === "tournament_result") {
    const winner = interaction.options.getString("winner");
    const score = interaction.options.getString("score") || "pending staff confirmation";
    const proof = interaction.options.getString("proof") || "";
    await auditDiscordBotAction("discord_tournament_result", "discord_user", interaction.user.id, {
      winner: winner.slice(0, 120),
      score: score.slice(0, 80),
      proofProvided: Boolean(proof)
    });
    return interaction.reply({ embeds: [eventResultEmbed(interaction.user.id, { winner, score, proof })], ephemeral: false });
  }

  if (interaction.commandName === "activity_log") {
    if (!isStaffInteraction(interaction)) return interaction.reply({ content: "Only staff can log activity.", ephemeral: true });
    const summary = interaction.options.getString("summary");
    const type = interaction.options.getString("type") || "staff";
    await auditDiscordBotAction("discord_staff_activity_log", "discord_user", interaction.user.id, {
      type: type.slice(0, 60),
      summary: summary.slice(0, 240)
    });
    return interaction.reply({ embeds: [activityLogEmbed(interaction.user.id, type, summary)], ephemeral: false });
  }

  if (interaction.commandName === "activity_summary" || interaction.commandName === "staff_quota") {
    if (!isStaffInteraction(interaction)) return interaction.reply({ content: "Only staff can view staff activity summaries.", ephemeral: true });
    const period = interaction.options.getString("period") || "this week";
    return interaction.reply({ embeds: [staffSummaryEmbed(interaction.commandName, period)], ephemeral: true });
  }

  if (interaction.commandName === "application_setup") {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Only admins can set up application guidance.", ephemeral: true });
    }
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel?.isTextBased?.()) return interaction.reply({ content: "Choose a text channel.", ephemeral: true });
    await channel.send(applicationPanelPayload());
    await auditDiscordBotAction("discord_application_panel_sent", "discord_channel", channel.id, {
      actorId: interaction.user.id
    });
    return interaction.reply({ content: "Application guidance sent.", ephemeral: true });
  }
}

function fimaHelpEmbed() {
  return new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle("Fima help")
    .setDescription("Need a hand? Use `/fima_account` to check your link or `/fima_recovery` for a reset code. For setup, payments, or old TGMacro proof, open a ticket.");
}

function fimaKnowledgeAnswer(question) {
  const text = String(question || "").toLowerCase();
  const risky = /\b(crack|bypass|injector|inject|cookie|token|stolen|steal|fake file|decompile|patch)\b/i.test(text);
  const matches = FIMA_KNOWLEDGE_BASE.filter((item) => {
    const haystack = `${item.id} ${item.title} ${item.summary}`.toLowerCase();
    return text.split(/\s+/).filter(Boolean).some((word) => word.length > 3 && haystack.includes(word));
  }).slice(0, 4);
  const selected = risky
    ? [FIMA_KNOWLEDGE_BASE.find((item) => item.id === "security.no-secrets"), FIMA_KNOWLEDGE_BASE.find((item) => item.id === "download.official")].filter(Boolean)
    : matches.length ? matches : [FIMA_KNOWLEDGE_BASE.find((item) => item.id === "support.escalate")].filter(Boolean);
  const embed = new EmbedBuilder()
    .setColor(risky ? 0xff4d6d : 0x9b5cff)
    .setTitle(risky ? "Fima safety answer" : "Fima support answer")
    .setDescription(risky
      ? "I can help with safe Fima support only. Do not use cracked files, bypasses, injectors, cookies or token-based instructions."
      : "I answered using the approved Fima knowledge base. If this does not solve it, open a ticket.")
    .addFields(selected.map((item) => ({
      name: `${item.id} - ${item.title}`,
      value: item.summary,
      inline: false
    })));
  if (!matches.length && !risky) {
    embed.addFields({ name: "Next step", value: "Open a ticket with masked details. Staff can ask guided questions without exposing keys or HWIDs.", inline: false });
  }
  return {
    embed,
    matchedIds: selected.map((item) => item.id),
    risky
  };
}

function fimaLanguagePanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle("Choose your Fima language")
    .setDescription("Pick the language you want for support messages. The bot will not DM you repeatedly after you choose.");
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("fima_language_select")
      .setPlaceholder("Select language")
      .addOptions(LANGUAGE_CHOICES.map((language) => ({
        label: language.label,
        value: language.id,
        description: `Use ${language.label} for Fima support where available.`
      })))
  );
  return { embeds: [embed], components: [row] };
}

async function handleLanguageSelect(interaction) {
  return applyLanguageChoice(interaction, interaction.values?.[0]);
}

async function applyLanguageChoice(interaction, languageId) {
  const selected = LANGUAGE_CHOICES.find((item) => item.id === languageId);
  if (!selected) return interaction.reply({ content: "That language is not available yet.", ephemeral: true });

  const guild = interaction.guild || await getGuild();
  const role = await getOrCreateRole(guild, selected.roleType);
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return interaction.reply({ content: "Could not find your server member profile.", ephemeral: true });

  const languageRoleIds = [];
  for (const language of LANGUAGE_CHOICES) {
    const languageRole = await findRole(guild, ROLE_TYPES[language.roleType]).catch(() => null);
    if (languageRole) languageRoleIds.push(languageRole.id);
  }
  for (const roleId of languageRoleIds) {
    if (roleId !== role.id && member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId).catch(() => {});
    }
  }
  await member.roles.add(role.id);
  await auditDiscordBotAction("discord_language_selected", "discord_user", interaction.user.id, {
    language: selected.id,
    roleId: role.id
  });
  return interaction.reply({ content: `Language set to **${selected.label}**.`, ephemeral: true });
}

function fimaPingRolePanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x40d6ff)
    .setTitle("Choose Fima pings")
    .setDescription("Pick only the notifications you want. This replaces noisy reaction-role clutter.");
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("fima_ping_roles_select")
      .setPlaceholder("Select notification roles")
      .setMinValues(0)
      .setMaxValues(PING_ROLE_CHOICES.length)
      .addOptions(PING_ROLE_CHOICES.map((role) => ({
        label: role.label,
        value: role.id,
        description: `Toggle ${role.label} notifications.`
      })))
  );
  return { embeds: [embed], components: [row] };
}

async function handlePingRoleSelect(interaction) {
  const guild = interaction.guild || await getGuild();
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return interaction.reply({ content: "Could not find your server member profile.", ephemeral: true });

  const selectedIds = new Set(interaction.values || []);
  const results = [];
  for (const pingRole of PING_ROLE_CHOICES) {
    const role = await getOrCreateRole(guild, pingRole.roleType);
    if (selectedIds.has(pingRole.id)) {
      if (!member.roles.cache.has(role.id)) await member.roles.add(role.id).catch(() => {});
      results.push(`+ ${pingRole.label}`);
    } else if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role.id).catch(() => {});
      results.push(`- ${pingRole.label}`);
    }
  }

  await auditDiscordBotAction("discord_ping_roles_selected", "discord_user", interaction.user.id, {
    selected: [...selectedIds]
  });
  return interaction.reply({
    content: results.length ? `Notification roles updated:\n${results.join("\n")}` : "Notification roles cleared.",
    ephemeral: true
  });
}

async function handleGuildSetupCommand(interaction, mode, action = "preview") {
  const schema = GUILD_SETUP_SCHEMAS[mode] || GUILD_SETUP_SCHEMAS.community;
  const guild = interaction.guild || await getGuild();
  const audit = await buildServerAudit(guild);
  const snapshot = await buildGuildSnapshot(guild);
  const preview = buildGuildSetupPreview(schema, snapshot, action);

  await writeDiscordArtifact("3a57-discord-guild-snapshot-before-setup.json", snapshot);
  await writeDiscordArtifact("3a57-discord-guild-setup-preview.json", preview);
  await writeDiscordArtifact("3a57-discord-guild-rollback-plan.json", buildGuildRollbackPlan(schema, snapshot));

  let applyResult = null;
  if (action === "apply_missing_only") {
    applyResult = await applyMissingGuildSetup(guild, schema, interaction.user.id);
  }

  await auditDiscordBotAction("discord_guild_setup_preview", "discord_guild", guild.id, {
    actorId: interaction.user.id,
    mode,
    action,
    missingChannels: preview.missingChannels.length,
    preservedChannels: preview.preserveMatches.length,
    applied: Boolean(applyResult)
  });

  return interaction.reply({
    embeds: [guildSetupPreviewEmbed(schema, preview, audit, applyResult)],
    ephemeral: true
  });
}

async function buildGuildSnapshot(guild) {
  await guild.roles.fetch().catch(() => null);
  await guild.channels.fetch().catch(() => null);
  const channels = [...guild.channels.cache.values()]
    .sort((a, b) => (a.rawPosition || 0) - (b.rawPosition || 0))
    .map((channel) => ({
      idMasked: maskDiscordId(channel.id),
      name: channel.name,
      type: channel.type,
      parentName: channel.parent?.name || null,
      position: channel.rawPosition || 0,
      viewable: Boolean(channel.viewable)
    }));
  const roles = [...guild.roles.cache.values()]
    .sort((a, b) => b.position - a.position)
    .map((role) => ({
      idMasked: maskDiscordId(role.id),
      name: role.name,
      managed: role.managed,
      position: role.position
    }));
  return {
    label: "LOCAL RUNTIME VERIFIED if generated by live bot, SOURCE ONLY when generated from source/test",
    capturedAt: new Date().toISOString(),
    guildIdMasked: maskDiscordId(guild.id),
    guildName: guild.name,
    channelCount: channels.length,
    roleCount: roles.length,
    channels,
    roles
  };
}

function buildGuildSetupPreview(schema, snapshot, action) {
  const existingNames = new Set(snapshot.channels.map((channel) => channel.name));
  const plannedChannels = schema.categories.flatMap((category) => category.channels.map((channelName) => ({
    category: category.name,
    channelName,
    private: Boolean(category.private),
    action: existingNames.has(channelName) ? "keep" : "create_missing"
  })));
  const missingChannels = plannedChannels.filter((row) => row.action === "create_missing");
  const preserveMatches = snapshot.channels.filter((channel) => schema.preserveChannels.includes(channel.name));
  const archiveCandidates = snapshot.channels.filter((channel) => {
    if (schema.preserveChannels.includes(channel.name)) return false;
    if (plannedChannels.some((row) => row.channelName === channel.name)) return false;
    return /old|logs?|ticket|wick|join|message/i.test(channel.name);
  });
  return {
    label: "SOURCE ONLY until bot command is run live",
    generatedAt: new Date().toISOString(),
    schema: schema.label,
    requestedAction: action,
    policy: "No hard delete. Preserve useful content, archive/rehome old channels, create missing only.",
    plannedChannels,
    missingChannels,
    preserveMatches,
    archiveCandidates: archiveCandidates.slice(0, 50),
    dangerousActions: [],
    ownerConfirmationRequiredForDelete: true
  };
}

function buildGuildRollbackPlan(schema, snapshot) {
  return {
    generatedAt: new Date().toISOString(),
    schema: schema.label,
    rollbackType: "metadata snapshot",
    note: "Use this to manually compare channel/category/role names and restore if a future apply operation creates unwanted items. No delete action is automated.",
    guildIdMasked: snapshot.guildIdMasked,
    channelCount: snapshot.channelCount,
    roleCount: snapshot.roleCount,
    channels: snapshot.channels,
    roles: snapshot.roles
  };
}

async function applyMissingGuildSetup(guild, schema, actorId) {
  const me = guild.members.me || await guild.members.fetchMe();
  if (!me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    return { applied: false, reason: "discord_bot_missing_manage_channels" };
  }
  const createdCategories = [];
  const createdChannels = [];

  await ensureFimaRoles({ organize: true, actorId });
  for (const categorySchema of schema.categories) {
    let category = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name === categorySchema.name);
    if (!category) {
      category = await guild.channels.create({
        name: categorySchema.name,
        type: ChannelType.GuildCategory,
        reason: `Fima ${schema.label} setup missing category`
      });
      createdCategories.push(category.name);
    }
    for (const channelName of categorySchema.channels) {
      const exists = guild.channels.cache.find((channel) => channel.name === channelName);
      if (exists) continue;
      const channelType = ["bug-reports", "suggestions"].includes(channelName) ? ChannelType.GuildForum : ChannelType.GuildText;
      const overwrites = categorySchema.private ? [
        { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] }
      ] : undefined;
      const channel = await guild.channels.create({
        name: channelName,
        type: channelType,
        parent: category.id,
        permissionOverwrites: overwrites,
        topic: channelTopicFor(channelName),
        reason: `Fima ${schema.label} setup create missing channel`
      });
      createdChannels.push(channel.name);
    }
  }
  return { applied: true, createdCategories, createdChannels };
}

function guildSetupPreviewEmbed(schema, preview, audit, applyResult = null) {
  const embed = new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle(`${schema.label} setup ${applyResult ? "applied" : "preview"}`)
    .setDescription(schema.description)
    .addFields(
      { name: "Policy", value: "No useful channels deleted. Missing channels can be created; old content should be archived/re-homed manually.", inline: false },
      { name: "Missing channels", value: preview.missingChannels.length ? preview.missingChannels.slice(0, 18).map((row) => `${row.category}/${row.channelName}`).join("\n") : "None", inline: false },
      { name: "Preserve/rehome", value: preview.preserveMatches.length ? preview.preserveMatches.slice(0, 12).map((row) => row.name).join(", ") : "No matching resource channels found.", inline: false },
      { name: "Audit", value: `${audit.channels.length} suggested channels checked. Snapshot/preview/rollback artifacts generated.`, inline: false }
    );
  if (applyResult) {
    embed.addFields({
      name: "Apply result",
      value: applyResult.applied
        ? `Created categories: ${applyResult.createdCategories.length}. Created channels: ${applyResult.createdChannels.length}.`
        : `Not applied: ${applyResult.reason}`,
      inline: false
    });
  }
  return embed;
}

function channelTopicFor(channelName) {
  const topics = {
    "security-trust": "Official Fima safety notes, fake file warnings and download hashes.",
    "how-to-get-key": "Friendly key guide, My Products link and support flow.",
    "open-ticket": "Start private Fima support tickets.",
    "training-feed": "Training signup and session cards.",
    "training-results": "Training results, proof and hoster summaries.",
    "leaderboards": "Community/training leaderboards and helpful contributors.",
    "outfits": "Preserved outfit showcase/resources.",
    "capes": "Preserved cape showcase/resources.",
    "vouches": "Preserved customer/community trust posts."
  };
  return topics[channelName] || `Fima ${channelName.replace(/-/g, " ")}.`;
}

function fimaSecurityPanelPayload() {
  const siteUrl = (env("FRONTEND_URL") || "https://fimamacro.com").replace(/\/+$/, "");
  const embed = new EmbedBuilder()
    .setColor(0xff4d6d)
    .setTitle("Fima security rules")
    .setDescription("Use official links only. Keep the community clean from scam links, fake builds and stolen-account spam.")
    .addFields(
      { name: "Official downloads", value: `${siteUrl}/download and ${siteUrl}/security are the only official download/hash pages.`, inline: false },
      { name: "Links and media", value: "Only approved roles should post invite links, external links, images or attachments outside media/showcase channels.", inline: false },
      { name: "Fake/cracked files", value: "Do not upload modified builds. Staff should quarantine suspicious files and ask users to redownload from the official page.", inline: false },
      { name: "Sensitive data", value: "Never post full license keys, emails, HWIDs, cookies, tokens or payment details.", inline: false }
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Security page").setStyle(ButtonStyle.Link).setURL(`${siteUrl}/security`),
    new ButtonBuilder().setLabel("Official download").setStyle(ButtonStyle.Link).setURL(`${siteUrl}/download`)
  );
  return { embeds: [embed], components: [row] };
}

function fimaTrainingPanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x40d6ff)
    .setTitle("Fima training hub")
    .setDescription("Community practice is for timing, movement, setup help and friendly 5v5/glads-style practice. Fima is not a clan; this is a support/training system.")
    .addFields(
      { name: "Signup", value: "Use `/fima_training_signup mode:5v5` or `/fima_training_signup mode:timing practice`.", inline: false },
      { name: "Results", value: "Use `/fima_training_result` after a session. Keep screenshots in approved media/result channels.", inline: false },
      { name: "Safety", value: "No harassment, stolen account spam, fake downloads or suspicious links.", inline: false }
    );
  return { embeds: [embed] };
}

function trainingResultEmbed(userId, mode, result, notes) {
  const cleanMode = String(mode || "training").slice(0, 80);
  const cleanResult = String(result || "submitted").slice(0, 160);
  const cleanNotes = String(notes || "").slice(0, 240);
  const embed = new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle("Fima training result")
    .addFields(
      { name: "Submitted by", value: `<@${userId}>`, inline: true },
      { name: "Mode", value: cleanMode, inline: true },
      { name: "Result", value: cleanResult, inline: false }
    );
  if (cleanNotes) embed.addFields({ name: "Notes", value: cleanNotes, inline: false });
  return embed;
}

function trainingSessionEmbed(userId, { mode, region, ruleset, link }) {
  const cleanMode = sanitizeDiscordText(mode, 80) || TRAINING_MODES[0];
  const cleanRegion = sanitizeDiscordText(region, 40) || "mixed";
  const cleanRuleset = sanitizeDiscordText(ruleset, 180) || "friendly practice";
  const cleanLink = sanitizeDiscordText(link, 180);
  const embed = new EmbedBuilder()
    .setColor(0x40d6ff)
    .setTitle("Fima training session")
    .setDescription("Practice queue created. This is a community support/training flow, not a clan requirement.")
    .addFields(
      { name: "Hoster", value: `<@${userId}>`, inline: true },
      { name: "Mode", value: cleanMode, inline: true },
      { name: "Region", value: cleanRegion, inline: true },
      { name: "Ruleset", value: cleanRuleset, inline: false },
      { name: "Proof/results", value: "After the session, use `/training_end` or `/fima_training_result` and keep proof in approved result/media channels.", inline: false }
    );
  if (cleanLink) embed.addFields({ name: "Private link/code", value: "Provided by hoster. Do not repost suspicious links.", inline: false });
  return embed;
}

function eventCardEmbed(userId, { title, format, time }) {
  return new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle(sanitizeDiscordText(title, 120) || "Fima community event")
    .setDescription("Event created. Use scheduled events where possible and keep result proof in event-results.")
    .addFields(
      { name: "Created by", value: `<@${userId}>`, inline: true },
      { name: "Format", value: sanitizeDiscordText(format, 80) || "community event", inline: true },
      { name: "Time", value: sanitizeDiscordText(time, 80) || "to be announced", inline: true }
    );
}

function eventResultEmbed(userId, { winner, score, proof }) {
  return new EmbedBuilder()
    .setColor(0xffc857)
    .setTitle("Fima event result")
    .addFields(
      { name: "Submitted by", value: `<@${userId}>`, inline: true },
      { name: "Winner", value: sanitizeDiscordText(winner, 120) || "pending", inline: true },
      { name: "Score", value: sanitizeDiscordText(score, 80) || "pending", inline: true },
      { name: "Proof", value: proof ? "Proof/link noted for staff review." : "No proof link provided.", inline: false }
    );
}

function activityLogEmbed(userId, type, summary) {
  return new EmbedBuilder()
    .setColor(0x40d6ff)
    .setTitle("Staff activity log")
    .setDescription("Activity saved for staff review. This does not auto-demote or auto-promote anyone.")
    .addFields(
      { name: "Staff", value: `<@${userId}>`, inline: true },
      { name: "Type", value: sanitizeDiscordText(type, 60) || "staff", inline: true },
      { name: "Summary", value: sanitizeDiscordText(summary, 240) || "No summary.", inline: false }
    );
}

function staffSummaryEmbed(commandName, period) {
  return new EmbedBuilder()
    .setColor(0xffc857)
    .setTitle(commandName === "staff_quota" ? "Staff quota helper" : "Staff activity summary")
    .setDescription("Source support is ready. Live summaries require the deployed bot/database to be online.")
    .addFields(
      { name: "Period", value: sanitizeDiscordText(period, 80) || "this week", inline: true },
      { name: "Policy", value: "Recommendations only. Owner/staff must review before warnings, demotes or promotions.", inline: false }
    );
}

function applicationPanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle("Fima applications")
    .setDescription("Use tickets/forms for staff, referee, hoster, coach/helper and reseller applications. Staff reviews every application manually.")
    .addFields(
      { name: "Hoster / Referee", value: "Useful for training queues, result approvals and event support.", inline: false },
      { name: "Support Staff", value: "Helps license/HWID, payment, macro setup and safety tickets.", inline: false },
      { name: "Reseller / Partner", value: "Requires owner review. No one gets secret keys or admin access by default.", inline: false }
    );
  return { embeds: [embed] };
}

function sanitizeDiscordText(value, max = 120) {
  return String(value || "")
    .replace(/[`<>]/g, "")
    .replace(/@everyone|@here/gi, "@ blocked")
    .trim()
    .slice(0, max);
}

function isStaffInteraction(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels)
    || interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)
    || interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)
  );
}

function maskDiscordId(value) {
  const id = String(value || "");
  if (id.length <= 8) return id ? "***" : null;
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
}

async function writeDiscordArtifact(fileName, payload) {
  try {
    const dir = path.resolve(process.cwd(), "artifacts", "post-security-backlog");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return { written: true, path: path.join(dir, fileName) };
  } catch (error) {
    console.warn("Discord artifact write failed", { fileName, message: error.message });
    return { written: false, reason: error.message };
  }
}

async function buildServerAudit(guild) {
  await guild.roles.fetch().catch(() => null);
  await guild.channels.fetch().catch(() => null);
  const roles = Object.entries(ROLE_TYPES).map(([type, config]) => {
    const role = guild.roles.cache.find((item) => item.id === env(config.envName) || item.name === config.fallbackName);
    return { type, expected: config.fallbackName, found: Boolean(role), id: role?.id || null };
  });
  const channels = COMMUNITY_CHANNEL_BLUEPRINT.map((channel) => {
    const found = guild.channels.cache.find((item) => item.name === channel.name);
    return { name: channel.name, found: Boolean(found), id: found?.id || null };
  });
  return { guildId: guild.id, guildName: guild.name, roles, channels };
}

function serverAuditEmbed(audit) {
  const missingRoles = audit.roles.filter((role) => !role.found).map((role) => role.expected);
  const missingChannels = audit.channels.filter((channel) => !channel.found).map((channel) => channel.name);
  return new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle("Fima server audit")
    .setDescription("No channels or roles were deleted. This is a safe audit summary.")
    .addFields(
      { name: "Roles", value: missingRoles.length ? `Missing: ${missingRoles.slice(0, 12).join(", ")}` : "All expected roles found.", inline: false },
      { name: "Channels", value: missingChannels.length ? `Missing: ${missingChannels.slice(0, 12).join(", ")}` : "All suggested channels found.", inline: false }
    );
}

function discordStatusEmbed(health) {
  return new EmbedBuilder()
    .setColor(health.botReady ? 0x2ecc71 : 0xffc857)
    .setTitle("Fima bot status")
    .addFields(
      { name: "Bot", value: health.botReady ? "Ready" : "Not ready", inline: true },
      { name: "Guild", value: health.guildFound ? "Found" : "Missing", inline: true },
      { name: "Manage roles", value: health.manageRolesPermission ? "Yes" : "No", inline: true },
      { name: "Last error", value: health.lastError ? String(health.lastError).slice(0, 180) : "None", inline: false }
    );
}

function fimaAnnouncementPayload(commandName = "fima_embed") {
  const siteUrl = env("FRONTEND_URL") || "https://fimamacro.com";
  const downloadUrl = `${siteUrl.replace(/\/+$/, "")}/download`;
  const pricingUrl = `${siteUrl.replace(/\/+$/, "")}/pricing`;
  const tutorialUrl = `${siteUrl.replace(/\/+$/, "")}/macros`;
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
      new ButtonBuilder().setCustomId("fima_ticket_reopen").setLabel("Reopen").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("fima_ticket_note").setLabel("Add note").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("fima_ticket_escalate").setLabel("Escalate").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
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

function fimaFaqPanelPayload() {
  const siteUrl = (env("FRONTEND_URL") || "https://fimamacro.com").replace(/\/+$/, "");
  const embed = new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle("Fima FAQ")
    .setDescription("Quick answers for buying, trials, licenses, HWID and safe downloads.")
    .addFields(
      { name: "How trial works", value: "Trial access is claimed from your Fima account. Free trial requirements can include Discord and Roblox profile verification.", inline: false },
      { name: "License and HWID", value: "Keys are device-bound after activation. If your PC changed, open a License / HWID ticket with masked details only.", inline: false },
      { name: "Old TGMacro buyer proof", value: "Open an Old TGMacro buyer proof ticket, send proof privately, and staff will review eligibility.", inline: false },
      { name: "Support rules", value: "Never post full keys, emails, HWIDs, tokens, passwords or cookies. Staff only needs masked details.", inline: false }
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("How to get a key").setStyle(ButtonStyle.Link).setURL(`${siteUrl}/how-to-get-key`),
    new ButtonBuilder().setLabel("My Products").setStyle(ButtonStyle.Link).setURL(`${siteUrl}/dashboard/products`),
    new ButtonBuilder().setLabel("Support").setStyle(ButtonStyle.Link).setURL(`${siteUrl}/support`)
  );
  return { embeds: [embed], components: [row] };
}

function fimaBuyPanelPayload() {
  const siteUrl = (env("FRONTEND_URL") || "https://fimamacro.com").replace(/\/+$/, "");
  const embed = new EmbedBuilder()
    .setColor(0x40d6ff)
    .setTitle("Buy Fima safely")
    .setDescription("Use only fimamacro.com for pricing, checkout and downloads. Do not use old SellAuth links or random reuploads.")
    .addFields(
      { name: "Official checkout", value: `${siteUrl}/pricing`, inline: true },
      { name: "After payment", value: "Your masked key appears on the success page and My Products. If it is still syncing, wait a moment or open a payment ticket.", inline: false },
      { name: "Robux orders", value: "Robux orders are staff-assisted only. Open a Purchase / Payment ticket and wait for staff confirmation.", inline: false }
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Pricing").setStyle(ButtonStyle.Link).setURL(`${siteUrl}/pricing`),
    new ButtonBuilder().setLabel("Download").setStyle(ButtonStyle.Link).setURL(`${siteUrl}/download`),
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
  if (action === "reopen") {
    await interaction.channel?.setName?.(String(interaction.channel?.name || "ticket").replace(/^closed-/, "").slice(0, 90)).catch(() => {});
    return interaction.reply({ content: "Ticket reopened for follow-up.", ephemeral: false });
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
  const resetUrl = `${(env("FRONTEND_URL") || "https://fimamacro.com").replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
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

export async function paradiseDiscordRuntimeSnapshot(guildId = null) {
  const guild = await getGuild(guildId);
  if (!guild || !client?.isReady?.()) {
    return {
      status: "unavailable",
      botReady: Boolean(client?.isReady?.()),
      guildConfigured: env("DISCORD_GUILD_ID", "") || null,
      lastCommandSyncAt: lastCommandSyncAt?.toISOString() || null,
      lastCommandSyncError,
      lastCommandSyncCount
    };
  }
  await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
  const [commands, autoModRules, webhooks] = await Promise.all([
    guild.commands.fetch().catch(() => new Map()),
    guild.autoModerationRules.fetch().catch(() => new Map()),
    guild.fetchWebhooks().catch(() => new Map())
  ]);
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  return {
    status: "ready",
    capturedAt: new Date().toISOString(),
    guild: {
      id: guild.id,
      name: guild.name,
      ownerId: guild.ownerId,
      memberCount: guild.memberCount,
      botRolePosition: me?.roles?.highest?.position ?? null,
      botPermissions: me?.permissions?.toArray?.() || []
    },
    botIdentity: {
      applicationUsername: client.user?.username || null,
      guildNickname: me?.nickname || null,
      intendedName: "Paradise",
      usernameMatches: client.user?.username === "Paradise",
      nicknameMatches: (me?.nickname || client.user?.username) === "Paradise"
    },
    commandScope: "guild",
    commands: [...commands.values()].map(command => ({
      id: command.id,
      name: command.name,
      description: command.description,
      defaultMemberPermissions: command.defaultMemberPermissions?.toString() || null
    })).sort((a, b) => a.name.localeCompare(b.name)),
    commandSync: {
      lastSyncAt: lastCommandSyncAt?.toISOString() || null,
      lastError: lastCommandSyncError,
      count: commands.size,
      configuredCount: lastCommandSyncCountsByGuild.get(guild.id) ?? lastCommandSyncCount
    },
    categories: [...guild.channels.cache.values()]
      .filter(channel => channel.type === ChannelType.GuildCategory)
      .map(channel => ({ id: channel.id, name: channel.name, position: channel.rawPosition })),
    channels: [...guild.channels.cache.values()]
      .filter(channel => channel.type !== ChannelType.GuildCategory && !channel.isThread?.())
      .map(channel => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parentId: channel.parentId,
        position: channel.rawPosition,
        permissionOverwriteCount: channel.permissionOverwrites?.cache?.size || 0
      })),
    roles: [...guild.roles.cache.values()].map(role => ({
      id: role.id,
      name: role.name,
      position: role.position,
      permissions: role.permissions.toArray(),
      managed: role.managed
    })),
    autoModRules: [...autoModRules.values()].map(rule => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      triggerType: rule.triggerType,
      actionTypes: rule.actions.map(action => action.type)
    })),
    webhooks: [...webhooks.values()].map(webhook => ({
      id: webhook.id,
      name: webhook.name,
      channelId: webhook.channelId,
      applicationId: webhook.applicationId || null
    }))
  };
}

export async function paradiseDiscordGuildsSnapshot() {
  if (!client?.isReady?.()) return [];
  const guilds = [];
  for (const cached of client.guilds.cache.values()) {
    const guild = await client.guilds.fetch(cached.id).catch(() => cached);
    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    guilds.push({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      botRolePosition: me?.roles?.highest?.position ?? null,
      botPermissions: me?.permissions?.toArray?.() || [],
      available: guild.available !== false
    });
  }
  return guilds.sort((a, b) => a.name.localeCompare(b.name));
}

const IMPORTANT_AUDIT_CHANNEL = /(welcome|rule|guide|verify|faq|trust|challenge|availability|loa|training|tryout|referee|hoster|activity|report|support|application|blacklist|appeal|bail|lineup|line-up|roster|mainer|relation|ally|enemy|announcement|update|mod-|message-|channel-|member-|ticket|log)/i;

function auditMessageType(channelName, message) {
  const haystack = `${channelName} ${message.embeds?.map(embed => `${embed.title || ""} ${embed.description || ""}`).join(" ") || ""}`;
  if (/challenge/.test(channelName)) return /result/.test(channelName) ? "challenge-result" : "challenge-guide-or-panel";
  if (/availability|loa/.test(channelName)) return "availability-or-loa-panel";
  if (/lineup|line-up|roster|mainer/.test(channelName)) return "roster-or-lineup-board";
  if (/blacklist|appeal|bail/.test(channelName)) return "blacklist-or-appeal-panel";
  if (/ticket/.test(channelName)) return "ticket-panel-or-ticket-message";
  if (/log/.test(channelName)) return "audit-log";
  if (/rule|guide|faq|trust|welcome|verify/.test(channelName)) return "guide-or-handbook";
  if (/training|tryout|referee|hoster|activity/.test(channelName)) return "staff-or-activity-system";
  if (/announcement|update/.test(channelName)) return "announcement";
  if (message.components?.length) return "interactive-panel";
  if (message.embeds?.length) return "embed";
  return haystack.trim() ? "message" : "unknown";
}

function auditMessageDecision(channelName, message, oldBranding) {
  const botAuthored = Boolean(message.author?.bot);
  if (/log/.test(channelName)) return { decision: "KEEP", reason: "Operational history should be preserved." };
  if (/ticket/.test(channelName) && !/panel|support-ticket|application-ticket/.test(channelName)) {
    return { decision: "ARCHIVE", reason: "Ticket history should be retained privately, not rewritten in place." };
  }
  if (oldBranding) return { decision: "REPOST BETTER", reason: "Old or mixed bot branding was detected." };
  if (botAuthored && (message.embeds?.length || message.components?.length)) {
    return { decision: "KEEP BUT EDIT", reason: "Existing bot panel can be updated in place after mapping its message ID." };
  }
  if (/rule|guide|faq|trust|welcome|verify|challenge|availability|loa|lineup|roster|blacklist|appeal|relation/.test(channelName)) {
    return { decision: "REPOST BETTER", reason: "Important static content should use the selected Paradise template and current bilingual style." };
  }
  return { decision: "KEEP", reason: "No destructive decision is justified by the sampled metadata." };
}

export async function paradiseDiscordDeepAudit(guildId = null) {
  const guild = await getGuild(guildId);
  if (!guild || !client?.isReady?.()) {
    const error = new Error("paradise_bot_not_ready");
    error.code = "paradise_bot_not_ready";
    throw error;
  }
  await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
  const me = guild.members.me || await guild.members.fetchMe();
  const [commands, autoModRules, webhooks] = await Promise.all([
    guild.commands.fetch().catch(() => new Map()),
    guild.autoModerationRules.fetch().catch(() => new Map()),
    guild.fetchWebhooks().catch(() => new Map())
  ]);
  const importantChannels = [...guild.channels.cache.values()]
    .filter(channel => channel.type !== ChannelType.GuildCategory && !channel.isThread?.() && IMPORTANT_AUDIT_CHANNEL.test(channel.name))
    .sort((a, b) => a.rawPosition - b.rawPosition);
  const sampledChannels = [];
  let pinnedMessages = 0;
  let botAuthoredMessages = 0;
  let guideMessages = 0;
  let panels = 0;
  for (const channel of importantChannels) {
    const permissions = channel.permissionsFor(me);
    const readable = Boolean(
      permissions?.has(PermissionsBitField.Flags.ViewChannel)
      && permissions?.has(PermissionsBitField.Flags.ReadMessageHistory)
      && channel.isTextBased?.()
      && channel.messages?.fetch
    );
    const messages = readable ? await channel.messages.fetch({ limit: 25 }).catch(() => new Map()) : new Map();
    const pins = readable && channel.messages?.fetchPinned
      ? await channel.messages.fetchPinned().catch(() => new Map())
      : new Map();
    pinnedMessages += pins.size || 0;
    const classified = [...messages.values()].map(message => {
      const embedText = message.embeds?.map(embed => `${embed.title || ""} ${embed.footer?.text || ""}`).join(" ") || "";
      const oldBranding = /Fima App|T[üu]rkiye Bot|TSBTR Bot/i.test(`${message.author?.username || ""} ${embedText}`);
      const roughType = auditMessageType(channel.name.toLowerCase(), message);
      const { decision, reason } = auditMessageDecision(channel.name.toLowerCase(), message, oldBranding);
      if (message.author?.bot) botAuthoredMessages += 1;
      if (/guide|handbook/.test(roughType)) guideMessages += 1;
      if (message.components?.length || /panel|board/.test(roughType)) panels += 1;
      return {
        messageId: message.id,
        authorKind: message.author?.bot ? "bot" : "human",
        roughType,
        decision,
        reason,
        shouldRepostByParadise: decision === "REPOST BETTER",
        oldBranding,
        hasEmbed: Boolean(message.embeds?.length),
        hasComponents: Boolean(message.components?.length),
        pinned: Boolean(message.pinned)
      };
    });
    sampledChannels.push({
      id: channel.id,
      name: channel.name,
      type: ChannelType[channel.type] || String(channel.type),
      parentId: channel.parentId,
      readable,
      missingPermission: readable ? null : "ViewChannel or ReadMessageHistory",
      pinnedMessageCount: pins.size || 0,
      sampledMessageCount: classified.length,
      importantMessages: classified.filter(item =>
        item.hasEmbed || item.hasComponents || item.pinned || item.decision !== "KEEP"
      )
    });
  }
  const channels = [...guild.channels.cache.values()].filter(channel => !channel.isThread?.());
  return {
    status: "LIVE DISCORD VERIFIED",
    capturedAt: new Date().toISOString(),
    guild: {
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      botRolePosition: me.roles.highest.position,
      botPermissions: me.permissions.toArray(),
      capabilities: {
        manageChannels: me.permissions.has(PermissionsBitField.Flags.ManageChannels),
        manageRoles: me.permissions.has(PermissionsBitField.Flags.ManageRoles),
        manageMessages: me.permissions.has(PermissionsBitField.Flags.ManageMessages),
        viewAuditLog: me.permissions.has(PermissionsBitField.Flags.ViewAuditLog)
      }
    },
    counts: {
      categories: channels.filter(channel => channel.type === ChannelType.GuildCategory).length,
      textChannels: channels.filter(channel => channel.type === ChannelType.GuildText).length,
      forumChannels: channels.filter(channel => channel.type === ChannelType.GuildForum).length,
      voiceChannels: channels.filter(channel => channel.type === ChannelType.GuildVoice).length,
      stageChannels: channels.filter(channel => channel.type === ChannelType.GuildStageVoice).length,
      roles: guild.roles.cache.size,
      permissionOverwrites: channels.reduce((sum, channel) => sum + (channel.permissionOverwrites?.cache?.size || 0), 0),
      autoModRules: autoModRules.size,
      webhooks: webhooks.size,
      pinnedMessages,
      sampledImportantChannels: sampledChannels.length,
      sampledMessages: sampledChannels.reduce((sum, channel) => sum + channel.sampledMessageCount, 0),
      botAuthoredMessages,
      guideMessages,
      panels,
      registeredCommands: commands.size
    },
    categories: channels.filter(channel => channel.type === ChannelType.GuildCategory)
      .map(channel => ({ id: channel.id, name: channel.name, position: channel.rawPosition })),
    channels: channels.filter(channel => channel.type !== ChannelType.GuildCategory)
      .map(channel => ({
        id: channel.id,
        name: channel.name,
        type: ChannelType[channel.type] || String(channel.type),
        parentId: channel.parentId,
        position: channel.rawPosition,
        permissionOverwrites: [...(channel.permissionOverwrites?.cache?.values?.() || [])].map(overwrite => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow.toArray(),
          deny: overwrite.deny.toArray()
        }))
      })),
    roles: [...guild.roles.cache.values()].sort((a, b) => b.position - a.position).map(role => ({
      id: role.id,
      name: role.name,
      position: role.position,
      managed: role.managed,
      permissions: role.permissions.toArray()
    })),
    autoModRules: [...autoModRules.values()].map(rule => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      triggerType: rule.triggerType,
      actionTypes: rule.actions.map(action => action.type)
    })),
    webhooksCount: webhooks.size,
    sampledChannels
  };
}

async function runAutomaticManagedServerAudits() {
  if (!client?.isReady?.()) return;
  lastDeepAuditStartedAt = new Date();
  lastDeepAuditCompletedAt = null;
  lastDeepAuditGuildCount = 0;
  lastStructureBackupGuildCount = 0;
  lastSetupPreviewGuildCount = 0;
  lastDeepAuditError = null;
  const targets = [...client.guilds.cache.values()].filter(guild =>
    ["Paradise | Türkiye", "Fieel's Community", "TSBTR Yedek"].includes(guild.name)
  );
  for (const guild of targets) {
    try {
      const audit = await paradiseDiscordDeepAudit(guild.id);
      await prisma.setting.upsert({
        where: { key: `paradise_3a61_audit_${guild.id}` },
        update: { value: audit },
        create: { key: `paradise_3a61_audit_${guild.id}`, value: audit }
      });
      lastDeepAuditGuildCount += 1;
      const backup = await paradiseDiscordStructureBackup(guild.id);
      await prisma.setting.upsert({
        where: { key: `paradise_3a61_backup_${guild.id}` },
        update: { value: backup },
        create: { key: `paradise_3a61_backup_${guild.id}`, value: backup }
      });
      lastStructureBackupGuildCount += 1;
      const mode = guild.name === "Fieel's Community" ? "community" : guild.name === "TSBTR Yedek" ? "tsbtr" : "clan";
      const preview = await paradiseDiscordSetupPreview(guild.id, mode);
      await prisma.setting.upsert({
        where: { key: `paradise_3a61_preview_${guild.id}` },
        update: { value: preview },
        create: { key: `paradise_3a61_preview_${guild.id}`, value: preview }
      });
      lastSetupPreviewGuildCount += 1;
    } catch (error) {
      lastDeepAuditError = `${guild.name}: ${error.message}`;
    }
  }
  lastDeepAuditCompletedAt = new Date();
}

export function paradiseDiscordAuditJobStatus() {
  return {
    startedAt: lastDeepAuditStartedAt?.toISOString() || null,
    completedAt: lastDeepAuditCompletedAt?.toISOString() || null,
    auditedGuildCount: lastDeepAuditGuildCount,
    backedUpGuildCount: lastStructureBackupGuildCount,
    previewedGuildCount: lastSetupPreviewGuildCount,
    targetGuildCount: 3,
    lastError: lastDeepAuditError
  };
}

export async function paradiseDiscordStructureBackup(guildId = null) {
  const snapshot = await paradiseDiscordRuntimeSnapshot(guildId);
  if (snapshot.status !== "ready") {
    const error = new Error("paradise_guild_unavailable");
    error.code = "paradise_guild_unavailable";
    throw error;
  }
  return {
    status: "LIVE DISCORD VERIFIED",
    backupVersion: 1,
    capturedAt: new Date().toISOString(),
    guild: snapshot.guild,
    categories: snapshot.categories,
    channels: snapshot.channels,
    roles: snapshot.roles,
    autoModRules: snapshot.autoModRules,
    webhooks: snapshot.webhooks
  };
}

export async function paradiseDiscordSetupPreview(guildId, mode) {
  const guild = await getGuild(guildId);
  const selected = PARADISE_SETUP_SCHEMAS[mode];
  if (!guild || !selected) {
    const error = new Error(!guild ? "paradise_guild_unavailable" : "invalid_template");
    error.code = error.message;
    throw error;
  }
  await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
  const desiredResources = new Set(selected.schema.flatMap(([category, channelNames]) => [category, ...channelNames]));
  const currentResources = [...guild.channels.cache.values()].filter(channel => !channel.isThread?.());
  const currentNames = new Set(currentResources.map(channel => channel.name));
  const desiredRoles = new Set(selected.roles);
  return {
    status: "LIVE DISCORD VERIFIED",
    generatedAt: new Date().toISOString(),
    guildId: guild.id,
    guildName: guild.name,
    mode,
    templateLabel: selected.label,
    createResources: [...desiredResources].filter(name => !currentNames.has(name)),
    keepResources: currentResources.filter(channel => desiredResources.has(channel.name)).map(channel => ({ id: channel.id, name: channel.name })),
    extraResources: currentResources.filter(channel => !desiredResources.has(channel.name)).map(channel => ({ id: channel.id, name: channel.name })),
    createRoles: [...desiredRoles].filter(name => !guild.roles.cache.some(role => role.name === name)),
    keepRoles: [...desiredRoles].filter(name => guild.roles.cache.some(role => role.name === name)),
    warning: "Extra resources are preview-only. No archive or deletion occurs without the exact per-server typed confirmation."
  };
}

export async function repostParadiseGuides(mode = "clan", guildId = null) {
  const guild = await getGuild(guildId);
  if (!guild || !client?.isReady?.()) {
    const error = new Error("paradise_bot_not_ready");
    error.code = "paradise_bot_not_ready";
    throw error;
  }
  return publishParadiseGuidesFromDashboard(guild, mode);
}

export async function syncParadisePanelsFromDashboard(guildId = null) {
  const guild = await getGuild(guildId);
  if (!guild || !client?.isReady?.()) {
    const error = new Error("paradise_bot_not_ready");
    error.code = "paradise_bot_not_ready";
    throw error;
  }
  return syncParadiseMappedPanels(guild);
}

export async function createMissingParadiseTemplateFromDashboard(mode, guildId, options = {}) {
  const guild = await getGuild(guildId);
  if (!guild || !client?.isReady?.()) {
    const error = new Error("paradise_bot_not_ready");
    error.code = "paradise_bot_not_ready";
    throw error;
  }
  return applyParadiseTemplateMissingOnly(guild, mode, options);
}

export async function rebuildParadiseTestTemplateFromDashboard(mode, guildId, confirmation) {
  const guild = await getGuild(guildId);
  if (!guild || !client?.isReady?.()) {
    const error = new Error("paradise_bot_not_ready");
    error.code = "paradise_bot_not_ready";
    throw error;
  }
  return rebuildParadiseTestTemplate(guild, mode, confirmation);
}

export async function runParadiseTestSmokeSuiteFromDashboard(guildId) {
  const guild = await getGuild(guildId);
  if (!guild || !client?.isReady?.()) {
    const error = new Error("paradise_bot_not_ready");
    error.code = "paradise_bot_not_ready";
    throw error;
  }
  return runParadiseTestSmokeSuite(guild);
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

async function getGuild(requestedGuildId = null) {
  if (!client?.isReady?.()) {
    const error = new Error(lastError || "discord_bot_not_ready");
    error.code = "discord_bot_not_ready";
    throw error;
  }

  const guildId = requestedGuildId || env("DISCORD_GUILD_ID");
  if (!guildId) {
    const error = new Error("DISCORD_GUILD_ID is not configured");
    error.code = "missing_discord_guild";
    throw error;
  }

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    const error = new Error("discord_guild_not_managed");
    error.code = "discord_guild_not_managed";
    throw error;
  }
  if (!guild.members.me) await guild.members.fetchMe().catch(() => null);
  return guild;
}
