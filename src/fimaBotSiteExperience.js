import {
  FIMA_BOT_APPLICATIONS,
  FIMA_BOT_LEGACY_ALIASES,
  FIMA_BOT_PAGES,
  fimaBotApplicationCatalog,
  fimaBotNavigation,
  normalizeFimaLocale,
  resolveFimaBotApplicationPage,
  resolveFimaBotPage
} from "./fimaBotExperienceContract.js";
import {
  dashboardPath,
  FIMA_BOT_DASHBOARD_ROUTES,
  fimaBotDashboardNavigation,
  resolveFimaBotDashboardPage
} from "./fimaBotDashboardContract.js";

const localized = (tr, en) => Object.freeze({ tr, en });

export const FIMA_BOT_THEME_STYLESHEET = "/assets/styles/fima-bot.css";

const PAGE_COPY = Object.freeze({
  product: Object.freeze({
    eyebrow: localized("Topluluğun için tek kontrol merkezi", "One control center for your community"),
    title: localized("Topluluğunu düzenli, güvenli ve canlı tut.", "Keep your community organized, safe and active."),
    summary: localized(
      "FIMA Bot; moderasyon, başvurular, etkinlikler ve topluluk araçlarını tek, anlaşılır bir deneyimde birleştirir.",
      "FIMA Bot brings moderation, applications, events and community tools into one clear experience."
    )
  }),
  commands: Object.freeze({
    eyebrow: localized("Komut rehberi", "Command guide"),
    title: localized("İhtiyacın olan komutu hemen bul.", "Find the command you need, right away."),
    summary: localized("Komutlar amacına göre gruplanır; izin ve kullanım bilgisi her komutun yanında görünür.", "Commands are grouped by purpose, with permission and usage details alongside each one.")
  }),
  applications: Object.freeze({
    eyebrow: localized("FIMA başvuru merkezi", "FIMA application center"),
    title: localized("Katkı sağlayacağın yolu seç.", "Choose how you want to contribute."),
    summary: localized("21 başvuru türünü keşfet. Her başvuru ayrı değerlendirilir ve hiçbir rol otomatik verilmez.", "Explore 21 application types. Every submission is reviewed separately and no role is granted automatically.")
  }),
  premium: Object.freeze({
    eyebrow: localized("FIMA Bot Premium", "FIMA Bot Premium"),
    title: localized("Daha fazla kontrol, aynı sade deneyim.", "More control, with the same focused experience."),
    summary: localized("Gelişmiş özelleştirme ve topluluk içgörüleri, güvenli varsayılanlarla sunulur.", "Advanced customization and community insights, delivered with safe defaults.")
  }),
  feedback: Object.freeze({
    eyebrow: localized("Destek ve geri bildirim", "Support and feedback"),
    title: localized("Sorunu doğru ekibe ulaştır.", "Get your issue to the right team."),
    summary: localized("Hata bildir, öneri paylaş veya kurulum desteği iste. Durum güncellemeleri hesabında kalır.", "Report a bug, share an idea or request setup help. Status updates stay with your account.")
  }),
  invite: Object.freeze({
    eyebrow: localized("Sunucuya ekle", "Add to server"),
    title: localized("FIMA Bot'u güvenle kur.", "Set up FIMA Bot with confidence."),
    summary: localized("Yalnızca gereken izinleri gözden geçir, sunucunu seç ve kurulum sihirbazına devam et.", "Review only the permissions you need, choose your server and continue to the setup wizard.")
  }),
  dashboard: Object.freeze({
    eyebrow: localized("Sunucu merkezi", "Server center"),
    title: localized("Yönetmek istediğin sunucuyu seç.", "Choose the server you want to manage."),
    summary: localized("Her sunucunun ayarları ve yetkileri birbirinden tamamen ayrı tutulur.", "Every server's settings and permissions remain fully isolated.")
  }),
  contentStudio: Object.freeze({
    eyebrow: localized("Yalnızca sahip", "Owner only"),
    title: localized("İçeriği önizle, sürümle ve güvenle yayınla.", "Preview, version and publish content safely."),
    summary: localized("Yayın akışı kayıtlı sürüm, eşleşen yedek, sahip doğrulaması ve test sunucusu okuması gerektirir.", "Publishing requires a saved version, matching backup, owner verification and an exact test-server readback.")
  })
});

const COMMAND_GROUPS = Object.freeze([
  Object.freeze({ label: localized("Topluluk", "Community"), commands: Object.freeze(["/help", "/profile", "/rank", "/leaderboard"]) }),
  Object.freeze({ label: localized("Etkinlik", "Events"), commands: Object.freeze(["/event create", "/event join", "/giveaway"]) }),
  Object.freeze({ label: localized("Moderasyon", "Moderation"), commands: Object.freeze(["/warn", "/timeout", "/case", "/purge"]) }),
  Object.freeze({ label: localized("Yönetim", "Administration"), commands: Object.freeze(["/setup", "/module", "/panel", "/audit"]) })
]);

