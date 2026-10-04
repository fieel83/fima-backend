const FIMA_BOT_LEGACY_PRODUCT_IDS = Object.freeze(["paradise", "paradise-bot"]);
const FIMA_BOT_LEGACY_NAMES = Object.freeze(["Paradise", "Paradise Bot"]);

export const FIMA_BOT_IDENTITY = Object.freeze({
  productId: "fima-bot",
  displayName: "FIMA Bot",
  shortName: "FIMA",
  legacyProductIds: FIMA_BOT_LEGACY_PRODUCT_IDS,
  legacyNames: FIMA_BOT_LEGACY_NAMES
});

export const FIMA_BOT_SLASH_COMMAND_METADATA = Object.freeze({
  setup: Object.freeze({
    name: "setupfima",
    description: "Preview or safely apply the FIMA community channel/role system.",
    legacyNames: Object.freeze(["setupfieelscommunity"])
  }),
  status: Object.freeze({
    name: "fima_status",
    description: "Show FIMA Bot and community system status.",
    legacyNames: Object.freeze([])
  })
});

export const FIMA_BOT_PUBLIC_ROUTE_ALIASES = Object.freeze({
  "/paradise": "/fima-bot/dashboard",
  "/dashboard/paradise": "/fima-bot/dashboard",
  "/dashboard/fima-bot": "/fima-bot/dashboard",
  "/paradise/dashboard": "/fima-bot/dashboard",
  "/paradise-bot": "/fima-bot",
  "/paradise-bot.html": "/fima-bot",
  "/paradise/content-studio": "/fima-bot/content-studio",
  "/paradise/invite": "/fima-bot/invite",
  "/bot/invite": "/fima-bot/invite",
  "/paradise/commands": "/fima-bot/commands",
  "/bot/commands": "/fima-bot/commands",
  "/paradise/premium": "/fima-bot/premium",
  "/bot/premium": "/fima-bot/premium",
  "/paradise/feedback": "/fima-bot/feedback",
  "/bot/feedback": "/fima-bot/feedback",
  "/paradise/apply": "/fima-bot/apply",
  "/paradise-apply": "/fima-bot/apply",
  "/bot/apply": "/fima-bot/apply",
  "/paradise/reseller": "/fima-bot/reseller",
  "/bot/reseller": "/fima-bot/reseller"
});

export function canonicalFimaBotProductId(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === FIMA_BOT_IDENTITY.productId || FIMA_BOT_LEGACY_PRODUCT_IDS.includes(normalized)
    ? FIMA_BOT_IDENTITY.productId
    : normalized;
}

export function rewriteFimaBotApiUrl(url) {
  const value = String(url || "");
  if (value === "/api/paradise") return "/api/fima-bot";
  if (value.startsWith("/api/paradise/") || value.startsWith("/api/paradise?")) {
    return `/api/fima-bot${value.slice("/api/paradise".length)}`;
  }
  return value;
}

export function fimaBotApiCompatibility(req, res, next) {
  const rewritten = rewriteFimaBotApiUrl(req.url);
  if (rewritten !== req.url) {
    req.url = rewritten;
    res.setHeader("Deprecation", "true");
    res.setHeader("Link", "</api/fima-bot>; rel=\"successor-version\"");
  }
  next();
}

export function publicFimaBotIdentity() {
  return {
    productId: FIMA_BOT_IDENTITY.productId,
    displayName: FIMA_BOT_IDENTITY.displayName,
    shortName: FIMA_BOT_IDENTITY.shortName,
    canonical: {
      productPage: "/fima-bot",
      dashboard: "/fima-bot/dashboard",
      apiPrefix: "/api/fima-bot"
    }
  };
}
