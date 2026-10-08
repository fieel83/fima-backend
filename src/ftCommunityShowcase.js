import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { prisma } from './db.js';
import { ftChannelName } from './ftCommunityChannelNames.js';

const GUILD_ID = '1419335632324657306';
const MARKER = 'FIMA showcase v1';
const ROTATION_MS = 10_000;
const panels = new Map();
const running = new WeakSet();

export function showcaseItems(messages) {
  const items = [];
  const seen = new Set();
  for (const message of [...messages].sort((a, b) => Number(BigInt(a.id) - BigInt(b.id)))) {
    for (const embed of message.embeds || []) {
      const data = embed.toJSON ? embed.toJSON() : embed;
      if (data.footer?.text?.startsWith(MARKER)) continue;
      if (!data.image?.url || (!data.title && !data.description)) continue;
      const key = `${data.title || ''}|${data.image.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Original description, links, IDs and credited creator remain intact.
      const { type, provider, video, ...content } = data;
      items.push({ sourceId: message.id, embed: content });
    }
  }
  return items;
}

export async function readShowcaseHistory(channel) {
  const messages = [];
  let before;
  for (let page = 0; page < 100; page++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    messages.push(...batch.values());
    if (batch.size < 100) return messages;
    const next = batch.last().id;
    if (next === before) throw new Error('Showcase history pagination did not advance');
    before = next;
  }
  throw new Error('Showcase history exceeds safe scan limit; no panel created');
}

export function showcasePayload(state) {
  const index = ((state.index || 0) % state.items.length + state.items.length) % state.items.length;
  const item = state.items[index];
  const embed = EmbedBuilder.from(item.embed)
    .setFooter({ text: `${MARKER} • ${index + 1}/${state.items.length} • ${state.paused ? 'Paused' : 'Auto'}` });
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ft_showcase:prev').setLabel('Previous').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ft_showcase:next').setLabel('Next').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ft_showcase:pause').setLabel(state.paused ? 'Resume' : 'Pause').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel('Original').setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${GUILD_ID}/${state.channelId}/${item.sourceId}`)
  );
  return { embeds: [embed], components: [buttons], allowedMentions: { parse: [] } };
}

async function save(state, settings = prisma.setting) {
  const value = { channelId: state.channelId, messageId: state.messageId, items: state.items, index: state.index, paused: state.paused };
  await settings.upsert({ where: { key: `ft_showcase:${state.channelId}` }, create: { key: `ft_showcase:${state.channelId}`, value }, update: { value } });
}

export async function initializeShowcaseChannel(channel, botId, settings = prisma.setting) {
  const record = await settings.findUnique({ where: { key: `ft_showcase:${channel.id}` } });
  const history = await readShowcaseHistory(channel);
  const historicalItems = showcaseItems(history);
  const stored = record?.value;
  const savedItems = stored?.channelId === channel.id && Array.isArray(stored.items)
    ? stored.items.filter(item => /^\d+$/.test(String(item?.sourceId)) && item.embed?.image?.url && (item.embed.title || item.embed.description)) : [];
  const items = [...savedItems];
  const keys = new Set(items.map(item => `${item.embed.title || ''}|${item.embed.image.url}`));
  for (const item of historicalItems) {
    const key = `${item.embed.title || ''}|${item.embed.image.url}`;
    if (!keys.has(key)) { items.push(item); keys.add(key); }
  }
  if (!items.length) throw new Error(`No historical showcase items in ${channel.name}`);
  const canonical = history.filter(message => message.author?.id === botId && message.embeds?.some(embed => embed.footer?.text?.startsWith(MARKER)))
    .sort((a, b) => a.id === record?.value?.messageId ? -1 : b.id === record?.value?.messageId ? 1 : Number(BigInt(b.id) - BigInt(a.id)))[0];
  const state = { channelId: channel.id, items, index: Number(record?.value?.index) || 0, paused: record?.value?.paused === true, busy: false, nextAt: Date.now() + ROTATION_MS };
  const payload = showcasePayload(state);
  const message = canonical ? await canonical.edit(payload) : await channel.send(payload);
  state.messageId = message.id;
  state.message = message;
  await save(state, settings);
  panels.set(channel.id, state);
  console.info('FT showcase ready', { channelId: channel.id, messageId: message.id, items: items.length, recovered: !!canonical });
  return state;
}

async function changePanel(state, action) {
  if (state.busy || Date.now() < (state.retryAt || 0)) return false;
  state.busy = true;
  const previous = { index: state.index, paused: state.paused };
  try {
    if (action === 'pause') state.paused = !state.paused;
    else state.index = (state.index + (action === 'prev' ? -1 : 1) + state.items.length) % state.items.length;
    await state.message.edit(showcasePayload(state));
    state.nextAt = Date.now() + ROTATION_MS;
    await save(state);
    return true;
  } catch (error) {
    Object.assign(state, previous);
    state.retryAt = Date.now() + 60_000;
    console.warn('FT showcase edit failed; backing off', { channelId: state.channelId, message: error.message });
    throw error;
  } finally { state.busy = false; }
}

export async function handleFtShowcaseInteraction(interaction) {
  if (!interaction.isButton?.() || !interaction.customId?.startsWith('ft_showcase:')) return false;
  if (interaction.guildId !== GUILD_ID) return false;
  const state = panels.get(interaction.channelId);
  const action = interaction.customId.split(':')[1];
  if (!state || state.messageId !== interaction.message.id || !['prev', 'next', 'pause'].includes(action)) {
    await interaction.reply({ content: 'Showcase is restarting; try again shortly.', ephemeral: true });
    return true;
  }
  if (action === 'pause' && !interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
    await interaction.reply({ content: 'Only staff can pause automatic rotation.', ephemeral: true });
    return true;
  }
  await interaction.deferUpdate();
  if (Date.now() < (state.manualAt || 0)) return true;
  state.manualAt = Date.now() + 3_000;
  await changePanel(state, action);
  return true;
}

export function startFtShowcaseWorker(client) {
  if (running.has(client)) return;
  running.add(client);
  // Only FT Community's two product showcases are touched; historical messages are preserved.
  let initializing = false;
  const initialize = async () => {
    if (initializing) return;
    initializing = true;
    try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channels = await guild.channels.fetch();
    for (const name of ['outfits', 'capes']) {
      const matches = [...channels.values()].filter(channel => ftChannelName(channel?.name) === name && channel.isTextBased?.() && channel.messages);
      if (matches.length !== 1) { console.warn('FT showcase channel ambiguous or missing', { name, count: matches.length }); continue; }
      if (!panels.has(matches[0].id)) await initializeShowcaseChannel(matches[0], client.user.id).catch(error => console.warn('FT showcase initialization failed', { name, message: error.message }));
    }
    } catch (error) { console.warn('FT showcase worker unavailable', { message: error.message }); }
    finally { initializing = false; }
  };
  void initialize();
  const retryTimer = setInterval(() => { if (panels.size < 2) void initialize(); }, 60_000);
  retryTimer.unref?.();
  const timer = setInterval(() => {
    for (const state of panels.values()) {
      if (!state.paused && state.items.length > 1 && Date.now() >= state.nextAt) void changePanel(state, 'next').catch(() => {});
    }
  }, 1_000);
  timer.unref?.();
}
