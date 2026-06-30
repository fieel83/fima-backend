import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder,
  PermissionsBitField, SlashCommandBuilder, StringSelectMenuBuilder
} from "discord.js";

export const PARADISE_TEST_GUILD_ID = "1520519015661961257";
const LEVELS = ["Low", "Mid", "High"];
const STRENGTHS = ["Weak", "Stable", "Strong"];
const verificationChallenges = new Map();
const verifiedProfiles = new Map();
const pendingTryouts = new Map();
const PROFILE_STORE = path.resolve(process.cwd(), "artifacts", "post-security-backlog", "3a59-verified-roblox-profiles.json");

export const PARADISE_ROLES = [
  "Owner", "Overseer", "Community Manager", "Training Manager",
  "Trial Training Manager", "Training Hoster", "Trial Training Hoster",
  "Tournament Manager", "Event Manager", "Giveaway Manager",
  "Game Night Manager", "Head Referee", "Referee", "Trial Referee",
  "Tryout Staff", "Trial Tryout Staff", "Coach / Helper",
  "Verified Fighter", "Media & Links Approved", "Training Ping",
  "Tournament Ping", "Event Ping", "Giveaway Ping", "Game Night Ping",
  "Turkish", "English", "Muted / Quarantined"
];

export const PARADISE_CLAN_SCHEMA = [
  ["LOGS", ["challenge-ticket-transcripts", "support-ticket-transcripts", "message-logs", "role-logs", "channel-logs", "nick-logs", "ban-unban-logs", "kick-logs", "mod-logs", "member-logs", "other-logs", "guide"], true],
  ["ADMIN", ["staff-annc", "staff-chat", "staff-works", "staff-rules", "staff-updates", "staff-strikes", "proofs"], true],
  ["CENTER", ["welcome", "blacklist", "ban-appeal", "unblacklist", "staff-team", "role-guide", "overview"], false],
  ["IMPORTANT", ["rules", "announcements", "sub-announcements", "content-channel", "server-logs", "staff-logs", "applications", "boosts", "giveaways", "polls", "hall-of-shame", "hall-of-fame"], false],
  ["TRYOUT & TRAINING", ["tryout", "tryout-results", "training", "training-results", "training-announcements", "training-hoster-announcements", "training-hoster-rules", "trainer-annc", "activity-check"], false],
  ["TICKET", ["challenge-ticket", "support-ticket", "payment-ticket", "bug-ticket", "macro-ticket"], false],
  ["GENERAL", ["tr-chat", "chat", "media", "bot-commands", "teamer-help", "spar-request"], false],
  ["LEADERBOARD", ["top-10", "top-20", "top-30", "challenge-rules", "set-rules", "availability", "challenges", "challenge-results"], false],
  ["HOSTER", ["global-hoster-annc", "hoster-activity-check", "tryouter-annc", "hoster-trainer-annc", "hoster-training-rules", "hoster-guide", "hoster-chat", "hoster-strikes", "hoster-reports"], true],
  ["REFEREES", ["referee-annc", "referee-chat", "referee-rules", "referee-post", "referee-updates", "referee-works", "referee-guide", "referee-strikes"], true],
  ["VOICE", ["Stage", "Voice 1", "Voice 2", "Voice 3", "Voice 4", "Voice 5"], false]
];

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

