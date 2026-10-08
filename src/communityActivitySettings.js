const bounded = (value, fallback, min, max) => {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

// Old generic level settings never controlled the monthly community engine.
// Activate this binding only after an explicit save in the community editor.
export function communityActivitySettings(settings = {}, source = process.env) {
  const managed = settings.communityManaged === true;
  return Object.freeze({
    communityManaged: managed,
    enabled: String(source.COMMUNITY_ACTIVITY_ENABLED).toLowerCase() === "true" && (!managed || settings.enabled === true),
    chatXp: bounded(managed ? settings.chatXp : source.COMMUNITY_ACTIVITY_TEXT_XP_PER_MESSAGE, 10, 1, 100),
    chatCooldownSeconds: managed ? bounded(settings.chatCooldownSeconds, 15, 15, 3600) : 0,
    voiceXpPerMinute: bounded(managed ? settings.voiceXpPerMinute : source.COMMUNITY_ACTIVITY_VOICE_XP_PER_MINUTE, 5, 1, 100)
  });
}

export async function communityActivitySettingsForGuild(db, guildId, source = process.env) {
  const row = await db.setting?.findUnique?.({ where: { key: "paradise_3a59_state_v1" } });
  const state = typeof row?.value === "string" ? JSON.parse(row.value) : row?.value;
  return communityActivitySettings(state?.guildConfigs?.[guildId]?.xpSettings, source);
}
