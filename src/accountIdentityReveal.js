// Own-account identity only. Public serializers deliberately retain masked email.
export function revealAccountIdentity(req, res) {
  res.set("Cache-Control", "private, no-store");
  res.set("Pragma", "no-cache");
  if (!req.user?.id) return res.status(401).json({ success: false, error: "unauthorized" });
  const field = req.body?.field;
  if (field !== "username" && field !== "email") {
    return res.status(400).json({ success: false, error: "invalid_identity_field" });
  }
  const email = String(req.user.email || "").trim();
  const synthetic = email.toLowerCase().endsWith("@username.fimamacro.local");
  const value = field === "username"
    ? String(req.user.username || (synthetic ? email.split("@")[0] : "")).trim()
    : (synthetic ? "" : email);
  if (!value) return res.status(409).json({ success: false, error: "identity_not_available" });
  return res.json({ success: true, field, value });
}