const FIELD_COPY = Object.freeze({
  discordHandle: Object.freeze({ name: "discordHandle", type: "text", label: localized("Discord kullanıcı adın", "Your Discord username"), required: true }),
  timezone: Object.freeze({ name: "timezone", type: "text", label: localized("Saat dilimin", "Your time zone"), required: true }),
  availability: Object.freeze({ name: "availability", type: "textarea", label: localized("Haftalık uygunluğun", "Your weekly availability"), required: true }),
  motivation: Object.freeze({ name: "motivation", type: "textarea", label: localized("Neden bu göreve başvuruyorsun?", "Why are you applying for this role?"), required: true })
});

const APPLICATION_QUESTION = Object.freeze({
  helper: localized("Bir üyeye yardım ederken izleyeceğin adımları anlat.", "Describe the steps you take when helping a member."),
  staff: localized("Sağlıklı bir topluluk kültürünü nasıl güçlendirirsin?", "How would you strengthen a healthy community culture?"),
  moderator: localized("Gergin bir tartışmayı nasıl sakinleştirirsin?", "How would you de-escalate a tense discussion?"),
  support: localized("Eksik bilgiyle gelen bir destek talebini nasıl çözersin?", "How would you resolve a support request with missing information?"),
  training_hoster: localized("Etkili bir eğitim oturumunu nasıl planlarsın?", "How would you plan an effective training session?"),
  event_staff: localized("Katılımı yüksek bir etkinlik fikrini ve akışını paylaş.", "Share an event idea and flow designed for strong participation."),
  giveaway_staff: localized("Adil bir çekilişi nasıl planlar ve doğrularsın?", "How would you plan and verify a fair giveaway?"),
  content_creator: localized("Üreteceğin içeriğe ait bir örnek veya portföy bağlantısı paylaş.", "Share a sample or portfolio link for the content you create."),
  video_team: localized("Video üretimindeki rolünü ve kullandığın araçları anlat.", "Describe your role in video production and the tools you use."),
  creative_team: localized("Bir fikri FIMA görsel diline nasıl dönüştürürsün?", "How would you turn an idea into FIMA's visual language?"),
  developer: localized("Katkı sağladığın bir teknik projeyi ve sorumluluğunu anlat.", "Describe a technical project you contributed to and your responsibility."),
  fima_support: localized("FIMA ürünlerinden birini yeni kullanıcıya nasıl anlatırsın?", "How would you explain a FIMA product to a new user?"),
  macro_staff: localized("Bir macro sorununu güvenli biçimde nasıl teşhis edersin?", "How would you diagnose a macro issue safely?"),
  fflag_staff: localized("Bir FFlag önerisini değerlendirirken hangi kontrolleri yaparsın?", "What checks would you make when reviewing an FFlag suggestion?"),
  partnership: localized("Önerdiğin ortaklığın iki topluluğa sağlayacağı değeri anlat.", "Describe the value your proposed partnership brings to both communities."),
  creator: localized("Kitlen, içerik alanın ve örnek çalışmaların hakkında bilgi ver.", "Tell us about your audience, content niche and example work."),
  reseller: localized("Müşteri desteği ve şeffaf satış sürecini nasıl yönetirsin?", "How would you manage customer support and a transparent sales process?")
});

export const FIMA_BOT_APPLICATION_FORM_SCHEMAS = Object.freeze(Object.fromEntries(
  Object.values(FIMA_BOT_APPLICATIONS)
    .filter(application => application.submission === "public")
    .map(application => [application.type, Object.freeze({
      type: application.type,
      pathname: application.pathname,
      submitPath: `/api/fima-bot/applications/${application.type}`,
      reviewMode: "manual_review",
      autoGrantRole: false,
      fields: Object.freeze([
        FIELD_COPY.discordHandle,
        FIELD_COPY.timezone,
        FIELD_COPY.availability,
        FIELD_COPY.motivation,
        Object.freeze({
          name: `${application.type}Response`,
          type: "textarea",
          label: APPLICATION_QUESTION[application.type],
          required: true
        })
      ])
    })])
));

