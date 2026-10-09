import { OWNER_ROUTES, ownerPage, renderOwnerTools, disposeOwnerTools } from "./fima-owner-integration.js?v=20261010-1";
import { renderFimaOperations } from './fima-guild-operations.js?v=20261006-1';
import { observeFimaControls } from './fima-controls.js?v=20261008-2';
const API_BASE = String(window.FIMA_API_BASE_URL || "https://api.fimamacro.com").replace(/\/+$/, "");
function apiUrl(path) { return API_BASE + path; }
const LIST_ENDPOINT = "/api/fima-bot/customer/workspaces";
const DASHBOARD_ROOT = "/fima-bot/dashboard";
const DEFAULT_ROUTE = "overview";

const MODULE_META = Object.freeze({
  overview: ["Genel Bakış", "Sunucunun kurulum, plan ve senkronizasyon durumunu tek bakışta gör."],
  modules: ["Modüller", "Sunucunda etkinleştirilen FIMA Bot sistemlerinin özetini incele."],
  setup: ["Kurulum", "Kanal, rol ve sunucu şablonu eşleşmelerinin hazır olup olmadığını denetle."],
  content: ["İçerik Merkezi", "İçerik kanallarını ve harici yayın bağlantılarını incele."],
  polls: ["Anketler", "Discord anketini önizle ve yetkili kanalda yayınla."],
  integrations: ["Entegrasyonlar", "Harici uygulamaları ve webhook hedeflerini güvenle incele."],
  channels: ["Kanallar", "FIMA Bot olaylarının yönlendirildiği kanal eşleşmelerini gör."],
  roles: ["Roller ve Yetkiler", "Operasyon rollerinin güvenli eşleşmelerini incele."],
  welcome: ["Karşılama", "Hoş geldin, ayrılma ve rol paneli deneyimini takip et."],
  profiles: ["Profiller", "Doğrulama ve topluluk profili ayarlarını gör."],
  leaderboards: ["Liderlik Tabloları", "Metin ve ses etkinliği sıralamalarının durumunu incele."],
  challenge: ["Challenge Sistemi", "Meydan okuma akışının operasyon ayarlarını gör."],
  availability: ["Uygunluk ve İzin", "Ekip uygunluğu ve izin bildirim akışını takip et."],
  sessions: ["Training ve Tryout", "Oturum, sonuç ve onay akışlarının durumunu incele."],
  applications: ["Başvurular", "Staff, içerik, geliştirici, partner ve sunucuya özel başvuruları takip et."],
  tickets: ["Ticket Merkezi", "Destek talepleri, sahiplenme ve transcript düzenini gör."],
  moderation: ["Moderasyon", "Sunucu moderasyon politikasının etkin ayarlarını incele."],
  security: ["Güvenlik ve AutoMod", "Davet, dolandırıcılık ve spam korumalarının durumunu gör."],
  levels: ["XP ve Seviyeler", "Mesaj XP’si, bekleme süresi ve seviye sistemini takip et."],
  voice: ["Join-to-Create", "Geçici ses kanalı davranışlarının özetini gör."],
  events: ["Etkinlikler", "Etkinlik ve günlük soru akışlarının durumunu incele."],
  social: ["Sosyal Bildirimler", "İçerik bildirimlerinin yayın davranışını takip et."],
  ai: ["FIMA AI", "Ticket ve topluluk asistanı bağlantılarının durumunu gör."],
  commands: ["Özel Komutlar", "Komut görünürlüğü ve kanal kapsamlarını incele."],
  branding: ["Marka Görünümü", "Renk, tema, yoğunluk ve dil tercihlerini gör."],
  logs: ["Kayıtlar ve Transcriptler", "Kayıt saklama ve görüntüleme kapsamını incele."],
  premium: ["Premium", "Sunucunun etkin plan ve premium durumunu gör."],
  audit: ["Denetim Geçmişi", "Yetkili işlemlerin güvenli denetim yüzeyine eriş." ]
});

const MODULE_GROUPS = Object.freeze([
  ["Başlangıç", ["overview", "modules", "setup"]],
  ["Sunucu Yapısı", ["channels", "roles", "welcome", "profiles"]],
  ["Topluluk", ["leaderboards", "challenge", "availability", "sessions", "applications", "tickets"]],
  ["Koruma", ["moderation", "security", "logs", "audit"]],
  ["Büyüme", ["content", "polls", "integrations", "levels", "voice", "events", "social", "ai", "commands"]],
  ["Görünüm ve Plan", ["branding", "premium"]]
]);

const KEY_LABELS = Object.freeze({
  activeSetupMode: "Sunucu şablonu",
  activeTemplate: "Etkin şablon",
  activePlan: "Plan",
  brandColor: "Vurgu rengi",
  language: "Dil",
  dashboardTheme: "Dashboard teması",
  messageDensity: "Mesaj yoğunluğu",
  separatorStyle: "Ayraç stili",
  footerStyle: "Alt bilgi stili",
  enabledModules: "Etkin modüller",
  modules: "Modüller",
  channelMappings: "Kanal eşleşmeleri",
  roleMappings: "Rol eşleşmeleri",
  applicationSettings: "Başvuru ayarları",
  ticketSettings: "Ticket ayarları",
  moderationSettings: "Moderasyon ayarları",
  xpSettings: "XP ayarları",
  voiceSettings: "Ses ayarları",
  socialSettings: "Sosyal bildirim ayarları",
  aiSettings: "FIMA AI ayarları",
  logSettings: "Kayıt ayarları",
  customerWorkspaceVersion: "Yapılandırma sürümü"
});

const copy = Object.freeze({
  login_required: ["Oturum açman gerekiyor", "FIMA hesabınla giriş yaptıktan sonra sunucuların burada görünecek.", "Giriş yap", "/login?returnTo=%2Ffima-bot%2Fdashboard"],
  discord_link_required: ["Discord hesabını bağla", "Yönetebildiğin sunucuları doğrulamak için Discord bağlantısı gerekiyor.", "Discord’u bağla", "/auth/discord/start?returnTo=%2Ffima-bot%2Fdashboard"],
  discord_reauthorization_required: ["Discord iznini yenile", "Sunucu listesini okuyabilmemiz için Discord bağlantını güvenle yenile.", "Discord’u yeniden bağla", "/auth/discord/start?returnTo=%2Ffima-bot%2Fdashboard"],
  guild_not_authorized: ["Bu sunucuya erişim değişti", "Discord’daki yönetim yetkin kaldırılmış veya oturumun güncelliğini yitirmiş olabilir.", "Sunucu listesine dön", "#servers"],
  workspace_route_unavailable: ["Bu modül açılamadı", "Sunucudan dönen modül bilgisi eksik veya artık kullanılamıyor. Sunucu listesinden yeniden deneyebilirsin.", "Sunucu listesine dön", "#servers"],
  paradise_workspace_unavailable: ["Sunucu merkezi şu an ulaşılamıyor", "Ayarların güvende. Biraz sonra yeniden deneyebilirsin.", "Tekrar dene", "#retry"]
});