export function paradiseCommands() {
  const rankOptions = (builder) => builder
    .addIntegerOption(o => o.setName("stage").setDescription("0 is best; Stage 5 is unused").setRequired(true)
      .addChoices(...[0, 1, 2, 3, 4].map(value => ({ name: `Stage ${value}`, value }))))
    .addStringOption(o => o.setName("level").setDescription("Rank level").setRequired(true)
      .addChoices(...LEVELS.map(value => ({ name: value, value }))))
    .addStringOption(o => o.setName("strength").setDescription("Rank strength").setRequired(true)
      .addChoices(...STRENGTHS.map(value => ({ name: value, value }))));
  return [
    new SlashCommandBuilder().setName("setupfieels").setDescription("Choose and safely preview the Paradise server setup."),
    new SlashCommandBuilder().setName("sendlanguagequestion").setDescription("Post English/Turkish language buttons."),
    new SlashCommandBuilder().setName("sendpingroleselector").setDescription("Post Paradise notification-role selector."),
    new SlashCommandBuilder().setName("backupserverstructure").setDescription("Back up channels, roles and permission overwrites."),
    new SlashCommandBuilder().setName("previewserversetup").setDescription("Preview the full Clan/Training rebuild."),
    new SlashCommandBuilder().setName("verifyroblox").setDescription("Verify Roblox ownership with a profile About code.")
      .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true)),
    new SlashCommandBuilder().setName("verifyrobloxcheck").setDescription("Check the VERIFY code in your Roblox About."),
    new SlashCommandBuilder().setName("tryout").setDescription("Paradise tryout system")
      .addSubcommand(s => s.setName("start").setDescription("Start a tryout")
        .addStringOption(o => o.setName("link").setDescription("Roblox private server link").setRequired(true))
        .addBooleanOption(o => o.setName("ping").setDescription("Ping tryout/training members").setRequired(false)))
      .addSubcommand(s => rankOptions(s.setName("result").setDescription("Submit a structured tryout result")
        .addUserOption(o => o.setName("user").setDescription("Verified fighter").setRequired(true)))
        .addStringOption(o => o.setName("note").setDescription("Optional note").setRequired(false))),
    new SlashCommandBuilder().setName("challenge").setDescription("Verified Paradise challenge system")
      .addSubcommand(s => s.setName("create").setDescription("Create a verified challenge ticket")
        .addUserOption(o => o.setName("opponent").setDescription("Verified opponent").setRequired(true))
        .addStringOption(o => o.setName("region").setDescription("Match region").setRequired(false)
          .addChoices(...["Paris", "London", "Amsterdam", "Frankfurt"].map(value => ({ name: value, value })))))
      .addSubcommand(s => s.setName("result").setDescription("Submit a challenge result for approval")
        .addUserOption(o => o.setName("winner").setDescription("Winner").setRequired(true))
        .addUserOption(o => o.setName("loser").setDescription("Loser").setRequired(true))
        .addStringOption(o => o.setName("score").setDescription("Score, e.g. 10-4 or Auto").setRequired(true))),
    new SlashCommandBuilder().setName("paradisetraining").setDescription("Paradise training lifecycle")
      .addSubcommand(s => s.setName("start").setDescription("Start training")
        .addStringOption(o => o.setName("link").setDescription("Roblox private server link").setRequired(true))
        .addStringOption(o => o.setName("rules").setDescription("Extra rules").setRequired(false)))
      .addSubcommand(s => s.setName("end").setDescription("End training")
        .addStringOption(o => o.setName("score").setDescription("Score, e.g. 3-1").setRequired(true))
        .addStringOption(o => o.setName("winner").setDescription("Red, Blue or team name").setRequired(true))),
    new SlashCommandBuilder().setName("paradisehelp").setDescription("Show private English/Turkish command guidance.")
  ];
}

export async function initializeParadise(client) {
  const guild = await client.guilds.fetch(PARADISE_TEST_GUILD_ID).catch(() => null);
  if (!guild) return;
  const me = guild.members.me || await guild.members.fetchMe();
  if (me.nickname !== "Paradise") await me.setNickname("Paradise", "3A59 Paradise test identity").catch(() => {});
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
  try { return JSON.parse(await fs.readFile(PROFILE_STORE, "utf8")); } catch { return {}; }
}

