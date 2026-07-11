import { paradiseGuildWorkspaceAccess } from "./paradiseGuildScope.js";

function cleanText(value, fallback = null) {
  const text = String(value || "").trim();
  return text || fallback;
}

export function buildParadiseCustomerWorkspaceCards({ memberships = [], managedGuilds = [], planByGuildId = {}, templateByGuildId = {} } = {}) {
  const installedGuildIds = managedGuilds.map(guild => String(guild.id));
  const managedById = new Map(managedGuilds.map(guild => [String(guild.id), guild]));
  return memberships.flatMap(membership => {
    const access = paradiseGuildWorkspaceAccess({ guildId: membership.id, memberships, installedGuildIds });
    if (!access.allowed) return [];
    const guildId = access.guildId;
    const managed = managedById.get(guildId);
    return [{
      guildId,
      name: cleanText(membership.name, "Unnamed server"),
      iconHash: cleanText(membership.icon),
      isOwner: membership.owner === true,
      canManage: true,
      botInstalled: access.installed,
      memberCount: Number.isFinite(Number(managed?.memberCount)) ? Number(managed.memberCount) : null,
      activePlan: cleanText(planByGuildId[guildId], "free"),
      activeTemplate: cleanText(templateByGuildId[guildId]),
      lastSuccessfulSyncAt: managed?.lastSuccessfulSyncAt || null
    }];
  });
}