const APPLICATION_CATALOG = Object.freeze([
  ["Topluluk ekibi", [["helper", "Helper"], ["staff", "Staff"], ["moderator", "Moderator"], ["support", "Support"], ["training-hoster", "Training Hoster"], ["event-staff", "Event Staff"], ["giveaway-staff", "Giveaway Staff"]]],
  ["Medya ve yaratıcılık", [["content-creator", "Content Creator"], ["video-team", "Video Team"], ["creative-team", "Creative Team"]]],
  ["Ürün ekipleri", [["developer", "Developer"], ["fima-support", "FIMA Support"], ["macro-staff", "Macro Staff"], ["fflag-staff", "FFlag Staff"]]],
  ["İş ortaklıkları", [["partnership", "Partnership"], ["creator", "Creator / Media Partner"], ["reseller", "Reseller / Affiliate"]]]
]);

const SELECT_OPTIONS = Object.freeze({
  activeSetupMode: [["community", "Topluluk"], ["clan", "Klan"], ["tsbtr", "TSBTR"]],
  language: [["tr", "Türkçe"], ["en", "English"]],
  dashboardTheme: [["paradise", "FIMA"], ["charcoal", "Kömür"], ["midnight", "Gece"]],
  messageDensity: [["compact", "Kompakt"], ["comfortable", "Rahat"]],
  separatorStyle: [["classic", "Klasik"], ["sharp", "Keskin"], ["elegant", "Zarif"]],
  footerStyle: [["important_only", "Yalnız önemli bilgiler"], ["disabled", "Kapalı"]],
  viewerScope: [["staff", "Ekip"], ["managers", "Yöneticiler"], ["owners", "Sunucu sahipleri"]]
});

const EDITABLE_ROUTES = Object.freeze({
  overview: { fields: { language: { type: "enum" }, dashboardTheme: { type: "enum" } } },
  branding: { fields: { brandColor: { type: "color" }, dashboardTheme: { type: "enum" }, messageDensity: { type: "enum" }, separatorStyle: { type: "enum" }, footerStyle: { type: "enum" }, language: { type: "enum" } } },
  modules: { mapKey: "modules", mapType: "toggle" },
  channels: { mapKey: "channelMappings", mapType: "discord", itemLabel: "Kanal" },
  roles: { mapKey: "roleMappings", mapType: "discord", itemLabel: "Rol" },
  welcome: { configKey: "welcome", fields: { enabled: { type: "boolean" }, mentionMember: { type: "boolean" }, showMemberCount: { type: "boolean" } } },
  tickets: { configKey: "ticketSettings", fields: { enabled: { type: "boolean" }, claimEnabled: { type: "boolean" }, autoTranscript: { type: "boolean" }, deleteDelayMinutes: { type: "integer", min: 0, max: 10080 } } },
  sessions: { configKey: "sessionSettings", fields: { trainingEnabled: { type: "boolean" }, tryoutEnabled: { type: "boolean" }, resultApprovalRequired: { type: "boolean" } } },
  applications: { configKey: "applicationSettings", fields: { enabled: { type: "boolean" }, membershipRequired: { type: "boolean" }, cooldownDays: { type: "integer", min: 0, max: 365 }, panelTitle: { type: "string", max: 80 }, panelDescription: { type: "textarea", max: 1200 }, panelButtonLabel: { type: "string", max: 40 } } },
  levels: { configKey: "xpSettings", fields: { enabled: { type: "boolean" }, chatXp: { type: "integer", min: 1, max: 100 }, chatCooldownSeconds: { type: "integer", min: 15, max: 3600 }, voiceXpPerMinute: { type: "integer", min: 1, max: 100 } } },
  voice: { configKey: "voiceSettings", fields: { enabled: { type: "boolean" }, defaultLimit: { type: "integer", min: 0, max: 99 }, autoDelete: { type: "boolean" }, safeNames: { type: "boolean" } } },
  security: { configKey: "automod", fields: { enabled: { type: "boolean" }, blockInvites: { type: "boolean" }, blockScamKeywords: { type: "boolean" }, mentionSpamLimit: { type: "integer", min: 3, max: 50 } } },
  social: { configKey: "socialSettings", fields: { enabled: { type: "boolean" }, delaySeconds: { type: "integer", min: 0, max: 3600 } } },
  ai: { configKey: "aiSettings", fields: { enabled: { type: "boolean" }, ticketAssistant: { type: "boolean" }, communityAssistant: { type: "boolean" } } },
  logs: { configKey: "logSettings", fields: { retentionDays: { type: "integer", min: 1, max: 3650 }, viewerScope: { type: "enum" } } }
});

const FIELD_LABELS = Object.freeze({
  voiceXpPerMinute: "Ses XP / dakika (Community)",
  enabled: "Etkin",
  mentionMember: "Üyeden bahset",
  showMemberCount: "Üye sayısını göster",
  claimEnabled: "Talep sahiplenme",
  autoTranscript: "Ticket kapanınca transcript kaydet",
  deleteDelayMinutes: "Silme gecikmesi (dakika)",
  trainingEnabled: "Training oturumları",
  tryoutEnabled: "Tryout oturumları",
  resultApprovalRequired: "Sonuç onayı gerekli",
  membershipRequired: "Sunucu üyeliği gerekli",
  cooldownDays: "Bekleme süresi (gün)",
  panelTitle: "Panel başlığı",
  panelDescription: "Panel açıklaması",
  panelButtonLabel: "Panel butonu",
  chatXp: "Mesaj başına XP",
  chatCooldownSeconds: "Mesaj bekleme süresi (saniye)",
  defaultLimit: "Varsayılan kullanıcı limiti",
  autoDelete: "Boş kanalı otomatik sil",
  safeNames: "Güvenli kanal adları",
  blockInvites: "Davet bağlantılarını engelle",
  blockScamKeywords: "Dolandırıcılık ifadelerini engelle",
  mentionSpamLimit: "Bahsetme spam limiti",
  delaySeconds: "Bildirim gecikmesi (saniye)",
  ticketAssistant: "Ticket asistanı",
  communityAssistant: "Topluluk asistanı",
  retentionDays: "Kayıt saklama süresi (gün)",
  viewerScope: "Görüntüleyebilenler"
});

export function safeGuildId(value) {
  const id = String(value || "");
  return /^\d{16,22}$/.test(id) ? id : "";
}

function safeModuleId(value) {
  const id = String(value || "").trim().toLowerCase();
  return /^[a-z][a-z0-9-]{0,39}$/.test(id) ? id : DEFAULT_ROUTE;
}

