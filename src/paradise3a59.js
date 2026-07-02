import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder,
  ModalBuilder, PermissionsBitField, SlashCommandBuilder, StringSelectMenuBuilder,
  TextInputBuilder, TextInputStyle,
  AutoModerationActionType, AutoModerationRuleEventType, AutoModerationRuleTriggerType
} from "discord.js";

export const PARADISE_TEST_GUILD_ID = "1520519015661961257";
export const DEFAULT_PARADISE_BRAND_COLOR = "#000000";
const LEVELS = ["Low", "Mid", "High"];
const STRENGTHS = ["Weak", "Stable", "Strong"];
const verificationChallenges = new Map();
const verifiedProfiles = new Map();
const pendingTryouts = new Map();
const pendingChallenges = new Map();
const challengeDrafts = new Map();
const activeTrainings = new Map();
const activeTournaments = new Map();
const staffTeamRefreshTimers = new Map();
const paradiseGuildContext = new AsyncLocalStorage();
const PROFILE_STORE = path.resolve(process.cwd(), "artifacts", "post-security-backlog", "3a59-verified-roblox-profiles.json");
const STATE_KEY = "paradise_3a59_state_v1";
const EMPTY_STATE = Object.freeze({
  profiles: {}, verificationChallenges: {}, pendingTryouts: {}, pendingChallenges: {}, trainings: {},
  tournaments: {}, leaderboard: {}, leaderboards: {}, staffActivity: {}, activityChecks: {},
  whitelists: {}, giveaways: {}, rsvps: {}, relations: {}, loa: {},
  config: {}, guildConfigs: {}, ticketOptOuts: {}, transcripts: {},
  rosters: {}, lineups: {}, blacklists: {}, appeals: {}, bails: {}
});

function normalizeState(value) {
  const input = value && typeof value === "object" ? value : {};
  return Object.fromEntries(Object.keys(EMPTY_STATE).map(key => [
    key, input[key] && typeof input[key] === "object" ? input[key] : {}
  ]));
}

function configForGuild(state, guildId) {
  return state.guildConfigs?.[String(guildId || "")] || state.config || {};
}

function belongsToGuild(record, guildId) {
  return record?.guildId ? record.guildId === guildId : guildId === PARADISE_TEST_GUILD_ID;
}

function guildUserKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function guildUserRecord(bucket, guildId, userId) {
  return bucket?.[guildUserKey(guildId, userId)]
    || (guildId === PARADISE_TEST_GUILD_ID ? bucket?.[userId] : null)
    || null;
}

function leaderboardForGuild(state, guildId) {
  return state.leaderboards?.[String(guildId || "")]
    || (guildId === PARADISE_TEST_GUILD_ID ? state.leaderboard : {})
    || {};
}

function ensureLeaderboardForGuild(state, guildId) {
  state.leaderboards[guildId] = state.leaderboards[guildId]
    || (guildId === PARADISE_TEST_GUILD_ID ? structuredClone(state.leaderboard || {}) : {});
  return state.leaderboards[guildId];
}

async function loadState() {
  try {
    const { prisma } = await import("./db.js");
    const row = await prisma.setting.findUnique({ where: { key: STATE_KEY } });
    if (row?.value) return normalizeState(row.value);
  } catch {}
  try { return normalizeState(JSON.parse(await fs.readFile(PROFILE_STORE, "utf8"))); } catch { return normalizeState({}); }
}

async function saveState(mutator) {
  const current = await loadState();
  const next = normalizeState(await mutator(current) || current);
  try {
    const { prisma } = await import("./db.js");
    await prisma.setting.upsert({ where: { key: STATE_KEY }, update: { value: next }, create: { key: STATE_KEY, value: next } });
  } catch {
    await writeArtifact("3a59-paradise-state-fallback.json", next);
  }
  return next;
}

export function normalizeParadiseBrandColor(value, fallback = DEFAULT_PARADISE_BRAND_COLOR) {
  const normalized = String(value || "").trim().replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? `#${normalized}` : fallback;
}

export function paradiseBrandColorInteger(value) {
  return Number.parseInt(normalizeParadiseBrandColor(value).slice(1), 16);
}

async function paradiseBrandColor() {
  const state = await loadState();
  return paradiseBrandColorInteger(configForGuild(state, paradiseGuildContext.getStore()).brandColor);
}

function paradiseFooter(context = "") {
  return { text: `${context ? `${context} • ` : ""}Made by Paradise bot` };
}

export const PARADISE_CLAN_ROLES = [
  "Owner", "Admin", "Overseer", "Community Manager", "Training Manager",
  "Administration Manager", "Head Admin", "Senior Admin", "Moderator Manager",
  "Head Moderator", "Senior Moderator", "Moderator", "Helper",
  "Trial Training Manager", "Training Supervisor", "Experienced Training Hoster",
  "Training Hoster", "Trial Training Hoster", "Tryout Manager",
  "Experienced Tryout Hoster", "Tryout Hoster",
  "Tournament Manager", "Event Manager", "Giveaway Manager",
  "Game Night Manager", "Referee Manager", "Head Referee",
  "Experienced Referee", "Referee", "Trial Referee", "War Hoster",
  "Tryout Staff", "Trial Tryout Staff", "Coach / Helper",
  "Verified Fighter", "Media & Links Approved", "Training Ping",
  "Tryout Ping", "Referee Ping", "Spar Ping", "Tournament Ping", "Event Ping",
  "Giveaway Ping", "Game Night Ping", "Staff Updates", "Server Updates",
  "Turkish", "English", "Activity Whitelist", "LOA", "Muted / Quarantined",
  "Frankfurt, Germany", "Paris, France", "London, United Kingdom", "Amsterdam, Netherlands",
  "The Strongest Hero", "Hero Hunter", "Monster Form", "Destructive Cyborg",
  "Deadly Ninja", "Brutal Demon", "Blade Master", "Wild Psychic", "Martial Artist", "Tech Prodigy",
  "Top Player 1-10", "Top Player 11-20", "Top Player 21-30", "Top Player", "Retired Top Player",
  ...Array.from({ length: 30 }, (_, index) => `Top ${index + 1}`),
  ...Array.from({ length: 5 }, (_, stage) =>
    ["Low", "Mid", "High"].flatMap(level =>
      ["Weak", "Stable", "Strong"].map(strength => `Stage ${stage} ${level} ${strength}`)
    )
  ).flat()
];

export const PARADISE_COMMUNITY_ROLES = [
  "Owner", "Admin", "Manager", "Moderator", "Support Staff", "Trial Support",
  "Bot Manager", "Developer", "Buyer", "Trial User", "Lifetime Buyer",
  "Creator", "Partner / Reseller", "Media & Links Approved", "Verified",
  "Update Ping", "Training Ping", "Tournament Ping", "Giveaway Ping",
  "Event Ping", "Game Night Ping", "Security Alert Ping", "Robux Payment Ping",
  "Turkish", "English", "LOA", "Muted / Quarantined"
];

export const PARADISE_ROLES = PARADISE_CLAN_ROLES;

export const PARADISE_CHANNEL_MAPPINGS = Object.freeze([
  ["challenge_channel", "Challenge create panel"],
  ["challenge_rules_channel", "Challenge rules"],
  ["challenge_results_channel", "Challenge results"],
  ["availability_channel", "Availability board"],
  ["loa_channel", "LOA board"],
  ["tryout_channel", "Tryout announcements"],
  ["tryout_results_channel", "Tryout results"],
  ["training_channel", "Training announcements"],
  ["training_results_channel", "Training results"],
  ["referee_works_channel", "Referee works"],
  ["activity_logs_channel", "Activity logs"],
  ["activity_check_channel", "Activity checks"],
  ["relation_panel_channel", "Relations board"],
  ["role_guide_channel", "Role guide"],
  ["faq_channel", "FAQ and trust"],
  ["staff_report_channel", "Staff reports"],
  ["support_ticket_channel", "Support ticket panel"],
  ["application_ticket_channel", "Application ticket panel"],
  ["challenge_transcripts_channel", "Private challenge transcripts"],
  ["support_transcripts_channel", "Private support transcripts"],
  ["roster_channel", "EU roster board"],
  ["main_lineup_channel", "Main lineup board"],
  ["war_lineup_channel", "War lineup board"],
  ["mainer_proof_channel", "Mainer proof review"],
  ["blacklist_channel", "Blacklist board"],
  ["blacklist_appeal_channel", "Private blacklist appeals"],
  ["bail_appeal_channel", "Private bail reviews"],
  ["blacklist_logs_channel", "Private blacklist logs"],
  ["roster_logs_channel", "Private roster logs"],
  ["war_logs_channel", "Private war and lineup logs"]
]);

export const PARADISE_COMMUNITY_SCHEMA = [
  ["START HERE", ["welcome", "rules", "choose-language", "choose-pings", "role-selection", "command-guide", "how-to-get-key", "official-downloads", "security-and-trust"], false],
  ["IMPORTANT", ["announcements", "updates", "status", "faq", "pricing", "trial-info", "giveaways"], false],
  ["SUPPORT", ["open-ticket", "support-info"], false],
  ["SUPPORT STAFF", ["ticket-logs", "transcripts", "staff-notes"], true],
  ["FIMA APP", ["fima-macro", "macro-help", "update-help", "license-help", "hwid-help", "payment-help", "robux-payments", "bug-reports", "suggestions"], false],
  ["COMMUNITY", ["general", "media", "uploads", "clips", "outfits", "capes", "macro-discussion", "success-results", "creator-resources", "partnerships", "media-approval", "bot-commands"], false],
  ["TRAINING & EVENTS", ["training-announcements", "training-results", "event-announcements", "event-results", "tournament-announcements", "tournament-results", "game-night"], false],
  ["STAFF", ["staff-chat", "staff-logs", "moderation-logs", "activity-logs", "application-reviews", "bot-logs"], true]
];

export const PARADISE_CLAN_SCHEMA = [
  ["START", ["welcome", "rules", "verify", "profile-guide", "choose-language", "choose-pings", "command-guide", "role-guide", "maining-guide"], false],
  ["CLAN", ["announcements", "clan-relations", "ally-requests", "advertisement", "outfits", "capes", "main-line", "eu-rosters", "region-rosters", "branch-support", "roster-logs", "mainer-proof", "find-a-fcw"], false],
  ["TRYOUT & TRAINING", ["tryout", "tryout-results", "training", "training-results", "training-announcements", "tryout-hoster-rules", "training-hoster-rules", "hoster-guide", "hoster-works"], false],
  ["CHALLENGES", ["challenge-ticket", "challenge-rules", "availability", "challenges", "challenge-results", "challenge-ticket-transcripts", "referee-guide", "referee-post", "referee-works"], false],
  ["EVENTS", ["tournaments", "tournament-results", "events", "giveaways", "game-night"], false],
  ["SUPPORT", ["support-ticket", "application-ticket", "report-staff", "report-guide"], false],
  ["STAFF", ["staff-annc", "staff-chat", "activity-check", "activity-review", "referee-logs", "bot-logs", "loa"], true],
  ["VOICE", ["war-vc-text", "Stage", "War VC", "Voice 1", "Voice 2", "Voice 3"], false]
];

export const PARADISE_TSBTR_SCHEMA = [
  ["LOGS", ["challenge-ticket-transcripts", "support-ticket-transcripts", "message-logs", "role-logs", "channel-logs", "nick-logs", "ban-unban-logs", "kick-logs", "mod-logs", "member-logs", "other-logs", "guide"], true],
  ["ADMIN", ["staff-annc", "staff-chat", "staff-works", "staff-rules", "staff-updates", "staff-strikes", "proofs", "referee-logs", "activity-review"], true],
  ["CENTER", ["welcome", "blacklist", "ban-appeal", "unblacklist", "staff-team", "role-guide", "command-guide", "overview", "report-guide"], false],
  ["IMPORTANT", ["rules", "announcements", "sub-announcements", "content-channel", "server-logs", "staff-logs", "applications", "boosts", "giveaways", "polls", "hall-of-shame", "hall-of-fame"], false],
  ["TRYOUT & TRAINING", ["tryout", "tryout-results", "training", "training-results", "training-announcements", "training-hoster-announcements", "training-hoster-rules", "trainer-annc", "activity-check"], false],
  ["TICKET", ["challenge-ticket", "support-ticket", "payment-ticket", "bug-ticket", "macro-ticket", "application-ticket", "report-staff"], false],
  ["GENERAL", ["tr-chat", "chat", "media", "bot-commands", "teamer-help", "spar-request"], false],
  ["LEADERBOARD", ["top-10", "top-20", "top-30", "challenge-rules", "set-rules", "availability", "challenges", "challenge-results"], false],
  ["HOSTER", ["global-hoster-annc", "hoster-activity-check", "tryouter-annc", "hoster-trainer-annc", "tryout-hoster-rules", "training-hoster-rules", "tryout-hoster-guide", "training-hoster-guide", "hoster-chat", "hoster-works", "hoster-strikes", "hoster-reports", "loa"], true],
  ["REFEREES", ["referee-annc", "referee-chat", "referee-rules", "referee-post", "referee-updates", "referee-works", "referee-guide", "referee-strikes", "referee-activity-check"], true],
  ["CLAN OPERATIONS", ["maining-guide", "mainer-proof", "war-announcements", "war-line-chat", "war-scores", "eu-rosters", "roster-logs", "find-a-fcw"], true],
  ["VOICE", ["Stage", "Voice 1", "Voice 2", "Voice 3", "Voice 4", "Voice 5"], false]
];

export const PARADISE_SETUP_SCHEMAS = Object.freeze({
  community: { label: "Fieel's Community", schema: PARADISE_COMMUNITY_SCHEMA, roles: PARADISE_COMMUNITY_ROLES },
  clan: { label: "Paradise Clan", schema: PARADISE_CLAN_SCHEMA, roles: PARADISE_CLAN_ROLES },
  tsbtr: { label: "TSBTR-style Community", schema: PARADISE_TSBTR_SCHEMA, roles: PARADISE_CLAN_ROLES }
});

export function rankPower({ stage, level, strength }) {
  const s = Number(stage);
  const li = LEVELS.indexOf(String(level));
  const si = STRENGTHS.indexOf(String(strength));
  if (!Number.isInteger(s) || s < 0 || s > 4 || li < 0 || si < 0) throw new Error("invalid_rank");
  return (4 - s) * 9 + li * 3 + si;
}

export function compareRanks(a, b) {
  return Math.sign(rankPower(a) - rankPower(b));
}

export function canAssignRank(staffRank, targetRank) {
  const minimum = rankPower({ stage: 3, level: "Low", strength: "Weak" });
  const target = rankPower(targetRank);
  return target >= minimum && target <= rankPower(staffRank);
}

export function rankToRoleName(rank) {
  rankPower(rank);
  return `Stage ${rank.stage} ${rank.level} ${rank.strength}`;
}

export function challengeTargetSpots(currentSpot, config = {}) {
  const spot = Number(currentSpot);
  const topSize = Math.min(100, Math.max(2, Number(config.topSize) || 30));
  if (!Number.isInteger(spot) || spot < 1 || spot > topSize) return [topSize - 1, topSize];
  const distance = spot <= 10
    ? Math.max(1, Number(config.top10Range) || 1)
    : spot <= 20
      ? Math.max(1, Number(config.top20Range) || 2)
      : Math.max(1, Number(config.top30Range) || 3);
  return Array.from({ length: distance }, (_, index) => spot - distance + index)
    .filter(target => target >= 1 && target < spot);
}