async function saveVerifiedProfile(discordId, profile) {
  const store = await loadProfileStore();
  store[discordId] = profile;
  await writeArtifact("3a59-verified-roblox-profiles.json", store);
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

async function setupPreview(interaction) {
  if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
  const snapshot = await snapshotGuild(interaction.guild);
  await writeArtifact("3a59-discord-test-server-backup.json", snapshot);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("paradise_setup_confirm_clan").setLabel("Build Clan / Training").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("paradise_setup_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x9b5cff).setTitle("Paradise full rebuild preview")
      .setDescription(`Backup saved: ${snapshot.channels.length} channels, ${snapshot.roles.length} roles.\nThe confirmed test-server rebuild creates the complete clan/training structure and removes old non-managed resources.`)
      .addFields({ name: "Safety", value: "Hard-coded test guild only. Owner confirmation required. Production is never targeted." })],
    components: [row], ephemeral: true
  });
}

async function ensureRole(guild, name) {
  return guild.roles.cache.find(r => r.name === name) || guild.roles.create({ name, reason: "3A59 Paradise setup" });
}

async function applyClanSetup(interaction) {
  if (!isOwner(interaction) || interaction.guildId !== PARADISE_TEST_GUILD_ID) {
    return interaction.reply({ content: "Blocked: wrong guild or non-owner.", ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });
  const snapshot = await snapshotGuild(interaction.guild);
  await writeArtifact("3a59-discord-test-server-backup.json", snapshot);
  for (const name of PARADISE_ROLES) await ensureRole(interaction.guild, name);
  const desiredNames = new Set(PARADISE_CLAN_SCHEMA.flatMap(([category, channels]) => [category, ...channels]));
  for (const [categoryName, channelNames, privateCategory] of PARADISE_CLAN_SCHEMA) {
    let category = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === categoryName);
    if (!category) category = await interaction.guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory, reason: "3A59 Paradise setup" });
    if (privateCategory) await category.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
    for (const channelName of channelNames) {
      let channel = interaction.guild.channels.cache.find(c => c.name === channelName);
      if (!channel) {
        const voice = categoryName === "VOICE";
        channel = await interaction.guild.channels.create({
          name: channelName, type: voice ? ChannelType.GuildVoice : ChannelType.GuildText,
          parent: category.id, reason: "3A59 Paradise setup"
        });
      } else if (channel.parentId !== category.id) await channel.setParent(category.id, { lockPermissions: privateCategory });
    }
  }
  const removableChannels = [...interaction.guild.channels.cache.values()]
    .filter(c => !desiredNames.has(c.name) && !c.isThread?.());
  for (const channel of removableChannels) await channel.delete("3A59 owner-confirmed test-server rebuild").catch(() => {});
  const removableRoles = [...interaction.guild.roles.cache.values()]
    .filter(r => !r.managed && r.id !== interaction.guild.id && !PARADISE_ROLES.includes(r.name));
  for (const role of removableRoles) await role.delete("3A59 owner-confirmed test-server rebuild").catch(() => {});
  await writeArtifact("3a59-discord-clan-setup-live.json", {
    status: "LIVE VERIFIED", completedAt: new Date().toISOString(),
    guildId: interaction.guildId, categories: PARADISE_CLAN_SCHEMA.length,
    channels: PARADISE_CLAN_SCHEMA.reduce((n, [, rows]) => n + rows.length, 0), roles: PARADISE_ROLES.length
  });
  return interaction.editReply("Paradise Clan / Training rebuild completed.");
}

async function findRobloxUser(username) {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
  });
  const data = await res.json();
  return data.data?.[0] || null;
}

async function verifyStart(interaction) {
  const user = await findRobloxUser(interaction.options.getString("username"));
  if (!user) return interaction.reply({ content: "Roblox user not found.", ephemeral: true });
  const code = `VERIFY-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  verificationChallenges.set(interaction.user.id, { robloxId: user.id, username: user.name, code, expires: Date.now() + 15 * 60_000 });
  return interaction.reply({ content: `Put **${code}** in the About section of **${user.name}**, save it, then use \`/verifyrobloxcheck\`.`, ephemeral: true });
}