export function parseDashboardRoute(url = globalThis.location?.href || `http://localhost${DASHBOARD_ROOT}`) {
  const parsed = new URL(url, "http://localhost");
  const pathMatch = parsed.pathname.match(/^\/fima-bot\/dashboard\/(?:servers\/)?(\d{16,22})(?:\/([a-z][a-z0-9-]{0,39}))?\/?$/i);
  if (pathMatch) return { guildId: safeGuildId(pathMatch[1]), route: safeModuleId(pathMatch[2] || DEFAULT_ROUTE), legacy: !parsed.pathname.includes('/servers/') };
  return {
    guildId: safeGuildId(parsed.searchParams.get("guild") || new URLSearchParams(parsed.hash.slice(1)).get("guild")),
    route: safeModuleId(parsed.searchParams.get("module") || ({ setup: "owner-setup", logs: "owner-logs", advanced: "owner-runtime", branding: "owner-bot", xp: "levels", guides: "content", roster: "profiles", leaderboard: "leaderboards", operations: "sessions", blacklist: "security" })[new URLSearchParams(parsed.hash.slice(1)).get("page")] || new URLSearchParams(parsed.hash.slice(1)).get("page") || DEFAULT_ROUTE),
    legacy: parsed.searchParams.has("guild") || parsed.searchParams.has("module")
  };
}

export function discordIconUrl(card) {
  const guildId = safeGuildId(card?.guildId);
  const hash = String(card?.iconHash || "").replace(/[^a-zA-Z0-9_]/g, "");
  return guildId && hash ? `https://cdn.discordapp.com/icons/${guildId}/${hash}.webp?size=128` : "";
}

const el = selector => document.querySelector(selector);
const state = {
  workspaces: [],
  selected: null,
  routes: [],
  route: DEFAULT_ROUTE,
  request: 0,
  payload: null,
  savedValue: null,
  dirty: false,
  saving: false,
  ownerAuthorized: false,
  ownerDirty: false
};
let csrfTokenPromise = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function initials(name) {
  return String(name || "FIMA").split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
}

function moduleTitle(route) {
  return MODULE_META[route?.id]?.[0] || route?.title || "Genel Bakış";
}

function moduleDescription(routeId) {
  return MODULE_META[routeId]?.[1] || "Bu modülün sunucuya özel durumunu güvenli biçimde incele.";
}

function dashboardLanguage() {
  return window.FimaBotDashboardI18n?.getLanguage?.() === "en" ? "en" : "tr";
}

function localizedCopy(value) {
  return window.FimaBotDashboardI18n?.translate?.(value) || value;
}

function updateDocumentTitle() {
  if (state.selected && state.routes.length) {
    const route = state.routes.find(item => item.id === state.route);
    document.title = `${localizedCopy(moduleTitle(route))} · ${state.selected.name} | FIMA Bot`;
    return;
  }
  document.title = dashboardLanguage() === "en"
    ? "FIMA Bot | Server Center"
    : "FIMA Bot | Sunucu Merkezi";
}

function readableKey(key) {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  return String(key || "Ayar").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, value => value.toUpperCase());
}