export function paradiseCommands() {
  const setupAction = option => option.setName("action").setDescription("Preview, non-destructive repair, or guide repost")
    .addChoices(
      { name: "Preview rebuild", value: "preview" },
      { name: "Repair existing structure", value: "repair" },
      { name: "Repost handbooks only", value: "guides" }
    );
  const rankOptions = (builder) => builder
    .addIntegerOption(o => o.setName("stage").setDescription("0 is best; Stage 5 is unused").setRequired(true)
      .addChoices(...[0, 1, 2, 3, 4].map(value => ({ name: `Stage ${value}`, value }))))
    .addStringOption(o => o.setName("level").setDescription("Rank level").setRequired(true)
      .addChoices(...LEVELS.map(value => ({ name: value, value }))))
    .addStringOption(o => o.setName("strength").setDescription("Rank strength").setRequired(true)
      .addChoices(...STRENGTHS.map(value => ({ name: value, value }))));
  return [
    new SlashCommandBuilder().setName("setupfieels").setDescription("Choose Community, Clan or TSBTR-style safe setup.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder().setName("setupfieelstsbtr").setDescription("Preview, repair or repost the TSBTR-style setup.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addStringOption(setupAction),
    new SlashCommandBuilder().setName("help").setDescription("Open the Paradise Community or Clan command guide."),
    new SlashCommandBuilder().setName("sendlanguagequestion").setDescription("Post English/Turkish language buttons."),
    new SlashCommandBuilder().setName("sendpingroleselector").setDescription("Post Paradise notification-role selector."),
    new SlashCommandBuilder().setName("backupserverstructure").setDescription("Back up channels, roles and permission overwrites.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder().setName("previewserversetup").setDescription("Preview the full Clan/Training rebuild.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder().setName("verifyroblox").setDescription("Verify Roblox ownership with a profile About code.")
      .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true)),
    new SlashCommandBuilder().setName("verifyrobloxcheck").setDescription("Check the short Paradise code in your Roblox About."),
    new SlashCommandBuilder().setName("profile").setDescription("Create or view a verified Paradise fighter profile")
      .setDescriptionLocalizations({ tr: "Doğrulanmış Paradise oyuncu profili oluştur, düzenle veya görüntüle" })
      .addSubcommand(s => s.setName("create").setDescription("Verify Roblox and create your fighter profile"))
      .addSubcommand(s => s.setName("view").setDescription("View a Paradise fighter profile")
        .addUserOption(o => o.setName("user").setDescription("Profile owner; defaults to you")))
      .addSubcommand(s => s.setName("edit").setDescription("Edit your profile region without changing Profile ID"))
      .addSubcommand(s => s.setName("verify-status").setDescription("Show your Roblox verification and profile-completion status")),
    new SlashCommandBuilder().setName("tryout").setNameLocalizations({ tr: "deneme" }).setDescription("Paradise tryout system").setDescriptionLocalizations({ tr: "Paradise deneme ve sonuç sistemi" })
      .addSubcommand(s => s.setName("start").setDescription("Start a tryout")
        .addStringOption(o => o.setName("link").setDescription("Roblox private server link").setRequired(true))
        .addBooleanOption(o => o.setName("ping").setDescription("Ping tryout/training members").setRequired(false)))
      .addSubcommand(s => rankOptions(s.setName("result").setDescription("Submit a structured tryout result")
        .addUserOption(o => o.setName("user").setDescription("Verified fighter").setRequired(true)))
        .addStringOption(o => o.setName("note").setDescription("Optional note").setRequired(false))),
    new SlashCommandBuilder().setName("challenge").setNameLocalizations({ tr: "meydan-okuma" }).setDescription("Verified Paradise challenge system").setDescriptionLocalizations({ tr: "Doğrulanmış Paradise meydan okuma sistemi" })
      .addSubcommand(s => s.setName("create").setDescription("Create a verified challenge ticket")
        .addUserOption(o => o.setName("opponent").setDescription("Verified opponent; omit to choose from eligible ranks"))
        .addStringOption(o => o.setName("region").setDescription("Match region").setRequired(false)
          .addChoices(...["Paris", "London", "Amsterdam", "Frankfurt"].map(value => ({ name: value, value })))))
      .addSubcommand(s => s.setName("result").setDescription("Submit a challenge result for approval")
        .addUserOption(o => o.setName("winner").setDescription("Winner").setRequired(true))
        .addUserOption(o => o.setName("loser").setDescription("Loser").setRequired(true))
        .addStringOption(o => o.setName("score").setDescription("Score, e.g. 10-4 or Auto").setRequired(true)))
      .addSubcommand(s => s.setName("post").setDescription("Post a referee score for manager approval")
        .addUserOption(o => o.setName("winner").setDescription("Winner").setRequired(true))
        .addUserOption(o => o.setName("loser").setDescription("Loser").setRequired(true))
        .addStringOption(o => o.setName("score").setDescription("Score, e.g. 10-5 or Auto").setRequired(true))
        .addIntegerOption(o => o.setName("winner_spot").setDescription("Winner leaderboard spot").setMinValue(1).setMaxValue(30))
        .addIntegerOption(o => o.setName("loser_spot").setDescription("Loser leaderboard spot").setMinValue(1).setMaxValue(30))
        .addStringOption(o => o.setName("note").setDescription("Optional referee note"))
        .addStringOption(o => o.setName("ticket_id").setDescription("Challenge ticket ID")))
      .addSubcommand(s => s.setName("autowin").setDescription("Submit an in-ticket automatic win for approval")
        .addUserOption(o => o.setName("winner").setDescription("Automatic winner").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Dodged, no-show, invalid, disqualified or other").setRequired(true)
          .addChoices(
            { name: "Dodged", value: "dodged" },
            { name: "No-show", value: "no-show" },
            { name: "Invalid challenge", value: "invalid" },
            { name: "Disqualified", value: "disqualified" },
            { name: "Closed by staff", value: "closed" }
          ))
        .addStringOption(o => o.setName("note").setDescription("Optional staff note")))
      .addSubcommand(s => s.setName("close").setDescription("Close this challenge and remove player access")
        .addStringOption(o => o.setName("reason").setDescription("Closure reason").setRequired(true))),
    new SlashCommandBuilder().setName("paradisetraining").setNameLocalizations({ tr: "antrenman" }).setDescription("Paradise training lifecycle").setDescriptionLocalizations({ tr: "Paradise antrenman başlatma ve bitirme sistemi" })
      .addSubcommand(s => s.setName("start").setDescription("Start training")
        .addStringOption(o => o.setName("link").setDescription("Roblox private server link").setRequired(true))
        .addStringOption(o => o.setName("rules").setDescription("Extra rules").setRequired(false)))
      .addSubcommand(s => s.setName("end").setDescription("End training")
        .addStringOption(o => o.setName("score").setDescription("Score, e.g. 3-1").setRequired(true))
        .addStringOption(o => o.setName("winner").setDescription("Red, Blue or team name").setRequired(true))),
    new SlashCommandBuilder().setName("training").setDescription("Paradise training setup, start and result")
      .setDescriptionLocalizations({ tr: "Paradise eğitim kurulum, başlatma ve sonuç sistemi" })
      .addSubcommand(s => s.setName("setup").setDescription("Post the training help and announcement panel"))
      .addSubcommand(s => s.setName("start").setDescription("Start a branded training session")
        .addStringOption(o => o.setName("link").setDescription("Roblox private server link").setRequired(true))
        .addUserOption(o => o.setName("host").setDescription("Host; defaults to you"))
        .addUserOption(o => o.setName("cohost").setDescription("Optional co-host"))
        .addStringOption(o => o.setName("rules").setDescription("Optional extra rules")))
      .addSubcommand(s => s.setName("result").setDescription("End your active training and post its result")
        .addStringOption(o => o.setName("score").setDescription("Score, e.g. 3-1").setRequired(true))
        .addStringOption(o => o.setName("winner").setDescription("Red, Blue or team name").setRequired(true))
        .addStringOption(o => o.setName("mvps").setDescription("Mention MVPs or list names"))
        .addStringOption(o => o.setName("note").setDescription("Result note"))
        .addStringOption(o => o.setName("proof").setDescription("Proof image or message URL"))),
    new SlashCommandBuilder().setName("tournament").setNameLocalizations({ tr: "turnuva" }).setDescription("Paradise tournament system").setDescriptionLocalizations({ tr: "Paradise turnuva sistemi" })
      .addSubcommand(s => s.setName("start-simple").setDescription("Start a simple tournament")
        .addStringOption(o => o.setName("title").setDescription("Tournament title").setRequired(true))
        .addStringOption(o => o.setName("link").setDescription("Roblox server link").setRequired(true))
        .addStringOption(o => o.setName("rules").setDescription("Tournament rules"))
        .addStringOption(o => o.setName("prize").setDescription("Optional prize")))
      .addSubcommand(s => s.setName("result-simple").setDescription("Post a simple tournament winner")
        .addUserOption(o => o.setName("winner").setDescription("Winner").setRequired(true))
        .addStringOption(o => o.setName("proof").setDescription("Proof link").setRequired(true)))
      .addSubcommand(s => s.setName("create-bracket").setDescription("Create a stored elimination bracket")
        .addStringOption(o => o.setName("title").setDescription("Tournament title").setRequired(true))
        .addStringOption(o => o.setName("participants").setDescription("Comma-separated Discord user IDs").setRequired(true))
        .addStringOption(o => o.setName("link").setDescription("Roblox server link").setRequired(true)))
      .addSubcommand(s => s.setName("match-result").setDescription("Advance a bracket winner")
        .addStringOption(o => o.setName("tournament_id").setDescription("Tournament ID").setRequired(true))
        .addIntegerOption(o => o.setName("match").setDescription("Match number").setRequired(true).setMinValue(1))
        .addUserOption(o => o.setName("winner").setDescription("Match winner").setRequired(true))),
    new SlashCommandBuilder().setName("giveaway").setNameLocalizations({ tr: "cekilis" }).setDescription("Paradise giveaway operations").setDescriptionLocalizations({ tr: "Paradise çekiliş işlemleri" })
      .addSubcommand(s => s.setName("create").setDescription("Create a giveaway")
        .addStringOption(o => o.setName("prize").setDescription("Prize").setRequired(true))
        .addIntegerOption(o => o.setName("minutes").setDescription("Duration in minutes").setRequired(true).setMinValue(1).setMaxValue(43200))
        .addIntegerOption(o => o.setName("winners").setDescription("Winner count").setMinValue(1).setMaxValue(20))
        .addStringOption(o => o.setName("requirements").setDescription("Entry requirements"))),
    new SlashCommandBuilder().setName("gamenight").setNameLocalizations({ tr: "oyun-gecesi" }).setDescription("Paradise game night operations").setDescriptionLocalizations({ tr: "Paradise oyun gecesi işlemleri" })
      .addSubcommand(s => s.setName("start").setDescription("Start a game night")
        .addStringOption(o => o.setName("game").setDescription("Game name").setRequired(true))
        .addStringOption(o => o.setName("link").setDescription("Game/server link").setRequired(true))
        .addStringOption(o => o.setName("notes").setDescription("Rules or notes"))),
    new SlashCommandBuilder().setName("event").setNameLocalizations({ tr: "etkinlik" }).setDescription("Paradise event operations").setDescriptionLocalizations({ tr: "Paradise etkinlik işlemleri" })
      .addSubcommand(s => s.setName("create").setDescription("Create an event")
        .addStringOption(o => o.setName("title").setDescription("Event title").setRequired(true))
        .addStringOption(o => o.setName("time").setDescription("Time or Discord timestamp").setRequired(true))
        .addStringOption(o => o.setName("link").setDescription("Optional link"))
        .addStringOption(o => o.setName("rules").setDescription("Rules or details"))),
    new SlashCommandBuilder().setName("referee").setNameLocalizations({ tr: "hakem" }).setDescription("Paradise referee operations").setDescriptionLocalizations({ tr: "Paradise hakem işlemleri" })
      .addSubcommand(s => s.setName("guide").setDescription("Show the referee command and rules guide"))
      .addSubcommand(s => s.setName("works").setDescription("Show your weekly referee activity")),
    new SlashCommandBuilder().setName("activity").setNameLocalizations({ tr: "aktivite" }).setDescription("Staff activity and attendance").setDescriptionLocalizations({ tr: "Personel aktivite ve yoklama sistemi" })
      .addSubcommand(s => s.setName("check").setDescription("Start a 24-hour staff activity check")
        .addStringOption(o => o.setName("group").setDescription("Staff group").setRequired(true)
          .addChoices(...["Referee", "Tryout", "Training", "Event", "Tournament", "Giveaway", "Game Night"].map(value => ({ name: value, value })))))
      .addSubcommand(s => s.setName("summary").setDescription("Show weekly quota results")),
    new SlashCommandBuilder().setName("whitelist").setNameLocalizations({ tr: "muafiyet" }).setDescription("Manage temporary activity-check exemptions").setDescriptionLocalizations({ tr: "Geçici aktivite muafiyetlerini yönet" })
      .addSubcommand(s => s.setName("add").setDescription("Whitelist a staff member")
        .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true))
        .addStringOption(o => o.setName("group").setDescription("Staff group").setRequired(true))
        .addIntegerOption(o => o.setName("days").setDescription("Days; omit for unlimited").setMinValue(1).setMaxValue(365)))
      .addSubcommand(s => s.setName("remove").setDescription("Remove a whitelist")
        .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true)))
      .addSubcommand(s => s.setName("list").setDescription("List active whitelists")),
    new SlashCommandBuilder().setName("mainer").setDescription("Paradise clan mainer code and guide")
      .addSubcommand(s => s.setName("set").setDescription("Set the official clan mainer code")
        .addStringOption(o => o.setName("code").setDescription("TSBCC clan mainer code").setRequired(true)))
      .addSubcommand(s => s.setName("guide").setDescription("Show the current maining guide")),
    new SlashCommandBuilder().setName("report").setNameLocalizations({ tr: "rapor" }).setDescription("Report a staff member or hoster privately").setDescriptionLocalizations({ tr: "Personel veya hosteri özel olarak raporla" })
      .addSubcommand(s => s.setName("staff").setDescription("Open a private staff report")
        .addUserOption(o => o.setName("user").setDescription("Reported staff member").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("What happened").setRequired(true))
        .addStringOption(o => o.setName("proof").setDescription("Optional proof link"))),
    new SlashCommandBuilder().setName("findfcw").setNameLocalizations({ tr: "fcw-bul" }).setDescription("Find an opt-in clan war opponent.").setDescriptionLocalizations({ tr: "İzinli havuzdan FCW rakibi bul" })
      .addStringOption(o => o.setName("region").setDescription("EU, NA, AS, SA or OCE").setRequired(true))
      .addStringOption(o => o.setName("format").setDescription("Requested format, e.g. 5v5 FT3")),
    new SlashCommandBuilder().setName("commandchannel").setDescription("Configure where Paradise commands can run")
      .addSubcommand(s => s.setName("add").setDescription("Allow a command in this channel")
        .addStringOption(o => o.setName("command").setDescription("Command name without /").setRequired(true)))
      .addSubcommand(s => s.setName("remove").setDescription("Remove this channel from a command")
        .addStringOption(o => o.setName("command").setDescription("Command name without /").setRequired(true)))
      .addSubcommand(s => s.setName("list").setDescription("List command-channel restrictions")),
    new SlashCommandBuilder().setName("sticky").setDescription("Manage a repeating channel guide message")
      .addSubcommand(s => s.setName("set").setDescription("Set the sticky message for this channel")
        .addStringOption(o => o.setName("text").setDescription("Sticky text").setRequired(true).setMaxLength(1800)))
      .addSubcommand(s => s.setName("remove").setDescription("Remove this channel's sticky message"))
      .addSubcommand(s => s.setName("list").setDescription("List configured sticky channels")),
    new SlashCommandBuilder().setName("branding").setDescription("Configure Paradise embed appearance")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addSubcommand(s => s.setName("color").setDescription("Set the embed side-accent color")
        .addStringOption(o => o.setName("hex").setDescription("Six-digit HEX color, e.g. #000000").setRequired(true)))
      .addSubcommand(s => s.setName("preview").setDescription("Preview Paradise typography and symbols")),
    new SlashCommandBuilder().setName("relation").setDescription("Manage the Paradise ally and enemy clan board")
      .addSubcommand(s => s.setName("add").setDescription("Add an ally or enemy clan")
        .addStringOption(o => o.setName("type").setDescription("Relationship type").setRequired(true)
          .addChoices({ name: "Ally", value: "ally" }, { name: "Enemy", value: "enemy" }))
        .addStringOption(o => o.setName("clan").setDescription("Clan name").setRequired(true).setMaxLength(80))
        .addUserOption(o => o.setName("representative").setDescription("Clan representative"))
        .addStringOption(o => o.setName("invite").setDescription("Optional Discord invite"))
        .addStringOption(o => o.setName("note").setDescription("Optional note").setMaxLength(250)))
      .addSubcommand(s => s.setName("remove").setDescription("Remove a clan relationship")
        .addStringOption(o => o.setName("type").setDescription("Relationship type").setRequired(true)
          .addChoices({ name: "Ally", value: "ally" }, { name: "Enemy", value: "enemy" }))
        .addStringOption(o => o.setName("clan").setDescription("Clan name").setRequired(true)))
      .addSubcommand(s => s.setName("edit").setDescription("Edit an existing ally or enemy record")
        .addStringOption(o => o.setName("type").setDescription("Relationship type").setRequired(true)
          .addChoices({ name: "Ally", value: "ally" }, { name: "Enemy", value: "enemy" }))
        .addStringOption(o => o.setName("clan").setDescription("Existing clan name").setRequired(true))
        .addUserOption(o => o.setName("representative").setDescription("Updated representative"))
        .addStringOption(o => o.setName("invite").setDescription("Updated Discord invite"))
        .addStringOption(o => o.setName("note").setDescription("Updated note").setMaxLength(250))
        .addStringOption(o => o.setName("status").setDescription("Relationship status").setMaxLength(80)))
      .addSubcommand(s => s.setName("panel").setDescription("Refresh the ally and enemy clan board")),
    new SlashCommandBuilder().setName("availability").setDescription("Challenge cooldown, immunity and open-ticket board")
      .addSubcommand(s => s.setName("panel").setDescription("Refresh the challenge availability board"))
      .addSubcommand(s => s.setName("cooldown").setDescription("Set a player's challenge cooldown")
        .addUserOption(o => o.setName("user").setDescription("Player").setRequired(true))
        .addIntegerOption(o => o.setName("hours").setDescription("Duration in hours").setRequired(true).setMinValue(1).setMaxValue(720))
        .addIntegerOption(o => o.setName("rank").setDescription("Leaderboard rank").setMinValue(1).setMaxValue(30)))
      .addSubcommand(s => s.setName("immunity").setDescription("Set a player's challenge immunity")
        .addUserOption(o => o.setName("user").setDescription("Player").setRequired(true))
        .addIntegerOption(o => o.setName("hours").setDescription("Duration in hours").setRequired(true).setMinValue(1).setMaxValue(720))
        .addIntegerOption(o => o.setName("rank").setDescription("Leaderboard rank").setMinValue(1).setMaxValue(30)))
      .addSubcommand(s => s.setName("clear").setDescription("Clear cooldown or immunity")
        .addUserOption(o => o.setName("user").setDescription("Player").setRequired(true))
        .addStringOption(o => o.setName("type").setDescription("Entry to clear").setRequired(true)
          .addChoices({ name: "Cooldown", value: "cooldown" }, { name: "Immunity", value: "immunity" }))),
    new SlashCommandBuilder().setName("loa").setDescription("Staff leave-of-absence system")
      .setDescriptionLocalizations({ tr: "Yetkili izin ve LOA yönetim sistemi" })
      .addSubcommand(s => s.setName("request").setDescription("Request a leave of absence")
        .addIntegerOption(o => o.setName("days").setDescription("LOA duration").setRequired(true).setMinValue(1).setMaxValue(90))
        .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(500))
        .addStringOption(o => o.setName("evidence").setDescription("Optional evidence URL")))
      .addSubcommand(s => s.setName("end").setDescription("End your active LOA early"))
      .addSubcommand(s => s.setName("add").setDescription("Manager: add an approved LOA for a staff member")
        .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true))
        .addIntegerOption(o => o.setName("days").setDescription("LOA duration").setRequired(true).setMinValue(1).setMaxValue(365))
        .addStringOption(o => o.setName("note").setDescription("LOA note").setRequired(true).setMaxLength(500))
        .addStringOption(o => o.setName("evidence").setDescription("Optional evidence URL")))
      .addSubcommand(s => s.setName("approve").setDescription("Manager: approve a pending LOA")
        .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true)))
      .addSubcommand(s => s.setName("deny").setDescription("Manager: deny a pending LOA")
        .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Denial reason").setRequired(true)))
      .addSubcommand(s => s.setName("remove").setDescription("Manager: remove or end a LOA")
        .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Removal reason")))
      .addSubcommand(s => s.setName("panel").setDescription("Refresh the active LOA board")),
    new SlashCommandBuilder().setName("lineup").setDescription("Manage Paradise main and war lineup boards")
      .addSubcommand(s => s.setName("add").setDescription("Add a member to a lineup")
        .addStringOption(o => o.setName("board").setDescription("Lineup board").setRequired(true).addChoices({ name: "Main lineup", value: "main" }, { name: "War lineup", value: "war" }))
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addIntegerOption(o => o.setName("position").setDescription("Optional display position").setMinValue(1).setMaxValue(50))
        .addStringOption(o => o.setName("role").setDescription("Lineup duty or role").setMaxLength(80))
        .addStringOption(o => o.setName("note").setDescription("Optional private-safe board note").setMaxLength(160)))
      .addSubcommand(s => s.setName("remove").setDescription("Remove a member from a lineup")
        .addStringOption(o => o.setName("board").setDescription("Lineup board").setRequired(true).addChoices({ name: "Main lineup", value: "main" }, { name: "War lineup", value: "war" }))
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)))
      .addSubcommand(s => s.setName("move").setDescription("Move a lineup member")
        .addStringOption(o => o.setName("board").setDescription("Lineup board").setRequired(true).addChoices({ name: "Main lineup", value: "main" }, { name: "War lineup", value: "war" }))
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addIntegerOption(o => o.setName("position").setDescription("New display position").setRequired(true).setMinValue(1).setMaxValue(50)))
      .addSubcommand(s => s.setName("edit").setDescription("Edit a lineup member's role or note")
        .addStringOption(o => o.setName("board").setDescription("Lineup board").setRequired(true).addChoices({ name: "Main lineup", value: "main" }, { name: "War lineup", value: "war" }))
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addStringOption(o => o.setName("role").setDescription("Updated lineup duty or role").setMaxLength(80))
        .addStringOption(o => o.setName("note").setDescription("Updated board note").setMaxLength(160)))
      .addSubcommand(s => s.setName("clear").setDescription("Clear one lineup slot by position")
        .addStringOption(o => o.setName("board").setDescription("Lineup board").setRequired(true).addChoices({ name: "Main lineup", value: "main" }, { name: "War lineup", value: "war" }))
        .addIntegerOption(o => o.setName("position").setDescription("Slot to clear").setRequired(true).setMinValue(1).setMaxValue(50)))
      .addSubcommand(s => s.setName("panel").setDescription("Refresh a lineup board")
        .addStringOption(o => o.setName("board").setDescription("Lineup board").setRequired(true).addChoices({ name: "Main lineup", value: "main" }, { name: "War lineup", value: "war" })))
      .addSubcommand(s => s.setName("repost").setDescription("Update the existing lineup board in place")
        .addStringOption(o => o.setName("board").setDescription("Lineup board").setRequired(true).addChoices({ name: "Main lineup", value: "main" }, { name: "War lineup", value: "war" }))),
    new SlashCommandBuilder().setName("roster").setDescription("Manage the Paradise competitive roster")
      .addSubcommand(s => s.setName("add").setDescription("Add or update a roster member")
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addStringOption(o => o.setName("region").setDescription("Region").setRequired(true).addChoices({ name: "EU", value: "EU" }, { name: "NA", value: "NA" }, { name: "AS", value: "AS" }, { name: "SA", value: "SA" }, { name: "OCE", value: "OCE" }))
        .addStringOption(o => o.setName("rank").setDescription("Competitive rank or duty").setMaxLength(80))
        .addStringOption(o => o.setName("main").setDescription("Main character or role").setMaxLength(80))
        .addStringOption(o => o.setName("note").setDescription("Optional roster note").setMaxLength(160)))
      .addSubcommand(s => s.setName("update").setDescription("Update an existing roster member")
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addStringOption(o => o.setName("region").setDescription("Updated region").addChoices({ name: "EU", value: "EU" }, { name: "NA", value: "NA" }, { name: "AS", value: "AS" }, { name: "SA", value: "SA" }, { name: "OCE", value: "OCE" }))
        .addStringOption(o => o.setName("rank").setDescription("Updated competitive rank or duty").setMaxLength(80))
        .addStringOption(o => o.setName("main").setDescription("Updated main character or role").setMaxLength(80))
        .addStringOption(o => o.setName("note").setDescription("Updated roster note").setMaxLength(160)))
      .addSubcommand(s => s.setName("remove").setDescription("Remove a roster member")
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)))
      .addSubcommand(s => s.setName("panel").setDescription("Refresh the roster board"))
      .addSubcommand(s => s.setName("repost").setDescription("Update the existing roster board in place")),
    new SlashCommandBuilder().setName("blacklist").setDescription("Manage blacklist, appeal and owner-approved bail workflows")
      .addSubcommand(s => s.setName("add").setDescription("Add an audited blacklist record")
        .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(500))
        .addStringOption(o => o.setName("evidence").setDescription("Evidence URL")))
      .addSubcommand(s => s.setName("remove").setDescription("Resolve and remove a blacklist record")
        .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Resolution reason").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("status").setDescription("Privately check a user's blacklist status")
        .addUserOption(o => o.setName("user").setDescription("User; defaults to you")))
      .addSubcommand(s => s.setName("appeal-panel").setDescription("Post or refresh the appeal information panel"))
      .addSubcommand(s => s.setName("panel").setDescription("Refresh the public blacklist board")),
    new SlashCommandBuilder().setName("appeal").setDescription("Open or review a private Paradise blacklist appeal")
      .addSubcommand(s => s.setName("open").setDescription("Open your private blacklist appeal")
        .addStringOption(o => o.setName("reason").setDescription("Why the record should be reviewed").setRequired(true).setMaxLength(700))
        .addStringOption(o => o.setName("evidence").setDescription("Optional evidence URL").setMaxLength(500)))
      .addSubcommand(s => s.setName("approve").setDescription("Manager: approve an appeal")
        .addUserOption(o => o.setName("user").setDescription("Appealing user").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Decision note").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("deny").setDescription("Manager: deny an appeal")
        .addUserOption(o => o.setName("user").setDescription("Appealing user").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Decision note").setRequired(true).setMaxLength(500))),
    new SlashCommandBuilder().setName("bail").setDescription("Owner-managed blacklist bail review; never automatic")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
      .addSubcommand(s => s.setName("offer").setDescription("Create an owner-approved bail condition")
        .addUserOption(o => o.setName("user").setDescription("Blacklisted user").setRequired(true))
        .addStringOption(o => o.setName("condition").setDescription("Amount or non-payment condition").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("resolve").setDescription("Mark an offer resolved; does not auto-unblacklist")
        .addUserOption(o => o.setName("user").setDescription("Blacklisted user").setRequired(true))
        .addStringOption(o => o.setName("note").setDescription("Resolution note").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("deny").setDescription("Deny or cancel a bail offer")
        .addUserOption(o => o.setName("user").setDescription("Blacklisted user").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Decision reason").setRequired(true).setMaxLength(500))),
    (() => {
      const command = new SlashCommandBuilder().setName("set").setDescription("Map Paradise systems to Discord channels")
        .setDescriptionLocalizations({ tr: "Paradise sistemlerini Discord kanallarına eşle" });
      command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
      for (const [name, description] of PARADISE_CHANNEL_MAPPINGS.slice(0, 25)) {
        command.addSubcommand(subcommand => subcommand.setName(name).setDescription(description)
          .addChannelOption(option => option.setName("channel").setDescription(description).addChannelTypes(ChannelType.GuildText).setRequired(true)));
      }
      return command;
    })(),
    (() => {
      const command = new SlashCommandBuilder().setName("setlogchannel").setDescription("Map Paradise appeal, bail and private log channels")
        .setDescriptionLocalizations({ tr: "Paradise itiraz, bail ve özel log kanallarını eşle" });
      command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
      for (const [name, description] of PARADISE_CHANNEL_MAPPINGS.slice(25)) {
        command.addSubcommand(subcommand => subcommand.setName(name).setDescription(description)
          .addChannelOption(option => option.setName("channel").setDescription(description).addChannelTypes(ChannelType.GuildText).setRequired(true)));
      }
      return command;
    })(),
    new SlashCommandBuilder().setName("handbook").setDescription("Post or regenerate Paradise guide panels")
      .setDescriptionLocalizations({ tr: "Paradise rehber panellerini gönder veya yenile" })
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addSubcommand(s => s.setName("post").setDescription("Post all guides for a setup template")
        .addStringOption(o => o.setName("template").setDescription("Guide family").setRequired(true)
          .addChoices(
            { name: "Fieel's Community", value: "community" },
            { name: "Paradise Clan", value: "clan" },
            { name: "TSBTR-style", value: "tsbtr" }
          ))),
    new SlashCommandBuilder().setName("paradisehelp").setDescription("Show private English/Turkish command guidance.")
  ];
}

export async function initializeParadise(client) {
  await saveState(state => {
    if (state.config.blackThemeVersion !== 1) {
      state.config.brandColor = DEFAULT_PARADISE_BRAND_COLOR;
      state.config.blackThemeVersion = 1;
      state.config.blackThemeAppliedAt = new Date().toISOString();
    }
    return state;
  });
  if (client.user?.username !== "Paradise") {
    await client.user.setUsername("Paradise").catch(error => {
      console.warn("Paradise bot username update failed", { message: error.message });
    });
  }
  for (const guild of client.guilds.cache.values()) {
    await saveState(state => {
      state.guildConfigs[guild.id] = state.guildConfigs[guild.id] || structuredClone(state.config || {});
      return state;
    });
    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (me && me.nickname !== "Paradise") await me.setNickname("Paradise", "Paradise managed server identity").catch(() => {});
    await paradiseGuildContext.run(guild.id, () => runParadiseMaintenance(guild)).catch(() => {});
    const timer = setInterval(() => paradiseGuildContext.run(guild.id, () => runParadiseMaintenance(guild)).catch(() => {}), 15 * 60_000);
    timer.unref?.();
  }
}

function isOwner(interaction) {
  return interaction.guild?.ownerId === interaction.user.id;
}

async function writeArtifact(name, data) {
  const dir = path.resolve(process.cwd(), "artifacts", "post-security-backlog");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function loadProfileStore() {
  return (await loadState()).profiles;
}

async function saveVerifiedProfile(discordId, profile) {
  let saved = null;
  await saveState(state => {
    const existing = state.profiles[discordId] || {};
    saved = {
      ...existing,
      ...profile,
      discordUserId: discordId,
      createdAt: existing.createdAt || profile.verifiedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.profiles[discordId] = saved;
    return state;
  });
  await writeArtifact("3a59-verified-roblox-profiles.json", (await loadState()).profiles);
  return saved;
}

async function snapshotGuild(guild) {
  await guild.channels.fetch();
  await guild.roles.fetch();
  return {
    capturedAt: new Date().toISOString(), guildId: guild.id, guildName: guild.name,
    channels: [...guild.channels.cache.values()].map(c => ({
      id: c.id, name: c.name, type: c.type, parentId: c.parentId,
      position: c.rawPosition, permissionOverwrites: [...c.permissionOverwrites.cache.values()].map(p => p.toJSON())
    })),
    roles: [...guild.roles.cache.values()].map(r => ({
      id: r.id, name: r.name, position: r.position, color: r.color, permissions: r.permissions.bitfield.toString(), managed: r.managed
    }))
  };
}

async function setupChooser(interaction) {
  if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("paradise_setup_select:community").setLabel("Fieel's Community").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("paradise_setup_select:clan").setLabel("Paradise Clan").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("paradise_setup_select:tsbtr").setLabel("TSBTR-style").setStyle(ButtonStyle.Secondary)
  );
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ CHOOSE A SERVER SETUP")
      .setDescription("## ◆ Fieel's Community\nFima product, support, buyer and community server.\n\n## ◆ Paradise Clan\nFocused clan, training, challenge, relations and event server.\n\n## ◆ TSBTR-style\nLarge community/leaderboard structure kept as an optional future template.\n\n-# Every choice creates a backup and a second confirmation screen before destructive work.")
      .setFooter(paradiseFooter("Three independent setup templates"))],
    components: [row],
    ephemeral: true
  });
}

async function setupPreview(interaction, mode = "clan", update = false) {
  if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
  const selected = PARADISE_SETUP_SCHEMAS[mode];
  if (!selected) return interaction.reply({ content: "Unknown setup mode.", ephemeral: true });
  const snapshot = await snapshotGuild(interaction.guild);
  await writeArtifact("3a59-discord-test-server-backup.json", snapshot);
  const desiredNames = new Set(selected.schema.flatMap(([category, channels]) => [category, ...channels]));
  const existingNames = new Set(snapshot.channels.map(channel => channel.name));
  const createNames = [...desiredNames].filter(name => !existingNames.has(name));
  const extraNames = snapshot.channels.map(channel => channel.name).filter(name => !desiredNames.has(name));
  const missingRoles = selected.roles.filter(name => !snapshot.roles.some(role => role.name === name));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_setup_review:${mode}`).setLabel("Continue to final confirmation").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("paradise_setup_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );
  const payload = {
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`✦ ${selected.label} Setup Preview`)
      .setDescription(`## ◆ Backup complete\n- **Channels:** ${snapshot.channels.length}\n- **Roles:** ${snapshot.roles.length}\n\n## ◆ Selected template\n**${selected.label}** — ${selected.schema.length} categories, ${selected.schema.reduce((sum, [, channels]) => sum + channels.length, 0)} channels and ${selected.roles.length} roles.\n\n## ◆ Rebuild diff\n- **Create channels/categories:** ${createNames.length}\n- **Create roles:** ${missingRoles.length}\n- **Extra resources affected by rebuild:** ${extraNames.length}\n\n> ⚠️ **DANGER:** final rebuild removes extra non-managed resources. Repair mode preserves them.\n\n-# Test server only • Nothing changes until final typed confirmation.`)
      .addFields(
        { name: "Create preview", value: createNames.slice(0, 20).map(name => `\`${name}\``).join(", ") || "Nothing missing." },
        { name: "Potential removal preview", value: extraNames.slice(0, 20).map(name => `\`${name}\``).join(", ") || "No extra resources." },
        { name: "🛡️ __Safety boundary__", value: "**Hard-coded test guild only.** Backup + preview + typed confirmation are required; production is never targeted." }
      )
      .setFooter(paradiseFooter("Safe setup workflow"))],
    components: [row], ephemeral: true
  };
  return update ? interaction.update(payload) : interaction.reply(payload);
}

async function showSetupFinalConfirmation(interaction, mode) {
  if (!isOwner(interaction) || !PARADISE_SETUP_SCHEMAS[mode]) {
    return interaction.reply({ content: "Owner-only setup confirmation.", ephemeral: true });
  }
  const modal = new ModalBuilder().setCustomId(`paradise_setup_final:${mode}`).setTitle("Final destructive confirmation");
  const confirmation = new TextInputBuilder()
    .setCustomId("confirmation")
    .setLabel(`Type REBUILD ${mode.toUpperCase()}`)
    .setPlaceholder(`REBUILD ${mode.toUpperCase()}`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(confirmation));
  return interaction.showModal(modal);
}

async function handleSetupFinalConfirmation(interaction, mode) {
  const expected = `REBUILD ${mode.toUpperCase()}`;
  const supplied = interaction.fields.getTextInputValue("confirmation").trim().toUpperCase();
  if (supplied !== expected) {
    return interaction.reply({ content: `Confirmation did not match \`${expected}\`. Nothing was changed.`, ephemeral: true });
  }
  return applyServerSetup(interaction, mode, true);
}

async function handleSetupAction(interaction, mode) {
  const action = interaction.options.getString("action") || "preview";
  if (action === "repair" || action === "apply_missing_only") return applyServerSetup(interaction, mode, false);
  if (action === "guides") {
    if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const result = await publishAllGuides(interaction.guild, mode);
    return interaction.editReply(`Paradise handbooks regenerated: **${result.posted}** posts updated or created.`);
  }
  return setupPreview(interaction, mode);
}

const ROLE_PERMISSION_NAMES = Object.freeze({
  Owner: ["Administrator"],
  Admin: ["Administrator"],
  Overseer: ["ManageGuild", "ManageRoles", "ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "BanMembers", "ViewAuditLog"],
  "Administration Manager": ["ManageGuild", "ManageRoles", "ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  "Head Admin": ["ManageRoles", "ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  "Senior Admin": ["ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  "Moderator Manager": ["ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  "Head Moderator": ["ManageMessages", "ModerateMembers", "KickMembers"],
  "Senior Moderator": ["ManageMessages", "ModerateMembers"],
  Manager: ["ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  "Community Manager": ["ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  Moderator: ["ManageMessages", "ModerateMembers", "KickMembers"],
  "Support Staff": ["ManageMessages", "ModerateMembers"],
  "Bot Manager": ["ManageGuild", "ManageChannels", "ManageMessages"],
  "Training Manager": ["ManageChannels", "ManageMessages", "ModerateMembers"],
  "Tryout Manager": ["ManageChannels", "ManageMessages", "ModerateMembers"],
  "Tournament Manager": ["ManageChannels", "ManageMessages"],
  "Event Manager": ["ManageChannels", "ManageMessages"],
  "Giveaway Manager": ["ManageChannels", "ManageMessages"],
  "Game Night Manager": ["ManageChannels", "ManageMessages"],
  "Referee Manager": ["ManageChannels", "ManageMessages", "ModerateMembers"],
  "Head Referee": ["ManageMessages"],
  "Experienced Referee": ["ManageMessages"]
});

const PRIVATE_ACCESS_ROLES = new Set([
  "Owner", "Admin", "Overseer", "Manager", "Community Manager", "Moderator",
  "Administration Manager", "Head Admin", "Senior Admin", "Moderator Manager", "Head Moderator", "Senior Moderator",
  "Support Staff", "Bot Manager", "Training Manager", "Tryout Manager",
  "Tournament Manager", "Event Manager", "Giveaway Manager", "Game Night Manager",
  "Referee Manager", "Head Referee", "Experienced Referee", "Referee", "Trial Referee",
  "Training Supervisor", "Experienced Training Hoster", "Training Hoster", "Trial Training Hoster",
  "Tryout Manager", "Experienced Tryout Hoster", "Tryout Hoster", "Tryout Staff", "Trial Tryout Staff",
  "War Hoster"
]);

function rolePermissions(name) {
  return (ROLE_PERMISSION_NAMES[name] || [])
    .map(permission => PermissionsBitField.Flags[permission])
    .filter(Boolean);
}

async function ensureRole(guild, name, applyPermissions = false) {
  let role = guild.roles.cache.find(item => item.name === name);
  const permissions = rolePermissions(name);
  if (!role) {
    role = await guild.roles.create({ name, permissions, reason: "3A59 Paradise setup" });
  } else if (applyPermissions && role.editable && !role.managed) {
    await role.setPermissions(permissions, "3A59 Paradise permission template").catch(() => {});
  }
  return role;
}

async function organizeRoleHierarchy(guild, roleNames) {
  const me = guild.members.me || await guild.members.fetchMe();
  const highestAllowed = Math.max(1, me.roles.highest.position - 1);
  const positions = roleNames
    .map((name, index) => ({
      role: guild.roles.cache.find(item => item.name === name),
      position: Math.max(1, highestAllowed - index)
    }))
    .filter(item => item.role?.editable && !item.role.managed);
  if (positions.length) await guild.roles.setPositions(positions).catch(() => {});
}

async function ensureParadiseAutoMod(guild) {
  const rules = await guild.autoModerationRules.fetch().catch(() => null);
  if (!rules) return { status: "unavailable" };
  const state = await loadState();
  const config = configForGuild(state, guild.id).automod || {};
  if (config.enabled === false) {
    for (const rule of rules.values()) {
      if (rule.name.startsWith("Paradise ")) await rule.edit({ enabled: false, reason: "Paradise dashboard AutoMod disabled" }).catch(() => {});
    }
    return { status: "disabled" };
  }
  const exemptRoleIds = ["Owner", "Admin", "Overseer", "Media & Links Approved"]
    .map(name => guild.roles.cache.find(role => role.name === name)?.id).filter(Boolean);
  const logChannel = guild.channels.cache.find(channel => channel.name === "mod-logs");
  const actions = [{ type: AutoModerationActionType.BlockMessage, metadata: { customMessage: "That link is not allowed here. Use an approved media/ticket channel or ask staff." } }];
  if (logChannel) actions.push({ type: AutoModerationActionType.SendAlertMessage, metadata: { channel: logChannel.id } });
  const keywords = [];
  if (config.blockInvites !== false) keywords.push("*discord.gg/*", "*discord.com/invite/*", "*discordapp.com/invite/*");
  if (config.blockScamKeywords !== false) keywords.push("*free nitro*", "*steam gift*", "*claim reward*", "*verify account here*", "*limited gift*");
  if (keywords.length && ![...rules.values()].some(rule => rule.name === "Paradise Invite & Scam Link Guard")) {
    await guild.autoModerationRules.create({
      name: "Paradise Invite & Scam Link Guard",
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: {
        keywordFilter: keywords
      },
      actions, enabled: true, exemptRoles: exemptRoleIds,
      reason: "3A59 anti-scam and invite-link protection"
    });
  }
  if (![...rules.values()].some(rule => rule.name === "Paradise Mention Spam Guard")) {
    await guild.autoModerationRules.create({
      name: "Paradise Mention Spam Guard",
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.MentionSpam,
      triggerMetadata: { mentionTotalLimit: Math.min(50, Math.max(3, Number(config.mentionSpamLimit) || 8)), mentionRaidProtectionEnabled: true },
      actions,
      enabled: true,
      exemptRoles: exemptRoleIds,
      reason: "Paradise mention-spam protection"
    });
  }
  return { status: "configured", rules: [...rules.values()].length + 2 };
}

async function applyServerSetup(interaction, mode, destructive = true) {
  if (!isOwner(interaction) || interaction.guildId !== PARADISE_TEST_GUILD_ID) {
    return interaction.reply({ content: "Blocked: wrong guild or non-owner.", ephemeral: true });
  }
  const selected = PARADISE_SETUP_SCHEMAS[mode];
  if (!selected) return interaction.reply({ content: "Blocked: unknown setup template.", ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const snapshot = await snapshotGuild(interaction.guild);
  await writeArtifact("3a59-discord-test-server-backup.json", snapshot);
  for (const name of selected.roles) await ensureRole(interaction.guild, name, true);
  const desiredNames = new Set(selected.schema.flatMap(([category, channels]) => [category, ...channels]));
  for (const [categoryName, channelNames, privateCategory] of selected.schema) {
    let category = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === categoryName);
    if (!category) category = await interaction.guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory, reason: "3A59 Paradise setup" });
    if (privateCategory) {
      await category.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
      for (const roleName of selected.roles.filter(name => PRIVATE_ACCESS_ROLES.has(name))) {
        const role = interaction.guild.roles.cache.find(item => item.name === roleName);
        if (role) await category.permissionOverwrites.edit(role, { ViewChannel: true }).catch(() => {});
      }
    } else {
      await category.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: null }).catch(() => {});
    }
    const mutedRole = interaction.guild.roles.cache.find(item => item.name === "Muted / Quarantined");
    if (mutedRole) {
      await category.permissionOverwrites.edit(mutedRole, {
        SendMessages: false,
        AddReactions: false,
        Speak: false
      }).catch(() => {});
    }
    for (const channelName of channelNames) {
      let channel = interaction.guild.channels.cache.find(c => c.name === channelName);
      if (!channel) {
        const voice = categoryName === "VOICE" && channelName !== "war-vc-text";
        channel = await interaction.guild.channels.create({
          name: channelName, type: voice ? ChannelType.GuildVoice : ChannelType.GuildText,
          parent: category.id, reason: "3A59 Paradise setup"
        });
      } else if (channel.parentId !== category.id) await channel.setParent(category.id, { lockPermissions: privateCategory });
    }
  }
  const removableChannels = [...interaction.guild.channels.cache.values()]
    .filter(c => !desiredNames.has(c.name) && !c.isThread?.() && c.id !== interaction.channelId);
  const removableRoles = [...interaction.guild.roles.cache.values()]
    .filter(r => !r.managed && r.id !== interaction.guild.id && !selected.roles.includes(r.name));
  if (destructive) {
    for (const channel of removableChannels) await channel.delete("3A59 owner-confirmed test-server rebuild").catch(() => {});
    for (const role of removableRoles) await role.delete("3A59 owner-confirmed test-server rebuild").catch(() => {});
  }
  await organizeRoleHierarchy(interaction.guild, selected.roles);
  const autoMod = await ensureParadiseAutoMod(interaction.guild).catch(error => ({ status: "failed", error: error.message }));
  await publishAllGuides(interaction.guild, mode).catch(() => {});
  if (mode !== "community") {
    await updateRelationsPanel(interaction.guild).catch(() => {});
    await updateAvailabilityPanel(interaction.guild).catch(() => {});
    await updateLoaPanel(interaction.guild).catch(() => {});
  }
  await updateStaffTeamEmbed(interaction.guild).catch(() => {});
  await saveState(state => {
    state.guildConfigs[interaction.guildId] = state.guildConfigs[interaction.guildId] || structuredClone(state.config || {});
    const config = state.guildConfigs[interaction.guildId];
    config.activeSetupMode = mode;
    config.lastSetupRun = {
      mode,
      operation: destructive ? "rebuild" : "repair",
      completedAt: new Date().toISOString(),
      createdOrRepairedChannels: selected.schema.reduce((n, [, rows]) => n + rows.length, 0),
      preservedExtraChannels: destructive ? 0 : removableChannels.length,
      preservedExtraRoles: destructive ? 0 : removableRoles.length
    };
    config.autoActivityChecks = true;
    config.autoActivityRoleRemoval = true;
    config.weeklyQuotas = config.weeklyQuotas || WEEKLY_QUOTAS;
    if (interaction.guildId === PARADISE_TEST_GUILD_ID) state.config = structuredClone(config);
    return state;
  });
  await writeArtifact(`3a59-discord-${mode}-setup-live.json`, {
    status: "LIVE VERIFIED", completedAt: new Date().toISOString(), operation: destructive ? "rebuild" : "repair",
    guildId: interaction.guildId, template: selected.label, categories: selected.schema.length,
    channels: selected.schema.reduce((n, [, rows]) => n + rows.length, 0), roles: selected.roles.length,
    autoMod
  });
  return interaction.editReply(destructive
    ? `${selected.label} rebuild completed. Backup and final typed confirmation were recorded.`
    : `${selected.label} repair completed. No extra channel or role was deleted.`);
}

async function findRobloxUser(username) {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
  });
  const data = await res.json();
  return data.data?.[0] || null;
}

