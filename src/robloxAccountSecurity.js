import { randomBytes } from "node:crypto";

class RobloxAuthorityError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
const deny = (code, status) => { throw new RobloxAuthorityError(code, status); };
const numericId = (value) => typeof value === "string" && /^[1-9][0-9]{0,19}$/.test(value) ? value : null;
const pendingValid = (pending, now) => pending?.provider === "roblox_profile_verify"
  && typeof pending.metadata?.code === "string" && /^FIMAVERIFY-[A-F0-9]{6,64}$/.test(pending.metadata.code)
  && numericId(pending.metadata.robloxUserId) && typeof pending.metadata.username === "string"
  && Number.isFinite(Date.parse(pending.metadata.expiresAt)) && Date.parse(pending.metadata.expiresAt) > now;

// All writes use the same account/session row locks as OAuth linking/password reset.
// Database/provider adapters are injected to exercise these actual handlers without live mutations.
export function createRobloxAccountHandlers(d) {
  const now = d.now || Date.now;
  async function authority(req) {
    const binding = await d.captureAuthority(req);
    if (!binding || binding.userId !== req.user.id) deny("oauth_initiating_session_invalid", 401);
    return binding;
  }
  async function lockedUser(tx, binding) {
    await d.assertAuthority(tx, binding, true);
    const user = await tx.user.findUnique({ where: { id: binding.userId } });
    if (!user) deny("oauth_initiating_session_invalid", 401);
    return user;
  }
  async function assertOwnership(tx, user, id) {
    if (!numericId(id)) deny("roblox_profile_changed");
    if (user.robloxUserId && user.robloxUserId !== id) deny("roblox_unlink_required");
    const own = await tx.oAuthLink.findMany({ where: { userId: user.id, provider: "roblox" } });
    if (own.some((link) => link.providerSubject !== id)) deny("roblox_unlink_required");
    const linked = await tx.oAuthLink.findUnique({ where: { provider_providerSubject: { provider: "roblox", providerSubject: id } } });
    if (linked && linked.userId !== user.id) deny("roblox_profile_already_verified");
    const duplicate = await tx.user.findFirst({ where: { robloxUserId: id, id: { not: user.id } }, select: { id: true } });
    if (duplicate) deny("roblox_profile_already_verified");
    return linked;
  }
  async function response(res, user, includeTrial = true) {
    const integrations = await d.buildIntegrationSummary(user);
    return res.json({ success: true, user: d.publicUser(user), integrations,
      ...(includeTrial ? { trial: await d.buildTrialSummary(user, new Date(now()), integrations) } : {}) });
  }
  function handler(name, run) {
    return async (req, res) => {
      try { return await run(req, res); }
      catch (error) {
        const code = error.code || error.message;
        if (error instanceof RobloxAuthorityError) return res.status(error.status).json({ success: false, error: code });
        if (code === "oauth_initiating_session_invalid") return res.status(401).json({ success: false, error: code });
        if (error.code === "P2002") return res.status(409).json({ success: false, error: "roblox_profile_already_verified" });
        d.logError?.(name, error);
        return res.status(500).json({ success: false, error: `${name}_failed` });
      }
    };
  }
  return {
    profile: handler("profile_update", async (req, res) => {
      const raw = String(req.body?.robloxUsername || "").trim();
      const username = d.normalizeUsername(raw);
      if (raw && !username) deny("invalid_roblox_username", 400);
      const binding = await authority(req);
      const user = await d.db.$transaction(async (tx) => {
        const current = await lockedUser(tx, binding);
        const linked = await tx.oAuthLink.findFirst({ where: { userId: current.id, provider: "roblox" } });
        if (current.robloxUserId || linked) {
          if ((username || "").toLowerCase() !== (d.normalizeUsername(current.robloxUsername || "") || "").toLowerCase()) deny("roblox_unlink_required");
          return current; // Cosmetic endpoint may never erase verified numeric ownership.
        }
        await tx.oAuthLink.deleteMany({ where: { userId: current.id, provider: "roblox_profile_verify" } });
        return tx.user.update({ where: { id: current.id }, data: { robloxUsername: username || null, robloxUserId: null, robloxAvatarUrl: null } });
      });
      await d.audit("profile_roblox_username_updated", "user", user.id, { hasRobloxUsername: Boolean(username), proof: "manual_profile_only" });
      return response(res, user, false);
    }),
    start: handler("roblox_verification_start", async (req, res) => {
      const username = d.normalizeUsername(String(req.body?.robloxUsername || "").trim());
      if (!username) deny("invalid_roblox_username", 400);
      const binding = await authority(req); // Capture password/session generation before network I/O.
      const profile = await d.resolveProfile(username);
      if (!numericId(profile?.id)) deny("roblox_profile_not_found", 404);
      const code = `FIMAVERIFY-${randomBytes(16).toString("hex").toUpperCase()}`;
      const expiresAt = new Date(now() + 30 * 60 * 1000);
      const user = await d.db.$transaction(async (tx) => {
        const current = await lockedUser(tx, binding);
        await assertOwnership(tx, current, profile.id);
        await tx.oAuthLink.deleteMany({ where: { userId: current.id, provider: "roblox_profile_verify" } });
        await tx.oAuthLink.create({ data: { userId: current.id, provider: "roblox_profile_verify", providerSubject: current.id,
          providerUsername: profile.username, metadata: { code, expiresAt: expiresAt.toISOString(), robloxUserId: profile.id,
            username: profile.username, displayName: profile.displayName, avatarUrl: profile.avatarUrl, method: "profile_description" } } });
        return current; // Starting another proof must preserve the verified identity and avatar.
      });
      await d.audit("roblox_profile_verification_started", "user", user.id, { robloxUserIdMasked: d.maskId(profile.id), username: profile.username, expiresAt: expiresAt.toISOString() });
      return response(res, user);
    }),
    confirm: handler("roblox_verification_confirm", async (req, res) => {
      const binding = await authority(req);
      const pending = await d.db.oAuthLink.findFirst({ where: { userId: req.user.id, provider: "roblox_profile_verify" }, orderBy: { updatedAt: "desc" } });
      if (!pendingValid(pending, now())) deny("roblox_verification_expired", 400);
      const profile = await d.resolveProfileWithDescription(pending.metadata.username);
      if (!numericId(profile?.id)) deny("roblox_profile_not_found", 404);
      if (profile.id !== pending.metadata.robloxUserId) deny("roblox_profile_changed");
      const code = pending.metadata.code;
      const description = String(profile.description || "").toUpperCase();
      if (!new RegExp(`(^|[^A-Z0-9-])${code}($|[^A-Z0-9-])`).test(description)) deny("roblox_code_not_found", 400);
      const user = await d.db.$transaction(async (tx) => {
        const current = await lockedUser(tx, binding);
        const claim = await tx.oAuthLink.findUnique({ where: { id: pending.id } });
        if (!pendingValid(claim, now()) || claim.userId !== current.id || claim.providerSubject !== pending.providerSubject
          || claim.metadata.code !== code || claim.metadata.expiresAt !== pending.metadata.expiresAt
          || claim.metadata.robloxUserId !== profile.id || claim.metadata.username !== pending.metadata.username) deny("roblox_verification_expired", 400);
        const linked = await assertOwnership(tx, current, profile.id);
        const consumed = await tx.oAuthLink.deleteMany({ where: { id: claim.id, userId: current.id, provider: "roblox_profile_verify" } });
        if (consumed.count !== 1) deny("roblox_verification_expired", 400);
        const identity = { providerUsername: profile.username, metadata: { verifiedBy: "profile_description", verifiedAt: new Date(now()).toISOString(), displayName: profile.displayName } };
        if (linked) await tx.oAuthLink.update({ where: { id: linked.id }, data: identity });
        else await tx.oAuthLink.create({ data: { userId: current.id, provider: "roblox", providerSubject: profile.id, ...identity } });
        return tx.user.update({ where: { id: current.id }, data: { robloxUsername: profile.username, robloxUserId: profile.id, robloxAvatarUrl: profile.avatarUrl || null } });
      });
      await d.audit("roblox_profile_verified", "user", user.id, { robloxUserIdMasked: d.maskId(profile.id), username: profile.username, method: "profile_description" });
      return response(res, user);
    }),
    clear: handler("roblox_clear", async (req, res) => {
      const binding = await authority(req);
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!password || password.length > 200) deny("password_confirmation_required", 400);
      const user = await d.db.$transaction(async (tx) => {
        const current = await lockedUser(tx, binding);
        if (!(await d.verifyPassword(password, current.passwordHash))) deny("password_confirmation_failed", 403);
        await tx.oAuthLink.deleteMany({ where: { userId: current.id, provider: { in: ["roblox", "roblox_profile_verify"] } } });
        await tx.passwordResetToken.updateMany({ where: { userId: current.id, usedAt: null }, data: { usedAt: new Date(now()) } });
        await tx.desktopLoginRequest.updateMany({ where: { userId: current.id, status: { in: ["pending", "approved"] } }, data: { status: "cancelled", cancelledAt: new Date(now()) } });
        return tx.user.update({ where: { id: current.id }, data: { robloxUsername: null, robloxUserId: null, robloxAvatarUrl: null } });
      });
      await d.audit("roblox_profile_cleared", "user", user.id, { previousRobloxUserIdMasked: d.maskId(req.user.robloxUserId) });
      return response(res, user);
    })
  };
}