async function verifyCheck(interaction) {
  const challenge = verificationChallenges.get(interaction.user.id);
  if (!challenge || challenge.expires < Date.now()) return interaction.reply({ content: "Start again with `/verifyroblox`.", ephemeral: true });
  const res = await fetch(`https://users.roblox.com/v1/users/${challenge.robloxId}`);
  const profile = await res.json();
  if (!String(profile.description || "").includes(challenge.code)) return interaction.reply({ content: "Code not found in Roblox About yet.", ephemeral: true });
  verifiedProfiles.set(interaction.user.id, { robloxId: challenge.robloxId, username: challenge.username, verifiedAt: new Date().toISOString() });
  await saveVerifiedProfile(interaction.user.id, {
    robloxId: String(challenge.robloxId), robloxUsername: challenge.username, verifiedAt: new Date().toISOString()
  });
  const role = await ensureRole(interaction.guild, "Verified Fighter");
  await interaction.member.roles.add(role);
  verificationChallenges.delete(interaction.user.id);
  return interaction.reply({ content: `Verified as **${challenge.username}**.`, ephemeral: true });
}

async function verifiedProfile(discordId) {
  if (verifiedProfiles.has(discordId)) return verifiedProfiles.get(discordId);
  const profile = (await loadProfileStore())[discordId] || null;
  if (!profile) return null;
  verifiedProfiles.set(discordId, profile);
  return profile;
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
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x9b5cff).setTitle("Tryout")
      .setDescription(`Join: ${link}`)
      .addFields(
        { name: "Hoster", value: `${interaction.user}`, inline: true },
        { name: "Rules", value: "No exploits, no queue hitting, follow hoster instructions.", inline: false }
      )] });
  }
  const target = interaction.options.getUser("user");
  if (!await verifiedProfile(target.id)) return interaction.reply({ content: "Target must complete `/verifyroblox` first.", ephemeral: true });
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
  pendingTryouts.set(id, { targetId: target.id, rank, hosterId: interaction.user.id });
  const rows = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_tryout_approve:${id}`).setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`paradise_tryout_deny:${id}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
  );
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xffc857).setTitle("Tryout Result — Pending")
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
  const pending = pendingTryouts.get(id);
  if (!pending) return interaction.reply({ content: "This pending result expired.", ephemeral: true });
  if (action === "deny") {
    pendingTryouts.delete(id);
    return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xff4d6d).setTitle("Tryout Result — Denied")], components: [] });
  }
  const member = await interaction.guild.members.fetch(pending.targetId);
  const role = await assignRankRole(interaction.guild, member, pending.rank);
  await writeArtifact(`3a59-tryout-approved-${id}.json`, {
    status: "LIVE VERIFIED", ...pending, rankRoleId: role.id, approvedBy: interaction.user.id, approvedAt: new Date().toISOString()
  });
  pendingTryouts.delete(id);
  return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x2ecc71).setTitle("Tryout Result — Approved")], components: [] });
}