export function shortVerificationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "P";
  for (let index = 0; index < 5; index += 1) value += alphabet[crypto.randomInt(alphabet.length)];
  return value;
}

function verificationButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("paradise_verify_confirm").setLabel("I've added the code — Confirm").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("paradise_verify_retry").setLabel("New short code").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("paradise_verify_cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger)
  );
}

function verificationStartButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("paradise_verify_open").setLabel("Verify Roblox Account").setStyle(ButtonStyle.Primary)
  );
}

async function startVerification(interaction, username) {
  const user = await findRobloxUser(username);
  if (!user) return interaction.reply({ content: "Roblox user not found. Check the exact username and try again.", ephemeral: true });
  const code = shortVerificationCode();
  const state = await loadState();
  const expiryMinutes = Number(configForGuild(state, interaction.guildId).verification?.codeExpiryMinutes || 10);
  const challenge = {
    robloxId: String(user.id),
    username: user.name,
    code,
    expires: Date.now() + Math.min(30, Math.max(3, expiryMinutes)) * 60_000
  };
  verificationChallenges.set(interaction.user.id, challenge);
  await saveState(state => {
    state.verificationChallenges[interaction.user.id] = challenge;
    return state;
  });
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ ROBLOX VERIFICATION")
      .setDescription(`**Found:** ${user.name}\n\n## Step 1 — Copy this short code\n\`\`\`\n${code}\n\`\`\`\n## Step 2 — Add it to Roblox\nOpen your Roblox **About / Bio**, paste only this code and save.\n\n## Step 3 — Confirm\nPress the green button below. The code expires <t:${Math.floor(challenge.expires / 1000)}:R>.\n\n-# Short format is used to reduce Roblox text filtering. If it still becomes ####, request a new code.`)
      .setFooter(paradiseFooter("No screenshots accepted as automatic proof"))],
    components: [verificationButtons()],
    ephemeral: true
  });
}

async function verifyStart(interaction) {
  return startVerification(interaction, interaction.options.getString("username"));
}

async function verifyCheck(interaction) {
  const challenge = verificationChallenges.get(interaction.user.id)
    || (await loadState()).verificationChallenges[interaction.user.id];
  if (!challenge || challenge.expires < Date.now()) return interaction.reply({ content: "Start again with `/verifyroblox`.", ephemeral: true });
  const res = await fetch(`https://users.roblox.com/v1/users/${challenge.robloxId}`);
  const profile = await res.json();
  if (!String(profile.description || "").toUpperCase().includes(challenge.code)) {
    return interaction.reply({
      content: "Code not found in Roblox About yet. Save the profile, wait a few seconds, or use **New short code** if Roblox filtered it.",
      ephemeral: true
    });
  }
  const savedProfile = await saveVerifiedProfile(interaction.user.id, {
    robloxId: String(challenge.robloxId), robloxUsername: challenge.username, verifiedAt: new Date().toISOString()
  });
  verifiedProfiles.set(interaction.user.id, savedProfile);
  const role = await ensureRole(interaction.guild, "Verified Fighter");
  await interaction.member.roles.add(role);
  verificationChallenges.delete(interaction.user.id);
  await saveState(state => { delete state.verificationChallenges[interaction.user.id]; return state; });
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✓ ROBLOX VERIFIED")
      .setDescription(`Your Discord is now linked to **${challenge.username}**.\nYou can remove the code from your Roblox bio.\n\nPress **Create Fighter Profile** to choose your region.`)
      .setFooter(paradiseFooter("Identity verified"))],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("paradise_profile_create").setLabel("Create Fighter Profile").setStyle(ButtonStyle.Success)
    )],
    ephemeral: true
  });
}

async function verifiedProfile(discordId) {
  if (verifiedProfiles.has(discordId)) return verifiedProfiles.get(discordId);
  const profile = (await loadProfileStore())[discordId] || null;
  if (!profile) return null;
  verifiedProfiles.set(discordId, profile);
  return profile;
}

async function completedProfile(discordId) {
  const profile = await verifiedProfile(discordId);
  return profile?.profileId && profile?.region ? profile : null;
}

function fighterRank(member) {
  const ranks = [...member.roles.cache.values()].map(role => {
    const match = /^Stage ([0-4]) (Low|Mid|High) (Weak|Stable|Strong)$/.exec(role.name);
    return match ? { stage: Number(match[1]), level: match[2], strength: match[3] } : null;
  }).filter(Boolean).sort((a, b) => rankPower(b) - rankPower(a));
  return ranks[0] ? rankToRoleName(ranks[0]) : "Unranked";
}

async function robloxHeadshot(robloxId) {
  const response = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=150x150&format=Png&isCircular=false`).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json().catch(() => ({}));
  return payload.data?.[0]?.imageUrl || null;
}

async function profileEmbed(guild, discordId) {
  const profile = await completedProfile(discordId);
  if (!profile) return null;
  const member = await guild.members.fetch(discordId).catch(() => null);
  const rank = member ? fighterRank(member) : "Unranked";
  const thumbnail = await robloxHeadshot(profile.robloxId);
  const state = await loadState();
  const topSpot = leaderboardForGuild(state, guild.id)[discordId]?.spot || null;
  const createdAt = Math.floor(new Date(profile.createdAt || profile.verifiedAt || Date.now()).getTime() / 1000);
  const updatedAt = Math.floor(new Date(profile.updatedAt || profile.profileUpdatedAt || profile.verifiedAt || Date.now()).getTime() / 1000);
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ PARADISE FIGHTER PROFILE")
    .setDescription(`## ${member || `<@${discordId}>`}\n-# Verified Roblox identity`)
    .addFields(
      { name: "Profile ID", value: `\`#${profile.profileId}\``, inline: true },
      { name: "Roblox", value: `**${profile.robloxUsername}**`, inline: true },
      { name: "Region", value: `**${profile.region}**`, inline: true },
      { name: "Rank", value: `**${rank}**`, inline: false },
      { name: "Leaderboard", value: topSpot ? `**Rank #${topSpot}**` : "**Unranked**", inline: true },
      { name: "Verification", value: "✓ Roblox About code confirmed", inline: true },
      { name: "Created / Updated", value: `<t:${createdAt}:D> · <t:${updatedAt}:R>`, inline: false }
    )
    .setFooter(paradiseFooter("Rank updates automatically after approved tryout results"));
  if (thumbnail) embed.setThumbnail(thumbnail);
  return embed;
}

function profileRegionMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("paradise_profile_region").setPlaceholder("Choose your main server region")
      .addOptions(
        { label: "Frankfurt, Germany", value: "Frankfurt, Germany" },
        { label: "Paris, France", value: "Paris, France" },
        { label: "London, United Kingdom", value: "London, United Kingdom" },
        { label: "Amsterdam, Netherlands", value: "Amsterdam, Netherlands" }
      )
  );
}

async function beginProfileCreation(interaction) {
  const existing = await verifiedProfile(interaction.user.id);
  if (!existing) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("ROBLOX VERIFICATION REQUIRED")
        .setDescription("You must link your Roblox account before creating a Paradise fighter profile.")],
      components: [verificationStartButton()],
      ephemeral: true
    });
  }
  if (existing.profileId && existing.region) {
    const embed = await profileEmbed(interaction.guild, interaction.user.id);
    return interaction.reply({
      content: `You already have a Paradise fighter profile (ID: **#${existing.profileId}**).`,
      embeds: embed ? [embed] : [],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("paradise_profile_region_change").setLabel("Change Region").setStyle(ButtonStyle.Secondary)
      )],
      ephemeral: true
    });
  }
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ CHOOSE YOUR REGION")
      .setDescription("Choose the server region you normally use. Your rank is read from your full Stage–Level–Strength role.")],
    components: [profileRegionMenu()],
    ephemeral: true
  });
}

async function beginProfileRegionChange(interaction) {
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ CHANGE YOUR REGION")
      .setDescription("Choose your new main server region. Your Profile ID and verified Roblox account will stay unchanged.")],
    components: [profileRegionMenu()],
    ephemeral: true
  });
}

async function handleProfile(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "create") return beginProfileCreation(interaction);
  if (sub === "edit") {
    if (!await completedProfile(interaction.user.id)) return beginProfileCreation(interaction);
    return beginProfileRegionChange(interaction);
  }
  if (sub === "verify-status") {
    const profile = await verifiedProfile(interaction.user.id);
    const complete = Boolean(profile?.profileId && profile?.region);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ PROFILE VERIFICATION STATUS")
        .addFields(
          { name: "Roblox linked", value: profile?.robloxId ? "✓ Yes" : "✗ No", inline: true },
          { name: "Profile complete", value: complete ? "✓ Yes" : "✗ No", inline: true },
          { name: "Profile ID", value: profile?.profileId ? `#${profile.profileId}` : "Not assigned", inline: true },
          { name: "Region", value: profile?.region || "Not selected", inline: true }
        ).setFooter(paradiseFooter("Use /profile create or /profile edit"))],
      ephemeral: true
    });
  }
  const target = interaction.options.getUser("user") || interaction.user;
  const embed = await profileEmbed(interaction.guild, target.id);
  if (!embed) return interaction.reply({ content: `${target} has not completed a Paradise fighter profile.`, ephemeral: true });
  return interaction.reply({ embeds: [embed] });
}

async function handleProfileRegion(interaction) {
  const region = interaction.values[0];
  let saved = null;
  await saveState(state => {
    const current = state.profiles[interaction.user.id];
    if (!current) return state;
    if (!current.profileId) {
      state.config.nextProfileId = Number(state.config.nextProfileId || 100) + 1;
      current.profileId = state.config.nextProfileId;
    }
    current.region = region;
    current.profileUpdatedAt = new Date().toISOString();
    current.updatedAt = current.profileUpdatedAt;
    state.profiles[interaction.user.id] = current;
    saved = current;
    return state;
  });
  if (!saved) return interaction.reply({ content: "Verify Roblox first.", ephemeral: true });
  verifiedProfiles.set(interaction.user.id, saved);
  const embed = await profileEmbed(interaction.guild, interaction.user.id);
  return interaction.update({ embeds: [embed], components: [] });
}

async function handleVerifyModal(interaction) {
  const username = interaction.fields.getTextInputValue("roblox_username").trim();
  return startVerification(interaction, username);
}

function roleRank(member) {
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)
    || member.roles.cache.some(r => ["Owner", "Overseer", "Training Manager"].includes(r.name))) {
    return { stage: 0, level: "High", strength: "Strong" };
  }
  for (const role of member.roles.cache.values()) {
    const match = /^Stage ([0-4]) (Low|Mid|High) (Weak|Stable|Strong)$/.exec(role.name);
    if (match) return { stage: Number(match[1]), level: match[2], strength: match[3] };
  }
  if (member.roles.cache.some(r => ["Tryout Staff", "Trial Tryout Staff"].includes(r.name))) {
    return { stage: 3, level: "Low", strength: "Weak" };
  }
  return null;
}

async function assignRankRole(guild, member, rank) {
  const names = [];
  for (let stage = 0; stage <= 4; stage++) for (const level of LEVELS) for (const strength of STRENGTHS) {
    names.push(`Stage ${stage} ${level} ${strength}`);
  }
  const old = member.roles.cache.filter(r => names.includes(r.name));
  if (old.size) await member.roles.remove(old, "Paradise rank replacement");
  const role = await ensureRole(guild, rankToRoleName(rank));
  await member.roles.add(role, "Approved Paradise tryout result");
  return role;
}

async function handleTryout(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "start") {
    if (!roleRank(interaction.member)) return interaction.reply({ content: "Tryout Staff role required.", ephemeral: true });
    const link = interaction.options.getString("link");
    const sessionId = crypto.randomUUID();
    const session = { id: sessionId, guildId: interaction.guildId, type: "tryout", hosterId: interaction.user.id, link, status: "open", startedAt: new Date().toISOString() };
    activeTrainings.set(sessionId, session);
    await saveState(state => { state.trainings[sessionId] = session; return state; });
    const controls = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`paradise_session_locked:${sessionId}`).setLabel("SERVER LOCKED").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`paradise_session_end:${sessionId}`).setLabel("END TRYOUT").setStyle(ButtonStyle.Danger)
    );
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ TRYOUT OPEN")
      .setDescription(`# Tryout Time\n## ◆ Server\n[**Join the private server**](${link})\n\n## ◆ Format\n- **FT2** — one aggressive round\n- **FT2** — one passive round\n\n-# Winning alone does not guarantee a higher stage.`)
      .addFields(
        { name: "◇ Hoster", value: `${interaction.user}`, inline: true },
        { name: "◇ Evaluation", value: "**RC timing**, catches, dash reactions, movement, pressure, adaptation and game sense.", inline: false },
        { name: "◇ Rules", value: "- No LH / 3M1 reset / TDS\n- No 2 RC / wall / overpassive\n- No alts, queue hitting or leaving", inline: false }
      ).setFooter(paradiseFooter("Lock after 1–5 minutes • Hoster-only controls"))],
      components: [controls] });
  }
  const target = interaction.options.getUser("user");
  if (!await completedProfile(target.id)) return interaction.reply({ content: "Target must complete `/profile create` first.", ephemeral: true });
  const rank = {
    stage: interaction.options.getInteger("stage"),
    level: interaction.options.getString("level"),
    strength: interaction.options.getString("strength")
  };
  const authority = roleRank(interaction.member);
  if (!authority || !canAssignRank(authority, rank)) {
    return interaction.reply({ content: "You cannot assign this rank. Staff cannot exceed their own authority or assign below Stage 3 Low Weak.", ephemeral: true });
  }
  const id = crypto.randomUUID();
  const pendingRecord = { guildId: interaction.guildId, targetId: target.id, rank, hosterId: interaction.user.id, createdAt: new Date().toISOString() };
  pendingTryouts.set(id, pendingRecord);
  await saveState(state => { state.pendingTryouts[id] = pendingRecord; return state; });
  const rows = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_tryout_approve:${id}`).setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`paradise_tryout_deny:${id}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
  );
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Tryout Result — Pending")
    .addFields(
      { name: "User", value: `${target}`, inline: true },
      { name: "Assigned rank", value: rankToRoleName(rank), inline: true },
      { name: "Hoster", value: `${interaction.user}`, inline: true },
      { name: "Status", value: "Pending approval", inline: false }
    )], components: [rows] });
}