function formatDate(value) {
  if (!value) return "Henüz senkronize edilmedi";
  const date = new Date(value);
  const locale = dashboardLanguage() === "en" ? "en-US" : "tr-TR";
  return Number.isNaN(date.getTime()) ? "Bilinmiyor" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function errorCode(error) {
  if (error?.status === 401) return "login_required";
  return String(error?.payload?.error || error?.message || "paradise_workspace_unavailable");
}

async function request(url) {
  const response = await fetch(apiUrl(url), { credentials: "include", headers: { Accept: "application/json" } });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || "paradise_workspace_unavailable");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function csrfToken(force = false) {
  if (force) csrfTokenPromise = null;
  if (!csrfTokenPromise) {
    csrfTokenPromise = request("/api/csrf-token")
      .then(payload => {
        if (!payload.csrfToken) throw new Error("csrf_unavailable");
        return payload.csrfToken;
      })
      .catch(error => {
        csrfTokenPromise = null;
        throw error;
      });
  }
  return csrfTokenPromise;
}

async function patchWorkspaceConfig(guildId, route, value, expectedVersion, retry = true) {
  const csrf = await csrfToken();
  const response = await fetch(apiUrl(`${LIST_ENDPOINT}/${encodeURIComponent(guildId)}/config`), {
    method: "PATCH",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-fima-csrf": csrf
    },
    body: JSON.stringify({ route, value, expectedVersion })
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (response.status === 403 && payload.error === "csrf_required" && retry) {
    await csrfToken(true);
    return patchWorkspaceConfig(guildId, route, value, expectedVersion, false);
  }
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || "paradise_workspace_save_failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function dashboardPath(guildId = "", route = DEFAULT_ROUTE) {
  const id = safeGuildId(guildId);
  return id ? `${DASHBOARD_ROOT}/servers/${id}/${safeModuleId(route)}` : DASHBOARD_ROOT;
}

function updateUrl(guildId = "", route = DEFAULT_ROUTE, mode = "push") {
  if (mode === "none") return;
  const path = dashboardPath(guildId, route);
  if (`${location.pathname}${location.search}` === path) return;
  history[mode === "replace" ? "replaceState" : "pushState"]({ guildId, route }, "", path);
}

function actionState(target, { title, message, action, href, tone = "neutral", loading = false }) {
  target.className = `state-card is-${tone}`;
  target.setAttribute("role", tone === "error" ? "alert" : "status");
  target.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");
  target.toggleAttribute("aria-busy", loading);
  target.hidden = false;
  const actionHref = typeof href === 'string' && href.startsWith('/auth/') ? apiUrl(href) : href;
  target.innerHTML = `${loading ? '<div class="loader" aria-hidden="true"></div>' : '<span class="state-icon" aria-hidden="true">✦</span>'}<div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>${action ? `<a class="state-action" href="${escapeHtml(actionHref)}">${escapeHtml(action)}</a>` : ""}</div>`;
}

function showError(target, code, retry) {
  const [title, message, action, href] = copy[code] || copy.paradise_workspace_unavailable;
  actionState(target, { title, message, action, href, tone: code.includes("required") ? "warning" : "error" });
  const link = target.querySelector(".state-action");
  if (href === "#retry") link?.addEventListener("click", event => { event.preventDefault(); retry(); });
  if (href === "#servers") link?.addEventListener("click", event => { event.preventDefault(); showDirectory(); });
}

function serverCardTemplate(card) {
  const icon = discordIconUrl(card);
  const status = card.botInstalled ? "FIMA Bot kurulu" : "Bot kurulumu gerekli";
  const numberLocale = dashboardLanguage() === "en" ? "en-US" : "tr-TR";
  const members = Number.isFinite(card.memberCount) ? `${new Intl.NumberFormat(numberLocale).format(card.memberCount)} üye` : "Üye sayısı gizli";
  return `<a class="server-card" href="${dashboardPath(card.guildId)}" data-guild-id="${escapeHtml(card.guildId)}">
    <span class="server-icon">${icon ? `<img src="${icon}" alt="" loading="lazy">` : escapeHtml(initials(card.name))}</span>
    <span class="server-copy"><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(status)} · ${escapeHtml(members)}</small></span>
    <span class="server-meta"><b>${escapeHtml(String(card.activePlan || "free").toUpperCase())}</b><i aria-hidden="true">→</i></span>
  </a>`;
}

function resetEditorState() {
  state.payload = null;
  state.savedValue = null;
  state.dirty = false;
  state.saving = false;
}

function restoreCurrentLocation() {
  if (state.selected) {
    renderModules(state.routes, state.route);
    updateUrl(state.selected.guildId, state.route, "replace");
  } else {
    updateUrl("", DEFAULT_ROUTE, "replace");
  }
}

function showDirectory({ urlMode = "push", skipConfirm = false } = {}) {
  if (!skipConfirm && !confirmUnsavedNavigation()) {
    restoreCurrentLocation();
    return false;
  }
  ++state.request;
  disposeOwnerTools(el("[data-owner-tools]"));
  state.ownerDirty = false;
  resetEditorState();
  state.selected = null;
  state.route = DEFAULT_ROUTE;
  el("[data-workspace]").hidden = true;
  el("[data-server-directory]").hidden = false;
  updateUrl("", DEFAULT_ROUTE, urlMode);
  updateDocumentTitle();
  return true;
}

function renderDirectory() {
  const grid = el("[data-server-grid]");
  const status = el("[data-directory-state]");
  const installed = state.workspaces.filter(card => card.botInstalled).length;
  el("[data-directory-count]").textContent = String(state.workspaces.length);
  el("[data-directory-meter]").style.width = `${state.workspaces.length ? Math.max(12, Math.round((installed / state.workspaces.length) * 100)) : 0}%`;
  el("[data-directory-brief]").textContent = state.workspaces.length ? `${installed} sunucuda FIMA Bot kurulumu hazır.` : "Bağlı Discord hesabında yönetilebilir sunucu bulunamadı.";
  if (!state.workspaces.length) {
    grid.hidden = true;
    actionState(status, { title: "Yönetilebilir sunucu bulunamadı", message: "Discord’da Yönetici veya Sunucuyu Yönet yetkin olan bir sunucuyla tekrar deneyebilirsin.", action: "Discord hesabını yenile", href: "/auth/discord/start?returnTo=%2Ffima-bot%2Fdashboard", tone: "empty" });
    return;
  }
  status.hidden = true;
  const query = String(el('[data-server-search]')?.value || '').trim().toLocaleLowerCase();
  const matches = state.workspaces.filter(card => `${card.name} ${card.guildId}`.toLocaleLowerCase().includes(query));
  grid.innerHTML = matches.map(serverCardTemplate).join("");
  const emptySearch = el('[data-search-empty]');
  if (emptySearch) emptySearch.hidden = matches.length > 0;
  grid.hidden = false;
  grid.querySelectorAll("[data-guild-id]").forEach(link => link.addEventListener("click", event => {
    event.preventDefault();
    openWorkspace(link.dataset.guildId, DEFAULT_ROUTE);
  }));
}

function renderSelectedServer(card) {
  const rail = el('[data-server-rail]');
  if (rail) {
    rail.innerHTML = `<a href="${DASHBOARD_ROOT}" data-rail-hub title="Tüm sunucular" aria-label="Tüm sunucular">⊞</a>` + state.workspaces.map(item => {
      const icon = discordIconUrl(item);
      return `<a class="${item.guildId === card.guildId ? 'is-selected' : ''}" href="${dashboardPath(item.guildId)}" data-rail-guild="${escapeHtml(item.guildId)}" title="${escapeHtml(item.name)}" aria-label="${escapeHtml(item.name)}" ${item.guildId === card.guildId ? 'aria-current="true"' : ''}>${icon ? `<img src="${icon}" alt="">` : escapeHtml(initials(item.name))}</a>`;
    }).join('');
    rail.querySelector('[data-rail-hub]')?.addEventListener('click', event => { event.preventDefault(); showDirectory(); });
    rail.querySelectorAll('[data-rail-guild]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); openWorkspace(link.dataset.railGuild, DEFAULT_ROUTE); }));
  }
  const icon = discordIconUrl(card);
  el("[data-selected-server]").innerHTML = `<span class="server-icon">${icon ? `<img src="${icon}" alt="">` : escapeHtml(initials(card.name))}</span><span><strong>${escapeHtml(card.name)}</strong><small>Aktif çalışma alanı</small></span>`;
  el("[data-workspace-title]").textContent = card.name;
  el("[data-plan-pill]").textContent = String(card.activePlan || "free").toUpperCase();
  const botPill = el("[data-bot-pill]");
  botPill.textContent = card.botInstalled ? "BOT KURULU" : "KURULUM GEREKLİ";
  botPill.classList.toggle("is-warning", !card.botInstalled);
}

function groupedRoutes(routes) {
  const byId = new Map(routes.map(route => [route.id, route]));
  const groupedIds = new Set(MODULE_GROUPS.flatMap(([, ids]) => ids));
  const groups = MODULE_GROUPS.map(([label, ids]) => [label, ids.map(id => byId.get(id)).filter(Boolean)]).filter(([, items]) => items.length);
  const remaining = routes.filter(route => !groupedIds.has(route.id));
  const ownerRoutes = remaining.filter(route => route.id.startsWith("owner-"));
  const otherRoutes = remaining.filter(route => !route.id.startsWith("owner-"));
  if (otherRoutes.length) groups.push(["Diğer", otherRoutes]);
  if (ownerRoutes.length) groups.push(["Owner", ownerRoutes]);
  return groups;
}

function normalizedRoutes(routes) {
  if (!Array.isArray(routes)) return [];
  const seen = new Set();
  return routes.filter(route => {
    const id = String(route?.id || "").trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map(route => ({ ...route, id: String(route.id).trim().toLowerCase() }));
}

function setModuleSelectorState(disabled, message) {
  const select = el("[data-module-select]");
  if (select) select.disabled = disabled;
  const status = el("[data-module-select-status]");
  if (status) status.textContent = message;
}

function renderModules(routes, activeRoute) {
  const nav = el("[data-module-nav]");
  const select = el("[data-module-select]");
  const groups = groupedRoutes(routes);
  nav.innerHTML = groups.map(([label, items]) => `<section class="module-group"><p>${escapeHtml(label)}</p>${items.map(route => `<a href="${dashboardPath(state.selected?.guildId, route.id)}" data-module="${escapeHtml(route.id)}" class="${route.id === activeRoute ? "is-active" : ""}" ${route.id === activeRoute ? 'aria-current="page"' : ""}><span>${escapeHtml(moduleTitle(route))}</span><i aria-hidden="true">›</i></a>`).join("")}</section>`).join("");
  select.innerHTML = groups.map(([label, items]) => `<optgroup label="${escapeHtml(label)}">${items.map(route => `<option value="${escapeHtml(route.id)}" ${route.id === activeRoute ? "selected" : ""}>${escapeHtml(moduleTitle(route))}</option>`).join("")}</optgroup>`).join("");
  setModuleSelectorState(!routes.length, routes.length ? `${routes.length} modül hazır.` : "Kullanılabilir modül yok.");
  nav.querySelectorAll("[data-module]").forEach(link => link.addEventListener("click", event => {
    event.preventDefault();
    openWorkspace(state.selected.guildId, link.dataset.module);
  }));
}

function modulePaginationTemplate(routes, activeRoute) {
  const index = routes.findIndex(route => route.id === activeRoute);
  if (index < 0) return "";
  const link = (route, direction, label) => route
    ? `<a href="${dashboardPath(state.selected?.guildId, route.id)}" data-module-page="${escapeHtml(route.id)}" data-module-direction="${direction}"><small>${label}</small><strong>${escapeHtml(moduleTitle(route))}</strong></a>`
    : `<span class="is-disabled" aria-hidden="true"><small>${label}</small><strong>—</strong></span>`;
  return `<nav class="module-pagination" aria-label="Modül sayfaları">${link(routes[index - 1], "previous", "Önceki sayfa")}${link(routes[index + 1], "next", "Sonraki sayfa")}</nav>`;
}

function applicationCatalogTemplate() {
  return `<section class="application-catalog" aria-labelledby="application-catalog-title"><div class="application-catalog-heading"><h3 id="application-catalog-title">Başvuru rol kataloğu</h3><a href="/fima-bot/apply">Tümünü karşılaştır →</a></div><div class="application-family-grid">${APPLICATION_CATALOG.map(([family, routes]) => `<section class="application-family"><h4>${escapeHtml(family)}</h4><div>${routes.map(([slug, label]) => `<a href="/fima-bot/apply/${slug}">${escapeHtml(label)}</a>`).join("")}</div></section>`).join("")}</div></section>`;
}

function focusModulePanel() {
  const panel = el("[data-module-panel]");
  window.requestAnimationFrame(() => panel?.focus({ preventScroll: true }));
}

function renderValue(value, depth = 0) {
  if (typeof value === "boolean") return `<span class="value-badge ${value ? "is-on" : "is-off"}">${value ? "Açık" : "Kapalı"}</span>`;
  if (value === null || value === undefined || value === "") return '<span class="value-muted">Ayarlanmamış</span>';
  if (Array.isArray(value)) {
    if (!value.length) return '<span class="value-muted">Henüz öğe yok</span>';
    return `<ul class="value-list">${value.map(item => `<li>${renderValue(item, depth + 1)}</li>`).join("")}</ul>`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return '<span class="value-muted">Henüz ayar yok</span>';
    if (depth >= 2) return `<span class="value-muted">${entries.length} yapılandırılmış alan</span>`;
    return `<dl class="value-details">${entries.map(([key, item]) => `<div><dt>${escapeHtml(readableKey(key))}</dt><dd>${renderValue(item, depth + 1)}</dd></div>`).join("")}</dl>`;
  }
  return `<span class="value-text">${escapeHtml(value)}</span>`;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function canonicalJson(value) {
  const sort = item => {
    if (Array.isArray(item)) return item.map(sort);
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])]));
  };
  return JSON.stringify(sort(value));
}

function fieldLabel(key) {
  return FIELD_LABELS[key] || readableKey(key);
}

function defaultFieldValue(key, definition, value) {
  if (value !== undefined && value !== null) return value;
  if (definition.type === "boolean") return false;
  if (definition.type === "integer") return definition.min ?? 0;
  if (definition.type === "enum") return SELECT_OPTIONS[key]?.[0]?.[0] || "";
  if (definition.type === "color") return "#20DFBF";
  return "";
}

function editableValue(payload, definition) {
  const config = payload.config || {};
  if (definition.mapKey) {
    const fallback = definition.mapKey === "modules" ? config.enabledModules : null;
    return { [definition.mapKey]: cloneJson(config[definition.mapKey] || fallback || {}) };
  }
  const source = definition.configKey ? config[definition.configKey] || {} : config;
  return Object.fromEntries(Object.entries(definition.fields).map(([key, field]) => [key, defaultFieldValue(key, field, source[key])]));
}

function fieldTemplate(route, key, definition, value) {
  const id = `config-${route}-${key}`;
  const label = escapeHtml(fieldLabel(key));
  if (definition.type === "boolean") {
    return `<label class="config-switch" for="${id}"><input id="${id}" name="${escapeHtml(key)}" type="checkbox" ${value ? "checked" : ""}><span aria-hidden="true"></span><b>${label}</b></label>`;
  }
  if (definition.type === "enum") {
    const options = SELECT_OPTIONS[key] || [];
    return `<div class="config-field"><label for="${id}">${label}</label><select id="${id}" name="${escapeHtml(key)}">${options.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}" ${String(value) === optionValue ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}</select></div>`;
  }
  if (definition.type === "textarea") {
    return `<div class="config-field config-field--wide"><label for="${id}">${label}</label><textarea id="${id}" name="${escapeHtml(key)}" maxlength="${definition.max}" rows="5">${escapeHtml(value)}</textarea></div>`;
  }
  const type = definition.type === "integer" ? "number" : "text";
  const constraints = definition.type === "integer"
    ? ` min="${definition.min}" max="${definition.max}" step="1" required`
    : definition.type === "color"
      ? ' pattern="#[0-9A-Fa-f]{6}" maxlength="7" required aria-describedby="branding-media-note"'
      : ` maxlength="${definition.max}"`;
  return `<div class="config-field"><label for="${id}">${label}</label><input id="${id}" name="${escapeHtml(key)}" type="${type}" value="${escapeHtml(value)}"${constraints}></div>`;
}

function mappingRowTemplate(route, key, value, index) {
  const prefix = `mapping-${route}-${index}`;
  return `<div class="mapping-row" data-mapping-row>
    <div class="config-field"><label for="${prefix}-key">Eşleme adı</label><input id="${prefix}-key" data-mapping-key type="text" value="${escapeHtml(key)}" pattern="[A-Za-z][A-Za-z0-9_-]{0,63}" maxlength="64" required></div>
    <div class="config-field"><label for="${prefix}-value">Discord ID</label><input id="${prefix}-value" data-mapping-value type="text" inputmode="numeric" value="${escapeHtml(value)}" pattern="[0-9]{16,22}" minlength="16" maxlength="22" required></div>
    <button class="mapping-remove" type="button" data-remove-mapping aria-label="Bu eşlemeyi kaldır">Kaldır</button>
  </div>`;
}

function mapEditorTemplate(route, definition, value) {
  const entries = Object.entries(value[definition.mapKey] || {});
  if (definition.mapType === "toggle") {
    const toggles = entries.length
      ? entries.map(([key, enabled], index) => {
        const meta = state.payload?.moduleStates?.find(item => item.id === key);
        return `<label class="config-switch config-switch--card" for="toggle-${route}-${index}"><input id="toggle-${route}-${index}" data-toggle-key="${escapeHtml(key)}" type="checkbox" ${enabled ? "checked" : ""} ${meta?.compatible === false ? 'disabled' : ''}><span aria-hidden="true"></span><b>${escapeHtml(readableKey(key))}<small>${meta?.compatible === false ? 'Bu kurulum türüyle uyumsuz' : `${meta?.configured ? 'Yapılandırılmış' : 'Eşleme / bağımlılık gerekli'} · Sağlık gözlemlenmedi`}</small></b></label>`;
      }).join("")
      : '<p class="editor-empty">Bu sunucuda düzenlenebilir modül anahtarı henüz oluşturulmamış.</p>';
    return `<div class="toggle-grid">${toggles}</div>`;
  }
  const rows = entries.map(([key, item], index) => mappingRowTemplate(route, key, item, index)).join("");
  const label = definition.itemLabel || "Eşleme";
  return `<div class="mapping-editor" data-mapping-editor>
    <div data-mapping-rows>${rows}</div>
    <fieldset class="mapping-add"><legend>Yeni ${escapeHtml(label)} eşlemesi</legend>
      <div class="config-field"><label for="new-${route}-key">Eşleme adı</label><input id="new-${route}-key" data-new-mapping-key type="text" pattern="[A-Za-z][A-Za-z0-9_-]{0,63}" maxlength="64"></div>
      <div class="config-field"><label for="new-${route}-value">Discord ID</label><input id="new-${route}-value" data-new-mapping-value type="text" inputmode="numeric" pattern="[0-9]{16,22}" minlength="16" maxlength="22"></div>
      <button class="editor-secondary" type="button" data-add-mapping>Satır ekle</button>
    </fieldset>
  </div>`;
}

function editorTemplate(payload, definition) {
  const value = editableValue(payload, definition);
  const fields = definition.mapKey
    ? mapEditorTemplate(payload.route, definition, value)
    : `<div class="editor-fields">${Object.entries(definition.fields).map(([key, field]) => fieldTemplate(payload.route, key, field, key === "autoTranscript" ? value[key] !== false : value[key])).join("")}</div>`;
  const mediaNote = payload.route === "branding"
    ? '<p class="editor-note" id="branding-media-note">Güvenli medya yükleme bu çalışma alanında henüz desteklenmiyor. Görsel dosyaları bu formdan sunucuya gönderilmez.</p>'
    : "";
  return `<form class="config-editor" data-config-form data-edit-route="${escapeHtml(payload.route)}" novalidate>
    ${fields}${mediaNote}
    <div class="editor-footer">
      <p class="editor-status" data-editor-status role="status" aria-live="polite">Değişiklik yok.</p>
      <div class="editor-buttons">
        <button class="editor-secondary" type="button" data-discard-config disabled>Değişiklikleri geri al</button>
        <button class="editor-primary" type="submit" data-save-config disabled>Kaydet</button>
      </div>
    </div>
  </form>`;
}

function formValue(form, definition) {
  if (definition.mapType === "toggle") {
    return { [definition.mapKey]: Object.fromEntries([...form.querySelectorAll("[data-toggle-key]")].map(input => [input.dataset.toggleKey, input.checked])) };
  }
  if (definition.mapType === "discord") {
    const entries = [...form.querySelectorAll("[data-mapping-row]")].map(row => [
      row.querySelector("[data-mapping-key]").value.trim(),
      row.querySelector("[data-mapping-value]").value.trim()
    ]).filter(([key, value]) => key && value);
    return { [definition.mapKey]: Object.fromEntries(entries) };
  }
  return Object.fromEntries(Object.entries(definition.fields).map(([key, field]) => {
    const input = form.elements.namedItem(key);
    if (field.type === "boolean") return [key, input.checked];
    if (field.type === "integer") return [key, Number(input.value)];
    const value = input.value.trim();
    return [key, field.type === "color" ? value.toUpperCase() : value];
  }));
}

function pendingMappingDraft(form) {
  return Boolean(form.querySelector("[data-new-mapping-key]")?.value.trim() || form.querySelector("[data-new-mapping-value]")?.value.trim());
}

function updateEditorDirty(form) {
  const definition = EDITABLE_ROUTES[state.route];
  if (!definition || state.saving) return;
  state.dirty = canonicalJson(formValue(form, definition)) !== state.savedValue || pendingMappingDraft(form);
  const save = form.querySelector("[data-save-config]");
  const discard = form.querySelector("[data-discard-config]");
  const status = form.querySelector("[data-editor-status]");
  save.disabled = !state.dirty;
  discard.disabled = !state.dirty;
  status.textContent = state.dirty ? "Kaydedilmemiş değişiklikler var." : "Değişiklik yok.";
  status.classList.toggle("is-dirty", state.dirty);
}

function editorErrorMessage(error) {
  const code = errorCode(error);
  if (code === "login_required") return "Oturumun sona erdi. Değişikliklerini koruyup FIMA hesabına yeniden giriş yap.";
  if (code === "origin_mismatch") return "Güvenlik doğrulaması başarısız. Sayfayı FIMA Bot adresinden yeniden aç.";
  if (code === "guild_not_authorized") return "Bu sunucu için yönetim yetkin artık doğrulanamıyor.";
  if (code === "bot_invite_required") return "Ayarları kaydetmeden önce FIMA Bot’u sunucuya ekle.";
  if (code === "workspace_version_conflict") return "Bu ayarlar başka bir oturumda değişti. Son sürümü açıp değişikliklerini yeniden uygula.";
  if (code.startsWith("invalid_")) return "Alanlardan biri geçersiz. İşaretli alanları kontrol et.";
  return "Değişiklikler kaydedilemedi. Bağlantını kontrol edip yeniden dene.";
}

function bindEditor(payload, definition) {
  const form = el("[data-config-form]");
  if (!form) return;
  const initialValue = editableValue(payload, definition);
  state.payload = payload;
  state.savedValue = canonicalJson(initialValue);
  state.dirty = false;
  state.saving = false;

  form.addEventListener("input", () => updateEditorDirty(form));
  form.addEventListener("change", () => updateEditorDirty(form));
  form.addEventListener("click", event => {
    const remove = event.target.closest("[data-remove-mapping]");
    if (remove) {
      remove.closest("[data-mapping-row]")?.remove();
      updateEditorDirty(form);
      return;
    }
    if (!event.target.closest("[data-add-mapping]")) return;
    const keyInput = form.querySelector("[data-new-mapping-key]");
    const valueInput = form.querySelector("[data-new-mapping-value]");
    if (!keyInput.reportValidity() || !valueInput.reportValidity() || !keyInput.value.trim() || !valueInput.value.trim()) return;
    const existing = [...form.querySelectorAll("[data-mapping-key]")].some(input => input.value.trim() === keyInput.value.trim());
    if (existing) {
      keyInput.setCustomValidity(localizedCopy("Bu eşleme adı zaten kullanılıyor."));
      keyInput.reportValidity();
      keyInput.setCustomValidity("");
      return;
    }
    const rows = form.querySelector("[data-mapping-rows]");
    rows.insertAdjacentHTML("beforeend", mappingRowTemplate(payload.route, keyInput.value.trim(), valueInput.value.trim(), rows.children.length));
    keyInput.value = "";
    valueInput.value = "";
    updateEditorDirty(form);
  });
  form.querySelector("[data-discard-config]").addEventListener("click", () => renderModule(state.payload));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!state.dirty || state.saving || !form.reportValidity()) return;
    const status = form.querySelector("[data-editor-status]");
    const controls = [...form.querySelectorAll("button, input, select, textarea")];
    const requestId = state.request;
    const guildId = state.selected.guildId;
    const isCurrentEditor = () => requestId === state.request && form.isConnected && state.selected?.guildId === guildId;
    state.saving = true;
    form.setAttribute("aria-busy", "true");
    controls.forEach(control => { control.disabled = true; });
    status.textContent = "Değişiklikler kaydediliyor…";
    status.className = "editor-status is-saving";
    try {
      const value = formValue(form, definition);
      const expectedVersion = payload.version;
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error("workspace_response_mismatch");
      const result = await patchWorkspaceConfig(guildId, payload.route, value, expectedVersion);
      if (!isCurrentEditor()) return;
      const nextPayload = result.workspace;
      if (nextPayload?.workspace?.guildId !== state.selected.guildId
        || nextPayload.route !== payload.route
        || result.committedVersion !== expectedVersion + 1
        || !Number.isSafeInteger(nextPayload.version)
        || nextPayload.version < result.committedVersion
        || result.readbackVersion !== nextPayload.version) throw new Error("workspace_response_mismatch");
      state.routes = Array.isArray(nextPayload.routes) ? nextPayload.routes : state.routes;
      state.route = nextPayload.route;
      state.payload = nextPayload;
      state.dirty = false;
      renderModules(state.routes, state.route);
      renderWorkspaceFacts(nextPayload);
      renderModule(nextPayload, { saved: true });
    } catch (error) {
      if (!isCurrentEditor()) return;
      state.saving = false;
      form.removeAttribute("aria-busy");
      controls.forEach(control => { control.disabled = false; });
      updateEditorDirty(form);
      status.textContent = editorErrorMessage(error);
      status.className = "editor-status is-error";
    }
  });
}

