import { createHash } from 'node:crypto';
import { prisma } from './db.js';
import { readShowcaseHistory } from './ftCommunityShowcase.js';
import { localizeParadiseGuide } from './paradise3a59.js';

const GUILD = '1419335632324657306';
const CHANNEL = '1420401536571543593';
const SOURCE = '1421220818498879543';
const VERSION = 'FT community rules v1';
const running = new Set();

export async function prepareFtRulesReplacement(channel, botId, settings = prisma.setting) {
  if (channel.guild.id !== GUILD || channel.id !== CHANNEL) throw new Error('FT rules scope mismatch');
  const saved = await settings.findUnique({ where: { key: `ft_rules:${channel.id}` } });
  if (saved?.value) throw new Error(saved.value.status === 'verified' ? 'FT rules already verified' : 'FT rules replacement requires recovery');
  const history = await readShowcaseHistory(channel);
  if (history.some(message => message.embeds?.some(embed => embed.footer?.text === VERSION))) throw new Error('FT rules canonical already exists');
  const sources = history.filter(message => message.id === SOURCE);
  if (sources.length !== 1) throw new Error('FT rules source missing or ambiguous');
  const existing = sources[0];
  if (!existing.webhookId || existing.author?.id === botId) throw new Error('FT rules source does not require webhook replacement');
  if ((await channel.fetchWebhooks()).get(existing.webhookId)?.token) throw new Error('FT rules source can be edited in place');
  const source = { id: existing.id, content: existing.content || '', webhookId: existing.webhookId,
    embeds: existing.embeds.map(embed => embed.toJSON ? embed.toJSON() : embed) };
  const payload = { embeds: ['en', 'tr'].map(language => {
    const guide = localizeParadiseGuide({ key: 'rules' }, language, GUILD);
    return { title: guide.title, description: guide.body, color: 0x7657d6, footer: { text: VERSION } };
  }), allowedMentions: { parse: [] } };
  const plan = { guildId: GUILD, channelId: CHANNEL, source, payload,
    action: 'create_canonical_keep_original', removal: 'separate_owner_approval_and_manage_messages_required' };
  return { ...plan, digest: createHash('sha256').update(JSON.stringify(plan)).digest('hex') };
}

export async function replaceFtRulesCanonical(channel, botId, expectedDigest, actorUserId, settings = prisma.setting) {
  if (!actorUserId || !/^[a-f0-9]{64}$/.test(expectedDigest || '')) throw new Error('FT rules reviewed Owner plan required');
  if (running.has(channel.id)) throw new Error('FT rules replacement already running');
  running.add(channel.id);
  const key = `ft_rules:${channel.id}`;
  try {
    const plan = await prepareFtRulesReplacement(channel, botId, settings);
    if (plan.digest !== expectedDigest) throw new Error('FT rules replacement plan stale');
    const value = { channelId: channel.id, source: plan.source, messageId: null, status: 'replacement_pending',
      replacement: { actorUserId, digest: plan.digest, originalRetained: true, startedAt: new Date().toISOString() } };
    const save = () => settings.upsert({ where: { key }, create: { key, value }, update: { value } });
    await save();
    const message = await channel.send({ ...plan.payload, nonce: plan.digest.slice(0, 24), enforceNonce: true });
    value.messageId = message.id;
    await save();
    const readback = await channel.messages.fetch({ message: message.id, force: true });
    if (readback.author?.id !== botId || readback.embeds?.length !== plan.payload.embeds.length ||
        plan.payload.embeds.some((embed, index) => ['title', 'description', 'color'].some(field => readback.embeds[index][field] !== embed[field]) ||
          readback.embeds[index].footer?.text !== VERSION)) throw new Error('FT rules replacement readback mismatch');
    value.status = 'verified';
    value.version = VERSION;
    await save();
    return value;
  } finally { running.delete(channel.id); }
}