async function handleTryoutApproval(interaction) {
  const [action, id] = interaction.customId.replace("paradise_tryout_", "").split(":");
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
    && !interaction.member.roles.cache.some(r => ["Owner", "Overseer", "Training Manager"].includes(r.name))) {
    return interaction.reply({ content: "Training Manager or Overseer required.", ephemeral: true });
  }
  const pending = pendingTryouts.get(id) || (await loadState()).pendingTryouts[id];
  if (!pending) return interaction.reply({ content: "This pending result expired.", ephemeral: true });
  if (!belongsToGuild(pending, interaction.guildId)) return interaction.reply({ content: "This tryout result belongs to another server.", ephemeral: true });
  if (action === "deny") {
    pendingTryouts.delete(id);
    await saveState(state => { delete state.pendingTryouts[id]; return state; });
    return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(await paradiseBrandColor()).setTitle("Tryout Result — Denied")], components: [] });
  }
  const member = await interaction.guild.members.fetch(pending.targetId);
  const role = await assignRankRole(interaction.guild, member, pending.rank);
  await writeArtifact(`3a59-tryout-approved-${id}.json`, {
    status: "LIVE VERIFIED", ...pending, rankRoleId: role.id, approvedBy: interaction.user.id, approvedAt: new Date().toISOString()
  });
  pendingTryouts.delete(id);
  await saveState(state => { delete state.pendingTryouts[id]; return state; });
  return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(await paradiseBrandColor()).setTitle("Tryout Result — Approved")], components: [] });
}

function openChallengeFor(state, discordId, guildId = PARADISE_TEST_GUILD_ID) {
  return Object.values(state.pendingChallenges || {}).find(item =>
    belongsToGuild(item, guildId) && item.status === "open" && [item.challengerId, item.opponentId].includes(discordId));
}

export function challengeBlockReason(state, challengerId, opponentId, now = Date.now(), guildId = PARADISE_TEST_GUILD_ID) {
  if (challengerId === opponentId) return "You cannot challenge yourself.";
  const challengerTicket = openChallengeFor(state, challengerId, guildId);
  if (challengerTicket) {
    return `You already have an open challenge in <#${challengerTicket.ticketId}>. Close it before opening another.`;
  }
  const opponentTicket = openChallengeFor(state, opponentId, guildId);
  if (opponentTicket) {
    const otherId = opponentTicket.challengerId === opponentId ? opponentTicket.opponentId : opponentTicket.challengerId;
    return `That player is already in a challenge with <@${otherId}> in <#${opponentTicket.ticketId}>. You cannot challenge them until that ticket is closed.`;
  }
  const leaderboard = leaderboardForGuild(state, guildId);
  const challengerCooldown = Number(leaderboard?.[challengerId]?.availability?.cooldownUntil || 0);
  if (challengerCooldown > now) {
    return `You are currently on challenge cooldown. It expires <t:${Math.floor(challengerCooldown / 1000)}:R>.`;
  }
  const opponentImmunity = Number(leaderboard?.[opponentId]?.availability?.immunityUntil || 0);
  if (opponentImmunity > now) {
    return `That player is currently immune and cannot be challenged. Their immunity expires <t:${Math.floor(opponentImmunity / 1000)}:R>.`;
  }
  const challengerLoa = guildUserRecord(state.loa, guildId, challengerId);
  if (challengerLoa?.status === "approved" && Number(challengerLoa.expiresAt) > now) {
    return `Your active LOA blocks ranked challenges until <t:${Math.floor(challengerLoa.expiresAt / 1000)}:R>.`;
  }
  const opponentLoa = guildUserRecord(state.loa, guildId, opponentId);
  if (opponentLoa?.status === "approved" && Number(opponentLoa.expiresAt) > now) {
    return `That player is currently unavailable due to LOA until <t:${Math.floor(opponentLoa.expiresAt / 1000)}:R>.`;
  }
  return null;
}

function challengeRangeText(currentSpot, spots) {
  const labels = spots.map(spot => `**#${spot}**`);
  if (!Number.isInteger(Number(currentSpot))) return `As an unranked player, you may challenge ${labels.join(" or ")}.`;
  return `As rank **#${currentSpot}**, you may challenge ${labels.join(", ").replace(/, ([^,]*)$/, " or $1")}.`;
}

async function presentChallengeTargetMenu(interaction, region = null) {
  if (!await completedProfile(interaction.user.id)) {
    return interaction.reply({ content: "Complete `/profile create` before opening a challenge.", ephemeral: true });
  }
  const state = await loadState();
  const leaderboard = leaderboardForGuild(state, interaction.guildId);
  const currentSpot = Number(leaderboard[interaction.user.id]?.spot);
  const spots = challengeTargetSpots(Number.isInteger(currentSpot) ? currentSpot : null, configForGuild(state, interaction.guildId).challenge);
  const entries = Object.entries(leaderboard)
    .filter(([id, row]) => id !== interaction.user.id && spots.includes(Number(row.spot)))
    .sort((a, b) => Number(a[1].spot) - Number(b[1].spot));
  const candidates = [];
  for (const [discordId, row] of entries) {
    if (!await completedProfile(discordId)) continue;
    const member = await interaction.guild.members.fetch(discordId).catch(() => null);
    if (!member) continue;
    const block = challengeBlockReason(state, interaction.user.id, discordId, Date.now(), interaction.guildId);
    candidates.push({
      label: `#${row.spot} ${member.displayName}`.slice(0, 100),
      value: discordId,
      description: (block ? "Currently unavailable — select for details" : `Discord: ${discordId}`).slice(0, 100)
    });
  }
  if (!candidates.length) {
    return interaction.reply({
      content: `${challengeRangeText(Number.isInteger(currentSpot) ? currentSpot : null, spots)} No eligible profiled player is currently assigned to those positions.`,
      ephemeral: true
    });
  }
  challengeDrafts.set(interaction.user.id, { region, expires: Date.now() + 10 * 60_000 });
  const menu = new StringSelectMenuBuilder().setCustomId("paradise_challenge_target")
    .setPlaceholder("Select who to challenge…").addOptions(candidates.slice(0, 25));
  return interaction.reply({
    content: challengeRangeText(Number.isInteger(currentSpot) ? currentSpot : null, spots),
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true
  });
}

async function challengeHeaderEmbed(record) {
  const created = Math.floor(new Date(record.openedAt || Date.now()).getTime() / 1000);
  return new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("⚔️ LIVE CHALLENGE CONTEXT")
    .setDescription(`# <@${record.challengerId}> **vs** <@${record.opponentId}>\n-# Referees should never need to scroll to recover ticket context.`)
    .addFields(
      { name: "Ticket ID", value: `\`${record.ticketId}\``, inline: true },
      { name: "Opened", value: `<t:${created}:F>\n<t:${created}:R>`, inline: true },
      { name: "Status", value: `**${String(record.status || "open").toUpperCase()}**`, inline: true },
      { name: "Positions", value: `${record.challengerSpot ? `#${record.challengerSpot}` : "Unranked"} vs ${record.opponentSpot ? `#${record.opponentSpot}` : "Unranked"}`, inline: true },
      { name: "Region / Type", value: `${record.region || "Not selected"} · ${record.challengeType || "Ranked"}`, inline: true },
      { name: "Referee", value: record.refereeId ? `<@${record.refereeId}>` : "Not assigned", inline: true },
      { name: "Proof", value: record.proofRequired ? "Required" : "Optional", inline: true },
      { name: "Notes", value: record.note || "No notes.", inline: false }
    )
    .setFooter(paradiseFooter("Pinned and refreshed automatically"));
}

async function refreshChallengeHeader(guild, record) {
  const channel = guild.channels.cache.get(record.ticketId) || await guild.channels.fetch(record.ticketId).catch(() => null);
  if (!channel?.isTextBased?.()) return null;
  let message = record.headerMessageId ? await channel.messages.fetch(record.headerMessageId).catch(() => null) : null;
  const payload = { embeds: [await challengeHeaderEmbed(record)] };
  if (message) await message.edit(payload); else {
    message = await channel.send(payload);
    await message.pin("Paradise live challenge context").catch(() => {});
  }
  return message;
}

async function createChallengeTicket(interaction, opponent, region = null) {
  if (!await completedProfile(interaction.user.id) || !await completedProfile(opponent.id)) {
    return interaction.reply({ content: "Both fighters must complete `/profile create` first.", ephemeral: true });
  }
  const state = await loadState();
  const leaderboard = leaderboardForGuild(state, interaction.guildId);
  const currentSpot = Number(leaderboard[interaction.user.id]?.spot);
  const opponentSpot = Number(leaderboard[opponent.id]?.spot);
  const guildConfig = configForGuild(state, interaction.guildId);
  const allowedSpots = challengeTargetSpots(Number.isInteger(currentSpot) ? currentSpot : null, guildConfig.challenge);
  if (!allowedSpots.includes(opponentSpot)) {
    return interaction.reply({
      content: `${challengeRangeText(Number.isInteger(currentSpot) ? currentSpot : null, allowedSpots)} <@${opponent.id}> is outside your allowed challenge range.`,
      ephemeral: true
    });
  }
  const block = challengeBlockReason(state, interaction.user.id, opponent.id, Date.now(), interaction.guildId);
  if (block) return interaction.reply({ content: block, ephemeral: true });
  const me = interaction.guild.members.me;
  const staffOverwrites = ["Owner", "Admin", "Overseer", "Referee Manager", "Head Referee", "Experienced Referee", "Referee", "Trial Referee"]
    .map(name => interaction.guild.roles.cache.find(role => role.name === name))
    .filter(Boolean)
    .map(role => ({
      id: role.id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
    }));
  const channel = await interaction.guild.channels.create({
    name: `challenge-${interaction.user.username}-${opponent.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90),
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: opponent.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels] },
      ...staffOverwrites
    ],
    reason: "Paradise verified challenge"
  });
  const record = {
    status: "open", guildId: interaction.guildId, ticketId: channel.id, challengerId: interaction.user.id,
    opponentId: opponent.id, region: region || null, challengerSpot: Number.isInteger(currentSpot) ? currentSpot : null,
    opponentSpot, challengeType: "Ranked", proofRequired: guildConfig.challenge?.proofRequired === true,
    openedAt: new Date().toISOString()
  };
  const header = await refreshChallengeHeader(interaction.guild, record);
  record.headerMessageId = header?.id || null;
  await channel.send({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("◆ CHALLENGE READY")
    .setDescription("Use `/challenge post` after the match, or `/challenge autowin` for an approved automatic-win reason.\n\n> Record the complete set and keep proof in this ticket.")
    .setFooter(paradiseFooter("Senior approval required"))] });
  await saveState(current => {
    current.pendingChallenges[channel.id] = record;
    return current;
  });
  challengeDrafts.delete(interaction.user.id);
  await updateAvailabilityPanel(interaction.guild).catch(() => {});
  return interaction.reply({ content: `Challenge ticket created: ${channel}`, ephemeral: true });
}

async function handleChallenge(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "create") {
    const opponent = interaction.options.getUser("opponent");
    const region = interaction.options.getString("region");
    return opponent ? createChallengeTicket(interaction, opponent, region) : presentChallengeTargetMenu(interaction, region);
  }
  if (sub === "close") {
    if (!await canApproveReferee(interaction.member)) {
      return interaction.reply({ content: "Experienced Referee, Head Referee or Referee Manager required.", ephemeral: true });
    }
    const state = await loadState();
    const ticket = state.pendingChallenges[interaction.channelId];
    if (!ticket || ticket.status !== "open") return interaction.reply({ content: "Run this inside an open Paradise challenge ticket.", ephemeral: true });
    const reason = interaction.options.getString("reason");
    const closed = {
      ...ticket,
      status: "closed",
      closeReason: reason,
      closedBy: interaction.user.id,
      closedAt: new Date().toISOString()
    };
    await saveState(next => { next.pendingChallenges[interaction.channelId] = closed; return next; });
    await interaction.channel.permissionOverwrites.edit(ticket.challengerId, { ViewChannel: false }).catch(() => {});
    await interaction.channel.permissionOverwrites.edit(ticket.opponentId, { ViewChannel: false }).catch(() => {});
    await refreshChallengeHeader(interaction.guild, closed).catch(() => {});
    await saveChallengeTranscript(interaction.guild, interaction.channel, closed, "manual_close").catch(() => {});
    await updateAvailabilityPanel(interaction.guild).catch(() => {});
    return interaction.reply({ content: `Challenge closed. Player access removed. Reason: **${reason}**`, ephemeral: true });
  }
  if (sub === "autowin") {
    const hasRefereeRole = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
      || interaction.member.roles.cache.some(role => ["Trial Referee", "Referee", "Experienced Referee", "Head Referee", "Referee Manager"].includes(role.name));
    if (!hasRefereeRole) return interaction.reply({ content: "Referee role required.", ephemeral: true });
    const state = await loadState();
    const ticket = state.pendingChallenges[interaction.channelId];
    if (!ticket || ticket.status !== "open") return interaction.reply({ content: "Run `/challenge autowin` inside an open challenge ticket.", ephemeral: true });
    const winner = interaction.options.getUser("winner");
    if (![ticket.challengerId, ticket.opponentId].includes(winner.id)) {
      return interaction.reply({ content: "Winner must be one of the two fighters in this ticket.", ephemeral: true });
    }
    const loserId = winner.id === ticket.challengerId ? ticket.opponentId : ticket.challengerId;
    const loser = await interaction.client.users.fetch(loserId);
    const submissionId = crypto.randomUUID();
    const reason = interaction.options.getString("reason");
    const submission = {
      status: "pending",
      guildId: interaction.guildId,
      resultType: "autowin",
      winnerId: winner.id,
      loserId,
      score: "Auto",
      refereeId: interaction.user.id,
      winnerSpot: winner.id === ticket.challengerId ? ticket.challengerSpot : ticket.opponentSpot,
      loserSpot: loserId === ticket.challengerId ? ticket.challengerSpot : ticket.opponentSpot,
      note: `${reason}${interaction.options.getString("note") ? ` — ${interaction.options.getString("note")}` : ""}`,
      ticketId: interaction.channelId,
      createdAt: new Date().toISOString()
    };
    pendingChallenges.set(submissionId, submission);
    await saveState(next => { next.pendingChallenges[submissionId] = submission; return next; });
    const approvalRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`paradise_challenge_approve:${submissionId}`).setLabel("Approve Auto Win").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`paradise_challenge_deny:${submissionId}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
    );
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Automatic Win — Pending Approval")
        .setDescription(`# ${winner} **vs** ${loser}`)
        .addFields(
          { name: "Winner", value: `${winner}`, inline: true },
          { name: "Result", value: `**Auto — ${reason}**`, inline: true },
          { name: "Referee", value: `${interaction.user}`, inline: true },
          { name: "Ticket ID", value: interaction.channelId, inline: false }
        ).setFooter(paradiseFooter("Senior referee approval required"))],
      components: [approvalRow]
    });
  }
  const submittedWinner = interaction.options.getUser("winner");
  const submittedLoser = interaction.options.getUser("loser");
  const submittedScore = interaction.options.getString("score").trim().replace(/\s+to\s+to\s+/gi, " to ");
  if (!await completedProfile(submittedWinner.id) || !await completedProfile(submittedLoser.id)) {
    return interaction.reply({ content: "Winner and loser must both have completed Paradise fighter profiles.", ephemeral: true });
  }
  const submissionId = crypto.randomUUID();
  const submission = {
    status: "pending", guildId: interaction.guildId, winnerId: submittedWinner.id, loserId: submittedLoser.id, score: submittedScore,
    refereeId: interaction.user.id,
    winnerSpot: sub === "post" ? interaction.options.getInteger("winner_spot") : null,
    loserSpot: sub === "post" ? interaction.options.getInteger("loser_spot") : null,
    note: sub === "post" ? interaction.options.getString("note") : null,
    ticketId: sub === "post" ? (interaction.options.getString("ticket_id") || interaction.channelId) : interaction.channelId,
    createdAt: new Date().toISOString()
  };
  pendingChallenges.set(submissionId, submission);
  await saveState(state => { state.pendingChallenges[submissionId] = submission; return state; });
  const approvalRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_challenge_approve:${submissionId}`).setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`paradise_challenge_deny:${submissionId}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
  );
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Challenge Score — Pending Approval")
    .setDescription(`**${submittedWinner}${submission.winnerSpot ? ` (#${submission.winnerSpot})` : ""} vs ${submittedLoser}${submission.loserSpot ? ` (#${submission.loserSpot})` : ""}**`)
    .addFields(
      { name: "Score", value: submittedScore, inline: true },
      { name: "Referee", value: `${interaction.user}`, inline: true },
      { name: "Note", value: submission.note || "—", inline: false },
      { name: "Ticket ID", value: submission.ticketId || "—", inline: true },
      { name: "Status", value: "Pending Referee Manager / Experienced Referee approval", inline: false }
    ).setFooter({ text: "Made by Paradise bot" })], components: [approvalRow] });
  const winner = interaction.options.getUser("winner");
  const loser = interaction.options.getUser("loser");
  const score = interaction.options.getString("score").trim().replace(/\s+to\s+to\s+/gi, " to ");
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Challenge Result — Pending Approval")
    .setDescription(`${winner} defeated ${loser}`)
    .addFields({ name: "Score", value: score }, { name: "Referee", value: `${interaction.user}` })] });
}

export function canRoleNamesApproveScore(roleNames = [], isAdministrator = false) {
  return isAdministrator || roleNames.some(name =>
    ["Owner", "Overseer", "Referee Manager", "Head Referee", "Experienced Referee"].includes(name)
  );
}

async function canApproveReferee(member) {
  const administrator = member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (administrator) return true;
  const state = await loadState();
  const guildConfig = configForGuild(state, member.guild.id);
  const mapped = new Set([
    guildConfig.roleMappings?.owner_role,
    guildConfig.roleMappings?.overseer_role,
    guildConfig.roleMappings?.referee_manager_role,
    guildConfig.roleMappings?.experienced_referee_role
  ].filter(Boolean));
  const roles = [...member.roles.cache.values()];
  return roles.some(role => mapped.has(role.id))
    || canRoleNamesApproveScore(roles.map(role => role.name), administrator);
}

async function handleChallengeApproval(interaction) {
  if (!await canApproveReferee(interaction.member)) return interaction.reply({ content: "Referee Manager or Experienced Referee required.", ephemeral: true });
  const [action, id] = interaction.customId.replace("paradise_challenge_", "").split(":");
  const record = pendingChallenges.get(id) || (await loadState()).pendingChallenges[id];
  if (!record || record.status !== "pending") return interaction.reply({ content: "This score post is no longer pending.", ephemeral: true });
  if (action === "deny") {
    await saveState(state => {
      state.pendingChallenges[id] = { ...record, status: "denied", deniedBy: interaction.user.id, decidedAt: new Date().toISOString() };
      return state;
    });
    pendingChallenges.delete(id);
    return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(await paradiseBrandColor())
      .setTitle("Challenge Score — Denied").setFooter({ text: `Denied by ${interaction.user.username} • Made by Paradise bot` })], components: [] });
  }
  const now = Date.now();
  await saveState(state => {
    const challengeConfig = configForGuild(state, interaction.guildId).challenge || {};
    const leaderboard = ensureLeaderboardForGuild(state, interaction.guildId);
    const normalCooldownDays = Number(challengeConfig.cooldownDays || 3);
    const top10CooldownDays = Number(challengeConfig.top10CooldownDays || 7);
    const immunityDays = Number(challengeConfig.immunityDays || normalCooldownDays);
    const winner = leaderboard[record.winnerId] || { wins: 0, losses: 0, history: [] };
    const loser = leaderboard[record.loserId] || { wins: 0, losses: 0, history: [] };
    winner.wins = Number(winner.wins || 0) + 1;
    loser.losses = Number(loser.losses || 0) + 1;
    winner.spot = record.winnerSpot || winner.spot || null;
    loser.spot = record.loserSpot || loser.spot || null;
    const history = { resultId: id, winnerId: record.winnerId, loserId: record.loserId, score: record.score, at: new Date().toISOString() };
    winner.history = [...(winner.history || []), history].slice(-50);
    loser.history = [...(loser.history || []), history].slice(-50);
    loser.availability = {
      ...(loser.availability || {}),
      cooldownUntil: now + (record.loserSpot && record.loserSpot <= 10 ? top10CooldownDays : normalCooldownDays) * 86_400_000
    };
    winner.availability = {
      ...(winner.availability || {}),
      immunityUntil: now + (record.winnerSpot && record.winnerSpot <= 10 ? top10CooldownDays : immunityDays) * 86_400_000
    };
    leaderboard[record.winnerId] = winner;
    leaderboard[record.loserId] = loser;
    if (state.pendingChallenges[record.ticketId]?.status === "open") {
      state.pendingChallenges[record.ticketId] = {
        ...state.pendingChallenges[record.ticketId],
        status: "closed",
        resultType: record.resultType || "score",
        winnerId: record.winnerId,
        loserId: record.loserId,
        finalScore: record.score,
        refereeId: record.refereeId,
        approvedBy: interaction.user.id,
        closedAt: new Date().toISOString()
      };
    }
    state.pendingChallenges[id] = { ...record, status: "approved", approvedBy: interaction.user.id, decidedAt: new Date().toISOString() };
    const activity = state.staffActivity[record.refereeId] || {};
    activity.referee = [...(activity.referee || []), history.at];
    state.staffActivity[record.refereeId] = activity;
    return state;
  });
  pendingChallenges.delete(id);
  await updateAvailabilityPanel(interaction.guild).catch(() => {});
  const finalState = await loadState();
  const closedTicket = finalState.pendingChallenges[record.ticketId];
  const ticketChannel = interaction.guild.channels.cache.get(record.ticketId);
  if (ticketChannel && closedTicket) {
    await ticketChannel.permissionOverwrites.edit(closedTicket.challengerId, { ViewChannel: false }).catch(() => {});
    await ticketChannel.permissionOverwrites.edit(closedTicket.opponentId, { ViewChannel: false }).catch(() => {});
    await refreshChallengeHeader(interaction.guild, closedTicket).catch(() => {});
    await saveChallengeTranscript(interaction.guild, ticketChannel, closedTicket, "approved_result").catch(() => {});
  }
  const results = await configuredChannel(interaction.guild, "challenge_results_channel", "challenge-results");
  if (results) {
    await results.send({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(await paradiseBrandColor())
      .setTitle(record.resultType === "autowin" ? "Approved Automatic Win" : "Approved Challenge Result")
      .setFooter({ text: `Approved by ${interaction.user.username} • Made by Paradise bot` })] }).catch(() => {});
  }
  const works = await configuredChannel(interaction.guild, "referee_works_channel", "referee-works");
  if (works) await works.send({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(await paradiseBrandColor())
    .setTitle("Approved Referee Work").setFooter({ text: `Approved by ${interaction.user.username} • Made by Paradise bot` })] });
  return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(await paradiseBrandColor())
    .setTitle("Challenge Score — Approved").setFooter({ text: `Approved by ${interaction.user.username} • Made by Paradise bot` })], components: [] });
}

async function handleTraining(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "setup") {
    if (!canManageClan(interaction.member)) return interaction.reply({ content: "Training management role required.", ephemeral: true });
    const posted = await publishGuidePost(interaction.guild, GUIDE_POSTS.find(item => item.key === "training_rules"));
    return interaction.reply({ content: posted ? "Training handbook updated." : "Create `training-hoster-rules` first.", ephemeral: true });
  }
  if (sub === "start") {
    const link = interaction.options.getString("link");
    const rules = interaction.options.getString("rules") || "No Lh, no TDS, no overpassive, no 2 Ragdoll cancel, no wall, no hitting in queue, do not leave queue.";
    const selectedHost = interaction.options.getUser("host") || interaction.user;
    if (selectedHost.id !== interaction.user.id && !canManageClan(interaction.member)) {
      return interaction.reply({ content: "Only training management can start a session for another host.", ephemeral: true });
    }
    const cohost = interaction.options.getUser("cohost");
    const sessionId = crypto.randomUUID();
    const session = {
      id: sessionId, guildId: interaction.guildId, type: "training", hosterId: selectedHost.id, createdBy: interaction.user.id,
      cohostId: cohost?.id || null, link, rules, status: "open", startedAt: new Date().toISOString()
    };
    const controls = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`paradise_session_locked:${sessionId}`).setLabel("SERVER LOCKED").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`paradise_session_end:${sessionId}`).setLabel("END TRAINING").setStyle(ButtonStyle.Danger)
    );
    const payload = { embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ TRAINING OPEN")
      .setDescription(`# Training\n## ◆ Server\n[**Join the private server**](${link})\n\n## ◆ Rules\n${rules}\n\n## ◆ Playable characters\n- **Saitama**\n- **Garou**\n- **Metal Bat**\n\n-# Teams must be balanced. Keep the queue orderly.`)
      .addFields(
        { name: "◇ Hoster", value: `<@${selectedHost.id}>`, inline: true },
        { name: "◇ Co-hoster", value: cohost ? `${cohost}` : "None", inline: true },
        { name: "◇ Format", value: "**FT3** — FT5 optional", inline: true },
        { name: "◇ Session", value: `\`${sessionId.slice(0, 8)}\``, inline: true }
      ).setFooter(paradiseFooter("Hoster-only controls"))], components: [controls] };
    await interaction.deferReply({ ephemeral: true });
    const target = await configuredChannel(interaction.guild, "training_channel", "training") || interaction.channel;
    const announcement = await target.send(payload);
    session.channelId = target.id;
    session.messageId = announcement.id;
    activeTrainings.set(sessionId, session);
    await saveState(state => { state.trainings[sessionId] = session; return state; });
    return interaction.editReply(`Training started: ${announcement.url}`);
  }
  const owned = [...activeTrainings.values()].find(item => belongsToGuild(item, interaction.guildId) && item.hosterId === interaction.user.id && item.status !== "ended")
    || Object.values((await loadState()).trainings).find(item => belongsToGuild(item, interaction.guildId) && item.hosterId === interaction.user.id && item.status !== "ended");
  if (!owned) return interaction.reply({ content: "You have no active training session.", ephemeral: true });
  const state = await loadState();
  if (configForGuild(state, interaction.guildId).verification?.requireProfileForTrainingResult !== false && !await completedProfile(interaction.user.id)) {
    return interaction.reply({ content: "Complete `/profile create` before submitting a training result.", ephemeral: true });
  }
  const result = {
    score: interaction.options.getString("score"),
    winner: interaction.options.getString("winner"),
    mvps: interaction.options.getString("mvps") || null,
    note: interaction.options.getString("note") || null,
    proof: interaction.options.getString("proof") || null
  };
  await finishSession(owned.id, interaction.user.id, {
    ...result
  });
  const resultEmbed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Training ended.")
    .setDescription(`## Score\n**${result.score} — ${result.winner} won.**`)
    .addFields(
      { name: "Hoster", value: `${interaction.user}`, inline: true },
      { name: "MVPs", value: result.mvps || "Not recorded", inline: true },
      { name: "Note", value: result.note || "No note", inline: false },
      { name: "Proof", value: result.proof || "Not supplied", inline: false }
    ).setFooter(paradiseFooter("Activity counted automatically"));
  const originalChannel = interaction.guild.channels.cache.get(owned.channelId);
  const original = originalChannel?.isTextBased?.() ? await originalChannel.messages.fetch(owned.messageId).catch(() => null) : null;
  if (original) {
    const endedEmbed = EmbedBuilder.from(original.embeds[0]).setTitle("✓ TRAINING ENDED")
      .setFooter(paradiseFooter(`Ended with ${result.score}`));
    await original.edit({ embeds: [endedEmbed], components: [] }).catch(() => {});
    await original.reply({ embeds: [resultEmbed] }).catch(() => {});
  }
  const resultsChannel = await configuredChannel(interaction.guild, "training_results_channel", "training-results");
  if (resultsChannel) await resultsChannel.send({ embeds: [resultEmbed] }).catch(() => {});
  const activityChannel = await configuredChannel(interaction.guild, "activity_logs_channel", "activity-logs");
  if (activityChannel) await activityChannel.send({ embeds: [resultEmbed.setTitle("Training Activity Logged")] }).catch(() => {});
  return interaction.reply({ content: `Training result saved.${resultsChannel ? ` Results: ${resultsChannel}` : ""}`, ephemeral: true });
}