const DASHBOARD_COPY = Object.freeze({
  overview: localized("Kurulum durumunu, etkin modülleri ve son hareketleri gözden geçir.", "Review setup status, active modules and recent activity."),
  modules: localized("Sunucunda çalışacak FIMA Bot özelliklerini seç.", "Choose which FIMA Bot features run in your server."),
  setup: localized("Kanalları ve rolleri güvenli bir başlangıç akışıyla eşleştir.", "Map channels and roles through a safe guided setup."),
  channels: localized("Bot özelliklerinin kullanacağı sunucu kanallarını eşleştir.", "Map the server channels used by bot features."),
  roles: localized("Erişim ve yönetim rollerini en az ayrıcalıkla yapılandır.", "Configure access and management roles with least privilege."),
  welcome: localized("Karşılama, ayrılma ve rol paneli deneyimlerini düzenle.", "Configure welcome, leave and role-panel experiences."),
  applications: localized("21 başvuru türünün kullanılabilirliğini ve inceleme hedeflerini yönet.", "Manage availability and review destinations for all 21 application types."),
  tickets: localized("Destek kategorilerini, ekipleri ve kapanış kurallarını ayarla.", "Set support categories, teams and closing rules."),
  profiles: localized("Doğrulama ve üye profili durumunu gözden geçir.", "Review verification and member profile status."),
  leaderboards: localized("Sıralama kaynaklarını ve görünürlük kurallarını belirle.", "Set leaderboard sources and visibility rules."),
  challenge: localized("Meydan okuma kurallarını ve operasyon durumunu incele.", "Review challenge rules and operational status."),
  availability: localized("Uygunluk ve izin akışlarını gözden geçir.", "Review availability and leave workflows."),
  sessions: localized("Eğitim ve seçme oturumu ayarlarını yönet.", "Manage training and tryout session settings."),
  events: localized("Etkinlik ve çekiliş akışlarının varsayılanlarını yönet.", "Manage defaults for event and giveaway flows."),
  moderation: localized("Moderasyon eylemlerini ve vaka kayıtlarını yapılandır.", "Configure moderation actions and case records."),
  security: localized("Otomatik moderasyon ve engel listesi politikalarını gözden geçir.", "Review automod and blacklist policies."),
  levels: localized("XP kazanımı ve seviye ilerlemesini yapılandır.", "Configure XP gain and level progression."),
  voice: localized("Katıl ve oluştur ses kanalı davranışını yapılandır.", "Configure join-to-create voice channel behavior."),
  social: localized("Sosyal ağ bildirimlerinin güvenli yayın akışını yönet.", "Manage the safe publishing flow for social notifications."),
  ai: localized("Sunucu AI asistanının izinli kullanım alanlarını yönet.", "Manage permitted uses of the server AI assistant."),
  commands: localized("Özel komutları ve otomatik yanıt kapsamını incele.", "Review custom commands and auto-responder scope."),
  branding: localized("Dil, vurgu rengi ve sunucu paneli görünümünü ayarla.", "Set language, accent color and server-panel appearance."),
  logs: localized("İşlem günlüklerinin hangi kanallara gönderileceğini yönet.", "Manage where operational logs are delivered."),
  premium: localized("Plan ve faturalama durumunu salt okunur incele.", "Review plan and billing status read-only."),
  audit: localized("Sunucu ayarlarındaki değişiklikleri salt okunur olarak incele.", "Inspect server setting changes in a read-only history.")
});

