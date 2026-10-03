// Only the authenticated account may reveal or set its own identity.
export function revealAccountIdentity(req, res) {
  res.set("Cache-Control", "private, no-store");
  res.set("Pragma", "no-cache");
  if (!req.user?.id) return res.status(401).json({ error: "unauthorized" });
  const field = req.body?.field;
  if (!["username", "email"].includes(field)) return res.status(400).json({ error: "invalid_identity_field" });
  const email = String(req.user.email || "");
  const synthetic = email.toLowerCase().endsWith("@username.fimamacro.local");
  const value = field === "username" ? req.user.username || (synthetic ? email.split("@")[0] : "") : synthetic ? "" : email;
  if (!value) return res.status(409).json({ error: "identity_not_available" });
  return res.json({ success: true, field, value });
}

export async function assignAccountUsername({ client, userId, username }) {
  const reject = code => { throw Object.assign(new Error(code), { code }); };
  if (!userId) reject("unauthorized");
  if (!/^[a-z0-9_]{3,24}$/.test(username || "")) reject("invalid_username");
  return client.$transaction(async tx => {
    const rows = await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    if (rows?.length !== 1) reject("account_not_found");
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.credentialSetupRequired) reject("account_setup_required");
    // Changing the legacy synthetic login email needs a separate credential flow.
    if (String(user.email || "").toLowerCase().endsWith("@username.fimamacro.local")
        && user.email.split("@")[0].toLowerCase() !== username) reject("legacy_username_change_unavailable");
    const collision = await tx.user.findFirst({ where: { id: { not: userId }, OR: [
      { username }, { email: `${username}@username.fimamacro.local` },
      { emailNormalized: `${username}@username.fimamacro.local` }
    ] } });
    if (collision) reject("username_unavailable");
    // The unique username index resolves concurrent modern registration/assignment.
    // Email, password, providers, recovery and sessions are deliberately preserved.
    return tx.user.update({ where: { id: userId }, data: { username } });
  });
}

export function usernameHandler({ client, normalize, reserved, serialize }) {
  return async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (!req.user?.id) return res.status(401).json({ error: "unauthorized" });
    const username = normalize(req.body?.username);
    if (!username || reserved.has(username)) return res.status(400).json({ error: "invalid_username" });
    try {
      const user = await assignAccountUsername({ client, userId: req.user.id, username });
      return res.json({ success: true, user: serialize(user) });
    } catch (error) {
      const code = error.code === "P2002" ? "username_unavailable" : error.code;
      const known = ["username_unavailable", "account_setup_required", "legacy_username_change_unavailable", "account_not_found"].includes(code);
      return res.status(known ? 409 : 500).json({ error: known ? code : "username_update_failed" });
    }
  };
}