async function finishSession(sessionId, hosterId, result = {}) {
  const completedAt = new Date().toISOString();
  await saveState(state => {
    const session = state.trainings[sessionId];
    if (!session || session.hosterId !== hosterId) return state;
    state.trainings[sessionId] = { ...session, ...result, status: "ended", completedAt };
    const activity = state.staffActivity[hosterId] || {};
    activity.training = [...(activity.training || []), completedAt];
    state.staffActivity[hosterId] = activity;
    return state;
  });
  const cached = activeTrainings.get(sessionId);
  if (cached) activeTrainings.set(sessionId, { ...cached, ...result, status: "ended", completedAt });
}

async function handleSessionButton(interaction) {
  const [action, sessionId] = interaction.customId.replace("paradise_session_", "").split(":");
  const session = activeTrainings.get(sessionId) || (await loadState()).trainings[sessionId];
  if (!session) return interaction.reply({ content: "Session not found.", ephemeral: true });
  if (!belongsToGuild(session, interaction.guildId)) return interaction.reply({ content: "This session belongs to another server.", ephemeral: true });
  if (session.hosterId !== interaction.user.id && !isOwner(interaction)) {
    return interaction.reply({ content: "Only the recorded hoster can use this button.", ephemeral: true });
  }
  if (action === "locked") {
    await saveState(state => {
      state.trainings[sessionId] = { ...state.trainings[sessionId], status: "locked", lockedAt: new Date().toISOString() };
      return state;
    });
    return interaction.reply({ content: "# SERVER LOCKED", allowedMentions: { parse: [] } });
  }
  await finishSession(sessionId, session.hosterId);
  return interaction.update({ content: "# ENDED", embeds: interaction.message.embeds, components: [] });
}

function hasEventAuthority(interaction, roles) {
  return interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
    || interaction.member.roles.cache.some(role => ["Owner", "Overseer", ...roles].includes(role.name));
}

function initialBracket(participants) {
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, participants.length)));
  const seeded = [...participants, ...Array(size - participants.length).fill(null)];
  const matches = [];
  for (let index = 0; index < seeded.length; index += 2) {
    matches.push({ round: 1, match: matches.length + 1, players: [seeded[index], seeded[index + 1]], winner: seeded[index + 1] ? null : seeded[index] });
  }
  return { size, matches };
}

async function recordStaffActivity(userId, key, at = new Date().toISOString()) {
  await saveState(state => {
    const activity = state.staffActivity[userId] || {};
    activity[key] = [...(activity[key] || []), at];
    state.staffActivity[userId] = activity;
    return state;
  });
}

async function handleTournament(interaction) {
  if (!hasEventAuthority(interaction, ["Tournament Manager", "Event Manager"])) {
    return interaction.reply({ content: "Tournament Manager or owner role required.", ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  if (sub === "start-simple") {
    const id = crypto.randomUUID().slice(0, 8);
    const tournament = {
      id, mode: "simple", title: interaction.options.getString("title"),
      link: interaction.options.getString("link"), rules: interaction.options.getString("rules"),
      prize: interaction.options.getString("prize"), hosterId: interaction.user.id,
      status: "open", createdAt: new Date().toISOString()
    };
    await saveState(state => { state.tournaments[id] = tournament; return state; });
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(tournament.title)
      .setDescription(`**Server:** ${tournament.link}\n**Rules:** ${tournament.rules || "Standard Paradise tournament rules."}\n**Prize:** ${tournament.prize || "None announced"}`)
      .addFields({ name: "Tournament ID", value: id, inline: true }, { name: "Host", value: `${interaction.user}`, inline: true })
      .setFooter({ text: "Simple tournament • Made by Paradise bot" })] });
  }
  if (sub === "result-simple") {
    const winner = interaction.options.getUser("winner");
    await recordStaffActivity(interaction.user.id, "tournament");
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Tournament Winner")
      .setDescription(`${winner} won the tournament.`)
      .addFields({ name: "Proof", value: interaction.options.getString("proof") }, { name: "Recorded by", value: `${interaction.user}` })
      .setFooter({ text: "Made by Paradise bot" })] });
  }
  if (sub === "create-bracket") {
    const participants = [...new Set(interaction.options.getString("participants").split(",").map(value => value.replace(/\D/g, "")).filter(value => /^\d{15,22}$/.test(value)))];
    if (participants.length < 2 || participants.length > 64) return interaction.reply({ content: "Provide 2–64 comma-separated Discord user IDs.", ephemeral: true });
    const id = crypto.randomUUID().slice(0, 8);
    const bracket = initialBracket(participants);
    const tournament = {
      id, mode: "bracket", title: interaction.options.getString("title"), link: interaction.options.getString("link"),
      hosterId: interaction.user.id, status: "open", participants, ...bracket, createdAt: new Date().toISOString()
    };
    await saveState(state => { state.tournaments[id] = tournament; return state; });
    const lines = tournament.matches.map(item => `Match ${item.match}: ${item.players[0] ? `<@${item.players[0]}>` : "BYE"} vs ${item.players[1] ? `<@${item.players[1]}>` : "BYE"}${item.winner ? ` → <@${item.winner}> advances` : ""}`);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`${tournament.title} — Round 1`)
      .setDescription(lines.join("\n").slice(0, 4000))
      .addFields({ name: "Tournament ID", value: id }, { name: "Server", value: tournament.link })
      .setFooter({ text: "Bracket state is stored in PostgreSQL • Made by Paradise bot" })] });
  }
  const id = interaction.options.getString("tournament_id");
  const matchNumber = interaction.options.getInteger("match");
  const winner = interaction.options.getUser("winner");
  const state = await loadState();
  const tournament = state.tournaments[id];
  if (!tournament || tournament.mode !== "bracket") return interaction.reply({ content: "Bracket tournament not found.", ephemeral: true });
  const match = tournament.matches.find(item => item.match === matchNumber);
  if (!match || !match.players.includes(winner.id)) return interaction.reply({ content: "Winner must be one of the selected match players.", ephemeral: true });
  match.winner = winner.id;
  const roundComplete = tournament.matches.every(item => item.winner);
  if (roundComplete && tournament.matches.length > 1) {
    const next = [];
    const winners = tournament.matches.map(item => item.winner);
    for (let index = 0; index < winners.length; index += 2) next.push({ round: tournament.matches[0].round + 1, match: index / 2 + 1, players: [winners[index], winners[index + 1] || null], winner: winners[index + 1] ? null : winners[index] });
    tournament.matches = next;
  } else if (roundComplete) {
    tournament.status = "completed";
    tournament.winnerId = winner.id;
    await recordStaffActivity(interaction.user.id, "tournament");
  }
  await saveState(current => { current.tournaments[id] = tournament; return current; });
  return interaction.reply({ content: tournament.status === "completed" ? `Tournament complete: ${winner} won.` : `${winner} advanced. Bracket state updated.` });
}

async function handleGiveaway(interaction) {
  if (!hasEventAuthority(interaction, ["Giveaway Manager"])) return interaction.reply({ content: "Giveaway Manager or owner role required.", ephemeral: true });
  const endsAt = Date.now() + interaction.options.getInteger("minutes") * 60_000;
  const id = crypto.randomUUID();
  await recordStaffActivity(interaction.user.id, "giveaway");
  await saveState(state => {
    state.giveaways[id] = { prize: interaction.options.getString("prize"), endsAt, winners: interaction.options.getInteger("winners") || 1, entries: [], createdBy: interaction.user.id };
    return state;
  });
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`paradise_giveaway_enter:${id}`).setLabel("Enter Giveaway").setStyle(ButtonStyle.Success));
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`Giveaway: ${interaction.options.getString("prize")}`)
    .setDescription(`Ends <t:${Math.floor(endsAt / 1000)}:R>\nWinners: **${interaction.options.getInteger("winners") || 1}**\nRequirements: ${interaction.options.getString("requirements") || "Follow server rules."}`)
    .setFooter({ text: "Entries are opt-in • Made by Paradise bot" })], components: [row] });
}

async function handleCommunityEvent(interaction, type) {
  const role = type === "gamenight" ? "Game Night Manager" : "Event Manager";
  if (!hasEventAuthority(interaction, [role])) return interaction.reply({ content: `${role} or owner role required.`, ephemeral: true });
  await recordStaffActivity(interaction.user.id, type);
  const isGame = type === "gamenight";
  const title = isGame ? `Game Night: ${interaction.options.getString("game")}` : interaction.options.getString("title");
  const description = isGame
    ? `**Link:** ${interaction.options.getString("link")}\n**Notes:** ${interaction.options.getString("notes") || "Join, follow the host and have fun."}`
    : `**Time:** ${interaction.options.getString("time")}\n**Link:** ${interaction.options.getString("link") || "To be announced"}\n**Details:** ${interaction.options.getString("rules") || "Follow server rules."}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_rsvp_yes:${crypto.randomUUID()}`).setLabel("Going").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`paradise_rsvp_maybe:${crypto.randomUUID()}`).setLabel("Maybe").setStyle(ButtonStyle.Secondary)
  );
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(title).setDescription(description)
    .addFields({ name: "Host", value: `${interaction.user}` }).setFooter({ text: "Made by Paradise bot" })], components: [row] });
}

async function handleOptInButton(interaction) {
  if (interaction.customId.startsWith("paradise_giveaway_enter:")) {
    const id = interaction.customId.split(":")[1];
    const state = await loadState();
    const giveaway = state.giveaways[id];
    if (!giveaway || giveaway.endsAt < Date.now()) return interaction.reply({ content: "This giveaway has ended.", ephemeral: true });
    const entries = new Set(giveaway.entries || []);
    const removing = entries.has(interaction.user.id);
    if (removing) entries.delete(interaction.user.id); else entries.add(interaction.user.id);
    await saveState(current => { current.giveaways[id] = { ...giveaway, entries: [...entries] }; return current; });
    return interaction.reply({ content: removing ? "Giveaway entry removed." : "Giveaway entry recorded.", ephemeral: true });
  }
  const [choice, id] = interaction.customId.replace("paradise_rsvp_", "").split(":");
  await saveState(state => {
    state.rsvps[id] = { userId: interaction.user.id, choice, updatedAt: new Date().toISOString() };
    return state;
  });
  return interaction.reply({ content: `RSVP saved: ${choice}.`, ephemeral: true });
}

const WEEKLY_QUOTAS = Object.freeze({
  "Training Manager": { key: "training", minimum: 2 },
  "Training Hoster": { key: "training", minimum: 2 },
  "Tryout Manager": { key: "tryout", minimum: 2 },
  "Tryout Hoster": { key: "tryout", minimum: 1 },
  "Referee": { key: "referee", minimum: 2 },
  "Experienced Referee": { key: "referee", minimum: 2 },
  "Tournament Manager": { key: "tournament", minimum: 1 },
  "Event Manager": { key: "event", minimum: 1 },
  "Giveaway Manager": { key: "giveaway", minimum: 1 },
  "Game Night Manager": { key: "gamenight", minimum: 1 }
});

const ACTIVITY_GROUP_ROLES = Object.freeze({
  Referee: ["Referee", "Trial Referee", "Experienced Referee"],
  Tryout: ["Tryout Hoster", "Experienced Tryout Hoster", "Tryout Manager", "Tryout Staff", "Trial Tryout Staff"],
  Training: ["Training Hoster", "Trial Training Hoster", "Experienced Training Hoster", "Training Manager", "Trial Training Manager"],
  Event: ["Event Manager"], Tournament: ["Tournament Manager"],
  Giveaway: ["Giveaway Manager"], "Game Night": ["Game Night Manager"]
});

function weekActivityCount(activity, key, now = Date.now()) {
  const since = now - 7 * 86_400_000;
  return (activity?.[key] || []).filter(value => Date.parse(value) >= since).length;
}

async function postAutomaticActivityCheck(guild, group, state) {
  const targetName = group === "Referee" ? "referee-activity-check" : "hoster-activity-check";
  const channel = await configuredChannel(guild, "activity_check_channel", targetName)
    || guild.channels.cache.find(item => item.name.includes(targetName));
  if (!channel) return null;
  const id = crypto.randomUUID();
  const deadlineHours = Number(configForGuild(state, guild.id).activity?.responseDeadlineHours || 24);
  const expiresAt = Date.now() + deadlineHours * 3_600_000;
  const check = { guildId: guild.id, group, startedBy: guild.members.me.id, automatic: true, startedAt: new Date().toISOString(), expiresAt, responses: [] };
  state.activityChecks[id] = check;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_activity_present:${id}`).setLabel("I am active / Aktifim").setStyle(ButtonStyle.Success)
  );
  await channel.send({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`${group} Activity Check`)
    .setDescription(`Respond within ${deadlineHours} hours. Missing the deadline creates a flag and may remove the related staff role only when automatic role changes are explicitly enabled. Whitelist and LOA exemptions apply.\nDeadline: <t:${Math.floor(expiresAt / 1000)}:R>`)
    .setFooter({ text: "Automatic Paradise activity check • Made by Paradise bot" })], components: [row] });
  return id;
}

async function runParadiseMaintenance(guild) {
  await guild.members.fetch().catch(() => {});
  await saveState(async state => {
    const now = Date.now();
    const config = configForGuild(state, guild.id);
    for (const [userId, item] of Object.entries(state.whitelists)) {
      if (!belongsToGuild(item, guild.id)) continue;
      if (item.expiresAt && Date.parse(item.expiresAt) <= now) {
        delete state.whitelists[userId];
        const member = guild.members.cache.get(item.userId || userId);
        const role = guild.roles.cache.find(entry => entry.name === "Activity Whitelist");
        if (member && role) await member.roles.remove(role, "Paradise activity whitelist expired").catch(() => {});
      }
    }
    for (const [userId, item] of Object.entries(state.loa)) {
      if (!belongsToGuild(item, guild.id)) continue;
      if (item.status === "approved" && Number(item.expiresAt) <= now) {
        state.loa[userId] = { ...item, status: "expired", endedAt: new Date().toISOString() };
        const member = guild.members.cache.get(item.userId || userId);
        const role = guild.roles.cache.find(entry => entry.name === "LOA");
        if (member && role) await member.roles.remove(role, "Paradise LOA expired").catch(() => {});
      }
    }
    for (const [id, check] of Object.entries(state.activityChecks)) {
      if (!belongsToGuild(check, guild.id)) continue;
      if (check.processedAt || Number(check.expiresAt) > now) continue;
      const roles = ACTIVITY_GROUP_ROLES[check.group] || [];
      const exempt = new Set(Object.entries(state.whitelists)
        .filter(([, item]) => belongsToGuild(item, guild.id) && (!item.expiresAt || Date.parse(item.expiresAt) > now))
        .map(([userId, item]) => item.userId || userId));
      for (const [userId, item] of Object.entries(state.loa)) {
        if (belongsToGuild(item, guild.id) && item.status === "approved" && Number(item.expiresAt) > now) exempt.add(item.userId || userId);
      }
      const responded = new Set(check.responses || []);
      const removed = [];
      if (config.autoActivityRoleRemoval === true && config.activity?.autoRoleChanges === true) {
        for (const member of guild.members.cache.values()) {
          if (member.user.bot || responded.has(member.id) || exempt.has(member.id)) continue;
          const removable = member.roles.cache.filter(role => roles.includes(role.name));
          if (removable.size) {
            await member.roles.remove(removable, `Missed ${check.group} activity check`).catch(() => {});
            removed.push(member.id);
          }
        }
      }
      state.activityChecks[id] = { ...check, processedAt: new Date().toISOString(), removed };
      const log = await configuredChannel(guild, "activity_logs_channel", "activity-review")
        || guild.channels.cache.find(channel => channel.name.includes("activity-review"));
      if (log) await log.send(`Activity check **${check.group}** closed. Responses: ${responded.size}. Role removals: ${removed.length}. Whitelists were respected.`).catch(() => {});
    }
    if (config.autoActivityChecks === true) {
      const last = Number(config.lastAutoActivityCheckAt || 0);
      const intervalHours = Number(config.activity?.checkEveryHours || 48);
      if (now - last >= intervalHours * 60 * 60_000) {
        for (const group of ["Referee", "Tryout", "Training"]) await postAutomaticActivityCheck(guild, group, state);
        config.lastAutoActivityCheckAt = now;
      }
    }
    const sundayKey = new Date(now).toISOString().slice(0, 10);
    if (new Date(now).getUTCDay() === 0 && config.lastWeeklyReview !== sundayKey) {
      const log = await configuredChannel(guild, "activity_logs_channel", "activity-review")
        || guild.channels.cache.find(channel => channel.name.includes("activity-review"));
      if (log) {
        const lines = [];
        const quotas = config.weeklyQuotas || WEEKLY_QUOTAS;
        const promotionMultiplier = Number(config.activity?.promotionMultiplier || 3);
        for (const member of guild.members.cache.values()) {
          const quota = Object.entries(quotas).find(([role]) => member.roles.cache.some(item => item.name === role));
          if (!quota) continue;
          const [role, rule] = quota;
          const count = weekActivityCount(state.staffActivity[member.id], rule.key, now);
          const recommendation = count < rule.minimum ? "demotion review" : count >= rule.minimum * promotionMultiplier ? "promotion review" : "meets quota";
          lines.push(`${member} — ${role}: ${count}/${rule.minimum} — ${recommendation}`);
        }
        await log.send({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Sunday Staff Review")
          .setDescription(lines.join("\n").slice(0, 4000) || "No quota roles found.")
          .setFooter({ text: "Recommendations only unless autoStaffChanges is explicitly enabled • Made by Paradise bot" })] }).catch(() => {});
      }
      config.lastWeeklyReview = sundayKey;
    }
    return state;
  });
  await updateLoaPanel(guild).catch(() => {});
  await updateAvailabilityPanel(guild).catch(() => {});
}

async function handleWhitelist(interaction) {
  if (!isOwner(interaction) && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({ content: "Owner or Manage Server permission required.", ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  if (sub === "list") {
    const entries = Object.entries((await loadState()).whitelists)
      .filter(([, item]) => belongsToGuild(item, interaction.guildId) && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()))
      .map(([id, item]) => `<@${item.userId || id}> — ${item.group} — ${item.expiresAt ? `<t:${Math.floor(Date.parse(item.expiresAt) / 1000)}:R>` : "unlimited"}`);
    return interaction.reply({ content: entries.join("\n") || "No active activity whitelists.", ephemeral: true });
  }
  const user = interaction.options.getUser("user");
  if (sub === "remove") {
    await saveState(state => {
      delete state.whitelists[guildUserKey(interaction.guildId, user.id)];
      if (interaction.guildId === PARADISE_TEST_GUILD_ID) delete state.whitelists[user.id];
      return state;
    });
    return interaction.reply({ content: `${user} removed from the activity whitelist.`, ephemeral: true });
  }
  const days = interaction.options.getInteger("days");
  const item = {
    guildId: interaction.guildId, userId: user.id, group: interaction.options.getString("group"), grantedBy: interaction.user.id,
    grantedAt: new Date().toISOString(), expiresAt: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null
  };
  await saveState(state => { state.whitelists[guildUserKey(interaction.guildId, user.id)] = item; return state; });
  const role = await ensureRole(interaction.guild, "Activity Whitelist");
  const member = await interaction.guild.members.fetch(user.id);
  await member.roles.add(role, "Paradise activity whitelist");
  return interaction.reply({ content: `${user} whitelisted for **${item.group}** (${item.expiresAt ? `<t:${Math.floor(Date.parse(item.expiresAt) / 1000)}:R>` : "unlimited"}).`, ephemeral: true });
}

async function handleActivity(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "check") {
    if (!isOwner(interaction) && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return interaction.reply({ content: "Activity checks require Manage Roles.", ephemeral: true });
    }
    const group = interaction.options.getString("group");
    const id = crypto.randomUUID();
    const policy = configForGuild(await loadState(), interaction.guildId).activity || {};
    const deadlineHours = Number(policy.responseDeadlineHours || 24);
    const expiresAt = Date.now() + deadlineHours * 3_600_000;
    await saveState(state => {
      state.activityChecks[id] = { guildId: interaction.guildId, group, startedBy: interaction.user.id, startedAt: new Date().toISOString(), expiresAt, responses: [] };
      return state;
    });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`paradise_activity_present:${id}`).setLabel("I am active / Aktifim").setStyle(ButtonStyle.Success)
    );
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`${group} Activity Check`)
      .setDescription(`Respond within ${deadlineHours} hours. Missing responses create review flags; automatic role changes require explicit dashboard opt-in. Whitelist and LOA exemptions apply.\nDeadline: <t:${Math.floor(expiresAt / 1000)}:R>`)
      .setFooter({ text: "Made by Paradise bot" })], components: [row] });
  }
  const state = await loadState();
  const now = Date.now();
  const rows = [];
  const guildConfig = configForGuild(state, interaction.guildId);
  const quotas = guildConfig.weeklyQuotas || WEEKLY_QUOTAS;
  const promotionMultiplier = Number(guildConfig.activity?.promotionMultiplier || 3);
  for (const member of interaction.guild.members.cache.values()) {
    const quota = Object.entries(quotas).find(([role]) => member.roles.cache.some(item => item.name === role));
    if (!quota) continue;
    const [role, rule] = quota;
    const count = weekActivityCount(state.staffActivity[member.id], rule.key, now);
    const whitelist = guildUserRecord(state.whitelists, interaction.guildId, member.id);
    const exempt = whitelist && (!whitelist.expiresAt || Date.parse(whitelist.expiresAt) > now);
    const recommendation = exempt ? "WHITELIST" : count < rule.minimum ? "DEMOTION REVIEW" : count >= rule.minimum * promotionMultiplier ? "PROMOTION REVIEW" : "OK";
    rows.push(`${member} — ${role}: ${count}/${rule.minimum} — **${recommendation}**`);
  }
  const pendingTickets = Object.values(state.pendingChallenges).filter(item => ["open", "pending"].includes(item.status)).length;
  const missedChecks = Object.values(state.activityChecks).filter(item => item.processedAt && (item.removed || []).length).length;
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ WEEKLY STAFF ACTIVITY")
    .setDescription(`## ◆ Operations snapshot\n- **Pending/open challenge records:** ${pendingTickets}\n- **Activity checks with missed-role actions:** ${missedChecks}\n\n## ◆ Quota review\n${rows.join("\n").slice(0, 3500) || "_No quota roles found._"}\n\n-# Recommendations require manager review; automatic changes require explicit dashboard opt-in.`)
    .setFooter(paradiseFooter("Sunday staff review"))], ephemeral: true });
}

async function handleActivityResponse(interaction) {
  const id = interaction.customId.split(":")[1];
  const state = await loadState();
  const check = state.activityChecks[id];
  if (!check || check.expiresAt < Date.now()) return interaction.reply({ content: "This activity check has expired.", ephemeral: true });
  const responses = new Set(check.responses || []);
  responses.add(interaction.user.id);
  await saveState(current => { current.activityChecks[id] = { ...check, responses: [...responses] }; return current; });
  return interaction.reply({ content: "Activity response recorded. / Aktivite yanıtın kaydedildi.", ephemeral: true });
}

