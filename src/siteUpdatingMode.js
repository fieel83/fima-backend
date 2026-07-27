const UPDATING_MODE_VALUES = new Set(["owner_only", "maintenance", "updating", "on", "true", "1"]);

const OPEN_PATHS = new Set([
  "/healthz",
  "/updating.html",
  "/owner-sign-in.html",
  "/favicon.ico",
  "/robots.txt",
  "/auth/discord/callback",
  "/api/auth/login"
]);

function pathnameOf(target) {
  try {
    return new URL(String(target || "/"), "http://fima.local").pathname;
  } catch {
    return "/";
  }
}

export function isUpdatingModeEnabled(value) {
  return UPDATING_MODE_VALUES.has(String(value || "").trim().toLowerCase());
}

export function isUpdatingModeOpenPath(target) {
  const pathname = pathnameOf(target);
  return OPEN_PATHS.has(pathname)
    || pathname.startsWith("/assets/css/updating.")
    || pathname.startsWith("/assets/js/updating.")
    || pathname === "/assets/js/owner-sign-in.js";
}

export function isUpdatingModeApiRequest({ originalUrl, accept, contentType } = {}) {
  const pathname = pathnameOf(originalUrl);
  if (pathname.startsWith("/api/")) return !isUpdatingModeOpenPath(originalUrl);
  return String(accept || "").toLowerCase().includes("application/json")
    || String(contentType || "").toLowerCase().includes("application/json");
}

export function updatingModeHeaders() {
  return {
    "Cache-Control": "no-store, private",
    "Retry-After": "3600",
    "X-Robots-Tag": "noindex, nofollow, noarchive"
  };
}
