const localized = (tr, en) => Object.freeze({ tr, en });

export const FIMA_BOT_SURFACE = Object.freeze({
  productId: "fima-bot",
  displayName: "FIMA Bot",
  designSystem: "teal-obsidian",
  supportedLocales: Object.freeze(["tr", "en"]),
  defaultLocale: "tr"
});

export const FIMA_BOT_DESIGN_CONTRACT = Object.freeze({
  foundation: "fima-shared-product-shell-v1",
  productAccent: "teal",
  surface: "obsidian",
  pageModel: "route-per-feature",
  navigation: Object.freeze(["desktop-primary", "mobile-drawer", "keyboard-skip-link"]),
  controls: Object.freeze(["fima-select", "fima-upload", "fima-scrollbar", "inline-status"]),
  accessibility: Object.freeze({ reducedMotion: true, visibleFocus: true, minContrast: "WCAG-AA" }),
  localeSync: Object.freeze({ device: true, account: true, precedence: "account-then-device-then-default" })
});

export const FIMA_BOT_PUBLIC_ASSET_POLICY = Object.freeze({
  canonicalRoot: "/assets/images/fima-bot/",
  forbiddenVisibleIdentity: "paradise"
});

const PAGE_DEFINITIONS = [
  ["product", "/fima-bot", "public", "Ürün", "Product"],
  ["commands", "/fima-bot/commands", "public", "Komutlar", "Commands"],
  ["applications", "/fima-bot/apply", "public", "Başvurular", "Applications"],
  ["premium", "/fima-bot/premium", "public", "Premium", "Premium"],
  ["feedback", "/fima-bot/feedback", "public", "Destek", "Support"],
  ["invite", "/fima-bot/invite", "public", "Sunucuya ekle", "Add to server"],
  ["dashboard", "/fima-bot/dashboard", "account", "Sunucu merkezi", "Server center"],
  ["contentStudio", "/fima-bot/content-studio", "owner", "İçerik stüdyosu", "Content Studio"]
];

export const FIMA_BOT_PAGES = Object.freeze(Object.fromEntries(PAGE_DEFINITIONS.map(
  ([id, pathname, access, tr, en]) => [id, Object.freeze({ id, pathname, access, label: localized(tr, en) })]
)));

export const FIMA_BOT_LEGACY_ALIASES = Object.freeze({
  "/paradise-bot": "/fima-bot",
  "/paradise-bot.html": "/fima-bot",
  "/paradise": "/fima-bot/dashboard",
  "/paradise/dashboard": "/fima-bot/dashboard",
  "/dashboard/paradise": "/fima-bot/dashboard",
  "/paradise/commands": "/fima-bot/commands",
  "/paradise/apply": "/fima-bot/apply",
  "/paradise-apply": "/fima-bot/apply",
  "/paradise/premium": "/fima-bot/premium",
  "/paradise/feedback": "/fima-bot/feedback",
  "/paradise/invite": "/fima-bot/invite",
  "/paradise/content-studio": "/fima-bot/content-studio"
});

const APPLICATION_DEFINITIONS = [
  ["helper", "helper", "Community Staff", "public", "Helper", "Helper"],
  ["staff", "staff", "Community Staff", "public", "Staff", "Staff"],
  ["moderator", "moderator", "Community Staff", "public", "Moderatör", "Moderator"],
  ["support", "support", "Community Staff", "public", "Destek", "Support"],
  ["training_hoster", "training-hoster", "Community Staff", "public", "Eğitim Sunucusu", "Training Hoster"],
  ["event_staff", "event-staff", "Community Staff", "public", "Etkinlik Ekibi", "Event Staff"],
  ["giveaway_staff", "giveaway-staff", "Community Staff", "public", "Çekiliş Ekibi", "Giveaway Staff"],
  ["content_creator", "content-creator", "Community Staff", "public", "İçerik Üreticisi", "Content Creator"],
  ["video_team", "video-team", "Community Staff", "public", "Video Ekibi", "Video Team"],
  ["creative_team", "creative-team", "Community Staff", "public", "Yaratıcı Ekip", "Creative Team"],
  ["developer", "developer", "Community Staff", "public", "Geliştirici", "Developer"],
  ["fima_support", "fima-support", "Community Staff", "public", "FIMA Destek", "FIMA Support"],
  ["macro_staff", "macro-staff", "Community Staff", "public", "Macro Ekibi", "Macro Staff"],
  ["fflag_staff", "fflag-staff", "Community Staff", "public", "FFlag Ekibi", "FFlag Staff"],
  ["clan_mainer", null, "Clan Operations", "guild_private", "Klan Üyesi / Mainer", "Clan Member / Mainer"],
  ["war_hoster", null, "Clan Operations", "guild_private", "Savaş Sunucusu", "War Hoster"],
  ["tryout_hoster", null, "Competitive / TSBTR", "guild_private", "Seçme Sunucusu", "Tryout Hoster"],
  ["referee", null, "Competitive / TSBTR", "guild_private", "Hakem", "Referee"],
  ["partnership", "partnership", "Partnership", "public", "Ortaklık", "Partnership"],
  ["creator", "creator", "Creator / Media", "public", "Üretici / Medya Ortağı", "Creator / Media Partner"],
  ["reseller", "reseller", "Reseller / Affiliate", "public", "Bayi / Satış Ortağı", "Reseller / Affiliate"]
];