function html(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cleanPath(pathname) {
  const path = String(pathname || "").split(/[?#]/, 1)[0].replace(/\/+$/, "");
  return path || "/";
}

function t(value, locale) {
  return value?.[locale] || value?.tr || "";
}

function textResponse(kind, status, code, body, extra = {}) {
  return Object.freeze({ kind, status, code, headers: Object.freeze({ "content-type": "text/html; charset=utf-8" }), body, ...extra });
}

function renderNavigation(locale, access, activePath) {
  const links = fimaBotNavigation(locale, access).map(item => {
    const current = activePath === item.pathname || (item.pathname !== "/fima-bot" && activePath.startsWith(`${item.pathname}/`));
    return `<a href="${html(item.pathname)}"${current ? ' aria-current="page"' : ""}>${html(item.label)}</a>`;
  }).join("");
  const languageLabel = locale === "tr" ? "English" : "Türkçe";
  const alternateLocale = locale === "tr" ? "en" : "tr";
  return `<header class="site-header"><a class="brand" href="/fima-bot" aria-label="FIMA Bot"><span class="brand-mark" aria-hidden="true">F</span><span>FIMA Bot</span></a><nav class="desktop-nav" aria-label="${locale === "tr" ? "Ana menü" : "Primary navigation"}">${links}</nav><div class="header-actions"><a class="locale-link" href="${html(activePath)}?lang=${alternateLocale}" hreflang="${alternateLocale}">${languageLabel}</a><details class="mobile-menu"><summary aria-label="${locale === "tr" ? "Menüyü aç" : "Open menu"}"><span></span><span></span><span></span></summary><nav aria-label="${locale === "tr" ? "Mobil menü" : "Mobile navigation"}">${links}</nav></details></div></header>`;
}

function renderShell({ locale, access, activePath, pageId, title, summary, content }) {
  const skip = locale === "tr" ? "İçeriğe geç" : "Skip to content";
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#071715"><meta name="description" content="${html(summary)}"><title>${html(title)} · FIMA Bot</title><link rel="stylesheet" href="${FIMA_BOT_THEME_STYLESHEET}"></head><body><a class="skip-link" href="#main">${skip}</a><div class="ambient ambient-one" aria-hidden="true"></div><div class="ambient ambient-two" aria-hidden="true"></div><div class="shell">${renderNavigation(locale, access, activePath)}<main id="main" data-page-id="${html(pageId)}">${content}</main><footer><span>FIMA Bot</span><span>${locale === "tr" ? "Topluluklar için FIMA tarafından geliştirildi." : "Built by FIMA for communities."}</span></footer></div></body></html>`;
}

function renderHero(copy, locale, actions = "") {
  return `<section class="hero"><p class="eyebrow">${html(t(copy.eyebrow, locale))}</p><h1>${html(t(copy.title, locale))}</h1><p class="lede">${html(t(copy.summary, locale))}</p>${actions ? `<div class="hero-actions">${actions}</div>` : ""}</section>`;
}

function accessForContext({ authenticated, owner }) {
  if (owner) return "owner";
  return authenticated ? "account" : "public";
}

function renderProduct(locale) {
  const actions = `<a class="button primary" href="/fima-bot/invite">${locale === "tr" ? "Sunucuya ekle" : "Add to server"}</a><a class="button secondary" href="/fima-bot/commands">${locale === "tr" ? "Komutları keşfet" : "Explore commands"}</a>`;
  const cards = [
    [locale === "tr" ? "Sunucu yönetimi" : "Server management", locale === "tr" ? "Kanallar, roller ve modüller için sayfa sayfa kontrol." : "Page-by-page control for channels, roles and modules."],
    [locale === "tr" ? "21 başvuru yolu" : "21 application paths", locale === "tr" ? "Topluluk, içerik, ortaklık ve rekabet ekipleri için." : "For community, content, partnership and competitive teams."],
    [locale === "tr" ? "Güvenli içerik" : "Safe content", locale === "tr" ? "Önizleme, sürüm, yedek ve test sunucusu doğrulaması." : "Preview, version, backup and test-server verification."]
  ].map(([title, text], index) => `<article class="feature-card"><span class="card-index">0${index + 1}</span><h2>${html(title)}</h2><p>${html(text)}</p></article>`).join("");
  return `${renderHero(PAGE_COPY.product, locale, actions)}<section class="feature-grid" aria-label="${locale === "tr" ? "Öne çıkanlar" : "Highlights"}">${cards}</section><section class="signal-strip"><div><strong>21</strong><span>${locale === "tr" ? "başvuru türü" : "application types"}</span></div><div><strong>16</strong><span>${locale === "tr" ? "ayrı panel sayfası" : "separate dashboard pages"}</span></div><div><strong>2</strong><span>${locale === "tr" ? "desteklenen dil" : "supported languages"}</span></div></section>`;
}

function renderCommands(locale) {
  const groups = COMMAND_GROUPS.map(group => `<article class="command-group"><h2>${html(t(group.label, locale))}</h2><ul>${group.commands.map(command => `<li><code>${html(command)}</code><span>${locale === "tr" ? "Ayrıntıları gör" : "View details"}</span></li>`).join("")}</ul></article>`).join("");
  return `${renderHero(PAGE_COPY.commands, locale)}<section class="content-grid two-column">${groups}</section>`;
}

function renderApplicationDirectory(locale) {
  const catalog = fimaBotApplicationCatalog(locale);
  const families = [...new Set(catalog.map(item => item.family))];
  const sections = families.map(family => {
    const items = catalog.filter(item => item.family === family).map(item => {
      const action = item.submission === "public"
        ? `<a class="text-link" href="${html(item.pathname)}">${locale === "tr" ? "Başvuruyu aç" : "Open application"}<span aria-hidden="true">→</span></a>`
        : `<span class="private-label">${locale === "tr" ? "Uygun sunucularda kullanılabilir" : "Available in eligible servers"}</span>`;
      return `<article class="application-card"><div><span class="status-dot ${item.submission === "public" ? "open" : "private"}" aria-hidden="true"></span><span class="status-text">${item.submission === "public" ? (locale === "tr" ? "Genel başvuru" : "Public application") : (locale === "tr" ? "Sunucuya özel" : "Server private")}</span></div><h3>${html(item.label)}</h3>${action}</article>`;
    }).join("");
    return `<section class="catalog-family"><div class="section-heading"><p class="eyebrow">${html(family)}</p><span>${catalog.filter(item => item.family === family).length}</span></div><div class="application-grid">${items}</div></section>`;
  }).join("");
  return `${renderHero(PAGE_COPY.applications, locale)}<div class="notice"><strong>${locale === "tr" ? "Manuel değerlendirme" : "Manual review"}</strong><span>${locale === "tr" ? "Başvuru göndermek hiçbir ayrıcalıklı rolü otomatik olarak vermez." : "No role is granted automatically. Every submission receives a separate manual review."}</span></div>${sections}`;
}

function renderApplicationForm(application, locale, csrfToken) {
  const schema = FIMA_BOT_APPLICATION_FORM_SCHEMAS[application.type];
  const fields = schema.fields.map(field => {
    const label = html(t(field.label, locale));
    const required = field.required ? " required" : "";
    const control = field.type === "textarea"
      ? `<textarea id="field-${html(field.name)}" name="${html(field.name)}" rows="5"${required}></textarea>`
      : `<input id="field-${html(field.name)}" name="${html(field.name)}" type="${html(field.type)}"${required}>`;
    return `<div class="form-field"><label for="field-${html(field.name)}">${label}</label>${control}</div>`;
  }).join("");
  const csrf = csrfToken ? `<input type="hidden" name="_csrf" value="${html(csrfToken)}">` : "";
  const title = application.label[locale];
  const intro = {
    eyebrow: localized("Başvuru formu", "Application form"),
    title: localized(`${title} başvurusu`, `${title} application`),
    summary: localized("Yanıtların yalnızca değerlendirme ekibi tarafından incelenir. Gönderim, rol veya erişim garantisi vermez.", "Your answers are reviewed only by the review team. Submission does not guarantee a role or access.")
  };
  return `${renderHero(intro, locale, `<a class="text-link back-link" href="/fima-bot/apply">← ${locale === "tr" ? "Tüm başvurular" : "All applications"}</a>`)}<section class="form-layout"><aside class="form-aside"><p class="eyebrow">${locale === "tr" ? "Süreç" : "Process"}</p><ol><li>${locale === "tr" ? "Formu tamamla" : "Complete the form"}</li><li>${locale === "tr" ? "Discord hesabını doğrula" : "Verify your Discord account"}</li><li>${locale === "tr" ? "Manuel değerlendirmeyi bekle" : "Wait for manual review"}</li></ol><p>${locale === "tr" ? "Hiçbir rol otomatik verilmez." : "No role is granted automatically."}</p></aside><form class="application-form" method="post" action="${html(schema.submitPath)}" data-review-mode="manual_review" data-auto-grant-role="false" data-requires-csrf="true">${csrf}<input type="hidden" name="applicationType" value="${html(application.type)}">${fields}<label class="consent"><input type="checkbox" name="reviewConsent" required><span>${locale === "tr" ? "Bilgilerimin bu başvuru için incelenmesini kabul ediyorum." : "I agree to have my information reviewed for this application."}</span></label><button class="button primary" type="submit">${locale === "tr" ? "Başvuruyu gönder" : "Submit application"}</button></form></section>`;
}

function renderPremium(locale) {
  const items = [
    locale === "tr" ? "Gelişmiş sunucu markası" : "Advanced server branding",
    locale === "tr" ? "Ayrıntılı topluluk içgörüleri" : "Detailed community insights",
    locale === "tr" ? "Daha fazla panel ve otomasyon seçeneği" : "More panel and automation options"
  ].map(item => `<li><span aria-hidden="true">✓</span>${html(item)}</li>`).join("");
  return `${renderHero(PAGE_COPY.premium, locale)}<section class="spotlight"><div><p class="eyebrow">Premium</p><h2>${locale === "tr" ? "Topluluğun büyürken kontrol sende kalsın." : "Stay in control as your community grows."}</h2><ul class="check-list">${items}</ul></div><a class="button primary" href="/fima-bot/feedback">${locale === "tr" ? "Premium hakkında sor" : "Ask about Premium"}</a></section>`;
}

function renderFeedback(locale) {
  const options = [
    [locale === "tr" ? "Hata bildir" : "Report a bug", locale === "tr" ? "Beklenmeyen bir davranışı ayrıntılarıyla paylaş." : "Share details about unexpected behavior."],
    [locale === "tr" ? "Öneri paylaş" : "Share an idea", locale === "tr" ? "FIMA Bot'u geliştirecek fikrini anlat." : "Tell us how FIMA Bot could improve."],
    [locale === "tr" ? "Kurulum desteği" : "Setup support", locale === "tr" ? "Sunucu yapılandırman için yardım iste." : "Ask for help with your server configuration."]
  ].map(([title, copy]) => `<article class="choice-card"><h2>${html(title)}</h2><p>${html(copy)}</p><a class="text-link" href="/account/support?product=fima-bot">${locale === "tr" ? "Talep oluştur" : "Create request"}<span aria-hidden="true">→</span></a></article>`).join("");
  return `${renderHero(PAGE_COPY.feedback, locale)}<section class="content-grid three-column">${options}</section>`;
}

function renderInvite(locale) {
  const permissions = [
    locale === "tr" ? "Komutları kullan ve yanıtla" : "Use and respond to commands",
    locale === "tr" ? "Yapılandırılan kanalları görüntüle" : "View configured channels",
    locale === "tr" ? "Etkinleştirilen özellikler için mesaj yönet" : "Manage messages for enabled features"
  ].map(item => `<li>${html(item)}</li>`).join("");
  const actions = `<a class="button primary" href="/api/fima-bot/invite">${locale === "tr" ? "Discord ile devam et" : "Continue with Discord"}</a>`;
  return `${renderHero(PAGE_COPY.invite, locale, actions)}<section class="permission-card"><p class="eyebrow">${locale === "tr" ? "İzin özeti" : "Permission summary"}</p><h2>${locale === "tr" ? "Kurulumdan önce her izni gör." : "See every permission before setup."}</h2><ul>${permissions}</ul><p class="muted">${locale === "tr" ? "Yönetici izni varsayılan olarak istenmez." : "Administrator permission is not requested by default."}</p></section>`;
}

function normalizeGuilds(guilds, authorizedGuildIds) {
  const ids = new Set((authorizedGuildIds || []).map(String));
  const source = Array.isArray(guilds) && guilds.length ? guilds : [...ids].map(id => ({ id, name: `Discord server ${id.slice(-4)}` }));
  return source
    .map(guild => typeof guild === "string" ? { id: guild, name: `Discord server ${guild.slice(-4)}` } : guild)
    .filter(guild => guild && ids.has(String(guild.id)));
}

function renderDashboardLanding(locale, guilds, authorizedGuildIds) {
  const safeGuilds = normalizeGuilds(guilds, authorizedGuildIds);
  const list = safeGuilds.length
    ? safeGuilds.map(guild => `<article class="guild-card"><div class="guild-avatar" aria-hidden="true">${html(String(guild.name || "F").trim().slice(0, 1).toUpperCase())}</div><div><h2>${html(guild.name || guild.id)}</h2><p>${locale === "tr" ? "Yetkili sunucu" : "Authorized server"}</p></div><a class="button secondary" href="${html(dashboardPath(String(guild.id), "overview"))}">${locale === "tr" ? "Yönet" : "Manage"}</a></article>`).join("")
    : `<div class="empty-state"><h2>${locale === "tr" ? "Yönetilebilir sunucu bulunamadı" : "No manageable servers found"}</h2><p>${locale === "tr" ? "Discord sunucu izinlerini yenileyip tekrar dene." : "Refresh your Discord server permissions and try again."}</p></div>`;
  return `${renderHero(PAGE_COPY.dashboard, locale)}<section class="guild-list">${list}</section>`;
}

function renderDashboardPage(page, locale) {
  const { guildId, route } = page;
  const navigation = fimaBotDashboardNavigation(guildId, locale).map(group => `<section><p>${html(group.id)}</p>${group.pages.map(item => `<a href="${html(item.pathname)}"${item.id === route.id ? ' aria-current="page"' : ""}>${html(item.label)}${item.readOnly ? `<span>${locale === "tr" ? "salt okunur" : "read only"}</span>` : ""}</a>`).join("")}</section>`).join("");
  let workspace;
  if (route.id === "applications") {
    const applicationRows = fimaBotApplicationCatalog(locale).map(application => `<li><span>${html(application.label)}</span><span>${application.submission === "public" ? (locale === "tr" ? "Genel" : "Public") : (locale === "tr" ? "Sunucuya özel" : "Server private")}</span></li>`).join("");
    workspace = `<div class="dashboard-panel"><div class="panel-heading"><h2>${locale === "tr" ? "Başvuru türleri" : "Application types"}</h2><span>21</span></div><ul class="application-settings">${applicationRows}</ul></div>`;
  } else if (route.editableKeys.length === 0) {
    workspace = `<div class="dashboard-panel"><div class="panel-heading"><h2>${locale === "tr" ? "Özellik durumu" : "Feature status"}</h2><span>${locale === "tr" ? "Salt okunur" : "Read only"}</span></div><div class="audit-row"><span class="audit-mark"></span><div><strong>${html(route.label[locale])}</strong><p>${html(t(DASHBOARD_COPY[route.id], locale))}</p></div></div></div>`;
  } else {
    const liveDashboardPath = `/fima-bot/dashboard/${html(guildId)}/${html(route.id)}`;
    workspace = `<div class="dashboard-panel"><div class="panel-heading"><h2>${locale === "tr" ? "Yapılandırma durumu" : "Configuration status"}</h2><span>${locale === "tr" ? "Salt okunur" : "Read only"}</span></div><div class="audit-row"><span class="audit-mark"></span><div><strong>${html(route.label[locale])}</strong><p>${locale === "tr" ? "Bu deneyim önizlemesi ayarları değiştirmez. Değişiklikler yalnızca yetki ve CSRF denetimli canlı müşteri panelinden yapılabilir." : "This experience preview does not change settings. Changes are available only through the authorized, CSRF-protected live customer dashboard."}</p><a class="button secondary" href="${liveDashboardPath}">${locale === "tr" ? "Canlı panele dön" : "Return to live dashboard"}</a></div></div></div>`;
  }
  return `<div class="dashboard-shell"><aside class="dashboard-nav"><a class="server-switcher" href="/fima-bot/dashboard"><span>${locale === "tr" ? "Sunucu" : "Server"}</span><strong>…${html(guildId.slice(-4))}</strong></a><nav aria-label="${locale === "tr" ? "Sunucu ayarları" : "Server settings"}">${navigation}</nav></aside><section class="dashboard-main"><div class="dashboard-heading"><div><p class="eyebrow">${locale === "tr" ? "Sunucu ayarları" : "Server settings"}</p><h1>${html(route.label[locale])}</h1><p>${html(t(DASHBOARD_COPY[route.id], locale))}</p></div><span class="scope-badge">…${html(guildId.slice(-4))}</span></div>${workspace}</section></div>`;
}

function renderContentStudio(locale) {
  const stages = [
    [locale === "tr" ? "Taslak" : "Draft", locale === "tr" ? "İçeriği güvenli alan ve bağlantı kurallarıyla düzenle." : "Edit content with safe field and URL rules."],
    [locale === "tr" ? "Önizleme" : "Preview", locale === "tr" ? "Masaüstü ve mobil görünümü salt okunur incele." : "Review read-only desktop and mobile views."],
    [locale === "tr" ? "Sürüm + yedek" : "Version + backup", locale === "tr" ? "Üzerine yazmadan önce eşleşen anlık görüntüyü doğrula." : "Verify a matching snapshot before overwriting."],
    [locale === "tr" ? "Test yayını" : "Test publish", locale === "tr" ? "Yalnızca doğrulanmış test sunucusunda tam okuma yap." : "Use exact readback on the verified test server only."]
  ].map(([title, copy], index) => `<li><span>0${index + 1}</span><div><h2>${html(title)}</h2><p>${html(copy)}</p></div></li>`).join("");
  return `${renderHero(PAGE_COPY.contentStudio, locale)}<section class="studio-layout"><ol class="workflow">${stages}</ol><div class="studio-status"><p class="eyebrow">${locale === "tr" ? "Yayın ilkesi" : "Publish policy"}</p><strong>${locale === "tr" ? "Üretim yayını kapalı" : "Production publishing disabled"}</strong><p>${locale === "tr" ? "Bu deneyim yalnızca kontrollü test sunucusu planı üretir; webhook adresi veya gizli değer kabul etmez." : "This experience creates guarded test-server plans only; it accepts no webhook URL or secret value."}</p></div></section>`;
}

function renderStaticPage(pageId, locale, context) {
  switch (pageId) {
    case "product": return renderProduct(locale);
    case "commands": return renderCommands(locale);
    case "applications": return renderApplicationDirectory(locale);
    case "premium": return renderPremium(locale);
    case "feedback": return renderFeedback(locale);
    case "invite": return renderInvite(locale);
    case "dashboard": return renderDashboardLanding(locale, context.guilds, context.authorizedGuildIds);
    case "contentStudio": return renderContentStudio(locale);
    default: return "";
  }
}

function renderDenied(code, pathname, locale, access) {
  const accountRequired = code === "account_required";
  const title = accountRequired
    ? (locale === "tr" ? "Hesabınla devam et" : "Continue with your account")
    : code === "discord_verification_required"
      ? (locale === "tr" ? "Discord hesabını doğrula" : "Verify your Discord account")
      : (locale === "tr" ? "Bu sayfaya erişimin yok" : "You do not have access to this page");
  const summary = accountRequired
    ? (locale === "tr" ? "Bu alan hesap bilgilerinle korunur." : "This area is protected by your account.")
    : code === "discord_verification_required"
      ? (locale === "tr" ? "Başvuru göndermeden önce Discord bağlantını doğrula." : "Verify your Discord connection before submitting an application.")
      : (locale === "tr" ? "Yetkilerini kontrol edip tekrar deneyebilirsin." : "Check your permissions and try again.");
  const action = accountRequired
    ? `<a class="button primary" href="/login?returnTo=${encodeURIComponent(pathname)}">${locale === "tr" ? "Giriş yap" : "Sign in"}</a>`
    : `<a class="button secondary" href="/account">${locale === "tr" ? "Hesaba git" : "Go to account"}</a>`;
  return renderShell({ locale, access, activePath: pathname, pageId: `denied:${code}`, title, summary, content: `<section class="denied-state"><p class="eyebrow">${html(code)}</p><h1>${html(title)}</h1><p>${html(summary)}</p>${action}</section>` });
}

function notFound(pathname, locale, access) {
  const title = locale === "tr" ? "Sayfa bulunamadı" : "Page not found";
  const summary = locale === "tr" ? "Bu FIMA Bot sayfası mevcut değil." : "This FIMA Bot page does not exist.";
  const body = renderShell({ locale, access, activePath: pathname, pageId: "not-found", title, summary, content: `<section class="denied-state"><p class="eyebrow">404</p><h1>${title}</h1><p>${summary}</p><a class="button secondary" href="/fima-bot">${locale === "tr" ? "FIMA Bot'a dön" : "Back to FIMA Bot"}</a></section>` });
  return textResponse("not_found", 404, "fima_bot_page_not_found", body);
}

export function resolveFimaBotSiteRequest(pathname, context = {}) {
  const path = cleanPath(pathname);
  const locale = normalizeFimaLocale(context.locale);
  const authenticated = context.authenticated === true;
  const owner = authenticated && context.owner === true;
  const access = accessForContext({ authenticated, owner });
  const authorizedGuildIds = Array.isArray(context.authorizedGuildIds) ? context.authorizedGuildIds.map(String) : [];

  if (FIMA_BOT_LEGACY_ALIASES[path]) {
    return Object.freeze({ kind: "redirect", status: 308, target: FIMA_BOT_LEGACY_ALIASES[path] });
  }

  const guildEntry = path.match(/^\/fima-bot\/dashboard\/(\d{16,22})$/);
  if (guildEntry) {
    if (!authenticated) {
      return textResponse("deny", 401, "account_required", renderDenied("account_required", path, locale, access));
    }
    if (!authorizedGuildIds.includes(guildEntry[1])) {
      return textResponse("deny", 403, "guild_not_authorized", renderDenied("guild_not_authorized", path, locale, access));
    }
    return Object.freeze({ kind: "redirect", status: 302, target: dashboardPath(guildEntry[1], "overview") });
  }

  if (path.startsWith("/fima-bot/dashboard/")) {
    if (!authenticated) {
      return textResponse("deny", 401, "account_required", renderDenied("account_required", path, locale, access));
    }
    const dashboardPage = resolveFimaBotDashboardPage(path, authorizedGuildIds);
    if (dashboardPage?.kind === "deny") {
      return textResponse("deny", 403, dashboardPage.code, renderDenied(dashboardPage.code, path, locale, access));
    }
    if (dashboardPage?.kind === "page") {
      const title = dashboardPage.route.label[locale];
      const summary = t(DASHBOARD_COPY[dashboardPage.route.id], locale);
      const content = renderDashboardPage(dashboardPage, locale);
      const body = renderShell({ locale, access, activePath: path, pageId: `dashboard:${dashboardPage.route.id}`, title, summary, content });
      return textResponse("page", 200, null, body, { pageId: `dashboard:${dashboardPage.route.id}`, guildId: dashboardPage.guildId });
    }
    return notFound(path, locale, access);
  }

  if (path.startsWith("/fima-bot/apply/")) {
    const applicationPage = resolveFimaBotApplicationPage(path, {
      authenticated,
      discordVerified: context.discordVerified === true
    });
    if (!applicationPage) return notFound(path, locale, access);
    if (applicationPage.kind === "deny") {
      const status = applicationPage.code === "account_required" ? 401 : 403;
      return textResponse("deny", status, applicationPage.code, renderDenied(applicationPage.code, path, locale, access));
    }
    const application = applicationPage.application;
    const title = application.label[locale];
    const summary = locale === "tr" ? `${title} başvuru formu.` : `${title} application form.`;
    const body = renderShell({
      locale,
      access,
      activePath: path,
      pageId: `application:${application.type}`,
      title,
      summary,
      content: renderApplicationForm(application, locale, context.csrfToken)
    });
    return textResponse("page", 200, null, body, { pageId: `application:${application.type}`, applicationType: application.type });
  }

  const resolved = resolveFimaBotPage(path, { authenticated, owner });
  if (!resolved) return notFound(path, locale, access);
  if (resolved.kind === "redirect") return resolved;
  if (resolved.kind === "deny") {
    const status = resolved.code === "account_required" ? 401 : 403;
    return textResponse("deny", status, resolved.code, renderDenied(resolved.code, path, locale, access));
  }
  const page = resolved.page;
  const copy = PAGE_COPY[page.id];
  const title = t(copy.title, locale);
  const summary = t(copy.summary, locale);
  const content = renderStaticPage(page.id, locale, { ...context, authorizedGuildIds });
  const body = renderShell({ locale, access, activePath: path, pageId: page.id, title, summary, content });
  return textResponse("page", 200, null, body, { pageId: page.id });
}

export function fimaBotSiteRouteInventory() {
  const publicApplicationRoutes = Object.values(FIMA_BOT_APPLICATIONS)
    .filter(application => application.pathname)
    .map(application => application.pathname);
  return Object.freeze({
    staticRoutes: Object.freeze(Object.values(FIMA_BOT_PAGES).map(page => page.pathname)),
    publicApplicationRoutes: Object.freeze(publicApplicationRoutes),
    dashboardRouteTemplates: Object.freeze(Object.values(FIMA_BOT_DASHBOARD_ROUTES).map(route => `/fima-bot/dashboard/servers/:guildId/${route.id}`)),
    legacyRedirects: Object.freeze({ ...FIMA_BOT_LEGACY_ALIASES })
  });
}
