import { ftChannelName } from './ftCommunityChannelNames.js';
export const FT_COMMUNITY_GUILD_ID = '1419335632324657306';

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