function confirmUnsavedNavigation() {
  if (!state.dirty && !state.ownerDirty) return true;
  const proceed = window.confirm(localizedCopy("Kaydedilmemiş değişikliklerin var. Bu sayfadan ayrılırsan değişiklikler kaybolacak. Devam edilsin mi?"));
  if (proceed) { state.dirty = false; state.ownerDirty = false; }
  return proceed;
}

function renderWorkspaceFacts(payload) {
  const facts = el("[data-workspace-facts]");
  const card = state.selected;
  const synced = formatDate(payload.workspace.lastSuccessfulSyncAt);
  facts.innerHTML = `<article><span>Bot kurulumu</span><strong class="${card.botInstalled ? "is-positive" : "is-warning"}">${card.botInstalled ? "Kurulu · Sağlık gözlemlenmedi" : "Kurulum gerekli"}</strong></article>
    <article><span>Etkin plan</span><strong>${escapeHtml(String(card.activePlan || "free").toUpperCase())}</strong></article>
    <article><span>Kurulum türü</span><strong>${escapeHtml(payload.setupType || card.activeTemplate || "Bilinmiyor")}</strong></article>
    <article><span>Son başarılı senkronizasyon</span><strong>${escapeHtml(synced)}</strong></article>`;
  facts.hidden = false;
}

