import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, GatewayIntentBits, PermissionsBitField, SlashCommandBuilder, StringSelectMenuBuilder } from "discord.js";
import { prisma } from "./db.js";
import { env } from "./env.js";
import {
  COMMUNITY_LANGUAGE_ONBOARDING_CHOICES,
  normalizeLanguageOnboardingChoice
} from "./accountProfilePreferences.js";
import { createParadiseBackupEnvelope } from "./paradiseBackupIntegrity.js";
import {
  communityActivityLeaderboard,
  communityActivityRank,
  communityActivityRewards,
  handleCommunityTextActivity,
  handleCommunityVoiceActivity,
  startCommunityActivityWorker
} from "./communityActivity.js";
import {
  observeCommunityBoostMessage,
  reconcileCommunityBoosterMember,
  startCommunityBoosterWorker
} from "./communityBooster.js";
import { answerFimaSupportQuestion, fimaAiHealth } from "./fimaAiAdapter.js";
import {
  assertSafeParadiseContentDelivery,
  importParadiseDiscordMessage,
  normalizeParadiseContentPayload
} from "./paradiseContentStudio.js";
import { assertParadiseTestGuildMutation } from "./runtimeEnvironment.js";
import {
  applyParadiseTemplateMissingOnly,
  handleParadiseGuildMemberAdd,
  handleParadiseGuildMemberRemove,
  handleParadiseGuildMemberUpdate,
  handleParadiseInteraction,
  handleParadiseMessage,
  handleParadiseVoiceStateUpdate,
  initializeParadise,
  PARADISE_TEST_GUILD_ID,
  PARADISE_SETUP_SCHEMAS,
  paradiseSetupChannelType,
  paradiseCommandAllowedForMode,
  paradiseCommands,
  paradiseWebsiteApplicationContext,
  submitParadiseWebsiteApplication,
  paradiseTestLabStatus,
  publishParadiseGuidesFromDashboard,
  rebuildParadiseTestTemplate,
  runParadiseAutoSmokeOnce,
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
    aliases: ["Türkçe", "Turkish"],
    color: 0xe74c3c
  },
  languageEnglish: {
    envName: "DISCORD_LANGUAGE_EN_ROLE_ID",
    fallbackName: "Language: English",
    aliases: ["English"],
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

const LANGUAGE_ROLE_TYPES = new Set([
  "languageTurkish",
  "languageEnglish",
  "languageGerman",
  "languageFrench",
  "languageBosnian"
]);

const LANGUAGE_CHOICES = COMMUNITY_LANGUAGE_ONBOARDING_CHOICES.map((choice) => ({
  ...choice,
  roleType: choice.id === "tr"
    ? "languageTurkish"
    : choice.id === "en"
      ? "languageEnglish"
      : null
}));

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
const licenseSupportLookup = new Map();
const supportHintCooldowns = new Map();
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
    const activityWorker = startCommunityActivityWorker(client);
    console.info("FIMA community activity worker state", activityWorker);
    const boosterWorker = startCommunityBoosterWorker(client);
    console.info("FIMA community booster worker state", boosterWorker);
    // Guild maintenance can take time across several servers. Do not make the
    // strictly test-guild-only smoke wait behind it after a deploy.
    void initializeParadise(client).catch((error) => {
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
    const smokeTimer = setTimeout(() => {
      const guild = client.guilds.cache.get("1520519015661961257");
      if (!guild) return;
      runParadiseAutoSmokeOnce(guild).then(result => {
        console.info("Paradise test-lab smoke status", {
          skipped: Boolean(result?.skipped),
          reason: result?.reason || null,
          revision: result?.revision || null
        });
      }).catch(error => {
        lastError = error.message;
        console.warn("Paradise test-lab smoke failed", { message: error.message });
      });
    }, 12_000);
    smokeTimer.unref?.();
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
    if (message.guildId === PARADISE_TEST_GUILD_ID) {
      observeCommunityBoostMessage(message).catch((error) => {
        lastError = error.message;
        console.warn("FIMA booster observation failed", { message: error.message, code: error.code || null, messageId: message?.id || null });
      });
      handleCommunityTextActivity(message).catch((error) => {
        lastError = error.message;
        console.warn("FIMA text activity handler failed", { message: error.message, code: error.code || null, channelId: message?.channelId || null });
      });
    }
    handleParadiseMessage(message).catch((error) => {
      lastError = error.message;
      console.warn("Paradise sticky message handler failed", { message: error.message, channelId: message?.channelId || null });
    });
    handleFimaSupportTicketHint(message).catch((error) => {
      lastError = error.message;
      console.warn("Fima support hint handler failed", { message: error.message, channelId: message?.channelId || null });
    });
  });

  client.on("guildMemberUpdate", (oldMember, newMember) => {
    if (newMember?.guild?.id === PARADISE_TEST_GUILD_ID) {
      reconcileCommunityBoosterMember(oldMember, newMember).catch((error) => {
        lastError = error.message;
        console.warn("FIMA booster member reconciliation failed", { message: error.message, code: error.code || null, guildId: newMember?.guild?.id || null });
      });
    }
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
    handleCommunityLanguageOnboarding(member).catch((error) => {
      lastError = error.message;
      console.warn("Community language onboarding failed", { message: error.message, guildId: member?.guild?.id || null });
    });
  });

  client.on("guildMemberRemove", (member) => {
    if (member?.guild?.id === PARADISE_TEST_GUILD_ID) {
      reconcileCommunityBoosterMember(member, null).catch((error) => {
        lastError = error.message;
        console.warn("FIMA booster leave reconciliation failed", { message: error.message, code: error.code || null, guildId: member?.guild?.id || null });
      });
    }
    handleParadiseGuildMemberRemove(member).catch((error) => {
      lastError = error.message;
      console.warn("Paradise leave automation failed", { message: error.message, guildId: member?.guild?.id || null });
    });
  });

  client.on("voiceStateUpdate", (oldState, newState) => {
    if ((newState?.guild?.id || oldState?.guild?.id) === PARADISE_TEST_GUILD_ID) {
      handleCommunityVoiceActivity(oldState, newState).catch((error) => {
        lastError = error.message;
        console.warn("FIMA voice activity handler failed", { message: error.message, code: error.code || null });
      });
    }
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
    new SlashCommandBuilder()
      .setName("fima")
      .setDescription("FIMA activity ranks and Macro rewards.")
      .addSubcommand((subcommand) => subcommand
        .setName("leaderboard")
        .setDescription("Show this season's text or voice leaderboard.")
        .addStringOption((option) => option
          .setName("board")
          .setDescription("Leaderboard type")
          .setRequired(true)
          .addChoices(
            { name: "Text", value: "text" },
            { name: "Voice", value: "voice" }
          )))
      .addSubcommand((subcommand) => subcommand.setName("rank").setDescription("Show your text and voice ranks."))
      .addSubcommand((subcommand) => subcommand.setName("rewards").setDescription("Show your earned Macro reward history.")),
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
      .setDescription("Check or create the FIMA community roles.")
      .addChannelOption((option) => option.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    new SlashCommandBuilder()
      .setName("fima_roles_sync")
      .setDescription("Check or create the FIMA community roles."),
    new SlashCommandBuilder()
      .setName("fima_ticket")
      .setDescription("Open the Fima support ticket menu."),
    new SlashCommandBuilder()
      .setName("fima_license_check")
      .setDescription("Staff-only safe purchase/license lookup for support tickets.")
      .addStringOption((option) => option
        .setName("query")
        .setDescription("Discord ID, Roblox name, email, license id, masked fragment or payment hint")
        .setRequired(false))
      .addUserOption((option) => option
        .setName("user")
        .setDescription("Discord user to check")
        .setRequired(false)),
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
          { name: "Türkçe", value: "tr" },
          { name: "English", value: "en" },
          { name: "Decide Later", value: "later" }
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

function activitySeasonLabel(season) {
  const startsAt = new Date(season?.startsAt || Date.now());
  const endsAt = new Date(season?.endsAt || Date.now());
  const start = Math.floor(startsAt.getTime() / 1000);
  const end = Math.floor(endsAt.getTime() / 1000);
  return `<t:${start}:D> - <t:${end}:D>`;
}

function activityVoiceDuration(seconds) {
  const totalMinutes = Math.max(0, Math.floor(Number(seconds || 0) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}s ${minutes}dk` : `${minutes}dk`;
}

function activityPrizeLabel(rank) {
  return ({ 1: "15 gun", 2: "10 gun", 3: "7 gun" })[rank] || null;
}

async function handleCommunityActivityCommand(interaction) {
  if (interaction.guildId !== PARADISE_TEST_GUILD_ID) {
    return interaction.reply({
      content: "FIMA activity sistemi production sunucusunda henuz etkin degil. Sonuclari dogrulanana kadar yalniz test sunucusunda calisir.",
      ephemeral: true
    });
  }

  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: subcommand !== "leaderboard" });
  try {
    if (subcommand === "leaderboard") {
      const board = interaction.options.getString("board", true);
      const result = await communityActivityLeaderboard({ guildId: interaction.guildId, board, limit: 10 });
      const boardName = board === "voice" ? "Ses" : "Text";
      const lines = result.entries.map((entry) => {
        const activity = board === "voice"
          ? `${activityVoiceDuration(entry.voiceSeconds)} • ${entry.xp} XP`
          : `${entry.textMessages} mesaj • ${entry.xp} XP`;
        const prize = activityPrizeLabel(entry.rank);
        return `**#${entry.rank}** <@${entry.discordUserId}> • ${activity}${prize ? ` • **${prize} FIMA Macro**` : ""}`;
      });
      const embed = new EmbedBuilder()
        .setColor(board === "voice" ? 0x40d6ff : 0x9b5cff)
        .setTitle(`FIMA ${boardName} Leaderboard`)
        .setDescription(lines.length ? lines.join("\n") : "Bu sezonda henuz uygun aktivite kaydi yok.")
        .addFields(
          { name: "Sezon", value: activitySeasonLabel(result.season), inline: false },
          { name: "Oduller", value: "1. 15 gun • 2. 10 gun • 3. 7 gun FIMA Macro. Text ve ses odulleri ayri kazanilir ve ust uste eklenir.", inline: false },
          { name: "Booster Odulleri", value: "Her ay dogrulanan aktif boost basina +3 gun FIMA Macro verilir. Booster, text ve ses odulleri ust uste eklenir.", inline: false }
        )
        .setFooter({ text: "Leaderboard siralamalari her ay UTC saatine gore sifirlanir." });
      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    if (subcommand === "rank") {
      const result = await communityActivityRank({ guildId: interaction.guildId, discordUserId: interaction.user.id });
      const textRank = result.text
        ? `#${result.text.rank || "-"} • ${result.text.xp} XP • ${result.text.textMessages} mesaj`
        : "Henuz uygun text aktivitesi yok.";
      const voiceRank = result.voice
        ? `#${result.voice.rank || "-"} • ${result.voice.xp} XP • ${activityVoiceDuration(result.voice.voiceSeconds)}`
        : "Henuz uygun ses aktivitesi yok.";
      const embed = new EmbedBuilder()
        .setColor(0x9b5cff)
        .setTitle("FIMA Activity Rank")
        .addFields(
          { name: "Text", value: textRank, inline: false },
          { name: "Ses", value: voiceRank, inline: false },
          { name: "Sezon", value: activitySeasonLabel(result.season), inline: false }
        )
        .setFooter({ text: "Odul alabilmek icin Discord hesabin FIMA hesabina bagli olmalidir." });
      return interaction.editReply({ embeds: [embed] });
    }

    const rewards = await communityActivityRewards({ guildId: interaction.guildId, discordUserId: interaction.user.id });
    const lines = rewards.slice(0, 10).map((reward) => {
      const boardName = reward.board === "voice" ? "Ses" : "Text";
      const grantState = reward.entitlementGrant ? "lisansa eklendi" : reward.status === "blocked" ? "hesap baglantisi bekliyor" : reward.status;
      return `**${boardName} #${reward.rank}** • ${reward.days} gun • ${grantState} • ${activitySeasonLabel(reward.season)}`;
    });
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("FIMA Macro Activity Odulleri")
      .setDescription(lines.length ? lines.join("\n") : "Henuz kazanilmis activity odulu yok.")
      .addFields({ name: "Odul tablosu", value: "1. 15 gun • 2. 10 gun • 3. 7 gun. Text ve ses Top 3 odulleri ayri ayri verilir.", inline: false });
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.warn("FIMA activity command failed", { message: error.message, code: error.code || null, subcommand });
    return interaction.editReply({ content: "Activity verisi su anda alinamiyor. Herhangi bir odul veya lisans islemi uydurulmadi." });
  }
}

async function handleDiscordInteraction(interaction) {
  if (await handleParadiseInteraction(interaction)) return;
  if (interaction?.isStringSelectMenu?.() && interaction.customId === "fima_ticket_category") {
    return handleTicketCategorySelect(interaction);
  }

  if (interaction?.isStringSelectMenu?.() && String(interaction.customId || "").startsWith("fima_language_select")) {
    return handleLanguageSelect(interaction);
  }

  if (interaction?.isStringSelectMenu?.() && interaction.customId === "fima_ping_roles_select") {
    return handlePingRoleSelect(interaction);
  }

  if (interaction?.isButton?.() && String(interaction.customId || "").startsWith("fima_ticket_")) {
    return handleTicketButton(interaction);
  }

  if (interaction?.isButton?.() && String(interaction.customId || "").startsWith("fima_license_")) {
    return handleLicenseSupportButton(interaction);
  }

  if (interaction?.isButton?.() && String(interaction.customId || "").startsWith("fima_training_lifecycle_")) {
    return handleFimaTrainingLifecycleButton(interaction);
  }

  if (!interaction?.isChatInputCommand?.()) return;

  if (interaction.commandName === "fima") {
    return handleCommunityActivityCommand(interaction);
  }

  if (interaction.commandName === "fima_help") {
    return interaction.reply({ embeds: [fimaHelpEmbed()], ephemeral: true });
  }

  if (interaction.commandName === "fima_support_ai") {
    const question = interaction.options.getString("question") || "";
    const answer = await fimaKnowledgeAnswer(question);
    await auditDiscordBotAction("discord_ai_support_answered", "discord_user", interaction.user.id, {
      matched: answer.matchedIds,
      risky: answer.risky,
      source: answer.source,
      confidence: answer.confidence,
      escalation: answer.escalation,
      fallbackReason: answer.reason,
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

  if (interaction.commandName === "fima_license_check") {
    return handleLicenseSupportCheck(interaction);
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
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel?.isTextBased?.()) return interaction.reply({ content: "Choose a text channel.", ephemeral: true });
    await channel.send(fimaLanguagePanelPayload(interaction.guildId));
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
    await channel.send(fimaLanguagePanelPayload(interaction.guildId));
    await channel.send(fimaPingRolePanelPayload());
    await auditDiscordBotAction("discord_rolepicker_panel_sent", "discord_channel", channel.id, {
      actorId: interaction.user.id
    });
    return interaction.reply({ content: "Language and ping role picker panels sent.", ephemeral: true });
  }

  if (interaction.commandName === "language") {
    const choice = interaction.options.getString("choice");
    if (!choice) return interaction.reply({ ...fimaLanguagePanelPayload(interaction.guildId), ephemeral: true });
    return applyLanguageChoice(interaction, choice);
  }

  if (interaction.commandName === "language_broadcast") {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Only admins can send language reminders.", ephemeral: true });
    }
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel?.isTextBased?.()) return interaction.reply({ content: "Choose a text channel.", ephemeral: true });
    await channel.send(fimaLanguagePanelPayload(interaction.guildId));
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
    return interaction.reply({
      content: trainingSessionMessage(interaction.user.id, { mode, region, ruleset, link }),
      components: trainingLifecycleRows("training"),
      allowedMentions: { parse: ["roles", "users"] },
      ephemeral: false
    });
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

async function fimaKnowledgeAnswer(question) {
  const answer = await answerFimaSupportQuestion(question);
  const embed = new EmbedBuilder()
    .setColor(answer.risky ? 0xff4d6d : 0x9b5cff)
    .setTitle(answer.title)
    .setDescription(answer.description)
    .addFields(answer.fields);
  if (answer.escalation) {
    embed.addFields({ name: "Next step", value: "Open a private ticket with masked details so staff can verify the request. Never post keys, tokens, cookies, passwords, payment details or full HWIDs.", inline: false });
  }
  return {
    ...answer,
    embed,
  };
}

export async function fimaAiSupportHealth() {
  return fimaAiHealth();
}

function communityGuildId(requestedGuildId = null) {
  return requestedGuildId || env("FIEELS_COMMUNITY_GUILD_ID") || env("DISCORD_GUILD_ID");
}

function communityLanguageOnboardingEnabled() {
  return ["1", "true", "yes", "on"].includes(String(env("FIEELS_COMMUNITY_LANGUAGE_ONBOARDING", "false")).trim().toLowerCase());
}

async function handleCommunityLanguageOnboarding(member) {
  if (!communityLanguageOnboardingEnabled() || member?.user?.bot) return { skipped: true, reason: "disabled_or_bot" };
  const guildId = communityGuildId();
  if (!guildId || member?.guild?.id !== guildId) return { skipped: true, reason: "different_guild" };

  const recordKey = String(member.id || "");
  if (!recordKey) return { skipped: true, reason: "missing_member_id" };
  const where = {
    guildId_kind_recordKey: {
      guildId,
      kind: "community_language_onboarding",
      recordKey
    }
  };
  const existing = await prisma.paradiseGuildRecord.findUnique({ where }).catch(() => null);
  if (existing) return { skipped: true, reason: "already_recorded" };

  try {
    await prisma.paradiseGuildRecord.create({
      data: {
        guildId,
        kind: "community_language_onboarding",
        recordKey,
        payload: {
          status: "pending",
          discordUserId: recordKey,
          createdAt: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    const racedRecord = await prisma.paradiseGuildRecord.findUnique({ where }).catch(() => null);
    if (racedRecord) return { skipped: true, reason: "already_recorded" };
    throw error;
  }

  let status = "sent";
  let errorCode = null;
  try {
    await member.send(fimaLanguagePanelPayload(guildId));
  } catch (error) {
    status = "dm_unavailable";
    errorCode = error?.code ? String(error.code) : "discord_dm_failed";
  }
  await prisma.paradiseGuildRecord.update({
    where,
    data: {
      payload: {
        status,
        discordUserId: recordKey,
        deliveredAt: status === "sent" ? new Date().toISOString() : null,
        errorCode
      }
    }
  }).catch(() => {});
  await auditDiscordBotAction("discord_language_onboarding_recorded", "discord_user", recordKey, {
    guildId,
    status,
    errorCode
  });
  return { skipped: false, status };
}

async function recordCommunityLanguageChoice(discordUserId, languageId, requestedGuildId = null) {
  const normalizedChoice = normalizeLanguageOnboardingChoice(languageId);
  if (!normalizedChoice) return;
  const now = new Date();
  const data = normalizedChoice === "later"
    ? {
        languageOnboardingStatus: "deferred",
        languageOnboardingDeferredAt: now
      }
    : {
        preferredLanguage: normalizedChoice,
        languageOnboardingStatus: "completed",
        languageOnboardingCompletedAt: now,
        languageOnboardingDeferredAt: null
      };
  await prisma.user.updateMany({
    where: { discordUserId: String(discordUserId || "") },
    data
  }).catch((error) => {
    console.warn("Community profile language save failed", { message: error.message });
  });

  const guildId = communityGuildId(requestedGuildId);
  if (!guildId) return;
  await prisma.paradiseGuildRecord.updateMany({
    where: {
      guildId,
      kind: "community_language_onboarding",
      recordKey: String(discordUserId || "")
    },
    data: {
      payload: {
        status: normalizedChoice === "later" ? "deferred" : "completed",
        choice: normalizedChoice,
        discordUserId: String(discordUserId || ""),
        completedAt: now.toISOString()
      }
    }
  }).catch(() => {});
}

export async function syncDiscordLanguageRole(discordUserId, languageId, { guildId = null } = {}) {
  const normalizedChoice = normalizeLanguageOnboardingChoice(languageId);
  if (!normalizedChoice) {
    const error = new Error("invalid_community_language");
    error.code = "invalid_community_language";
    throw error;
  }
  if (normalizedChoice === "later") {
    return { success: true, deferred: true, language: normalizedChoice, roleId: null };
  }

  const selected = LANGUAGE_CHOICES.find((item) => item.id === normalizedChoice);
  const guild = await getGuild(communityGuildId(guildId));
  const member = await guild.members.fetch(String(discordUserId || "")).catch(() => null);
  if (!member) {
    const error = new Error("discord_guild_membership_required");
    error.code = "discord_guild_membership_required";
    throw error;
  }

  const role = await findRole(guild, ROLE_TYPES[selected.roleType]);
  if (!role) {
    const error = new Error("discord_language_role_missing");
    error.code = "discord_language_role_missing";
    throw error;
  }

  for (const other of LANGUAGE_CHOICES.filter((item) => item.roleType && item.id !== normalizedChoice)) {
    const otherRole = await findRole(guild, ROLE_TYPES[other.roleType]).catch(() => null);
    if (otherRole && member.roles.cache.has(otherRole.id)) await member.roles.remove(otherRole.id);
  }
  if (!member.roles.cache.has(role.id)) await member.roles.add(role.id);
  await auditDiscordBotAction("discord_language_selected", "discord_user", String(discordUserId || ""), {
    guildId: guild.id,
    language: normalizedChoice,
    roleId: role.id,
    existingRoleOnly: true
  });
  return {
    success: true,
    deferred: false,
    language: normalizedChoice,
    guildId: guild.id,
    roleId: role.id,
    roleName: role.name
  };
}

function fimaLanguagePanelPayload(guildId = null) {
  const customId = guildId ? `fima_language_select:${guildId}` : "fima_language_select";
  const embed = new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle("Choose your community language")
    .setDescription("Choose Türkçe, English, or Decide Later. This onboarding message is sent only once.");
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Select language")
      .addOptions(LANGUAGE_CHOICES.map((language) => ({
        label: language.label,
        value: language.id,
        description: language.id === "later"
          ? "Keep your current roles and choose later."
          : `Use ${language.label} for community access and support.`
      })))
  );
  return { embeds: [embed], components: [row] };
}

async function handleLanguageSelect(interaction) {
  const guildId = String(interaction.customId || "").split(":")[1] || interaction.guildId || null;
  return applyLanguageChoice(interaction, interaction.values?.[0], guildId);
}

async function applyLanguageChoice(interaction, languageId, requestedGuildId = null) {
  const normalizedChoice = normalizeLanguageOnboardingChoice(languageId);
  const selected = LANGUAGE_CHOICES.find((item) => item.id === normalizedChoice);
  if (!selected) return interaction.reply({ content: "That language is not available yet.", ephemeral: true });

  const guildId = requestedGuildId || interaction.guildId || communityGuildId();
  let syncResult = { success: true, deferred: selected.id === "later", roleId: null };
  let syncWarning = null;
  if (selected.id !== "later") {
    try {
      syncResult = await syncDiscordLanguageRole(interaction.user.id, selected.id, { guildId });
    } catch (error) {
      syncWarning = error?.code || error?.message || "discord_language_sync_failed";
    }
  }

  await recordCommunityLanguageChoice(interaction.user.id, selected.id, guildId);
  if (syncWarning) {
    return interaction.reply({
      content: `Your **${selected.label}** choice was saved, but the existing server role could not be mapped (${syncWarning}). Staff must map the current role; no replacement role was created.`,
      ephemeral: true
    });
  }
  if (syncResult.deferred) {
    return interaction.reply({ content: "Choice deferred. Your existing roles were not changed.", ephemeral: true });
  }
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

function trainingLifecycleRows(type = "training") {
  const prefix = `fima_training_lifecycle_${type}`;
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}_locked`).setLabel("SERVER LOCKED").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${prefix}_unlocked`).setLabel("UNLOCK").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${prefix}_ended`).setLabel(type === "tryout" ? "END TRYOUT" : "END TRAINING").setStyle(ButtonStyle.Danger)
  )];
}

function trainingSessionMessage(userId, { mode, region, ruleset, link }) {
  const cleanMode = sanitizeDiscordText(mode, 80) || TRAINING_MODES[0];
  const cleanRegion = sanitizeDiscordText(region, 40) || "mixed";
  const cleanRuleset = sanitizeDiscordText(ruleset, 320) || "First To 3";
  const cleanLink = sanitizeDiscordText(link, 220) || "Hoster linki birazdan paylaşacak.";
  return [
    "# Training",
    "",
    "◇ **Hoster:**",
    `<@${userId}>`,
    "",
    "◇ **Server:**",
    cleanRegion,
    "",
    "◇ **Format:**",
    cleanMode,
    "",
    "◇ **Karakterler:**",
    "Saitama, Garou, Metal Bat",
    "",
    "◇ **Kurallar:**",
    "• LH yok",
    "• 3M1 Reset yok",
    "• True Downslam yok",
    "• 2 RC yok",
    "• Wall yok",
    "• Overpassive yok",
    "• Aura / Aura Emote / M1 Effect yok",
    "• Sırada vurmak yok",
    "• Sırayı terk etmek yok",
    cleanRuleset && !/friendly practice/i.test(cleanRuleset) ? `• Ek kural: ${cleanRuleset}` : "",
    "",
    "◇ **Link:**",
    cleanLink,
    "",
    "-# Hoster-only controls • Made By Fieel"
  ].filter(Boolean).join("\n");
}

async function handleFimaTrainingLifecycleButton(interaction) {
  const customId = String(interaction.customId || "");
  const state = customId.endsWith("_locked") ? "SERVER LOCKED" : customId.endsWith("_unlocked") ? "SERVER UNLOCKED" : "TRAINING ENDED";
  await auditDiscordBotAction("discord_training_lifecycle_button", "discord_channel", interaction.channelId, {
    actorId: interaction.user.id,
    state,
    messageIdMasked: maskDiscordId(interaction.message?.id)
  });
  const reply = [`# ${state}`, "", "-# Paradise lifecycle rendering test • Made By Fieel"].join("\n");
  if (interaction.message?.reply) {
    await interaction.message.reply({ content: reply, allowedMentions: { parse: [] } });
    return interaction.reply({ content: `${state} posted as a reply to the original training message.`, ephemeral: true });
  }
  return interaction.reply({ content: reply, ephemeral: false });
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
  const siteUrl = (env("FRONTEND_URL") || "https://fimamacro.com").replace(/\/+$/, "");
  const embed = new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle("Fieel's Community Applications")
    .setDescription("Applications start on the Fima website. A linked Discord account and membership in the selected server are required before a private staff review ticket is created.")
    .addFields(
      { name: "Community staff", value: "Helper is the only public staff entry. Junior Moderator and higher roles are internal promotions and cannot be requested or auto-granted.", inline: false }
    )
    .setFooter({ text: "Made By Fieel" });
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Apply as Helper")
      .setStyle(ButtonStyle.Link)
      .setURL(`${siteUrl}/paradise-apply?workflow=staff&type=helper`)
  );
  return { embeds: [embed], components: [buttons] };
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

function memberHasRole(member, { id, names = [] } = {}) {
  const roleCache = member?.roles?.cache;
  if (id && roleCache?.has?.(id)) return true;
  if (names.length && roleCache?.some?.((role) => names.includes(String(role?.name || "")))) return true;
  // Guild interaction payloads can contain role IDs without a populated cache.
  return Boolean(id && Array.isArray(member?.roles) && member.roles.includes(id));
}

function isFimaSupportInteraction(interaction) {
  if (isStaffInteraction(interaction)) return true;
  const supportRoleId = env("DISCORD_FIMA_SUPPORT_ROLE_ID") || env("DISCORD_SUPPORT_ROLE_ID");
  return memberHasRole(interaction?.member, {
    id: supportRoleId,
    names: ["Fima Support", "Support Staff"]
  });
}

function isLicenseRepairAdminInteraction(interaction) {
  return Boolean(
    (interaction?.user?.id && interaction?.guild?.ownerId === interaction.user.id)
    || interaction?.memberPermissions?.has(PermissionsBitField.Flags.Administrator)
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
      { name: "Price", value: "Use the website for the current EUR prices and available access plans.", inline: true },
      { name: "Buy Options", value: "Card checkout, gift codes and support-assisted Robux orders.", inline: true },
      { name: "Recommended", value: "Start with 3 Days if you need short access, or choose Monthly or Lifetime for longer use.", inline: false },
      { name: "Tutorial", value: "Open the Macros page for setup notes and video slots.", inline: true },
      { name: "Support", value: "Stuck? Open a ticket and we will help.", inline: true },
      { name: "Download", value: "Use the website download page so the link always follows the latest public release.", inline: false },
      { name: "Old TGMacro buyer?", value: "Open a private ticket and send masked proof. Staff can review whether legacy 3-day access applies.", inline: false }
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

function ticketActionRows({ claimed = false, closed = false } = {}) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("fima_ticket_claim").setLabel(claimed ? "Claimed" : "Claim").setStyle(ButtonStyle.Primary).setDisabled(claimed || closed),
      new ButtonBuilder().setCustomId("fima_ticket_close").setLabel("Close").setStyle(ButtonStyle.Danger).setDisabled(closed),
      new ButtonBuilder().setCustomId("fima_ticket_reopen").setLabel("Reopen").setStyle(ButtonStyle.Success).setDisabled(!closed),
      new ButtonBuilder().setCustomId("fima_ticket_note").setLabel("Add note").setStyle(ButtonStyle.Secondary).setDisabled(closed),
      new ButtonBuilder().setCustomId("fima_ticket_escalate").setLabel("Escalate").setStyle(ButtonStyle.Secondary).setDisabled(closed)
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
      { name: "Pricing and rewards", value: `Check ${siteUrl}/pricing for current paid plans. Monthly Activity Rewards and verified Booster Rewards are tracked separately and can stack.`, inline: false },
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
    .setDescription("Quick answers for buying, Activity Rewards, Booster Rewards, licenses, HWID and safe downloads.")
    .addFields(
      { name: "How Activity Rewards work", value: "Every UTC month, the Top 3 text and Top 3 voice members earn 15, 10 and 7 days of FIMA Macro access. Text and voice rewards are separate and can stack.", inline: false },
      { name: "How Booster Rewards work", value: "Each verified active server boost adds 3 days of FIMA Macro access for that UTC month. Booster, text and voice rewards can stack; Discord must be linked for delivery.", inline: false },
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
    topic: `Fima ticket: ${category.label}. openedBy:${user.id}. Keep keys, emails and payment details masked.`,
    reason: `Fima ticket opened: ${category.id}`
  });
}

function ticketCreatedEmbed(category, userId) {
  const guidance = category.id === "old_tgmacro_buyer"
    ? "Send proof here. Staff will review and can approve 3-day access if it applies."
    : "Tell us what happened. Staff will help from here.";
  return new EmbedBuilder()
    .setColor(0x9b5cff)
    .setTitle(`${category.label} · OPEN`)
    .setDescription([
      guidance,
      "",
      "Please mask license keys, gift codes, emails and payment details unless staff asks in private.",
      "",
      "Close first; Paradise saves a transcript before access is removed."
    ].join("\n"))
    .addFields(
      { name: "Opened by", value: `<@${userId}>`, inline: true },
      { name: "Category", value: category.label, inline: true },
      { name: "Status", value: "OPEN", inline: true }
    )
    .setFooter({ text: "Made By Fieel" });
}

function getTicketCategoryLabel(interaction) {
  const embedCategory = interaction.message?.embeds?.[0]?.fields?.find((field) => /category/i.test(String(field.name || "")));
  if (embedCategory?.value) return sanitizeDiscordText(embedCategory.value, 80);
  const topicMatch = String(interaction.channel?.topic || "").match(/Fima ticket:\s*([^.]*)\./i);
  if (topicMatch?.[1]) return sanitizeDiscordText(topicMatch[1], 80);
  return "Ticket";
}

function ticketLifecycleEmbed({ status = "OPEN", actorId, transcriptMessageId, claimedBy, categoryLabel = "Ticket", openedBy } = {}) {
  const closed = status === "CLOSED";
  const color = closed ? 0xffc857 : 0x9b5cff;
  const fields = [
    { name: "Category", value: sanitizeDiscordText(categoryLabel, 80), inline: true },
    { name: "Status", value: status, inline: true },
    { name: closed ? "Closed by" : "Updated by", value: actorId ? `<@${actorId}>` : "Staff", inline: true }
  ];
  if (openedBy) fields.push({ name: "Opened by", value: `<@${openedBy}>`, inline: true });
  if (claimedBy) fields.push({ name: "Claimed by", value: `<@${claimedBy}>`, inline: true });
  if (transcriptMessageId) fields.push({ name: "Transcript", value: `Saved · ${maskDiscordId(transcriptMessageId)}`, inline: false });
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${sanitizeDiscordText(categoryLabel, 80)} · ${status}`)
    .setDescription(closed
      ? "This ticket is closed. A transcript was saved before closing. Staff can reopen it if more follow-up is needed."
      : "This ticket is open again. Staff can claim it, add notes, escalate, or close it after a transcript is saved.")
    .addFields(fields)
    .setFooter({ text: "Made By Fieel" });
}

function maskTicketTranscriptText(value) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[masked-email]")
    .replace(/\b(?:[A-F0-9]{8}[-:]){3,}[A-F0-9]{4,}\b/gi, "[masked-id]")
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/g, "[masked-token]")
    .replace(/\b(?:FIMA|TG|KEY|LIC)[A-Z0-9_-]{8,}\b/gi, "[masked-key]")
    .replace(/@everyone|@here/gi, "@ blocked");
}

async function createFimaTicketTranscript(interaction, trigger = "manual") {
  const channel = interaction.channel;
  if (!channel?.messages?.fetch) {
    const error = new Error("ticket_channel_unavailable");
    error.code = "ticket_channel_unavailable";
    throw error;
  }
  const fetched = await channel.messages.fetch({ limit: 100 });
  const rows = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const lines = rows.map((message) => {
    const author = `${message.author?.username || "unknown"} (${maskDiscordId(message.author?.id) || "no-id"})`;
    const text = maskTicketTranscriptText(message.content || "");
    const attachmentNote = message.attachments?.size ? ` [attachments:${message.attachments.size}]` : "";
    const componentNote = message.components?.length ? " [components]" : "";
    return `[${new Date(message.createdTimestamp).toISOString()}] ${author}: ${text || "(no text)"}${attachmentNote}${componentNote}`;
  });
  const body = [
    `Paradise/Fima support ticket transcript`,
    `Channel: ${channel.name || channel.id}`,
    `Channel ID: ${maskDiscordId(channel.id)}`,
    `Trigger: ${trigger}`,
    `Created: ${new Date().toISOString()}`,
    `Messages: ${rows.length}`,
    "",
    ...lines
  ].join("\n").slice(0, 900000);
  const attachment = new AttachmentBuilder(Buffer.from(body, "utf8"), {
    name: `ticket-${String(channel.id).slice(-8)}-${Date.now()}.txt`
  });
  const transcriptChannelId = env("DISCORD_TICKET_TRANSCRIPT_CHANNEL_ID") || env("DISCORD_TRANSCRIPT_CHANNEL_ID");
  const destination = transcriptChannelId
    ? await channel.guild.channels.fetch(transcriptChannelId).catch(() => null)
    : channel;
  if (!destination?.send) {
    const error = new Error("transcript_destination_unavailable");
    error.code = "transcript_destination_unavailable";
    throw error;
  }
  const transcriptMessage = await destination.send({
    content: `Ticket transcript saved · <#${channel.id}> · ${trigger}`,
    files: [attachment],
    allowedMentions: { parse: [] }
  });
  await auditDiscordBotAction("discord_ticket_transcript_saved", "discord_channel", channel.id, {
    actorId: interaction.user.id,
    channelId: channel.id,
    destinationChannelId: destination.id,
    transcriptMessageId: transcriptMessage.id,
    messageCount: rows.length,
    contentStoredInDiscord: true,
    artifactContentStored: false,
    fullKeysMasked: true,
    fullEmailsMasked: true
  });
  return { transcriptMessage, messageCount: rows.length, destinationChannelId: destination.id };
}

function getTicketOpenedUserId(interaction) {
  const topicMatch = String(interaction.channel?.topic || "").match(/openedBy:(\d{15,25})/);
  if (topicMatch) return topicMatch[1];
  const embedField = interaction.message?.embeds?.[0]?.fields?.find((field) => /opened by/i.test(String(field.name || "")));
  const embedMatch = String(embedField?.value || "").match(/<@!?(\d{15,25})>/);
  return embedMatch?.[1] || null;
}

async function setClosedTicketParticipantAccess(interaction, closed) {
  const userId = getTicketOpenedUserId(interaction);
  if (!userId || !interaction.channel?.permissionOverwrites?.edit) return { userId: null, changed: false };
  const overwrite = closed
    ? { ViewChannel: false, SendMessages: false, ReadMessageHistory: false }
    : { ViewChannel: true, SendMessages: true, ReadMessageHistory: true };
  await interaction.channel.permissionOverwrites.edit(userId, overwrite, {
    reason: closed ? "Ticket closed after transcript save" : "Ticket reopened by staff"
  });
  return { userId, changed: true };
}

async function handleTicketButton(interaction) {
  const action = String(interaction.customId || "").replace("fima_ticket_", "");
  const isStaff = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels) || interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
  if (!isStaff) {
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
    await interaction.message.edit({ embeds: [ticketLifecycleEmbed({ status: "OPEN", actorId: interaction.user.id, claimedBy: interaction.user.id, categoryLabel: getTicketCategoryLabel(interaction), openedBy: getTicketOpenedUserId(interaction) })], components: ticketActionRows({ claimed: true }) }).catch(() => {});
    return interaction.reply({ content: `Claimed by ${interaction.user}.`, ephemeral: false });
  }
  if (action === "close") {
    let transcript;
    try {
      transcript = await createFimaTicketTranscript(interaction, "close");
    } catch (error) {
      return interaction.reply({
        content: `Transcript could not be saved, so the ticket was not closed. Reason: ${sanitizeDiscordText(error?.code || error?.message || "unknown", 120)}`,
        ephemeral: true
      });
    }
    await interaction.channel?.setName?.(`closed-${String(interaction.channel?.name || "ticket").replace(/^closed-/, "").slice(0, 80)}`).catch(() => {});
    await interaction.message.edit({
      embeds: [ticketLifecycleEmbed({ status: "CLOSED", actorId: interaction.user.id, transcriptMessageId: transcript?.transcriptMessage?.id, categoryLabel: getTicketCategoryLabel(interaction), openedBy: getTicketOpenedUserId(interaction) })],
      components: ticketActionRows({ closed: true })
    }).catch(() => {});
    await setClosedTicketParticipantAccess(interaction, true).catch(() => {});
    return interaction.reply({ content: `Ticket closed. Transcript saved (${transcript.messageCount} messages).`, ephemeral: false });
  }
  if (action === "reopen") {
    await interaction.channel?.setName?.(String(interaction.channel?.name || "ticket").replace(/^closed-/, "").slice(0, 90)).catch(() => {});
    await setClosedTicketParticipantAccess(interaction, false).catch(() => {});
    await interaction.message.edit({ embeds: [ticketLifecycleEmbed({ status: "OPEN", actorId: interaction.user.id, categoryLabel: getTicketCategoryLabel(interaction), openedBy: getTicketOpenedUserId(interaction) })], components: ticketActionRows() }).catch(() => {});
    return interaction.reply({ content: "Ticket reopened for follow-up.", ephemeral: false });
  }
  if (action === "note") {
    return interaction.reply({ content: "Add your staff note as a normal message. Keep keys and emails masked.", ephemeral: true });
  }
  if (action === "escalate") {
    return interaction.reply({ content: "Escalated for senior staff review.", ephemeral: false });
  }
  if (action === "transcript") {
    try {
      const transcript = await createFimaTicketTranscript(interaction, "manual");
      return interaction.reply({ content: `Transcript saved (${transcript.messageCount} messages).`, ephemeral: true });
    } catch (error) {
      return interaction.reply({ content: `Transcript failed: ${sanitizeDiscordText(error?.code || error?.message || "unknown", 120)}`, ephemeral: true });
    }
  }
  return interaction.reply({ content: "Ticket action saved.", ephemeral: true });
}

function maskSupportEmail(value) {
  const email = String(value || "").trim();
  if (!email) return "unknown";
  const [name, domain = ""] = email.split("@");
  if (domain.endsWith("username.fimamacro.local")) return `${name.slice(0, 2)}***@local`;
  return `${name.slice(0, 2)}***@${domain || "masked"}`;
}

function maskSupportLicenseKey(value) {
  const key = String(value || "").trim().toUpperCase();
  if (!key) return "missing";
  const parts = key.split("-");
  if (parts.length >= 5) return `${parts[0]}-${parts[1]}-****-****-${parts.at(-1)}`;
  return `${key.slice(0, 4)}***${key.slice(-4)}`;
}

function isSupportLicenseKeyUsable(value) {
  return /^FIMA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(String(value || "").trim().toUpperCase());
}

function isSupportLicenseActive(license) {
  if (license?.status !== "active") return false;
  if (license?.lifetime) return true;
  return !license?.expiresAt || new Date(license.expiresAt).getTime() > Date.now();
}

function isSupportTrialLicense(license) {
  const haystack = `${license?.plan || ""} ${license?.notes || ""}`.toLowerCase();
  return /trial|free|1day/.test(haystack);
}

function supportLicenseSource(license) {
  if (license?.stripeSessionId || license?.stripePaymentIntentId || license?.orders?.length) return "Stripe/Website";
  if (/manual|admin|gift/i.test(String(license?.notes || ""))) return "Manual/Admin";
  return "Website/Unknown";
}

function supportLicenseRepairState(license) {
  const usable = isSupportLicenseKeyUsable(license?.licenseKey);
  const active = isSupportLicenseActive(license);
  const paid = active && !isSupportTrialLicense(license);
  const linkedPayment = Boolean(license?.stripeSessionId || license?.stripePaymentIntentId || license?.orders?.length);
  return {
    usable,
    active,
    linkedPayment,
    keyRepairNeeded: !usable,
    canCreateRepairTask: paid && !usable
  };
}

function normalizeSupportLicenseFragment(value) {
  const raw = String(value || "").trim().toUpperCase();
  const compact = raw.replace(/[^A-Z0-9]/g, "");
  if (!compact) return "";
  if (compact.startsWith("FIMA") && compact.length >= 8) return compact.slice(-8);
  return compact.length >= 4 ? compact.slice(-12) : "";
}

function maskSupportLookupQuery(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.includes("@")) return maskSupportEmail(raw);
  if (/^FIMA[-\sA-Z0-9]+$/i.test(raw)) return maskSupportLicenseKey(raw);
  if (/^(cs_|pi_)/i.test(raw)) return `${raw.slice(0, 3)}***${raw.slice(-4)}`;
  if (/^[a-z0-9]{18,}$/i.test(raw)) return `${raw.slice(0, 3)}***${raw.slice(-3)}`;
  return sanitizeDiscordText(raw, 120);
}

function rememberLicenseSupportTarget(licenseId, actorId) {
  const now = Date.now();
  for (const [key, entry] of licenseSupportLookup.entries()) {
    if (!entry?.expiresAt || entry.expiresAt < now) licenseSupportLookup.delete(key);
  }
  const lookupKey = crypto.randomBytes(6).toString("hex");
  licenseSupportLookup.set(lookupKey, {
    licenseId,
    actorId,
    expiresAt: now + 15 * 60 * 1000
  });
  return lookupKey;
}

async function findSupportLicenseCandidates({ query, discordUserId }) {
  const rawQuery = String(query || "").trim();
  const emails = new Set();
  const orUsers = [];
  if (discordUserId) orUsers.push({ discordUserId });
  if (rawQuery) {
    if (/^\d{15,25}$/.test(rawQuery)) orUsers.push({ discordUserId: rawQuery });
    orUsers.push(
      { email: { contains: rawQuery, mode: "insensitive" } },
      { discordUsername: { contains: rawQuery, mode: "insensitive" } },
      { robloxUsername: { contains: rawQuery, mode: "insensitive" } }
    );
  }
  if (orUsers.length) {
    const users = await prisma.user.findMany({
      where: { OR: orUsers },
      select: { email: true },
      take: 6
    }).catch(() => []);
    for (const user of users) if (user?.email) emails.add(user.email);
  }
  if (rawQuery.includes("@")) emails.add(rawQuery.toLowerCase());

  const orLicenses = [];
  if (rawQuery) {
    orLicenses.push({ id: rawQuery });
    if (/^cs_|^pi_/i.test(rawQuery)) {
      orLicenses.push({ stripeSessionId: rawQuery }, { stripePaymentIntentId: rawQuery });
    }
    const fragment = normalizeSupportLicenseFragment(rawQuery);
    if (fragment.length >= 4) orLicenses.push({ licenseKey: { contains: fragment } });
  }
  for (const email of emails) {
    orLicenses.push({ customerEmail: email }, { orders: { some: { customerEmail: email } } });
  }
  if (!orLicenses.length) return [];

  return prisma.license.findMany({
    where: { OR: orLicenses },
    orderBy: { updatedAt: "desc" },
    take: 5,
    include: {
      orders: {
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { status: true, mode: true, amount: true, currency: true, createdAt: true }
      }
    }
  });
}

function licenseSupportEmbed({ query, discordUser, licenses }) {
  const embed = new EmbedBuilder()
    .setColor(licenses.length ? 0x40d6ff : 0xffc857)
    .setTitle("Safe license support check")
    .setDescription(licenses.length
      ? "Masked support result only. Full keys, full emails, HWIDs and payment secrets are never shown here."
      : "No matching license was found from the safe lookup. Try Discord user, Roblox name, license id, masked fragment, or the account email in the private ticket.");
  if (discordUser) embed.addFields({ name: "Discord user", value: `${discordUser} (${maskDiscordId(discordUser.id)})`, inline: false });
  if (query) embed.addFields({ name: "Query", value: maskSupportLookupQuery(query), inline: false });

  licenses.slice(0, 3).forEach((license, index) => {
    const state = supportLicenseRepairState(license);
    const statusLine = [
      `Plan: ${sanitizeDiscordText(license.plan, 40)}${license.lifetime ? " / Lifetime" : ""}`,
      `Status: ${sanitizeDiscordText(license.status, 40)}`,
      `Source: ${supportLicenseSource(license)}`,
      `Active license: ${state.active ? "yes" : "no"}`,
      `Checkout linked: ${state.linkedPayment ? "yes" : "no"}`,
      `Key repair needed: ${state.keyRepairNeeded ? "yes" : "no"}`,
      `Downloads: ${license.downloadCount || 0}`,
      `Last validation: ${license.lastValidatedAt ? `<t:${Math.floor(new Date(license.lastValidatedAt).getTime() / 1000)}:R>` : "none"}`
    ].join("\n");
    embed.addFields({
      name: `Result ${index + 1} · ${maskDiscordId(license.id)} · ${maskSupportLicenseKey(license.licenseKey)}`,
      value: `${statusLine}\nCustomer: ${maskSupportEmail(license.customerEmail)}`,
      inline: false
    });
  });
  if (licenses.length > 3) embed.setFooter({ text: `Showing 3 of ${licenses.length} matches · Made By Fieel` });
  else embed.setFooter({ text: "Made By Fieel" });
  return embed;
}

function licenseSupportActionRows(license, actorId, canCreateRepairTask = false) {
  if (!license) return [];
  const lookupKey = rememberLicenseSupportTarget(license.id, actorId);
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fima_license_repair_task:${lookupKey}`)
      .setLabel("Create license repair task")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!canCreateRepairTask || !supportLicenseRepairState(license).canCreateRepairTask),
    new ButtonBuilder()
      .setCustomId(`fima_license_safe_instructions:${lookupKey}`)
      .setLabel("Send user safe instructions")
      .setStyle(ButtonStyle.Secondary)
  )];
}

async function handleLicenseSupportCheck(interaction) {
  if (!isFimaSupportInteraction(interaction)) {
    return interaction.reply({ content: "Only support staff/admins can check purchases or licenses.", ephemeral: true });
  }
  const query = interaction.options.getString("query") || "";
  const discordUser = interaction.options.getUser("user") || null;
  if (!query && !discordUser) {
    return interaction.reply({ content: "Add a Discord user, Roblox name, license id, masked fragment, or account email.", ephemeral: true });
  }
  const licenses = await findSupportLicenseCandidates({ query, discordUserId: discordUser?.id });
  await auditDiscordBotAction("discord_license_support_check", "discord_user", interaction.user.id, {
    queryProvided: Boolean(query),
    discordUserIdMasked: maskDiscordId(discordUser?.id),
    matches: licenses.length,
    fullKeysMasked: true,
    fullEmailsMasked: true
  });
  const firstRepairCandidate = licenses.find((license) => supportLicenseRepairState(license).keyRepairNeeded) || licenses[0] || null;
  return interaction.reply({
    embeds: [licenseSupportEmbed({ query, discordUser, licenses })],
    components: licenseSupportActionRows(firstRepairCandidate, interaction.user.id, isLicenseRepairAdminInteraction(interaction)),
    ephemeral: true
  });
}

async function handleLicenseSupportButton(interaction) {
  if (!isFimaSupportInteraction(interaction)) {
    return interaction.reply({ content: "Only support staff/admins can use license support actions.", ephemeral: true });
  }
  const [action, lookupKey] = String(interaction.customId || "").split(":");
  const entry = licenseSupportLookup.get(lookupKey);
  if (!entry || entry.expiresAt < Date.now()) {
    return interaction.reply({ content: "This license support action expired. Run `/fima_license_check` again.", ephemeral: true });
  }
  if (entry.actorId !== interaction.user.id) {
    return interaction.reply({ content: "This license support action belongs to the staff member who ran the lookup.", ephemeral: true });
  }
  const license = await prisma.license.findUnique({ where: { id: entry.licenseId } }).catch(() => null);
  if (!license) return interaction.reply({ content: "License record was not found anymore.", ephemeral: true });
  const state = supportLicenseRepairState(license);

  if (action === "fima_license_repair_task") {
    if (!isLicenseRepairAdminInteraction(interaction)) {
      return interaction.reply({ content: "Only the server owner or an administrator can create a license repair task.", ephemeral: true });
    }
    await auditDiscordBotAction("discord_license_repair_task_requested", "license", license.id, {
      actorId: interaction.user.id,
      licenseIdMasked: maskDiscordId(license.id),
      keyRepairNeeded: state.keyRepairNeeded,
      canCreateRepairTask: state.canCreateRepairTask,
      fullKeysMasked: true,
      fullEmailsMasked: true
    });
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(state.canCreateRepairTask ? 0xffc857 : 0xff4d6d)
        .setTitle(state.canCreateRepairTask ? "URGENT LICENSE BUG · repair task created" : "License repair is blocked")
        .setDescription(state.canCreateRepairTask
          ? "Owner/admin should repair this paid active license from the secure dashboard or the repair endpoint. Do not paste a full key into Discord."
          : "This record is not eligible for staff-triggered repair. Escalate to owner/admin with the masked license id only.")
        .addFields(
          { name: "License", value: `${maskDiscordId(license.id)} · ${maskSupportLicenseKey(license.licenseKey)}`, inline: true },
          { name: "Customer", value: maskSupportEmail(license.customerEmail), inline: true }
        )
        .setFooter({ text: "Made By Fieel" })],
      ephemeral: false
    });
  }

  if (action === "fima_license_safe_instructions") {
    await auditDiscordBotAction("discord_license_safe_instructions_sent", "license", license.id, {
      actorId: interaction.user.id,
      licenseIdMasked: maskDiscordId(license.id),
      fullKeysMasked: true,
      fullEmailsMasked: true
    });
    return interaction.reply({
      content: [
        "Thanks for waiting — we can see this is a license/payment support case.",
        "Please refresh **My Products** on fimamacro.com and use the **Copy License Key** button again after staff confirms the repair.",
        "Your lifetime access will not be lost. Please do not post full license keys, full emails, HWIDs or payment details in the ticket."
      ].join("\n"),
      allowedMentions: { parse: [] },
      ephemeral: false
    });
  }

  return interaction.reply({ content: "Unknown license support action.", ephemeral: true });
}

async function handleFimaSupportTicketHint(message) {
  if (!message?.guild || message.author?.bot) return;
  const channelName = String(message.channel?.name || "");
  const channelTopic = String(message.channel?.topic || "");
  const isTicket = /ticket/i.test(channelName) || /Fima ticket:/i.test(channelTopic);
  if (!isTicket) return;
  const text = String(message.content || "");
  const looksLikeLicenseProblem = /\b(paid|payment|lifetime|license|licence|key|copy|null|scam|stripe|bought|buy|sat[ıi]n|öde|odeme|lisans|anahtar|kopya)\b/i.test(text);
  if (!looksLikeLicenseProblem) return;
  const cooldownKey = `${message.guild.id}:${message.channel.id}`;
  const last = supportHintCooldowns.get(cooldownKey) || 0;
  if (Date.now() - last < 10 * 60 * 1000) return;
  supportHintCooldowns.set(cooldownKey, Date.now());
  await message.channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0xffc857)
      .setTitle("License support checklist")
      .setDescription("This looks like a payment/license issue. Staff can use `/fima_license_check` to run a safe masked lookup.")
      .addFields(
        { name: "Safe lookup", value: "Use Discord user, Roblox name, license id, account email, or a masked key fragment. The bot will not reveal full keys or full emails.", inline: false },
        { name: "If key copy is broken", value: "If an active paid license needs key repair, create a repair task and tell the user to refresh My Products after owner/admin confirms.", inline: false },
        { name: "Never ask for", value: "Full license key, HWID, cookies, tokens, passwords, or raw payment secrets.", inline: false }
      )
      .setFooter({ text: "Made By Fieel" })],
    allowedMentions: { parse: [] }
  });
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

function contentStudioDiscordError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function contentStudioTextChannel(guildId, channelId) {
  const guild = await getGuild(guildId);
  const normalizedChannelId = String(channelId || "").trim();
  if (!/^\d{16,22}$/.test(normalizedChannelId)) throw contentStudioDiscordError("invalid_channel_id");
  const channel = await guild.channels.fetch(normalizedChannelId).catch(() => null);
  if (
    !channel
    || channel.guildId !== guild.id
    || channel.isThread?.()
    || !channel.isTextBased?.()
    || !channel.messages?.fetch
  ) {
    throw contentStudioDiscordError("content_channel_not_found");
  }
  return { guild, channel };
}

export async function paradiseDiscordContentMessage(guildId, channelId, messageId, options = {}) {
  const normalizedMessageId = String(messageId || "").trim();
  if (!/^\d{16,22}$/.test(normalizedMessageId)) throw contentStudioDiscordError("invalid_message_id");
  const { channel } = await contentStudioTextChannel(guildId, channelId);
  const message = await channel.messages.fetch(normalizedMessageId).catch(() => null);
  if (!message) throw contentStudioDiscordError("content_message_not_found");
  return importParadiseDiscordMessage(message, { ...options, sourceGuildId: guildId });
}

async function managedContentStudioWebhook(channel) {
  if (typeof channel.fetchWebhooks !== "function" || typeof channel.createWebhook !== "function") {
    throw contentStudioDiscordError("managed_webhook_channel_unsupported");
  }
  const webhooks = await channel.fetchWebhooks();
  const existing = [...webhooks.values()].find(webhook =>
    webhook.name === "Paradise Content Studio"
    && webhook.owner?.id === client?.user?.id
    && webhook.token
  );
  if (existing) return existing;
  return channel.createWebhook({
    name: "Paradise Content Studio",
    reason: "Owner-approved Content Studio delivery in the isolated Paradise test guild"
  });
}

export async function publishParadiseContentMessage({
  guildId,
  channelId,
  messageId = null,
  payload,
  deliveryMode = "bot",
  webhookUrl = null
} = {}) {
  const policy = assertParadiseTestGuildMutation({ guildId, operation: "content_studio_publish" });
  const delivery = assertSafeParadiseContentDelivery({ deliveryMode, webhookUrl });
  const normalized = normalizeParadiseContentPayload(payload);
  const { guild, channel } = await contentStudioTextChannel(guildId, channelId);
  const normalizedMessageId = messageId ? String(messageId).trim() : null;
  if (normalizedMessageId && !/^\d{16,22}$/.test(normalizedMessageId)) {
    throw contentStudioDiscordError("invalid_message_id");
  }

  let result;
  let operation;
  if (delivery.deliveryMode === "bot") {
    if (typeof channel.send !== "function") throw contentStudioDiscordError("content_channel_not_sendable");
    if (normalizedMessageId) {
      const message = await channel.messages.fetch(normalizedMessageId).catch(() => null);
      if (!message) throw contentStudioDiscordError("content_message_not_found");
      if (message.webhookId || message.author?.id !== client?.user?.id) {
        throw contentStudioDiscordError("content_message_not_owned_by_bot");
      }
      result = await message.edit(normalized);
      operation = "edit";
    } else {
      result = await channel.send(normalized);
      operation = "send";
    }
  } else {
    const webhook = await managedContentStudioWebhook(channel);
    if (normalizedMessageId) {
      const message = await channel.messages.fetch(normalizedMessageId).catch(() => null);
      if (!message) throw contentStudioDiscordError("content_message_not_found");
      if (message.webhookId !== webhook.id) throw contentStudioDiscordError("content_message_not_owned_by_managed_webhook");
      result = await webhook.editMessage(normalizedMessageId, normalized);
      operation = "edit";
    } else {
      result = await webhook.send({ ...normalized, wait: true });
      operation = "send";
    }
  }

  await auditDiscordBotAction("discord_content_studio_published", "discord_message", result.id, {
    guildId: guild.id,
    channelId: channel.id,
    operation,
    deliveryMode: delivery.deliveryMode,
    testGuildPolicy: policy.code,
    embedCount: normalized.embeds.length,
    hasContent: Boolean(normalized.content)
  });
  return {
    success: true,
    guildId: guild.id,
    channelId: channel.id,
    messageId: result.id,
    operation,
    deliveryMode: delivery.deliveryMode,
    testGuildPolicy: policy.code
  };
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
  return createParadiseBackupEnvelope({
    status: "LIVE DISCORD VERIFIED",
    backupVersion: 1,
    capturedAt: new Date().toISOString(),
    guild: snapshot.guild,
    categories: snapshot.categories,
    channels: snapshot.channels,
    roles: snapshot.roles,
    autoModRules: snapshot.autoModRules,
    webhooks: snapshot.webhooks
  });
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
  const currentResources = [...guild.channels.cache.values()].filter(channel => !channel.isThread?.());
  const desiredCategories = selected.schema.map(([category]) => category);
  const desiredChannels = selected.schema.flatMap(([category, channelNames]) => channelNames.map(name => ({ category, name, type: paradiseSetupChannelType(category, name) })));
  const wrongChannelTypes = desiredChannels.flatMap(spec => currentResources
    .filter(channel => channel.name === spec.name && channel.type !== spec.type)
    .map(channel => ({ idMasked: maskDiscordId(channel.id), name: spec.name, actualType: channel.type, expectedType: spec.type })));
  const desiredRoles = new Set(selected.roles);
  return {
    status: "LIVE DISCORD VERIFIED",
    generatedAt: new Date().toISOString(),
    guildId: guild.id,
    guildName: guild.name,
    mode,
    templateLabel: selected.label,
    createResources: [
      ...desiredCategories.filter(name => !currentResources.some(channel => channel.type === ChannelType.GuildCategory && channel.name === name)),
      ...desiredChannels.filter(spec => !currentResources.some(channel => channel.name === spec.name && channel.type === spec.type)).map(spec => spec.name)
    ],
    keepResources: currentResources.filter(channel => desiredCategories.includes(channel.name) || desiredChannels.some(spec => spec.name === channel.name && spec.type === channel.type)).map(channel => ({ idMasked: maskDiscordId(channel.id), name: channel.name, type: channel.type })),
    extraResources: currentResources.filter(channel => !desiredCategories.includes(channel.name) && !desiredChannels.some(spec => spec.name === channel.name && spec.type === channel.type)).map(channel => ({ idMasked: maskDiscordId(channel.id), name: channel.name, type: channel.type })),
    wrongChannelTypes,
    createRoles: [...desiredRoles].filter(name => !guild.roles.cache.some(role => role.name === name)),
    keepRoles: [...desiredRoles].filter(name => guild.roles.cache.some(role => role.name === name)),
    warning: "Extra resources and wrong channel types are preview-only. Repair creates the correct type first; a wrong text/voice channel is never silently treated as valid. No deletion occurs without the exact per-server typed confirmation."
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

export async function paradiseTestLabPublicStatus() {
  let guild = null;
  if (client?.isReady?.()) {
    guild = client.guilds?.cache?.get?.(PARADISE_TEST_GUILD_ID)
      || await client.guilds?.fetch?.(PARADISE_TEST_GUILD_ID).catch(() => null)
      || null;
    if (guild && !guild.members?.me && typeof guild.members?.fetchMe === "function") {
      await guild.members.fetchMe().catch(() => null);
    }
  }
  return paradiseTestLabStatus(guild);
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
    if (LANGUAGE_ROLE_TYPES.has(type)) continue;
    if (type === "trial") continue;
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
  for (const [index, type] of Object.keys(roleSummary).entries()) {
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

  if (LANGUAGE_ROLE_TYPES.has(type)) {
    const error = new Error("discord_language_role_missing");
    error.code = "discord_language_role_missing";
    throw error;
  }

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
  const candidateNames = new Set([config.fallbackName, ...(config.aliases || [])]);
  return guild.roles.cache.find((role) => candidateNames.has(role.name)) || null;
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

export async function paradiseWebsiteApplicationFormContext(guildId, discordUserId, options = {}) {
  const guild = await getGuild(guildId);
  return paradiseWebsiteApplicationContext(guild, discordUserId, options);
}

export async function submitParadiseWebsiteApplicationForm(guildId, payload) {
  const guild = await getGuild(guildId);
  return submitParadiseWebsiteApplication(guild, payload);
}
