const APPLICATION_ROUTE_DEFINITIONS = [
  ["helper", "helper", "staff", "Helper", "Community", "Yeni üyelere rehberlik et, soruları çöz ve güvenli topluluk deneyimini destekle."],
  ["staff", "staff", "staff", "Staff", "Community", "Topluluk operasyonunda sorumluluk al ve ekipler arası günlük akışı destekle."],
  ["moderator", "moderator", "staff", "Moderator", "Community", "Kuralları tutarlı uygula, olayları kanıtla değerlendir ve topluluğu koru."],
  ["support", "support", "staff", "Support", "Community", "Üye sorunlarını anlaşılır, sabırlı ve güvenli bir destek akışıyla çöz."],
  ["training-hoster", "training_hoster", "staff", "Training Hoster", "Community", "Eğitimleri planla, sun ve katılımcıların gelişimini takip et."],
  ["event-staff", "event_staff", "staff", "Event Staff", "Community", "Topluluk etkinliklerini planla, yürüt ve güvenli katılımı destekle."],
  ["giveaway-staff", "giveaway_staff", "staff", "Giveaway Staff", "Community", "Çekilişleri şeffaf kurallarla ve doğrulanabilir sonuçlarla yönet."],
  ["content-creator", "content_creator", "staff", "Content Creator", "Media", "FIMA ürünleri ve topluluğu için özgün, yararlı içerikler üret."],
  ["video-team", "video_team", "staff", "Video Team", "Media", "FIMA yayınları, kısa videolar ve topluluk anları için güçlü hikâyeler üret."],
  ["creative-team", "creative_team", "staff", "Creative Team", "Media", "Banner, thumbnail, etkinlik görselleri ve FIMA tasarım dilini geliştir."],
  ["developer", "developer", "staff", "Developer", "Product", "FIMA ürünleri için güvenli, test edilebilir yazılım katkıları öner."],
  ["fima-support", "fima_support", "staff", "FIMA Support", "Product", "FIMA ekosistemi kullanıcılarına ürün odaklı teknik destek sun."],
  ["macro-staff", "macro_staff", "staff", "Macro Staff", "Product", "FIMA Macro kullanıcılarının kurulum ve kullanım süreçlerini destekle."],
  ["fflag-staff", "fflag_staff", "staff", "FFlag Staff", "Product", "FFlag taleplerini güvenlik, uyumluluk ve açıklık sınırlarıyla değerlendir."],
  ["partnership", "partnership", "business", "Partnership", "Business", "Sunucu, ürün veya kampanya için ölçülebilir ve karşılıklı değer sunan ortaklık öner."],
  ["creator", "creator", "business", "Creator / Media Partner", "Business", "İçerik, video, yaratıcı tasarım veya geliştirme iş birliğini FIMA ile buluştur."],
  ["reseller", "reseller", "business", "Reseller / Affiliate", "Business", "Net sahiplik, tanıtım ve hesap güvenliği sınırlarıyla ticari iş birliği öner."]
];

export const FIMA_BOT_APPLICATION_ROUTES = Object.freeze(
  Object.fromEntries(APPLICATION_ROUTE_DEFINITIONS.map(([slug, type, workflow, label, family, description]) => [
    slug,
    Object.freeze({ slug, type, workflow, label, family, description, pathname: `/fima-bot/apply/${slug}` })
  ]))
);

export function resolveFimaBotApplicationRoute(slug) {
  if (typeof slug !== "string" || !Object.hasOwn(FIMA_BOT_APPLICATION_ROUTES, slug)) return null;
  return FIMA_BOT_APPLICATION_ROUTES[slug];
}
