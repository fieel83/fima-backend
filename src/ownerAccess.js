const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeId = (value) => String(value || "").trim();

export function ownerIdentityStatus(accountAccess, { ownerEmail, ownerDiscordId } = {}) {
  const user = accountAccess?.user;
  const requiredEmail = normalizeEmail(ownerEmail);
  const requiredDiscordId = normalizeId(ownerDiscordId);
  const accountPresent = Boolean(user && typeof user === "object");
  const emailMatches = accountPresent
    && requiredEmail.length > 0
    && normalizeEmail(user.emailNormalized || user.email) === requiredEmail;
  const discordUserMatches = accountPresent
    && requiredDiscordId.length > 0
    && normalizeId(user.discordUserId) === requiredDiscordId;
  const discordOAuthMatches = accountPresent
    && requiredDiscordId.length > 0
    && Array.isArray(user.oauthLinks)
    && user.oauthLinks.some((link) =>
      String(link?.provider || "").trim().toLowerCase() === "discord"
      && normalizeId(link?.providerSubject) === requiredDiscordId);

  return {
    ok: Boolean(accountPresent && emailMatches && discordUserMatches && discordOAuthMatches),
    accountPresent,
    emailMatches,
    discordUserMatches,
    discordOAuthMatches
  };
}