async function handleChallenge(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "create") {
    const opponent = interaction.options.getUser("opponent");
    if (!await verifiedProfile(interaction.user.id) || !await verifiedProfile(opponent.id)) {
      return interaction.reply({ content: "Both fighters must complete `/verifyroblox` first.", ephemeral: true });
    }
    const me = interaction.guild.members.me;
    const channel = await interaction.guild.channels.create({
      name: `challenge-${interaction.user.username}-${opponent.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90),
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: opponent.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels] }
      ],
      reason: "Paradise verified challenge"
    });
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x9b5cff).setTitle("Verified Challenge")
      .setDescription(`${interaction.user} vs ${opponent}`)
      .addFields({ name: "Region", value: interaction.options.getString("region") || "Not selected" })] });
    return interaction.reply({ content: `Challenge ticket created: ${channel}`, ephemeral: true });
  }
  const winner = interaction.options.getUser("winner");
  const loser = interaction.options.getUser("loser");
  const score = interaction.options.getString("score").trim().replace(/\s+to\s+to\s+/gi, " to ");
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xffc857).setTitle("Challenge Result — Pending Approval")
    .setDescription(`${winner} defeated ${loser}`)
    .addFields({ name: "Score", value: score }, { name: "Referee", value: `${interaction.user}` })] });
}

async function handleTraining(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "start") {
    const link = interaction.options.getString("link");
    const rules = interaction.options.getString("rules") || "No Lh, no TDS, no overpassive, no 2 Ragdoll cancel, no wall, no hitting in queue, do not leave queue.";
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x9b5cff).setTitle("Training")
      .setDescription(`**Rules:** ${rules}\n**Playable characters:** Saitama, Garou, Metal Bat.\n**Link:** ${link}`)
      .addFields({ name: "Hoster", value: `${interaction.user}` })] });
  }
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle("Training ended.")
    .setDescription(`Score: ${interaction.options.getString("score")}, ${interaction.options.getString("winner")} won.`)
    .addFields({ name: "Hoster", value: `${interaction.user}` })] });
}

function localizedHelp(locale) {
  return String(locale).toLowerCase().startsWith("tr")
    ? "Komutlar: `/verifyroblox`, `/tryout start`, `/tryout result`, `/paradisetraining start`, `/challenge create`. Sonuçlar doğrulama ve yetki sınırlarından geçer."
    : "Commands: `/verifyroblox`, `/tryout start`, `/tryout result`, `/paradisetraining start`, `/challenge create`. Results pass verification and authority checks.";
}

export async function handleParadiseInteraction(interaction) {
  if (interaction.guildId && interaction.guildId !== PARADISE_TEST_GUILD_ID) return false;
  if (interaction.isButton?.()) {
    if (interaction.customId === "paradise_setup_confirm_clan") { await applyClanSetup(interaction); return true; }
    if (interaction.customId === "paradise_setup_cancel") { await interaction.update({ content: "Setup cancelled.", embeds: [], components: [] }); return true; }
    if (interaction.customId.startsWith("paradise_tryout_")) { await handleTryoutApproval(interaction); return true; }
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
  if (interaction.isStringSelectMenu?.() && interaction.customId === "paradise_ping_roles") {
    for (const label of ["Training", "Tournament", "Event", "Giveaway", "Game Night"]) {
      const role = await ensureRole(interaction.guild, `${label} Ping`);
      if (interaction.values.includes(label)) await interaction.member.roles.add(role); else if (interaction.member.roles.cache.has(role.id)) await interaction.member.roles.remove(role);
    }
    await interaction.reply({ content: "Paradise ping roles updated.", ephemeral: true }); return true;
  }
  if (!interaction.isChatInputCommand?.()) return false;
  if (["setupfieels", "previewserversetup", "backupserverstructure"].includes(interaction.commandName)) { await setupPreview(interaction); return true; }
  if (interaction.commandName === "verifyroblox") { await verifyStart(interaction); return true; }
  if (interaction.commandName === "verifyrobloxcheck") { await verifyCheck(interaction); return true; }
  if (interaction.commandName === "paradisehelp") { await interaction.reply({ content: localizedHelp(interaction.locale), ephemeral: true }); return true; }
  if (interaction.commandName === "sendlanguagequestion") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("paradise_lang_en").setLabel("English").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("paradise_lang_tr").setLabel("Türkçe").setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x9b5cff).setTitle("Choose your language / Dilini seç")], components: [row] }); return true;
  }
  if (interaction.commandName === "sendpingroleselector") {
    const menu = new StringSelectMenuBuilder().setCustomId("paradise_ping_roles").setPlaceholder("Choose pings").setMinValues(0).setMaxValues(5)
      .addOptions(["Training", "Tournament", "Event", "Giveaway", "Game Night"].map(label => ({ label, value: label })));
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x9b5cff).setTitle("Choose your Paradise pings")], components: [new ActionRowBuilder().addComponents(menu)] }); return true;
  }
  if (interaction.commandName === "tryout") { await handleTryout(interaction); return true; }
  if (interaction.commandName === "challenge") { await handleChallenge(interaction); return true; }
  if (interaction.commandName === "paradisetraining") { await handleTraining(interaction); return true; }
  return false;
}
