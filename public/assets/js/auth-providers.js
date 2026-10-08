(() => {
  const apiBase = String(window.FIMA_API_BASE_URL || "https://api.fimamacro.com").replace(/\/+$/, "");
  const safePath = (value) => {
    if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/dashboard/overview";
    try {
      const target = new URL(value, location.origin);
      return target.origin === location.origin ? target.pathname + target.search + target.hash : "/dashboard/overview";
    } catch { return "/dashboard/overview"; }
  };
  let availability;
  const discover = () => availability ||= fetch(`${apiBase}/api/auth/providers`, { credentials: "include", cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Sign-in availability could not be checked. Please use your FIMA username and password or try again later.");
      const data = await response.json();
      if (!Array.isArray(data.providers)) throw new Error("Invalid sign-in availability response.");
      return new Set(data.providers.filter((provider) => ["google", "discord"].includes(provider)));
    });
  window.fimaRefreshProviderLinks = async () => {
    const buttons = Array.from(document.querySelectorAll("[data-provider-sign-in]"));
    if (!buttons.length) return;
    try {
      const providers = await discover();
      for (const button of buttons) {
        const enabled = providers.has(button.dataset.providerSignIn);
        button.disabled = !enabled;
        button.title = enabled ? "" : `${button.dataset.providerSignIn} sign-in is not configured.`;
      }
      for (const status of document.querySelectorAll("[data-provider-status]")) {
        const unavailable = ["google", "discord"].filter((provider) => !providers.has(provider));
        status.textContent = unavailable.length ? `Currently unavailable: ${unavailable.join(", ")}. Use your FIMA username and password.` : "Google and Discord sign-in are available.";
      }
    } catch (error) {
      for (const button of buttons) button.disabled = true;
      for (const status of document.querySelectorAll("[data-provider-status]")) status.textContent = error.message;
    }
  };
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-provider-sign-in]");
    if (!button || button.disabled || !["google", "discord"].includes(button.dataset.providerSignIn)) return;
    const next = safePath(button.dataset.returnTo || new URLSearchParams(location.search).get("next"));
    const target = new URL(`${apiBase}/auth/${button.dataset.providerSignIn}/start`);
    target.searchParams.set("returnTo", next);
    button.disabled = true;
    location.assign(target.href);
  });
  document.addEventListener("DOMContentLoaded", () => {
    window.fimaRefreshProviderLinks();
    const code = new URLSearchParams(location.search).get("error");
    const messages = {
      provider_link_requires_login: "A FIMA account already uses this email. Sign in to that account first, then connect this provider in Connected accounts. Your accounts have not been merged.",
      provider_already_linked: "This provider identity is already linked to another FIMA account. Sign in to that account; it cannot be attached to a different account.",
      google_oauth_failed: "Google sign-in failed. Try again, or use your FIMA username and password.",
      discord_oauth_failed: "Discord sign-in failed. Try again, or use your FIMA username and password."
    };
    if (messages[code]) {
      const status = document.querySelector("[data-provider-status]");
      // Keep callback guidance separate from the asynchronous availability message.
      const message = document.createElement("p");
      message.className = "message";
      message.setAttribute("role", "alert");
      message.textContent = messages[code];
      status?.after(message);
    }
  });
})();