export const FIMA_BOT_APPLICATIONS = Object.freeze(Object.fromEntries(APPLICATION_DEFINITIONS.map(
  ([type, slug, family, submission, tr, en]) => [type, Object.freeze({
    type,
    slug,
    family,
    submission,
    discoverable: true,
    autoGrantRole: false,
    pathname: slug ? `/fima-bot/apply/${slug}` : null,
    label: localized(tr, en)
  })]
)));

export function normalizeFimaLocale(value) {
  const normalized = String(value || "").trim().toLowerCase().split("-")[0];
  return FIMA_BOT_SURFACE.supportedLocales.includes(normalized) ? normalized : FIMA_BOT_SURFACE.defaultLocale;
}

export function fimaBotNavigation(locale = FIMA_BOT_SURFACE.defaultLocale, access = "public") {
  const selectedLocale = normalizeFimaLocale(locale);
  const accessOrder = { public: 0, account: 1, owner: 2 };
  const level = Object.hasOwn(accessOrder, access) ? accessOrder[access] : -1;
  return Object.values(FIMA_BOT_PAGES)
    .filter(page => accessOrder[page.access] <= level)
    .map(page => Object.freeze({ id: page.id, pathname: page.pathname, label: page.label[selectedLocale] }));
}

export function resolveFimaBotPage(pathname, { authenticated = false, owner = false } = {}) {
  const cleanPath = String(pathname || "").split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  const legacyTarget = FIMA_BOT_LEGACY_ALIASES[cleanPath];
  if (legacyTarget) return Object.freeze({ kind: "redirect", status: 308, target: legacyTarget });
  const page = Object.values(FIMA_BOT_PAGES).find(candidate => candidate.pathname === cleanPath);
  if (!page) return null;
  if (page.access === "account" && !authenticated) return Object.freeze({ kind: "deny", code: "account_required" });
  if (page.access === "owner" && !owner) return Object.freeze({ kind: "deny", code: "owner_required" });
  return Object.freeze({ kind: "page", page });
}

export function fimaBotApplicationCatalog(locale = FIMA_BOT_SURFACE.defaultLocale) {
  const selectedLocale = normalizeFimaLocale(locale);
  return Object.values(FIMA_BOT_APPLICATIONS).map(item => Object.freeze({
    type: item.type,
    family: item.family,
    submission: item.submission,
    pathname: item.pathname,
    label: item.label[selectedLocale],
    autoGrantRole: false
  }));
}

export function resolveFimaBotApplicationPage(pathname, {
  authenticated = false,
  discordVerified = false
} = {}) {
  const cleanPath = String(pathname || "").split(/[?#]/, 1)[0].replace(/\/+$/, "");
  const application = Object.values(FIMA_BOT_APPLICATIONS).find(candidate => candidate.pathname === cleanPath);
  if (!application) return null;
  if (!authenticated) return Object.freeze({ kind: "deny", code: "account_required", application });
  if (!discordVerified) return Object.freeze({ kind: "deny", code: "discord_verification_required", application });
  return Object.freeze({ kind: "page", application, reviewMode: "manual_review" });
}

export function auditFimaBotPublicAssetPath(pathname) {
  const normalized = String(pathname || "").trim().replaceAll("\\", "/").toLowerCase();
  if (!normalized.startsWith(FIMA_BOT_PUBLIC_ASSET_POLICY.canonicalRoot)) {
    return Object.freeze({ allowed: false, code: "fima_bot_asset_root_required" });
  }
  if (normalized.includes(FIMA_BOT_PUBLIC_ASSET_POLICY.forbiddenVisibleIdentity)) {
    return Object.freeze({ allowed: false, code: "legacy_identity_in_public_asset" });
  }
  return Object.freeze({ allowed: true, code: "canonical_fima_bot_asset" });
}

export function resolveFimaBotApplicationSubmission(type, {
  publicWebsite = true,
  authenticated = false,
  discordVerified = false,
  guildPrivateContext = false
} = {}) {
  const application = FIMA_BOT_APPLICATIONS[String(type || "").trim().toLowerCase()];
  if (!application) return Object.freeze({ allowed: false, code: "application_type_unknown" });
  if (application.submission === "guild_private") {
    const allowed = !publicWebsite && authenticated && discordVerified && guildPrivateContext;
    return Object.freeze({ allowed, code: allowed ? "guild_private_review" : "guild_private_submission_required", application });
  }
  if (!authenticated) return Object.freeze({ allowed: false, code: "account_required", application });
  if (!discordVerified) return Object.freeze({ allowed: false, code: "discord_verification_required", application });
  return Object.freeze({ allowed: true, code: "manual_review", application });
}
