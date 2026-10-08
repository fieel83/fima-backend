import { prisma } from './db.js';
import { FT_COMMUNITY_GUILD_ID } from './ftCommunityWelcome.js';
import { readShowcaseHistory } from './ftCommunityShowcase.js';

const VERSION = 'FT community info v1';
const workers = new WeakSet();

export function communityInfoPayload(kind, channels, original = null) {
  const mention = name => {
    const channel = channels.find(item => item?.name === name && item.isTextBased?.());
    return channel ? `<#${channel.id}>` : `\`#${name}\``;
  };
  let embed;
  if (kind === 'fieel-info') {
    // Keep the existing verified social links and artwork instead of inventing destinations.
    const data = original?.toJSON ? original.toJSON() : original || {};
    const socials = data.description?.match(/(?:\*\*|__|#{1,3}\s*)?Socials[\s\S]*$/i)?.[0]?.trim();
    embed = {
      title: 'About Fieel · Fieel Hakkında', color: 0x7657d6,
      description: 'Creator · Editor · Community owner · Project builder\n\n' +
        '**EN** — Fieel, 20. TSB and Roblox videos, edits, FT Community and FIMA projects.\n\n' +
        '**TR** — Fieel, 20 yaşında. TSB ve Roblox videoları, editler, FT Community ve FIMA projeleri.' +
        (socials ? `\n\n${socials}` : ''),
      ...(data.thumbnail ? { thumbnail: data.thumbnail } : {}),
      ...(data.image ? { image: data.image } : {}),
      ...(data.url ? { url: data.url } : {})
    };
  } else {
    embed = {
      title: 'Support FAQ · Destek Rehberi', color: 0x7657d6,
      description: `Need a hand? Start here, then reach the team in ${mention('support')}.\nYardım mı gerekiyor? Önce buraya göz at, ardından ${mention('support')} kanalından ekibe ulaş.`,
      fields: [
        { name: 'Getting started · İlk adım', value: `Read ${mention('rules')}; choose your language, region and notifications in ${mention('roles')}.\n${mention('rules')} kanalını oku; dilini, bölgeni ve bildirimlerini ${mention('roles')} kanalından seç.` },
        { name: 'Products & tutorials · Ürünler ve rehberler', value: `FIMA Macro: ${mention('fima-macro')} · Fake Headless: ${mention('fake-headless')}\nCheck the relevant guide before opening a ticket. / Ticket açmadan önce ilgili rehbere bak.` },
        { name: 'What to include · Neler yazmalısın?', value: 'Choose the closest ticket topic. Explain what happened, what you tried, and any error message. Add relevant screenshots or an order reference privately.\nUygun ticket konusunu seç. Sorunu, denediklerini ve hata mesajını yaz. İlgili ekran görüntüsünü veya sipariş referansını özel ticket içinde paylaş.' },
        { name: 'Account safety · Hesap güvenliği', value: 'Never share passwords, tokens, cookies, recovery codes or card details. Use official product links; report suspicious DMs and downloads through support.\nŞifre, token, çerez, kurtarma kodu veya kart bilgisi paylaşma. Resmî ürün bağlantılarını kullan; şüpheli DM ve indirmeleri desteğe bildir.' }
      ]
    };
  }
  embed.footer = { text: `${VERSION} · Made by Fieel` };
  return { embeds: [embed], allowedMentions: { parse: [] } };
}

export async function publishCommunityInfo(channel, botId, channels, settings = prisma.setting) {
  if (channel.guild.id !== FT_COMMUNITY_GUILD_ID || !['fieel-info', 'support-faq'].includes(channel.name)) throw new Error('FT info scope mismatch');
  const key = `ft_info:${channel.id}`;
  const saved = await settings.findUnique({ where: { key } });
  const history = await readShowcaseHistory(channel);
  const marked = history.filter(message => message.embeds?.some(embed => embed.footer?.text?.startsWith(VERSION)));
  const legacy = channel.name === 'fieel-info' ? history.filter(message => message.embeds?.some(embed => /about fieel/i.test(embed.title || ''))) : [];
  const candidates = marked.length ? marked : legacy;
  candidates.sort((a, b) => a.id === saved?.value?.messageId ? -1 : b.id === saved?.value?.messageId ? 1 : a.id > b.id ? -1 : 1);
  const existing = candidates[0];
  const originalEmbed = existing?.embeds?.find(embed => /about fieel/i.test(embed.title || '')) || existing?.embeds?.[0];
  const payload = communityInfoPayload(channel.name, channels, originalEmbed);
  let webhook;
  if (existing?.webhookId) {
    webhook = (await channel.fetchWebhooks()).get(existing.webhookId);
    if (!webhook?.token) throw new Error('Existing info webhook cannot be edited; no duplicate created');
  } else if (existing && existing.author?.id !== botId) {
    throw new Error('Existing info message belongs to another author; no duplicate created');
  }
  // Save the original before any edit, including the webhook identity and source links.
  const value = { ...saved?.value, channelId: channel.id, source: saved?.value?.source || (existing ? { id: existing.id, content: existing.content, webhookId: existing.webhookId, embeds: existing.embeds.map(embed => embed.toJSON()) } : null), messageId: existing?.id || null, status: 'pending' };
  await settings.upsert({ where: { key }, create: { key, value }, update: { value } });
  const message = existing ? webhook ? await webhook.editMessage(existing.id, payload) : await existing.edit(payload) : await channel.send(payload);
  const readback = await channel.messages.fetch(message.id);
  if (readback.embeds?.[0]?.title !== payload.embeds[0].title || readback.embeds?.[0]?.description !== payload.embeds[0].description) throw new Error('FT info readback mismatch');
  const completed = { ...value, messageId: message.id, status: 'verified', version: VERSION };
  await settings.upsert({ where: { key }, create: { key, value: completed }, update: { value: completed } });
  console.info('FT info verified', { channel: channel.name, channelId: channel.id, messageId: message.id, edited: !!existing, webhook: !!webhook });
  return completed;
}

export function startFtInfoWorker(client) {
  if (workers.has(client)) return;
  workers.add(client);
  let busy = false;
  const done = new Set();
  const run = async () => {
    if (busy || done.size === 2) return;
    busy = true;
    try {
      const guild = await client.guilds.fetch(FT_COMMUNITY_GUILD_ID);
      const channels = await guild.channels.fetch();
      for (const name of ['fieel-info', 'support-faq']) {
        if (done.has(name)) continue;
        const matches = [...channels.values()].filter(channel => channel?.name === name && channel.messages);
        if (matches.length !== 1) throw new Error(`FT info destination ${name} missing or ambiguous`);
        await publishCommunityInfo(matches[0], client.user.id, channels);
        done.add(name);
      }
    } catch (error) { console.warn('FT info update blocked', { message: error.message }); }
    finally { busy = false; }
  };
  void run();
  const retry = setInterval(() => { if (done.size === 2) clearInterval(retry); else void run(); }, 60_000);
  retry.unref?.();
}