function renderModule(payload, { saved = false } = {}) {
  state.payload = payload;
  const panel = el("[data-module-panel]");
  panel.fimaOperationMarker = null;
  if (['setup', 'content', 'polls', 'integrations'].includes(payload.route)) {
    panel.hidden = false;
    renderFimaOperations(panel, payload, {
      request, csrfToken, escapeHtml, apiUrl,
      isCurrent: () => state.payload === payload,
      setDirty: value => { if (panel.isConnected && state.payload === payload) state.dirty = value; },
      refresh: () => openWorkspace(payload.workspace.guildId, payload.route, { skipConfirm: true, urlMode: 'none' })
    });
    return;
  }
  const active = payload.routes.find(route => route.id === payload.route);
  const entries = Object.entries(payload.config || {});
  const definition = EDITABLE_ROUTES[payload.route];
  const applicationLinks = payload.route === "applications" ? applicationCatalogTemplate() : "";
  const configContent = definition
    ? editorTemplate(payload, definition)
    : `<div class="config-grid">${entries.length ? entries.map(([key, value]) => `<article class="config-card"><small>${escapeHtml(readableKey(key))}</small>${renderValue(value)}</article>`).join("") : '<article class="config-empty"><span aria-hidden="true">◇</span><div><small>GÖZLEMLENMEDİ</small><strong>Bu modül için henüz özel bir ayar yok.</strong><p>Bu modülün çalışma durumu henüz doğrulanmadı.</p></div></article>'}</div>`;
  panel.innerHTML = `<div class="module-heading"><div><p class="eyebrow"><span></span> ${escapeHtml(payload.route.toUpperCase())}</p><h2 id="module-panel-title">${escapeHtml(moduleTitle(active))}</h2></div><span class="scope-badge">Yalnızca ${escapeHtml(payload.workspace.name)}</span></div>
    <div class="module-summary"><p>${escapeHtml(moduleDescription(payload.route))}</p>${applicationLinks}</div>
    ${configContent}${modulePaginationTemplate(payload.routes, payload.route)}`;
  panel.setAttribute("aria-labelledby", "module-panel-title");
  panel.hidden = false;
  panel.querySelectorAll("[data-module-page]").forEach(link => link.addEventListener("click", event => {
    event.preventDefault();
    openWorkspace(state.selected.guildId, link.dataset.modulePage);
  }));
  if (!definition) {
    resetEditorState();
    return;
  }
  bindEditor(payload, definition);
  if (!saved) return;
  const form = panel.querySelector("[data-config-form]");
  const status = form?.querySelector("[data-editor-status]");
  if (!status) return;
  status.textContent = "Değişiklikler kaydedildi.";
  status.className = "editor-status is-success";
  window.setTimeout(() => {
    if (form.isConnected && !state.dirty && !state.saving) {
      status.textContent = "Değişiklik yok.";
      status.className = "editor-status";
    }
  }, 3500);
}

