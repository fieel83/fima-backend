const fimaLoopbackHost = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(window.location.hostname);
window.FIMA_API_BASE_URL = window.FIMA_API_BASE_URL
  || (fimaLoopbackHost ? window.location.origin : "https://api.fimamacro.com");
window.FIMA_DISCORD_INVITE_URL = window.FIMA_DISCORD_INVITE_URL || "https://discord.gg/JnEcaNmutd";
