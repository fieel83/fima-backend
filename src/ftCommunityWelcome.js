import { ftChannelName } from './ftCommunityChannelNames.js';
export const FT_COMMUNITY_GUILD_ID = '1419335632324657306';

// Approved FT copy uses real channel/member mentions, never guessed channel IDs.
export function ftLifecyclePresentation(member, config, { joined = true, tickets = false } = {}) {
  const count = Math.max(0, Math.floor(Number(member.guild.memberCount) || 0));
  if (!joined) return {
    title: '⌂・GOODBYE FROM FT COMMUNITY',
    description: `Goodbye, <@${member.id}>.\n\nThanks for being part of FT Community. See you around.\n\n**⌗・MEMBERS ${count}**`
  };
  const channels = member.guild.channels.cache;
  const entries = [
    ['rules_channel', ['rules'], 'Get familiar with the community.'],
    ['role_guide_channel', ['roles', 'role-guide'], 'Pick your roles and interests.'],
    ['general_channel', ['general', 'english-chat', 'chat'], 'Say hello and meet everyone.'],
    ['uploads_channel', ['uploads'], 'Catch the latest content.'],
    ['support_ticket_channel', ['support', 'open-ticket'], "Need help? We've got you."]
  ];
  const links = entries.flatMap(([key, names, copy]) => {
    if (key === 'support_ticket_channel' && !tickets) return [];
    const mapped = channels.get(config.channelMappings?.[key]);
    const channel = mapped?.isTextBased?.() ? mapped : channels.find(item => names.includes(ftChannelName(item.name)) && item.isTextBased?.());
    return channel ? [`›・**<#${channel.id}>** — ${copy}`] : [];
  });
  return {
    title: '⌂・WELCOME TO FT COMMUNITY',
    description: `Welcome, **<@${member.id}>**.\n\nGlad to have you here. Whether you're here to play, share, or just hang out, make yourself at home.\n\n${links.length ? `**⌁・GET STARTED**\n\n${links.join('\n\n')}\n\n` : ''}**⌗・MEMBER #${count}**\n\n*Enjoy your stay. See you around.*`
  };
}

// Resolve actual channels so a stale mapping cannot hide a migrated destination.
export function ftWelcomeDestinations(guild, config, { tr = false, tickets = false } = {}) {
  const channels = guild.channels.cache;
  const resolve = (key, names) => {
    const mapped = channels.get(config.channelMappings?.[key]);
    const channel = mapped?.isTextBased?.() ? mapped : channels.find(item => names.includes(ftChannelName(item.name)) && item.isTextBased?.());
    return channel ? `<#${channel.id}>` : null;
  };
  const entries = [
    ['rules_channel', ['rules'], tr ? 'Önce {channel} kanalındaki kurallara göz at.' : 'Start with the rules in {channel}.'],
    ['role_guide_channel', ['roles', 'role-guide'], tr ? 'Dilini, bölgeni ve istediğin bildirimleri {channel} kanalından seç.' : 'Pick your language, region and notification roles in {channel}.'],
    ['fieel_info_channel', ['fieel-info'], tr ? 'Fieel, içerikleri ve projeleri hakkında {channel} kanalından bilgi al.' : 'Meet Fieel and explore his content and projects in {channel}.'],
    [tr ? 'turkish_chat_channel' : 'general_channel', tr ? ['sohbet', 'turkce-sohbet', 'turkish-chat'] : ['general', 'english-chat', 'chat'], tr ? 'Sohbete katıl ve {channel} kanalında kendini tanıt.' : 'Say hello and join the conversation in {channel}.'],
    ['uploads_channel', ['uploads'], tr ? 'Yeni videoları {channel} kanalından takip et.' : 'Catch the latest videos in {channel}.'],
    ['support_ticket_channel', ['support', 'open-ticket'], tr ? 'Yardım mı gerekiyor? {channel} kanalından bize ulaş.' : 'Need a hand? Reach us in {channel}.']
  ];
  return entries.flatMap(([key, names, copy]) => {
    if (key === 'support_ticket_channel' && !tickets) return [];
    const channel = resolve(key, names);
    return channel ? [`- ${copy.replace('{channel}', channel)}`] : [];
  });
}