async function openWorkspace(guildId, route = DEFAULT_ROUTE, { urlMode = "push", skipConfirm = false } = {}) {
  const requestedGuildId = safeGuildId(guildId);
  const requestedRoute = safeModuleId(route);
  const destinationChanged = Boolean(state.selected && (state.selected.guildId !== requestedGuildId || state.route !== requestedRoute));
  if (!destinationChanged && (state.dirty || state.ownerDirty)) return true;
  if (!skipConfirm && destinationChanged && !confirmUnsavedNavigation()) {
    restoreCurrentLocation();
    return false;
  }
  const card = state.workspaces.find(item => item.guildId === requestedGuildId);
  if (!card) return showDirectory({ urlMode: urlMode === "none" ? "none" : "replace", skipConfirm: true });
  disposeOwnerTools(el("[data-owner-tools]"));
  state.ownerDirty = false;
  resetEditorState();
  state.selected = card;
  el("[data-server-directory]").hidden = true;
  el("[data-workspace]").hidden = false;
  el("[data-module-panel]").hidden = true;
  el("[data-workspace-facts]").hidden = true;
  renderModules([], "");
  setModuleSelectorState(true, "Modüller yükleniyor.");
  renderSelectedServer(card);
  const target = el("[data-workspace-state]");
  actionState(target, { title: "Çalışma alanı açılıyor", message: "Seçili sunucunun modülleri hazırlanıyor.", loading: true });
  const requestId = ++state.request;
  try {
    const payload = await request(`${LIST_ENDPOINT}/${encodeURIComponent(card.guildId)}?route=${encodeURIComponent(requestedRoute.startsWith("owner-") ? DEFAULT_ROUTE : requestedRoute)}`);
    if (requestId !== state.request) return;
    if (payload.workspace?.guildId !== card.guildId) throw new Error("workspace_route_unavailable");
    if (payload.inviteRequired) {
      renderModules([], "");
      actionState(target, { title: "FIMA Bot bu sunucuda kurulu değil", message: "Modülleri açmadan önce botu bu sunucuya güvenli biçimde davet etmen gerekiyor.", action: "FIMA Bot’u davet et", href: `/fima-bot/invite?guild=${encodeURIComponent(card.guildId)}`, tone: "warning" });
      updateUrl(card.guildId, DEFAULT_ROUTE, urlMode);
      return true;
    }
    const routes = normalizedRoutes(payload.routes);
    if (state.ownerAuthorized) routes.push(...OWNER_ROUTES);
    if (!routes.length) {
      state.routes = [];
      renderModules([], "");
      actionState(target, { title: "Bu sunucuda gösterilecek modül yok", message: "Çalışma alanı hazır; ancak hesabın için kullanılabilir bir modül döndürülmedi.", tone: "empty" });
      updateUrl(card.guildId, DEFAULT_ROUTE, urlMode);
      return true;
    }
    const payloadRoute = state.ownerAuthorized && OWNER_ROUTES.some(item => item.id === requestedRoute) ? requestedRoute : String(payload.route || "").trim().toLowerCase();
    if (!routes.some(item => item.id === payloadRoute)) throw new Error("workspace_route_unavailable");
    target.hidden = true;
    state.routes = routes;
    state.route = payloadRoute;
    payload.routes = routes;
    payload.route = payloadRoute;
    renderModules(state.routes, state.route);
    renderWorkspaceFacts(payload);
    if (payloadRoute.startsWith("owner-")) {
      state.payload = payload;
      el("[data-module-panel]").hidden = true;
    } else renderModule(payload);
    const tools = el("[data-owner-tools]");
    if (state.ownerAuthorized && ownerPage(payloadRoute)) {
      try {
        await renderOwnerTools(tools, { apiBase: API_BASE, guildId: card.guildId, page: ownerPage(payloadRoute), language: dashboardLanguage(), onNavigate: page => { const destination = state.routes.find(item => ownerPage(item.id) === page); if (!destination) return false; void openWorkspace(card.guildId, destination.id); return true; }, onDirty: value => { if (requestId === state.request) state.ownerDirty = value; } });
      } catch (error) {
        if (requestId !== state.request) return;
        tools.hidden = false;
        showError(tools, errorCode(error), () => openWorkspace(card.guildId, route, { urlMode: "replace", skipConfirm: true }));
      }
      if (requestId !== state.request) return;
    }
    if (payloadRoute.startsWith("owner-")) tools.scrollIntoView({ block: "start" });
    else focusModulePanel();
    updateUrl(card.guildId, state.route, urlMode);
    updateDocumentTitle();
    return true;
  } catch (error) {
    if (requestId !== state.request) return;
    renderModules([], "");
    setModuleSelectorState(true, "Modüller yüklenemedi.");
    showError(target, errorCode(error), () => openWorkspace(card.guildId, route, { urlMode: "replace" }));
    return false;
  }
}