async function handleMainer(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "set") {
    if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
    const code = interaction.options.getString("code").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
    if (!code) return interaction.reply({ content: "Invalid mainer code.", ephemeral: true });
    await saveState(state => {
      state.guildConfigs[interaction.guildId] = state.guildConfigs[interaction.guildId] || structuredClone(state.config || {});
      state.guildConfigs[interaction.guildId].mainerCode = code;
      return state;
    });
  }
  const code = configForGuild(await loadState(), interaction.guildId).mainerCode || "Not configured";
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ PARADISE MAINING GUIDE")
    .setDescription(`# Official code\n\`${code}\`\n\n## ◆ How to main Paradise\n1. Open the **official TSBCC maining channel**.\n2. Run \`/mainclan code:${code} region:EU\`.\n3. Choose only your **approved staff role**.\n4. Keep proof in **mainer-proof** for review.\n\n> **Security:** Paradise never asks for cookies, passwords or tokens.\n\n-# Use only official Discord and Roblox links.`)
    .setFooter(paradiseFooter("Clan operations"))] });
}

async function handleReferee(interaction) {
  if (interaction.options.getSubcommand() === "works") {
    const count = weekActivityCount((await loadState()).staffActivity[interaction.user.id], "referee");
    return interaction.reply({ content: `Your approved referee works this week: **${count}** (minimum: 2).`, ephemeral: true });
  }
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("⚖️ REFEREE GUIDE")
    .setDescription("# Referee Operations\n## ◆ Required flow\n1. Check **profile**, **availability**, **cooldown** and open tickets.\n2. Create or claim the challenge ticket.\n3. Record the complete set and remain neutral.\n4. Submit `/challenge post` with score, spots, proof and ticket ID.\n5. Wait for **Experienced Referee / Referee Manager** approval.\n\n-# Approved posts are copied to referee-works and counted automatically.")
    .addFields(
      { name: "◇ __Trial Referee__", value: "- Must work with a second referee\n- Lower leaderboard ranges only" },
      { name: "◇ __Referee__", value: "- May independently handle **Top 11–30**\n- Top 1–10 requires senior approval" },
      { name: "◇ __Experienced / Manager__", value: "- Reviews pending posts\n- Coaches referees\n- Handles higher-ranked sets" },
      { name: "🛡️ __Non-negotiable standards__", value: "**Neutrality**, complete recording, correct ticket validation, consistent wording and saved transcripts." }
    ).setFooter(paradiseFooter("Referee Operations"))] });
}

async function handleStaffReport(interaction) {
  const reported = interaction.options.getUser("user");
  const category = interaction.guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && channel.name === "TICKET");
  const channel = await interaction.guild.channels.create({
    name: `staff-report-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90),
    type: ChannelType.GuildText, parent: category?.id,
    rateLimitPerUser: 30,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: interaction.guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels] }
    ],
    reason: "Paradise private staff report"
  });
  await channel.send({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Private Staff Report")
    .addFields(
      { name: "Reporter", value: `${interaction.user}` },
      { name: "Reported member", value: `${reported}` },
      { name: "Reason", value: interaction.options.getString("reason").slice(0, 1000) },
      { name: "Proof", value: interaction.options.getString("proof") || "Not supplied" }
    ).setFooter({ text: "Keep evidence private • Made by Paradise bot" })] });
  return interaction.reply({ content: `Private report opened: ${channel}`, ephemeral: true });
}

function helpEmbed(scope, locale = "en") {
  if (String(locale).toLowerCase().startsWith("tr")) {
    const descriptions = {
      community: "# Fieel's Community\n## ◆ Üye komutları\n- `/fima_account` — bağlı Fima hesabı\n- `/fima_ticket` — özel destek menüsü\n- `/fima_help` — ürün ve hesap yardımı\n- `/sendpingroleselector` — bildirim rolleri\n\n## ◆ Yetkili kurulumları\nFima destek panelleri yalnızca Community şablonunda kullanılmalıdır.\n\n-# Gerekli yetki: panel kurulumlarında yönetici; üye yardım komutlarında normal üye.",
      clan: "# Paradise Clan\n## ◆ Oyuncular\n- `/profile create|view|edit|verify-status`\n- `/challenge create` — uygun hedef menüsü\n- `/availability panel` — canlı durum panosu\n\n## ◆ Hoster ve hakemler\n- `/tryout start|result`\n- `/training setup|start|result`\n- `/challenge post|autowin|close`\n\n## ◆ Yönetim\n- `/set ...` kanal eşlemeleri\n- `/relation add|edit|remove|panel`\n- `/loa request|add|approve|deny|remove|panel`\n- `/handbook post`\n\n-# Komut kanalları `/commandchannel` ile sınırlandırılır.",
      tsbtr: "# TSBTR-style Operasyon\n## ◆ Liderlik ve challenge\n- `/challenge create|post|autowin`\n- `/availability panel`\n- `/referee guide|works`\n\n## ◆ Staff\n- `/activity check|summary`\n- `/whitelist add|remove|list`\n- `/loa request|approve|deny|panel`\n\n## ◆ Güvenli kurulum\n- `/setupfieelstsbtr action:preview|repair|guides`\n\n-# Destructive rebuild yalnızca yedek + diff + yazılı son onayla çalışır."
    };
    return new EmbedBuilder().setColor(DEFAULT_PARADISE_BRAND_COLOR)
      .setTitle(`✦ ${scope === "community" ? "COMMUNITY" : scope === "tsbtr" ? "TSBTR-STYLE" : "PARADISE CLAN"} KOMUT REHBERİ`)
      .setDescription(descriptions[scope] || descriptions.clan)
      .setFooter(paradiseFooter("Türkçe yardım"));
  }
  if (scope === "community") {
    return new EmbedBuilder().setColor(DEFAULT_PARADISE_BRAND_COLOR).setTitle("✦ COMMUNITY COMMAND GUIDE")
      .setDescription("# Fieel's Community\n## ◆ Member commands\n- `/fima_account` — linked account; use in **bot-commands**\n- `/fima_ticket` — private support menu; use in **open-ticket**\n- `/fima_help` — Fima product/account help\n- `/fima_support_ai question:<text>` — approved knowledge-base answer\n- `/language choice:<language>` — support language\n\n## ◆ Staff setup\n- `/fima_ticket_setup channel:#open-ticket`\n- `/fima_trust_setup channel:#security-and-trust`\n- `/fima_faq_setup channel:#faq`\n- `/fima_language_setup channel:#choose-language`\n- `/sendpingroleselector` in **choose-pings**\n\n-# Fima commands are reserved for app, licensing, payment and product support.")
      .setFooter(paradiseFooter("Community help"));
  }
  if (scope === "tsbtr") {
    return new EmbedBuilder().setColor(DEFAULT_PARADISE_BRAND_COLOR).setTitle("✦ TSBTR-STYLE COMMAND GUIDE")
      .setDescription("# Large Community Operations\n## ◆ Setup\n- `/setupfieelstsbtr` — backup and preview\n\n## ◆ Leaderboard & referee\n- `/challenge create|post`\n- `/availability panel`\n- `/referee guide|works`\n\n## ◆ Staff\n- `/activity check|summary`\n- `/whitelist add|remove|list`\n- `/loa request|end|panel`\n\n-# This optional future template is separate from the normal Paradise Clan setup.")
      .setFooter(paradiseFooter("TSBTR-style help"));
  }
  return new EmbedBuilder().setColor(DEFAULT_PARADISE_BRAND_COLOR).setTitle("✦ PARADISE CLAN COMMAND GUIDE")
    .setDescription("# Clan Operations\n## ◆ Fighters\n- `/profile create` — verify Roblox, choose region and create your fighter card\n- `/profile view [user]` — show Profile ID, Roblox, region and full rank\n- `/verifyroblox username:<name>` then `/verifyrobloxcheck` — alternate verification path\n- `/challenge create opponent:<user> region:<region>` in **challenge-ticket**\n- `/availability panel` in **availability**\n\n## ◆ Hoster & staff\n- `/tryout start link:<url>` in **tryout**\n- `/tryout result user:<user> stage level strength`\n- `/paradisetraining start link:<url>` in **training**\n- `/challenge post winner loser score ...` in **referee-post**\n- `/tournament ...`, `/giveaway create`, `/gamenight start`, `/event create`\n\n## ◆ Clan management\n- `/relation add|remove|panel` → **clan-relations**\n- `/mainer set|guide` → **maining-guide**\n- `/findfcw` → **find-a-fcw**\n- `/loa request|end|panel` → **loa**\n- `/activity check|summary` → **activity-check**\n\n-# Restrict command locations with `/commandchannel`.")
    .setFooter(paradiseFooter("Clan help"));
}

function helpButtons(scope = "clan") {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("paradise_help:community").setLabel("Community").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("paradise_help:clan").setLabel("Clan").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("paradise_help:tsbtr").setLabel("TSBTR-style").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`paradise_help_lang:en:${scope}`).setLabel("English").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`paradise_help_lang:tr:${scope}`).setLabel("Türkçe").setStyle(ButtonStyle.Secondary)
  );
}

async function handleHelp(interaction) {
  const turkish = String(interaction.locale || "").toLowerCase().startsWith("tr");
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ WHAT DO YOU NEED HELP WITH?")
      .setDescription(turkish
        ? "Bir sistem seçin. Komutun ne yaptığı, gereken yetki ve kullanılacağı kanal yalnızca size gösterilir."
        : "Choose a system below. Its command guide is shown privately, including what each command does, required permissions and where it belongs.")
      .setFooter(paradiseFooter("Interactive command directory"))],
    components: [helpButtons()],
    ephemeral: true
  });
}

async function publishSetupGuides(guild, mode) {
  const channel = await configuredChannel(guild, "command_guide_channel", "command-guide");
  if (!channel?.isTextBased?.()) return null;
  const message = await channel.send({
    embeds: [helpEmbed(mode).setColor(await paradiseBrandColor())],
    components: [helpButtons(mode)]
  });
  await saveState(state => {
    state.guildConfigs[guild.id] = state.guildConfigs[guild.id] || structuredClone(state.config || {});
    state.guildConfigs[guild.id].commandGuideMessageIds = state.guildConfigs[guild.id].commandGuideMessageIds || {};
    state.guildConfigs[guild.id].commandGuideMessageIds[mode] = message.id;
    return state;
  });
  return message;
}

async function configuredChannel(guild, mappingKey, fallbackName) {
  const state = await loadState();
  const configuredId = configForGuild(state, guild.id).channelMappings?.[mappingKey];
  if (configuredId) {
    const configured = guild.channels.cache.get(configuredId) || await guild.channels.fetch(configuredId).catch(() => null);
    if (configured?.isTextBased?.()) return configured;
  }
  return guild.channels.cache.find(item => item.name === fallbackName && item.isTextBased?.()) || null;
}

async function saveChallengeTranscript(guild, channel, ticket, trigger) {
  if (!channel?.isTextBased?.()) return null;
  const state = await loadState();
  const guildConfig = configForGuild(state, guild.id);
  if (guildConfig.operations?.challengeTranscripts === false) return null;
  const destination = await configuredChannel(guild, "challenge_transcripts_channel", "challenge-ticket-transcripts");
  if (!destination) return null;
  const fetched = await channel.messages.fetch({ limit: 100 });
  const messages = [...fetched.values()].reverse();
  const lines = [
    `Paradise challenge transcript`,
    `Ticket: ${ticket.ticketId || channel.id}`,
    `Challenger: ${ticket.challengerId || "unknown"}`,
    `Challenged: ${ticket.opponentId || "unknown"}`,
    `Status: ${ticket.status || "unknown"}`,
    `Trigger: ${trigger}`,
    `Created: ${ticket.openedAt || "unknown"}`,
    `Closed: ${ticket.closedAt || new Date().toISOString()}`,
    "",
    ...messages.map(message => {
      const timestamp = message.createdAt?.toISOString?.() || "unknown";
      const author = message.author ? `${message.author.username} (${message.author.id})` : "unknown";
      const content = String(message.cleanContent || message.content || "[embed / attachment]").replace(/\r?\n/g, " ");
      const attachments = [...message.attachments.values()].map(item => item.url).join(" ");
      return `[${timestamp}] ${author}: ${content}${attachments ? ` | ${attachments}` : ""}`;
    })
  ];
  const transcriptMessage = await destination.send({
    content: `Challenge transcript · Ticket **${ticket.ticketId || channel.id}** · ${trigger}`,
    files: [{ attachment: Buffer.from(lines.join("\n"), "utf8"), name: `paradise-challenge-${ticket.ticketId || channel.id}.txt` }]
  });
  await saveState(next => {
    next.transcripts[ticket.ticketId || channel.id] = {
      type: "challenge",
      guildId: guild.id,
      sourceChannelId: channel.id,
      destinationChannelId: destination.id,
      messageId: transcriptMessage.id,
      trigger,
      savedAt: new Date().toISOString()
    };
    return next;
  });
  return transcriptMessage;
}

const GUIDE_POSTS = Object.freeze([
  {
    key: "rules",
    channel: "rules",
    title: "✦ PARADISE COMMUNITY RULES",
    body: "# English\n## Respect & safety\n- No harassment, threats, hate speech, scams, account theft or malicious links.\n- Never request cookies, passwords, tokens or private authentication data.\n- Use approved media channels for links and attachments.\n- Staff actions require evidence and remain auditable.\n\n# Türkçe\n## Saygı ve güvenlik\n- Taciz, tehdit, nefret söylemi, dolandırıcılık ve zararlı bağlantılar yasaktır.\n- Cookie, şifre, token veya özel giriş bilgisi istemeyin.\n- Link ve dosyaları yalnızca izin verilen kanallarda paylaşın.\n- Yetkili işlemleri kanıtlı ve denetlenebilir olmalıdır."
  },
  {
    key: "challenge_rules",
    channel: "challenge-rules",
    title: "⚔️ CHALLENGE HANDBOOK",
    body: "# Challenge range\n- **Top 1–10:** 1 position\n- **Top 11–20:** 2 positions\n- **Top 21–30:** 3 positions\n- **Unranked:** #29 or #30 only\n\n## Before opening / Açmadan önce\n- Complete `/profile create`.\n- Cooldown, immunity, LOA and open-ticket state are checked twice.\n- Record the full set and keep proof in the ticket.\n\n## Result approval\nTrial Referee and Referee cannot approve results. Experienced Referee, Head Referee or Referee Manager approval is required.\n\n-# Süreler Discord timestamp ile yerel saat diliminde gösterilir."
  },
  {
    key: "referee_guide",
    channel: "referee-guide",
    title: "⚖️ REFEREE OPERATIONS GUIDE",
    body: "# Neutrality first / Tarafsızlık önce\n1. Check both Paradise profiles.\n2. Check availability, ranks and ticket context.\n3. Record the complete match.\n4. Submit `/challenge post` or `/challenge autowin` inside the ticket.\n5. Wait for authorized approval.\n\n## Authority\n- **Trial Referee:** assisted lower-range sets; no result approval.\n- **Referee:** normal sets; no result approval.\n- **Experienced Referee:** may review and approve.\n- **Referee Manager / Head Referee:** manages disputes and audit decisions.\n\n-# Approved work is counted automatically; denied work remains in the audit trail."
  },
  {
    key: "training_rules",
    channel: "training-hoster-rules",
    title: "✦ TRAINING HOSTER HANDBOOK",
    body: "# Training standard\n- Keep teams balanced and the session organized.\n- Never humiliate participants.\n- Record host, co-host, duration, participants, score, MVPs and proof.\n- Use `/training start`; finish with `/training result`.\n\n# Eğitim standardı\n- Takımları dengeli ve oturumu düzenli tutun.\n- Katılımcıları aşağılamayın.\n- Hoster, co-hoster, süre, katılımcı, skor, MVP ve kanıtı kaydedin.\n- Başlatmak için `/training start`, bitirmek için `/training result` kullanın."
  },
  {
    key: "tryout_rules",
    channel: "tryout-hoster-rules",
    title: "✦ TRYOUT HOSTER HANDBOOK",
    body: "# Evaluate play, not only wins\nObserve RC timing, catches, dash reactions, movement, pressure, adaptation and game sense.\n\n## Required flow\n1. Start with `/tryout start`.\n2. Lock the server after the entry window.\n3. Submit Stage → Level → Strength in order.\n4. Never assign above your configured authority.\n5. Wait for manager approval.\n\n-# Kazanmak tek başına yüksek rank garantisi değildir."
  },
  {
    key: "role_guide",
    channel: "role-guide",
    title: "✦ ROLE & AUTHORITY GUIDE",
    body: "# Rank model\n`Stage 0` is best. Progression inside a stage is **Low → Mid → High**, and inside each level **Weak → Stable → Strong**.\n\n## Staff boundaries\n- Trial roles have limited visibility and no high-impact approvals.\n- Hoster roles use bot workflows instead of manual rank-role management.\n- Only configured managers can approve scores, LOA and destructive setup.\n\n-# Rol yetkileri metinden değil, bot kontrolleri ve Discord izinlerinden uygulanır."
  },
  {
    key: "faq_trust",
    channel: "security-and-trust",
    title: "🛡️ TRUST & SECURITY",
    body: "# Paradise and Fima safety\n- Paradise never asks for cookies, passwords or Discord/Roblox tokens.\n- Fima downloads must come from official channels only.\n- Screenshots are not automatic proof of Roblox ownership or payment.\n- Suspicious links should be reported through the support ticket panel.\n\n# Güvenlik\n- Paradise cookie, şifre veya token istemez.\n- Fima dosyalarını yalnızca resmi kanallardan indirin.\n- Şüpheli bağlantıları destek ticket sistemiyle bildirin."
  },
  {
    key: "mainer_guide",
    channel: "maining-guide",
    title: "✦ PARADISE MAINING GUIDE",
    body: "# Official flow\nUse `/mainer guide` to display the current Paradise code and approved TSBCC command format.\n\n- Keep proof in **mainer-proof**.\n- Never share account credentials.\n- Staff role selection must match your approved role.\n\n-# Güncel kod bot state’inden alınır; eski mesajlardaki kodlara güvenmeyin."
  },
  {
    key: "availability_guide",
    channel: "availability",
    title: "✦ AVAILABILITY GUIDE",
    body: "# What the board means\n- **Cooldown:** player cannot initiate a challenge until expiry.\n- **Immunity:** player cannot be challenged until expiry.\n- **Being challenged:** an open ticket blocks another challenge.\n- **LOA:** shown separately when it affects ranked availability.\n\n-# Times use Discord relative timestamps and adapt to every user's timezone."
  },
  {
    key: "loa_guide",
    channel: "loa",
    title: "🌙 LOA GUIDE",
    body: "# Leave of absence\nUse `/loa request` with the duration and reason. A manager must approve it.\n\n## Separate from challenge availability\nLOA is a staff attendance record. Cooldown and immunity belong to the challenge system.\n\n-# İzin süresi dolduğunda durum otomatik olarak expired olur; yönetici erken kaldırabilir."
  }
]);

async function publishGuidePost(guild, definition) {
  const channel = guild.channels.cache.find(item => item.name === definition.channel && item.isTextBased?.());
  if (!channel) return false;
  const state = await loadState();
  const oldId = configForGuild(state, guild.id).guideMessageIds?.[definition.key];
  let message = oldId ? await channel.messages.fetch(oldId).catch(() => null) : null;
  const payload = {
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(definition.title)
      .setDescription(definition.body.slice(0, 4096)).setFooter(paradiseFooter("TR / EN handbook")).setTimestamp()]
  };
  if (message) await message.edit(payload); else message = await channel.send(payload);
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].guideMessageIds = next.guildConfigs[guild.id].guideMessageIds || {};
    next.guildConfigs[guild.id].guideMessageIds[definition.key] = message.id;
    return next;
  });
  return true;
}

async function publishAllGuides(guild, mode) {
  let posted = 0;
  if (await publishSetupGuides(guild, mode)) posted += 1;
  for (const definition of GUIDE_POSTS) {
    if (await publishGuidePost(guild, definition).catch(() => false)) posted += 1;
  }
  return { posted, mode };
}

export async function publishParadiseGuidesFromDashboard(guild, mode = "clan") {
  if (!guild) {
    const error = new Error("paradise_guild_unavailable");
    error.code = "paradise_guild_unavailable";
    throw error;
  }
  if (!["community", "clan", "tsbtr"].includes(mode)) {
    const error = new Error("invalid_paradise_setup_mode");
    error.code = "invalid_paradise_setup_mode";
    throw error;
  }
  return paradiseGuildContext.run(guild.id, () => publishAllGuides(guild, mode));
}

function canManageClan(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator)
    || member.roles.cache.some(role => ["Owner", "Admin", "Overseer", "Community Manager"].includes(role.name));
}

function relationshipLines(entries, settings = {}) {
  const rows = Object.values(entries || {}).sort((a, b) =>
    settings.sortMode === "updated"
      ? Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0)
      : a.clan.localeCompare(b.clan)
  );
  return rows.length
    ? rows.map(item => `◆ **${item.clan}**${item.status ? ` · \`${item.status}\`` : ""}${settings.showRepresentatives !== false && item.representativeId ? ` — <@${item.representativeId}>` : ""}${settings.displayInvites !== false && item.invite ? `\n  [Server invite](${item.invite})` : ""}${item.note ? `\n  _${item.note}_` : ""}`).join("\n")
    : "_None configured._";
}

async function updateRelationsPanel(guild) {
  const channel = await configuredChannel(guild, "relation_panel_channel", "clan-relations");
  if (!channel?.isTextBased?.()) return null;
  const state = await loadState();
  const guildConfig = configForGuild(state, guild.id);
  const relationSettings = guildConfig.relationSettings || {};
  const relationState = state.relations?.[guild.id] || (state.relations?.allies || state.relations?.enemies ? state.relations : {});
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("🤝 PARADISE CLAN RELATIONS")
    .setDescription("Relations are managed by authorized clan leadership and update automatically.")
    .addFields(
      { name: "◆ __Currently Allies__", value: relationshipLines(relationState.allies, relationSettings).slice(0, 1024) },
      { name: "⚔️ __Enemy Clans__", value: relationshipLines(relationState.enemies, relationSettings).slice(0, 1024) }
    )
    .setFooter(paradiseFooter("Use /relation"));
  let message = guildConfig.relationsMessageId
    ? await channel.messages.fetch(guildConfig.relationsMessageId).catch(() => null)
    : null;
  if (message) await message.edit({ embeds: [embed] }); else message = await channel.send({ embeds: [embed] });
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].relationsMessageId = message.id;
    return next;
  });
  return message;
}

async function handleRelation(interaction) {
  if (!canManageClan(interaction.member)) return interaction.reply({ content: "Clan management role required.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  if (sub !== "panel") {
    const type = interaction.options.getString("type");
    const clan = interaction.options.getString("clan").trim();
    const invite = interaction.options.getString("invite")?.trim() || null;
    if (invite && !/^https:\/\/(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+\/?$/i.test(invite)) {
      return interaction.reply({ content: "Invite must be an official Discord invite URL.", ephemeral: true });
    }
    const key = clan.toLocaleLowerCase("en-US");
    await saveState(state => {
      if (state.relations.allies || state.relations.enemies) {
        state.relations[interaction.guildId] = {
          allies: structuredClone(state.relations.allies || {}),
          enemies: structuredClone(state.relations.enemies || {})
        };
        delete state.relations.allies;
        delete state.relations.enemies;
      }
      state.relations[interaction.guildId] = state.relations[interaction.guildId] || { allies: {}, enemies: {} };
      const relationState = state.relations[interaction.guildId];
      relationState.allies = relationState.allies || {};
      relationState.enemies = relationState.enemies || {};
      const bucket = type === "ally" ? relationState.allies : relationState.enemies;
      const opposite = type === "ally" ? relationState.enemies : relationState.allies;
      if (sub === "remove") delete bucket[key];
      else {
        delete opposite[key];
        const existing = bucket[key] || {};
        bucket[key] = {
          ...existing,
          clan,
          representativeId: interaction.options.getUser("representative")?.id || existing.representativeId || null,
          invite: invite || existing.invite || null,
          note: interaction.options.getString("note") || existing.note || null,
          status: interaction.options.getString("status") || existing.status || "active",
          updatedBy: interaction.user.id,
          updatedAt: new Date().toISOString()
        };
      }
      return state;
    });
  }
  const panel = await updateRelationsPanel(interaction.guild);
  return interaction.reply({ content: panel ? `Relations board updated: ${panel.url}` : "Create a `clan-relations` channel first.", ephemeral: true });
}

function rankLabel(state, userId, guildId = PARADISE_TEST_GUILD_ID) {
  const spot = leaderboardForGuild(state, guildId)[userId]?.spot;
  return spot ? `#${spot}` : "Unranked";
}

