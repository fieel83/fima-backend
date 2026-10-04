const params = new URLSearchParams(globalThis.location?.search || "");
const guildId = String(params.get("guild") || "");
const action = document.querySelector("[data-invite-action]");
const status = document.querySelector("[data-invite-status]");

if (/^\d{16,22}$/.test(guildId) && action) {
  action.href = `/fima-bot/invite/authorize?guild=${encodeURIComponent(guildId)}`;
}

if (params.get("status") === "unavailable") {
  if (status) status.hidden = false;
  action?.setAttribute("aria-disabled", "true");
  action?.removeAttribute("href");
}