async function boot() {
  const target = el("[data-directory-state]");
  try {
    const [payload, session] = await Promise.all([
      request(LIST_ENDPOINT), request("/api/fima-bot/session-status").catch(() => ({ ownerAuthorized: false }))
    ]);
    state.ownerAuthorized = session.ownerAuthorized === true;
    state.workspaces = Array.isArray(payload.workspaces) ? payload.workspaces.filter(card => safeGuildId(card.guildId) && card.canManage === true) : [];
    renderDirectory();
    const requested = parseDashboardRoute();
    if (requested.guildId && state.workspaces.some(card => card.guildId === requested.guildId)) {
      await openWorkspace(requested.guildId, requested.route, { urlMode: "replace" });
    } else if (requested.guildId) {
      showDirectory({ urlMode: "replace" });
    }
  } catch (error) {
    el("[data-directory-brief]").textContent = "Sunucu erişimi doğrulanamadı.";
    showError(target, errorCode(error), boot);
  }
}

el("[data-back-to-servers]")?.addEventListener("click", event => { event.preventDefault(); showDirectory(); });
el('[data-server-search]')?.addEventListener('input', renderDirectory);
el("[data-module-select]")?.addEventListener("change", event => openWorkspace(state.selected?.guildId, event.target.value));
window.addEventListener("popstate", () => {
  const requested = parseDashboardRoute();
  if (requested.guildId) openWorkspace(requested.guildId, requested.route, { urlMode: "none" });
  else showDirectory({ urlMode: "none" });
});
window.addEventListener("beforeunload", event => {
  if (!state.dirty && !state.ownerDirty) return;
  event.preventDefault();
  event.returnValue = "";
});
document.addEventListener("fima:language-change", () => {
  updateDocumentTitle();
  el("[data-owner-tools]")?.ownerContext?.setLanguage(dashboardLanguage());
  if (state.payload?.workspace && state.selected) renderWorkspaceFacts(state.payload);
});

if (typeof MutationObserver === 'function') observeFimaControls();
boot();