export function timedAvailabilityLines(state, field, now = Date.now(), guildId = PARADISE_TEST_GUILD_ID) {
  return Object.entries(leaderboardForGuild(state, guildId))
    .map(([userId, item]) => ({ userId, spot: item.spot, expiresAt: Number(item.availability?.[field] || 0) }))
    .filter(item => item.expiresAt > now)
    .sort((a, b) => a.expiresAt - b.expiresAt)
    .map(item => `• <@${item.userId}> | **${item.spot ? `Rank #${item.spot}` : "Unranked"}** expires <t:${Math.floor(item.expiresAt / 1000)}:R>`)
    .join("\n") || "_None._";
}

export function challengedLines(state, guildId = PARADISE_TEST_GUILD_ID) {
  return Object.values(state.pendingChallenges || {})
    .filter(item => belongsToGuild(item, guildId) && item.status === "open")
    .map(item => `<@${item.opponentId}> (${rankLabel(state, item.opponentId, guildId)}) is being challenged by <@${item.challengerId}> (${rankLabel(state, item.challengerId, guildId)})\n-# Ticket ID: ${item.ticketId}`)
    .join("\n\n") || "_No active challenge tickets._";
}

function rankedLoaLines(state, guildId = PARADISE_TEST_GUILD_ID, now = Date.now()) {
  const leaderboard = leaderboardForGuild(state, guildId);
  const rows = Object.values(state.loa || {})
    .filter(item => belongsToGuild(item, guildId) && item.status === "approved" && Number(item.expiresAt) > now && leaderboard[item.userId]?.spot)
    .sort((a, b) => Number(a.expiresAt) - Number(b.expiresAt));
  return rows.length
    ? rows.map(item => `• <@${item.userId}> | **Rank #${leaderboard[item.userId].spot}** unavailable until <t:${Math.floor(item.expiresAt / 1000)}:R>`).join("\n")
    : "_None._";
}

async function updateAvailabilityPanel(guild) {
  const channel = await configuredChannel(guild, "availability_channel", "availability");
  if (!channel?.isTextBased?.()) return null;
  const state = await loadState();
  const guildConfig = configForGuild(state, guild.id);
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ CHALLENGE AVAILABILITY")
    .setDescription(("## ◆ Current Cooldowns\n" + timedAvailabilityLines(state, "cooldownUntil", Date.now(), guild.id)
      + "\n\n## ◆ Current Immunity\n" + timedAvailabilityLines(state, "immunityUntil", Date.now(), guild.id)
      + "\n\n## ◆ Being Challenged\n" + challengedLines(state, guild.id)
      + "\n\n## ◆ Ranked LOA Impact\n" + rankedLoaLines(state, guild.id)
      + "\n\n-# Full LOA records remain in the separate LOA panel.").slice(0, 4096))
    .setFooter(paradiseFooter("Automatically refreshed by challenge results"));
  let message = guildConfig.availabilityMessageId
    ? await channel.messages.fetch(guildConfig.availabilityMessageId).catch(() => null)
    : null;
  const components = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("paradise_availability_refresh").setLabel("Refresh availability").setStyle(ButtonStyle.Secondary)
  )];
  if (message) await message.edit({ embeds: [embed], components }); else message = await channel.send({ embeds: [embed], components });
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].availabilityMessageId = message.id;
    return next;
  });
  return message;
}

async function handleAvailability(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub !== "panel" && !await canApproveReferee(interaction.member)) {
    return interaction.reply({ content: "Referee Manager or administrator required.", ephemeral: true });
  }
  if (["cooldown", "immunity"].includes(sub)) {
    const user = interaction.options.getUser("user");
    const rank = interaction.options.getInteger("rank");
    const expiresAt = Date.now() + interaction.options.getInteger("hours") * 3_600_000;
    await saveState(state => {
      const leaderboard = ensureLeaderboardForGuild(state, interaction.guildId);
      const current = leaderboard[user.id] || { wins: 0, losses: 0, history: [] };
      if (rank) current.spot = rank;
      current.availability = current.availability || {};
      current.availability[sub === "cooldown" ? "cooldownUntil" : "immunityUntil"] = expiresAt;
      leaderboard[user.id] = current;
      return state;
    });
  } else if (sub === "clear") {
    const user = interaction.options.getUser("user");
    const type = interaction.options.getString("type");
    await saveState(state => {
      const leaderboard = ensureLeaderboardForGuild(state, interaction.guildId);
      if (leaderboard[user.id]?.availability) {
        delete leaderboard[user.id].availability[type === "cooldown" ? "cooldownUntil" : "immunityUntil"];
      }
      return state;
    });
  }
  const panel = await updateAvailabilityPanel(interaction.guild);
  return interaction.reply({ content: panel ? `Availability board updated: ${panel.url}` : "Create an `availability` channel first.", ephemeral: true });
}

function activeLoaLines(state, guildId = PARADISE_TEST_GUILD_ID) {
  const now = Date.now();
  const rows = Object.values(state.loa || {})
    .filter(item => belongsToGuild(item, guildId) && item.status === "approved" && item.expiresAt > now)
    .sort((a, b) => a.expiresAt - b.expiresAt);
  return rows.length
    ? rows.map(item => `◆ <@${item.userId}>${item.robloxUsername ? ` · **${item.robloxUsername}**` : ""}${item.region ? ` · ${item.region}` : ""}\n- **Ends:** <t:${Math.floor(item.expiresAt / 1000)}:F> (<t:${Math.floor(item.expiresAt / 1000)}:R>)\n- **Note:** ${item.reason || item.note || "No note"}${item.decidedBy ? `\n- **Approved by:** <@${item.decidedBy}>` : ""}`).join("\n\n")
    : "_No active staff LOAs._";
}

async function updateLoaPanel(guild) {
  const channel = await configuredChannel(guild, "loa_channel", "loa");
  if (!channel?.isTextBased?.()) return null;
  const state = await loadState();
  const guildConfig = configForGuild(state, guild.id);
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("🌙 STAFF LEAVE OF ABSENCE")
    .setDescription(("## ◆ Active LOAs\n" + activeLoaLines(state, guild.id) + "\n\n-# LOA is separate from challenge cooldown and immunity.").slice(0, 4096))
    .setFooter(paradiseFooter("Staff attendance"));
  let message = guildConfig.loaMessageId
    ? await channel.messages.fetch(guildConfig.loaMessageId).catch(() => null)
    : null;
  if (message) await message.edit({ embeds: [embed] }); else message = await channel.send({ embeds: [embed] });
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].loaMessageId = message.id;
    return next;
  });
  return message;
}

async function handleLoa(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "request") {
    const state = await loadState();
    const days = interaction.options.getInteger("days");
    const guildConfig = configForGuild(state, interaction.guildId);
    const maxDays = Number(guildConfig.loa?.maxDays || 90);
    if (days > maxDays) return interaction.reply({ content: `Maximum configured LOA is **${maxDays} days**.`, ephemeral: true });
    const evidence = interaction.options.getString("evidence") || null;
    if (guildConfig.loa?.requireEvidence && !evidence) {
      return interaction.reply({ content: "Evidence is required by the current LOA policy.", ephemeral: true });
    }
    const profile = await verifiedProfile(interaction.user.id);
    const expiresAt = Date.now() + days * 86_400_000;
    const record = {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      reason: interaction.options.getString("reason"),
      evidence,
      robloxUsername: profile?.robloxUsername || null,
      region: profile?.region || null,
      startsAt: Date.now(),
      expiresAt,
      status: "pending",
      requestedAt: new Date().toISOString()
    };
    await saveState(state => { state.loa[guildUserKey(interaction.guildId, interaction.user.id)] = record; return state; });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`paradise_loa_approve:${interaction.user.id}`).setLabel("Approve LOA").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`paradise_loa_deny:${interaction.user.id}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
    );
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("LOA Request — Pending")
        .setDescription(`**Staff:** ${interaction.user}\n**Ends:** <t:${Math.floor(expiresAt / 1000)}:F>\n**Reason:** ${record.reason}`)
        .setFooter(paradiseFooter("Manager approval required"))],
      components: [row]
    });
  }
  if (["add", "approve", "deny", "remove"].includes(sub)) {
    if (!canManageClan(interaction.member)) return interaction.reply({ content: "Clan management role required.", ephemeral: true });
    const user = interaction.options.getUser("user");
    const currentState = await loadState();
    const current = guildUserRecord(currentState.loa, interaction.guildId, user.id);
    if (sub === "add") {
      const days = interaction.options.getInteger("days");
      const profile = await verifiedProfile(user.id);
      const record = {
        guildId: interaction.guildId,
        userId: user.id,
        note: interaction.options.getString("note"),
        reason: interaction.options.getString("note"),
        evidence: interaction.options.getString("evidence") || null,
        robloxUsername: profile?.robloxUsername || null,
        region: profile?.region || null,
        startsAt: Date.now(),
        expiresAt: Date.now() + days * 86_400_000,
        status: "approved",
        decidedBy: interaction.user.id,
        decidedAt: new Date().toISOString(),
        requestedAt: new Date().toISOString()
      };
      await saveState(state => { state.loa[guildUserKey(interaction.guildId, user.id)] = record; return state; });
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const role = await ensureRole(interaction.guild, "LOA");
      if (member) await member.roles.add(role).catch(() => {});
    } else {
      if (!current) return interaction.reply({ content: "No LOA record exists for that user.", ephemeral: true });
      const status = sub === "approve" ? "approved" : sub === "deny" ? "denied" : "removed";
      await saveState(state => {
        const key = guildUserKey(interaction.guildId, user.id);
        state.loa[key] = {
          ...guildUserRecord(state.loa, interaction.guildId, user.id),
          guildId: interaction.guildId,
          status,
          decisionReason: interaction.options.getString("reason") || null,
          decidedBy: interaction.user.id,
          decidedAt: new Date().toISOString()
        };
        return state;
      });
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const role = interaction.guild.roles.cache.find(item => item.name === "LOA");
      if (status === "approved") {
        const loaRole = role || await ensureRole(interaction.guild, "LOA");
        if (member) await member.roles.add(loaRole).catch(() => {});
      } else if (member && role) await member.roles.remove(role).catch(() => {});
    }
    const panel = await updateLoaPanel(interaction.guild);
    return interaction.reply({ content: `LOA **${sub}** completed for ${user}.${panel ? ` Board: ${panel.url}` : ""}`, ephemeral: true });
  }
  if (sub === "end") {
    await saveState(state => {
      const key = guildUserKey(interaction.guildId, interaction.user.id);
      const record = guildUserRecord(state.loa, interaction.guildId, interaction.user.id);
      if (record) state.loa[key] = { ...record, guildId: interaction.guildId, status: "ended" };
      return state;
    });
    const role = interaction.guild.roles.cache.find(item => item.name === "LOA");
    if (role && interaction.member.roles.cache.has(role.id)) await interaction.member.roles.remove(role).catch(() => {});
  }
  const panel = await updateLoaPanel(interaction.guild);
  return interaction.reply({ content: panel ? `LOA board updated: ${panel.url}` : "Create an `loa` channel first.", ephemeral: true });
}

async function handleLoaDecision(interaction) {
  if (!canManageClan(interaction.member)) return interaction.reply({ content: "Clan management role required.", ephemeral: true });
  const [action, userId] = interaction.customId.replace("paradise_loa_", "").split(":");
  const state = await loadState();
  const record = guildUserRecord(state.loa, interaction.guildId, userId);
  if (!record || record.status !== "pending") return interaction.reply({ content: "This LOA request is no longer pending.", ephemeral: true });
  await saveState(next => {
    next.loa[guildUserKey(interaction.guildId, userId)] = { ...record, guildId: interaction.guildId, status: action === "approve" ? "approved" : "denied", decidedBy: interaction.user.id, decidedAt: new Date().toISOString() };
    return next;
  });
  if (action === "approve") {
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    const role = await ensureRole(interaction.guild, "LOA");
    if (member && role) await member.roles.add(role).catch(() => {});
  }
  await updateLoaPanel(interaction.guild).catch(() => {});
  return interaction.update({
    embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(await paradiseBrandColor())
      .setTitle(action === "approve" ? "LOA Request — Approved" : "LOA Request — Denied")],
    components: []
  });
}

async function handleFindFcw(interaction) {
  if (!interaction.member.roles.cache.some(role => ["Owner", "Overseer", "War Hoster"].includes(role.name))
    && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "War Hoster or owner role required.", ephemeral: true });
  }
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("⚔️ FCW SEARCH OPEN")
    .setDescription(`## ◆ Request\n- **Region:** ${interaction.options.getString("region").toUpperCase()}\n- **Format:** ${interaction.options.getString("format") || "Flexible"}\n\n> Paradise only contacts clans that explicitly opted into the FCW directory.\n\n-# No server scraping • No unsolicited DMs`)
    .setFooter(paradiseFooter("Opt-in matching"))] });
}

async function handleCommandChannel(interaction) {
  if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  const state = await loadState();
  const current = configForGuild(state, interaction.guildId).commandChannels || {};
  if (sub === "list") {
    const lines = Object.entries(current).map(([command, ids]) => `/${command}: ${ids.map(id => `<#${id}>`).join(", ")}`);
    return interaction.reply({ content: lines.join("\n") || "No command-channel restrictions configured.", ephemeral: true });
  }
  const command = interaction.options.getString("command").trim().replace(/^\//, "").toLowerCase();
  await saveState(next => {
    next.guildConfigs[interaction.guildId] = next.guildConfigs[interaction.guildId] || structuredClone(next.config || {});
    const mapping = next.guildConfigs[interaction.guildId].commandChannels || {};
    const ids = new Set(mapping[command] || []);
    if (sub === "add") ids.add(interaction.channelId); else ids.delete(interaction.channelId);
    if (ids.size) mapping[command] = [...ids]; else delete mapping[command];
    next.guildConfigs[interaction.guildId].commandChannels = mapping;
    return next;
  });
  return interaction.reply({ content: sub === "add" ? `/${command} is now allowed in this channel.` : `This channel was removed from /${command}.`, ephemeral: true });
}

async function postChallengeCreatePanel(guild, channel) {
  const state = await loadState();
  const oldId = configForGuild(state, guild.id).challengeCreatePanelMessageId;
  let message = oldId ? await channel.messages.fetch(oldId).catch(() => null) : null;
  const payload = {
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("⚔️ CREATE A RANKED CHALLENGE")
      .setDescription("# Ready to challenge?\nParadise will check your completed profile, leaderboard range, cooldown, opponent immunity, LOA and open tickets.\n\n## ◆ Before you continue\n- Record the complete set.\n- Keep evidence inside the ticket.\n- Result approval is restricted to senior referee roles.\n\n-# Hedef seçimi ve ticket açılışı sırasında durum iki kez kontrol edilir.")
      .setFooter(paradiseFooter("Guided challenge flow"))],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("paradise_challenge_open").setLabel("Choose an eligible opponent").setStyle(ButtonStyle.Primary)
    )]
  };
  if (message) await message.edit(payload); else message = await channel.send(payload);
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].challengeCreatePanelMessageId = message.id;
    return next;
  });
  return message;
}

function canManageCompetitiveBoards(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator)
    || member.permissions.has(PermissionsBitField.Flags.ManageGuild)
    || member.roles.cache.some(role => [
      "Owner", "Overseer", "Community Manager", "Training Manager", "War Manager",
      "Roster Manager", "Leaderboard Updater", "Referee Manager"
    ].includes(role.name));
}

function normalizeLineupEntries(entries = []) {
  return entries.map(entry => typeof entry === "string" ? { userId: entry } : entry)
    .filter(entry => entry?.userId);
}

async function logParadiseAction(guild, mappingKey, fallbackName, title, description) {
  const channel = await configuredChannel(guild, mappingKey, fallbackName);
  if (!channel?.isTextBased?.()) return null;
  return channel.send({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(title)
      .setDescription(description).setFooter(paradiseFooter("Private operations log")).setTimestamp()]
  }).catch(() => null);
}

async function updateLineupPanel(guild, board) {
  const state = await loadState();
  const entries = normalizeLineupEntries(state.lineups?.[guild.id]?.[board] || []);
  const mappingKey = board === "war" ? "war_lineup_channel" : "main_lineup_channel";
  const channel = await configuredChannel(guild, mappingKey, board === "war" ? "war-lineup" : "main-line");
  if (!channel) return null;
  const guildConfig = configForGuild(state, guild.id);
  const messageKey = `${board}LineupMessageId`;
  let message = guildConfig[messageKey] ? await channel.messages.fetch(guildConfig[messageKey]).catch(() => null) : null;
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(board === "war" ? "⚔ PARADISE WAR LINEUP" : "♟ PARADISE MAIN LINEUP")
    .setDescription(entries.length
      ? entries.map((entry, index) => `**${index + 1}.** <@${entry.userId}>${entry.role ? ` · **${entry.role}**` : ""}${entry.note ? `\n-# ${entry.note}` : ""}`).join("\n")
      : "_No members assigned yet._")
    .setFooter(paradiseFooter("Managed with /lineup"))
    .setTimestamp();
  if (message) await message.edit({ embeds: [embed] }); else message = await channel.send({ embeds: [embed] });
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id][messageKey] = message.id;
    return next;
  });
  return message;
}

async function handleLineup(interaction) {
  if (!canManageCompetitiveBoards(interaction.member)) return interaction.reply({ content: "Roster or server manager authority required.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  const board = interaction.options.getString("board") || "main";
  if (sub === "panel" || sub === "repost") {
    const panel = await updateLineupPanel(interaction.guild, board);
    return interaction.reply({ content: panel ? `${board} lineup refreshed.` : "Map the lineup channel first.", ephemeral: true });
  }
  const user = interaction.options.getUser("user");
  const requestedPosition = interaction.options.getInteger("position");
  const role = interaction.options.getString("role");
  const note = interaction.options.getString("note");
  let affectedUserId = user?.id || null;
  let found = true;
  await saveState(state => {
    state.lineups[interaction.guildId] = state.lineups[interaction.guildId] || { main: [], war: [] };
    const entries = normalizeLineupEntries(state.lineups[interaction.guildId][board] || []);
    if (sub === "clear") {
      const index = requestedPosition - 1;
      const removed = entries.splice(index, 1)[0];
      affectedUserId = removed?.userId || null;
      found = Boolean(removed);
    } else {
      const existingIndex = entries.findIndex(entry => entry.userId === user.id);
      const existing = existingIndex >= 0 ? entries.splice(existingIndex, 1)[0] : null;
      if (sub === "remove") {
        found = Boolean(existing);
      } else if (sub === "edit") {
        found = Boolean(existing);
        if (existing) {
          entries.splice(existingIndex, 0, {
            ...existing,
            ...(role !== null ? { role } : {}),
            ...(note !== null ? { note } : {}),
            updatedBy: interaction.user.id,
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        const index = requestedPosition ? Math.min(entries.length, requestedPosition - 1) : entries.length;
        entries.splice(index, 0, {
          ...(existing || {}),
          userId: user.id,
          role: role ?? existing?.role ?? null,
          note: note ?? existing?.note ?? null,
          updatedBy: interaction.user.id,
          updatedAt: new Date().toISOString()
        });
      }
    }
    state.lineups[interaction.guildId][board] = entries;
    return state;
  });
  if (!found) return interaction.reply({ content: "That lineup member or slot does not exist. Nothing changed.", ephemeral: true });
  await updateLineupPanel(interaction.guild, board).catch(() => {});
  const actionText = sub === "remove" || sub === "clear" ? "removed from" : sub === "edit" ? "updated in" : "saved to";
  await logParadiseAction(interaction.guild, board === "war" ? "war_logs_channel" : "roster_logs_channel", board === "war" ? "war-logs" : "roster-logs",
    "Lineup record updated", `<@${affectedUserId}> was **${actionText}** the **${board} lineup** by <@${interaction.user.id}>.`);
  return interaction.reply({ content: `<@${affectedUserId}> ${actionText} the **${board} lineup**.`, ephemeral: true });
}

async function updateRosterPanel(guild) {
  const state = await loadState();
  const entries = Object.values(state.rosters?.[guild.id] || {}).sort((a, b) => String(a.region).localeCompare(String(b.region)) || a.addedAt.localeCompare(b.addedAt));
  const channel = await configuredChannel(guild, "roster_channel", "eu-rosters");
  if (!channel) return null;
  const guildConfig = configForGuild(state, guild.id);
  let message = guildConfig.rosterMessageId ? await channel.messages.fetch(guildConfig.rosterMessageId).catch(() => null) : null;
  const description = entries.length
    ? entries.map(item => `**${item.region}** · <@${item.userId}>${item.rank ? ` · **${item.rank}**` : ""}${item.main ? ` · ${item.main}` : ""}${item.note ? `\n-# ${item.note}` : ""}`).join("\n").slice(0, 3900)
    : "_Roster is currently empty._";
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("♟ PARADISE COMPETITIVE ROSTER").setDescription(description).setFooter(paradiseFooter("Managed with /roster")).setTimestamp();
  if (message) await message.edit({ embeds: [embed] }); else message = await channel.send({ embeds: [embed] });
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].rosterMessageId = message.id;
    return next;
  });
  return message;
}

async function handleRoster(interaction) {
  if (!canManageCompetitiveBoards(interaction.member)) return interaction.reply({ content: "Roster manager authority required.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  if (sub === "panel" || sub === "repost") {
    const panel = await updateRosterPanel(interaction.guild);
    return interaction.reply({ content: panel ? "Roster board refreshed." : "Map the roster channel first.", ephemeral: true });
  }
  const user = interaction.options.getUser("user");
  let found = true;
  await saveState(state => {
    state.rosters[interaction.guildId] = state.rosters[interaction.guildId] || {};
    if (sub === "remove") delete state.rosters[interaction.guildId][user.id];
    else {
      const existing = state.rosters[interaction.guildId][user.id];
      if (sub === "update" && !existing) {
        found = false;
        return state;
      }
      state.rosters[interaction.guildId][user.id] = {
        ...(existing || {}),
        userId: user.id,
        region: interaction.options.getString("region") || existing?.region,
        rank: interaction.options.getString("rank") ?? existing?.rank ?? null,
        main: interaction.options.getString("main") ?? existing?.main ?? null,
        note: interaction.options.getString("note") ?? existing?.note ?? null,
        addedBy: existing?.addedBy || interaction.user.id,
        addedAt: existing?.addedAt || new Date().toISOString(),
        updatedBy: interaction.user.id,
        updatedAt: new Date().toISOString()
      };
    }
    return state;
  });
  if (!found) return interaction.reply({ content: "That user is not on this server's roster. Nothing changed.", ephemeral: true });
  await updateRosterPanel(interaction.guild).catch(() => {});
  await logParadiseAction(interaction.guild, "roster_logs_channel", "roster-logs", "Roster record updated",
    `${user} was **${sub === "remove" ? "removed from" : sub === "update" ? "updated in" : "saved to"}** the roster by <@${interaction.user.id}>.`);
  return interaction.reply({ content: `${user} ${sub === "remove" ? "removed from" : "saved to"} the roster.`, ephemeral: true });
}

async function updateBlacklistPanel(guild) {
  const state = await loadState();
  const records = Object.values(state.blacklists?.[guild.id] || {}).filter(item => item.status === "active");
  const channel = await configuredChannel(guild, "blacklist_channel", "blacklist");
  if (!channel) return null;
  const guildConfig = configForGuild(state, guild.id);
  let message = guildConfig.blacklistMessageId ? await channel.messages.fetch(guildConfig.blacklistMessageId).catch(() => null) : null;
  const description = records.length
    ? records.map(item => `<@${item.userId}> — ${item.reason}\n-# Added <t:${Math.floor(Date.parse(item.createdAt) / 1000)}:R>`).join("\n\n").slice(0, 3900)
    : "_No active Paradise blacklist records._";
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("⊘ PARADISE BLACKLIST").setDescription(description).setFooter(paradiseFooter("Evidence-backed records only")).setTimestamp();
  if (message) await message.edit({ embeds: [embed] }); else message = await channel.send({ embeds: [embed] });
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].blacklistMessageId = message.id;
    return next;
  });
  return message;
}

async function handleBlacklist(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "status") {
    const user = interaction.options.getUser("user") || interaction.user;
    const record = (await loadState()).blacklists?.[interaction.guildId]?.[user.id];
    const summary = record?.status === "active"
      ? `${user} has an active Paradise blacklist record from <t:${Math.floor(Date.parse(record.createdAt) / 1000)}:R>. Use the private appeal flow for review.`
      : `${user} does not have an active Paradise blacklist record in this server.`;
    return interaction.reply({ content: summary, ephemeral: true });
  }
  if (!canManageCompetitiveBoards(interaction.member)) return interaction.reply({ content: "Blacklist manager authority required.", ephemeral: true });
  if (sub === "panel") {
    const panel = await updateBlacklistPanel(interaction.guild);
    return interaction.reply({ content: panel ? "Blacklist board refreshed." : "Map the blacklist channel first.", ephemeral: true });
  }
  if (sub === "appeal-panel") {
    const channel = await configuredChannel(interaction.guild, "blacklist_appeal_channel", "blacklist-appeal");
    if (!channel) return interaction.reply({ content: "Map or create the blacklist-appeal channel first.", ephemeral: true });
    await channel.send({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("◇ BLACKLIST APPEALS")
      .setDescription("# Appeal safely\nOpen a private support ticket and include the blacklist date, reason you are appealing and any relevant evidence.\n\n> Bail is never guaranteed and never auto-removes a blacklist. Final resolution requires owner approval.\n\n-# Türkçe destek aynı ticket içinde seçilebilir.")
      .setFooter(paradiseFooter("Private review only"))] });
    return interaction.reply({ content: "Appeal information panel posted.", ephemeral: true });
  }
  const user = interaction.options.getUser("user");
  const reason = interaction.options.getString("reason");
  await saveState(state => {
    state.blacklists[interaction.guildId] = state.blacklists[interaction.guildId] || {};
    if (sub === "remove") {
      state.blacklists[interaction.guildId][user.id] = {
        ...(state.blacklists[interaction.guildId][user.id] || { userId: user.id }),
        status: "resolved", resolution: reason, resolvedBy: interaction.user.id, resolvedAt: new Date().toISOString()
      };
    } else {
      state.blacklists[interaction.guildId][user.id] = {
        userId: user.id, status: "active", reason,
        evidence: interaction.options.getString("evidence") || null,
        createdBy: interaction.user.id, createdAt: new Date().toISOString()
      };
    }
    return state;
  });
  await updateBlacklistPanel(interaction.guild).catch(() => {});
  await logParadiseAction(interaction.guild, "blacklist_logs_channel", "blacklist-logs", "Blacklist record updated",
    `${user} record was **${sub === "remove" ? "resolved" : "created"}** by <@${interaction.user.id}>.\n**Reason:** ${reason}`);
  return interaction.reply({ content: `${user} blacklist record ${sub === "remove" ? "resolved" : "created"}.`, ephemeral: true });
}

async function handleAppeal(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "open") {
    const state = await loadState();
    const blacklist = state.blacklists?.[interaction.guildId]?.[interaction.user.id];
    if (blacklist?.status !== "active") return interaction.reply({ content: "You do not have an active blacklist record in this server.", ephemeral: true });
    const existing = state.appeals?.[interaction.guildId]?.[interaction.user.id];
    if (existing?.status === "pending") {
      return interaction.reply({ content: `You already have a pending appeal${existing.threadId ? `: <#${existing.threadId}>` : "."}`, ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const parent = await configuredChannel(interaction.guild, "blacklist_appeal_channel", "blacklist-appeal");
    let thread = null;
    if (parent?.threads?.create) {
      thread = await parent.threads.create({
        name: `appeal-${interaction.user.username}`.slice(0, 90),
        type: ChannelType.PrivateThread,
        invitable: false,
        reason: "Paradise private blacklist appeal"
      }).catch(() => null);
      if (thread) {
        await thread.members.add(interaction.user.id).catch(() => {});
        await thread.send({
          content: `<@${interaction.user.id}>`,
          embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("◇ PRIVATE BLACKLIST APPEAL")
            .setDescription(`**Applicant:** <@${interaction.user.id}>\n**Reason:** ${interaction.options.getString("reason")}\n**Evidence:** ${interaction.options.getString("evidence") || "Not supplied"}\n\n> Staff review is evidence-based. Bail is never guaranteed and cannot automatically remove a blacklist.`)
            .setFooter(paradiseFooter("Private staff review")).setTimestamp()]
        }).catch(() => {});
      }
    }
    await saveState(next => {
      next.appeals[interaction.guildId] = next.appeals[interaction.guildId] || {};
      next.appeals[interaction.guildId][interaction.user.id] = {
        userId: interaction.user.id,
        status: "pending",
        reason: interaction.options.getString("reason"),
        evidence: interaction.options.getString("evidence") || null,
        threadId: thread?.id || null,
        createdAt: new Date().toISOString()
      };
      return next;
    });
    await logParadiseAction(interaction.guild, "blacklist_logs_channel", "blacklist-logs", "Blacklist appeal opened",
      `<@${interaction.user.id}> opened a private appeal${thread ? ` in ${thread}` : ""}.`);
    return interaction.editReply(thread
      ? `Your private appeal was created: ${thread}`
      : "Your appeal was recorded. Staff will review it privately; the mapped channel could not create a private thread.");
  }
  if (!canManageCompetitiveBoards(interaction.member)) return interaction.reply({ content: "Blacklist manager authority required.", ephemeral: true });
  const user = interaction.options.getUser("user");
  const reason = interaction.options.getString("reason");
  let found = true;
  await saveState(state => {
    state.appeals[interaction.guildId] = state.appeals[interaction.guildId] || {};
    const appeal = state.appeals[interaction.guildId][user.id];
    if (!appeal || appeal.status !== "pending") {
      found = false;
      return state;
    }
    state.appeals[interaction.guildId][user.id] = {
      ...appeal,
      status: sub === "approve" ? "approved" : "denied",
      decisionReason: reason,
      decidedBy: interaction.user.id,
      decidedAt: new Date().toISOString()
    };
    if (sub === "approve" && state.blacklists?.[interaction.guildId]?.[user.id]) {
      state.blacklists[interaction.guildId][user.id] = {
        ...state.blacklists[interaction.guildId][user.id],
        status: "resolved",
        resolution: `Appeal approved: ${reason}`,
        resolvedBy: interaction.user.id,
        resolvedAt: new Date().toISOString()
      };
    }
    return state;
  });
  if (!found) return interaction.reply({ content: "No pending appeal was found for that user.", ephemeral: true });
  await updateBlacklistPanel(interaction.guild).catch(() => {});
  await logParadiseAction(interaction.guild, "blacklist_logs_channel", "blacklist-logs", `Appeal ${sub === "approve" ? "approved" : "denied"}`,
    `${user} appeal was decided by <@${interaction.user.id}>.\n**Decision:** ${reason}`);
  return interaction.reply({ content: `${user} appeal ${sub === "approve" ? "approved and blacklist record resolved" : "denied"}.`, ephemeral: true });
}

async function handleBail(interaction) {
  if (!canManageCompetitiveBoards(interaction.member)) return interaction.reply({ content: "Owner or blacklist manager authority required.", ephemeral: true });
  const state = await loadState();
  if (configForGuild(state, interaction.guildId).blacklist?.bailEnabled !== true) {
    return interaction.reply({ content: "Bail review is disabled for this server in the Paradise dashboard.", ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  const user = interaction.options.getUser("user");
  if (state.blacklists?.[interaction.guildId]?.[user.id]?.status !== "active") {
    return interaction.reply({ content: "That user does not have an active blacklist record.", ephemeral: true });
  }
  const detail = interaction.options.getString("condition") || interaction.options.getString("note") || interaction.options.getString("reason");
  await saveState(next => {
    next.bails[interaction.guildId] = next.bails[interaction.guildId] || {};
    const existing = next.bails[interaction.guildId][user.id] || {};
    next.bails[interaction.guildId][user.id] = {
      ...existing,
      userId: user.id,
      status: sub === "offer" ? "offered" : sub === "resolve" ? "resolved" : "denied",
      condition: sub === "offer" ? detail : existing.condition || null,
      decisionNote: sub === "offer" ? null : detail,
      updatedBy: interaction.user.id,
      updatedAt: new Date().toISOString(),
      createdAt: existing.createdAt || new Date().toISOString()
    };
    return next;
  });
  await logParadiseAction(interaction.guild, "blacklist_logs_channel", "blacklist-logs", `Bail review ${sub}`,
    `${user} bail review was marked **${sub}** by <@${interaction.user.id}>.\n**Condition / note:** ${detail}\n\n-# This action did not automatically remove the blacklist.`);
  return interaction.reply({
    content: `${user} bail review marked **${sub}**. The blacklist was not automatically removed.`,
    ephemeral: true
  });
}

async function handleSetChannel(interaction) {
  if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
  const key = interaction.options.getSubcommand();
  if (!PARADISE_CHANNEL_MAPPINGS.some(([name]) => name === key)) {
    return interaction.reply({ content: "Unknown Paradise channel mapping.", ephemeral: true });
  }
  const channel = interaction.options.getChannel("channel");
  await saveState(state => {
    state.guildConfigs[interaction.guildId] = state.guildConfigs[interaction.guildId] || structuredClone(state.config || {});
    state.guildConfigs[interaction.guildId].channelMappings = state.guildConfigs[interaction.guildId].channelMappings || {};
    state.guildConfigs[interaction.guildId].channelMappings[key] = channel.id;
    state.guildConfigs[interaction.guildId].channelMappingsUpdatedAt = new Date().toISOString();
    if (interaction.guildId === PARADISE_TEST_GUILD_ID) state.config = structuredClone(state.guildConfigs[interaction.guildId]);
    return state;
  });
  if (key === "challenge_channel") await postChallengeCreatePanel(interaction.guild, channel);
  if (key === "availability_channel") await updateAvailabilityPanel(interaction.guild);
  if (key === "loa_channel") await updateLoaPanel(interaction.guild);
  if (key === "relation_panel_channel") await updateRelationsPanel(interaction.guild);
  return interaction.reply({ content: `**${key}** is now mapped to ${channel}.`, ephemeral: true });
}

async function handleHandbook(interaction) {
  if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const mode = interaction.options.getString("template");
  const result = await publishAllGuides(interaction.guild, mode);
  return interaction.editReply(`Handbook regeneration complete: **${result.posted}** guide messages updated or created.`);
}

async function enforceCommandChannel(interaction) {
  if (isOwner(interaction)) return true;
  const allowed = configForGuild(await loadState(), interaction.guildId).commandChannels?.[interaction.commandName];
  if (!allowed?.length || allowed.includes(interaction.channelId)) return true;
  await interaction.reply({ content: `Use this command in: ${allowed.map(id => `<#${id}>`).join(", ")}`, ephemeral: true });
  return false;
}

async function handleSticky(interaction) {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages) && !isOwner(interaction)) {
    return interaction.reply({ content: "Manage Messages permission required.", ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  const state = await loadState();
  const stickies = configForGuild(state, interaction.guildId).stickies || {};
  if (sub === "list") {
    const lines = Object.entries(stickies).map(([channelId, item]) => `<#${channelId}> — ${String(item.text).slice(0, 80)}`);
    return interaction.reply({ content: lines.join("\n") || "No sticky messages configured.", ephemeral: true });
  }
  if (sub === "remove") {
    await saveState(next => {
      next.guildConfigs[interaction.guildId] = next.guildConfigs[interaction.guildId] || structuredClone(next.config || {});
      if (next.guildConfigs[interaction.guildId].stickies) delete next.guildConfigs[interaction.guildId].stickies[interaction.channelId];
      return next;
    });
    return interaction.reply({ content: "Sticky removed for this channel.", ephemeral: true });
  }
  const text = interaction.options.getString("text").trim();
  await saveState(next => {
    next.guildConfigs[interaction.guildId] = next.guildConfigs[interaction.guildId] || structuredClone(next.config || {});
    next.guildConfigs[interaction.guildId].stickies = next.guildConfigs[interaction.guildId].stickies || {};
    next.guildConfigs[interaction.guildId].stickies[interaction.channelId] = { text, updatedBy: interaction.user.id, updatedAt: new Date().toISOString(), lastSentAt: 0, messageId: null };
    return next;
  });
  const sent = await interaction.channel.send({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setDescription(text).setFooter(paradiseFooter("Sticky guide"))] });
  await saveState(next => {
    next.guildConfigs[interaction.guildId].stickies[interaction.channelId] = { ...next.guildConfigs[interaction.guildId].stickies[interaction.channelId], messageId: sent.id, lastSentAt: Date.now() };
    return next;
  });
  return interaction.reply({ content: "Sticky configured.", ephemeral: true });
}

async function handleBranding(interaction) {
  if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  if (sub === "color") {
    const raw = interaction.options.getString("hex").trim();
    if (!/^#?[0-9a-f]{6}$/i.test(raw)) {
      return interaction.reply({ content: "Invalid color. Use a six-digit HEX value such as `#000000`.", ephemeral: true });
    }
    const brandColor = normalizeParadiseBrandColor(raw);
    await saveState(state => {
      state.guildConfigs[interaction.guildId] = state.guildConfigs[interaction.guildId] || structuredClone(state.config || {});
      state.guildConfigs[interaction.guildId].brandColor = brandColor;
      return state;
    });
  }
  const color = normalizeParadiseBrandColor(configForGuild(await loadState(), interaction.guildId).brandColor);
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(paradiseBrandColorInteger(color)).setTitle("✦ PARADISE STYLE PREVIEW")
      .setDescription("# Primary heading\n## ◆ Clear section\n### ◇ Supporting detail\n\n**Bold priority** • __Underlined label__ • _soft emphasis_\n\n- Clean bullet hierarchy\n- Consistent spacing\n- Short, readable sections\n\n> Important callout text stays visually separate.\n\n-# This smaller line is Discord subtext.")
      .addFields(
        { name: "Current accent", value: `\`${color}\``, inline: true },
        { name: "Dashboard", value: "Change it anytime in the owner console.", inline: true }
      )
      .setFooter(paradiseFooter("Unified visual system"))],
    ephemeral: true
  });
}

async function handleParadiseMessageInner(message) {
  if (!message.guild || message.author.bot) return false;
  const state = await loadState();
  const guildConfig = configForGuild(state, message.guild.id);
  const sticky = guildConfig.stickies?.[message.channelId];
  if (!sticky || Date.now() - Number(sticky.lastSentAt || 0) < 15_000) return false;
  if (sticky.messageId) await message.channel.messages.delete(sticky.messageId).catch(() => {});
  const sent = await message.channel.send({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setDescription(sticky.text).setFooter(paradiseFooter("Sticky guide"))] });
  await saveState(next => {
    next.guildConfigs[message.guild.id] = next.guildConfigs[message.guild.id] || structuredClone(next.config || {});
    next.guildConfigs[message.guild.id].stickies = next.guildConfigs[message.guild.id].stickies || {};
    next.guildConfigs[message.guild.id].stickies[message.channelId] = { ...sticky, messageId: sent.id, lastSentAt: Date.now() };
    return next;
  });
  return true;
}

export async function handleParadiseMessage(message) {
  return paradiseGuildContext.run(message.guild?.id || null, () => handleParadiseMessageInner(message));
}

async function updateStaffTeamEmbed(guild) {
  const channel = guild.channels.cache.find(item => item.name === "staff-team");
  if (!channel) return null;
  await guild.members.fetch().catch(() => {});
  const roleNames = [
    "Owner", "Admin", "Overseer", "Community Manager", "Training Manager", "Training Supervisor",
    "Tryout Manager", "Tournament Manager", "Event Manager", "Giveaway Manager", "Game Night Manager",
    "Referee Manager", "Experienced Referee", "Referee", "Trial Referee",
    "Experienced Training Hoster", "Training Hoster", "Experienced Tryout Hoster", "Tryout Hoster", "War Hoster"
  ];
  const lines = [];
  for (const name of roleNames) {
    const role = guild.roles.cache.find(item => item.name === name);
    if (!role) continue;
    const members = [...role.members.values()].filter(member => !member.user.bot);
    lines.push(`**${name}**\n${members.length ? members.map(member => `${member}`).join(", ") : "Vacant"}`);
  }
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ PARADISE STAFF TEAM")
    .setDescription(`# Staff Directory\n${lines.join("\n\n").slice(0, 3900) || "_Staff roles are not configured yet._"}\n\n-# This directory refreshes automatically when staff roles change.`)
    .setFooter(paradiseFooter("Live role directory"))
    .setTimestamp();
  const state = await loadState();
  const guildConfig = configForGuild(state, guild.id);
  let message = guildConfig.staffTeamMessageId
    ? await channel.messages.fetch(guildConfig.staffTeamMessageId).catch(() => null)
    : null;
  if (message) await message.edit({ embeds: [embed] }); else message = await channel.send({ embeds: [embed] });
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].staffTeamMessageId = message.id;
    return next;
  });
  return message;
}

export async function handleParadiseGuildMemberUpdate(oldMember, newMember) {
  if (oldMember.roles.cache.size === newMember.roles.cache.size
    && [...oldMember.roles.cache.keys()].every(id => newMember.roles.cache.has(id))) return false;
  clearTimeout(staffTeamRefreshTimers.get(newMember.guild.id));
  const timer = setTimeout(() => {
    staffTeamRefreshTimers.delete(newMember.guild.id);
    paradiseGuildContext.run(newMember.guild.id, () => updateStaffTeamEmbed(newMember.guild)).catch(() => {});
  }, 1500);
  timer.unref?.();
  staffTeamRefreshTimers.set(newMember.guild.id, timer);
  return true;
}

function localizedHelp(locale) {
  return String(locale).toLowerCase().startsWith("tr")
    ? "Komutlar: `/verifyroblox`, `/tryout start`, `/tryout result`, `/paradisetraining start`, `/challenge create`. Sonuçlar doğrulama ve yetki sınırlarından geçer."
    : "Commands: `/verifyroblox`, `/tryout start`, `/tryout result`, `/paradisetraining start`, `/challenge create`. Results pass verification and authority checks.";
}

async function handleParadiseInteractionInner(interaction) {
  if (interaction.isModalSubmit?.() && interaction.customId === "paradise_verify_modal") {
    await handleVerifyModal(interaction);
    return true;
  }
  if (interaction.isModalSubmit?.() && interaction.customId.startsWith("paradise_setup_final:")) {
    await handleSetupFinalConfirmation(interaction, interaction.customId.split(":")[1]);
    return true;
  }
  if (interaction.isButton?.()) {
    if (interaction.customId === "paradise_verify_open") {
      const modal = new ModalBuilder().setCustomId("paradise_verify_modal").setTitle("Roblox Verification");
      const username = new TextInputBuilder().setCustomId("roblox_username").setLabel("Roblox Username")
        .setPlaceholder("Enter your exact Roblox username").setStyle(TextInputStyle.Short)
        .setMinLength(3).setMaxLength(20).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(username));
      await interaction.showModal(modal);
      return true;
    }
    if (interaction.customId === "paradise_verify_confirm") { await verifyCheck(interaction); return true; }
    if (interaction.customId === "paradise_verify_retry") {
      const challenge = verificationChallenges.get(interaction.user.id)
        || (await loadState()).verificationChallenges[interaction.user.id];
      if (!challenge) {
        await interaction.reply({ content: "Verification expired. Start again with `/verifyroblox`.", ephemeral: true });
      } else {
        await startVerification(interaction, challenge.username);
      }
      return true;
    }
    if (interaction.customId === "paradise_verify_cancel") {
      verificationChallenges.delete(interaction.user.id);
      await saveState(state => { delete state.verificationChallenges[interaction.user.id]; return state; });
      await interaction.update({ content: "Roblox verification cancelled.", embeds: [], components: [] });
      return true;
    }
    if (interaction.customId === "paradise_profile_create") { await beginProfileCreation(interaction); return true; }
    if (interaction.customId === "paradise_profile_region_change") { await beginProfileRegionChange(interaction); return true; }
    if (interaction.customId === "paradise_challenge_open") { await presentChallengeTargetMenu(interaction); return true; }
    if (interaction.customId === "paradise_availability_refresh") {
      const panel = await updateAvailabilityPanel(interaction.guild);
      await interaction.reply({ content: panel ? "Availability refreshed." : "Availability channel is not configured.", ephemeral: true });
      return true;
    }
    if (interaction.customId === "paradise_setup_confirm_clan") { await showSetupFinalConfirmation(interaction, "clan"); return true; }
    if (interaction.customId.startsWith("paradise_setup_select:")) {
      await setupPreview(interaction, interaction.customId.split(":")[1], true);
      return true;
    }
    if (interaction.customId.startsWith("paradise_setup_review:")) {
      await showSetupFinalConfirmation(interaction, interaction.customId.split(":")[1]);
      return true;
    }
    if (interaction.customId === "paradise_setup_cancel") { await interaction.update({ content: "Setup cancelled.", embeds: [], components: [] }); return true; }
    if (interaction.customId.startsWith("paradise_help:")) {
      const scope = interaction.customId.split(":")[1];
      await interaction.update({ embeds: [helpEmbed(scope, interaction.locale).setColor(await paradiseBrandColor())], components: [helpButtons(scope)] });
      return true;
    }
    if (interaction.customId.startsWith("paradise_help_lang:")) {
      const [, locale, scope] = interaction.customId.split(":");
      await interaction.reply({ embeds: [helpEmbed(scope, locale).setColor(await paradiseBrandColor())], ephemeral: true });
      return true;
    }
    if (interaction.customId.startsWith("paradise_loa_")) { await handleLoaDecision(interaction); return true; }
    if (interaction.customId.startsWith("paradise_tryout_")) { await handleTryoutApproval(interaction); return true; }
    if (interaction.customId.startsWith("paradise_challenge_")) { await handleChallengeApproval(interaction); return true; }
    if (interaction.customId.startsWith("paradise_session_")) { await handleSessionButton(interaction); return true; }
    if (interaction.customId.startsWith("paradise_activity_present:")) { await handleActivityResponse(interaction); return true; }
    if (interaction.customId.startsWith("paradise_giveaway_enter:") || interaction.customId.startsWith("paradise_rsvp_")) { await handleOptInButton(interaction); return true; }
    if (["paradise_lang_en", "paradise_lang_tr"].includes(interaction.customId)) {
      const chosen = interaction.customId.endsWith("_tr") ? "Turkish" : "English";
      const other = chosen === "Turkish" ? "English" : "Turkish";
      const chosenRole = await ensureRole(interaction.guild, chosen);
      const otherRole = interaction.guild.roles.cache.find(r => r.name === other);
      if (otherRole && interaction.member.roles.cache.has(otherRole.id)) await interaction.member.roles.remove(otherRole);
      const removing = interaction.member.roles.cache.has(chosenRole.id);
      if (removing) await interaction.member.roles.remove(chosenRole); else await interaction.member.roles.add(chosenRole);
      await interaction.reply({ content: removing ? `${chosen} role removed.` : `${chosen} role added.`, ephemeral: true }); return true;
    }
  }
  if (interaction.isStringSelectMenu?.() && interaction.customId === "paradise_profile_region") {
    await handleProfileRegion(interaction);
    return true;
  }
  if (interaction.isStringSelectMenu?.() && interaction.customId === "paradise_challenge_target") {
    const draft = challengeDrafts.get(interaction.user.id);
    if (!draft || draft.expires < Date.now()) {
      challengeDrafts.delete(interaction.user.id);
      await interaction.reply({ content: "Challenge selection expired. Run `/challenge create` again.", ephemeral: true });
      return true;
    }
    const opponent = await interaction.client.users.fetch(interaction.values[0]).catch(() => null);
    if (!opponent) {
      await interaction.reply({ content: "That Discord user is no longer available.", ephemeral: true });
      return true;
    }
    await createChallengeTicket(interaction, opponent, draft.region);
    return true;
  }
  if (interaction.isStringSelectMenu?.() && interaction.customId === "paradise_ping_roles") {
    for (const label of ["Training", "Tournament", "Event", "Giveaway", "Game Night"]) {
      const role = await ensureRole(interaction.guild, `${label} Ping`);
      if (interaction.values.includes(label)) await interaction.member.roles.add(role); else if (interaction.member.roles.cache.has(role.id)) await interaction.member.roles.remove(role);
    }
    await interaction.reply({ content: "Paradise ping roles updated.", ephemeral: true }); return true;
  }
  if (!interaction.isChatInputCommand?.()) return false;
  if (!await enforceCommandChannel(interaction)) return true;
  if (interaction.commandName === "setupfieels" || interaction.commandName === "previewserversetup") { await setupChooser(interaction); return true; }
  if (interaction.commandName === "backupserverstructure") { await setupPreview(interaction, "clan"); return true; }
  if (interaction.commandName === "setupfieelscommunity") { await handleSetupAction(interaction, "community"); return true; }
  if (interaction.commandName === "setupfieelsclan") { await handleSetupAction(interaction, "clan"); return true; }
  if (interaction.commandName === "setupfieelstsbtr") { await handleSetupAction(interaction, "tsbtr"); return true; }
  if (interaction.commandName === "setup") { await handleSetupAction(interaction, interaction.options.getString("mode") || "community"); return true; }
  if (interaction.commandName === "help") { await handleHelp(interaction); return true; }
  if (interaction.commandName === "verifyroblox") { await verifyStart(interaction); return true; }
  if (interaction.commandName === "verifyrobloxcheck") { await verifyCheck(interaction); return true; }
  if (interaction.commandName === "profile") { await handleProfile(interaction); return true; }
  if (interaction.commandName === "paradisehelp") { await interaction.reply({ content: localizedHelp(interaction.locale), ephemeral: true }); return true; }
  if (interaction.commandName === "sendlanguagequestion") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("paradise_lang_en").setLabel("English").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("paradise_lang_tr").setLabel("Türkçe").setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Choose your language / Dilini seç")], components: [row] }); return true;
  }
  if (interaction.commandName === "sendpingroleselector") {
    const menu = new StringSelectMenuBuilder().setCustomId("paradise_ping_roles").setPlaceholder("Choose pings").setMinValues(0).setMaxValues(5)
      .addOptions(["Training", "Tournament", "Event", "Giveaway", "Game Night"].map(label => ({ label, value: label })));
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Choose your Paradise pings")], components: [new ActionRowBuilder().addComponents(menu)] }); return true;
  }
  if (interaction.commandName === "tryout") { await handleTryout(interaction); return true; }
  if (interaction.commandName === "challenge") { await handleChallenge(interaction); return true; }
  if (interaction.commandName === "paradisetraining" || interaction.commandName === "training") { await handleTraining(interaction); return true; }
  if (interaction.commandName === "tournament") { await handleTournament(interaction); return true; }
  if (interaction.commandName === "giveaway") { await handleGiveaway(interaction); return true; }
  if (interaction.commandName === "gamenight") { await handleCommunityEvent(interaction, "gamenight"); return true; }
  if (interaction.commandName === "event") { await handleCommunityEvent(interaction, "event"); return true; }
  if (interaction.commandName === "referee") { await handleReferee(interaction); return true; }
  if (interaction.commandName === "activity") { await handleActivity(interaction); return true; }
  if (interaction.commandName === "whitelist") { await handleWhitelist(interaction); return true; }
  if (interaction.commandName === "mainer") { await handleMainer(interaction); return true; }
  if (interaction.commandName === "report") { await handleStaffReport(interaction); return true; }
  if (interaction.commandName === "findfcw") { await handleFindFcw(interaction); return true; }
  if (interaction.commandName === "commandchannel") { await handleCommandChannel(interaction); return true; }
  if (interaction.commandName === "sticky") { await handleSticky(interaction); return true; }
  if (interaction.commandName === "branding") { await handleBranding(interaction); return true; }
  if (interaction.commandName === "relation") { await handleRelation(interaction); return true; }
  if (interaction.commandName === "availability") { await handleAvailability(interaction); return true; }
  if (interaction.commandName === "loa") { await handleLoa(interaction); return true; }
  if (interaction.commandName === "lineup") { await handleLineup(interaction); return true; }
  if (interaction.commandName === "roster") { await handleRoster(interaction); return true; }
  if (interaction.commandName === "blacklist") { await handleBlacklist(interaction); return true; }
  if (interaction.commandName === "appeal") { await handleAppeal(interaction); return true; }
  if (interaction.commandName === "bail") { await handleBail(interaction); return true; }
  if (interaction.commandName === "set" || interaction.commandName === "setlogchannel") { await handleSetChannel(interaction); return true; }
  if (interaction.commandName === "handbook") { await handleHandbook(interaction); return true; }
  return false;
}

export async function handleParadiseInteraction(interaction) {
  return paradiseGuildContext.run(interaction.guildId || null, () => handleParadiseInteractionInner(interaction));
}
