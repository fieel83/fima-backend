import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder,
  ModalBuilder, PermissionsBitField, SlashCommandBuilder, StringSelectMenuBuilder,
  TextInputBuilder, TextInputStyle,
  AutoModerationActionType, AutoModerationRuleEventType, AutoModerationRuleTriggerType
} from "discord.js";
import { assertParadiseTestGuildMutation } from "./runtimeEnvironment.js";
import { hasParadisePermission, PARADISE_PERMISSIONS, paradiseRoleKeysForMember } from "./paradiseRbac.js";
import {
  commandRegistryEntry,
  enabledParadiseModules,
  inferParadiseTemplate,
  paradiseCommandAccess,
  paradiseCommandChannelContext,
  paradiseCommandRegistrationAllowed,
  visibleParadiseCommands,
  visibleParadiseStaffCommands
} from "./paradiseCommandRegistry.js";
import { resolveParadiseFeatureFlag } from "./paradiseFeatureFlags.js";
import {
  buildParadiseReconciliation,
  shouldRunParadiseReconciliation,
  summarizeParadiseReconciliation
} from "./paradiseReconciliation.js";
import { buildParadiseComponentId, outdatedParadiseComponentMessage, parseParadiseComponentId } from "./paradiseComponentProtocol.js";
import { buildParadiseRestoreDryRun, createParadiseBackupEnvelope } from "./paradiseBackupIntegrity.js";

export const PARADISE_TEST_GUILD_ID = "1520519015661961257";
export const DEFAULT_PARADISE_BRAND_COLOR = "#000000";
// Changing this revision reruns the guarded smoke suite only in the fixed
// Paradise test guild. It never targets a production guild.
const PARADISE_AUTO_SMOKE_REVISION = "3a71-compact-turkish-template-smoke-v8";
// This revision is intentionally limited to the fixed lab guild. It is the
// owner-authorized compact test layout, never a production-guild rebuild.
const PARADISE_TEST_LAB_LAYOUT_REVISION = "3a71-compact-tsbtr-lab-v1";
const DEFAULT_PARADISE_FOOTER_BRAND = "Made By Fieel";
const PARADISE_PUBLIC_ASSET_BASE = String(process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || "https://fimamacro.com").replace(/\/+$/, "");
const PARADISE_LEADERBOARD_SEPARATOR_ASSET = `${PARADISE_PUBLIC_ASSET_BASE}/assets/images/paradise/line-gifs/fixedbulletlines.gif`;
const LEVELS = ["Low", "Mid", "High"];
const STRENGTHS = ["Weak", "Stable", "Strong"];
const APPLICATION_TYPES = Object.freeze([
  ["staff", "Staff"], ["moderator", "Moderator"], ["support", "Support"],
  ["training_hoster", "Training Hoster"], ["tryout_hoster", "Tryout Hoster"],
  ["referee", "Referee"], ["event_staff", "Event Staff"],
  ["giveaway_staff", "Giveaway Staff"], ["content_creator", "Content Creator"],
  ["partnership", "Partnership / Ally"], ["clan_mainer", "Clan Member / Mainer"],
  ["fima_support", "Fima Support Helper"], ["macro_staff", "Macro Staff"],
  ["fflag_staff", "FFlag Staff"], ["war_hoster", "War Hoster"],
  ["reseller", "Reseller / Affiliate"]
]);
const COMMUNITY_BLOCKED_APPLICATION_TYPES = new Set(["clan_mainer", "tryout_hoster", "referee", "war_hoster"]);
const CLAN_ONLY_APPLICATION_TYPES = new Set(["clan_mainer", "war_hoster"]);
const COMMUNITY_ONLY_APPLICATION_TYPES = new Set(["fima_support", "macro_staff", "fflag_staff", "reseller"]);
const TSBTR_BLOCKED_APPLICATION_TYPES = new Set(["clan_mainer", "fima_support", "macro_staff", "fflag_staff", "war_hoster", "reseller"]);
const DISCORD_APPLICATION_MODAL_LIMIT = 5;
const APPLICATION_DRAFT_TTL_MS = 30 * 60_000;
const APPLICATION_QUESTION_BANK = Object.freeze({
  staff: [
    ["activity", "Haftalık aktiflik", "Haftada kaç gün ve hangi saatlerde aktif olabilirsin?", TextInputStyle.Short, 3, 180],
    ["judgement", "Yetki kullanımı", "Spam/toxic/haksızlık durumunda ilk ne yaparsın?", TextInputStyle.Paragraph, 20, 700],
    ["teamwork", "Ekip uyumu", "Diğer stafflarla anlaşmazlık yaşarsan nasıl çözersin?", TextInputStyle.Paragraph, 20, 700],
    ["experience", "Deneyim", "Daha önce staff oldun mu? Nerede, hangi görevlerde?", TextInputStyle.Paragraph, 5, 700],
    ["why", "Neden sen?", "Bu rol için seni öne çıkaran özellik nedir?", TextInputStyle.Paragraph, 20, 700]
  ],
  moderator: [
    ["activity", "Haftalık aktiflik", "Haftada kaç gün moderasyon yapabilirsin?", TextInputStyle.Short, 3, 180],
    ["mute_policy", "Mute kararı", "Bir kullanıcı spam yaparsa kaç saat mute önerirsin ve neden?", TextInputStyle.Paragraph, 20, 700],
    ["approval", "Üst onay", "Kick/ban yetkin yoksa üst yetkiliye nasıl rapor açarsın?", TextInputStyle.Paragraph, 20, 700],
    ["evidence", "Kanıt yönetimi", "Haksızlık iddiasını hangi kanıtlarla incelersin?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "Moderator rolü için neden uygun olduğunu yaz.", TextInputStyle.Paragraph, 20, 700]
  ],
  training_hoster: [
    ["availability", "Aktiflik", "Haftada kaç training açabilirsin?", TextInputStyle.Short, 3, 180],
    ["teams", "Takım dengesi", "Sunucuda 10 kişi var, takımları nasıl dengeli kurarsın?", TextInputStyle.Paragraph, 20, 700],
    ["rules", "Disiplin", "Training disiplinini ve sırayı nasıl korursun?", TextInputStyle.Paragraph, 20, 700],
    ["result", "Sonuç kaydı", "Training bitince sonuç ve MVP bilgisini nasıl kaydedersin?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "Training Hoster rolünü neden almalısın?", TextInputStyle.Paragraph, 20, 700]
  ],
  tryout_hoster: [
    ["criteria", "Değerlendirme", "Oyuncuyu değerlendirirken ilk baktığın kriter nedir?", TextInputStyle.Paragraph, 20, 700],
    ["stage", "Stage kararı", "Stage belirlerken skill dışı hangi özellikleri incelersin?", TextInputStyle.Paragraph, 20, 700],
    ["objectivity", "Tarafsızlık", "Arkadaşını test ederken objektif kalabilir misin? Nasıl?", TextInputStyle.Paragraph, 20, 700],
    ["appeal", "İtiraz", "Kararına itiraz edilirse nasıl davranırsın?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "Tryout Hoster rolü için neden uygunsun?", TextInputStyle.Paragraph, 20, 700]
  ],
  referee: [
    ["neutrality", "Tarafsızlık", "Tarafsızlığını nasıl korursun?", TextInputStyle.Paragraph, 20, 700],
    ["ticket", "Ticket kontrol", "Challenge ticket geçerli mi diye neleri kontrol edersin?", TextInputStyle.Paragraph, 20, 700],
    ["score", "Skor postu", "/post atarken score/note/ticket ID kısmını nasıl doldurursun?", TextInputStyle.Paragraph, 20, 700],
    ["exploit", "Hile iddiası", "Hile iddiası olursa nasıl hareket edersin?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "Referee rolü için neden uygun olduğunu yaz.", TextInputStyle.Paragraph, 20, 700]
  ],
  giveaway_staff: [
    ["activity", "Aktiflik", "Haftada kaç çekiliş veya etkinlik yönetebilirsin?", TextInputStyle.Short, 3, 180],
    ["fairness", "Adalet", "Adil bir çekiliş sistemini nasıl kurarsın?", TextInputStyle.Paragraph, 20, 700],
    ["alts", "Fake hesaplar", "Fake hesapları ve tekrar katılımları nasıl engellersin?", TextInputStyle.Paragraph, 20, 700],
    ["delay", "Ödül gecikmesi", "Ödül gecikirse kullanıcıya nasıl açıklarsın?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "Bu rol için seni öne çıkaran özellik nedir?", TextInputStyle.Paragraph, 20, 700]
  ],
  event_staff: [
    ["activity", "Aktiflik", "Haftada kaç etkinlik/game night yapabilirsin?", TextInputStyle.Short, 3, 180],
    ["idea", "Etkinlik fikri", "Örnek bir etkinlik veya game night fikri yaz.", TextInputStyle.Paragraph, 20, 700],
    ["flow", "Akış yönetimi", "Katılımı ve düzeni yüksek tutmak için ne yaparsın?", TextInputStyle.Paragraph, 20, 700],
    ["conflict", "Tartışma", "Etkinlikte tartışma çıkarsa nasıl müdahale edersin?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "Etkinlik ekibi için neden uygunsun?", TextInputStyle.Paragraph, 20, 700]
  ],
  macro_staff: [
    ["knowledge", "Macro bilgisi", "Hangi macro/hotkey araçlarını ve kullanım mantığını biliyorsun?", TextInputStyle.Paragraph, 20, 700],
    ["safety", "Güvenlik", "Kullanıcıdan token/cookie istemeden nasıl destek verirsin?", TextInputStyle.Paragraph, 20, 700],
    ["support", "Destek akışı", "Bir kullanıcı macro çalışmıyor derse hangi adımlarla incelersin?", TextInputStyle.Paragraph, 20, 700],
    ["limits", "Yetki sınırı", "Bilmediğin veya riskli bir konuda nasıl eskalasyon yaparsın?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "Macro Staff rolü için neden uygunsun?", TextInputStyle.Paragraph, 20, 700]
  ],
  fflag_staff: [
    ["knowledge", "FFlag bilgisi", "FFlag nedir ve kullanıcıya güvenli şekilde nasıl anlatırsın?", TextInputStyle.Paragraph, 20, 700],
    ["risk", "Risk yönetimi", "Hatalı ayar/performans sorunu olursa nasıl geri aldırırsın?", TextInputStyle.Paragraph, 20, 700],
    ["support", "Destek akışı", "Bir kullanıcının cihazına göre doğru öneriyi nasıl belirlersin?", TextInputStyle.Paragraph, 20, 700],
    ["privacy", "Gizlilik", "Kullanıcı dosya/log paylaşırken hangi bilgileri gizletirsin?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "FFlag Staff rolü için neden uygunsun?", TextInputStyle.Paragraph, 20, 700]
  ],
  reseller: [
    ["channels", "Satış kanalları", "Satışı hangi kanallarda yapacaksın ve kime ulaşacaksın?", TextInputStyle.Paragraph, 20, 700],
    ["anti_scam", "Dolandırıcılık önlemi", "Chargeback/dolandırıcılık riskini nasıl azaltırsın?", TextInputStyle.Paragraph, 20, 700],
    ["terms", "Şartlar", "Teslimat, iade ve komisyon şartlarını nasıl takip edersin?", TextInputStyle.Paragraph, 20, 700],
    ["experience", "Deneyim", "Daha önce reseller/affiliate deneyimin var mı?", TextInputStyle.Paragraph, 5, 700],
    ["why", "Neden sen?", "Neden Paradise/Fima reseller olmak istiyorsun?", TextInputStyle.Paragraph, 20, 700]
  ],
  default: [
    ["motivation", "Motivasyon", "Bu pozisyonu neden istiyorsun?", TextInputStyle.Paragraph, 20, 700],
    ["experience", "Deneyim", "Bu rolle alakalı deneyimini yaz.", TextInputStyle.Paragraph, 5, 700],
    ["availability", "Aktiflik", "Saat dilimin ve haftalık aktifliğin nedir?", TextInputStyle.Short, 3, 180],
    ["situation", "Durum sorusu", "Zor bir durumda nasıl sakin ve adil karar verirsin?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "Bu rol için neden seni seçmeliyiz?", TextInputStyle.Paragraph, 20, 700]
  ]
});
const APPLICATION_QUESTION_BANK_V2 = Object.freeze({
  staff: [
    ["activity", "Haftalık aktiflik", "Haftada kaç gün ve hangi saatlerde aktif olabilirsin?", TextInputStyle.Short, 3, 180],
    ["judgement", "Yetki kullanımı", "Spam, toxiclik veya haksızlık durumunda ilk nasıl hareket edersin?", TextInputStyle.Paragraph, 20, 700],
    ["teamwork", "Ekip uyumu", "Diğer stafflarla anlaşmazlık yaşarsan nasıl çözersin?", TextInputStyle.Paragraph, 20, 700],
    ["evidence", "Kanıt yönetimi", "Bir işlem yapmadan önce hangi kanıtları toplarsın?", TextInputStyle.Paragraph, 20, 700],
    ["policy", "Kural anlatımı", "Kuralları yeni üyelere nasıl netleştirirsin?", TextInputStyle.Paragraph, 20, 700],
    ["pressure", "Baskı altında karar", "Baskı altında doğru ve tarafsız karar verebilir misin? Örnekle açıkla.", TextInputStyle.Paragraph, 20, 700],
    ["toxicity", "Toxic kullanıcı", "Toxic oyuncuya nasıl yaklaşırsın?", TextInputStyle.Paragraph, 20, 700],
    ["coordination", "Koordinasyon", "Diğer yöneticilerle nasıl koordineli çalışırsın?", TextInputStyle.Paragraph, 20, 700],
    ["abuse", "Yetki sınırı", "Yetkini kötüye kullanmamak için kendine hangi sınırları koyarsın?", TextInputStyle.Paragraph, 20, 700],
    ["availability_plan", "Aktiflik planı", "Yoğun olduğun dönemlerde görevlerini nasıl aksatmazsın?", TextInputStyle.Paragraph, 20, 700],
    ["experience", "Deneyim", "Daha önce staff oldun mu? Nerede, hangi görevlerde?", TextInputStyle.Paragraph, 5, 700],
    ["why", "Neden sen?", "Bu rol için seni öne çıkaran özellik nedir?", TextInputStyle.Paragraph, 20, 700]
  ],
  moderator: [
    ["activity", "Haftalık aktiflik", "Haftada kaç gün moderasyon yapabilirsin?", TextInputStyle.Short, 3, 180],
    ["warn", "Uyarı kararı", "Bir kullanıcı kuralı ilk kez bozarsa nasıl uyarırsın?", TextInputStyle.Paragraph, 20, 700],
    ["mute_policy", "Mute kararı", "Bir kullanıcı spam yaparsa kaç saat mute önerirsin ve neden?", TextInputStyle.Paragraph, 20, 700],
    ["custom_reason", "Özel sebep", "Preset sebep yetmezse özel sebebi nasıl açık yazarsın?", TextInputStyle.Paragraph, 20, 700],
    ["approval", "Üst onay", "Kick/ban yetkin yoksa üst yetkiliye nasıl rapor açarsın?", TextInputStyle.Paragraph, 20, 700],
    ["evidence", "Kanıt yönetimi", "Haksızlık iddiasını hangi kanıtlarla incelersin?", TextInputStyle.Paragraph, 20, 700],
    ["quarantine", "Karantina", "Şüpheli bir kullanıcıyı ne zaman karantinaya alırsın?", TextInputStyle.Paragraph, 20, 700],
    ["raid", "Raid/spam", "Raid veya toplu spam görürsen ilk 3 adımın ne olur?", TextInputStyle.Paragraph, 20, 700],
    ["appeal", "İtiraz", "Bir kullanıcı cezasına itiraz ederse nasıl davranırsın?", TextInputStyle.Paragraph, 20, 700],
    ["staff_strike", "Staff hatası", "Başka bir staff yanlış işlem yaptıysa ne yaparsın?", TextInputStyle.Paragraph, 20, 700],
    ["language", "Üslup", "Ceza verirken mesaj dilini nasıl profesyonel tutarsın?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "Moderator rolü için neden uygun olduğunu yaz.", TextInputStyle.Paragraph, 20, 700]
  ],
  support: [
    ["activity", "Aktiflik", "Haftada kaç gün ticket bakabilirsin?", TextInputStyle.Short, 3, 180],
    ["first_reply", "İlk cevap", "Bir ticket açıldığında kullanıcıya ilk nasıl yanıt verirsin?", TextInputStyle.Paragraph, 20, 700],
    ["privacy", "Gizlilik", "Kullanıcıdan hangi bilgileri asla istemezsin?", TextInputStyle.Paragraph, 20, 700],
    ["triage", "Önceliklendirme", "Acil ve normal ticketları nasıl ayırırsın?", TextInputStyle.Paragraph, 20, 700],
    ["handoff", "Eskalasyon", "Çözemediğin konuyu kime ve nasıl aktarırsın?", TextInputStyle.Paragraph, 20, 700],
    ["refund", "Ödeme/iade", "Ödeme veya iade sorusunda nasıl güvenli ilerlersin?", TextInputStyle.Paragraph, 20, 700],
    ["bug", "Hata raporu", "Bir bug bildirimi aldığında hangi bilgileri toplarsın?", TextInputStyle.Paragraph, 20, 700],
    ["tone", "Üslup", "Kızgın bir kullanıcıya nasıl sakin cevap verirsin?", TextInputStyle.Paragraph, 20, 700],
    ["transcript", "Transcript", "Ticket kapanırken transcript neden önemlidir?", TextInputStyle.Paragraph, 20, 700],
    ["anti_scam", "Güvenlik", "Sahte satıcı/dolandırıcılık şüphesinde ne yaparsın?", TextInputStyle.Paragraph, 20, 700],
    ["experience", "Deneyim", "Daha önce support yaptın mı?", TextInputStyle.Paragraph, 5, 700],
    ["why", "Neden sen?", "Support ekibi için neden uygunsun?", TextInputStyle.Paragraph, 20, 700]
  ],
  training_hoster: [
    ["availability", "Aktiflik", "Haftada kaç training açabilirsin?", TextInputStyle.Short, 3, 180],
    ["teams", "Takım dengesi", "Sunucuda 10 kişi var, takımları nasıl dengeli kurarsın?", TextInputStyle.Paragraph, 20, 700],
    ["queue", "Sıra düzeni", "Oyuncu sıralamasını nasıl belirlersin?", TextInputStyle.Paragraph, 20, 700],
    ["discipline", "Disiplin", "Training disiplinini nasıl sağlarsın?", TextInputStyle.Paragraph, 20, 700],
    ["losing_player", "Kaybeden oyuncu", "Sürekli kaybeden oyuncuya nasıl yaklaşırsın?", TextInputStyle.Paragraph, 20, 700],
    ["afk", "AFK oyuncu", "AFK olan oyuncuya nasıl müdahale edersin?", TextInputStyle.Paragraph, 20, 700],
    ["conflict", "Tartışma", "Tartışma çıkarsa nasıl çözersin?", TextInputStyle.Paragraph, 20, 700],
    ["time", "Süre", "Training süresini nasıl planlarsın?", TextInputStyle.Paragraph, 20, 700],
    ["performance", "Performans", "Performansı nasıl değerlendirirsin?", TextInputStyle.Paragraph, 20, 700],
    ["teamwork", "Takım uyumu", "Takım içi uyumu nasıl gözlemlersin?", TextInputStyle.Paragraph, 20, 700],
    ["log_system", "Kayıt sistemi", "Training kayıt/sonuç sistemini nasıl düzenli tutarsın?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "Training Hoster rolünü neden almalısın?", TextInputStyle.Paragraph, 20, 700]
  ],
  tryout_hoster: [
    ["criteria", "İlk kriter", "Oyuncuyu değerlendirirken ilk baktığın kriter nedir?", TextInputStyle.Paragraph, 20, 700],
    ["non_skill", "Skill dışı kriter", "Skill dışında hangi özellikler önemlidir?", TextInputStyle.Paragraph, 20, 700],
    ["stage", "Stage kararı", "Stage belirlerken hangi kriterleri baz alırsın?", TextInputStyle.Paragraph, 20, 700],
    ["rounds", "Maç sayısı", "Tek maç mı çoklu maç mı yaparsın? Neden?", TextInputStyle.Paragraph, 20, 700],
    ["objectivity", "Tarafsızlık", "Tarafsızlığı nasıl korursun?", TextInputStyle.Paragraph, 20, 700],
    ["friend", "Arkadaşını test", "Arkadaşını test ederken objektif olabilir misin? Nasıl?", TextInputStyle.Paragraph, 20, 700],
    ["appeal", "İtiraz", "Kararına itiraz edilirse nasıl davranırsın?", TextInputStyle.Paragraph, 20, 700],
    ["toxic", "Toxic oyuncu", "Toxic oyuncuyu nasıl değerlendirirsin?", TextInputStyle.Paragraph, 20, 700],
    ["unfair_claim", "Haksızlık iddiası", "Haksızlık iddiasını nasıl incelersin?", TextInputStyle.Paragraph, 20, 700],
    ["standard", "Standart sistem", "Tryout sistemini nasıl standart hale getirirsin?", TextInputStyle.Paragraph, 20, 700],
    ["pressure", "Baskı", "Baskı altında doğru karar verebilir misin?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "Bu rol için neden uygunsun?", TextInputStyle.Paragraph, 20, 700]
  ],
  referee: [
    ["neutrality", "Tarafsızlık", "Tarafsızlığını nasıl korursun?", TextInputStyle.Paragraph, 20, 700],
    ["ticket", "Ticket kontrol", "Challenge ticket geçerli mi diye neleri kontrol edersin?", TextInputStyle.Paragraph, 20, 700],
    ["range", "Range kontrol", "Oyuncuların challenge range içinde olup olmadığını nasıl anlarsın?", TextInputStyle.Paragraph, 20, 700],
    ["cooldown", "Cooldown/immunity", "Cooldown veya immunity varsa nasıl işlem yaparsın?", TextInputStyle.Paragraph, 20, 700],
    ["score", "Skor postu", "/post atarken score/note/ticket ID kısmını nasıl doldurursun?", TextInputStyle.Paragraph, 20, 700],
    ["auto", "Auto win", "Auto/ff/no-show durumunda notu nasıl yazarsın?", TextInputStyle.Paragraph, 20, 700],
    ["co_ref", "Co-ref", "Co-referee ne zaman eklenmeli?", TextInputStyle.Paragraph, 20, 700],
    ["recording", "Kayıt", "Set kaydı yoksa nasıl davranırsın?", TextInputStyle.Paragraph, 20, 700],
    ["exploit", "Hile iddiası", "Hile iddiası olursa nasıl hareket edersin?", TextInputStyle.Paragraph, 20, 700],
    ["closed_ticket", "Kapalı ticket", "Ticket kapandıysa bilgiyi nasıl kurtarırsın?", TextInputStyle.Paragraph, 20, 700],
    ["escalation", "Eskalasyon", "Yanlış post veya tartışmada hangi role haber verirsin?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "Referee rolü için neden uygun olduğunu yaz.", TextInputStyle.Paragraph, 20, 700]
  ],
  event_staff: [
    ["activity", "Aktiflik", "Haftada kaç etkinlik/gamenight yapabilirsin?", TextInputStyle.Short, 3, 180],
    ["idea", "Etkinlik fikri", "Örnek bir etkinlik fikri yaz.", TextInputStyle.Paragraph, 20, 700],
    ["games", "Oyun önerisi", "Gamenight için farklı oyun önerilerin var mı?", TextInputStyle.Paragraph, 20, 700],
    ["participation", "Katılım", "Katılımı nasıl yüksek tutarsın?", TextInputStyle.Paragraph, 20, 700],
    ["matches", "Eşleşme", "Turnuva veya eşleşmeleri nasıl belirlersin?", TextInputStyle.Paragraph, 20, 700],
    ["voice", "Voice düzeni", "Voice kanallarındaki karmaşayı nasıl kontrol edersin?", TextInputStyle.Paragraph, 20, 700],
    ["fun_discipline", "Eğlence/disiplin", "Eğlence ile disiplini nasıl dengelersin?", TextInputStyle.Paragraph, 20, 700],
    ["missing", "Gelmeyenler", "Etkinliğe gelmeyen oyuncularla nasıl ilgilenirsin?", TextInputStyle.Paragraph, 20, 700],
    ["conflict", "Tartışma", "Tartışma çıkarsa nasıl müdahale edersin?", TextInputStyle.Paragraph, 20, 700],
    ["time", "Süre", "Süre yönetimini nasıl sağlarsın?", TextInputStyle.Paragraph, 20, 700],
    ["revive", "Düşük katılım", "Katılım düşerse sistemi nasıl canlandırırsın?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "Bu rolü neden sen yönetmelisin?", TextInputStyle.Paragraph, 20, 700]
  ],
  giveaway_staff: [
    ["activity", "Aktiflik", "Haftada kaç gün aktif olabilirsin?", TextInputStyle.Short, 3, 180],
    ["experience", "Deneyim", "Daha önce çekiliş yönettin mi?", TextInputStyle.Paragraph, 5, 700],
    ["fairness", "Adil sistem", "Adil bir çekiliş sistemini nasıl kurarsın?", TextInputStyle.Paragraph, 20, 700],
    ["alts", "Fake hesaplar", "Fake hesapları nasıl engellersin?", TextInputStyle.Paragraph, 20, 700],
    ["duration", "Süre", "Çekiliş süresini neye göre belirlersin?", TextInputStyle.Paragraph, 20, 700],
    ["low_join", "Düşük katılım", "Katılım düşük olursa ne yaparsın?", TextInputStyle.Paragraph, 20, 700],
    ["cheat", "Hile iddiası", "Hile iddiası olursa nasıl araştırırsın?", TextInputStyle.Paragraph, 20, 700],
    ["delay", "Ödül gecikmesi", "Ödül gecikirse nasıl çözersin?", TextInputStyle.Paragraph, 20, 700],
    ["rules", "Kural netliği", "Çekiliş kurallarını nasıl netleştirirsin?", TextInputStyle.Paragraph, 20, 700],
    ["repeat_winners", "Tekrar kazananlar", "Sürekli aynı kişilerin kazanmasını nasıl önlersin?", TextInputStyle.Paragraph, 20, 700],
    ["coordination", "Koordinasyon", "Diğer yöneticilerle nasıl koordineli çalışırsın?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "Bu rol için seni öne çıkaran özellik nedir?", TextInputStyle.Paragraph, 20, 700]
  ],
  war_hoster: [
    ["official_friendly", "War türü", "Official ve friendly war farkını açıkla.", TextInputStyle.Paragraph, 20, 700],
    ["lineup", "War kadrosu", "War kadrosunu nasıl seçersin?", TextInputStyle.Paragraph, 20, 700],
    ["backup", "Yedek sistemi", "Yedek sistemi kurar mısın? Nasıl?", TextInputStyle.Paragraph, 20, 700],
    ["prep", "Hazırlık", "War öncesi hazırlık sürecini nasıl planlarsın?", TextInputStyle.Paragraph, 20, 700],
    ["contact", "Rakip iletişimi", "Rakip klanla iletişimi nasıl yürütürsün?", TextInputStyle.Paragraph, 20, 700],
    ["missing_player", "Eksik oyuncu", "Son dakika oyuncu eksilirse ne yaparsın?", TextInputStyle.Paragraph, 20, 700],
    ["toxic_enemy", "Toxic rakip", "Toxic rakiplere karşı nasıl davranırsın?", TextInputStyle.Paragraph, 20, 700],
    ["motivation", "Motivasyon", "War sırasında motivasyonu nasıl yüksek tutarsın?", TextInputStyle.Paragraph, 20, 700],
    ["rules", "Kural netliği", "Kuralları nasıl netleştirirsin?", TextInputStyle.Paragraph, 20, 700],
    ["cheat", "Hile iddiası", "Hile iddiası olursa nasıl hareket edersin?", TextInputStyle.Paragraph, 20, 700],
    ["review", "War analizi", "War sonrası analiz yapar mısın? Nasıl?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "Bu rolü neden sen almalısın?", TextInputStyle.Paragraph, 20, 700]
  ],
  macro_staff: [
    ["knowledge", "Macro bilgisi", "Hangi macro/hotkey araçlarını ve kullanım mantığını biliyorsun?", TextInputStyle.Paragraph, 20, 700],
    ["safe_support", "Güvenli destek", "Kullanıcıdan token/cookie istemeden nasıl destek verirsin?", TextInputStyle.Paragraph, 20, 700],
    ["diagnosis", "Sorun analizi", "Macro çalışmıyor diyen kullanıcıda hangi adımları kontrol edersin?", TextInputStyle.Paragraph, 20, 700],
    ["device", "Cihaz farkı", "Kullanıcının cihazına göre doğru yönlendirmeyi nasıl yaparsın?", TextInputStyle.Paragraph, 20, 700],
    ["privacy", "Gizlilik", "Ekran görüntüsü/log isterken hangi bilgileri gizletirsin?", TextInputStyle.Paragraph, 20, 700],
    ["false_claim", "Yanlış iddia", "Macro zararlı/virüs iddiası gelirse nasıl açıklarsın?", TextInputStyle.Paragraph, 20, 700],
    ["escalation", "Eskalasyon", "Bilmediğin veya riskli konuda nasıl üst ekibe aktarırsın?", TextInputStyle.Paragraph, 20, 700],
    ["documentation", "Rehber", "Kısa ve anlaşılır bir macro rehberini nasıl hazırlarsın?", TextInputStyle.Paragraph, 20, 700],
    ["anti_scam", "Anti-scam", "Sahte macro linklerini nasıl tespit edip raporlarsın?", TextInputStyle.Paragraph, 20, 700],
    ["availability", "Aktiflik", "Haftada kaç gün destek verebilirsin?", TextInputStyle.Short, 3, 180],
    ["experience", "Deneyim", "Daha önce teknik destek verdin mi?", TextInputStyle.Paragraph, 5, 700],
    ["why", "Neden sen?", "Macro Staff rolü için neden uygunsun?", TextInputStyle.Paragraph, 20, 700]
  ],
  fflag_staff: [
    ["knowledge", "FFlag bilgisi", "FFlag nedir ve kullanıcıya güvenli şekilde nasıl anlatırsın?", TextInputStyle.Paragraph, 20, 700],
    ["risk", "Risk yönetimi", "Hatalı ayar/performans sorunu olursa nasıl geri aldırırsın?", TextInputStyle.Paragraph, 20, 700],
    ["device", "Cihaz uyumu", "Kullanıcının cihazına göre doğru öneriyi nasıl belirlersin?", TextInputStyle.Paragraph, 20, 700],
    ["privacy", "Gizlilik", "Kullanıcı dosya/log paylaşırken hangi bilgileri gizletirsin?", TextInputStyle.Paragraph, 20, 700],
    ["testing", "Test", "Bir ayarın işe yarayıp yaramadığını nasıl test ettirirsin?", TextInputStyle.Paragraph, 20, 700],
    ["rollback", "Geri dönüş", "Sorun çıkarsa güvenli geri dönüş planın ne olur?", TextInputStyle.Paragraph, 20, 700],
    ["misinfo", "Yanlış bilgi", "Yanlış FFlag önerisi yayıldığında nasıl müdahale edersin?", TextInputStyle.Paragraph, 20, 700],
    ["support_flow", "Destek akışı", "FFlag ticketında ilk hangi soruları sorarsın?", TextInputStyle.Paragraph, 20, 700],
    ["documentation", "Rehber", "Yeni başlayan biri için FFlag rehberi nasıl olmalı?", TextInputStyle.Paragraph, 20, 700],
    ["availability", "Aktiflik", "Haftada kaç gün destek verebilirsin?", TextInputStyle.Short, 3, 180],
    ["experience", "Deneyim", "Daha önce performans/ayar desteği verdin mi?", TextInputStyle.Paragraph, 5, 700],
    ["why", "Neden sen?", "FFlag Staff rolü için neden uygunsun?", TextInputStyle.Paragraph, 20, 700]
  ],
  reseller: [
    ["channels", "Satış kanalları", "Satışı hangi kanallarda yapacaksın ve kime ulaşacaksın?", TextInputStyle.Paragraph, 20, 700],
    ["anti_scam", "Dolandırıcılık önlemi", "Chargeback/dolandırıcılık riskini nasıl azaltırsın?", TextInputStyle.Paragraph, 20, 700],
    ["official_payment", "Ödeme güvenliği", "Satışı sadece onaylı ödeme/checkout akışıyla nasıl yürütürsün?", TextInputStyle.Paragraph, 20, 700],
    ["delivery", "Teslimat", "Teslimat, iade ve komisyon şartlarını nasıl takip edersin?", TextInputStyle.Paragraph, 20, 700],
    ["no_secrets", "Gizli bilgi", "Müşteriden hangi bilgileri asla istemezsin?", TextInputStyle.Paragraph, 20, 700],
    ["evidence", "Kanıt", "Satış kanıtlarını ve müşteri konuşmalarını nasıl düzenli tutarsın?", TextInputStyle.Paragraph, 20, 700],
    ["refund", "İade/itiraz", "İade veya ödeme itirazı olursa nasıl hareket edersin?", TextInputStyle.Paragraph, 20, 700],
    ["promises", "Yanıltıcı vaat", "Müşteriye hangi vaatleri kesinlikle vermezsin?", TextInputStyle.Paragraph, 20, 700],
    ["pricing", "Fiyat/komisyon", "Karlı ama güvenli bir reseller ilişkisi için komisyon nasıl olmalı?", TextInputStyle.Paragraph, 20, 700],
    ["reporting", "Raporlama", "Haftalık satış raporunu nasıl hazırlarsın?", TextInputStyle.Paragraph, 20, 700],
    ["experience", "Deneyim", "Daha önce reseller/affiliate deneyimin var mı?", TextInputStyle.Paragraph, 5, 700],
    ["why", "Neden sen?", "Neden Paradise/Fima reseller olmak istiyorsun?", TextInputStyle.Paragraph, 20, 700]
  ],
  content_creator: [
    ["platforms", "Platformlar", "Hangi platformlarda içerik üretiyorsun?", TextInputStyle.Short, 3, 180],
    ["portfolio", "Örnek iş", "Örnek video/link veya portfolyo açıklaması yaz.", TextInputStyle.Paragraph, 20, 700],
    ["schedule", "Plan", "Haftada kaç içerik çıkarabilirsin?", TextInputStyle.Short, 3, 180],
    ["style", "Stil", "İçerik tarzın nasıl?", TextInputStyle.Paragraph, 20, 700],
    ["brand", "Marka", "Paradise/Fima markasını nasıl doğru temsil edersin?", TextInputStyle.Paragraph, 20, 700],
    ["rules", "Kural", "Yanıltıcı başlık veya sahte vaat kullanmamak için ne yaparsın?", TextInputStyle.Paragraph, 20, 700],
    ["community", "Topluluk", "Yorumlarda toxiclik çıkarsa nasıl yönetirsin?", TextInputStyle.Paragraph, 20, 700],
    ["collab", "İşbirliği", "Diğer içerik üreticileriyle nasıl çalışırsın?", TextInputStyle.Paragraph, 20, 700],
    ["analytics", "Analiz", "İçeriğin performansını nasıl ölçersin?", TextInputStyle.Paragraph, 20, 700],
    ["assets", "Görsel", "Banner/thumbnail hazırlama deneyimin var mı?", TextInputStyle.Paragraph, 5, 700],
    ["availability", "Aktiflik", "Haftalık aktifliğin nedir?", TextInputStyle.Short, 3, 180],
    ["why", "Neden sen?", "Content Creator rolü için neden uygunsun?", TextInputStyle.Paragraph, 20, 700]
  ],
  partnership: [
    ["clan", "Klan/topluluk", "Hangi klan/topluluk adına başvuruyorsun?", TextInputStyle.Short, 3, 180],
    ["purpose", "Amaç", "Partnership/ally amacı nedir?", TextInputStyle.Paragraph, 20, 700],
    ["benefit", "Karşılıklı fayda", "İki taraf için nasıl fayda sağlayacak?", TextInputStyle.Paragraph, 20, 700],
    ["invite", "Davet", "Sunucu davetini ve temsilci bilgisini yaz.", TextInputStyle.Paragraph, 10, 700],
    ["rules", "Kurallar", "Ortak etkinliklerde kuralları nasıl net tutarsınız?", TextInputStyle.Paragraph, 20, 700],
    ["activity", "Aktiflik", "Topluluğun aktifliği ve üye kitlesi nedir?", TextInputStyle.Paragraph, 20, 700],
    ["reputation", "Güven", "Daha önce sorun/blacklist geçmişiniz var mı?", TextInputStyle.Paragraph, 10, 700],
    ["events", "Etkinlik", "Beraber hangi etkinlikleri yapabiliriz?", TextInputStyle.Paragraph, 20, 700],
    ["contact", "İletişim", "İletişim ve anlaşmazlık durumunda kim yetkili olacak?", TextInputStyle.Paragraph, 20, 700],
    ["duration", "Süre", "Bu ilişki sürekli mi, dönemsel mi?", TextInputStyle.Short, 3, 180],
    ["notes", "Not", "Eklemek istediğin bir detay var mı?", TextInputStyle.Paragraph, 0, 700],
    ["why", "Neden biz?", "Neden Paradise/Fima ile çalışmak istiyorsun?", TextInputStyle.Paragraph, 20, 700]
  ],
  clan_mainer: [
    ["roblox", "Roblox", "Roblox kullanıcı adın nedir?", TextInputStyle.Short, 3, 80],
    ["discord", "Discord", "Discord kullanıcı adın/ID'n nedir?", TextInputStyle.Short, 3, 120],
    ["experience", "Deneyim", "Daha önce hangi klanlarda bulundun?", TextInputStyle.Paragraph, 5, 700],
    ["stage", "Seviye", "Kendini hangi Stage/Level/Strength seviyesinde görüyorsun?", TextInputStyle.Short, 3, 80],
    ["main_code", "Mainer kodu", "Mainer kodunu nasıl kullanacağını biliyor musun?", TextInputStyle.Paragraph, 20, 700],
    ["activity", "Aktiflik", "Haftalık aktifliğin nedir?", TextInputStyle.Short, 3, 180],
    ["wars", "War", "War/roster etkinliklerine katılabilir misin?", TextInputStyle.Paragraph, 20, 700],
    ["training", "Training", "Training/tryoutlara katılma durumun nedir?", TextInputStyle.Paragraph, 20, 700],
    ["toxicity", "Davranış", "Toxiclik veya tartışma olursa nasıl davranırsın?", TextInputStyle.Paragraph, 20, 700],
    ["loyalty", "Bağlılık", "Neden Paradise mainlemek istiyorsun?", TextInputStyle.Paragraph, 20, 700],
    ["proof", "Kanıt", "Mainer proof atmayı kabul ediyor musun?", TextInputStyle.Short, 2, 80],
    ["why", "Neden sen?", "Klanda seni öne çıkaran özellik nedir?", TextInputStyle.Paragraph, 20, 700]
  ],
  fima_support: [
    ["product", "Ürün bilgisi", "Fima/Paradise ürünleri hakkında neleri biliyorsun?", TextInputStyle.Paragraph, 20, 700],
    ["support", "Destek", "Bir kullanıcı lisans veya giriş sorunu yaşarsa nasıl yönlendirirsin?", TextInputStyle.Paragraph, 20, 700],
    ["privacy", "Gizlilik", "Kullanıcıdan hangi bilgileri asla istemezsin?", TextInputStyle.Paragraph, 20, 700],
    ["trial", "Trial", "Ücretsiz deneme/Roblox verify akışını nasıl anlatırsın?", TextInputStyle.Paragraph, 20, 700],
    ["refund", "Ödeme", "Ödeme/iade sorularında nasıl güvenli konuşursun?", TextInputStyle.Paragraph, 20, 700],
    ["scam", "Anti-scam", "Sahte Fima linklerini nasıl tespit edip raporlarsın?", TextInputStyle.Paragraph, 20, 700],
    ["tickets", "Ticket", "Ticket kapatmadan önce neleri kontrol edersin?", TextInputStyle.Paragraph, 20, 700],
    ["tone", "Üslup", "Kızgın kullanıcıya nasıl cevap verirsin?", TextInputStyle.Paragraph, 20, 700],
    ["escalation", "Eskalasyon", "Çözemediğin konuyu nasıl üst ekibe aktarırsın?", TextInputStyle.Paragraph, 20, 700],
    ["activity", "Aktiflik", "Haftada kaç gün destek verebilirsin?", TextInputStyle.Short, 3, 180],
    ["experience", "Deneyim", "Daha önce support yaptın mı?", TextInputStyle.Paragraph, 5, 700],
    ["why", "Neden sen?", "Fima Support Helper rolü için neden uygunsun?", TextInputStyle.Paragraph, 20, 700]
  ],
  default: [
    ["motivation", "Motivasyon", "Bu pozisyonu neden istiyorsun?", TextInputStyle.Paragraph, 20, 700],
    ["experience", "Deneyim", "Bu rolle alakalı deneyimini yaz.", TextInputStyle.Paragraph, 5, 700],
    ["availability", "Aktiflik", "Saat dilimin ve haftalık aktifliğin nedir?", TextInputStyle.Short, 3, 180],
    ["situation", "Durum sorusu", "Zor bir durumda nasıl sakin ve adil karar verirsin?", TextInputStyle.Paragraph, 20, 700],
    ["teamwork", "Ekip", "Ekip arkadaşlarınla nasıl çalışırsın?", TextInputStyle.Paragraph, 20, 700],
    ["rules", "Kurallar", "Kuralları nasıl net ve anlaşılır uygularsın?", TextInputStyle.Paragraph, 20, 700],
    ["evidence", "Kanıt", "Karar verirken kanıtı nasıl değerlendirirsin?", TextInputStyle.Paragraph, 20, 700],
    ["conflict", "Tartışma", "Bir tartışmada nasıl arabuluculuk yaparsın?", TextInputStyle.Paragraph, 20, 700],
    ["privacy", "Gizlilik", "Kullanıcı gizliliğini nasıl korursun?", TextInputStyle.Paragraph, 20, 700],
    ["improvement", "Gelişim", "Bu sistemi daha iyi yapmak için ne önerirsin?", TextInputStyle.Paragraph, 20, 700],
    ["limits", "Sınır", "Yetkinin sınırlarını nasıl bilirsin?", TextInputStyle.Paragraph, 20, 700],
    ["why", "Neden sen?", "Bu rol için neden seni seçmeliyiz?", TextInputStyle.Paragraph, 20, 700]
  ]
});
const verificationChallenges = new Map();
const verifiedProfiles = new Map();
const pendingTryouts = new Map();
const pendingChallenges = new Map();
const challengeDrafts = new Map();
const activeTrainings = new Map();
const activeTournaments = new Map();
const staffTeamRefreshTimers = new Map();
const levelMessageCooldowns = new Map();
const paradiseGuildContext = new AsyncLocalStorage();
const PROFILE_STORE = path.resolve(process.cwd(), "artifacts", "post-security-backlog", "3a59-verified-roblox-profiles.json");
const STATE_KEY = "paradise_3a59_state_v1";
const EMPTY_STATE = Object.freeze({
  profiles: {}, verificationChallenges: {}, pendingTryouts: {}, pendingChallenges: {}, trainings: {},
  tournaments: {}, leaderboard: {}, leaderboards: {}, staffActivity: {}, activityChecks: {},
  whitelists: {}, giveaways: {}, rsvps: {}, relations: {}, loa: {},
  config: {}, guildConfigs: {}, ticketOptOuts: {}, transcripts: {},
  rosters: {}, lineups: {}, blacklists: {}, appeals: {}, bails: {},
  serverBackups: {}, realAudits: {}, setupPreviews: {},
  temporaryVoices: {}, memberLevels: {}, questionOfDay: {},
  applications: {}, applicationDrafts: {}, moderationCases: {}, securityState: {}, supportTickets: {}
});
let lastKnownStateSnapshot = normalizeState({ config: { footerBrand: DEFAULT_PARADISE_FOOTER_BRAND } });

function normalizeState(value) {
  const input = value && typeof value === "object" ? value : {};
  return Object.fromEntries(Object.keys(EMPTY_STATE).map(key => [
    key, input[key] && typeof input[key] === "object" ? input[key] : {}
  ]));
}

function configForGuild(state, guildId) {
  return state.guildConfigs?.[String(guildId || "")] || state.config || {};
}

function belongsToGuild(record, guildId) {
  return record?.guildId ? record.guildId === guildId : guildId === PARADISE_TEST_GUILD_ID;
}

function guildUserKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function guildUserRecord(bucket, guildId, userId) {
  return bucket?.[guildUserKey(guildId, userId)]
    || (guildId === PARADISE_TEST_GUILD_ID ? bucket?.[userId] : null)
    || null;
}

function leaderboardForGuild(state, guildId) {
  return state.leaderboards?.[String(guildId || "")]
    || (guildId === PARADISE_TEST_GUILD_ID ? state.leaderboard : {})
    || {};
}

function ensureLeaderboardForGuild(state, guildId) {
  state.leaderboards[guildId] = state.leaderboards[guildId]
    || (guildId === PARADISE_TEST_GUILD_ID ? structuredClone(state.leaderboard || {}) : {});
  return state.leaderboards[guildId];
}

async function loadState() {
  try {
    const { prisma } = await import("./db.js");
    const row = await prisma.setting.findUnique({ where: { key: STATE_KEY } });
    if (row?.value) {
      lastKnownStateSnapshot = normalizeState(row.value);
      return lastKnownStateSnapshot;
    }
  } catch {}
  try {
    lastKnownStateSnapshot = normalizeState(JSON.parse(await fs.readFile(PROFILE_STORE, "utf8")));
    return lastKnownStateSnapshot;
  } catch {
    lastKnownStateSnapshot = normalizeState({});
    return lastKnownStateSnapshot;
  }
}

async function saveState(mutator) {
  const current = await loadState();
  const next = normalizeState(await mutator(current) || current);
  try {
    const { prisma } = await import("./db.js");
    await prisma.setting.upsert({ where: { key: STATE_KEY }, update: { value: next }, create: { key: STATE_KEY, value: next } });
  } catch {
    await writeArtifact("3a59-paradise-state-fallback.json", next);
  }
  lastKnownStateSnapshot = next;
  return next;
}

export function normalizeParadiseBrandColor(value, fallback = DEFAULT_PARADISE_BRAND_COLOR) {
  const normalized = String(value || "").trim().replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? `#${normalized}` : fallback;
}

export function paradiseBrandColorInteger(value) {
  return Number.parseInt(normalizeParadiseBrandColor(value).slice(1), 16);
}

async function paradiseBrandColor() {
  const state = await loadState();
  return paradiseBrandColorInteger(configForGuild(state, paradiseGuildContext.getStore()).brandColor);
}

function paradiseFooter(context = "", guildId = paradiseGuildContext.getStore()) {
  const footerBrand = String(configForGuild(lastKnownStateSnapshot, guildId).footerBrand || DEFAULT_PARADISE_FOOTER_BRAND).trim()
    || DEFAULT_PARADISE_FOOTER_BRAND;
  return { text: `${context ? `${context} • ` : ""}${footerBrand}` };
}

function guildLanguage(config = {}) {
  const raw = String(config.language || config.locale || config.dashboardLanguage || "tr").toLowerCase();
  return raw.startsWith("en") ? "en" : "tr";
}

export function sessionLanguageCopy(language = "tr", type = "training") {
  const tr = language !== "en";
  const isTryout = type === "tryout";
  return tr
    ? {
      title: isTryout ? "# DENEME A\u00c7IK" : "# ANTRENMAN",
      subtitle: isTryout ? "## Deneme Saati" : "## Rekabet\u00e7i Pratik",
      server: "Sunucu",
      format: "Format",
      characters: "Karakterler",
      hoster: "Hoster",
      evaluation: "De\u011ferlendirme",
      rules: "Kurallar",
      link: "Ba\u011flant\u0131",
      locked: "SUNUCU K\u0130L\u0130TL\u0130",
      unlock: "A\u00c7",
      endButton: isTryout ? "DENEMEY\u0130 B\u0130T\u0130R" : "ANTRENMANI B\u0130T\u0130R",
      lockedReply: "# SUNUCU K\u0130L\u0130TLEND\u0130",
      unlockedReply: "# SUNUCU A\u00c7ILDI",
      endedReply: isTryout ? "# DENEME B\u0130TT\u0130" : "# ANTRENMAN B\u0130TT\u0130",
      controlsFooter: "",
      started: isTryout ? "Deneme ba\u015flat\u0131ld\u0131" : "Antrenman ba\u015flat\u0131ld\u0131"
    }
    : {
      title: isTryout ? "# TRYOUT OPEN" : "# TRAINING",
      subtitle: isTryout ? "## Tryout Time" : "## Competitive Practice",
      server: "Server",
      format: "Format",
      characters: "Playable Characters",
      hoster: "Hoster",
      evaluation: "Evaluation",
      rules: "Rules",
      link: "Link",
      locked: "SERVER LOCKED",
      unlock: "UNLOCK",
      endButton: isTryout ? "END TRYOUT" : "END TRAINING",
      lockedReply: "# SERVER LOCKED",
      unlockedReply: "# SERVER UNLOCKED",
      endedReply: isTryout ? "# TRYOUT ENDED" : "# TRAINING ENDED",
      controlsFooter: "",
      started: isTryout ? "Tryout started" : "Training started"
    };
}

function sessionControls(sessionId, type, language = "tr") {
  const copy = sessionLanguageCopy(language, type);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_session_locked:${sessionId}`).setLabel(copy.locked).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`paradise_session_unlocked:${sessionId}`).setLabel(copy.unlock).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`paradise_session_end:${sessionId}`).setLabel(copy.endButton).setStyle(ButtonStyle.Danger)
  );
}

export function trainingAnnouncementMarkdown({ language, pingRoleId, server, format, characters, rules, link, hoster, cohost }) {
  const copy = sessionLanguageCopy(language, "training");
  const cleanRules = (Array.isArray(rules) ? rules : String(rules || "").split(/\r?\n/))
    .map(value => String(value).trim().replace(/^[-•◆◇]\s*/, ""))
    .filter(Boolean);
  return [
    pingRoleId ? `<@&${pingRoleId}>` : null,
    copy.title,
    copy.subtitle,
    "",
    `◇ ${copy.server}:`,
    server,
    "",
    `◇ ${copy.format}:`,
    format,
    "",
    `◇ ${copy.characters}:`,
    characters,
    "",
    `◇ ${copy.rules}:`,
    ...cleanRules.map(rule => `• ${rule}`),
    "",
    `◇ ${copy.link}:`,
    link,
    "",
    `◇ ${copy.hoster}:`,
    `${hoster}${cohost ? ` • ${language === "tr" ? "Yardımcı hoster" : "Co-hoster"}: ${cohost}` : ""}`,
    "",
    copy.controlsFooter
  ].filter(Boolean).join("\n");
}

export function tryoutAnnouncementMarkdown({ language, pingRoleId, server, link, hoster }) {
  const copy = sessionLanguageCopy(language, "tryout");
  const tr = language !== "en";
  return [
    pingRoleId ? `<@&${pingRoleId}>` : null,
    copy.title,
    copy.subtitle,
    "",
    `◇ ${copy.server}:`,
    server,
    "",
    `◇ ${copy.format}:`,
    tr ? "• FT2 — 1 agresif round\n• FT2 — 1 pasif round" : "• FT2 — one aggressive round\n• FT2 — one passive round",
    "",
    `◇ ${copy.hoster}:`,
    hoster,
    "",
    `◇ ${copy.evaluation}:`,
    tr
      ? "RC timing, catch, dash tepkisi, hareket, baskı, adaptasyon ve game sense."
      : "RC timing, catches, dash reactions, movement, pressure, adaptation and game sense.",
    "",
    `◇ ${copy.rules}:`,
    ...(tr
      ? ["• LH yok", "• 3M1 Reset yok", "• True Downslam yok", "• 2 RC yok", "• Wall yok", "• Overpassive yok", "• Alt hesap yok", "• Sırada vurmak yok", "• Sırayı terk etmek yok"]
      : ["• No LH", "• No 3M1 reset", "• No True Downslam", "• No 2 RC", "• No wall abuse", "• No overpassive play", "• No alternate accounts", "• Do not hit people in queue", "• Do not leave the queue"]),
    "",
    `◇ ${copy.link}:`,
    link,
    "",
    null
  ].filter(Boolean).join("\n");
}

function compactText(value, max = 90) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trim()}…` : text;
}

function rankedStatusText(row = {}, activeTicket = null, language = "tr") {
  const now = Date.now();
  const availability = row.availability || {};
  if (activeTicket) {
    const label = activeTicket.ticketId || activeTicket.channelId || "open";
    return language === "tr" ? `Meydan okunuyor — Ticket #${label}` : `Being challenged — Ticket #${label}`;
  }
  if (Number(availability.loaUntil || 0) > now) {
    const stamp = Math.floor(Number(availability.loaUntil) / 1000);
    return language === "tr" ? `LOA bitiyor: <t:${stamp}:R>` : `LOA ends: <t:${stamp}:R>`;
  }
  if (Number(availability.immunityUntil || 0) > now) {
    const stamp = Math.floor(Number(availability.immunityUntil) / 1000);
    return language === "tr" ? `Bağışıklık bitiyor: <t:${stamp}:R>` : `Immunity ends: <t:${stamp}:R>`;
  }
  if (Number(availability.cooldownUntil || 0) > now) {
    const stamp = Math.floor(Number(availability.cooldownUntil) / 1000);
    return language === "tr" ? `Bekleme süresi bitiyor: <t:${stamp}:R>` : `Cooldown ends: <t:${stamp}:R>`;
  }
  if (String(row.status || "").trim()) return compactText(row.status, 80);
  return language === "tr" ? "Challenge atılabilir" : "Challengeable";
}

function vacantLeaderboardDescription(rank, language = "tr") {
  return language === "tr"
    ? ["**Bu sıra şu an boş.**", "Yeni oyuncu atanınca kart otomatik güncellenir."].join("\n")
    : ["**This position is currently open.**", "The card updates automatically when a fighter is assigned."].join("\n");
}

function leaderboardBoardIntro(label, language = "tr") {
  return language === "tr"
    ? [`# ♛ ${label}`, "### Rank kartları", "Bu sıralama otomatik güncellenir. Oyuncunun tüm detayları için `/profile view` kullan.", "-# Made By Fieel"].join("\n")
    : [`# ♛ ${label}`, "### Rank cards", "This board updates automatically. Use `/profile view` for full fighter details.", "-# Made By Fieel"].join("\n");
}

export const PARADISE_CLAN_ROLES = [
  "✦・OWNER RANK",
  "Owner",
  "━━━━━ ADMINS ━━━━━", "Admin", "Overseer", "Community Manager", "Training Manager",
  "Administration Manager", "Head Admin", "Senior Admin",
  "━━━━━ MODERATION ━━━━━", "Moderator Manager",
  "Head Moderator", "Senior Moderator", "Moderator", "Helper", "Security Staff",
  "━━━━━ HOSTERS ━━━━━",
  "Trial Training Manager", "Training Supervisor", "Experienced Training Hoster",
  "Training Hoster", "Trial Training Hoster", "Tryout Manager",
  "Experienced Tryout Hoster", "Tryout Hoster", "Trial Tryout Hoster",
  "Tournament Manager", "Event Manager", "Event Hoster", "Giveaway Manager", "Giveaway Hoster",
  "Game Night Manager", "War Hoster",
  "━━━━━ REFEREES ━━━━━",
  "Referee Manager", "Head Referee", "Experienced Referee", "Referee", "Trial Referee",
  "Coach / Helper",
  "━━━━━ COMMUNITY ━━━━━",
  "Verified Fighter", "Media & Links Approved",
  "━━━━━ PING ROLES ━━━━━",
  "Training Ping", "Tryout Ping", "Referee Ping", "Spar Ping", "Tournament Ping", "Event Ping",
  "Giveaway Ping", "Game Night Ping", "Staff Updates", "Server Updates",
  "━━━━━ LANGUAGE ━━━━━",
  "Turkish", "English", "Activity Whitelist", "LOA", "BLACKLISTED", "Muted / Quarantined",
  "━━━━━ REGION ROLES ━━━━━",
  "Frankfurt, Germany", "Paris, France", "London, United Kingdom", "Amsterdam, Netherlands",
  "Europe", "Asia", "North America", "South America", "Oceania",
  "━━━━━ CHARACTERS ━━━━━",
  "The Strongest Hero", "Hero Hunter", "Monster Form", "Destructive Cyborg",
  "Deadly Ninja", "Brutal Demon", "Blade Master", "Wild Psychic", "Martial Artist", "Tech Prodigy",
  "━━━━━ TOP PLAYERS ━━━━━",
  "Top Player 1-10", "Top Player 11-20", "Top Player 21-30", "Top Player", "Retired Top Player",
  ...Array.from({ length: 30 }, (_, index) => `Top ${index + 1}`),
  "━━━━━ STAGE / LEVEL ━━━━━",
  ...Array.from({ length: 5 }, (_, stage) =>
    ["Low", "Mid", "High"].flatMap(level =>
      ["Weak", "Stable", "Strong"].map(strength => `Stage ${stage} ${level} ${strength}`)
    )
  ).flat()
];

export const PARADISE_COMMUNITY_ROLES = [
  "✦・OWNER RANK",
  "Owner",
  "━━━━━ STAFF ━━━━━", "Admin", "Manager", "Moderator", "Support Staff", "Trial Support",
  "Bot Manager", "Developer", "Security Staff", "Macro Staff", "FFlag Staff",
  "━━━━━ PRODUCT ACCESS ━━━━━", "Buyer", "Trial User", "Lifetime Buyer",
  "━━━━━ COMMUNITY ━━━━━", "Creator", "Partner / Reseller", "Reseller", "Media & Links Approved", "Verified",
  "━━━━━ PING ROLES ━━━━━",
  "Update Ping", "Training Ping", "Tournament Ping", "Giveaway Ping",
  "Event Ping", "Game Night Ping", "Security Alert Ping", "Robux Payment Ping",
  "━━━━━ LANGUAGE ━━━━━",
  "Turkish", "English", "LOA", "BLACKLISTED", "Muted / Quarantined",
  "━━━━━ REGION ROLES ━━━━━",
  "Europe", "Asia", "North America", "South America", "Oceania"
];

export const PARADISE_ROLES = PARADISE_CLAN_ROLES;

export const PARADISE_VOICE_CHANNEL_NAMES = Object.freeze([
  "◜・oda-oluştur",
  "◜・topluluk-sesi",
  "◜・savaş-odası",
  "◞・afk"
]);

// The old names are deliberately retained only as detection aliases.  A repair
// can create/remap the premium compact layout without mistaking an old text
// channel for a valid voice channel or silently deleting it.
const PARADISE_LEGACY_VOICE_CHANNEL_NAMES = Object.freeze([
  "Join to Create",
  "Community Voice",
  "War VC",
  "AFK"
]);

export function paradiseSetupChannelType(categoryName, channelName) {
  return [...PARADISE_VOICE_CHANNEL_NAMES, ...PARADISE_LEGACY_VOICE_CHANNEL_NAMES].includes(String(channelName || ""))
    ? ChannelType.GuildVoice
    : ChannelType.GuildText;
}

export function paradiseSetupChannelTypeMismatch(channel, categoryName, channelName) {
  if (!channel) return false;
  return channel.type !== paradiseSetupChannelType(categoryName, channelName);
}

function paradiseVoiceSetupIds(guild) {
  const find = names => guild.channels.cache.find(channel => names.includes(channel.name) && channel.type === ChannelType.GuildVoice)?.id || null;
  return {
    joinToCreateChannelId: find(["◜・oda-oluştur", "Join to Create"]),
    communityVoiceChannelId: find(["◜・topluluk-sesi", "Community Voice"]),
    warVoiceChannelId: find(["◜・savaş-odası", "War VC"]),
    afkChannelId: find(["◞・afk", "AFK"]),
    privateVoiceCategoryId: guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && ["━━ ÖZEL SESLER ━━", "PRIVATE VOICE"].includes(channel.name))?.id || null
  };
}

async function configureParadiseAfkChannel(guild, voiceIds) {
  if (!voiceIds?.afkChannelId || typeof guild?.setAFKChannel !== "function") return false;
  await guild.setAFKChannel(voiceIds.afkChannelId, "Paradise configured AFK voice channel").catch(() => null);
  return true;
}

export const PARADISE_CHANNEL_MAPPINGS = Object.freeze([
  ["start_here_channel", "Public getting-started handbook"],
  ["rules_channel", "Public rules handbook"],
  ["roles_channel", "Public language and ping role panel"],
  ["member_help_channel", "Public member-safe bot help"],
  ["staff_command_guide_channel", "Private role-aware staff command guide"],
  ["staff_guides_channel", "Private indexed staff handbooks"],
  ["welcome_channel", "Public welcome messages"],
  ["leave_channel", "Public leave messages"],
  ["level_channel", "XP levels and leaderboard"],
  ["challenge_channel", "Challenge create panel"],
  ["challenge_rules_channel", "Challenge rules"],
  ["challenge_results_channel", "Challenge results"],
  ["availability_channel", "Availability board"],
  ["loa_channel", "LOA board"],
  ["tryout_channel", "Tryout announcements"],
  ["tryout_results_channel", "Tryout results"],
  ["training_channel", "Training announcements"],
  ["training_results_channel", "Training results"],
  ["referee_works_channel", "Referee works"],
  ["activity_logs_channel", "Activity logs"],
  ["activity_check_channel", "Activity checks"],
  ["relation_panel_channel", "Relations board"],
  ["role_guide_channel", "Role guide"],
  ["faq_channel", "FAQ and trust"],
  ["staff_report_channel", "Staff reports"],
  ["support_ticket_channel", "Support ticket panel"],
  ["application_ticket_channel", "Application ticket panel"],
  ["support_logs_channel", "Private support ticket logs"],
  ["challenge_transcripts_channel", "Private challenge transcripts"],
  ["support_transcripts_channel", "Private support transcripts"],
  ["roster_channel", "EU roster board"],
  ["main_lineup_channel", "Main lineup board"],
  ["war_lineup_channel", "War lineup board"],
  ["mainer_proof_channel", "Mainer proof review"],
  ["blacklist_channel", "Blacklist board"],
  ["blacklist_appeal_channel", "Private blacklist appeals"],
  ["bail_appeal_channel", "Private bail reviews"],
  ["blacklist_logs_channel", "Private blacklist logs"],
  ["roster_logs_channel", "Private roster logs"],
  ["war_logs_channel", "Private war and lineup logs"],
  ["application_review_channel", "Private application reviews"],
  ["application_logs_channel", "Private application logs"],
  ["moderation_requests_channel", "Private moderation request queue"],
  ["moderation_logs_channel", "Private moderation case logs"],
  ["quarantine_review_channel", "Private quarantine review"],
  ["voice_logs_channel", "Private voice control logs"],
  ["level_logs_channel", "Private XP and level logs"],
  ["question_channel", "Daily question channel"],
  ["payout_queue_channel", "Private reward payout queue"]
]);

// Compact templates deliberately create only the channels needed by enabled
// defaults.  Extra modules use existing mapped channels or are enabled later;
// they never produce an empty channel by default.
export const PARADISE_COMMUNITY_SCHEMA = [
  ["━━ BAŞLANGIÇ ━━", ["⌁・başlangıç", "⌁・kurallar", "⌁・hoş-geldin", "⌁・roller"], false],
  ["━━ TOPLULUK ━━", ["┆・duyurular", "┆・genel", "┆・medya", "┆・etkinlikler", "┆・seviyeler"], false],
  ["━━ DESTEK ━━", ["◇・destek"], false],
  ["━━ PERSONEL ━━", ["〢・personel-merkezi", "〢・personel-komutları", "〢・personel-rehberleri", "〢・incelemeler", "〢・transcriptler", "〢・personel-logları"], true],
  ["━━ SESLER ━━", ["◜・oda-oluştur", "◜・topluluk-sesi", "◞・afk"], false],
  ["━━ ÖZEL SESLER ━━", [], false]
];

export const PARADISE_CLAN_SCHEMA = [
  ["━━ BAŞLANGIÇ ━━", ["⌁・başlangıç", "⌁・kurallar", "⌁・hoş-geldin", "⌁・roller"], false],
  ["━━ TOPLULUK ━━", ["┆・duyurular", "┆・genel", "┆・medya", "┆・seviyeler"], false],
  ["━━ SIRALAMA ━━", ["⟡・top-10", "⟡・top-20", "⟡・top-30", "⟡・meydan-okuma", "⟡・müsaitlik-ve-loa"], false],
  ["━━ KLAN OPERASYONLARI ━━", ["◆・aktif-oturumlar", "◆・sonuçlar", "◆・lineuplar", "◆・mainer-kanit"], false],
  ["━━ DESTEK ━━", ["◇・destek"], false],
  ["━━ PERSONEL ━━", ["〢・personel-merkezi", "〢・personel-komutları", "〢・personel-rehberleri", "〢・incelemeler", "〢・transcriptler", "〢・personel-logları"], true],
  ["━━ SESLER ━━", ["◜・oda-oluştur", "◜・savaş-odası", "◜・topluluk-sesi", "◞・afk"], false],
  ["━━ ÖZEL SESLER ━━", [], false]
];

export const PARADISE_TSBTR_SCHEMA = [
  ["━━ BAŞLANGIÇ ━━", ["⌁・başlangıç", "⌁・kurallar", "⌁・hoş-geldin", "⌁・roller"], false],
  ["━━ TOPLULUK ━━", ["┆・duyurular", "┆・genel", "┆・medya", "┆・seviyeler"], false],
  ["━━ RANKED ARENA ━━", ["⟡・top-10", "⟡・top-20", "⟡・top-30", "⟡・meydan-okuma", "⟡・müsaitlik-ve-loa"], false],
  ["━━ OTURUMLAR ━━", ["◆・aktif-oturumlar", "◆・sonuçlar"], false],
  ["━━ DESTEK ━━", ["◇・destek"], false],
  ["━━ PERSONEL ━━", ["〢・personel-merkezi", "〢・personel-komutları", "〢・personel-rehberleri", "〢・incelemeler", "〢・transcriptler", "〢・personel-logları"], true],
  ["━━ SESLER ━━", ["◜・oda-oluştur", "◜・topluluk-sesi", "◞・afk"], false],
  ["━━ ÖZEL SESLER ━━", [], false]
];

const PARADISE_TEMPLATE_CHANNEL_DEFAULTS = Object.freeze({
  community: {
    start_here_channel: "⌁・başlangıç", rules_channel: "⌁・kurallar", welcome_channel: "⌁・hoş-geldin", leave_channel: "⌁・hoş-geldin", roles_channel: "⌁・roller",
    member_help_channel: "┆・genel", level_channel: "┆・seviyeler", faq_channel: "⌁・başlangıç", role_guide_channel: "⌁・roller",
    support_ticket_channel: "◇・destek", application_ticket_channel: "◇・destek", staff_command_guide_channel: "〢・personel-komutları", staff_guides_channel: "〢・personel-rehberleri",
    application_review_channel: "〢・incelemeler", moderation_requests_channel: "〢・incelemeler", quarantine_review_channel: "〢・incelemeler",
    support_transcripts_channel: "〢・transcriptler", challenge_transcripts_channel: "〢・transcriptler",
    support_logs_channel: "〢・personel-logları", application_logs_channel: "〢・personel-logları", moderation_logs_channel: "〢・personel-logları", voice_logs_channel: "〢・personel-logları", level_logs_channel: "〢・personel-logları", blacklist_logs_channel: "〢・personel-logları"
  },
  clan: {
    start_here_channel: "⌁・başlangıç", rules_channel: "⌁・kurallar", welcome_channel: "⌁・hoş-geldin", leave_channel: "⌁・hoş-geldin", roles_channel: "⌁・roller",
    member_help_channel: "┆・genel", level_channel: "┆・seviyeler", faq_channel: "⌁・başlangıç", role_guide_channel: "⌁・roller",
    challenge_channel: "⟡・meydan-okuma", challenge_rules_channel: "⟡・meydan-okuma", challenge_results_channel: "◆・sonuçlar", availability_channel: "⟡・müsaitlik-ve-loa", loa_channel: "⟡・müsaitlik-ve-loa",
    training_channel: "◆・aktif-oturumlar", tryout_channel: "◆・aktif-oturumlar", training_results_channel: "◆・sonuçlar", tryout_results_channel: "◆・sonuçlar",
    main_lineup_channel: "◆・lineuplar", war_lineup_channel: "◆・lineuplar", roster_channel: "◆・lineuplar", mainer_proof_channel: "◆・mainer-kanit",
    support_ticket_channel: "◇・destek", application_ticket_channel: "◇・destek", staff_command_guide_channel: "〢・personel-komutları", staff_guides_channel: "〢・personel-rehberleri",
    application_review_channel: "〢・incelemeler", moderation_requests_channel: "〢・incelemeler", quarantine_review_channel: "〢・incelemeler", bail_appeal_channel: "〢・incelemeler",
    support_transcripts_channel: "〢・transcriptler", challenge_transcripts_channel: "〢・transcriptler",
    support_logs_channel: "〢・personel-logları", application_logs_channel: "〢・personel-logları", moderation_logs_channel: "〢・personel-logları", activity_logs_channel: "〢・personel-logları", voice_logs_channel: "〢・personel-logları", level_logs_channel: "〢・personel-logları", blacklist_logs_channel: "〢・personel-logları", roster_logs_channel: "〢・personel-logları", war_logs_channel: "〢・personel-logları"
  },
  tsbtr: {
    start_here_channel: "⌁・başlangıç", rules_channel: "⌁・kurallar", welcome_channel: "⌁・hoş-geldin", leave_channel: "⌁・hoş-geldin", roles_channel: "⌁・roller",
    member_help_channel: "┆・genel", level_channel: "┆・seviyeler", faq_channel: "⌁・başlangıç", role_guide_channel: "⌁・roller",
    challenge_channel: "⟡・meydan-okuma", challenge_rules_channel: "⟡・meydan-okuma", challenge_results_channel: "◆・sonuçlar", availability_channel: "⟡・müsaitlik-ve-loa", loa_channel: "⟡・müsaitlik-ve-loa",
    training_channel: "◆・aktif-oturumlar", tryout_channel: "◆・aktif-oturumlar", training_results_channel: "◆・sonuçlar", tryout_results_channel: "◆・sonuçlar",
    support_ticket_channel: "◇・destek", application_ticket_channel: "◇・destek", staff_command_guide_channel: "〢・personel-komutları", staff_guides_channel: "〢・personel-rehberleri",
    application_review_channel: "〢・incelemeler", moderation_requests_channel: "〢・incelemeler", quarantine_review_channel: "〢・incelemeler", bail_appeal_channel: "〢・incelemeler",
    support_transcripts_channel: "〢・transcriptler", challenge_transcripts_channel: "〢・transcriptler",
    support_logs_channel: "〢・personel-logları", application_logs_channel: "〢・personel-logları", moderation_logs_channel: "〢・personel-logları", activity_logs_channel: "〢・personel-logları", voice_logs_channel: "〢・personel-logları", level_logs_channel: "〢・personel-logları", blacklist_logs_channel: "〢・personel-logları"
  }
});

export const PARADISE_SETUP_SCHEMAS = Object.freeze({
  community: { label: "Fieel's Community", schema: PARADISE_COMMUNITY_SCHEMA, roles: PARADISE_COMMUNITY_ROLES },
  clan: { label: "Paradise Clan", schema: PARADISE_CLAN_SCHEMA, roles: PARADISE_CLAN_ROLES },
  tsbtr: { label: "TSBTR-style Community", schema: PARADISE_TSBTR_SCHEMA, roles: PARADISE_CLAN_ROLES }
});

const COMMUNITY_HIDDEN_COMMANDS = new Set([
  "challenge", "referee", "lineup", "roster", "mainer", "findfcw", "relation",
  "blacklist", "appeal", "bail", "availability", "tryout", "paradisetraining",
  "whitelist", "handbook", "qotd", "answer"
]);

export function paradiseCommandAllowedForMode(commandName, mode) {
  const name = String(commandName || "");
  const registryRule = paradiseCommandRegistrationAllowed({ command: name, template: mode });
  if (registryRule.known) return registryRule.allowed;
  if (mode === "community") return !COMMUNITY_HIDDEN_COMMANDS.has(name);
  if (mode === "clan" || mode === "tsbtr") return !name.startsWith("fima_");
  return true;
}

export function rankPower({ stage, level, strength }) {
  const s = Number(stage);
  const li = LEVELS.indexOf(String(level));
  const si = STRENGTHS.indexOf(String(strength));
  if (!Number.isInteger(s) || s < 0 || s > 4 || li < 0 || si < 0) throw new Error("invalid_rank");
  return (4 - s) * 9 + li * 3 + si;
}

export function compareRanks(a, b) {
  return Math.sign(rankPower(a) - rankPower(b));
}

export function canAssignRank(staffRank, targetRank) {
  const minimum = rankPower({ stage: 3, level: "Low", strength: "Weak" });
  const target = rankPower(targetRank);
  return target >= minimum && target <= rankPower(staffRank);
}

export function rankToRoleName(rank) {
  rankPower(rank);
  return `Stage ${rank.stage} ${rank.level} ${rank.strength}`;
}

function strongestFighterRank(member) {
  if (!member?.roles?.cache) return null;
  return [...member.roles.cache.values()]
    .map(role => {
      const match = /^Stage ([0-4]) (Low|Mid|High) (Weak|Stable|Strong)$/.exec(role.name);
      return match ? { stage: Number(match[1]), level: match[2], strength: match[3] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => rankPower(b) - rankPower(a))[0] || null;
}

export function meetsMinimumChallengeRank(rank, minimum = { stage: 2, level: "High", strength: "Weak" }) {
  if (!rank) return false;
  return rankPower(rank) >= rankPower(minimum);
}

export function normalizeChallengeGroups(config = {}) {
  const topSize = Math.min(100, Math.max(2, Number(config.topSize) || 30));
  const defaults = [
    { label: "Top 1–10", minRank: 1, maxRank: Math.min(10, topSize), upwardDistance: 1, downwardDistance: 0 },
    ...(topSize > 10 ? [{ label: "Top 11–20", minRank: 11, maxRank: Math.min(20, topSize), upwardDistance: 2, downwardDistance: 0 }] : []),
    ...(topSize > 20 ? [{ label: `Top 21–${topSize}`, minRank: 21, maxRank: topSize, upwardDistance: 3, downwardDistance: 0 }] : [])
  ];
  const input = Array.isArray(config.groups) && config.groups.length ? config.groups : defaults;
  const groups = input.map((group, index) => ({
    label: String(group.label || `Group ${index + 1}`).slice(0, 40),
    minRank: Math.max(1, Number(group.minRank) || 1),
    maxRank: Math.min(topSize, Number(group.maxRank) || topSize),
    upwardDistance: Math.max(0, Math.min(topSize, Number(group.upwardDistance ?? group.distance) || 0)),
    downwardDistance: Math.max(0, Math.min(topSize, Number(group.downwardDistance) || 0)),
    cooldownDays: Math.max(1, Math.min(30, Number(group.cooldownDays) || Number(config.cooldownDays) || 3)),
    immunityDays: Math.max(1, Math.min(30, Number(group.immunityDays) || Number(config.immunityDays) || 3)),
    refereeMinimumRole: String(group.refereeMinimumRole || "Referee").slice(0, 60)
  })).filter(group => group.minRank <= group.maxRank).sort((a, b) => a.minRank - b.minRank);
  const covered = new Set();
  for (const group of groups) {
    for (let rank = group.minRank; rank <= group.maxRank; rank += 1) {
      if (covered.has(rank)) throw new Error("overlapping_challenge_groups");
      covered.add(rank);
    }
  }
  if (covered.size !== topSize) throw new Error("challenge_groups_must_cover_leaderboard");
  return groups;
}

export function challengeTargetSpots(currentSpot, config = {}) {
  const spot = Number(currentSpot);
  const topSize = Math.min(100, Math.max(2, Number(config.topSize) || 30));
  if (!Number.isInteger(spot) || spot < 1 || spot > topSize) return [topSize - 1, topSize];
  let groups;
  try {
    groups = Array.isArray(config.groups) && config.groups.length
      ? normalizeChallengeGroups(config)
      : null;
  } catch {
    groups = null;
  }
  const group = groups?.find(item => spot >= item.minRank && spot <= item.maxRank);
  const upwardDistance = group
    ? group.upwardDistance
    : spot <= 10 ? Math.max(1, Number(config.top10Range) || 1)
      : spot <= 20 ? Math.max(1, Number(config.top20Range) || 2)
        : Math.max(1, Number(config.top30Range) || 3);
  const downwardDistance = group?.downwardDistance || 0;
  const targets = [];
  for (let rank = Math.max(1, spot - upwardDistance); rank < spot; rank += 1) targets.push(rank);
  for (let rank = spot + 1; rank <= Math.min(topSize, spot + downwardDistance); rank += 1) targets.push(rank);
  return [...new Set(targets)];
}

const TEMP_VOICE_BLOCKED_WORDS = [
  "porn", "porno", "sex", "seks", "nude", "nsfw", "hentai", "yarrak", "sik", "amcik", "amcık",
  "orospu", "faggot", "nigger", "nigga", "hitler", "nazi", "token", "cookie"
];

export function sanitizeTemporaryVoiceName(value, fallback = "Private Room") {
  const clean = String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const lowered = clean.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9çğıöşü]+/g, "");
  if (!clean || TEMP_VOICE_BLOCKED_WORDS.some(word => lowered.includes(word.replace(/[^a-z0-9çğıöşü]+/g, "")))) {
    return String(fallback || "Private Room").slice(0, 80);
  }
  return clean;
}

export function normalizedAnswer(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isQuestionAnswerMatch(value, acceptedAnswers = []) {
  const candidate = normalizedAnswer(value);
  return Boolean(candidate) && acceptedAnswers.some(answer => normalizedAnswer(answer) === candidate);
}

export function paradiseCommands() {
  const setupAction = option => option.setName("action").setDescription("Preview, non-destructive repair, or guide repost")
    .addChoices(
      { name: "Preview rebuild", value: "preview" },
      { name: "Repair existing structure", value: "repair" },
      { name: "Repost handbooks only", value: "guides" }
    );
  const rankOptions = (builder) => builder
    .addIntegerOption(o => o.setName("stage").setDescription("0 is best; Stage 5 is unused").setRequired(true)
      .addChoices(...[0, 1, 2, 3, 4].map(value => ({ name: `Stage ${value}`, value }))))
    .addStringOption(o => o.setName("level").setDescription("Rank level").setRequired(true)
      .addChoices(...LEVELS.map(value => ({ name: value, value }))))
    .addStringOption(o => o.setName("strength").setDescription("Rank strength").setRequired(true)
      .addChoices(...STRENGTHS.map(value => ({ name: value, value }))));
  return [
    new SlashCommandBuilder().setName("setupfieels").setDescription("Choose Community, Clan or TSBTR-style safe setup.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder().setName("setupfieelstsbtr").setDescription("Preview, repair or repost the TSBTR-style setup.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addStringOption(setupAction),
    new SlashCommandBuilder().setName("help").setDescription("Open or search the complete Paradise command manual.")
      .addStringOption(option => option.setName("query").setDescription("Optional command or system to search for").setRequired(false)),
    new SlashCommandBuilder().setName("sendlanguagequestion").setDescription("Post English/Turkish language buttons."),
    new SlashCommandBuilder().setName("sendpingroleselector").setDescription("Post Paradise notification-role selector."),
    new SlashCommandBuilder().setName("sendregionroleselector").setDescription("Post Paradise region-role selector."),
    new SlashCommandBuilder().setName("welcome").setDescription("Preview the configured Paradise welcome message.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
      .addSubcommand(s => s.setName("preview").setDescription("Post a safe welcome preview in this channel")),
    new SlashCommandBuilder().setName("leave").setDescription("Preview the configured Paradise leave message.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
      .addSubcommand(s => s.setName("preview").setDescription("Post a safe leave preview in this channel")),
    new SlashCommandBuilder().setName("backupserverstructure").setDescription("Back up channels, roles and permission overwrites.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder().setName("previewserversetup").setDescription("Preview the full Clan/Training rebuild.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder().setName("verifyroblox").setDescription("Verify Roblox ownership with a profile About code.")
      .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true)),
    new SlashCommandBuilder().setName("verifyrobloxcheck").setDescription("Check the short Paradise code in your Roblox About."),
    new SlashCommandBuilder().setName("profile").setDescription("Create or view a verified Paradise fighter profile")
      .setDescriptionLocalizations({ tr: "Doğrulanmış Paradise oyuncu profili oluştur, düzenle veya görüntüle" })
      .addSubcommand(s => s.setName("create").setDescription("Verify Roblox and create your fighter profile"))
      .addSubcommand(s => s.setName("view").setDescription("View a Paradise fighter profile")
        .addUserOption(o => o.setName("user").setDescription("Discord profile owner"))
        .addIntegerOption(o => o.setName("profile_id").setDescription("Paradise profile ID").setMinValue(1))
        .addStringOption(o => o.setName("user_id").setDescription("Discord user ID"))
        .addStringOption(o => o.setName("roblox_name").setDescription("Exact Roblox username"))
        .addStringOption(o => o.setName("query").setDescription("Display name, nickname or Roblox name")))
      .addSubcommand(s => s.setName("edit").setDescription("Edit your profile region without changing Profile ID"))
      .addSubcommand(s => s.setName("verify-status").setDescription("Show your Roblox verification and profile-completion status")),
    new SlashCommandBuilder().setName("tryout").setNameLocalizations({ tr: "deneme" }).setDescription("Paradise tryout system").setDescriptionLocalizations({ tr: "Paradise deneme ve sonuç sistemi" })
      .addSubcommand(s => s.setName("start").setDescription("Start a tryout")
        .addStringOption(o => o.setName("link").setDescription("Roblox private server link").setRequired(true))
        .addBooleanOption(o => o.setName("ping").setDescription("Ping tryout/training members").setRequired(false)))
      .addSubcommand(s => rankOptions(s.setName("result").setDescription("Submit a structured tryout result")
        .addUserOption(o => o.setName("user").setDescription("Verified fighter").setRequired(true)))
        .addStringOption(o => o.setName("note").setDescription("Optional note").setRequired(false))),
    new SlashCommandBuilder().setName("challenge").setNameLocalizations({ tr: "meydan-okuma" }).setDescription("Verified Paradise challenge system").setDescriptionLocalizations({ tr: "Doğrulanmış Paradise meydan okuma sistemi" })
      .addSubcommand(s => s.setName("create").setDescription("Create a verified challenge ticket")
        .addUserOption(o => o.setName("opponent").setDescription("Verified opponent; omit to choose from eligible ranks"))
        .addStringOption(o => o.setName("region").setDescription("Match region").setRequired(false)
          .addChoices(...["Paris", "London", "Amsterdam", "Frankfurt"].map(value => ({ name: value, value })))))
      .addSubcommand(s => s.setName("result").setDescription("Submit a challenge result for approval")
        .addUserOption(o => o.setName("winner").setDescription("Winner").setRequired(true))
        .addUserOption(o => o.setName("loser").setDescription("Loser").setRequired(true))
        .addStringOption(o => o.setName("score").setDescription("Score, e.g. 10-4 or Auto").setRequired(true)))
      .addSubcommand(s => s.setName("post").setDescription("Post a referee score for manager approval")
        .addUserOption(o => o.setName("winner").setDescription("Winner").setRequired(true))
        .addUserOption(o => o.setName("loser").setDescription("Loser").setRequired(true))
        .addStringOption(o => o.setName("score").setDescription("Score, e.g. 10-5 or Auto").setRequired(true))
        .addIntegerOption(o => o.setName("winner_spot").setDescription("Winner leaderboard spot").setMinValue(1).setMaxValue(30))
        .addIntegerOption(o => o.setName("loser_spot").setDescription("Loser leaderboard spot").setMinValue(1).setMaxValue(30))
        .addStringOption(o => o.setName("note").setDescription("Optional referee note"))
        .addStringOption(o => o.setName("ticket_id").setDescription("Challenge ticket ID")))
      .addSubcommand(s => s.setName("autowin").setDescription("Submit an in-ticket automatic win for approval")
        .addUserOption(o => o.setName("winner").setDescription("Automatic winner").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Dodged, no-show, invalid, disqualified or other").setRequired(true)
          .addChoices(
            { name: "Dodged", value: "dodged" },
            { name: "No-show", value: "no-show" },
            { name: "Invalid challenge", value: "invalid" },
            { name: "Disqualified", value: "disqualified" },
            { name: "Closed by staff", value: "closed" }
          ))
        .addStringOption(o => o.setName("note").setDescription("Optional staff note")))
      .addSubcommand(s => s.setName("close").setDescription("Close this challenge and remove player access")
        .addStringOption(o => o.setName("reason").setDescription("Closure reason").setRequired(true))),
    new SlashCommandBuilder().setName("paradisetraining").setNameLocalizations({ tr: "antrenman" }).setDescription("Paradise training lifecycle").setDescriptionLocalizations({ tr: "Paradise antrenman başlatma ve bitirme sistemi" })
      .addSubcommand(s => s.setName("start").setDescription("Start training")
        .addStringOption(o => o.setName("link").setDescription("Roblox private server link").setRequired(true))
        .addStringOption(o => o.setName("rules").setDescription("Extra rules").setRequired(false)))
      .addSubcommand(s => s.setName("end").setDescription("End training")
        .addStringOption(o => o.setName("score").setDescription("Score, e.g. 3-1").setRequired(true))
        .addStringOption(o => o.setName("winner").setDescription("Red, Blue or team name").setRequired(true))),
    new SlashCommandBuilder().setName("training").setDescription("Paradise training setup, start and result")
      .setDescriptionLocalizations({ tr: "Paradise eğitim kurulum, başlatma ve sonuç sistemi" })
      .addSubcommand(s => s.setName("setup").setDescription("Post the training help and announcement panel"))
      .addSubcommand(s => s.setName("create").setDescription("Create a training session with a plain Markdown announcement")
        .addStringOption(o => o.setName("link").setDescription("Roblox private server link").setRequired(true))
        .addUserOption(o => o.setName("host").setDescription("Host; defaults to you"))
        .addUserOption(o => o.setName("cohost").setDescription("Optional co-host"))
        .addStringOption(o => o.setName("rules").setDescription("Optional extra rules")))
      .addSubcommand(s => s.setName("start").setDescription("Start a branded training session")
        .addStringOption(o => o.setName("link").setDescription("Roblox private server link").setRequired(true))
        .addUserOption(o => o.setName("host").setDescription("Host; defaults to you"))
        .addUserOption(o => o.setName("cohost").setDescription("Optional co-host"))
        .addStringOption(o => o.setName("rules").setDescription("Optional extra rules")))
      .addSubcommand(s => s.setName("result").setDescription("End your active training and post its result")
        .addStringOption(o => o.setName("score").setDescription("Score, e.g. 3-1").setRequired(true))
        .addStringOption(o => o.setName("winner").setDescription("Red, Blue or team name").setRequired(true))
        .addStringOption(o => o.setName("mvps").setDescription("Mention MVPs or list names"))
        .addStringOption(o => o.setName("note").setDescription("Result note"))
        .addStringOption(o => o.setName("proof").setDescription("Proof image or message URL"))),
    new SlashCommandBuilder().setName("tournament").setNameLocalizations({ tr: "turnuva" }).setDescription("Paradise tournament system").setDescriptionLocalizations({ tr: "Paradise turnuva sistemi" })
      .addSubcommand(s => s.setName("start-simple").setDescription("Start a simple tournament")
        .addStringOption(o => o.setName("title").setDescription("Tournament title").setRequired(true))
        .addStringOption(o => o.setName("link").setDescription("Roblox server link").setRequired(true))
        .addStringOption(o => o.setName("rules").setDescription("Tournament rules"))
        .addStringOption(o => o.setName("prize").setDescription("Optional prize")))
      .addSubcommand(s => s.setName("result-simple").setDescription("Post a simple tournament winner")
        .addUserOption(o => o.setName("winner").setDescription("Winner").setRequired(true))
        .addStringOption(o => o.setName("proof").setDescription("Proof link").setRequired(true)))
      .addSubcommand(s => s.setName("create-bracket").setDescription("Create a stored elimination bracket")
        .addStringOption(o => o.setName("title").setDescription("Tournament title").setRequired(true))
        .addStringOption(o => o.setName("participants").setDescription("Comma-separated Discord user IDs").setRequired(true))
        .addStringOption(o => o.setName("link").setDescription("Roblox server link").setRequired(true)))
      .addSubcommand(s => s.setName("match-result").setDescription("Advance a bracket winner")
        .addStringOption(o => o.setName("tournament_id").setDescription("Tournament ID").setRequired(true))
        .addIntegerOption(o => o.setName("match").setDescription("Match number").setRequired(true).setMinValue(1))
        .addUserOption(o => o.setName("winner").setDescription("Match winner").setRequired(true))),
    new SlashCommandBuilder().setName("giveaway").setNameLocalizations({ tr: "cekilis" }).setDescription("Paradise giveaway operations").setDescriptionLocalizations({ tr: "Paradise çekiliş işlemleri" })
      .addSubcommand(s => s.setName("create").setDescription("Create a giveaway")
        .addStringOption(o => o.setName("prize").setDescription("Prize").setRequired(true))
        .addIntegerOption(o => o.setName("minutes").setDescription("Duration in minutes").setRequired(true).setMinValue(1).setMaxValue(43200))
        .addIntegerOption(o => o.setName("winners").setDescription("Winner count").setMinValue(1).setMaxValue(20))
        .addStringOption(o => o.setName("requirements").setDescription("Entry requirements"))),
    new SlashCommandBuilder().setName("gamenight").setNameLocalizations({ tr: "oyun-gecesi" }).setDescription("Paradise game night operations").setDescriptionLocalizations({ tr: "Paradise oyun gecesi işlemleri" })
      .addSubcommand(s => s.setName("start").setDescription("Start a game night")
        .addStringOption(o => o.setName("game").setDescription("Game name").setRequired(true))
        .addStringOption(o => o.setName("link").setDescription("Game/server link").setRequired(true))
        .addAttachmentOption(o => o.setName("image").setDescription("Game image").setRequired(true))
        .addStringOption(o => o.setName("notes").setDescription("Rules or notes"))),
    new SlashCommandBuilder().setName("event").setNameLocalizations({ tr: "etkinlik" }).setDescription("Paradise event operations").setDescriptionLocalizations({ tr: "Paradise etkinlik işlemleri" })
      .addSubcommand(s => s.setName("create").setDescription("Create an event")
        .addStringOption(o => o.setName("title").setDescription("Event title").setRequired(true))
        .addStringOption(o => o.setName("time").setDescription("Time or Discord timestamp").setRequired(true))
        .addAttachmentOption(o => o.setName("image").setDescription("Event image").setRequired(true))
        .addStringOption(o => o.setName("link").setDescription("Optional link"))
        .addStringOption(o => o.setName("rules").setDescription("Rules or details"))),
    new SlashCommandBuilder().setName("referee").setNameLocalizations({ tr: "hakem" }).setDescription("Paradise referee operations").setDescriptionLocalizations({ tr: "Paradise hakem işlemleri" })
      .addSubcommand(s => s.setName("guide").setDescription("Show the referee command and rules guide"))
      .addSubcommand(s => s.setName("works").setDescription("Show your weekly referee activity")),
    new SlashCommandBuilder().setName("activity").setNameLocalizations({ tr: "aktivite" }).setDescription("Staff activity and attendance").setDescriptionLocalizations({ tr: "Personel aktivite ve yoklama sistemi" })
      .addSubcommand(s => s.setName("check").setDescription("Start a 24-hour staff activity check")
        .addStringOption(o => o.setName("group").setDescription("Staff group").setRequired(true)
          .addChoices(...["Referee", "Tryout", "Training", "Event", "Tournament", "Giveaway", "Game Night"].map(value => ({ name: value, value })))))
      .addSubcommand(s => s.setName("summary").setDescription("Show weekly quota results")),
    new SlashCommandBuilder().setName("whitelist").setNameLocalizations({ tr: "muafiyet" }).setDescription("Manage temporary activity-check exemptions").setDescriptionLocalizations({ tr: "Geçici aktivite muafiyetlerini yönet" })
      .addSubcommand(s => s.setName("add").setDescription("Whitelist a staff member")
        .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true))
        .addStringOption(o => o.setName("group").setDescription("Staff group").setRequired(true))
        .addIntegerOption(o => o.setName("days").setDescription("Days; omit for unlimited").setMinValue(1).setMaxValue(365)))
      .addSubcommand(s => s.setName("remove").setDescription("Remove a whitelist")
        .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true)))
      .addSubcommand(s => s.setName("list").setDescription("List active whitelists")),
    new SlashCommandBuilder().setName("mainer").setDescription("Paradise clan mainer code and guide")
      .addSubcommand(s => s.setName("set").setDescription("Set the official clan mainer code")
        .addStringOption(o => o.setName("code").setDescription("TSBCC clan mainer code").setRequired(true)))
      .addSubcommand(s => s.setName("guide").setDescription("Show the current maining guide")),
    new SlashCommandBuilder().setName("report").setNameLocalizations({ tr: "rapor" }).setDescription("Report a staff member or hoster privately").setDescriptionLocalizations({ tr: "Personel veya hosteri özel olarak raporla" })
      .addSubcommand(s => s.setName("staff").setDescription("Open a private staff report")
        .addUserOption(o => o.setName("user").setDescription("Reported staff member").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("What happened").setRequired(true))
        .addStringOption(o => o.setName("proof").setDescription("Optional proof link"))),
    new SlashCommandBuilder().setName("findfcw").setNameLocalizations({ tr: "fcw-bul" }).setDescription("Find an opt-in clan war opponent.").setDescriptionLocalizations({ tr: "İzinli havuzdan FCW rakibi bul" })
      .addStringOption(o => o.setName("region").setDescription("EU, NA, AS, SA or OCE").setRequired(true))
      .addStringOption(o => o.setName("format").setDescription("Requested format, e.g. 5v5 FT3")),
    new SlashCommandBuilder().setName("commandchannel").setDescription("Configure where Paradise commands can run")
      .addSubcommand(s => s.setName("add").setDescription("Allow a command in this channel")
        .addStringOption(o => o.setName("command").setDescription("Command name without /").setRequired(true)))
      .addSubcommand(s => s.setName("remove").setDescription("Remove this channel from a command")
        .addStringOption(o => o.setName("command").setDescription("Command name without /").setRequired(true)))
      .addSubcommand(s => s.setName("list").setDescription("List command-channel restrictions")),
    new SlashCommandBuilder().setName("sticky").setDescription("Manage a repeating channel guide message")
      .addSubcommand(s => s.setName("set").setDescription("Set the sticky message for this channel")
        .addStringOption(o => o.setName("text").setDescription("Sticky text").setRequired(true).setMaxLength(1800)))
      .addSubcommand(s => s.setName("remove").setDescription("Remove this channel's sticky message"))
      .addSubcommand(s => s.setName("list").setDescription("List configured sticky channels")),
    new SlashCommandBuilder().setName("branding").setDescription("Configure Paradise embed appearance")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addSubcommand(s => s.setName("color").setDescription("Set the embed side-accent color")
        .addStringOption(o => o.setName("hex").setDescription("Six-digit HEX color, e.g. #000000").setRequired(true)))
      .addSubcommand(s => s.setName("preview").setDescription("Preview Paradise typography and symbols")),
    new SlashCommandBuilder().setName("relation").setDescription("Manage the Paradise ally and enemy clan board")
      .addSubcommand(s => s.setName("add").setDescription("Add an ally or enemy clan")
        .addStringOption(o => o.setName("type").setDescription("Relationship type").setRequired(true)
          .addChoices({ name: "Ally", value: "ally" }, { name: "Enemy", value: "enemy" }))
        .addStringOption(o => o.setName("clan").setDescription("Clan name").setRequired(true).setMaxLength(80))
        .addUserOption(o => o.setName("representative").setDescription("Clan representative"))
        .addStringOption(o => o.setName("invite").setDescription("Optional Discord invite"))
        .addStringOption(o => o.setName("note").setDescription("Optional note").setMaxLength(250)))
      .addSubcommand(s => s.setName("remove").setDescription("Remove a clan relationship")
        .addStringOption(o => o.setName("type").setDescription("Relationship type").setRequired(true)
          .addChoices({ name: "Ally", value: "ally" }, { name: "Enemy", value: "enemy" }))
        .addStringOption(o => o.setName("clan").setDescription("Clan name").setRequired(true)))
      .addSubcommand(s => s.setName("edit").setDescription("Edit an existing ally or enemy record")
        .addStringOption(o => o.setName("type").setDescription("Relationship type").setRequired(true)
          .addChoices({ name: "Ally", value: "ally" }, { name: "Enemy", value: "enemy" }))
        .addStringOption(o => o.setName("clan").setDescription("Existing clan name").setRequired(true))
        .addUserOption(o => o.setName("representative").setDescription("Updated representative"))
        .addStringOption(o => o.setName("invite").setDescription("Updated Discord invite"))
        .addStringOption(o => o.setName("note").setDescription("Updated note").setMaxLength(250))
        .addStringOption(o => o.setName("status").setDescription("Relationship status").setMaxLength(80)))
      .addSubcommand(s => s.setName("panel").setDescription("Refresh the ally and enemy clan board")),
    new SlashCommandBuilder().setName("availability").setDescription("Challenge cooldown, immunity and open-ticket board")
      .addSubcommand(s => s.setName("panel").setDescription("Refresh the challenge availability board"))
      .addSubcommand(s => s.setName("cooldown").setDescription("Set a player's challenge cooldown")
        .addUserOption(o => o.setName("user").setDescription("Player").setRequired(true))
        .addIntegerOption(o => o.setName("hours").setDescription("Duration in hours").setRequired(true).setMinValue(1).setMaxValue(720))
        .addIntegerOption(o => o.setName("rank").setDescription("Leaderboard rank").setMinValue(1).setMaxValue(30)))
      .addSubcommand(s => s.setName("immunity").setDescription("Set a player's challenge immunity")
        .addUserOption(o => o.setName("user").setDescription("Player").setRequired(true))
        .addIntegerOption(o => o.setName("hours").setDescription("Duration in hours").setRequired(true).setMinValue(1).setMaxValue(720))
        .addIntegerOption(o => o.setName("rank").setDescription("Leaderboard rank").setMinValue(1).setMaxValue(30)))
      .addSubcommand(s => s.setName("clear").setDescription("Clear cooldown or immunity")
        .addUserOption(o => o.setName("user").setDescription("Player").setRequired(true))
        .addStringOption(o => o.setName("type").setDescription("Entry to clear").setRequired(true)
          .addChoices({ name: "Cooldown", value: "cooldown" }, { name: "Immunity", value: "immunity" }))),
    new SlashCommandBuilder().setName("loa").setDescription("Staff leave-of-absence system")
      .setDescriptionLocalizations({ tr: "Yetkili izin ve LOA yönetim sistemi" })
      .addSubcommand(s => s.setName("request").setDescription("Request a leave of absence")
        .addIntegerOption(o => o.setName("days").setDescription("LOA duration").setRequired(true).setMinValue(1).setMaxValue(90))
        .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(500))
        .addStringOption(o => o.setName("evidence").setDescription("Optional evidence URL")))
      .addSubcommand(s => s.setName("end").setDescription("End your active LOA early"))
      .addSubcommand(s => s.setName("add").setDescription("Manager: add an approved LOA for a staff member")
        .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true))
        .addIntegerOption(o => o.setName("days").setDescription("LOA duration").setRequired(true).setMinValue(1).setMaxValue(365))
        .addStringOption(o => o.setName("note").setDescription("LOA note").setRequired(true).setMaxLength(500))
        .addStringOption(o => o.setName("evidence").setDescription("Optional evidence URL")))
      .addSubcommand(s => s.setName("approve").setDescription("Manager: approve a pending LOA")
        .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true)))
      .addSubcommand(s => s.setName("deny").setDescription("Manager: deny a pending LOA")
        .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Denial reason").setRequired(true)))
      .addSubcommand(s => s.setName("remove").setDescription("Manager: remove or end a LOA")
        .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Removal reason")))
      .addSubcommand(s => s.setName("panel").setDescription("Refresh the active LOA board")),
    new SlashCommandBuilder().setName("lineup").setDescription("Manage Paradise main and war lineup boards")
      .addSubcommand(s => s.setName("add").setDescription("Add a member to a lineup")
        .addStringOption(o => o.setName("board").setDescription("Lineup board").setRequired(true).addChoices({ name: "Main lineup", value: "main" }, { name: "War lineup", value: "war" }))
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addIntegerOption(o => o.setName("position").setDescription("Optional display position").setMinValue(1).setMaxValue(50))
        .addStringOption(o => o.setName("role").setDescription("Lineup duty or role").setMaxLength(80))
        .addStringOption(o => o.setName("note").setDescription("Optional private-safe board note").setMaxLength(160)))
      .addSubcommand(s => s.setName("remove").setDescription("Remove a member from a lineup")
        .addStringOption(o => o.setName("board").setDescription("Lineup board").setRequired(true).addChoices({ name: "Main lineup", value: "main" }, { name: "War lineup", value: "war" }))
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)))
      .addSubcommand(s => s.setName("move").setDescription("Move a lineup member")
        .addStringOption(o => o.setName("board").setDescription("Lineup board").setRequired(true).addChoices({ name: "Main lineup", value: "main" }, { name: "War lineup", value: "war" }))
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addIntegerOption(o => o.setName("position").setDescription("New display position").setRequired(true).setMinValue(1).setMaxValue(50)))
      .addSubcommand(s => s.setName("edit").setDescription("Edit a lineup member's role or note")
        .addStringOption(o => o.setName("board").setDescription("Lineup board").setRequired(true).addChoices({ name: "Main lineup", value: "main" }, { name: "War lineup", value: "war" }))
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addStringOption(o => o.setName("role").setDescription("Updated lineup duty or role").setMaxLength(80))
        .addStringOption(o => o.setName("note").setDescription("Updated board note").setMaxLength(160)))
      .addSubcommand(s => s.setName("clear").setDescription("Clear one lineup slot by position")
        .addStringOption(o => o.setName("board").setDescription("Lineup board").setRequired(true).addChoices({ name: "Main lineup", value: "main" }, { name: "War lineup", value: "war" }))
        .addIntegerOption(o => o.setName("position").setDescription("Slot to clear").setRequired(true).setMinValue(1).setMaxValue(50)))
      .addSubcommand(s => s.setName("panel").setDescription("Refresh a lineup board")
        .addStringOption(o => o.setName("board").setDescription("Lineup board").setRequired(true).addChoices({ name: "Main lineup", value: "main" }, { name: "War lineup", value: "war" })))
      .addSubcommand(s => s.setName("repost").setDescription("Update the existing lineup board in place")
        .addStringOption(o => o.setName("board").setDescription("Lineup board").setRequired(true).addChoices({ name: "Main lineup", value: "main" }, { name: "War lineup", value: "war" }))),
    new SlashCommandBuilder().setName("roster").setDescription("Manage the Paradise competitive roster")
      .addSubcommand(s => s.setName("add").setDescription("Add or update a roster member")
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addStringOption(o => o.setName("region").setDescription("Region").setRequired(true).addChoices({ name: "EU", value: "EU" }, { name: "NA", value: "NA" }, { name: "AS", value: "AS" }, { name: "SA", value: "SA" }, { name: "OCE", value: "OCE" }))
        .addStringOption(o => o.setName("rank").setDescription("Competitive rank or duty").setMaxLength(80))
        .addStringOption(o => o.setName("main").setDescription("Main character or role").setMaxLength(80))
        .addStringOption(o => o.setName("note").setDescription("Optional roster note").setMaxLength(160)))
      .addSubcommand(s => s.setName("update").setDescription("Update an existing roster member")
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addStringOption(o => o.setName("region").setDescription("Updated region").addChoices({ name: "EU", value: "EU" }, { name: "NA", value: "NA" }, { name: "AS", value: "AS" }, { name: "SA", value: "SA" }, { name: "OCE", value: "OCE" }))
        .addStringOption(o => o.setName("rank").setDescription("Updated competitive rank or duty").setMaxLength(80))
        .addStringOption(o => o.setName("main").setDescription("Updated main character or role").setMaxLength(80))
        .addStringOption(o => o.setName("note").setDescription("Updated roster note").setMaxLength(160)))
      .addSubcommand(s => s.setName("remove").setDescription("Remove a roster member")
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)))
      .addSubcommand(s => s.setName("panel").setDescription("Refresh the roster board"))
      .addSubcommand(s => s.setName("repost").setDescription("Update the existing roster board in place")),
    new SlashCommandBuilder().setName("blacklist").setDescription("Manage blacklist, appeal and owner-approved bail workflows")
      .addSubcommand(s => s.setName("add").setDescription("Add an audited blacklist record")
        .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(500))
        .addStringOption(o => o.setName("evidence").setDescription("Evidence URL")))
      .addSubcommand(s => s.setName("remove").setDescription("Resolve and remove a blacklist record")
        .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Resolution reason").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("status").setDescription("Privately check a user's blacklist status")
        .addUserOption(o => o.setName("user").setDescription("User; defaults to you")))
      .addSubcommand(s => s.setName("appeal-panel").setDescription("Post or refresh the appeal information panel"))
      .addSubcommand(s => s.setName("panel").setDescription("Refresh the public blacklist board")),
    new SlashCommandBuilder().setName("appeal").setDescription("Open or review a private Paradise blacklist appeal")
      .addSubcommand(s => s.setName("open").setDescription("Open your private blacklist appeal")
        .addStringOption(o => o.setName("reason").setDescription("Why the record should be reviewed").setRequired(true).setMaxLength(700))
        .addStringOption(o => o.setName("evidence").setDescription("Optional evidence URL").setMaxLength(500)))
      .addSubcommand(s => s.setName("approve").setDescription("Manager: approve an appeal")
        .addUserOption(o => o.setName("user").setDescription("Appealing user").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Decision note").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("deny").setDescription("Manager: deny an appeal")
        .addUserOption(o => o.setName("user").setDescription("Appealing user").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Decision note").setRequired(true).setMaxLength(500))),
    new SlashCommandBuilder().setName("bail").setDescription("Owner-managed blacklist bail review; never automatic")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
      .addSubcommand(s => s.setName("offer").setDescription("Create an owner-approved bail condition")
        .addUserOption(o => o.setName("user").setDescription("Blacklisted user").setRequired(true))
        .addStringOption(o => o.setName("condition").setDescription("Amount or non-payment condition").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("resolve").setDescription("Mark an offer resolved; does not auto-unblacklist")
        .addUserOption(o => o.setName("user").setDescription("Blacklisted user").setRequired(true))
        .addStringOption(o => o.setName("note").setDescription("Resolution note").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("deny").setDescription("Deny or cancel a bail offer")
        .addUserOption(o => o.setName("user").setDescription("Blacklisted user").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Decision reason").setRequired(true).setMaxLength(500))),
    new SlashCommandBuilder().setName("qotd").setDescription("Manage the clan-only daily question and 25 Robux claim")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
      .addSubcommand(s => s.setName("post").setDescription("Post today's question now for testing"))
      .addSubcommand(s => s.setName("status").setDescription("Show today's question status privately"))
      .addSubcommand(s => s.setName("cancel").setDescription("Cancel today's unanswered question")),
    new SlashCommandBuilder().setName("answer").setDescription("Answer today's Paradise clan question")
      .addStringOption(o => o.setName("answer").setDescription("Your answer").setRequired(true).setMaxLength(120)),
    new SlashCommandBuilder().setName("application").setDescription("Paradise application forms and review queue")
      .addSubcommand(s => s.setName("panel").setDescription("Post the application launcher panel"))
      .addSubcommand(s => s.setName("apply").setDescription("Open an application form")
        .addStringOption(o => o.setName("type").setDescription("Application type").setRequired(true)
          .addChoices(...APPLICATION_TYPES.map(([value, name]) => ({ name, value })))))
      .addSubcommand(s => s.setName("status").setDescription("View your latest application status")),
    new SlashCommandBuilder().setName("mod").setDescription("Paradise moderation cases and approval queue")
      .addSubcommand(s => s.setName("warn").setDescription("Record a staff warning")
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("mute").setDescription("Timeout a member within your authority")
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(500))
        .addStringOption(o => o.setName("preset").setDescription("Optional policy preset with a recommended duration")
          .addChoices(
            { name: "Spam · 10 minutes", value: "spam" },
            { name: "Toxicity · 60 minutes", value: "toxicity" },
            { name: "Harassment · 180 minutes", value: "harassment" },
            { name: "Scam attempt · 1440 minutes", value: "scam" },
            { name: "Raid disruption · 10080 minutes", value: "raid" }
          ))
        .addIntegerOption(o => o.setName("minutes").setDescription("Custom timeout minutes; required without a preset").setMinValue(1).setMaxValue(40320)))
      .addSubcommand(s => s.setName("kick-request").setDescription("Request a senior-approved kick")
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Reason and evidence summary").setRequired(true).setMaxLength(750)))
      .addSubcommand(s => s.setName("ban-request").setDescription("Request a senior-approved ban")
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Reason and evidence summary").setRequired(true).setMaxLength(750)))
      .addSubcommand(s => s.setName("quarantine").setDescription("Move a suspicious member into quarantine")
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("unquarantine").setDescription("Release a reviewed member")
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Review note").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("lockdown").setDescription("Enable or disable channel lockdown")
        .addBooleanOption(o => o.setName("enabled").setDescription("Lock this channel").setRequired(true)))
      .addSubcommand(s => s.setName("raidmode").setDescription("Enable or disable safe raid mode")
        .addBooleanOption(o => o.setName("enabled").setDescription("Raid mode").setRequired(true)))
      .addSubcommand(s => s.setName("case").setDescription("View a moderation case")
        .addStringOption(o => o.setName("id").setDescription("Case ID").setRequired(true)))
      .addSubcommand(s => s.setName("approve").setDescription("Senior: approve a pending kick/ban request")
        .addStringOption(o => o.setName("id").setDescription("Case ID").setRequired(true)))
      .addSubcommand(s => s.setName("deny").setDescription("Senior: deny a pending kick/ban request")
        .addStringOption(o => o.setName("id").setDescription("Case ID").setRequired(true))),
    new SlashCommandBuilder().setName("modcase").setDescription("Review Paradise moderation case history")
      .addSubcommand(s => s.setName("user").setDescription("Show recent cases for a member")
        .addUserOption(o => o.setName("user").setDescription("Moderated member").setRequired(true)))
      .addSubcommand(s => s.setName("staff").setDescription("Show recent cases created by a staff member")
        .addUserOption(o => o.setName("staff").setDescription("Staff member").setRequired(true)))
      .addSubcommand(s => s.setName("weekly").setDescription("Show this server's seven-day moderation summary")),
    new SlashCommandBuilder().setName("moderation").setDescription("Paradise moderation statistics")
      .addSubcommand(s => s.setName("stats").setDescription("Show seven-day and all-time moderation counts")),
    new SlashCommandBuilder().setName("security").setDescription("Paradise security and quarantine controls")
      .addSubcommand(s => s.setName("panel").setDescription("Post the security status panel"))
      .addSubcommand(s => s.setName("quarantine").setDescription("Show quarantine status"))
      .addSubcommand(s => s.setName("automod").setDescription("Show active AutoMod policy")),
    new SlashCommandBuilder().setName("rank").setDescription("Show Paradise chat and voice XP")
      .addUserOption(o => o.setName("user").setDescription("Member; defaults to you")),
    new SlashCommandBuilder().setName("leaderboard").setDescription("Paradise XP and ranked leaderboard operations")
      .addSubcommand(s => s.setName("show").setDescription("Show an XP leaderboard")
        .addStringOption(o => o.setName("type").setDescription("Leaderboard type")
          .addChoices(
            { name: "Total", value: "total" }, { name: "Chat", value: "chat" },
            { name: "Voice", value: "voice" }, { name: "Weekly", value: "weekly" },
            { name: "Monthly", value: "monthly" }
          )))
      .addSubcommand(s => s.setName("add").setDescription("Add a fighter to the ranked leaderboard")
        .addUserOption(o => o.setName("user").setDescription("Fighter").setRequired(true))
        .addIntegerOption(o => o.setName("rank").setDescription("Leaderboard position").setRequired(true).setMinValue(1).setMaxValue(100)))
      .addSubcommand(s => s.setName("remove").setDescription("Remove a fighter from the ranked leaderboard")
        .addUserOption(o => o.setName("user").setDescription("Fighter").setRequired(true)))
      .addSubcommand(s => s.setName("move").setDescription("Move a fighter to an empty position")
        .addUserOption(o => o.setName("user").setDescription("Fighter").setRequired(true))
        .addIntegerOption(o => o.setName("rank").setDescription("New position").setRequired(true).setMinValue(1).setMaxValue(100)))
      .addSubcommand(s => s.setName("swap").setDescription("Swap two fighters")
        .addUserOption(o => o.setName("user1").setDescription("First fighter").setRequired(true))
        .addUserOption(o => o.setName("user2").setDescription("Second fighter").setRequired(true)))
      .addSubcommand(s => s.setName("repost").setDescription("Update Top 10/20/30 boards in place"))
      .addSubcommand(s => s.setName("panel").setDescription("Post or update Top 10/20/30 boards"))
      .addSubcommand(s => s.setName("export").setDescription("Export ranked leaderboard JSON privately"))
      .addSubcommand(s => s.setName("import").setDescription("Import ranked leaderboard JSON")
        .addStringOption(o => o.setName("json").setDescription("Array of {userId,rank}").setRequired(true).setMaxLength(4000))),
    (() => {
      const command = new SlashCommandBuilder().setName("set").setDescription("Map Paradise systems to Discord channels")
        .setDescriptionLocalizations({ tr: "Paradise sistemlerini Discord kanallarına eşle" });
      command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
      for (const [name, description] of PARADISE_CHANNEL_MAPPINGS.slice(0, 25)) {
        command.addSubcommand(subcommand => subcommand.setName(name).setDescription(description)
          .addChannelOption(option => option.setName("channel").setDescription(description).addChannelTypes(ChannelType.GuildText).setRequired(true)));
      }
      return command;
    })(),
    (() => {
      const command = new SlashCommandBuilder().setName("setlogchannel").setDescription("Map Paradise appeal, bail and private log channels")
        .setDescriptionLocalizations({ tr: "Paradise itiraz, bail ve özel log kanallarını eşle" });
      command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
      for (const [name, description] of PARADISE_CHANNEL_MAPPINGS.slice(25)) {
        command.addSubcommand(subcommand => subcommand.setName(name).setDescription(description)
          .addChannelOption(option => option.setName("channel").setDescription(description).addChannelTypes(ChannelType.GuildText).setRequired(true)));
      }
      return command;
    })(),
    new SlashCommandBuilder().setName("handbook").setDescription("Post or regenerate Paradise guide panels")
      .setDescriptionLocalizations({ tr: "Paradise rehber panellerini gönder veya yenile" })
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addSubcommand(s => s.setName("post").setDescription("Post all guides for a setup template")
        .addStringOption(o => o.setName("template").setDescription("Guide family").setRequired(true)
          .addChoices(
            { name: "Fieel's Community", value: "community" },
            { name: "Paradise Clan", value: "clan" },
            { name: "TSBTR-style", value: "tsbtr" }
          ))),
    new SlashCommandBuilder().setName("paradisehelp").setDescription("Show private English/Turkish command guidance.")
  ];
}

export async function initializeParadise(client) {
  await saveState(state => {
    if (state.config.blackThemeVersion !== 1) {
      state.config.brandColor = DEFAULT_PARADISE_BRAND_COLOR;
      state.config.blackThemeVersion = 1;
      state.config.blackThemeAppliedAt = new Date().toISOString();
    }
    state.config.footerBrand = String(state.config.footerBrand || DEFAULT_PARADISE_FOOTER_BRAND).trim() || DEFAULT_PARADISE_FOOTER_BRAND;
    return state;
  });
  if (client.user?.username !== "Paradise") {
    await client.user.setUsername("Paradise").catch(error => {
      console.warn("Paradise bot username update failed", { message: error.message });
    });
  }
  for (const guild of client.guilds.cache.values()) {
    await saveState(state => {
      state.guildConfigs[guild.id] = state.guildConfigs[guild.id] || structuredClone(state.config || {});
      state.guildConfigs[guild.id].footerBrand = String(state.guildConfigs[guild.id].footerBrand || DEFAULT_PARADISE_FOOTER_BRAND).trim() || DEFAULT_PARADISE_FOOTER_BRAND;
      return state;
    });
    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (me && me.nickname !== "Paradise") await me.setNickname("Paradise", "Paradise managed server identity").catch(() => {});
    await paradiseGuildContext.run(guild.id, () => runParadiseMaintenance(guild)).catch(() => {});
    const timer = setInterval(() => paradiseGuildContext.run(guild.id, () => runParadiseMaintenance(guild)).catch(() => {}), 15 * 60_000);
    timer.unref?.();
  }
}

function isOwner(interaction) {
  return interaction.guild?.ownerId === interaction.user.id;
}

async function writeArtifact(name, data) {
  const dir = path.resolve(process.cwd(), "artifacts", "post-security-backlog");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function loadProfileStore() {
  return (await loadState()).profiles;
}

async function saveVerifiedProfile(discordId, profile) {
  let saved = null;
  await saveState(state => {
    const existing = state.profiles[discordId] || {};
    saved = {
      ...existing,
      ...profile,
      discordUserId: discordId,
      createdAt: existing.createdAt || profile.verifiedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.profiles[discordId] = saved;
    return state;
  });
  await writeArtifact("3a59-verified-roblox-profiles.json", (await loadState()).profiles);
  return saved;
}

async function snapshotGuild(guild) {
  await guild.channels.fetch();
  await guild.roles.fetch();
  return {
    capturedAt: new Date().toISOString(), guildId: guild.id, guildName: guild.name,
    channels: [...guild.channels.cache.values()].map(c => ({
      id: c.id, name: c.name, type: c.type, parentId: c.parentId,
      position: c.rawPosition, permissionOverwrites: [...c.permissionOverwrites.cache.values()].map(p => p.toJSON())
    })),
    roles: [...guild.roles.cache.values()].map(r => ({
      id: r.id, name: r.name, position: r.position, color: r.color, permissions: r.permissions.bitfield.toString(), managed: r.managed
    }))
  };
}

async function setupChooser(interaction) {
  if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("paradise_setup_select:community").setLabel("Fieel's Community").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("paradise_setup_select:clan").setLabel("Paradise Clan").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("paradise_setup_select:tsbtr").setLabel("TSBTR-style").setStyle(ButtonStyle.Secondary)
  );
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ CHOOSE A SERVER SETUP")
      .setDescription("## ◆ Fieel's Community\nFima product, support, buyer and community server.\n\n## ◆ Paradise Clan\nFocused clan, training, challenge, relations and event server.\n\n## ◆ TSBTR-style\nLarge community/leaderboard structure kept as an optional future template.\n\n-# Every choice creates a backup and a second confirmation screen before destructive work.")
      .setFooter(paradiseFooter("Three independent setup templates"))],
    components: [row],
    ephemeral: true
  });
}

async function setupPreview(interaction, mode = "clan", update = false) {
  if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
  const selected = PARADISE_SETUP_SCHEMAS[mode];
  if (!selected) return interaction.reply({ content: "Unknown setup mode.", ephemeral: true });
  const snapshot = await snapshotGuild(interaction.guild);
  await writeArtifact("3a59-discord-test-server-backup.json", snapshot);
  const desiredNames = new Set(selected.schema.flatMap(([category, channels]) => [category, ...channels]));
  const existingNames = new Set(snapshot.channels.map(channel => channel.name));
  const createNames = [...desiredNames].filter(name => !existingNames.has(name));
  const extraNames = snapshot.channels.map(channel => channel.name).filter(name => !desiredNames.has(name));
  const missingRoles = selected.roles.filter(name => !snapshot.roles.some(role => role.name === name));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_setup_review:${mode}`).setLabel("Continue to final confirmation").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("paradise_setup_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );
  const payload = {
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`✦ ${selected.label} Setup Preview`)
      .setDescription(`## ◆ Backup complete\n- **Channels:** ${snapshot.channels.length}\n- **Roles:** ${snapshot.roles.length}\n\n## ◆ Selected template\n**${selected.label}** — ${selected.schema.length} categories, ${selected.schema.reduce((sum, [, channels]) => sum + channels.length, 0)} channels and ${selected.roles.length} roles.\n\n## ◆ Rebuild diff\n- **Create channels/categories:** ${createNames.length}\n- **Create roles:** ${missingRoles.length}\n- **Extra resources affected by rebuild:** ${extraNames.length}\n\n> ⚠️ **DANGER:** final rebuild removes extra non-managed resources. Repair mode preserves them.\n\n-# Test server only • Nothing changes until final typed confirmation.`)
      .addFields(
        { name: "Create preview", value: createNames.slice(0, 20).map(name => `\`${name}\``).join(", ") || "Nothing missing." },
        { name: "Potential removal preview", value: extraNames.slice(0, 20).map(name => `\`${name}\``).join(", ") || "No extra resources." },
        { name: "🛡️ __Safety boundary__", value: "**Hard-coded test guild only.** Backup + preview + typed confirmation are required; production is never targeted." }
      )
      .setFooter(paradiseFooter("Safe setup workflow"))],
    components: [row], ephemeral: true
  };
  return update ? interaction.update(payload) : interaction.reply(payload);
}

async function showSetupFinalConfirmation(interaction, mode) {
  if (!isOwner(interaction) || !PARADISE_SETUP_SCHEMAS[mode]) {
    return interaction.reply({ content: "Owner-only setup confirmation.", ephemeral: true });
  }
  const modal = new ModalBuilder().setCustomId(`paradise_setup_final:${mode}`).setTitle("Final destructive confirmation");
  const confirmation = new TextInputBuilder()
    .setCustomId("confirmation")
    .setLabel(`Type REBUILD ${mode.toUpperCase()}`)
    .setPlaceholder(`REBUILD ${mode.toUpperCase()}`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(confirmation));
  return interaction.showModal(modal);
}

async function handleSetupFinalConfirmation(interaction, mode) {
  const expected = `REBUILD ${mode.toUpperCase()}`;
  const supplied = interaction.fields.getTextInputValue("confirmation").trim().toUpperCase();
  if (supplied !== expected) {
    return interaction.reply({ content: `Confirmation did not match \`${expected}\`. Nothing was changed.`, ephemeral: true });
  }
  return applyServerSetup(interaction, mode, true);
}

async function handleSetupAction(interaction, mode) {
  const action = interaction.options.getString("action") || "preview";
  if (action === "repair" || action === "apply_missing_only") return applyServerSetup(interaction, mode, false);
  if (action === "guides") {
    if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const result = await publishAllGuides(interaction.guild, mode);
    return interaction.editReply(`Paradise handbooks regenerated: **${result.posted}** posts updated or created.`);
  }
  return setupPreview(interaction, mode);
}

const ROLE_PERMISSION_NAMES = Object.freeze({
  Owner: ["Administrator"],
  Admin: ["Administrator"],
  Overseer: ["ManageGuild", "ManageRoles", "ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "BanMembers", "ViewAuditLog"],
  "Administration Manager": ["ManageGuild", "ManageRoles", "ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  "Head Admin": ["ManageRoles", "ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  "Senior Admin": ["ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  "Moderator Manager": ["ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  "Head Moderator": ["ManageMessages", "ModerateMembers", "KickMembers"],
  "Senior Moderator": ["ManageMessages", "ModerateMembers"],
  Manager: ["ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  "Community Manager": ["ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  Moderator: ["ManageMessages", "ModerateMembers", "KickMembers"],
  "Support Staff": ["ManageMessages", "ModerateMembers"],
  "Bot Manager": ["ManageGuild", "ManageChannels", "ManageMessages"],
  "Training Manager": ["ManageChannels", "ManageMessages", "ModerateMembers"],
  "Tryout Manager": ["ManageChannels", "ManageMessages", "ModerateMembers"],
  "Tournament Manager": ["ManageChannels", "ManageMessages"],
  "Event Manager": ["ManageChannels", "ManageMessages"],
  "Giveaway Manager": ["ManageChannels", "ManageMessages"],
  "Game Night Manager": ["ManageChannels", "ManageMessages"],
  "Referee Manager": ["ManageChannels", "ManageMessages", "ModerateMembers"],
  "Head Referee": ["ManageMessages"],
  "Experienced Referee": ["ManageMessages"]
});

const PRIVATE_ACCESS_ROLES = new Set([
  "Owner", "Admin", "Overseer", "Manager", "Community Manager", "Moderator",
  "Administration Manager", "Head Admin", "Senior Admin", "Moderator Manager", "Head Moderator", "Senior Moderator",
  "Support Staff", "Bot Manager", "Security Staff", "Training Manager", "Tryout Manager",
  "Tournament Manager", "Event Manager", "Giveaway Manager", "Game Night Manager",
  "Referee Manager", "Head Referee", "Experienced Referee", "Referee", "Trial Referee",
  "Training Supervisor", "Experienced Training Hoster", "Training Hoster", "Trial Training Hoster",
  "Tryout Manager", "Experienced Tryout Hoster", "Tryout Hoster", "Trial Tryout Hoster",
  "War Hoster"
]);

function rolePermissions(name) {
  return (ROLE_PERMISSION_NAMES[name] || [])
    .map(permission => PermissionsBitField.Flags[permission])
    .filter(Boolean);
}

async function ensureRole(guild, name, applyPermissions = false) {
  let role = guild.roles.cache.find(item => item.name === name);
  const permissions = rolePermissions(name);
  if (!role) {
    role = await guild.roles.create({ name, permissions, reason: "3A59 Paradise setup" });
  } else if (applyPermissions && role.editable && !role.managed) {
    await role.setPermissions(permissions, "3A59 Paradise permission template").catch(() => {});
  }
  return role;
}

async function ensureBlacklistVisibility(guild, channel, channelName, roleNames = []) {
  if (!guild || !channel?.permissionOverwrites?.edit) return;
  const name = String(channelName || channel.name || "").toLowerCase();
  const staffOnly = new Set(["unblacklist", "bail-review", "blacklist-logs"]);
  const appealOnly = new Set(["ban-appeal", "blacklist-appeal"]);
  const publicReadOnly = new Set(["blacklist"]);
  if (!staffOnly.has(name) && !appealOnly.has(name) && !publicReadOnly.has(name)) return;

  const staffRoles = roleNames.length
    ? roleNames.filter(roleName => PRIVATE_ACCESS_ROLES.has(roleName))
    : [...PRIVATE_ACCESS_ROLES];

  if (appealOnly.has(name)) {
    const blacklisted = guild.roles.cache.find(role => role.name === "BLACKLISTED") || await ensureRole(guild, "BLACKLISTED");
    await channel.permissionOverwrites.edit(guild.roles.everyone, {
      ViewChannel: false,
      SendMessages: false,
      AddReactions: false
    }, { reason: "Paradise blacklist appeal visibility" }).catch(() => {});
    await channel.permissionOverwrites.edit(blacklisted, {
      ViewChannel: true,
      SendMessages: false,
      AddReactions: false,
      ReadMessageHistory: true
    }, { reason: "Paradise blacklist appeal visibility" }).catch(() => {});
    for (const roleName of staffRoles) {
      const role = guild.roles.cache.find(item => item.name === roleName);
      if (role) await channel.permissionOverwrites.edit(role, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      }, { reason: "Paradise blacklist staff review visibility" }).catch(() => {});
    }
    return;
  }

  if (staffOnly.has(name)) {
    await channel.permissionOverwrites.edit(guild.roles.everyone, {
      ViewChannel: false,
      SendMessages: false,
      AddReactions: false
    }, { reason: "Paradise staff-only blacklist review visibility" }).catch(() => {});
    for (const roleName of staffRoles) {
      const role = guild.roles.cache.find(item => item.name === roleName);
      if (role) await channel.permissionOverwrites.edit(role, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      }, { reason: "Paradise staff-only blacklist review visibility" }).catch(() => {});
    }
    return;
  }

  if (publicReadOnly.has(name)) {
    await channel.permissionOverwrites.edit(guild.roles.everyone, {
      ViewChannel: true,
      SendMessages: false,
      AddReactions: false,
      ReadMessageHistory: true
    }, { reason: "Paradise public blacklist board read-only" }).catch(() => {});
  }
}

async function organizeRoleHierarchy(guild, roleNames) {
  const me = guild.members.me || await guild.members.fetchMe();
  const highestAllowed = Math.max(1, me.roles.highest.position - 1);
  const positions = roleNames
    .map((name, index) => ({
      role: guild.roles.cache.find(item => item.name === name),
      position: Math.max(1, highestAllowed - index)
    }))
    .filter(item => item.role?.editable && !item.role.managed);
  if (positions.length) await guild.roles.setPositions(positions).catch(() => {});
}

async function ensureParadiseAutoMod(guild) {
  const rules = await guild.autoModerationRules.fetch().catch(() => null);
  if (!rules) return { status: "unavailable" };
  const state = await loadState();
  const config = configForGuild(state, guild.id).automod || {};
  if (config.enabled === false) {
    for (const rule of rules.values()) {
      if (rule.name.startsWith("Paradise ")) await rule.edit({ enabled: false, reason: "Paradise dashboard AutoMod disabled" }).catch(() => {});
    }
    return { status: "disabled" };
  }
  const exemptRoleIds = ["Owner", "Admin", "Overseer", "Media & Links Approved"]
    .map(name => guild.roles.cache.find(role => role.name === name)?.id).filter(Boolean);
  const logChannel = guild.channels.cache.find(channel => channel.name === "mod-logs");
  const actions = [{ type: AutoModerationActionType.BlockMessage, metadata: { customMessage: "That link is not allowed here. Use an approved media/ticket channel or ask staff." } }];
  if (logChannel) actions.push({ type: AutoModerationActionType.SendAlertMessage, metadata: { channel: logChannel.id } });
  const keywords = [];
  if (config.blockInvites !== false) keywords.push("*discord.gg/*", "*discord.com/invite/*", "*discordapp.com/invite/*");
  if (config.blockScamKeywords !== false) keywords.push("*free nitro*", "*steam gift*", "*claim reward*", "*verify account here*", "*limited gift*");
  if (keywords.length && ![...rules.values()].some(rule => rule.name === "Paradise Invite & Scam Link Guard")) {
    await guild.autoModerationRules.create({
      name: "Paradise Invite & Scam Link Guard",
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: {
        keywordFilter: keywords
      },
      actions, enabled: true, exemptRoles: exemptRoleIds,
      reason: "3A59 anti-scam and invite-link protection"
    });
  }
  if (![...rules.values()].some(rule => rule.name === "Paradise Mention Spam Guard")) {
    await guild.autoModerationRules.create({
      name: "Paradise Mention Spam Guard",
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.MentionSpam,
      triggerMetadata: { mentionTotalLimit: Math.min(50, Math.max(3, Number(config.mentionSpamLimit) || 8)), mentionRaidProtectionEnabled: true },
      actions,
      enabled: true,
      exemptRoles: exemptRoleIds,
      reason: "Paradise mention-spam protection"
    });
  }
  return { status: "configured", rules: [...rules.values()].length + 2 };
}

async function applyServerSetup(interaction, mode, destructive = true) {
  if (!isOwner(interaction) || interaction.guildId !== PARADISE_TEST_GUILD_ID) {
    return interaction.reply({ content: "Blocked: wrong guild or non-owner.", ephemeral: true });
  }
  assertParadiseTestGuildMutation({ guildId: interaction.guildId, operation: destructive ? "rebuild" : "repair" });
  const selected = PARADISE_SETUP_SCHEMAS[mode];
  if (!selected) return interaction.reply({ content: "Blocked: unknown setup template.", ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const snapshot = await snapshotGuild(interaction.guild);
  await writeArtifact("3a59-discord-test-server-backup.json", snapshot);
  for (const name of selected.roles) await ensureRole(interaction.guild, name, true);
  const desiredNames = new Set(selected.schema.flatMap(([category, channels]) => [category, ...channels]));
  const wrongTypeChannelIds = new Set();
  const wrongTypeChannels = [];
  for (const [categoryName, channelNames, privateCategory] of selected.schema) {
    let category = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === categoryName);
    if (!category) category = await interaction.guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory, reason: "3A59 Paradise setup" });
    if (privateCategory) {
      await category.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
      for (const roleName of selected.roles.filter(name => PRIVATE_ACCESS_ROLES.has(name))) {
        const role = interaction.guild.roles.cache.find(item => item.name === roleName);
        if (role) await category.permissionOverwrites.edit(role, { ViewChannel: true }).catch(() => {});
      }
    } else {
      await category.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: null }).catch(() => {});
    }
    const mutedRole = interaction.guild.roles.cache.find(item => item.name === "Muted / Quarantined");
    if (mutedRole) {
      await category.permissionOverwrites.edit(mutedRole, {
        SendMessages: false,
        AddReactions: false,
        Speak: false
      }).catch(() => {});
    }
    for (const channelName of channelNames) {
      const expectedType = paradiseSetupChannelType(categoryName, channelName);
      let channel = interaction.guild.channels.cache.find(c => c.name === channelName && c.type === expectedType);
      const wrongType = interaction.guild.channels.cache.find(c => c.name === channelName && paradiseSetupChannelTypeMismatch(c, categoryName, channelName));
      if (wrongType) {
        wrongTypeChannelIds.add(wrongType.id);
        wrongTypeChannels.push({ name: channelName, actualType: wrongType.type, expectedType });
      }
      if (!channel) {
        channel = await interaction.guild.channels.create({
          name: channelName, type: expectedType,
          parent: category.id, reason: "3A59 Paradise setup"
        });
      } else if (channel.parentId !== category.id) await channel.setParent(category.id, { lockPermissions: privateCategory });
      await ensureBlacklistVisibility(interaction.guild, channel, channelName, selected.roles).catch(() => {});
    }
  }
  const removableChannels = [...interaction.guild.channels.cache.values()]
    .filter(c => (!desiredNames.has(c.name) || wrongTypeChannelIds.has(c.id)) && !c.isThread?.() && c.id !== interaction.channelId);
  const removableRoles = [...interaction.guild.roles.cache.values()]
    .filter(r => !r.managed && r.id !== interaction.guild.id && !selected.roles.includes(r.name));
  if (destructive) {
    for (const channel of removableChannels) await channel.delete("3A59 owner-confirmed test-server rebuild").catch(() => {});
    for (const role of removableRoles) await role.delete("3A59 owner-confirmed test-server rebuild").catch(() => {});
  }
  await organizeRoleHierarchy(interaction.guild, selected.roles);
  await applyParadiseTemplateChannelMappings(interaction.guild, mode);
  const autoMod = await ensureParadiseAutoMod(interaction.guild).catch(error => ({ status: "failed", error: error.message }));
  await publishAllGuides(interaction.guild, mode).catch(() => {});
  if (mode !== "community") {
    await updateRelationsPanel(interaction.guild).catch(() => {});
    await updateAvailabilityPanel(interaction.guild).catch(() => {});
    await updateLoaPanel(interaction.guild).catch(() => {});
  }
  await updateStaffTeamEmbed(interaction.guild).catch(() => {});
  const voiceIds = paradiseVoiceSetupIds(interaction.guild);
  await configureParadiseAfkChannel(interaction.guild, voiceIds);
  await saveState(state => {
    state.guildConfigs[interaction.guildId] = state.guildConfigs[interaction.guildId] || structuredClone(state.config || {});
    const config = state.guildConfigs[interaction.guildId];
    config.activeSetupMode = mode;
    config.lastSetupRun = {
      mode,
      operation: destructive ? "rebuild" : "repair",
      completedAt: new Date().toISOString(),
      createdOrRepairedChannels: selected.schema.reduce((n, [, rows]) => n + rows.length, 0),
      preservedExtraChannels: destructive ? 0 : removableChannels.length,
      preservedExtraRoles: destructive ? 0 : removableRoles.length,
      wrongChannelTypes: wrongTypeChannels
    };
    config.autoActivityChecks = true;
    config.autoActivityRoleRemoval = true;
    config.weeklyQuotas = config.weeklyQuotas || WEEKLY_QUOTAS;
    config.voiceSettings = { ...(config.voiceSettings || {}), ...voiceIds };
    if (interaction.guildId === PARADISE_TEST_GUILD_ID) state.config = structuredClone(config);
    return state;
  });
  await writeArtifact(`3a59-discord-${mode}-setup-live.json`, {
    status: "LIVE VERIFIED", completedAt: new Date().toISOString(), operation: destructive ? "rebuild" : "repair",
    guildId: interaction.guildId, template: selected.label, categories: selected.schema.length,
    channels: selected.schema.reduce((n, [, rows]) => n + rows.length, 0), roles: selected.roles.length,
    wrongChannelTypes: wrongTypeChannels.map(item => ({ name: item.name, actualType: item.actualType, expectedType: item.expectedType })),
    autoMod
  });
  return interaction.editReply(destructive
    ? `${selected.label} rebuild completed. Backup and final typed confirmation were recorded.`
    : `${selected.label} repair completed. No extra channel or role was deleted.`);
}

export async function applyParadiseTemplateMissingOnly(guild, mode, { repairPermissions = true } = {}) {
  assertParadiseTestGuildMutation({ guildId: guild?.id, operation: "create_missing" });
  const selected = PARADISE_SETUP_SCHEMAS[mode];
  if (!selected) {
    const error = new Error("invalid_template");
    error.code = "invalid_template";
    throw error;
  }

  const snapshot = await snapshotGuild(guild);
  await writeArtifact("3a59-discord-test-server-backup.json", snapshot);
  const beforeChannelIds = new Set(guild.channels.cache.keys());
  const beforeRoleIds = new Set(guild.roles.cache.keys());
  const wrongTypeChannels = [];

  for (const [categoryName, channelNames, privateCategory] of selected.schema) {
    let category = guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && channel.name === categoryName);
    if (!category) {
      category = await guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
        reason: "Paradise dashboard create-missing test"
      });
    }
    if (repairPermissions) {
      await category.permissionOverwrites.edit(guild.roles.everyone, {
        ViewChannel: privateCategory ? false : null
      }).catch(() => {});
      if (privateCategory) {
        for (const roleName of selected.roles.filter(name => PRIVATE_ACCESS_ROLES.has(name))) {
          const role = guild.roles.cache.find(item => item.name === roleName);
          if (role) await category.permissionOverwrites.edit(role, { ViewChannel: true }).catch(() => {});
        }
      }
    }
    for (const channelName of channelNames) {
      const expectedType = paradiseSetupChannelType(categoryName, channelName);
      let channel = guild.channels.cache.find(item => item.name === channelName && item.type === expectedType);
      const wrongType = guild.channels.cache.find(item => item.name === channelName && paradiseSetupChannelTypeMismatch(item, categoryName, channelName));
      if (wrongType) wrongTypeChannels.push({ name: channelName, actualType: wrongType.type, expectedType });
      if (!channel) {
        channel = await guild.channels.create({
          name: channelName,
          type: expectedType,
          parent: category.id,
          reason: "Paradise dashboard create-missing test"
        });
      } else if (channel.parentId !== category.id) {
        await channel.setParent(category.id, { lockPermissions: privateCategory }).catch(() => {});
      }
      await ensureBlacklistVisibility(guild, channel, channelName, selected.roles).catch(() => {});
    }
  }

  const missingRoleNames = selected.roles.filter(name => !guild.roles.cache.some(role => role.name === name));
  const roleCreationResults = await Promise.allSettled(missingRoleNames.map(name => Promise.race([
    ensureRole(guild, name, repairPermissions),
    new Promise(resolve => setTimeout(() => resolve(null), 20_000))
  ])));
  const pendingRoleCreates = roleCreationResults.filter(result => result.status === "fulfilled" && !result.value).length;
  if (repairPermissions) {
    await Promise.race([
      organizeRoleHierarchy(guild, selected.roles),
      new Promise(resolve => setTimeout(resolve, 20_000))
    ]).catch(() => {});
  }
  const autoMod = repairPermissions
    ? await ensureParadiseAutoMod(guild).catch(error => ({ status: "failed", error: error.message }))
    : { status: "not_requested" };
  const mappedChannels = await applyParadiseTemplateChannelMappings(guild, mode);
  const guideResult = await publishAllGuides(guild, mode).catch(error => ({ posted: 0, error: error.message }));
  if (mode !== "community") {
    await updateRelationsPanel(guild).catch(() => {});
    await updateAvailabilityPanel(guild).catch(() => {});
    await updateLoaPanel(guild).catch(() => {});
    await updateRankedLeaderboardBoards(guild).catch(() => {});
  }
  await updateStaffTeamEmbed(guild).catch(() => {});
  const voiceIds = paradiseVoiceSetupIds(guild);
  await configureParadiseAfkChannel(guild, voiceIds);

  const createdChannels = [...guild.channels.cache.keys()].filter(id => !beforeChannelIds.has(id)).length;
  const createdRoles = [...guild.roles.cache.keys()].filter(id => !beforeRoleIds.has(id)).length;
  const result = {
    status: "LIVE DISCORD VERIFIED",
    completedAt: new Date().toISOString(),
    guildId: guild.id,
    mode,
    template: selected.label,
    operation: repairPermissions ? "create_missing_and_repair_permissions" : "create_missing_only",
    createdChannels,
    createdRoles,
    pendingRoleCreates,
    mappedChannelCount: Object.keys(mappedChannels).length,
    guidePosts: Number(guideResult.posted || 0),
    wrongChannelTypes: wrongTypeChannels,
    autoMod
  };
  await saveState(state => {
    state.guildConfigs[guild.id] = state.guildConfigs[guild.id] || structuredClone(state.config || {});
    const config = state.guildConfigs[guild.id];
    config.activeSetupMode = mode;
    config.voiceSettings = { ...(config.voiceSettings || {}), ...voiceIds };
    config.lastSetupRun = result;
    if (guild.id === PARADISE_TEST_GUILD_ID) state.config = structuredClone(config);
    return state;
  });
  await writeArtifact(`3a63-${mode}-test-create-missing-live.json`, result);
  return result;
}

export async function rebuildParadiseTestTemplate(guild, mode, confirmation) {
  assertParadiseTestGuildMutation({ guildId: guild?.id, operation: "rebuild" });
  const selected = PARADISE_SETUP_SCHEMAS[mode];
  if (!selected) {
    const error = new Error("invalid_template");
    error.code = "invalid_template";
    throw error;
  }
  const expected = `REBUILD TEST ${mode.toUpperCase()}`;
  if (String(confirmation || "").trim().toUpperCase() !== expected) {
    const error = new Error("typed_confirmation_mismatch");
    error.code = "typed_confirmation_mismatch";
    throw error;
  }

  const snapshot = await snapshotGuild(guild);
  const backup = createParadiseBackupEnvelope(snapshot);
  const restoreDryRun = buildParadiseRestoreDryRun({ backup, currentSnapshot: snapshot });
  if (restoreDryRun.code !== "restore_dry_run_valid") {
    const error = new Error("backup_restore_dry_run_failed");
    error.code = "backup_restore_dry_run_failed";
    throw error;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeArtifact(`3a65-test-server-backup-${mode}-${stamp}.json`, backup);
  await writeArtifact("3a65-test-server-pre-rebuild-backup.json", backup);
  await writeArtifact("3a73-test-server-restore-dry-run.json", restoreDryRun);

  const deleted = { channels: 0, roles: 0 };
  const channels = [...guild.channels.cache.values()]
    .filter(channel => !channel.isThread?.())
    .sort((a, b) => Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)));
  for (const channel of channels) {
    const removed = await channel.delete(`3A65 owner-confirmed test ${mode} rebuild`).then(() => true).catch(() => false);
    if (removed) deleted.channels += 1;
  }

  const me = guild.members.me || await guild.members.fetchMe();
  const desiredRoleNames = new Set(selected.roles);
  const roles = [...guild.roles.cache.values()]
    .filter(role => !role.managed
      && role.id !== guild.id
      && role.position < me.roles.highest.position
      && !desiredRoleNames.has(role.name))
    .sort((a, b) => a.position - b.position);
  for (const role of roles) {
    const removed = await role.delete(`3A65 owner-confirmed test ${mode} rebuild`).then(() => true).catch(() => false);
    if (removed) deleted.roles += 1;
  }

  const installed = await applyParadiseTemplateMissingOnly(guild, mode, { repairPermissions: true });
  const result = {
    ...installed,
    status: "LIVE DISCORD VERIFIED",
    operation: "full_test_server_rebuild",
    confirmation: expected,
    deleted,
    preservedDesiredRoles: [...guild.roles.cache.values()]
      .filter(role => desiredRoleNames.has(role.name)).length,
    backup: `artifacts/post-security-backlog/3a65-test-server-backup-${mode}-${stamp}.json`,
    restoreDryRun: restoreDryRun.code
  };
  await writeArtifact(`3a65-test-server-full-rebuild-${mode}.json`, result);
  return result;
}

export async function runParadiseTestSmokeSuite(guild, { fast = false } = {}) {
  let smokeStep = "guard";
  try {
  assertParadiseTestGuildMutation({ guildId: guild?.id, operation: "test_smoke" });
  smokeStep = "channel_lookup";
  const ownerId = guild.ownerId;
  const trainingChannel = await configuredChannel(guild, "training_channel", "training");
  const tryoutChannel = await configuredChannel(guild, "tryout_channel", "tryout");
  if (!trainingChannel || !tryoutChannel) {
    const error = new Error("test_channels_missing");
    error.code = "test_channels_missing";
    throw error;
  }
  const smokeSend = async (channel, payload, code) => {
    try {
      return await channel.send(payload);
    } catch (error) {
      error.code = code;
      throw error;
    }
  };
  const smokeReply = async (message, content, code) => {
    try {
      return await message.reply({ content, allowedMentions: { parse: [] } });
    } catch (error) {
      error.code = code;
      throw error;
    }
  };
  const upsertSmokePanel = async (key, channel, payload) => {
    const state = await loadState();
    const storedId = configForGuild(state, guild.id).smokePanelMessageIds?.[key];
    let message = storedId ? await channel.messages.fetch(storedId).catch(() => null) : null;
    if (message) await message.edit(payload); else message = await smokeSend(channel, payload, `smoke_${key}_send_failed`);
    await saveState(next => {
      next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
      next.guildConfigs[guild.id].smokePanelMessageIds = next.guildConfigs[guild.id].smokePanelMessageIds || {};
      next.guildConfigs[guild.id].smokePanelMessageIds[key] = message.id;
      return next;
    });
    return message;
  };

  const smokeConfig = configForGuild(await loadState(), guild.id);
  const smokeLanguage = guildLanguage(smokeConfig);
  const trainingCopy = sessionLanguageCopy(smokeLanguage, "training");
  const tryoutCopy = sessionLanguageCopy(smokeLanguage, "tryout");
  const trainingId = crypto.randomUUID();
  const tryoutId = crypto.randomUUID();
  smokeStep = "training_send";
  const training = await smokeSend(trainingChannel, {
    content: [
      trainingCopy.title,
      trainingCopy.subtitle,
      "",
      "### Kurallar:",
      "- LH yok / 2M1 shove tech yok",
      "- TDS yok / True Downslam yok",
      "- Overpassive yok",
      "- 2 Ragdoll Cancel yok",
      "- Wall abuse yok",
      "- Sırada birbirinize vurmak yok",
      "- Sırayı terk etmek yok",
      "",
      "### Oynanabilir karakterler:",
      "- Saitama",
      "- Garou",
      "- Metal Bat",
      "",
      "### Link:",
      "https://www.roblox.com/share?code=PARADISE-TEST",
      "",
      `<@${ownerId}>`,
      "",
      "-# Canlı test mesajı • Hoster-only controls • Made By Fieel"
    ].join("\n"),
    components: [sessionControls(trainingId, "training", smokeLanguage)],
    content: trainingAnnouncementMarkdown({
      language: smokeLanguage,
      server: "Frankfurt, Germany",
      format: "First To 3",
      characters: "Saitama, Garou, Metal Bat",
      rules: ["LH yok / 2M1 shove tech yok", "TDS yok / True Downslam yok", "Overpassive yok", "2 Ragdoll Cancel yok", "Wall abuse yok", "Sırada birbirinize vurmak yok", "Sırayı terk etmek yok"],
      link: "https://www.roblox.com/share?code=PARADISE-TEST",
      hoster: `<@${ownerId}>`
    }),
    allowedMentions: { users: [], roles: [], parse: [] }
  }, "smoke_training_send_failed");
  smokeStep = "tryout_send";
  const tryout = await smokeSend(tryoutChannel, {
    content: [
      tryoutCopy.title,
      tryoutCopy.subtitle,
      "",
      "◆ **Server**",
      "https://www.roblox.com/share?code=PARADISE-TEST",
      "",
      "◆ **Format**",
      "- FT2 — one aggressive round",
      "- FT2 — one passive round",
      "",
      "◆ **Hoster**",
      `<@${ownerId}>`,
      "",
      "◆ **Evaluation**",
      "RC timing, catches, dash reactions, movement, pressure, adaptation and game sense.",
      "",
      "◆ **Rules**",
      "- No LH / 3M1 reset / TDS",
      "- No 2 RC / wall / overpassive",
      "- No alts, queue hitting or leaving",
      "",
      "-# Lock after 1–5 minutes • Canlı test mesajı • Made By Fieel"
    ].join("\n"),
    components: [sessionControls(tryoutId, "tryout", smokeLanguage)],
    content: tryoutAnnouncementMarkdown({
      language: smokeLanguage,
      server: "Frankfurt, Germany",
      link: "https://www.roblox.com/share?code=PARADISE-TEST",
      hoster: `<@${ownerId}>`
    }),
    allowedMentions: { users: [], roles: [], parse: [] }
  }, "smoke_tryout_send_failed");

  smokeStep = "lifecycle_send";
  const smokeFooter = smokeLanguage === "tr" ? "-# Paradise yaşam döngüsü testi" : "-# Paradise lifecycle rendering test";
  await smokeReply(training, `${trainingCopy.lockedReply}\n${smokeFooter}`, "smoke_training_lifecycle_failed");
  await smokeReply(training, `${trainingCopy.unlockedReply}\n${smokeFooter}`, "smoke_training_lifecycle_failed");
  await smokeReply(training, `${trainingCopy.endedReply}\n${smokeFooter}`, "smoke_training_lifecycle_failed");
  await smokeReply(tryout, `${tryoutCopy.lockedReply}\n${smokeFooter}`, "smoke_tryout_lifecycle_failed");
  await smokeReply(tryout, `${tryoutCopy.unlockedReply}\n${smokeFooter}`, "smoke_tryout_lifecycle_failed");
  await smokeReply(tryout, `${tryoutCopy.endedReply}\n${smokeFooter}`, "smoke_tryout_lifecycle_failed");

  const sessions = {
    [trainingId]: {
      id: trainingId, guildId: guild.id, type: "training", hosterId: ownerId,
      channelId: trainingChannel.id, messageId: training.id, status: "open", test: true,
      startedAt: new Date().toISOString()
    },
    [tryoutId]: {
      id: tryoutId, guildId: guild.id, type: "tryout", hosterId: ownerId,
      channelId: tryoutChannel.id, messageId: tryout.id, status: "open", test: true,
      startedAt: new Date().toISOString()
    }
  };
  Object.values(sessions).forEach(session => activeTrainings.set(session.id, session));
  smokeStep = "state_save";
  try {
    await saveState(state => {
      state.trainings = { ...state.trainings, ...sessions };
      return state;
    });
  } catch (error) {
    error.code = "smoke_state_save_failed";
    throw error;
  }

  smokeStep = "welcome_leave";
  const owner = await guild.members.fetch(ownerId).catch(() => null);
  if (owner) {
    await sendMemberLifecycleMessage(owner, "join");
    await sendMemberLifecycleMessage(owner, "leave");
  }
  smokeStep = "leaderboard";
  const botMember = guild.members.me;
  await saveState(next => {
    const target = ensureLeaderboardForGuild(next, guild.id);
    target[ownerId] = {
      ...(target[ownerId] || {}),
      spot: 1,
      stageRank: { stage: 0, level: "High", strength: "Strong" },
      region: "Frankfurt, Germany",
      wins: 12,
      losses: 2,
      notes: "Template-lab owner profile",
      updatedAt: new Date().toISOString(),
      updatedBy: ownerId,
      test: true
    };
    if (botMember) {
      target[botMember.id] = {
        ...(target[botMember.id] || {}),
        spot: 2,
        stageRank: { stage: 2, level: "High", strength: "Strong" },
        region: "Paris, France",
        wins: 8,
        losses: 3,
        availability: { immunityUntil: Date.now() + 24 * 60 * 60 * 1000 },
        notes: "Live smoke-suite demonstration card",
        updatedAt: new Date().toISOString(),
        updatedBy: ownerId,
        test: true
      };
      next.profiles = next.profiles || {};
      next.profiles[botMember.id] = next.profiles[botMember.id] || {
        profileId: 9002,
        discordUserId: botMember.id,
        robloxUsername: "ParadiseTest",
        region: "Paris, France",
        thumbnailUrl: botMember.user.displayAvatarURL(),
        stageRank: { stage: 2, level: "High", strength: "Strong" },
        createdAt: new Date().toISOString(),
        test: true
      };
    }
    return next;
  });
  const leaderboardBoards = await updateRankedLeaderboardBoards(guild).catch(() => []);
  smokeStep = "staff_team";
  const staffTeam = await updateStaffTeamEmbed(guild).catch(() => null);
  smokeStep = "help_guide";
  // Guide reposts are intentionally skipped on a repeat smoke: they can take
  // several minutes due Discord's rate limits and do not validate a changed
  // Training/Tryout, leaderboard, staff or transcript flow.
  const helpGuide = fast ? null : await publishSetupGuides(guild, "tsbtr").catch(() => null);
  smokeStep = "workflow_panels";
  const applicationChannel = await configuredChannel(guild, "application_ticket_channel", "application-ticket");
  const supportChannel = await configuredChannel(guild, "support_ticket_channel", "support-ticket")
    || guild.channels.cache.find(item => item.name === "open-ticket" && item.isTextBased?.());
  const moderationChannel = await configuredChannel(guild, "moderation_requests_channel", "moderation-requests");
  const securityChannel = await configuredChannel(guild, "quarantine_review_channel", "quarantine-review")
    || guild.channels.cache.find(item => item.name === "security-alerts" && item.isTextBased?.());
  const applicationPanel = applicationChannel
    ? await upsertSmokePanel("application", applicationChannel, paradiseApplicationPanelPayload(await paradiseBrandColor()))
    : null;
  const supportPanel = supportChannel
    ? await upsertSmokePanel("support", supportChannel, paradiseSupportPanelPayload(await paradiseBrandColor()))
    : null;
  const supportTicket = owner && supportChannel
    ? await createParadiseSupportTicket(guild, owner.user, supportChannel, { test: true })
    : null;
  smokeStep = "support_ticket_lifecycle";
  const supportTicketLifecycle = supportTicket
    ? await runParadiseSupportTicketLifecycleSmoke(guild, supportTicket)
    : null;

  let moderationPanel = null;
  if (moderationChannel) {
    const currentState = await loadState();
    let moderationRecord = Object.values(currentState.moderationCases?.[guild.id] || {})
      .find(item => item.test === true && item.action === "review-only" && item.status === "pending");
    if (!moderationRecord) {
      moderationRecord = {
        id: crypto.randomUUID(), guildId: guild.id, action: "review-only", targetId: ownerId,
        requestedBy: ownerId, reason: "Safe live approval-queue rendering test; no member action is executed.",
        status: "pending", test: true, createdAt: new Date().toISOString()
      };
      await saveState(next => {
        next.moderationCases[guild.id] = next.moderationCases[guild.id] || {};
        next.moderationCases[guild.id][moderationRecord.id] = moderationRecord;
        return next;
      });
    }
    moderationPanel = await upsertSmokePanel("moderation", moderationChannel, {
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("MODERATION REQUEST · SAFE TEST")
        .setDescription(`Case: \`${moderationRecord.id.slice(0, 8)}\`\nRequested by: <@${ownerId}>\nAction: **review-only**\n\nThis validates the senior approval queue without kicking, banning, muting or quarantining anyone.`)
        .setFooter(paradiseFooter("No member action on approval"))],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`paradise_mod_approve:${moderationRecord.id}`).setLabel("Approve safe test").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`paradise_mod_deny:${moderationRecord.id}`).setLabel("Deny safe test").setStyle(ButtonStyle.Secondary)
      )]
    });
  }
  const securityPanel = securityChannel
    ? await upsertSmokePanel("security", securityChannel, {
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("PARADISE SECURITY · LIVE STATUS")
        .setDescription("# Audit-first protection\n- Discord AutoMod rules installed\n- Invite/scam and mention-spam guards configured\n- Quarantine review channel mapped\n- Raid mode and lockdown remain owner/senior-staff actions\n- No automatic first-offense ban\n\n-# Safe test: this message changes no moderation state.")
        .setFooter(paradiseFooter("Quarantine and false-positive review"))]
    })
    : null;
  smokeStep = "xp_board";
  await saveState(next => {
    next.memberLevels[guildUserKey(guild.id, ownerId)] = {
      ...(next.memberLevels[guildUserKey(guild.id, ownerId)] || {}),
      guildId: guild.id, userId: ownerId, xp: 1250, chatXp: 800, voiceXp: 450,
      level: 5, weeklyXp: 240, monthlyXp: 1250, test: true, updatedAt: new Date().toISOString()
    };
    return next;
  });
  if (!guild.channels.cache.some(item => item.name === "level-leaderboard" && item.isTextBased?.())) {
    const parent = guild.channels.cache.find(item => item.type === ChannelType.GuildCategory && item.name === "LEADERBOARD");
    await guild.channels.create({
      name: "level-leaderboard",
      type: ChannelType.GuildText,
      parent: parent?.id,
      reason: "Paradise test-lab XP board verification"
    });
  }
  const xpBoard = await updateLevelLeaderboard(guild).catch(() => null);
  const result = {
    status: "LIVE DISCORD VERIFIED",
    completedAt: new Date().toISOString(),
    guildId: guild.id,
    training: { channelId: trainingChannel.id, messageId: training.id, url: training.url, plainMarkdown: Number(training.embeds?.size ?? training.embeds?.length ?? 0) === 0, lifecycleReplies: 3 },
    tryout: { channelId: tryoutChannel.id, messageId: tryout.id, url: tryout.url, plainMarkdown: Number(tryout.embeds?.size ?? tryout.embeds?.length ?? 0) === 0, lifecycleReplies: 3 },
    lifecycleMessages: 6,
    welcomeLeaveSimulation: Boolean(owner),
    leaderboardBoards,
    staffTeam: staffTeam ? { channelId: staffTeam.channelId, messageId: staffTeam.id, url: staffTeam.url } : null,
    helpGuide: helpGuide ? { channelId: helpGuide.channelId, messageId: helpGuide.id, url: helpGuide.url } : null,
    workflowPanels: {
      application: applicationPanel ? { channelId: applicationPanel.channelId, messageId: applicationPanel.id, url: applicationPanel.url } : null,
      support: supportPanel ? { channelId: supportPanel.channelId, messageId: supportPanel.id, url: supportPanel.url } : null,
      supportTicket: supportTicket ? {
        channelId: supportTicket.channel.id,
        ticketId: supportTicket.record.id,
        existing: supportTicket.existing,
        transcriptSaved: Boolean(supportTicketLifecycle?.transcriptSaved),
        closedThenReopened: Boolean(supportTicketLifecycle?.closedThenReopened)
      } : null,
      moderation: moderationPanel ? { channelId: moderationPanel.channelId, messageId: moderationPanel.id, url: moderationPanel.url } : null,
      security: securityPanel ? { channelId: securityPanel.channelId, messageId: securityPanel.id, url: securityPanel.url } : null,
      xp: xpBoard ? { channelId: xpBoard.channelId, messageId: xpBoard.id, url: xpBoard.url } : null
    }
  };
  smokeStep = "artifact";
  await writeArtifact("3a66-test-server-live-smoke-suite.json", result);
  return result;
  } catch (error) {
    if (typeof error.code === "string" && error.code.startsWith("smoke_")) throw error;
    const wrapped = new Error(`smoke_${smokeStep}_failed`);
    wrapped.code = `smoke_${smokeStep}_failed`;
    wrapped.cause = error;
    throw wrapped;
  }
}

export async function runParadiseAutoSmokeOnce(guild) {
  try {
    assertParadiseTestGuildMutation({ guildId: guild?.id, operation: "auto_smoke" });
  } catch (error) {
    if (error.code === "test_guild_only") return { skipped: true, reason: "test_guild_only" };
    throw error;
  }
  try {
    const state = await loadState();
    if (state.securityState?.[guild.id]?.lastAutoSmokeRevision === PARADISE_AUTO_SMOKE_REVISION) {
      return { skipped: true, reason: "already_completed", revision: PARADISE_AUTO_SMOKE_REVISION };
    }
    const needsCompactLab = state.securityState?.[guild.id]?.testLabLayoutRevision !== PARADISE_TEST_LAB_LAYOUT_REVISION;
    // The test guild was expressly designated as a disposable template lab.
    // This call is still guarded inside rebuildParadiseTestTemplate by its
    // fixed guild ID and creates a timestamped backup before any deletion.
    const compactRebuild = needsCompactLab
      ? await rebuildParadiseTestTemplate(guild, "tsbtr", "REBUILD TEST TSBTR")
      : null;
    // A full missing-only repair is needed for an empty lab, but repeating the
    // whole template on every source revision delays panel smoke tests for minutes.
    const existingTestLab = Boolean(state.securityState?.[guild.id]?.lastAutoSmokeResult) && !needsCompactLab;
    const repair = compactRebuild || (existingTestLab
      ? { skipped: true, reason: "existing_test_lab" }
      : await applyParadiseTemplateMissingOnly(guild, "tsbtr", { repairPermissions: true }));
    const result = await runParadiseTestSmokeSuite(guild, { fast: existingTestLab });
    const blacklistedRole = guild.roles.cache.find(role => role.name === "BLACKLISTED");
    const appealChannel = guild.channels.cache.find(channel =>
      ["ban-appeal", "blacklist-appeal"].includes(channel.name) && channel.isTextBased?.()
    );
    const staffReviewChannels = [...guild.channels.cache.values()].filter(channel =>
      ["unblacklist", "bail-review", "blacklist-logs"].includes(channel.name) && channel.isTextBased?.()
    );
    const everyoneAppealOverwrite = appealChannel?.permissionOverwrites?.cache?.get(guild.roles.everyone.id);
    const blacklistedAppealOverwrite = blacklistedRole
      ? appealChannel?.permissionOverwrites?.cache?.get(blacklistedRole.id)
      : null;
    const blacklistPermissionReady = Boolean(
      blacklistedRole
      && appealChannel
      && everyoneAppealOverwrite?.deny?.has(PermissionsBitField.Flags.ViewChannel)
      && blacklistedAppealOverwrite?.allow?.has(PermissionsBitField.Flags.ViewChannel)
      && staffReviewChannels.length >= 2
      && staffReviewChannels.every(channel =>
        channel.permissionOverwrites.cache.get(guild.roles.everyone.id)?.deny?.has(PermissionsBitField.Flags.ViewChannel)
      )
    );
    await saveState(next => {
      next.securityState[guild.id] = {
        ...(next.securityState[guild.id] || {}),
          lastAutoSmokeRevision: PARADISE_AUTO_SMOKE_REVISION,
          testLabLayoutRevision: PARADISE_TEST_LAB_LAYOUT_REVISION,
        lastAutoSmokeAt: new Date().toISOString(),
        lastAutoSmokeError: null,
        lastAutoSmokeFailedAt: null,
        lastAutoSmokeResult: {
          trainingMessageId: result.training?.messageId || null,
          tryoutMessageId: result.tryout?.messageId || null,
          trainingPlainMarkdown: result.training?.plainMarkdown === true,
          tryoutPlainMarkdown: result.tryout?.plainMarkdown === true,
          trainingLifecycleReplies: Number(result.training?.lifecycleReplies || 0),
          tryoutLifecycleReplies: Number(result.tryout?.lifecycleReplies || 0),
          leaderboardBoardCount: Number(result.leaderboardBoards?.length || 0),
          staffTeamReady: Boolean(result.staffTeam?.messageId),
          supportTicketChannelId: result.workflowPanels?.supportTicket?.channelId || null,
          supportTicketTranscriptReady: Boolean(result.workflowPanels?.supportTicket?.transcriptSaved),
          supportTicketReopenReady: Boolean(result.workflowPanels?.supportTicket?.closedThenReopened),
          applicationPanelReady: Boolean(result.workflowPanels?.application),
          supportPanelReady: Boolean(result.workflowPanels?.support),
          moderationPanelReady: Boolean(result.workflowPanels?.moderation),
          securityPanelReady: Boolean(result.workflowPanels?.security),
          xpPanelReady: Boolean(result.workflowPanels?.xp),
          repairCreatedChannels: Number(repair?.created?.channels || 0),
          repairCreatedRoles: Number(repair?.created?.roles || 0),
          blacklistedRoleReady: Boolean(blacklistedRole),
          blacklistPermissionReady
        }
      };
      return next;
    });
    return {
      skipped: false,
      revision: PARADISE_AUTO_SMOKE_REVISION,
      repair,
      blacklistedRoleReady: Boolean(blacklistedRole),
      blacklistPermissionReady,
      result
    };
  } catch (error) {
    // The public test-lab endpoint exposes only this short internal step code—never
    // Discord/credential payloads—so a failed test-guild-only smoke can be fixed safely.
    const safeCode = String(error?.code || "test_lab_smoke_failed")
      .replace(/[^a-z0-9_-]/gi, "_")
      .slice(0, 96) || "test_lab_smoke_failed";
    await saveState(next => {
      next.securityState[guild.id] = {
        ...(next.securityState[guild.id] || {}),
        lastAutoSmokeError: safeCode,
        lastAutoSmokeFailedAt: new Date().toISOString()
      };
      return next;
    }).catch(() => {});
    throw error;
  }
}

export async function paradiseTestLabStatus() {
  const state = await loadState();
  const record = state.securityState?.[PARADISE_TEST_GUILD_ID] || {};
  const result = record.lastAutoSmokeResult || {};
  return {
    completed: record.lastAutoSmokeRevision === PARADISE_AUTO_SMOKE_REVISION,
    revision: record.lastAutoSmokeRevision || null,
    completedAt: record.lastAutoSmokeAt || null,
    lastError: record.lastAutoSmokeError || null,
    lastFailureAt: record.lastAutoSmokeFailedAt || null,
    trainingReady: Boolean(result.trainingMessageId),
    tryoutReady: Boolean(result.tryoutMessageId),
    trainingPlainMarkdown: result.trainingPlainMarkdown === true,
    tryoutPlainMarkdown: result.tryoutPlainMarkdown === true,
    trainingLifecycleReplies: Number(result.trainingLifecycleReplies || 0),
    tryoutLifecycleReplies: Number(result.tryoutLifecycleReplies || 0),
    leaderboardBoardCount: Number(result.leaderboardBoardCount || 0),
    staffTeamReady: result.staffTeamReady === true,
    supportTicketReady: Boolean(result.supportTicketChannelId),
    supportTicketTranscriptReady: result.supportTicketTranscriptReady === true,
    supportTicketReopenReady: result.supportTicketReopenReady === true,
    applicationPanelReady: result.applicationPanelReady === true,
    supportPanelReady: result.supportPanelReady === true,
    moderationPanelReady: result.moderationPanelReady === true,
    securityPanelReady: result.securityPanelReady === true,
    xpPanelReady: result.xpPanelReady === true,
    blacklistedRoleReady: result.blacklistedRoleReady === true,
    blacklistPermissionReady: result.blacklistPermissionReady === true,
    repairCreatedChannels: Number(result.repairCreatedChannels || 0),
    repairCreatedRoles: Number(result.repairCreatedRoles || 0)
  };
}

async function findRobloxUser(username) {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
  });
  const data = await res.json();
  return data.data?.[0] || null;
}

export function shortVerificationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "P";
  for (let index = 0; index < 5; index += 1) value += alphabet[crypto.randomInt(alphabet.length)];
  return value;
}

function verificationButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("paradise_verify_confirm").setLabel("I've added the code — Confirm").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("paradise_verify_retry").setLabel("New short code").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("paradise_verify_cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger)
  );
}

function verificationStartButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("paradise_verify_open").setLabel("Verify Roblox Account").setStyle(ButtonStyle.Primary)
  );
}

async function startVerification(interaction, username) {
  const user = await findRobloxUser(username);
  if (!user) return interaction.reply({ content: "Roblox user not found. Check the exact username and try again.", ephemeral: true });
  const code = shortVerificationCode();
  const state = await loadState();
  const expiryMinutes = Number(configForGuild(state, interaction.guildId).verification?.codeExpiryMinutes || 10);
  const challenge = {
    robloxId: String(user.id),
    username: user.name,
    code,
    expires: Date.now() + Math.min(30, Math.max(3, expiryMinutes)) * 60_000
  };
  verificationChallenges.set(interaction.user.id, challenge);
  await saveState(state => {
    state.verificationChallenges[interaction.user.id] = challenge;
    return state;
  });
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ ROBLOX VERIFICATION")
      .setDescription(`**Found:** ${user.name}\n\n## Step 1 — Copy this short code\n\`\`\`\n${code}\n\`\`\`\n## Step 2 — Add it to Roblox\nOpen your Roblox **About / Bio**, paste only this code and save.\n\n## Step 3 — Confirm\nPress the green button below. The code expires <t:${Math.floor(challenge.expires / 1000)}:R>.\n\n-# Short format is used to reduce Roblox text filtering. If it still becomes ####, request a new code.`)
      .setFooter(paradiseFooter("No screenshots accepted as automatic proof"))],
    components: [verificationButtons()],
    ephemeral: true
  });
}

async function verifyStart(interaction) {
  return startVerification(interaction, interaction.options.getString("username"));
}

async function verifyCheck(interaction) {
  const challenge = verificationChallenges.get(interaction.user.id)
    || (await loadState()).verificationChallenges[interaction.user.id];
  if (!challenge || challenge.expires < Date.now()) return interaction.reply({ content: "Start again with `/verifyroblox`.", ephemeral: true });
  const res = await fetch(`https://users.roblox.com/v1/users/${challenge.robloxId}`);
  const profile = await res.json();
  if (!String(profile.description || "").toUpperCase().includes(challenge.code)) {
    return interaction.reply({
      content: "Code not found in Roblox About yet. Save the profile, wait a few seconds, or use **New short code** if Roblox filtered it.",
      ephemeral: true
    });
  }
  const savedProfile = await saveVerifiedProfile(interaction.user.id, {
    robloxId: String(challenge.robloxId), robloxUsername: challenge.username, verifiedAt: new Date().toISOString()
  });
  verifiedProfiles.set(interaction.user.id, savedProfile);
  const role = await ensureRole(interaction.guild, "Verified Fighter");
  await interaction.member.roles.add(role);
  verificationChallenges.delete(interaction.user.id);
  await saveState(state => { delete state.verificationChallenges[interaction.user.id]; return state; });
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✓ ROBLOX VERIFIED")
      .setDescription(`Your Discord is now linked to **${challenge.username}**.\nYou can remove the code from your Roblox bio.\n\nPress **Create Fighter Profile** to choose your region.`)
      .setFooter(paradiseFooter("Identity verified"))],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("paradise_profile_create").setLabel("Create Fighter Profile").setStyle(ButtonStyle.Success)
    )],
    ephemeral: true
  });
}

async function verifiedProfile(discordId) {
  if (verifiedProfiles.has(discordId)) return verifiedProfiles.get(discordId);
  const profile = (await loadProfileStore())[discordId] || null;
  if (!profile) return null;
  verifiedProfiles.set(discordId, profile);
  return profile;
}

async function completedProfile(discordId) {
  const profile = await verifiedProfile(discordId);
  return profile?.profileId && profile?.region ? profile : null;
}

function fighterRank(member) {
  const ranks = [...member.roles.cache.values()].map(role => {
    const match = /^Stage ([0-4]) (Low|Mid|High) (Weak|Stable|Strong)$/.exec(role.name);
    return match ? { stage: Number(match[1]), level: match[2], strength: match[3] } : null;
  }).filter(Boolean).sort((a, b) => rankPower(b) - rankPower(a));
  return ranks[0] ? rankToRoleName(ranks[0]) : "Unranked";
}

async function robloxHeadshot(robloxId) {
  const response = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=150x150&format=Png&isCircular=false`).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json().catch(() => ({}));
  return payload.data?.[0]?.imageUrl || null;
}

async function profileEmbed(guild, discordId) {
  const profile = await completedProfile(discordId);
  if (!profile) return null;
  const member = await guild.members.fetch(discordId).catch(() => null);
  const thumbnail = await robloxHeadshot(profile.robloxId);
  const state = await loadState();
  const leaderboardRow = leaderboardForGuild(state, guild.id)[discordId] || {};
  const topSpot = leaderboardRow.spot || null;
  const storedRank = leaderboardRow.stageRank || profile.stageRank;
  const rank = storedRank?.stage != null ? rankToRoleName(storedRank)
    : member ? fighterRank(member) : "Unranked";
  const activeTicket = openChallengeFor(state, discordId, guild.id);
  const status = activeTicket ? "Being Challenged"
    : Number(leaderboardRow.availability?.loaUntil || 0) > Date.now() ? `LOA <t:${Math.floor(leaderboardRow.availability.loaUntil / 1000)}:R>`
      : Number(leaderboardRow.availability?.immunityUntil || 0) > Date.now() ? `Immunity <t:${Math.floor(leaderboardRow.availability.immunityUntil / 1000)}:R>`
        : Number(leaderboardRow.availability?.cooldownUntil || 0) > Date.now() ? `Cooldown <t:${Math.floor(leaderboardRow.availability.cooldownUntil / 1000)}:R>`
          : "Challengeable";
  const createdAt = Math.floor(new Date(profile.createdAt || profile.verifiedAt || Date.now()).getTime() / 1000);
  const updatedAt = Math.floor(new Date(profile.updatedAt || profile.profileUpdatedAt || profile.verifiedAt || Date.now()).getTime() / 1000);
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ PARADISE FIGHTER PROFILE")
    .setDescription(`## ${member || `<@${discordId}>`}\n-# Verified Roblox identity`)
    .addFields(
      { name: "Profile ID", value: `\`#${profile.profileId}\``, inline: true },
      { name: "Roblox", value: `**${profile.robloxUsername}**`, inline: true },
      { name: "Region", value: `**${profile.region}**`, inline: true },
      { name: "Rank", value: `**${rank}**`, inline: false },
      { name: "Leaderboard", value: topSpot ? `**Rank #${topSpot}**` : "**Unranked**", inline: true },
      { name: "Status", value: `**${status}**`, inline: true },
      { name: "Wins / Losses", value: `**${Number(leaderboardRow.wins || 0)} / ${Number(leaderboardRow.losses || 0)}**`, inline: true },
      { name: "Verification", value: "✓ Roblox About code confirmed", inline: true },
      { name: "Created / Updated", value: `<t:${createdAt}:D> · <t:${updatedAt}:R>`, inline: false }
    )
    .setFooter(paradiseFooter("Rank updates automatically after approved tryout results"));
  if (activeTicket) embed.addFields({ name: "Active challenge", value: `Ticket **#${activeTicket.ticketId || activeTicket.channelId || "open"}**`, inline: true });
  const notes = String(leaderboardRow.notes || leaderboardRow.feats || profile.notes || profile.feats || "").trim();
  if (notes) embed.addFields({ name: "Notes / Feats", value: notes.slice(0, 900), inline: false });
  if (thumbnail) embed.setThumbnail(thumbnail);
  return embed;
}

function profileRegionMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("paradise_profile_region").setPlaceholder("Choose your main server region")
      .addOptions(
        { label: "Frankfurt, Germany", value: "Frankfurt, Germany" },
        { label: "Paris, France", value: "Paris, France" },
        { label: "London, United Kingdom", value: "London, United Kingdom" },
        { label: "Amsterdam, Netherlands", value: "Amsterdam, Netherlands" }
      )
  );
}

async function beginProfileCreation(interaction) {
  const existing = await verifiedProfile(interaction.user.id);
  if (!existing) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("ROBLOX VERIFICATION REQUIRED")
        .setDescription("You must link your Roblox account before creating a Paradise fighter profile.")],
      components: [verificationStartButton()],
      ephemeral: true
    });
  }
  if (existing.profileId && existing.region) {
    const embed = await profileEmbed(interaction.guild, interaction.user.id);
    return interaction.reply({
      content: `You already have a Paradise fighter profile (ID: **#${existing.profileId}**).`,
      embeds: embed ? [embed] : [],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("paradise_profile_region_change").setLabel("Change Region").setStyle(ButtonStyle.Secondary)
      )],
      ephemeral: true
    });
  }
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ CHOOSE YOUR REGION")
      .setDescription("Choose the server region you normally use. Your rank is read from your full Stage–Level–Strength role.")],
    components: [profileRegionMenu()],
    ephemeral: true
  });
}

async function beginProfileRegionChange(interaction) {
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ CHANGE YOUR REGION")
      .setDescription("Choose your new main server region. Your Profile ID and verified Roblox account will stay unchanged.")],
    components: [profileRegionMenu()],
    ephemeral: true
  });
}

async function handleProfile(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "create") return beginProfileCreation(interaction);
  if (sub === "edit") {
    if (!await completedProfile(interaction.user.id)) return beginProfileCreation(interaction);
    return beginProfileRegionChange(interaction);
  }
  if (sub === "verify-status") {
    const profile = await verifiedProfile(interaction.user.id);
    const complete = Boolean(profile?.profileId && profile?.region);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ PROFILE VERIFICATION STATUS")
        .addFields(
          { name: "Roblox linked", value: profile?.robloxId ? "✓ Yes" : "✗ No", inline: true },
          { name: "Profile complete", value: complete ? "✓ Yes" : "✗ No", inline: true },
          { name: "Profile ID", value: profile?.profileId ? `#${profile.profileId}` : "Not assigned", inline: true },
          { name: "Region", value: profile?.region || "Not selected", inline: true }
        ).setFooter(paradiseFooter("Use /profile create or /profile edit"))],
      ephemeral: true
    });
  }
  const selectedUser = interaction.options.getUser("user");
  const requestedUserId = String(interaction.options.getString("user_id") || "").trim();
  const requestedProfileId = interaction.options.getInteger("profile_id");
  const requestedRoblox = String(interaction.options.getString("roblox_name") || "").trim().toLowerCase();
  const requestedQuery = String(interaction.options.getString("query") || "").trim().toLowerCase();
  let targetId = selectedUser?.id || (/^\d{16,22}$/.test(requestedUserId) ? requestedUserId : null);
  if (!targetId && (requestedProfileId || requestedRoblox || requestedQuery)) {
    const profiles = (await loadState()).profiles || {};
    const matches = [];
    for (const [discordId, profile] of Object.entries(profiles)) {
      const member = interaction.guild.members.cache.get(discordId);
      const exactProfile = requestedProfileId && Number(profile.profileId) === Number(requestedProfileId);
      const exactRoblox = requestedRoblox && String(profile.robloxUsername || "").toLowerCase() === requestedRoblox;
      const queryMatch = requestedQuery && [
        profile.robloxUsername,
        member?.displayName,
        member?.user?.username
      ].some(value => String(value || "").toLowerCase().includes(requestedQuery));
      if (exactProfile || exactRoblox || queryMatch) matches.push(discordId);
    }
    if (matches.length > 1) {
      const profilesById = (await loadState()).profiles || {};
      const menu = new StringSelectMenuBuilder().setCustomId("paradise_profile_lookup")
        .setPlaceholder("Choose the matching Paradise profile")
        .addOptions(...matches.slice(0, 25).map(id => {
          const member = interaction.guild.members.cache.get(id);
          const profile = profilesById[id] || {};
          return {
            label: String(member?.displayName || profile.robloxUsername || `Profile ${profile.profileId || id}`).slice(0, 100),
            description: `#${profile.profileId || "—"} · Roblox: ${profile.robloxUsername || "Not linked"}`.slice(0, 100),
            value: id
          };
        }));
      return interaction.reply({
        content: "Multiple profiles matched. Choose the correct profile:",
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
      });
    }
    targetId = matches[0] || null;
  }
  targetId ||= interaction.user.id;
  const embed = await profileEmbed(interaction.guild, targetId);
  if (!embed) return interaction.reply({ content: `<@${targetId}> has not completed a Paradise fighter profile.`, ephemeral: true });
  return interaction.reply({ embeds: [embed] });
}

async function handleProfileLookupSelect(interaction) {
  const targetId = interaction.values[0];
  const embed = await profileEmbed(interaction.guild, targetId);
  if (!embed) return interaction.update({ content: "That profile is no longer available.", embeds: [], components: [] });
  return interaction.update({ content: "", embeds: [embed], components: [] });
}

async function handleProfileRegion(interaction) {
  const region = interaction.values[0];
  let saved = null;
  await saveState(state => {
    const current = state.profiles[interaction.user.id];
    if (!current) return state;
    if (!current.profileId) {
      state.config.nextProfileId = Number(state.config.nextProfileId || 100) + 1;
      current.profileId = state.config.nextProfileId;
    }
    current.region = region;
    current.profileUpdatedAt = new Date().toISOString();
    current.updatedAt = current.profileUpdatedAt;
    state.profiles[interaction.user.id] = current;
    saved = current;
    return state;
  });
  if (!saved) return interaction.reply({ content: "Verify Roblox first.", ephemeral: true });
  verifiedProfiles.set(interaction.user.id, saved);
  const embed = await profileEmbed(interaction.guild, interaction.user.id);
  return interaction.update({ embeds: [embed], components: [] });
}

async function handleVerifyModal(interaction) {
  const username = interaction.fields.getTextInputValue("roblox_username").trim();
  return startVerification(interaction, username);
}

function roleRank(member) {
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)
    || member.roles.cache.some(r => ["Owner", "Overseer", "Training Manager"].includes(r.name))) {
    return { stage: 0, level: "High", strength: "Strong" };
  }
  for (const role of member.roles.cache.values()) {
    const match = /^Stage ([0-4]) (Low|Mid|High) (Weak|Stable|Strong)$/.exec(role.name);
    if (match) return { stage: Number(match[1]), level: match[2], strength: match[3] };
  }
  if (member.roles.cache.some(r => ["Tryout Hoster", "Trial Tryout Hoster", "Tryout Staff", "Trial Tryout Staff"].includes(r.name))) {
    return { stage: 3, level: "Low", strength: "Weak" };
  }
  return null;
}

async function assignRankRole(guild, member, rank) {
  const names = [];
  for (let stage = 0; stage <= 4; stage++) for (const level of LEVELS) for (const strength of STRENGTHS) {
    names.push(`Stage ${stage} ${level} ${strength}`);
  }
  const old = member.roles.cache.filter(r => names.includes(r.name));
  if (old.size) await member.roles.remove(old, "Paradise rank replacement");
  const role = await ensureRole(guild, rankToRoleName(rank));
  await member.roles.add(role, "Approved Paradise tryout result");
  return role;
}

async function handleTryout(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "start") {
    if (!roleRank(interaction.member)) return interaction.reply({ content: "Tryout Hoster role required.", ephemeral: true });
    const link = interaction.options.getString("link");
    const sessionId = crypto.randomUUID();
    const session = { id: sessionId, guildId: interaction.guildId, type: "tryout", hosterId: interaction.user.id, link, status: "open", startedAt: new Date().toISOString() };
    const state = await loadState();
    const guildConfig = configForGuild(state, interaction.guildId);
    const language = guildLanguage(guildConfig);
    const copy = sessionLanguageCopy(language, "tryout");
    const tryoutConfig = guildConfig.tryout || {};
    const controls = sessionControls(sessionId, "tryout", language);
    const tryoutPing = interaction.guild.roles.cache.find(role => ["Tryout Ping", "Re/Tryout Ping"].includes(role.name) || role.id === tryoutConfig.pingRoleId);
    const payload = {
      content: [
        tryoutPing ? `<@&${tryoutPing.id}>` : null,
        copy.title,
        copy.subtitle,
        "",
        "◇ Server:",
        tryoutConfig.defaultServer || "Frankfurt, Germany",
        "",
        "◇ Format:",
        "• FT2 — 1 agresif round",
        "• FT2 — 1 pasif round",
        "",
        "◇ Hoster:",
        `${interaction.user}`,
        "",
        "◇ Değerlendirme:",
        "RC timing, catch, dash tepkisi, movement, pressure, adaptasyon ve game sense.",
        "",
        "◇ Kurallar:",
        "• LH yok",
        "• 3M1 Reset yok",
        "• True Downslam yok",
        "• 2 RC yok",
        "• Wall yok",
        "• Overpassive yok",
        "• Alt hesap yok",
        "• Sırada vurmak yok",
        "• Sırayı terk etmek yok",
        "",
        "◇ Link:",
        link,
        "",
        "-# Lock after 1–5 minutes • Hoster-only controls • Made By Fieel"
      ].filter(Boolean).join("\n"),
      components: [controls],
      allowedMentions: { users: [interaction.user.id], roles: tryoutPing ? [tryoutPing.id] : [], parse: [] }
    };
    payload.content = tryoutAnnouncementMarkdown({
      language,
      pingRoleId: tryoutPing?.id,
      server: tryoutConfig.defaultServer || "Frankfurt, Germany",
      link,
      hoster: `${interaction.user}`
    });
    await interaction.deferReply({ ephemeral: true });
    const target = await configuredChannel(interaction.guild, "tryout_channel", "tryout") || interaction.channel;
    const announcement = await target.send(payload);
    session.channelId = target.id;
    session.messageId = announcement.id;
    activeTrainings.set(sessionId, session);
    await saveState(state => { state.trainings[sessionId] = session; return state; });
    return interaction.editReply(`${copy.started}: ${announcement.url}`);
  }
  const target = interaction.options.getUser("user");
  if (!await completedProfile(target.id)) return interaction.reply({ content: "Target must complete `/profile create` first.", ephemeral: true });
  const rank = {
    stage: interaction.options.getInteger("stage"),
    level: interaction.options.getString("level"),
    strength: interaction.options.getString("strength")
  };
  const authority = roleRank(interaction.member);
  if (!authority || !canAssignRank(authority, rank)) {
    return interaction.reply({ content: "You cannot assign this rank. Staff cannot exceed their own authority or assign below Stage 3 Low Weak.", ephemeral: true });
  }
  const id = crypto.randomUUID();
  const pendingRecord = { guildId: interaction.guildId, targetId: target.id, rank, hosterId: interaction.user.id, createdAt: new Date().toISOString() };
  pendingTryouts.set(id, pendingRecord);
  await saveState(state => { state.pendingTryouts[id] = pendingRecord; return state; });
  const rows = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_tryout_approve:${id}`).setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`paradise_tryout_deny:${id}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
  );
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Tryout Result — Pending")
    .addFields(
      { name: "User", value: `${target}`, inline: true },
      { name: "Assigned rank", value: rankToRoleName(rank), inline: true },
      { name: "Hoster", value: `${interaction.user}`, inline: true },
      { name: "Status", value: "Pending approval", inline: false }
    )], components: [rows] });
}

async function handleTryoutApproval(interaction) {
  const [action, id] = interaction.customId.replace("paradise_tryout_", "").split(":");
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
    && !interaction.member.roles.cache.some(r => ["Owner", "Overseer", "Training Manager"].includes(r.name))) {
    return interaction.reply({ content: "Training Manager or Overseer required.", ephemeral: true });
  }
  const pending = pendingTryouts.get(id) || (await loadState()).pendingTryouts[id];
  if (!pending) return interaction.reply({ content: "This pending result expired.", ephemeral: true });
  if (!belongsToGuild(pending, interaction.guildId)) return interaction.reply({ content: "This tryout result belongs to another server.", ephemeral: true });
  if (action === "deny") {
    pendingTryouts.delete(id);
    await saveState(state => { delete state.pendingTryouts[id]; return state; });
    return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(await paradiseBrandColor()).setTitle("Tryout Result — Denied")], components: [] });
  }
  const member = await interaction.guild.members.fetch(pending.targetId);
  const role = await assignRankRole(interaction.guild, member, pending.rank);
  await writeArtifact(`3a59-tryout-approved-${id}.json`, {
    status: "LIVE VERIFIED", ...pending, rankRoleId: role.id, approvedBy: interaction.user.id, approvedAt: new Date().toISOString()
  });
  pendingTryouts.delete(id);
  await saveState(state => { delete state.pendingTryouts[id]; return state; });
  return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(await paradiseBrandColor()).setTitle("Tryout Result — Approved")], components: [] });
}

function openChallengeFor(state, discordId, guildId = PARADISE_TEST_GUILD_ID) {
  return Object.values(state.pendingChallenges || {}).find(item =>
    belongsToGuild(item, guildId) && item.status === "open" && [item.challengerId, item.opponentId].includes(discordId));
}

export function challengeBlockReason(state, challengerId, opponentId, now = Date.now(), guildId = PARADISE_TEST_GUILD_ID) {
  if (challengerId === opponentId) return "You cannot challenge yourself.";
  const challengerTicket = openChallengeFor(state, challengerId, guildId);
  if (challengerTicket) {
    return `You already have an open challenge in <#${challengerTicket.ticketId}>. Close it before opening another.`;
  }
  const opponentTicket = openChallengeFor(state, opponentId, guildId);
  if (opponentTicket) {
    const otherId = opponentTicket.challengerId === opponentId ? opponentTicket.opponentId : opponentTicket.challengerId;
    return `That player is already in a challenge with <@${otherId}> in <#${opponentTicket.ticketId}>. You cannot challenge them until that ticket is closed.`;
  }
  const leaderboard = leaderboardForGuild(state, guildId);
  const challengerCooldown = Number(leaderboard?.[challengerId]?.availability?.cooldownUntil || 0);
  if (challengerCooldown > now) {
    return `You are currently on challenge cooldown. It expires <t:${Math.floor(challengerCooldown / 1000)}:R>.`;
  }
  const opponentImmunity = Number(leaderboard?.[opponentId]?.availability?.immunityUntil || 0);
  if (opponentImmunity > now) {
    return `That player is currently immune and cannot be challenged. Their immunity expires <t:${Math.floor(opponentImmunity / 1000)}:R>.`;
  }
  const challengerLoa = guildUserRecord(state.loa, guildId, challengerId);
  if (challengerLoa?.status === "approved" && Number(challengerLoa.expiresAt) > now) {
    return `Your active LOA blocks ranked challenges until <t:${Math.floor(challengerLoa.expiresAt / 1000)}:R>.`;
  }
  const opponentLoa = guildUserRecord(state.loa, guildId, opponentId);
  if (opponentLoa?.status === "approved" && Number(opponentLoa.expiresAt) > now) {
    return `That player is currently unavailable due to LOA until <t:${Math.floor(opponentLoa.expiresAt / 1000)}:R>.`;
  }
  return null;
}

function challengeRangeText(currentSpot, spots) {
  const labels = spots.map(spot => `**#${spot}**`);
  if (!Number.isInteger(Number(currentSpot))) return `As an unranked player, you may challenge ${labels.join(" or ")}.`;
  return `As rank **#${currentSpot}**, you may challenge ${labels.join(", ").replace(/, ([^,]*)$/, " or $1")}.`;
}

async function presentChallengeTargetMenu(interaction, region = null) {
  if (!await completedProfile(interaction.user.id)) {
    return interaction.reply({ content: "Complete `/profile create` before opening a challenge.", ephemeral: true });
  }
  const state = await loadState();
  const leaderboard = leaderboardForGuild(state, interaction.guildId);
  const currentSpot = Number(leaderboard[interaction.user.id]?.spot);
  if (!Number.isInteger(currentSpot)) {
    const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const minimum = configForGuild(state, interaction.guildId).challenge?.unrankedMinimumRank
      || { stage: 2, level: "High", strength: "Weak" };
    if (!meetsMinimumChallengeRank(strongestFighterRank(member), minimum)) {
      return interaction.reply({
        content: `You need at least **${rankToRoleName(minimum)}** to start challenging **#${challengeTargetSpots(null, configForGuild(state, interaction.guildId).challenge).join("/#")}**.`,
        ephemeral: true
      });
    }
  }
  const spots = challengeTargetSpots(Number.isInteger(currentSpot) ? currentSpot : null, configForGuild(state, interaction.guildId).challenge);
  const entries = Object.entries(leaderboard)
    .filter(([id, row]) => id !== interaction.user.id && spots.includes(Number(row.spot)))
    .sort((a, b) => Number(a[1].spot) - Number(b[1].spot));
  const candidates = [];
  for (const [discordId, row] of entries) {
    if (!await completedProfile(discordId)) continue;
    const member = await interaction.guild.members.fetch(discordId).catch(() => null);
    if (!member) continue;
    const block = challengeBlockReason(state, interaction.user.id, discordId, Date.now(), interaction.guildId);
    candidates.push({
      label: `#${row.spot} ${member.displayName}`.slice(0, 100),
      value: discordId,
      description: (block ? "Currently unavailable — select for details" : `Discord: ${discordId}`).slice(0, 100)
    });
  }
  if (!candidates.length) {
    return interaction.reply({
      content: `${challengeRangeText(Number.isInteger(currentSpot) ? currentSpot : null, spots)} No eligible profiled player is currently assigned to those positions.`,
      ephemeral: true
    });
  }
  challengeDrafts.set(interaction.user.id, { region, expires: Date.now() + 10 * 60_000 });
  const menu = new StringSelectMenuBuilder().setCustomId("paradise_challenge_target")
    .setPlaceholder("Select who to challenge…").addOptions(candidates.slice(0, 25));
  return interaction.reply({
    content: challengeRangeText(Number.isInteger(currentSpot) ? currentSpot : null, spots),
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true
  });
}

async function challengeHeaderEmbed(record) {
  const created = Math.floor(new Date(record.openedAt || Date.now()).getTime() / 1000);
  return new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("⚔️ LIVE CHALLENGE CONTEXT")
    .setDescription(`# <@${record.challengerId}> **vs** <@${record.opponentId}>\n-# Referees should never need to scroll to recover ticket context.`)
    .addFields(
      { name: "Ticket ID", value: `\`${record.ticketId}\``, inline: true },
      { name: "Opened", value: `<t:${created}:F>\n<t:${created}:R>`, inline: true },
      { name: "Status", value: `**${String(record.status || "open").toUpperCase()}**`, inline: true },
      { name: "Positions", value: `${record.challengerSpot ? `#${record.challengerSpot}` : "Unranked"} vs ${record.opponentSpot ? `#${record.opponentSpot}` : "Unranked"}`, inline: true },
      { name: "Region / Type", value: `${record.region || "Not selected"} · ${record.challengeType || "Ranked"}`, inline: true },
      { name: "Referee", value: record.refereeId ? `<@${record.refereeId}>` : "Not assigned", inline: true },
      { name: "Proof", value: record.proofRequired ? "Required" : "Optional", inline: true },
      { name: "Notes", value: record.note || "No notes.", inline: false }
    )
    .setFooter(paradiseFooter("Pinned and refreshed automatically"));
}

async function refreshChallengeHeader(guild, record) {
  const channel = guild.channels.cache.get(record.ticketId) || await guild.channels.fetch(record.ticketId).catch(() => null);
  if (!channel?.isTextBased?.()) return null;
  let message = record.headerMessageId ? await channel.messages.fetch(record.headerMessageId).catch(() => null) : null;
  const payload = { embeds: [await challengeHeaderEmbed(record)] };
  if (message) await message.edit(payload); else {
    message = await channel.send(payload);
    await message.pin("Paradise live challenge context").catch(() => {});
  }
  return message;
}

async function createChallengeTicket(interaction, opponent, region = null) {
  if (!await completedProfile(interaction.user.id) || !await completedProfile(opponent.id)) {
    return interaction.reply({ content: "Both fighters must complete `/profile create` first.", ephemeral: true });
  }
  const state = await loadState();
  const leaderboard = leaderboardForGuild(state, interaction.guildId);
  const currentSpot = Number(leaderboard[interaction.user.id]?.spot);
  const opponentSpot = Number(leaderboard[opponent.id]?.spot);
  const guildConfig = configForGuild(state, interaction.guildId);
  if (!Number.isInteger(currentSpot)) {
    const minimum = guildConfig.challenge?.unrankedMinimumRank || { stage: 2, level: "High", strength: "Weak" };
    const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!meetsMinimumChallengeRank(strongestFighterRank(member), minimum)) {
      return interaction.reply({
        content: `You need at least **${rankToRoleName(minimum)}** before opening an unranked challenge.`,
        ephemeral: true
      });
    }
  }
  const allowedSpots = challengeTargetSpots(Number.isInteger(currentSpot) ? currentSpot : null, guildConfig.challenge);
  if (!allowedSpots.includes(opponentSpot)) {
    return interaction.reply({
      content: `${challengeRangeText(Number.isInteger(currentSpot) ? currentSpot : null, allowedSpots)} <@${opponent.id}> is outside your allowed challenge range.`,
      ephemeral: true
    });
  }
  const block = challengeBlockReason(state, interaction.user.id, opponent.id, Date.now(), interaction.guildId);
  if (block) return interaction.reply({ content: block, ephemeral: true });
  const me = interaction.guild.members.me;
  const staffOverwrites = ["Owner", "Admin", "Overseer", "Referee Manager", "Head Referee", "Experienced Referee", "Referee", "Trial Referee"]
    .map(name => interaction.guild.roles.cache.find(role => role.name === name))
    .filter(Boolean)
    .map(role => ({
      id: role.id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
    }));
  const channel = await interaction.guild.channels.create({
    name: `challenge-${interaction.user.username}-${opponent.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90),
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: opponent.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels] },
      ...staffOverwrites
    ],
    reason: "Paradise verified challenge"
  });
  const record = {
    status: "open", guildId: interaction.guildId, ticketId: channel.id, challengerId: interaction.user.id,
    opponentId: opponent.id, region: region || null, challengerSpot: Number.isInteger(currentSpot) ? currentSpot : null,
    opponentSpot, challengeType: "Ranked", proofRequired: guildConfig.challenge?.proofRequired === true,
    openedAt: new Date().toISOString()
  };
  const header = await refreshChallengeHeader(interaction.guild, record);
  record.headerMessageId = header?.id || null;
  await channel.send({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("◆ CHALLENGE READY")
    .setDescription("Use `/challenge post` after the match, or `/challenge autowin` for an approved automatic-win reason.\n\n> Record the complete set and keep proof in this ticket.")
    .setFooter(paradiseFooter("Senior approval required"))] });
  await saveState(current => {
    current.pendingChallenges[channel.id] = record;
    return current;
  });
  challengeDrafts.delete(interaction.user.id);
  await updateAvailabilityPanel(interaction.guild).catch(() => {});
  return interaction.reply({ content: `Challenge ticket created: ${channel}`, ephemeral: true });
}

async function handleChallenge(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "create") {
    const opponent = interaction.options.getUser("opponent");
    const region = interaction.options.getString("region");
    return opponent ? createChallengeTicket(interaction, opponent, region) : presentChallengeTargetMenu(interaction, region);
  }
  if (sub === "close") {
    if (!await canApproveReferee(interaction.member)) {
      return interaction.reply({ content: "Experienced Referee, Head Referee or Referee Manager required.", ephemeral: true });
    }
    const state = await loadState();
    const ticket = state.pendingChallenges[interaction.channelId];
    if (!ticket || ticket.status !== "open") return interaction.reply({ content: "Run this inside an open Paradise challenge ticket.", ephemeral: true });
    const reason = interaction.options.getString("reason");
    const closed = {
      ...ticket,
      status: "closed",
      closeReason: reason,
      closedBy: interaction.user.id,
      closedAt: new Date().toISOString()
    };
    await saveState(next => { next.pendingChallenges[interaction.channelId] = closed; return next; });
    await interaction.channel.permissionOverwrites.edit(ticket.challengerId, { ViewChannel: false }).catch(() => {});
    await interaction.channel.permissionOverwrites.edit(ticket.opponentId, { ViewChannel: false }).catch(() => {});
    await refreshChallengeHeader(interaction.guild, closed).catch(() => {});
    await saveChallengeTranscript(interaction.guild, interaction.channel, closed, "manual_close").catch(() => {});
    await updateAvailabilityPanel(interaction.guild).catch(() => {});
    return interaction.reply({ content: `Challenge closed. Player access removed. Reason: **${reason}**`, ephemeral: true });
  }
  if (sub === "autowin") {
    if (!await canWorkReferee(interaction.member)) return interaction.reply({ content: "Referee role required.", ephemeral: true });
    const state = await loadState();
    const ticket = state.pendingChallenges[interaction.channelId];
    if (!ticket || ticket.status !== "open") return interaction.reply({ content: "Run `/challenge autowin` inside an open challenge ticket.", ephemeral: true });
    const winner = interaction.options.getUser("winner");
    if (![ticket.challengerId, ticket.opponentId].includes(winner.id)) {
      return interaction.reply({ content: "Winner must be one of the two fighters in this ticket.", ephemeral: true });
    }
    const loserId = winner.id === ticket.challengerId ? ticket.opponentId : ticket.challengerId;
    const loser = await interaction.client.users.fetch(loserId);
    const submissionId = crypto.randomUUID();
    const reason = interaction.options.getString("reason");
    const submission = {
      status: "pending",
      guildId: interaction.guildId,
      resultType: "autowin",
      winnerId: winner.id,
      loserId,
      score: "Auto",
      refereeId: interaction.user.id,
      winnerSpot: winner.id === ticket.challengerId ? ticket.challengerSpot : ticket.opponentSpot,
      loserSpot: loserId === ticket.challengerId ? ticket.challengerSpot : ticket.opponentSpot,
      note: `${reason}${interaction.options.getString("note") ? ` — ${interaction.options.getString("note")}` : ""}`,
      ticketId: interaction.channelId,
      createdAt: new Date().toISOString()
    };
    pendingChallenges.set(submissionId, submission);
    await saveState(next => { next.pendingChallenges[submissionId] = submission; return next; });
    const approvalRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`paradise_challenge_approve:${submissionId}`).setLabel("Approve Auto Win").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`paradise_challenge_deny:${submissionId}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
    );
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Automatic Win — Pending Approval")
        .setDescription(`# ${winner} **vs** ${loser}`)
        .addFields(
          { name: "Winner", value: `${winner}`, inline: true },
          { name: "Result", value: `**Auto — ${reason}**`, inline: true },
          { name: "Referee", value: `${interaction.user}`, inline: true },
          { name: "Ticket ID", value: interaction.channelId, inline: false }
        ).setFooter(paradiseFooter("Senior referee approval required"))],
      components: [approvalRow]
    });
  }
  const submittedWinner = interaction.options.getUser("winner");
  const submittedLoser = interaction.options.getUser("loser");
  const submittedScore = interaction.options.getString("score").trim().replace(/\s+to\s+to\s+/gi, " to ");
  if (!await completedProfile(submittedWinner.id) || !await completedProfile(submittedLoser.id)) {
    return interaction.reply({ content: "Winner and loser must both have completed Paradise fighter profiles.", ephemeral: true });
  }
  const submissionId = crypto.randomUUID();
  const submission = {
    status: "pending", guildId: interaction.guildId, winnerId: submittedWinner.id, loserId: submittedLoser.id, score: submittedScore,
    refereeId: interaction.user.id,
    winnerSpot: sub === "post" ? interaction.options.getInteger("winner_spot") : null,
    loserSpot: sub === "post" ? interaction.options.getInteger("loser_spot") : null,
    note: sub === "post" ? interaction.options.getString("note") : null,
    ticketId: sub === "post" ? (interaction.options.getString("ticket_id") || interaction.channelId) : interaction.channelId,
    createdAt: new Date().toISOString()
  };
  pendingChallenges.set(submissionId, submission);
  await saveState(state => { state.pendingChallenges[submissionId] = submission; return state; });
  const approvalRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_challenge_approve:${submissionId}`).setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`paradise_challenge_deny:${submissionId}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
  );
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Challenge Score — Pending Approval")
    .setDescription(`**${submittedWinner}${submission.winnerSpot ? ` (#${submission.winnerSpot})` : ""} vs ${submittedLoser}${submission.loserSpot ? ` (#${submission.loserSpot})` : ""}**`)
    .addFields(
      { name: "Score", value: submittedScore, inline: true },
      { name: "Referee", value: `${interaction.user}`, inline: true },
      { name: "Note", value: submission.note || "—", inline: false },
      { name: "Ticket ID", value: submission.ticketId || "—", inline: true },
      { name: "Status", value: "Pending Referee Manager / Experienced Referee approval", inline: false }
    ).setFooter({ text: "Made By Fieel" })], components: [approvalRow] });
  const winner = interaction.options.getUser("winner");
  const loser = interaction.options.getUser("loser");
  const score = interaction.options.getString("score").trim().replace(/\s+to\s+to\s+/gi, " to ");
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Challenge Result — Pending Approval")
    .setDescription(`${winner} defeated ${loser}`)
    .addFields({ name: "Score", value: score }, { name: "Referee", value: `${interaction.user}` })] });
}

export function canRoleNamesApproveScore(roleNames = [], isAdministrator = false) {
  return isAdministrator || roleNames.some(name =>
    ["Owner", "Overseer", "Referee Manager", "Head Referee", "Experienced Referee"].includes(name)
  );
}

async function memberHasParadisePermission(member, permission) {
  const administrator = member.permissions.has(PermissionsBitField.Flags.Administrator);
  const state = await loadState();
  const guildConfig = configForGuild(state, member.guild.id);
  const roles = [...member.roles.cache.values()];
  const roleKeys = paradiseRoleKeysForMember({
    roleIds: roles.map(role => role.id),
    roleNames: roles.map(role => role.name),
    mappings: guildConfig.roleMappings
  });
  return hasParadisePermission({
    permission,
    roleKeys,
    isOwner: administrator || member.guild.ownerId === member.id
  });
}

async function canWorkReferee(member) {
  return memberHasParadisePermission(member, PARADISE_PERMISSIONS.REFEREE_WORK);
}

async function canApproveReferee(member) {
  return memberHasParadisePermission(member, PARADISE_PERMISSIONS.REFEREE_APPROVE);
}

async function handleChallengeApproval(interaction) {
  if (!await canApproveReferee(interaction.member)) return interaction.reply({ content: "Referee Manager or Experienced Referee required.", ephemeral: true });
  const [action, id] = interaction.customId.replace("paradise_challenge_", "").split(":");
  const record = pendingChallenges.get(id) || (await loadState()).pendingChallenges[id];
  if (!record || record.status !== "pending") return interaction.reply({ content: "This score post is no longer pending.", ephemeral: true });
  if (action === "deny") {
    await saveState(state => {
      state.pendingChallenges[id] = { ...record, status: "denied", deniedBy: interaction.user.id, decidedAt: new Date().toISOString() };
      return state;
    });
    pendingChallenges.delete(id);
    return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(await paradiseBrandColor())
      .setTitle("Challenge Score — Denied").setFooter({ text: `Denied by ${interaction.user.username} • Made By Fieel` })], components: [] });
  }
  const now = Date.now();
  await saveState(state => {
    const challengeConfig = configForGuild(state, interaction.guildId).challenge || {};
    const leaderboard = ensureLeaderboardForGuild(state, interaction.guildId);
    const normalCooldownDays = Number(challengeConfig.cooldownDays || 3);
    const top10CooldownDays = Number(challengeConfig.top10CooldownDays || 7);
    const immunityDays = Number(challengeConfig.immunityDays || normalCooldownDays);
    const winner = leaderboard[record.winnerId] || { wins: 0, losses: 0, history: [] };
    const loser = leaderboard[record.loserId] || { wins: 0, losses: 0, history: [] };
    winner.wins = Number(winner.wins || 0) + 1;
    loser.losses = Number(loser.losses || 0) + 1;
    winner.spot = record.winnerSpot || winner.spot || null;
    loser.spot = record.loserSpot || loser.spot || null;
    const history = { resultId: id, winnerId: record.winnerId, loserId: record.loserId, score: record.score, at: new Date().toISOString() };
    winner.history = [...(winner.history || []), history].slice(-50);
    loser.history = [...(loser.history || []), history].slice(-50);
    loser.availability = {
      ...(loser.availability || {}),
      cooldownUntil: now + (record.loserSpot && record.loserSpot <= 10 ? top10CooldownDays : normalCooldownDays) * 86_400_000
    };
    winner.availability = {
      ...(winner.availability || {}),
      immunityUntil: now + (record.winnerSpot && record.winnerSpot <= 10 ? top10CooldownDays : immunityDays) * 86_400_000
    };
    leaderboard[record.winnerId] = winner;
    leaderboard[record.loserId] = loser;
    if (state.pendingChallenges[record.ticketId]?.status === "open") {
      state.pendingChallenges[record.ticketId] = {
        ...state.pendingChallenges[record.ticketId],
        status: "closed",
        resultType: record.resultType || "score",
        winnerId: record.winnerId,
        loserId: record.loserId,
        finalScore: record.score,
        refereeId: record.refereeId,
        approvedBy: interaction.user.id,
        closedAt: new Date().toISOString()
      };
    }
    state.pendingChallenges[id] = { ...record, status: "approved", approvedBy: interaction.user.id, decidedAt: new Date().toISOString() };
    const activity = state.staffActivity[record.refereeId] || {};
    activity.referee = [...(activity.referee || []), history.at];
    state.staffActivity[record.refereeId] = activity;
    return state;
  });
  pendingChallenges.delete(id);
  await updateAvailabilityPanel(interaction.guild).catch(() => {});
  const finalState = await loadState();
  const closedTicket = finalState.pendingChallenges[record.ticketId];
  const ticketChannel = interaction.guild.channels.cache.get(record.ticketId);
  if (ticketChannel && closedTicket) {
    await ticketChannel.permissionOverwrites.edit(closedTicket.challengerId, { ViewChannel: false }).catch(() => {});
    await ticketChannel.permissionOverwrites.edit(closedTicket.opponentId, { ViewChannel: false }).catch(() => {});
    await refreshChallengeHeader(interaction.guild, closedTicket).catch(() => {});
    await saveChallengeTranscript(interaction.guild, ticketChannel, closedTicket, "approved_result").catch(() => {});
  }
  const results = await configuredChannel(interaction.guild, "challenge_results_channel", "challenge-results");
  if (results) {
    await results.send({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(await paradiseBrandColor())
      .setTitle(record.resultType === "autowin" ? "Approved Automatic Win" : "Approved Challenge Result")
      .setFooter({ text: `Approved by ${interaction.user.username} • Made By Fieel` })] }).catch(() => {});
  }
  const works = await configuredChannel(interaction.guild, "referee_works_channel", "referee-works");
  if (works) await works.send({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(await paradiseBrandColor())
    .setTitle("Approved Referee Work").setFooter({ text: `Approved by ${interaction.user.username} • Made By Fieel` })] });
  return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(await paradiseBrandColor())
    .setTitle("Challenge Score — Approved").setFooter({ text: `Approved by ${interaction.user.username} • Made By Fieel` })], components: [] });
}

async function handleTraining(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "setup") {
    if (!canManageClan(interaction.member)) return interaction.reply({ content: "Training management role required.", ephemeral: true });
    const posted = await publishGuidePost(interaction.guild, GUIDE_POSTS.find(item => item.key === "training_rules"));
    return interaction.reply({ content: posted ? "Training handbook updated." : "Create `training-hoster-rules` first.", ephemeral: true });
  }
  if (sub === "start" || sub === "create") {
    const link = interaction.options.getString("link");
    const rules = interaction.options.getString("rules") || [
      "LH yok / 2M1 shove tech yok",
      "TDS yok / True Downslam yok",
      "Overpassive yok",
      "2 Ragdoll Cancel yok",
      "Wall abuse yok",
      "Sırada birbirinize vurmak yok",
      "Sırayı terk etmek yok"
    ].join("\n");
    const selectedHost = interaction.options.getUser("host") || interaction.user;
    if (selectedHost.id !== interaction.user.id && !canManageClan(interaction.member)) {
      return interaction.reply({ content: "Only training management can start a session for another host.", ephemeral: true });
    }
    const cohost = interaction.options.getUser("cohost");
    const sessionId = crypto.randomUUID();
    const session = {
      id: sessionId, guildId: interaction.guildId, type: "training", hosterId: selectedHost.id, createdBy: interaction.user.id,
      cohostId: cohost?.id || null, link, rules, status: "open", startedAt: new Date().toISOString()
    };
    const state = await loadState();
    const guildConfig = configForGuild(state, interaction.guildId);
    const language = guildLanguage(guildConfig);
    const trainingConfig = guildConfig.training || {};
    const controls = sessionControls(sessionId, "training", language);
    const defaultServer = String(trainingConfig.defaultServer || "Frankfurt, Germany").trim();
    const trainingPing = interaction.guild.roles.cache.find(role => role.name === "Training Ping" || role.id === trainingConfig.pingRoleId);
    const rulesLines = String(rules).split(/\r?\n/)
      .map(line => line.trim().replace(/^[-•◆◇]\s*/, ""))
      .filter(Boolean);
    const payload = {
      content: [
        trainingPing ? `<@&${trainingPing.id}>` : null,
        "# Training",
        "",
        "◇ Server:",
        defaultServer,
        "",
        "◇ Format:",
        trainingConfig.defaultFormat || "First To 3",
        "",
        "◇ Karakterler:",
        trainingConfig.characters || "Saitama, Garou, Metal Bat",
        "",
        "◇ Kurallar:",
        ...rulesLines.map(line => `• ${line}`),
        "",
        "◇ Link:",
        link,
        "",
        "◇ Hoster:",
        `<@${selectedHost.id}>${cohost ? ` • Co-hoster: ${cohost}` : ""}`,
        "",
        "-# Hoster-only controls • Made By Fieel"
      ].filter(Boolean).join("\n"),
      components: [controls],
      allowedMentions: { users: [selectedHost.id, ...(cohost ? [cohost.id] : [])], roles: trainingPing ? [trainingPing.id] : [] }
    };
    payload.content = trainingAnnouncementMarkdown({
      language,
      pingRoleId: trainingPing?.id,
      server: defaultServer,
      format: trainingConfig.defaultFormat || "First To 3",
      characters: trainingConfig.characters || "Saitama, Garou, Metal Bat",
      rules: rulesLines,
      link,
      hoster: `<@${selectedHost.id}>`,
      cohost: cohost ? `${cohost}` : null
    });
    await interaction.deferReply({ ephemeral: true });
    const target = await configuredChannel(interaction.guild, "training_channel", "training") || interaction.channel;
    const announcement = await target.send(payload);
    session.channelId = target.id;
    session.messageId = announcement.id;
    activeTrainings.set(sessionId, session);
    await saveState(state => { state.trainings[sessionId] = session; return state; });
    return interaction.editReply(`${sessionLanguageCopy(language, "training").started}: ${announcement.url}`);
  }
  const owned = [...activeTrainings.values()].find(item => belongsToGuild(item, interaction.guildId) && item.hosterId === interaction.user.id && item.status !== "ended")
    || Object.values((await loadState()).trainings).find(item => belongsToGuild(item, interaction.guildId) && item.hosterId === interaction.user.id && item.status !== "ended");
  if (!owned) return interaction.reply({ content: "You have no active training session.", ephemeral: true });
  const state = await loadState();
  if (configForGuild(state, interaction.guildId).verification?.requireProfileForTrainingResult !== false && !await completedProfile(interaction.user.id)) {
    return interaction.reply({ content: "Complete `/profile create` before submitting a training result.", ephemeral: true });
  }
  const result = {
    score: interaction.options.getString("score"),
    winner: interaction.options.getString("winner"),
    mvps: interaction.options.getString("mvps") || null,
    note: interaction.options.getString("note") || null,
    proof: interaction.options.getString("proof") || null
  };
  await finishSession(owned.id, interaction.user.id, {
    ...result
  });
  const resultText = [
    "# TRAINING ENDED",
    `## Score: ${result.score} — ${result.winner} won.`,
    `## MVPs: ${result.mvps || "Not recorded"}`,
    result.note ? `### Note\n${result.note}` : null,
    result.proof ? `### Proof\n${result.proof}` : null,
    "",
    `-# Hoster: ${interaction.user} • Activity counted automatically • Made By Fieel`
  ].filter(value => value !== null).join("\n");
  const originalChannel = interaction.guild.channels.cache.get(owned.channelId);
  const original = originalChannel?.isTextBased?.() ? await originalChannel.messages.fetch(owned.messageId).catch(() => null) : null;
  if (original) {
    await original.edit({ content: `${original.content}\n\n# ENDED`, embeds: [], components: [] }).catch(() => {});
    await original.reply({ content: resultText, allowedMentions: { parse: [] } }).catch(() => {});
  }
  const resultsChannel = await configuredChannel(interaction.guild, "training_results_channel", "training-results");
  if (resultsChannel) await resultsChannel.send({ content: resultText, allowedMentions: { parse: [] } }).catch(() => {});
  const activityChannel = await configuredChannel(interaction.guild, "activity_logs_channel", "activity-logs");
  if (activityChannel) await activityChannel.send({
    content: `# TRAINING ACTIVITY\n${resultText}`,
    allowedMentions: { parse: [] }
  }).catch(() => {});
  return interaction.reply({ content: `Training result saved.${resultsChannel ? ` Results: ${resultsChannel}` : ""}`, ephemeral: true });
}

async function finishSession(sessionId, hosterId, result = {}) {
  const completedAt = new Date().toISOString();
  await saveState(state => {
    const session = state.trainings[sessionId];
    if (!session || session.hosterId !== hosterId) return state;
    state.trainings[sessionId] = { ...session, ...result, status: "ended", completedAt };
    const activity = state.staffActivity[hosterId] || {};
    activity.training = [...(activity.training || []), completedAt];
    state.staffActivity[hosterId] = activity;
    return state;
  });
  const cached = activeTrainings.get(sessionId);
  if (cached) activeTrainings.set(sessionId, { ...cached, ...result, status: "ended", completedAt });
}

async function handleSessionButton(interaction) {
  const [action, sessionId] = interaction.customId.replace("paradise_session_", "").split(":");
  const state = await loadState();
  const session = activeTrainings.get(sessionId) || state.trainings[sessionId];
  const copy = sessionLanguageCopy(guildLanguage(configForGuild(state, interaction.guildId)), session?.type || "training");
  if (!session) return interaction.reply({ content: "Session not found.", ephemeral: true });
  if (!belongsToGuild(session, interaction.guildId)) return interaction.reply({ content: "This session belongs to another server.", ephemeral: true });
  if (session.hosterId !== interaction.user.id && !isOwner(interaction)) {
    return interaction.reply({ content: "Only the recorded hoster can use this button.", ephemeral: true });
  }
  if (action === "locked") {
    await saveState(state => {
      state.trainings[sessionId] = { ...state.trainings[sessionId], status: "locked", lockedAt: new Date().toISOString() };
      return state;
    });
    await interaction.deferUpdate();
    return interaction.message.reply({ content: copy.lockedReply, allowedMentions: { parse: [] } });
  }
  if (action === "unlocked") {
    await saveState(state => {
      state.trainings[sessionId] = { ...state.trainings[sessionId], status: "open", unlockedAt: new Date().toISOString() };
      return state;
    });
    await interaction.deferUpdate();
    return interaction.message.reply({ content: copy.unlockedReply, allowedMentions: { parse: [] } });
  }
  await finishSession(sessionId, session.hosterId);
  const ending = copy.endedReply;
  await interaction.update({
    content: interaction.message.content || "",
    embeds: [],
    components: []
  });
  return interaction.message.reply({ content: ending, allowedMentions: { parse: [] } });
}

function hasEventAuthority(interaction, roles) {
  return interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
    || interaction.member.roles.cache.some(role => ["Owner", "Overseer", ...roles].includes(role.name));
}

function initialBracket(participants) {
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, participants.length)));
  const seeded = [...participants, ...Array(size - participants.length).fill(null)];
  const matches = [];
  for (let index = 0; index < seeded.length; index += 2) {
    matches.push({ round: 1, match: matches.length + 1, players: [seeded[index], seeded[index + 1]], winner: seeded[index + 1] ? null : seeded[index] });
  }
  return { size, matches };
}

async function recordStaffActivity(userId, key, at = new Date().toISOString()) {
  await saveState(state => {
    const activity = state.staffActivity[userId] || {};
    activity[key] = [...(activity[key] || []), at];
    state.staffActivity[userId] = activity;
    return state;
  });
}

async function handleTournament(interaction) {
  if (!hasEventAuthority(interaction, ["Tournament Manager", "Event Manager"])) {
    return interaction.reply({ content: "Tournament Manager or owner role required.", ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  if (sub === "start-simple") {
    const id = crypto.randomUUID().slice(0, 8);
    const tournament = {
      id, mode: "simple", title: interaction.options.getString("title"),
      link: interaction.options.getString("link"), rules: interaction.options.getString("rules"),
      prize: interaction.options.getString("prize"), hosterId: interaction.user.id,
      status: "open", createdAt: new Date().toISOString()
    };
    await saveState(state => { state.tournaments[id] = tournament; return state; });
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(tournament.title)
      .setDescription(`**Server:** ${tournament.link}\n**Rules:** ${tournament.rules || "Standard Paradise tournament rules."}\n**Prize:** ${tournament.prize || "None announced"}`)
      .addFields({ name: "Tournament ID", value: id, inline: true }, { name: "Host", value: `${interaction.user}`, inline: true })
      .setFooter({ text: "Simple tournament • Made By Fieel" })] });
  }
  if (sub === "result-simple") {
    const winner = interaction.options.getUser("winner");
    await recordStaffActivity(interaction.user.id, "tournament");
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Tournament Winner")
      .setDescription(`${winner} won the tournament.`)
      .addFields({ name: "Proof", value: interaction.options.getString("proof") }, { name: "Recorded by", value: `${interaction.user}` })
      .setFooter({ text: "Made By Fieel" })] });
  }
  if (sub === "create-bracket") {
    const participants = [...new Set(interaction.options.getString("participants").split(",").map(value => value.replace(/\D/g, "")).filter(value => /^\d{15,22}$/.test(value)))];
    if (participants.length < 2 || participants.length > 64) return interaction.reply({ content: "Provide 2–64 comma-separated Discord user IDs.", ephemeral: true });
    const id = crypto.randomUUID().slice(0, 8);
    const bracket = initialBracket(participants);
    const tournament = {
      id, mode: "bracket", title: interaction.options.getString("title"), link: interaction.options.getString("link"),
      hosterId: interaction.user.id, status: "open", participants, ...bracket, createdAt: new Date().toISOString()
    };
    await saveState(state => { state.tournaments[id] = tournament; return state; });
    const lines = tournament.matches.map(item => `Match ${item.match}: ${item.players[0] ? `<@${item.players[0]}>` : "BYE"} vs ${item.players[1] ? `<@${item.players[1]}>` : "BYE"}${item.winner ? ` → <@${item.winner}> advances` : ""}`);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`${tournament.title} — Round 1`)
      .setDescription(lines.join("\n").slice(0, 4000))
      .addFields({ name: "Tournament ID", value: id }, { name: "Server", value: tournament.link })
      .setFooter({ text: "Bracket state is stored in PostgreSQL • Made By Fieel" })] });
  }
  const id = interaction.options.getString("tournament_id");
  const matchNumber = interaction.options.getInteger("match");
  const winner = interaction.options.getUser("winner");
  const state = await loadState();
  const tournament = state.tournaments[id];
  if (!tournament || tournament.mode !== "bracket") return interaction.reply({ content: "Bracket tournament not found.", ephemeral: true });
  const match = tournament.matches.find(item => item.match === matchNumber);
  if (!match || !match.players.includes(winner.id)) return interaction.reply({ content: "Winner must be one of the selected match players.", ephemeral: true });
  match.winner = winner.id;
  const roundComplete = tournament.matches.every(item => item.winner);
  if (roundComplete && tournament.matches.length > 1) {
    const next = [];
    const winners = tournament.matches.map(item => item.winner);
    for (let index = 0; index < winners.length; index += 2) next.push({ round: tournament.matches[0].round + 1, match: index / 2 + 1, players: [winners[index], winners[index + 1] || null], winner: winners[index + 1] ? null : winners[index] });
    tournament.matches = next;
  } else if (roundComplete) {
    tournament.status = "completed";
    tournament.winnerId = winner.id;
    await recordStaffActivity(interaction.user.id, "tournament");
  }
  await saveState(current => { current.tournaments[id] = tournament; return current; });
  return interaction.reply({ content: tournament.status === "completed" ? `Tournament complete: ${winner} won.` : `${winner} advanced. Bracket state updated.` });
}

async function handleGiveaway(interaction) {
  if (!hasEventAuthority(interaction, ["Giveaway Manager"])) return interaction.reply({ content: "Giveaway Manager or owner role required.", ephemeral: true });
  const endsAt = Date.now() + interaction.options.getInteger("minutes") * 60_000;
  const id = crypto.randomUUID();
  await recordStaffActivity(interaction.user.id, "giveaway");
  await saveState(state => {
    state.giveaways[id] = { prize: interaction.options.getString("prize"), endsAt, winners: interaction.options.getInteger("winners") || 1, entries: [], createdBy: interaction.user.id };
    return state;
  });
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`paradise_giveaway_enter:${id}`).setLabel("Enter Giveaway").setStyle(ButtonStyle.Success));
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`Giveaway: ${interaction.options.getString("prize")}`)
    .setDescription(`Ends <t:${Math.floor(endsAt / 1000)}:R>\nWinners: **${interaction.options.getInteger("winners") || 1}**\nRequirements: ${interaction.options.getString("requirements") || "Follow server rules."}`)
    .setFooter({ text: "Entries are opt-in • Made By Fieel" })], components: [row] });
}

async function handleCommunityEvent(interaction, type) {
  const role = type === "gamenight" ? "Game Night Manager" : "Event Manager";
  if (!hasEventAuthority(interaction, [role])) return interaction.reply({ content: `${role} or owner role required.`, ephemeral: true });
  await recordStaffActivity(interaction.user.id, type);
  const isGame = type === "gamenight";
  const image = interaction.options.getAttachment("image");
  if (!image?.contentType?.startsWith("image/")) return interaction.reply({ content: "A valid image attachment is required.", ephemeral: true });
  const title = isGame ? `Game Night: ${interaction.options.getString("game")}` : interaction.options.getString("title");
  const description = isGame
    ? `**Link:** ${interaction.options.getString("link")}\n**Notes:** ${interaction.options.getString("notes") || "Join, follow the host and have fun."}`
    : `**Time:** ${interaction.options.getString("time")}\n**Link:** ${interaction.options.getString("link") || "To be announced"}\n**Details:** ${interaction.options.getString("rules") || "Follow server rules."}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_rsvp_yes:${crypto.randomUUID()}`).setLabel("Going").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`paradise_rsvp_maybe:${crypto.randomUUID()}`).setLabel("Maybe").setStyle(ButtonStyle.Secondary)
  );
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(title).setDescription(description).setImage(image.url)
    .addFields({ name: "Host", value: `${interaction.user}` }).setFooter({ text: "Made By Fieel" })], components: [row] });
}

async function handleOptInButton(interaction) {
  if (interaction.customId.startsWith("paradise_giveaway_enter:")) {
    const id = interaction.customId.split(":")[1];
    const state = await loadState();
    const giveaway = state.giveaways[id];
    if (!giveaway || giveaway.endsAt < Date.now()) return interaction.reply({ content: "This giveaway has ended.", ephemeral: true });
    const entries = new Set(giveaway.entries || []);
    const removing = entries.has(interaction.user.id);
    if (removing) entries.delete(interaction.user.id); else entries.add(interaction.user.id);
    await saveState(current => { current.giveaways[id] = { ...giveaway, entries: [...entries] }; return current; });
    return interaction.reply({ content: removing ? "Giveaway entry removed." : "Giveaway entry recorded.", ephemeral: true });
  }
  const [choice, id] = interaction.customId.replace("paradise_rsvp_", "").split(":");
  await saveState(state => {
    state.rsvps[id] = { userId: interaction.user.id, choice, updatedAt: new Date().toISOString() };
    return state;
  });
  return interaction.reply({ content: `RSVP saved: ${choice}.`, ephemeral: true });
}

const DAILY_QUESTIONS = Object.freeze([
  { category: "TSB", prompt: "Saitama karakterinin normal isimli ilk yeteneği nedir?", answers: ["normal punch"] },
  { category: "TSB", prompt: "Garou karakterinin oyun içindeki unvanı nedir?", answers: ["hero hunter"] },
  { category: "TSB", prompt: "Training sonunda kullanılan iki ek etkinlikten birinin kısa adı nedir?", answers: ["ffa", "kotm"] },
  { category: "TSB", prompt: "FT3 ifadesindeki 3 neyi belirtir?", answers: ["3 galibiyet", "uc galibiyet", "ilk 3", "first to 3"] },
  { category: "Paradise", prompt: "Bir challenge sonucu onaylanmadan önce hangi iki tarafsız kanıt türünden biri saklanmalıdır?", answers: ["video", "kayit", "recording", "proof"] },
  { category: "Paradise", prompt: "Stage sisteminde en iyi stage numarası kaçtır?", answers: ["0", "stage 0"] },
  { category: "Paradise", prompt: "Stage 1 Low Strong'dan sonraki rank nedir?", answers: ["stage 1 mid weak", "1 mid weak"] },
  { category: "Community", prompt: "Bir tartışmada cevap vermeden önce yapılabilecek en iyi ilk adım nedir?", answers: ["sakinlesmek", "sakin olmak", "dinlemek", "beklemek"] },
  { category: "Community", prompt: "Güvenmediğin bir Discord bağlantısını açmadan önce ne yapmalısın?", answers: ["yetkiliye sor", "staffa sor", "raporla", "kontrol et"] },
  { category: "Life", prompt: "Bir hedefi sürdürülebilir hale getiren en önemli şeylerden biri nedir?", answers: ["duzen", "disiplin", "istikrar", "plan"] },
  { category: "Life", prompt: "Takım çalışmasında anlaşmazlığı azaltan temel davranış nedir?", answers: ["iletisim", "dinlemek", "saygi"] },
  { category: "Life", prompt: "Hesabını korumak için tek kullanımlık şifreye ek olarak açman gereken güvenlik özelliği nedir?", answers: ["2fa", "iki faktor", "iki adimli dogrulama"] }
]);

function berlinClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(now).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

function questionForDate(dateKey) {
  const seed = [...String(dateKey)].reduce((total, char) => total + char.charCodeAt(0), 0);
  return DAILY_QUESTIONS[seed % DAILY_QUESTIONS.length];
}

function qotdWinnerButtons(dateKey) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_qotd_gamepass:${dateKey}`).setLabel("Gamepass linkini ver").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`paradise_qotd_how:${dateKey}`).setLabel("Nasıl?").setStyle(ButtonStyle.Secondary)
  );
}

async function postDailyQuestion(guild, { force = false } = {}) {
  const state = await loadState();
  const config = configForGuild(state, guild.id);
  const eventSettings = config.eventSettings || {};
  if (!force && (config.activeSetupMode !== "clan" || eventSettings.dailyQuestionEnabled === false)) return null;
  const channel = await configuredChannel(guild, "question_channel", "question-of-the-day");
  if (!channel?.isTextBased?.()) return null;
  const clock = berlinClock();
  const existing = state.questionOfDay?.[guild.id];
  if (existing?.dateKey === clock.dateKey && existing?.messageId) return existing;
  const question = questionForDate(clock.dateKey);
  const rewardLabel = String(eventSettings.dailyQuestionReward || "25 Robux").slice(0, 80);
  const hour = Math.min(23, Math.max(0, Number(eventSettings.dailyQuestionHour ?? 13)));
  const message = await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(await paradiseBrandColor())
      .setTitle(`◆ GÜNÜN SORUSU · ${rewardLabel.toUpperCase()}`)
      .setDescription(`# ${question.prompt}\n\nDoğru cevabı bu kanala yaz. İlk doğru cevap kazanır.\n\n> Ödül otomatik ödenmez. Kazanan güvenli gamepass bağlantısını Paradise paneliyle gönderir; owner kontrol ederek öder.\n\n-# ${question.category} · Her gün ${String(hour).padStart(2, "0")}:00 Europe/Berlin · Made By Fieel`)
      .setTimestamp()]
  });
  const record = {
    guildId: guild.id, dateKey: clock.dateKey, category: question.category, prompt: question.prompt,
    acceptedAnswers: question.answers, messageId: message.id, channelId: channel.id,
    postedAt: new Date().toISOString(), winnerId: null, cancelledAt: null
  };
  await saveState(next => { next.questionOfDay[guild.id] = record; return next; });
  return record;
}

async function handleQotdCommand(interaction) {
  if (!isOwner(interaction) && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({ content: "Manage Server permission required.", ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  const state = await loadState();
  const current = state.questionOfDay?.[interaction.guildId];
  if (sub === "status") {
    return interaction.reply({
      content: current
        ? `Date: **${current.dateKey}** · status: **${current.cancelledAt ? "cancelled" : current.winnerId ? "won" : "open"}**${current.winnerId ? ` · winner: <@${current.winnerId}>` : ""}`
        : "No daily question has been posted for this server.",
      ephemeral: true
    });
  }
  if (sub === "cancel") {
    if (!current || current.winnerId) return interaction.reply({ content: "There is no open unanswered question.", ephemeral: true });
    await saveState(next => {
      next.questionOfDay[interaction.guildId] = { ...current, cancelledAt: new Date().toISOString() };
      return next;
    });
    return interaction.reply({ content: "Today's question was cancelled. No reward will be issued.", ephemeral: true });
  }
  const posted = await postDailyQuestion(interaction.guild, { force: true });
  return interaction.reply({ content: posted ? `Daily question is ready in <#${posted.channelId}>.` : "Create a question-of-the-day text channel first.", ephemeral: true });
}

async function handleQotdSlashAnswer(interaction) {
  const state = await loadState();
  const current = state.questionOfDay?.[interaction.guildId];
  if (!current || current.cancelledAt || current.winnerId) {
    return interaction.reply({ content: "Bugün cevaplanabilecek açık bir soru yok.", ephemeral: true });
  }
  if (interaction.channelId !== current.channelId) {
    return interaction.reply({ content: `Bu komut yalnızca <#${current.channelId}> kanalında kullanılabilir.`, ephemeral: true });
  }
  if (!isQuestionAnswerMatch(interaction.options.getString("answer"), current.acceptedAnswers)) {
    return interaction.reply({ content: "Bu cevap doğru değil; tekrar düşünebilirsin.", ephemeral: true });
  }
  let won = false;
  await saveState(next => {
    const latest = next.questionOfDay?.[interaction.guildId];
    if (latest && !latest.winnerId && !latest.cancelledAt && latest.dateKey === current.dateKey) {
      next.questionOfDay[interaction.guildId] = {
        ...latest, winnerId: interaction.user.id, winningInteractionId: interaction.id, wonAt: new Date().toISOString()
      };
      won = true;
    }
    return next;
  });
  if (!won) return interaction.reply({ content: "Başka biri senden hemen önce doğru cevap verdi.", ephemeral: true });
  return interaction.reply({
    content: `# Doğru bildin, ${interaction.user}!\n25 Robux ödülünü istemek için aşağıdaki butonu kullan.`,
    components: [qotdWinnerButtons(current.dateKey)]
  });
}

async function handleQotdAnswer(message, state) {
  const current = state.questionOfDay?.[message.guild.id];
  if (!current || current.cancelledAt || current.winnerId || current.channelId !== message.channelId) return false;
  if (!isQuestionAnswerMatch(message.content, current.acceptedAnswers)) return false;
  let won = false;
  await saveState(next => {
    const latest = next.questionOfDay?.[message.guild.id];
    if (latest && !latest.winnerId && !latest.cancelledAt && latest.dateKey === current.dateKey) {
      next.questionOfDay[message.guild.id] = {
        ...latest, winnerId: message.author.id, winningMessageId: message.id, wonAt: new Date().toISOString()
      };
      won = true;
    }
    return next;
  });
  if (!won) return false;
  await message.reply({
    content: `# Doğru bildin, ${message.author}!\n25 Robux ödülünü istemek için aşağıdaki butonu kullan. Gamepass bağlantısı yalnızca owner'a ve özel ödül loguna iletilir.`,
    components: [qotdWinnerButtons(current.dateKey)],
    allowedMentions: { repliedUser: true }
  });
  return true;
}

function validRobloxGamepassUrl(raw) {
  try {
    const url = new URL(String(raw || "").trim());
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && (hostname === "roblox.com" || hostname === "www.roblox.com" || hostname === "create.roblox.com")
      && (/game-pass|gamepass|passes/i.test(url.pathname) || url.searchParams.has("id"))
      ? url.toString().slice(0, 500)
      : null;
  } catch {
    return null;
  }
}

async function handleQotdButton(interaction) {
  const [action, dateKey] = interaction.customId.replace("paradise_qotd_", "").split(":");
  const current = (await loadState()).questionOfDay?.[interaction.guildId];
  if (!current || current.dateKey !== dateKey || current.winnerId !== interaction.user.id) {
    return interaction.reply({ content: "Bu ödül panelini yalnızca günün sorusunu kazanan kişi kullanabilir.", ephemeral: true });
  }
  if (action === "how") {
    return interaction.reply({
      content: "**Gamepass oluşturma:** Roblox Creator Dashboard → Creations → Experiences → ilgili oyun → Monetization/Passes → Create Pass. Fiyatı, owner'ın 25 Robux alımı sonrası net tutarı kontrol edebileceği şekilde ayarla ve yalnızca resmi Roblox bağlantısını gönder.",
      ephemeral: true
    });
  }
  if (current.gamepassSubmittedAt) {
    return interaction.reply({ content: "Gamepass bağlantın zaten owner'a iletildi.", ephemeral: true });
  }
  const modal = new ModalBuilder().setCustomId(`paradise_qotd_gamepass_modal:${dateKey}`).setTitle("25 Robux ödül bağlantısı");
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId("gamepass_url").setLabel("Resmî Roblox gamepass bağlantısı")
      .setPlaceholder("https://www.roblox.com/game-pass/...").setStyle(TextInputStyle.Short)
      .setMinLength(20).setMaxLength(500).setRequired(true)
  ));
  return interaction.showModal(modal);
}

async function handleQotdGamepassModal(interaction) {
  const dateKey = interaction.customId.split(":")[1];
  const current = (await loadState()).questionOfDay?.[interaction.guildId];
  if (!current || current.dateKey !== dateKey || current.winnerId !== interaction.user.id) {
    return interaction.reply({ content: "Ödül talebi artık geçerli değil.", ephemeral: true });
  }
  const gamepassUrl = validRobloxGamepassUrl(interaction.fields.getTextInputValue("gamepass_url"));
  if (!gamepassUrl) return interaction.reply({ content: "Yalnızca resmî bir Roblox/Create Roblox gamepass bağlantısı kabul edilir.", ephemeral: true });
  const owner = await interaction.guild.fetchOwner().catch(() => null);
  const rewardLog = await configuredChannel(interaction.guild, "payout_queue_channel", "payout-queue")
    || interaction.guild.channels.cache.find(channel => ["bot-logs", "staff-logs", "giveaway-results"].includes(channel.name) && channel.isTextBased?.());
  const payload = `QOTD reward claim · ${interaction.user} (${interaction.user.id}) · ${dateKey}\n${gamepassUrl}\nManual review required; Paradise does not auto-pay.`;
  const dmSent = owner ? await owner.send(payload).then(() => true).catch(() => false) : false;
  let queueMessageId = null;
  if (rewardLog) {
    const queueMessage = await rewardLog.send({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("◆ 25 ROBUX PAYOUT · PENDING")
        .setDescription(`Winner: ${interaction.user}\nDate: **${dateKey}**\n[Open official Roblox gamepass](${gamepassUrl})\n\n-# Manual owner/staff decision required. Paradise never auto-pays.`)
        .setFooter(paradiseFooter("Winner-verified submission"))],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`paradise_payout_paid:${dateKey}`).setLabel("Mark Paid").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`paradise_payout_invalid:${dateKey}`).setLabel("Invalid Link").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`paradise_payout_rejected:${dateKey}`).setLabel("Reject").setStyle(ButtonStyle.Danger)
      )]
    }).catch(() => null);
    queueMessageId = queueMessage?.id || null;
  }
  await saveState(next => {
    next.questionOfDay[interaction.guildId] = {
      ...current, gamepassUrl, gamepassSubmittedAt: new Date().toISOString(), ownerDmSent: dmSent,
      payoutStatus: "pending", payoutQueueMessageId: queueMessageId
    };
    return next;
  });
  return interaction.reply({ content: "Gamepass bağlantın güvenli şekilde kaydedildi ve owner incelemesine gönderildi.", ephemeral: true });
}

async function handleQotdPayoutReview(interaction) {
  if (!canApproveModeration(interaction.member)) return interaction.reply({ content: "Owner or senior staff approval required.", ephemeral: true });
  const [status, dateKey] = interaction.customId.replace("paradise_payout_", "").split(":");
  const current = (await loadState()).questionOfDay?.[interaction.guildId];
  if (!current || current.dateKey !== dateKey || current.payoutStatus !== "pending") {
    return interaction.reply({ content: "This payout is no longer pending.", ephemeral: true });
  }
  await saveState(next => {
    next.questionOfDay[interaction.guildId] = {
      ...current, payoutStatus: status, payoutReviewedBy: interaction.user.id, payoutReviewedAt: new Date().toISOString()
    };
    return next;
  });
  const winner = await interaction.client.users.fetch(current.winnerId).catch(() => null);
  await winner?.send(`Your ${dateKey} Paradise question reward was marked **${status}** by staff.`).catch(() => {});
  return interaction.update({
    embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setTitle(`◆ 25 ROBUX PAYOUT · ${status.toUpperCase()}`)
      .setFooter(paradiseFooter(`Reviewed by ${interaction.user.username}`))],
    components: []
  });
}

function paradiseApplicationPanelPayload(color, language = "tr") {
  const tr = language !== "en";
  return {
    embeds: [new EmbedBuilder().setColor(color).setTitle(tr ? "PARADISE BAŞVURULAR" : "PARADISE APPLICATIONS")
      .setDescription(tr
        ? "# Ekibe katıl\nPozisyonunu seç, formu dürüstçe doldur ve Paradise'ın gösterdiği özel başvuru durumunu takip et.\n\n- Aynı anda yalnızca bir aktif başvuru\n- Blacklistteki kullanıcılar başvuramaz\n- İnceleyenler kendi hiyerarşilerinin üstündeki rolleri veremez\n-# Açıklamalar seçili sunucu dilini kullanır."
        : "# Join the team\nChoose a position, answer the form honestly, then follow the private status shown by Paradise.\n\n- One active application at a time\n- Blacklisted users cannot apply\n- Reviewers cannot grant roles above their own hierarchy\n-# Explanations follow the selected server language.")
      .setFooter(paradiseFooter(tr ? "Özel inceleme kuyruğu" : "Private review queue"))],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("paradise_application_open").setLabel("Apply / Basvur").setEmoji("📝").setStyle(ButtonStyle.Primary)
    )]
  };
}

export function paradiseSupportPanelPayload(color) {
  return {
    embeds: [new EmbedBuilder().setColor(color).setTitle("PARADISE DESTEK")
      .setDescription("# Özel destek ticketı\nHesap, başvuru, ödeme, moderasyon veya sunucu yardımı için tek bir özel ticket aç.\n\n- Önce ticket kapatılır; transcript otomatik kaydedilir\n- Kapanınca üye erişimi kaldırılır, yetkililer erişimi korur\n- Silme yalnız güvenli transcript akışıyla yapılır\n- Şifre, cookie, token veya tam lisans anahtarı paylaşma\n\n-# Her üye aynı anda bir aktif destek ticketı açabilir.")],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("paradise_support_open").setLabel("Destek Ticketı Aç").setStyle(ButtonStyle.Primary)
    )]
  };
}

export function paradiseSupportTicketControls(ticketId, status = "open") {
  const normalized = String(status || "open").toLowerCase();
  if (normalized === "closed") {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`paradise_support_reopen:${ticketId}`).setLabel("Yeniden aç").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`paradise_support_delete:${ticketId}`).setLabel("Sil").setStyle(ButtonStyle.Danger)
    )];
  }
  if (normalized === "claimed") {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`paradise_support_unclaim:${ticketId}`).setLabel("Üstlenmeyi bırak").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`paradise_support_close:${ticketId}`).setLabel("Kapat").setStyle(ButtonStyle.Danger)
    )];
  }
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_support_claim:${ticketId}`).setLabel("Üstlen").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`paradise_support_close:${ticketId}`).setLabel("Kapat").setStyle(ButtonStyle.Danger)
  )];
}

function supportTicketStatusLabel(status = "open", language = "tr") {
  const normalized = String(status || "open").toLowerCase();
  if (language === "en") {
    if (normalized === "closed") return "CLOSED";
    if (normalized === "claimed") return "CLAIMED";
    if (normalized === "deleted") return "DELETED";
    return "OPEN";
  }
  if (normalized === "closed") return "KAPALI";
  if (normalized === "claimed") return "ÜSTLENİLDİ";
  if (normalized === "deleted") return "SİLİNDİ";
  return "AÇIK";
}

function paradiseSupportTicketDescription(record, language = "tr") {
  const status = supportTicketStatusLabel(record.status, language);
  const tr = language !== "en";
  const lines = [
    `${tr ? "Üye" : "Member"}: <@${record.userId}>`,
    `Ticket: \`${record.id.slice(0, 8)}\``,
    `${tr ? "Durum" : "Status"}: **${status}**`
  ];
  if (record.claimedBy) lines.push(`${tr ? "Üstlenen" : "Claimed by"}: <@${record.claimedBy}>`);
  lines.push("");
  if (String(record.status || "open").toLowerCase() === "open") lines.push(tr ? "Kapatıldığında transcript otomatik kaydedilir ve üye erişimi kaldırılır." : "Closing automatically saves a transcript and removes member access.");
  else if (String(record.status || "").toLowerCase() === "claimed") lines.push(tr ? "Bu ticket bir yetkili tarafından üstlenildi. Kapatma transcript'i otomatik kaydeder." : "A staff member claimed this ticket. Closing automatically saves a transcript.");
  else if (String(record.status || "").toLowerCase() === "closed") lines.push(tr ? "Ticket kapalı. Yeniden açabilir veya güvenli silme akışını başlatabilirsin. Silme, transcript kaydedilmeden devam etmez." : "This ticket is closed. You can reopen it or start the secure deletion flow. Deletion never continues without a transcript.");
  else lines.push(tr ? "Ticket silindi. Transcript ve güvenli denetim kaydı saklandı." : "The ticket was deleted. The transcript and safe audit record were retained.");
  return lines.join("\n");
}

async function paradiseSupportTicketEmbed(record) {
  const state = await loadState();
  const language = guildLanguage(configForGuild(state, record.guildId));
  const status = supportTicketStatusLabel(record.status, language);
  return new EmbedBuilder()
    .setColor(await paradiseBrandColor())
    .setTitle(language === "tr" ? `DESTEK TICKETI — ${status}` : `SUPPORT TICKET — ${status}`)
    .setDescription(paradiseSupportTicketDescription(record, language));
}

function supportTicketAudit(record, action, actorId, metadata = {}) {
  const history = Array.isArray(record.auditTrail) ? record.auditTrail.slice(-49) : [];
  return {
    ...record,
    auditTrail: [...history, {
      action: String(action || "unknown"),
      actorId: String(actorId || "system"),
      at: new Date().toISOString(),
      ...metadata
    }]
  };
}

// Ticket transcripts are private staff records, not a raw data export. Keep the
// useful conversation while removing common secrets before the attachment is sent.
export function maskParadiseTranscriptText(value) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[masked-email]")
    .replace(/\b(?:mfa\.[\w-]{20,}|[\w-]{24}\.[\w-]{6}\.[\w-]{20,})\b/g, "[masked-token]")
    .replace(/\bFIMA(?:-[A-Z0-9]{2,}){2,}\b/gi, "[masked-license-key]")
    .replace(/\b(?:hwid|machine|device)[\s:=#-]*[a-z0-9_-]{8,}\b/gi, "[masked-device-id]")
    .replace(/\b(?:[A-F0-9]{8}[-:]){3,}[A-F0-9]{4,}\b/gi, "[masked-id]")
    .replace(/@everyone|@here/gi, "@ blocked")
    .slice(0, 1800);
}

async function createParadiseSupportTicket(guild, user, sourceChannel, { test = false } = {}) {
  const state = await loadState();
  const existing = Object.values(state.supportTickets?.[guild.id] || {})
    .find(item => item.userId === user.id && ["open", "claimed"].includes(String(item.status || "open").toLowerCase()));
  if (existing) {
    const channel = guild.channels.cache.get(existing.channelId) || await guild.channels.fetch(existing.channelId).catch(() => null);
    if (channel) return { channel, record: existing, existing: true };
  }
  const ticketId = crypto.randomUUID();
  const safeName = String(user.username || "member").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 24) || "member";
  const staffRoles = [...guild.roles.cache.values()].filter(role => ["Owner", "Admin", "Overseer", "Manager", "Moderator", "Support Staff"].includes(role.name));
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
    { id: guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageMessages] },
    ...staffRoles.map(role => ({ id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }))
  ];
  const channel = await guild.channels.create({
    name: `${test ? "smoke-" : ""}support-${safeName}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: sourceChannel?.parentId || undefined,
    topic: `Paradise support ticket ${ticketId.slice(0, 8)}. Keep secrets masked.`,
    permissionOverwrites: overwrites,
    reason: test ? "Paradise live support-ticket smoke test" : "Paradise support ticket opened"
  });
  const record = {
    id: ticketId, guildId: guild.id, channelId: channel.id, userId: user.id,
    status: "open", test, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  await saveState(next => {
    next.supportTickets[guild.id] = next.supportTickets[guild.id] || {};
    next.supportTickets[guild.id][ticketId] = record;
    return next;
  });
  const header = await channel.send({
    content: `<@${user.id}>`,
    embeds: [await paradiseSupportTicketEmbed(record)],
    components: paradiseSupportTicketControls(ticketId),
    allowedMentions: { users: [user.id], roles: [], parse: [] }
  });
  await saveState(next => {
    next.supportTickets[guild.id][ticketId] = { ...record, headerMessageId: header.id };
    return next;
  });
  return { channel, record: { ...record, headerMessageId: header.id }, existing: false };
}

async function saveParadiseSupportTranscript(guild, channel, record, trigger) {
  const destination = await configuredChannel(guild, "support_transcripts_channel", "support-ticket-transcripts")
    || guild.channels.cache.find(item => item.name === "transcripts" && item.isTextBased?.());
  if (!destination || !channel?.isTextBased?.()) return null;
  const messages = [...(await channel.messages.fetch({ limit: 100 })).values()].reverse();
  const lines = messages.map(message => {
    const timestamp = message.createdAt?.toISOString?.() || "unknown";
    const author = message.author ? String(message.author.username || "unknown") : "unknown";
    const rawText = String(message.cleanContent || message.content || "[embed / attachment]").replace(/\r?\n/g, " ");
    const attachmentNote = message.attachments?.size ? ` [attachments:${message.attachments.size}]` : "";
    return `[${timestamp}] ${author}: ${maskParadiseTranscriptText(rawText)}${attachmentNote}`;
  });
  const sent = await destination.send({
    content: `Support transcript - Ticket **${record.id.slice(0, 8)}** - ${trigger}`,
    files: [{ attachment: Buffer.from(lines.join("\n"), "utf8"), name: `paradise-support-${record.id.slice(0, 8)}.txt` }]
  });
  return sent;
}

function persistSupportTranscript(next, guildId, ticketId, record, transcript, trigger, actorId) {
  const metadata = transcriptMetadataFromMessage(transcript, trigger);
  const updatedRecord = supportTicketAudit({ ...record, ...metadata }, "transcript_saved", actorId, {
    trigger: String(trigger || "manual"),
    transcriptMessageId: metadata.transcriptMessageId || null
  });
  next.supportTickets[guildId] = next.supportTickets[guildId] || {};
  next.supportTickets[guildId][ticketId] = updatedRecord;
  next.transcripts = next.transcripts || {};
  next.transcripts[`support:${guildId}:${ticketId}:${metadata.transcriptMessageId || Date.now()}`] = {
    type: "support",
    guildId,
    ticketId,
    trigger: String(trigger || "manual"),
    destinationChannelId: metadata.transcriptChannelId || null,
    messageId: metadata.transcriptMessageId || null,
    savedAt: metadata.transcriptSavedAt || new Date().toISOString()
  };
  return updatedRecord;
}

async function runParadiseSupportTicketLifecycleSmoke(guild, ticket) {
  const record = ticket?.record;
  const channel = ticket?.channel;
  if (!record?.test || !channel?.isTextBased?.()) return { skipped: true, reason: "test_ticket_required" };
  const transcript = await saveParadiseSupportTranscript(guild, channel, record, "smoke-close").catch(() => null);
  if (!transcript) {
    const error = new Error("smoke_support_transcript_failed");
    error.code = "smoke_support_transcript_failed";
    throw error;
  }
  const closed = {
    ...record,
    status: "closed",
    ...transcriptMetadataFromMessage(transcript, "smoke-close"),
    updatedAt: new Date().toISOString(),
    updatedBy: "system-test"
  };
  await channel.permissionOverwrites.edit(record.userId, { ViewChannel: false });
  await channel.setName(`closed-${channel.name.replace(/^closed-/, "")}`.slice(0, 90));
  const header = record.headerMessageId ? await channel.messages.fetch(record.headerMessageId).catch(() => null) : null;
  if (header) {
    await header.edit({
      embeds: [await paradiseSupportTicketEmbed(closed)],
      components: paradiseSupportTicketControls(record.id, "closed")
    });
  }
  await saveState(next => {
    next.supportTickets[guild.id] = next.supportTickets[guild.id] || {};
    persistSupportTranscript(next, guild.id, record.id, closed, transcript, "smoke-close", "system-test");
    return next;
  });

  const reopened = { ...closed, status: "open", updatedAt: new Date().toISOString(), updatedBy: "system-test" };
  await channel.permissionOverwrites.edit(record.userId, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true
  });
  await channel.setName(channel.name.replace(/^closed-/, "").slice(0, 90));
  if (header) {
    await header.edit({
      embeds: [await paradiseSupportTicketEmbed(reopened)],
      components: paradiseSupportTicketControls(record.id, "open")
    });
  }
  await saveState(next => {
    next.supportTickets[guild.id] = next.supportTickets[guild.id] || {};
    next.supportTickets[guild.id][record.id] = reopened;
    return next;
  });
  return { skipped: false, transcriptSaved: true, closedThenReopened: true };
}

function transcriptMetadataFromMessage(message, trigger) {
  if (!message) return {};
  return {
    transcriptChannelId: message.channelId,
    transcriptMessageId: message.id,
    transcriptUrl: message.url,
    transcriptSavedAt: new Date().toISOString(),
    transcriptTrigger: trigger
  };
}

async function showParadiseSupportDeleteConfirmation(interaction, record, ticketId) {
  if (String(record.status || "").toLowerCase() !== "closed") {
    return interaction.reply({ content: "Yalnız kapalı ticket silinebilir.", ephemeral: true });
  }
  const modal = new ModalBuilder()
    .setCustomId(`paradise_support_delete_confirm:${ticketId}`)
    .setTitle("Kapalı ticketı güvenle sil");
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId("confirmation")
      .setLabel(`Ticket ${record.id.slice(0, 8)} için DELETE yaz`)
      .setPlaceholder("DELETE")
      .setStyle(TextInputStyle.Short)
      .setMinLength(6)
      .setMaxLength(6)
      .setRequired(true)
  ));
  return interaction.showModal(modal);
}

async function handleParadiseSupportDeleteModal(interaction) {
  const ticketId = interaction.customId.split(":")[1];
  const supplied = interaction.fields.getTextInputValue("confirmation").trim().toUpperCase();
  if (supplied !== "DELETE") return interaction.reply({ content: "Silme onayı eşleşmedi; ticket korunuyor.", ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const state = await loadState();
  const record = state.supportTickets?.[interaction.guildId]?.[ticketId];
  const canDelete = canApproveModeration(interaction.member);
  if (!record || record.channelId !== interaction.channelId || !canDelete || String(record.status || "").toLowerCase() !== "closed") {
    return interaction.editReply({ content: "Bu kapalı ticketı silme yetkin yok veya ticket artık geçerli değil." });
  }
  const locked = supportTicketAudit({ ...record, deletionState: "transcript_pending" }, "delete_requested", interaction.user.id);
  await saveState(next => {
    next.supportTickets[interaction.guildId] = next.supportTickets[interaction.guildId] || {};
    next.supportTickets[interaction.guildId][ticketId] = locked;
    return next;
  });
  const transcript = await saveParadiseSupportTranscript(interaction.guild, interaction.channel, locked, "delete").catch(() => null);
  if (!transcript) {
    await saveState(next => {
      const current = next.supportTickets?.[interaction.guildId]?.[ticketId] || locked;
      next.supportTickets[interaction.guildId][ticketId] = supportTicketAudit({ ...current, deletionState: "transcript_failed" }, "delete_blocked", interaction.user.id, { reason: "transcript_unavailable" });
      return next;
    });
    await logParadiseAction(interaction.guild, "support_logs_channel", "support-logs", "Support ticket deletion blocked", `Ticket \`${record.id.slice(0, 8)}\` transcript could not be saved; the channel was kept.`).catch(() => null);
    return interaction.editReply({ content: "Transcript kaydedilemedi; ticket silinmedi ve yönetilebilir durumda bırakıldı." });
  }
  let deletedRecord = null;
  await saveState(next => {
    const current = next.supportTickets?.[interaction.guildId]?.[ticketId] || locked;
    deletedRecord = supportTicketAudit({
      ...persistSupportTranscript(next, interaction.guildId, ticketId, current, transcript, "delete", interaction.user.id),
      status: "deleted",
      deletedAt: new Date().toISOString(),
      deletedBy: interaction.user.id,
      deletionState: "ready"
    }, "deleted", interaction.user.id);
    next.supportTickets[interaction.guildId][ticketId] = deletedRecord;
    return next;
  });
  await logParadiseAction(interaction.guild, "support_logs_channel", "support-logs", "Support ticket deleted", `Ticket \`${record.id.slice(0, 8)}\` was transcripted and deleted by <@${interaction.user.id}>.`).catch(() => null);
  try {
    await interaction.channel.delete("Paradise transcript-first support ticket deletion");
    return interaction.editReply({ content: "Transcript kaydedildi ve ticket güvenle silindi." });
  } catch {
    await saveState(next => {
      const current = next.supportTickets?.[interaction.guildId]?.[ticketId] || deletedRecord || locked;
      next.supportTickets[interaction.guildId][ticketId] = supportTicketAudit({ ...current, status: "closed", deletionState: "channel_delete_failed" }, "delete_channel_failed", interaction.user.id);
      return next;
    });
    return interaction.editReply({ content: "Transcript kaydedildi fakat kanal silinemedi; ticket kapalı ve yönetilebilir bırakıldı." });
  }
}

async function handleParadiseSupportButton(interaction) {
  if (interaction.customId === "paradise_support_open") {
    const created = await createParadiseSupportTicket(interaction.guild, interaction.user, interaction.channel);
    return interaction.reply({ content: created.existing ? `You already have an open ticket: ${created.channel}` : `Support ticket opened: ${created.channel}`, ephemeral: true });
  }
  const [action, ticketId] = interaction.customId.replace("paradise_support_", "").split(":");
  const state = await loadState();
  const record = state.supportTickets?.[interaction.guildId]?.[ticketId];
  if (!record || record.channelId !== interaction.channelId) return interaction.reply({ content: "Support ticket record not found.", ephemeral: true });
  const isStaff = canModerate(interaction.member) || canApproveModeration(interaction.member);
  if (action !== "close" && !isStaff) return interaction.reply({ content: "Staff authority required.", ephemeral: true });
  if (action === "delete" && !canApproveModeration(interaction.member)) return interaction.reply({ content: "Ticket silme işlemi yalnız owner veya senior admin yetkisiyle yapılabilir.", ephemeral: true });
  if (action === "claim") {
    if (String(record.status || "open").toLowerCase() !== "open") return interaction.reply({ content: "Bu ticket artık üstlenilemez.", ephemeral: true });
    const claimed = supportTicketAudit({ ...record, status: "claimed", claimedBy: interaction.user.id, updatedAt: new Date().toISOString() }, "claimed", interaction.user.id);
    await saveState(next => {
      next.supportTickets[interaction.guildId][ticketId] = claimed;
      return next;
    });
    return interaction.update({
      embeds: [await paradiseSupportTicketEmbed(claimed)],
      components: paradiseSupportTicketControls(ticketId, "claimed")
    });
  }
  if (action === "unclaim") {
    if (String(record.status || "").toLowerCase() !== "claimed") return interaction.reply({ content: "Bu ticket üstlenilmiş durumda değil.", ephemeral: true });
    const reopened = supportTicketAudit({ ...record, status: "open", claimedBy: null, updatedAt: new Date().toISOString() }, "unclaimed", interaction.user.id);
    await saveState(next => { next.supportTickets[interaction.guildId][ticketId] = reopened; return next; });
    return interaction.update({ embeds: [await paradiseSupportTicketEmbed(reopened)], components: paradiseSupportTicketControls(ticketId, "open") });
  }
  if (action === "delete") return showParadiseSupportDeleteConfirmation(interaction, record, ticketId);
  if (!["close", "reopen"].includes(action)) return interaction.reply({ content: "Bilinmeyen ticket işlemi.", ephemeral: true });
  if (action === "close" && !["open", "claimed"].includes(String(record.status || "open").toLowerCase())) {
    return interaction.reply({ content: "Bu ticket zaten kapalı veya silinmiş durumda.", ephemeral: true });
  }
  if (action === "reopen" && String(record.status || "").toLowerCase() !== "closed") return interaction.reply({ content: "Yalnız kapalı ticket yeniden açılabilir.", ephemeral: true });
  const status = action === "reopen" ? "open" : "closed";
  let transcriptMeta = {};
  if (status === "closed") {
    const transcript = await saveParadiseSupportTranscript(interaction.guild, interaction.channel, { ...record, status }, "closed").catch(() => null);
    if (!transcript) {
      return interaction.reply({
        content: "Transcript kaydedilemedi; ticket kapatılmadı. Transcript/log kanalını ayarlayıp tekrar dene.",
        ephemeral: true
      });
    }
    transcriptMeta = transcriptMetadataFromMessage(transcript, "closed");
  }
  await interaction.channel.permissionOverwrites.edit(record.userId, { ViewChannel: status === "open" }).catch(() => {});
  await interaction.channel.setName(status === "open" ? interaction.channel.name.replace(/^closed-/, "") : `closed-${interaction.channel.name}`.slice(0, 90)).catch(() => {});
  let updatedRecord = supportTicketAudit({ ...record, status, ...transcriptMeta, updatedAt: new Date().toISOString(), updatedBy: interaction.user.id }, status === "closed" ? "closed" : "reopened", interaction.user.id);
  await saveState(next => {
    if (status === "closed" && transcriptMeta.transcriptMessageId) {
      updatedRecord = persistSupportTranscript(next, interaction.guildId, ticketId, updatedRecord, { channelId: transcriptMeta.transcriptChannelId, id: transcriptMeta.transcriptMessageId, url: transcriptMeta.transcriptUrl }, "closed", interaction.user.id);
    } else {
      next.supportTickets[interaction.guildId][ticketId] = updatedRecord;
    }
    return next;
  });
  await logParadiseAction(interaction.guild, "support_logs_channel", "support-logs", `Support ticket ${status}`,
    `Ticket \`${record.id.slice(0, 8)}\` was **${status}** by <@${interaction.user.id}>.${transcriptMeta.transcriptMessageId ? " Transcript saved." : ""}`).catch(() => null);
  if (!interaction.message) return interaction.reply({ content: `Ticket ${status === "closed" ? "kapatıldı" : "yeniden açıldı"}.`, ephemeral: true });
  return interaction.update({
    embeds: [await paradiseSupportTicketEmbed(updatedRecord)],
    components: paradiseSupportTicketControls(ticketId, status)
  });
}

function applicationLabel(type) {
  return APPLICATION_TYPES.find(([value]) => value === type)?.[1] || type;
}

function applicationTypeAllowedForMode(type, mode) {
  if (mode === "community") return !COMMUNITY_BLOCKED_APPLICATION_TYPES.has(type);
  if (mode === "tsbtr") return !TSBTR_BLOCKED_APPLICATION_TYPES.has(type);
  if (mode === "clan") return !COMMUNITY_ONLY_APPLICATION_TYPES.has(type);
  return true;
}

function applicationQuestions(type) {
  return APPLICATION_QUESTION_BANK_V2[type] || APPLICATION_QUESTION_BANK_V2.default
    || APPLICATION_QUESTION_BANK[type] || APPLICATION_QUESTION_BANK.default;
}

function applicationQuestionChunks(type) {
  const questions = applicationQuestions(type);
  const chunks = [];
  for (let index = 0; index < questions.length; index += DISCORD_APPLICATION_MODAL_LIMIT) {
    chunks.push(questions.slice(index, index + DISCORD_APPLICATION_MODAL_LIMIT));
  }
  return chunks.length ? chunks : [[]];
}

function applicationModal(type, step = 0, draftId = "new") {
  const chunks = applicationQuestionChunks(type);
  const safeStep = Math.min(Math.max(Number(step) || 0, 0), chunks.length - 1);
  const modal = new ModalBuilder()
    .setCustomId(`paradise_application_modal:${type}:${safeStep}:${draftId}`)
    .setTitle(`${applicationLabel(type)} ${safeStep + 1}/${chunks.length}`);
  modal.addComponents(...chunks[safeStep].map(([id, label, placeholder, style, min, max]) =>
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style)
        .setPlaceholder(placeholder).setMinLength(min).setMaxLength(max).setRequired(true)
    )));
  return modal;
}

function collectApplicationAnswers(interaction, type, step) {
  const chunk = applicationQuestionChunks(type)[step] || [];
  return Object.fromEntries(chunk.map(([key, label]) => [
    label,
    interaction.fields.getTextInputValue(key).trim()
  ]));
}

function applicationContinueComponents(draftId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`paradise_application_continue:${draftId}`)
      .setLabel("Devam et / Continue")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`paradise_application_cancel:${draftId}`)
      .setLabel("Iptal / Cancel")
      .setStyle(ButtonStyle.Secondary)
  )];
}

function maskApplicationReviewText(value, max = 700) {
  return compactText(String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:mfa\.[\w-]{20,}|[\w-]{24}\.[\w-]{6}\.[\w-]{27,})\b/g, "[token]")
    .replace(/\b[A-Fa-f0-9]{24,}\b/g, "[id]")
    .replace(/@everyone/g, "@\u200beveryone")
    .replace(/@here/g, "@\u200bhere"), max);
}

function applicationReviewStatus(action) {
  return action === "approve" ? "approved" : action === "deny" ? "denied" : "more_info";
}

function applicationReviewReasonModal(action, id) {
  const isMoreInfo = action === "more";
  return new ModalBuilder()
    .setCustomId(`paradise_application_review_reason:${action}:${id}`)
    .setTitle(isMoreInfo ? "Ask More Info" : "Deny Application")
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("review_reason")
        .setLabel(isMoreInfo ? "What should the applicant clarify?" : "Why is this application denied?")
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(5)
        .setMaxLength(700)
        .setPlaceholder(isMoreInfo
          ? "Example: Please explain your weekly availability and provide one previous staff example."
          : "Example: Not enough detail in moderation scenarios. Please apply again after improving your answers.")
        .setRequired(true)
    ));
}

function applicationReviewedEmbed(baseEmbed, record, status, reviewer, reviewReason = "", grantedRole = null) {
  const embed = baseEmbed
    ? EmbedBuilder.from(baseEmbed)
    : new EmbedBuilder().setColor(0x2f3136).setTitle(`Application · ${applicationLabel(record.type)}`);
  embed
    .setTitle(`Application · ${applicationLabel(record.type)} · ${status.toUpperCase().replace("_", " ")}`)
    .setFooter(paradiseFooter(`Reviewed by ${reviewer.username}`))
    .setTimestamp();
  if (reviewReason) embed.addFields({ name: status === "more_info" ? "Staff request" : "Review reason", value: reviewReason, inline: false });
  if (grantedRole) embed.addFields({ name: "Role granted", value: `<@&${grantedRole}>`, inline: false });
  return embed;
}

function applicationCooldownUntil(records, applicationSettings) {
  const latest = [...records].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  return (latest ? Date.parse(latest.createdAt) : 0)
    + Number(applicationSettings.cooldownDays ?? 7) * 86_400_000;
}

export async function paradiseWebsiteApplicationContext(guild, userId) {
  const member = await guild.members.fetch(userId).catch(() => null);
  const state = await loadState();
  const guildConfig = configForGuild(state, guild.id);
  const applicationSettings = guildConfig.applicationSettings || {};
  const records = Object.values(state.applications?.[guild.id] || {}).filter(item => item.userId === userId);
  const active = records.find(item => ["pending", "more_info"].includes(item.status));
  const cooldownUntil = applicationCooldownUntil(records, applicationSettings);
  return {
    guildId: guild.id,
    guildName: guild.name,
    member: Boolean(member),
    applicationsOpen: applicationSettings.enabled !== false,
    activeSetupMode: guildConfig.activeSetupMode || "community",
    blacklisted: state.blacklists?.[guild.id]?.[userId]?.status === "active",
    activeApplication: active ? {
      id: active.id.slice(0, 8), type: active.type, label: applicationLabel(active.type), status: active.status,
      createdAt: active.createdAt
    } : null,
    cooldownUntil: cooldownUntil > Date.now() ? new Date(cooldownUntil).toISOString() : null,
    types: APPLICATION_TYPES.filter(([type]) => applicationTypeAllowedForMode(type, guildConfig.activeSetupMode)).map(([type, label]) => ({
      type,
      label,
      questions: applicationQuestions(type).map(([key, questionLabel, placeholder, style, min, max]) => ({
        key, label: questionLabel, placeholder, multiline: style === TextInputStyle.Paragraph, min, max
      }))
    }))
  };
}

export async function submitParadiseWebsiteApplication(guild, { userId, type, answers, siteUserId = null }) {
  const context = await paradiseWebsiteApplicationContext(guild, userId);
  if (!context.member) throw Object.assign(new Error("discord_membership_required"), { code: "discord_membership_required", statusCode: 403 });
  if (!context.applicationsOpen) throw Object.assign(new Error("applications_closed"), { code: "applications_closed", statusCode: 409 });
  if (context.blacklisted) throw Object.assign(new Error("blacklisted_users_cannot_apply"), { code: "blacklisted_users_cannot_apply", statusCode: 403 });
  if (context.activeApplication) throw Object.assign(new Error("active_application_exists"), { code: "active_application_exists", statusCode: 409 });
  if (context.cooldownUntil) throw Object.assign(new Error("application_cooldown_active"), {
    code: "application_cooldown_active", statusCode: 429, cooldownUntil: context.cooldownUntil
  });
  const selected = context.types.find(item => item.type === type);
  if (!selected) throw Object.assign(new Error("application_type_unavailable"), { code: "application_type_unavailable", statusCode: 400 });
  const normalizedAnswers = {};
  for (const question of selected.questions) {
    const value = String(answers?.[question.key] || "").trim();
    if (value.length < question.min || value.length > question.max) {
      throw Object.assign(new Error("invalid_application_answer"), {
        code: "invalid_application_answer", statusCode: 400, question: question.key
      });
    }
    normalizedAnswers[question.label] = value;
  }
  const id = crypto.randomUUID();
  const record = {
    id, guildId: guild.id, userId, type, answers: normalizedAnswers, source: "fima_website",
    siteUserId, status: "pending", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  await saveState(next => {
    next.applications = next.applications || {};
    next.applications[guild.id] = next.applications[guild.id] || {};
    next.applications[guild.id][id] = record;
    return next;
  });
  const review = await configuredChannel(guild, "application_review_channel", "application-reviews");
  let reviewMessage = null;
  if (review) {
    reviewMessage = await review.send({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`Application · ${applicationLabel(type)}`)
        .setDescription(`Applicant: <@${userId}>\nApplication ID: \`${id.slice(0, 8)}\`\nSource: **Fima website**`)
        .addFields(Object.entries(normalizedAnswers).map(([label, value]) => ({ name: label, value: maskApplicationReviewText(value, 1024), inline: false })))
        .setFooter(paradiseFooter("Pending private review")).setTimestamp()],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`paradise_application_approve:${id}`).setLabel("Approve").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`paradise_application_more:${id}`).setLabel("Ask More Info").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`paradise_application_deny:${id}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
      )]
    }).catch(() => null);
    if (reviewMessage) {
      await saveState(next => {
        next.applications = next.applications || {};
        next.applications[guild.id] = next.applications[guild.id] || {};
        next.applications[guild.id][id] = {
          ...(next.applications[guild.id][id] || record),
          reviewChannelId: review.id,
          reviewMessageId: reviewMessage.id,
          updatedAt: new Date().toISOString()
        };
        return next;
      });
    }
  }
  await logParadiseAction(guild, "application_logs_channel", "application-logs", "Website application submitted",
    `<@${userId}> submitted **${applicationLabel(type)}** from the Fima website · \`${id.slice(0, 8)}\`.`);
  return {
    id: id.slice(0, 8), status: "pending", type, label: applicationLabel(type),
    reviewQueued: Boolean(reviewMessage), createdAt: record.createdAt
  };
}

async function handleApplicationCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "panel") {
    if (!canManageClan(interaction.member)) return interaction.reply({ content: "Application management authority required.", ephemeral: true });
    const channel = await configuredChannel(interaction.guild, "application_ticket_channel", "application-ticket") || interaction.channel;
    const language = guildLanguage(configForGuild(await loadState(), interaction.guildId));
    await channel.send(paradiseApplicationPanelPayload(await paradiseBrandColor(), language));
    return interaction.reply({ content: `Application panel posted in ${channel}.`, ephemeral: true });
  }
  const state = await loadState();
  const records = Object.values(state.applications?.[interaction.guildId] || {}).filter(item => item.userId === interaction.user.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (sub === "status") {
    const latest = records[0];
    return interaction.reply({
      content: latest
        ? `Latest application: **${applicationLabel(latest.type)}** · **${latest.status}** · <t:${Math.floor(Date.parse(latest.updatedAt || latest.createdAt) / 1000)}:R>`
        : "You have not submitted an application in this server.",
      ephemeral: true
    });
  }
  if (state.blacklists?.[interaction.guildId]?.[interaction.user.id]?.status === "active") {
    return interaction.reply({ content: "Active blacklist records block applications. Use the appeal flow first.", ephemeral: true });
  }
  const pending = records.find(item => ["pending", "more_info"].includes(item.status));
  if (pending) return interaction.reply({ content: `You already have an active **${applicationLabel(pending.type)}** application.`, ephemeral: true });
  const cooldownDays = Number(configForGuild(state, interaction.guildId).applicationSettings?.cooldownDays ?? 7);
  const latestAt = records[0] ? Date.parse(records[0].createdAt) : 0;
  const cooldownUntil = latestAt + cooldownDays * 86_400_000;
  if (cooldownUntil > Date.now()) {
    return interaction.reply({ content: `Application cooldown ends <t:${Math.floor(cooldownUntil / 1000)}:R>.`, ephemeral: true });
  }
  return interaction.showModal(applicationModal(interaction.options.getString("type"), 0, "new"));
}

async function handleApplicationModal(interaction) {
  const [, type, rawStep = "0", draftId = "new"] = interaction.customId.split(":");
  const chunks = applicationQuestionChunks(type);
  const step = Math.min(Math.max(Number(rawStep) || 0, 0), chunks.length - 1);
  if (!APPLICATION_TYPES.some(([value]) => value === type)) {
    return interaction.reply({ content: "Unknown application type.", ephemeral: true });
  }
  const submittedAnswers = collectApplicationAnswers(interaction, type, step);
  const state = await loadState();
  const guildConfig = configForGuild(state, interaction.guildId);
  const applicationSettings = guildConfig.applicationSettings || {};
  if (!applicationTypeAllowedForMode(type, guildConfig.activeSetupMode)) {
    return interaction.reply({ content: "This application type is not available for the active server template.", ephemeral: true });
  }
  if (applicationSettings.enabled === false) return interaction.reply({ content: "Applications are currently closed.", ephemeral: true });
  if (state.blacklists?.[interaction.guildId]?.[interaction.user.id]?.status === "active") {
    return interaction.reply({ content: "Active blacklist records block applications.", ephemeral: true });
  }
  const previous = Object.values(state.applications?.[interaction.guildId] || {}).filter(item => item.userId === interaction.user.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (previous.some(item => ["pending", "more_info"].includes(item.status))) {
    return interaction.reply({ content: "You already have an active application.", ephemeral: true });
  }
  const cooldownUntil = (previous[0] ? Date.parse(previous[0].createdAt) : 0)
    + Number(applicationSettings.cooldownDays ?? 7) * 86_400_000;
  if (cooldownUntil > Date.now()) {
    return interaction.reply({ content: `Application cooldown ends <t:${Math.floor(cooldownUntil / 1000)}:R>.`, ephemeral: true });
  }
  const existingDraft = draftId !== "new" ? state.applicationDrafts?.[interaction.guildId]?.[draftId] : null;
  if (draftId !== "new") {
    if (!existingDraft || existingDraft.userId !== interaction.user.id || existingDraft.type !== type) {
      return interaction.reply({ content: "This application draft is no longer available. Please start again.", ephemeral: true });
    }
    if (Date.parse(existingDraft.expiresAt || 0) < Date.now()) {
      await saveState(next => {
        if (next.applicationDrafts?.[interaction.guildId]) delete next.applicationDrafts[interaction.guildId][draftId];
        return next;
      });
      return interaction.reply({ content: "This application draft expired. Please start again.", ephemeral: true });
    }
    if (Number(existingDraft.nextStep) !== step) {
      return interaction.reply({
        content: `This application is waiting for step ${Number(existingDraft.nextStep) + 1}/${chunks.length}.`,
        components: applicationContinueComponents(draftId),
        ephemeral: true
      });
    }
  }
  const mergedAnswers = { ...(existingDraft?.answers || {}), ...submittedAnswers };
  if (step < chunks.length - 1) {
    const activeDraftId = draftId === "new" ? crypto.randomUUID() : draftId;
    const now = new Date().toISOString();
    await saveState(next => {
      next.applicationDrafts = next.applicationDrafts || {};
      next.applicationDrafts[interaction.guildId] = next.applicationDrafts[interaction.guildId] || {};
      next.applicationDrafts[interaction.guildId][activeDraftId] = {
        id: activeDraftId,
        guildId: interaction.guildId,
        userId: interaction.user.id,
        type,
        answers: mergedAnswers,
        nextStep: step + 1,
        totalSteps: chunks.length,
        createdAt: existingDraft?.createdAt || now,
        updatedAt: now,
        expiresAt: new Date(Date.now() + APPLICATION_DRAFT_TTL_MS).toISOString()
      };
      return next;
    });
    return interaction.reply({
      content: `Basvuru bolumu kaydedildi: **${step + 1}/${chunks.length}**. Sonraki bolumu doldurmak icin devam et.`,
      components: applicationContinueComponents(activeDraftId),
      ephemeral: true
    });
  }
  const id = crypto.randomUUID();
  const record = {
    id, guildId: interaction.guildId, userId: interaction.user.id, type, answers: mergedAnswers,
    status: "pending", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  await saveState(next => {
    next.applications = next.applications || {};
    next.applications[interaction.guildId] = next.applications[interaction.guildId] || {};
    next.applications[interaction.guildId][id] = record;
    if (draftId !== "new" && next.applicationDrafts?.[interaction.guildId]) {
      delete next.applicationDrafts[interaction.guildId][draftId];
    }
    return next;
  });
  const review = await configuredChannel(interaction.guild, "application_review_channel", "application-reviews");
  let reviewMessage = null;
  if (review) {
    const fields = Object.entries(mergedAnswers).map(([key, value]) => ({
      name: key[0].toUpperCase() + key.slice(1), value: maskApplicationReviewText(value, 1024), inline: false
    }));
    reviewMessage = await review.send({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`Application - ${applicationLabel(type)}`)
        .setDescription(`Applicant: ${interaction.user}\nApplication ID: \`${id.slice(0, 8)}\``)
        .addFields(fields).setFooter(paradiseFooter("Pending review")).setTimestamp()],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`paradise_application_approve:${id}`).setLabel("Approve").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`paradise_application_more:${id}`).setLabel("Ask More Info").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`paradise_application_deny:${id}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
      )]
    });
    await saveState(next => {
      next.applications = next.applications || {};
      next.applications[interaction.guildId] = next.applications[interaction.guildId] || {};
      next.applications[interaction.guildId][id] = {
        ...(next.applications[interaction.guildId][id] || record),
        reviewChannelId: review.id,
        reviewMessageId: reviewMessage.id,
        updatedAt: new Date().toISOString()
      };
      return next;
    });
  }
  await logParadiseAction(interaction.guild, "application_logs_channel", "application-logs", "Application submitted",
    `${interaction.user} submitted **${applicationLabel(type)}** - \`${id.slice(0, 8)}\`.`);
  return interaction.reply({ content: review ? "Application submitted for private staff review." : "Application saved. Staff must map an application review channel.", ephemeral: true });
}

async function handleApplicationContinueButton(interaction) {
  const draftId = interaction.customId.split(":")[1];
  const state = await loadState();
  const draft = state.applicationDrafts?.[interaction.guildId]?.[draftId];
  if (!draft || draft.userId !== interaction.user.id) {
    return interaction.reply({ content: "This application step is no longer available. Start the application again.", ephemeral: true });
  }
  if (Date.parse(draft.expiresAt || 0) < Date.now()) {
    await saveState(next => {
      if (next.applicationDrafts?.[interaction.guildId]) delete next.applicationDrafts[interaction.guildId][draftId];
      return next;
    });
    return interaction.reply({ content: "This application draft expired. Start the application again.", ephemeral: true });
  }
  return interaction.showModal(applicationModal(draft.type, draft.nextStep, draftId));
}

async function handleApplicationCancelButton(interaction) {
  const draftId = interaction.customId.split(":")[1];
  const state = await loadState();
  const draft = state.applicationDrafts?.[interaction.guildId]?.[draftId];
  if (!draft || draft.userId !== interaction.user.id) {
    return interaction.reply({ content: "This application draft is already gone. You can start a new application anytime.", ephemeral: true });
  }
  await saveState(next => {
    if (next.applicationDrafts?.[interaction.guildId]) delete next.applicationDrafts[interaction.guildId][draftId];
    return next;
  });
  return interaction.update({
    content: "Basvuru taslagi iptal edildi. Istersen panelden tekrar baslayabilirsin. / Application draft cancelled.",
    embeds: [],
    components: []
  });
}

function canReviewApplications(member) {
  return member.permissions.has(PermissionsBitField.Flags.ManageGuild)
    || member.roles.cache.some(role => ["Owner", "Admin", "Overseer", "Community Manager", "Administration Manager"].includes(role.name));
}

async function handleApplicationReview(interaction) {
  if (!canReviewApplications(interaction.member)) return interaction.reply({ content: "Application reviewer authority required.", ephemeral: true });
  const [action, id] = interaction.customId.replace("paradise_application_", "").split(":");
  if (["deny", "more"].includes(action)) {
    return interaction.showModal(applicationReviewReasonModal(action, id));
  }
  return finalizeApplicationReview(interaction, action, id);
}

async function handleApplicationReviewReasonModal(interaction) {
  if (!canReviewApplications(interaction.member)) return interaction.reply({ content: "Application reviewer authority required.", ephemeral: true });
  const [, action, id] = interaction.customId.split(":");
  return finalizeApplicationReview(interaction, action, id, interaction.fields.getTextInputValue("review_reason"));
}

async function finalizeApplicationReview(interaction, action, id, rawReason = "") {
  if (!canReviewApplications(interaction.member)) return interaction.reply({ content: "Application reviewer authority required.", ephemeral: true });
  const state = await loadState();
  const record = state.applications?.[interaction.guildId]?.[id];
  if (!record || record.status !== "pending") return interaction.reply({ content: "This application is no longer pending.", ephemeral: true });
  const status = applicationReviewStatus(action);
  const reviewReason = ["denied", "more_info"].includes(status) ? maskApplicationReviewText(rawReason, 700) : "";
  let grantedRole = null;
  if (status === "approved" && configForGuild(state, interaction.guildId).applicationSettings?.autoGrantRole === true) {
    const guildConfig = configForGuild(state, interaction.guildId);
    const applicationRoleKeys = {
      staff: "staff_role",
      moderator: "moderator_role", support: "support_role", training_hoster: "training_hoster_role",
      tryout_hoster: "tryout_hoster_role", referee: "referee_role", event_staff: "event_staff_role",
      giveaway_staff: "giveaway_staff_role", content_creator: "content_creator_role",
      partnership: "partner_role", clan_mainer: "clan_mainer_role", fima_support: "fima_support_role",
      macro_staff: "macro_staff_role", fflag_staff: "fflag_staff_role", reseller: "reseller_role"
    };
    const roleName = guildConfig.applicationSettings?.roleMappings?.[record.type]
      || guildConfig.roleMappings?.[applicationRoleKeys[record.type]];
    const role = roleName ? interaction.guild.roles.cache.find(item => item.name === roleName || item.id === roleName) : null;
    const applicant = await interaction.guild.members.fetch(record.userId).catch(() => null);
    const botMember = interaction.guild.members.me;
    if (role && applicant && !role.managed
      && interaction.member.roles.highest.comparePositionTo(role) > 0
      && botMember?.roles.highest.comparePositionTo(role) > 0) {
      await applicant.roles.add(role, `Paradise approved ${applicationLabel(record.type)} application`).catch(() => {});
      grantedRole = role.id;
    }
  }
  const updatedRecord = {
    ...record, status, reviewedBy: interaction.user.id, reviewedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), grantedRole, reviewReason: reviewReason || null
  };
  await saveState(next => {
    next.applications[interaction.guildId][id] = updatedRecord;
    return next;
  });
  const applicant = await interaction.client.users.fetch(record.userId).catch(() => null);
  await applicant?.send([
    `Your **${applicationLabel(record.type)}** application in **${interaction.guild.name}** is now **${status.replace("_", " ")}**.`,
    reviewReason ? `Staff note: ${reviewReason}` : ""
  ].filter(Boolean).join("\n")).catch(() => {});
  await logParadiseAction(interaction.guild, "application_logs_channel", "application-logs", "Application reviewed",
    `<@${record.userId}> · **${applicationLabel(record.type)}** · **${status}** by ${interaction.user}.${grantedRole ? ` Role <@&${grantedRole}> granted.` : ""}${reviewReason ? ` Reason: ${reviewReason}` : ""}`);
  return interaction.update({
    embeds: [applicationReviewedEmbed(interaction.message.embeds?.[0], updatedRecord, status, interaction.user, reviewReason, grantedRole)],
    components: []
  });
}

function canModerate(member) {
  return member.permissions.has(PermissionsBitField.Flags.ModerateMembers)
    || member.permissions.has(PermissionsBitField.Flags.ManageMessages)
    || member.roles.cache.some(role => ["Owner", "Admin", "Overseer", "Moderator", "Support Staff"].includes(role.name));
}

function canApproveModeration(member) {
  return member.permissions.has(PermissionsBitField.Flags.ManageGuild)
    || member.roles.cache.some(role => ["Owner", "Admin", "Overseer", "Administration Manager", "Moderator Manager", "Head Moderator"].includes(role.name));
}

function moderationTargetAllowed(actor, target) {
  return target && !target.user.bot && target.id !== actor.id
    && (actor.guild.ownerId === actor.id || actor.roles.highest.comparePositionTo(target.roles.highest) > 0);
}

const MODERATION_TIMEOUT_PRESETS = Object.freeze({
  spam: 10,
  toxicity: 60,
  harassment: 180,
  scam: 1440,
  raid: 10080
});

async function recordModerationCase(interaction, action, target, reason, extra = {}) {
  const id = crypto.randomUUID();
  const record = {
    id, guildId: interaction.guildId, action, targetId: target.id, requestedBy: interaction.user.id,
    reason, status: extra.status || "completed", createdAt: new Date().toISOString(), ...extra
  };
  await saveState(state => {
    state.moderationCases[interaction.guildId] = state.moderationCases[interaction.guildId] || {};
    state.moderationCases[interaction.guildId][id] = record;
    return state;
  });
  return record;
}

async function handleModCommand(interaction) {
  if (!canModerate(interaction.member)) return interaction.reply({ content: "Moderation authority required.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  if (sub === "case") {
    const prefix = interaction.options.getString("id");
    const record = Object.values((await loadState()).moderationCases?.[interaction.guildId] || {}).find(item => item.id.startsWith(prefix));
    return interaction.reply({ content: record
      ? `Case \`${record.id.slice(0, 8)}\` · **${record.action}** · <@${record.targetId}> · **${record.status}**\n${record.reason}`
      : "Case not found.", ephemeral: true });
  }
  if (sub === "approve" || sub === "deny") {
    if (!canApproveModeration(interaction.member)) return interaction.reply({ content: "Senior moderation authority required.", ephemeral: true });
    const decision = await decideModerationCase(interaction, sub, interaction.options.getString("id"));
    if (!decision) return interaction.reply({ content: "Pending case not found.", ephemeral: true });
    return interaction.reply({
      content: `Case \`${decision.id.slice(0, 8)}\` is now **${decision.status}**.${decision.failure ? ` Discord blocked the action: \`${decision.failure}\`` : ""}`,
      ephemeral: true
    });
  }
  if (sub === "raidmode") {
    if (!canApproveModeration(interaction.member)) return interaction.reply({ content: "Senior moderation authority required.", ephemeral: true });
    const enabled = interaction.options.getBoolean("enabled");
    await saveState(state => {
      state.securityState[interaction.guildId] = { ...(state.securityState[interaction.guildId] || {}), raidMode: enabled, updatedBy: interaction.user.id, updatedAt: new Date().toISOString() };
      return state;
    });
    await logParadiseAction(interaction.guild, "moderation_logs_channel", "mod-logs", "Raid mode changed", `${interaction.user} set raid mode to **${enabled}**.`);
    return interaction.reply({ content: `Raid mode **${enabled ? "enabled" : "disabled"}**.`, ephemeral: true });
  }
  if (sub === "lockdown") {
    if (!canApproveModeration(interaction.member)) return interaction.reply({ content: "Senior moderation authority required.", ephemeral: true });
    const enabled = interaction.options.getBoolean("enabled");
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: enabled ? false : null }, { reason: `Paradise lockdown by ${interaction.user.id}` });
    await logParadiseAction(interaction.guild, "moderation_logs_channel", "mod-logs", "Channel lockdown", `${interaction.user} set ${interaction.channel} lockdown to **${enabled}**.`);
    return interaction.reply({ content: `This channel is now **${enabled ? "locked" : "unlocked"}**.`, ephemeral: true });
  }
  const user = interaction.options.getUser("user");
  const target = user ? await interaction.guild.members.fetch(user.id).catch(() => null) : null;
  if (!moderationTargetAllowed(interaction.member, target)) return interaction.reply({ content: "Target is invalid or above your role hierarchy.", ephemeral: true });
  const reason = interaction.options.getString("reason");
  if (sub === "warn") {
    const record = await recordModerationCase(interaction, "warn", target, reason);
    await target.send(`You received a warning in **${interaction.guild.name}**: ${reason}\nCase: ${record.id.slice(0, 8)}`).catch(() => {});
    await logParadiseAction(interaction.guild, "moderation_logs_channel", "mod-logs", "Warning recorded", `${target} warned by ${interaction.user}.\n**Reason:** ${reason}`);
    return interaction.reply({ content: `Warning recorded as \`${record.id.slice(0, 8)}\`.`, ephemeral: true });
  }
  if (sub === "mute") {
    const preset = interaction.options.getString("preset");
    const customMinutes = interaction.options.getInteger("minutes");
    const minutes = customMinutes || MODERATION_TIMEOUT_PRESETS[preset] || null;
    if (!minutes) return interaction.reply({ content: "Choose a policy preset or provide a custom timeout duration.", ephemeral: true });
    if (!target.moderatable) return interaction.reply({ content: "Paradise cannot timeout this member because of Discord role hierarchy.", ephemeral: true });
    await target.timeout(minutes * 60_000, reason);
    const record = await recordModerationCase(interaction, "timeout", target, reason, { minutes, preset: preset || null });
    const state = await loadState();
    let warning = null;
    if (configForGuild(state, interaction.guildId).moderationSettings?.autoWarnOnMute !== false) {
      warning = await recordModerationCase(interaction, "warn", target, reason, {
        automatic: true,
        linkedCaseId: record.id,
        source: "timeout"
      });
      await target.send(`You were timed out in **${interaction.guild.name}** for **${minutes} minutes** and received an automatic warning.\nReason: ${reason}\nCases: ${record.id.slice(0, 8)} / ${warning.id.slice(0, 8)}`).catch(() => {});
    }
    await logParadiseAction(interaction.guild, "moderation_logs_channel", "mod-logs", "Timeout applied", `${target} timed out for **${minutes} minutes** by ${interaction.user}.\n**Reason:** ${reason}`);
    return interaction.reply({ content: `Timeout applied · case \`${record.id.slice(0, 8)}\`${warning ? ` · automatic warning \`${warning.id.slice(0, 8)}\`` : ""}.`, ephemeral: true });
  }
  if (sub === "quarantine" || sub === "unquarantine") {
    const role = await ensureRole(interaction.guild, "Muted / Quarantined");
    if (sub === "quarantine") await target.roles.add(role, reason); else await target.roles.remove(role, reason);
    const record = await recordModerationCase(interaction, sub, target, reason);
    await logParadiseAction(interaction.guild, "quarantine_review_channel", "quarantine-review", "Quarantine updated",
      `${target} · **${sub}** by ${interaction.user}\n**Reason:** ${reason}\nCase \`${record.id.slice(0, 8)}\``);
    return interaction.reply({ content: `${target} ${sub === "quarantine" ? "quarantined" : "released"} · \`${record.id.slice(0, 8)}\`.`, ephemeral: true });
  }
  const action = sub === "kick-request" ? "kick" : "ban";
  const record = await recordModerationCase(interaction, action, target, reason, { status: "pending" });
  const queue = await configuredChannel(interaction.guild, "moderation_requests_channel", "moderation-requests");
  if (queue) {
    await queue.send({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`${action.toUpperCase()} REQUEST · PENDING`)
        .setDescription(`Target: ${target}\nRequested by: ${interaction.user}\nCase: \`${record.id.slice(0, 8)}\`\n\n**Reason**\n${reason}`)
        .setFooter(paradiseFooter("Senior approval required")).setTimestamp()],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`paradise_mod_approve:${record.id}`).setLabel("Approve").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`paradise_mod_deny:${record.id}`).setLabel("Deny").setStyle(ButtonStyle.Secondary)
      )]
    });
  }
  return interaction.reply({ content: queue ? `${action} request queued as \`${record.id.slice(0, 8)}\`.` : `Request saved as \`${record.id.slice(0, 8)}\`; map moderation-requests for review.`, ephemeral: true });
}

function moderationCaseLines(records, limit = 10) {
  return records.slice(0, limit).map(record => {
    const timestamp = Math.floor(Date.parse(record.createdAt) / 1000);
    return `- \`${record.id.slice(0, 8)}\` **${record.action}** · <@${record.targetId}> · **${record.status}** · <t:${timestamp}:R>`;
  });
}

async function handleModCaseCommand(interaction) {
  if (!canModerate(interaction.member)) return interaction.reply({ content: "Moderation authority required.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  const state = await loadState();
  const records = Object.values(state.moderationCases?.[interaction.guildId] || {})
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  let filtered = records;
  let title = "Seven-day moderation cases";
  if (sub === "user") {
    const user = interaction.options.getUser("user");
    filtered = records.filter(record => record.targetId === user.id);
    title = `Cases for ${user.username}`;
  } else if (sub === "staff") {
    const staff = interaction.options.getUser("staff");
    filtered = records.filter(record => record.requestedBy === staff.id || record.reviewedBy === staff.id);
    title = `Cases handled by ${staff.username}`;
  } else {
    const since = Date.now() - 7 * 86_400_000;
    filtered = records.filter(record => Date.parse(record.createdAt) >= since);
  }
  const lines = moderationCaseLines(filtered);
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`◆ ${title}`)
      .setDescription(lines.length ? lines.join("\n") : "No matching moderation cases were found.")
      .setFooter(paradiseFooter(`${filtered.length} matching case(s) · private staff view`)).setTimestamp()],
    ephemeral: true
  });
}

async function handleModerationStatsCommand(interaction) {
  if (!canModerate(interaction.member)) return interaction.reply({ content: "Moderation authority required.", ephemeral: true });
  const state = await loadState();
  const records = Object.values(state.moderationCases?.[interaction.guildId] || {});
  const since = Date.now() - 7 * 86_400_000;
  const weekly = records.filter(record => Date.parse(record.createdAt) >= since);
  const count = (list, action) => list.filter(record => record.action === action).length;
  const pending = records.filter(record => record.status === "pending").length;
  const description = [
    `## Last 7 days · ${weekly.length}`,
    `Warnings: **${count(weekly, "warn")}** · Timeouts: **${count(weekly, "timeout")}** · Quarantines: **${count(weekly, "quarantine")}**`,
    `Kick requests: **${count(weekly, "kick")}** · Ban requests: **${count(weekly, "ban")}**`,
    "",
    `## All time · ${records.length}`,
    `Pending senior review: **${pending}**`,
    "",
    "-# Use /modcase user, /modcase staff or /modcase weekly for the private case list."
  ].join("\n");
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("◆ MODERATION STATS")
      .setDescription(description).setFooter(paradiseFooter("Private staff analytics")).setTimestamp()],
    ephemeral: true
  });
}

async function decideModerationCase(interaction, decision, idOrPrefix) {
  const state = await loadState();
  const entries = Object.entries(state.moderationCases?.[interaction.guildId] || {});
  const [id, record] = entries.find(([key, item]) => key.startsWith(idOrPrefix) && item.status === "pending") || [];
  if (!record) return null;
  const target = await interaction.guild.members.fetch(record.targetId).catch(() => null);
  let status = "denied";
  let failure = null;
  if (decision === "approve") {
    try {
      if (record.action === "review-only" && record.test === true) {
        status = "approved";
      } else if (!target) {
        throw new Error("member_not_found");
      } else if (record.action === "kick") {
        if (!target.kickable) throw new Error("role_hierarchy_blocks_kick");
        await target.kick(record.reason);
      } else {
        if (!target.bannable) throw new Error("role_hierarchy_blocks_ban");
        await target.ban({ reason: record.reason });
      }
      status = "approved";
    } catch (error) {
      status = "failed";
      failure = error.message;
    }
  }
  await saveState(next => {
    next.moderationCases[interaction.guildId][id] = {
      ...record, status, reviewedBy: interaction.user.id, reviewedAt: new Date().toISOString(),
      failure: failure ? String(failure).slice(0, 120) : null
    };
    return next;
  });
  await logParadiseAction(interaction.guild, "moderation_logs_channel", "mod-logs", "Moderation request reviewed",
    `Case \`${id.slice(0, 8)}\` · **${record.action}** · <@${record.targetId}> · **${status}** by ${interaction.user}.${failure ? `\nFailure: \`${failure}\`` : ""}`);
  return { id, record, status, failure };
}

async function handleModerationReview(interaction) {
  if (!canApproveModeration(interaction.member)) return interaction.reply({ content: "Senior moderation authority required.", ephemeral: true });
  const [decision, id] = interaction.customId.replace("paradise_mod_", "").split(":");
  const result = await decideModerationCase(interaction, decision, id);
  if (!result) return interaction.reply({ content: "This request is no longer pending.", ephemeral: true });
  return interaction.update({
    embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setTitle(`${result.record.action.toUpperCase()} REQUEST · ${result.status.toUpperCase()}`)
      .setFooter(paradiseFooter(`Reviewed by ${interaction.user.username}`))],
    components: []
  });
}

async function handleSecurityCommand(interaction) {
  const state = await loadState();
  const config = configForGuild(state, interaction.guildId);
  const security = state.securityState?.[interaction.guildId] || {};
  const quarantineRole = interaction.guild.roles.cache.find(role => role.name === "Muted / Quarantined");
  const lines = [
    `**Raid mode:** ${security.raidMode ? "Enabled" : "Disabled"}`,
    `**AutoMod:** ${config.automod?.enabled === false ? "Disabled" : "Configured / Discord availability dependent"}`,
    `**Quarantined members:** ${quarantineRole?.members.size || 0}`,
    `**Mass mention limit:** ${config.automod?.mentionLimit || 8}`,
    `**Invite/scam policy:** ${config.automod?.blockInvites === false ? "Disabled" : "Enabled"}`
  ];
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("◆ PARADISE SECURITY")
      .setDescription(`# Safe operations\n${lines.join("\n")}\n\n-# False positives require staff review; Paradise does not auto-ban on the first mistake.`)
      .setFooter(paradiseFooter("Quarantine and audit-first moderation"))],
    ephemeral: interaction.options.getSubcommand() !== "panel"
  });
}

function temporaryVoicePanel(channelId) {
  return {
    embeds: [new EmbedBuilder().setColor(DEFAULT_PARADISE_BRAND_COLOR).setTitle("◆ PRIVATE VOICE CONTROL")
      .setDescription("Bu kanalın sahibi aşağıdaki kontrolleri kullanabilir. Uygunsuz adlar reddedilir ve kanal adı Discord adına döner.\n\n- **Lock / Hide:** giriş veya görünürlüğü yönet\n- **Limit:** 0 → 2 → 4 → 6 → 8 → 10\n- **Permit / Reject:** üyeye özel erişim\n- **Transfer:** sahipliği devret\n- **Delete:** kanal boşken kaldır")
      .setFooter({ text: "Made By Fieel" })],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`paradise_voice_lock:${channelId}`).setLabel("Lock / Unlock").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`paradise_voice_hide:${channelId}`).setLabel("Hide / Unhide").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`paradise_voice_limit:${channelId}`).setLabel("User Limit").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`paradise_voice_rename:${channelId}`).setLabel("Rename").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`paradise_voice_delete:${channelId}`).setLabel("Delete").setStyle(ButtonStyle.Danger)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`paradise_voice_permit:${channelId}`).setLabel("Permit User").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`paradise_voice_reject:${channelId}`).setLabel("Reject User").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`paradise_voice_transfer:${channelId}`).setLabel("Transfer Owner").setStyle(ButtonStyle.Primary)
      )
    ]
  };
}

async function handleTemporaryVoiceButton(interaction) {
  const [action, channelId] = interaction.customId.replace("paradise_voice_", "").split(":");
  const state = await loadState();
  const record = state.temporaryVoices?.[channelId];
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!record || !channel || record.ownerId !== interaction.user.id) {
    return interaction.reply({ content: "Bu ses kanalını yalnızca onu oluşturan kişi yönetebilir.", ephemeral: true });
  }
  if (["rename", "permit", "reject", "transfer"].includes(action)) {
    const modal = new ModalBuilder().setCustomId(`paradise_voice_${action}_modal:${channelId}`)
      .setTitle(action === "rename" ? "Ses kanalını yeniden adlandır" : "Ses kanalı üye kontrolü");
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(action === "rename" ? "voice_name" : "target_user")
        .setLabel(action === "rename" ? "Yeni güvenli kanal adı" : "Discord kullanıcı ID veya mention")
        .setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(action === "rename" ? 80 : 30).setRequired(true)
    ));
    return interaction.showModal(modal);
  }
  if (action === "lock") {
    const everyone = interaction.guild.roles.everyone;
    const locked = Boolean(record.locked);
    await channel.permissionOverwrites.edit(everyone, { Connect: locked ? null : false }, { reason: "Paradise private voice owner control" });
    await saveState(next => { next.temporaryVoices[channelId] = { ...record, locked: !locked }; return next; });
    return interaction.reply({ content: locked ? "Ses kanalı açıldı." : "Ses kanalı kilitlendi.", ephemeral: true });
  }
  if (action === "limit") {
    const limits = [0, 2, 4, 6, 8, 10];
    const nextLimit = limits[(limits.indexOf(channel.userLimit) + 1) % limits.length];
    await channel.setUserLimit(nextLimit, "Paradise private voice owner control");
    return interaction.reply({ content: `Kullanıcı limiti **${nextLimit || "sınırsız"}** olarak ayarlandı.`, ephemeral: true });
  }
  if (action === "hide") {
    const everyone = interaction.guild.roles.everyone;
    const hidden = Boolean(record.hidden);
    await channel.permissionOverwrites.edit(everyone, { ViewChannel: hidden ? null : false }, { reason: "Paradise private voice owner control" });
    await saveState(next => { next.temporaryVoices[channelId] = { ...record, hidden: !hidden }; return next; });
    return interaction.reply({ content: hidden ? "Ses kanalı görünür oldu." : "Ses kanalı gizlendi.", ephemeral: true });
  }
  if (channel.members.size > 0) return interaction.reply({ content: "Kanalı silmeden önce herkesin çıkması gerekir.", ephemeral: true });
  await channel.delete("Paradise private voice owner request");
  await saveState(next => { delete next.temporaryVoices[channelId]; return next; });
  return interaction.reply({ content: "Ses kanalı silindi.", ephemeral: true }).catch(() => null);
}

async function handleTemporaryVoiceRenameModal(interaction) {
  const channelId = interaction.customId.split(":")[1];
  const state = await loadState();
  const record = state.temporaryVoices?.[channelId];
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!record || !channel || record.ownerId !== interaction.user.id) {
    return interaction.reply({ content: "Bu ses kanalını yeniden adlandırma yetkin yok.", ephemeral: true });
  }
  const fallback = `${interaction.member.displayName || interaction.user.username}'s room`;
  const requested = interaction.fields.getTextInputValue("voice_name");
  const safeName = sanitizeTemporaryVoiceName(requested, fallback);
  await channel.setName(safeName, "Paradise private voice safe rename");
  return interaction.reply({
    content: safeName === requested.trim() ? `Kanal adı **${safeName}** oldu.` : `Uygunsuz ad reddedildi; kanal adı **${safeName}** olarak ayarlandı.`,
    ephemeral: true
  });
}

function discordUserId(value) {
  const match = String(value || "").match(/\d{15,22}/);
  return match?.[0] || null;
}

async function handleTemporaryVoiceMemberModal(interaction) {
  const [, action, channelId] = interaction.customId.match(/^paradise_voice_(permit|reject|transfer)_modal:(\d+)$/) || [];
  const state = await loadState();
  const record = state.temporaryVoices?.[channelId];
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!action || !record || !channel || record.ownerId !== interaction.user.id) {
    return interaction.reply({ content: "Bu ses kanalını yönetme yetkin yok.", ephemeral: true });
  }
  const userId = discordUserId(interaction.fields.getTextInputValue("target_user"));
  const member = userId ? await interaction.guild.members.fetch(userId).catch(() => null) : null;
  if (!member || member.user.bot || member.id === interaction.user.id) {
    return interaction.reply({ content: "Geçerli bir sunucu üyesi seç.", ephemeral: true });
  }
  if (action === "permit") {
    await channel.permissionOverwrites.edit(member, { ViewChannel: true, Connect: true }, { reason: "Paradise private voice permit" });
    await saveState(next => {
      const current = next.temporaryVoices[channelId] || record;
      next.temporaryVoices[channelId] = {
        ...current,
        permittedUserIds: [...new Set([...(current.permittedUserIds || []), member.id])],
        rejectedUserIds: (current.rejectedUserIds || []).filter(id => id !== member.id)
      };
      return next;
    });
  } else if (action === "reject") {
    if (member.voice.channelId === channel.id) await member.voice.disconnect("Paradise private voice owner rejected member").catch(() => {});
    await channel.permissionOverwrites.edit(member, { Connect: false }, { reason: "Paradise private voice reject" });
    await saveState(next => {
      const current = next.temporaryVoices[channelId] || record;
      next.temporaryVoices[channelId] = {
        ...current,
        rejectedUserIds: [...new Set([...(current.rejectedUserIds || []), member.id])],
        permittedUserIds: (current.permittedUserIds || []).filter(id => id !== member.id)
      };
      return next;
    });
  } else {
    await channel.permissionOverwrites.edit(interaction.user.id, { ManageChannels: null, MoveMembers: null }, { reason: "Paradise voice ownership transfer" });
    await channel.permissionOverwrites.edit(member, {
      ViewChannel: true, Connect: true, ManageChannels: true, MoveMembers: true
    }, { reason: "Paradise voice ownership transfer" });
    await saveState(next => { next.temporaryVoices[channelId] = { ...record, ownerId: member.id, transferredAt: new Date().toISOString() }; return next; });
  }
  await logParadiseAction(interaction.guild, "voice_logs_channel", "bot-logs", "Private voice control",
    `<@${interaction.user.id}> used **${action}** for <@${member.id}> in <#${channel.id}>.`);
  return interaction.reply({ content: `Voice action **${action}** applied for ${member}.`, ephemeral: true });
}

export async function handleParadiseVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild || oldState.guild;
  if (!guild || newState.member?.user?.bot) return false;
  const guildConfig = configForGuild(await loadState(), guild.id);
  const activeMode = guildConfig.activeSetupMode;
  const voiceConfig = guildConfig.voiceSettings || {};
  if (!activeMode || voiceConfig.enabled === false) return false;
  const joined = newState.channel;
  const isJoinToCreate = joined?.type === ChannelType.GuildVoice
    && (joined.id === voiceConfig.joinToCreateChannelId || ["◜・oda-oluştur", "Join to Create"].includes(joined.name));
  if (isJoinToCreate) {
    const fallbackName = `${newState.member.displayName || newState.member.user.username}'s room`;
    const privateCategory = guild.channels.cache.get(voiceConfig.privateVoiceCategoryId)
      || guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && ["━━ ÖZEL SESLER ━━", "PRIVATE VOICE"].includes(channel.name));
    const channel = await guild.channels.create({
      name: sanitizeTemporaryVoiceName(fallbackName, "Private Room"),
      type: ChannelType.GuildVoice,
      parent: privateCategory?.id || joined.parentId,
      userLimit: Math.min(99, Math.max(0, Number(voiceConfig.defaultLimit) || 0)),
      permissionOverwrites: [
        { id: guild.roles.everyone.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] },
        { id: newState.member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers] }
      ],
      reason: "Paradise Join to Create"
    });
    await saveState(state => {
      state.temporaryVoices[channel.id] = {
        guildId: guild.id,
        channelId: channel.id,
        ownerId: newState.member.id,
        template: activeMode,
        currentName: channel.name,
        createdAt: new Date().toISOString(),
        userLimit: channel.userLimit,
        locked: false,
        hidden: false,
        permittedUserIds: [],
        rejectedUserIds: []
      };
      return state;
    });
    await newState.setChannel(channel, "Paradise Join to Create");
    await channel.send(temporaryVoicePanel(channel.id)).catch(() => {});
    return true;
  }
  const oldChannel = oldState.channel;
  if (oldChannel && oldChannel.id !== newState.channelId) {
    const record = (await loadState()).temporaryVoices?.[oldChannel.id];
    if (record && oldChannel.members.size === 0 && voiceConfig.autoDelete !== false) {
      await oldChannel.delete("Paradise empty temporary voice cleanup").catch(() => {});
      await saveState(state => { delete state.temporaryVoices[oldChannel.id]; return state; });
      return true;
    }
  }
  return false;
}

function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 100));
}

function xpPeriodKeys(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86_400_000) + 1) / 7);
  return {
    week: `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`,
    month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
  };
}

async function addMemberXp(guild, member, amount, source, sourceChannel = null) {
  if (!guild || !member || member.user?.bot || amount <= 0) return null;
  let result = null;
  await saveState(state => {
    const key = guildUserKey(guild.id, member.id);
    const previous = state.memberLevels[key] || { guildId: guild.id, userId: member.id, xp: 0, level: 0 };
    const periods = xpPeriodKeys();
    const weeklyXp = previous.weekKey === periods.week ? Number(previous.weeklyXp || 0) + amount : amount;
    const monthlyXp = previous.monthKey === periods.month ? Number(previous.monthlyXp || 0) + amount : amount;
    const xp = Math.max(0, Number(previous.xp) || 0) + amount;
    const level = levelFromXp(xp);
    result = {
      ...previous, xp, level,
      chatXp: Number(previous.chatXp || 0) + (source === "chat" ? amount : 0),
      voiceXp: Number(previous.voiceXp || 0) + (source === "voice" ? amount : 0),
      weeklyXp, monthlyXp, weekKey: periods.week, monthKey: periods.month,
      lastSource: source, updatedAt: new Date().toISOString()
    };
    state.memberLevels[key] = result;
    return state;
  });
  const priorLevel = levelFromXp(result.xp - amount);
  if (result.level > priorLevel) {
    const state = await loadState();
    const levelChannel = await configuredChannel(guild, "level_channel", "level-leaderboard")
      || guild.channels.cache.find(channel => channel.name === "level-logs" && channel.isTextBased?.())
      || sourceChannel;
    const position = Object.values(state.memberLevels || {})
      .filter(item => belongsToGuild(item, guild.id))
      .sort((a, b) => Number(b.xp || 0) - Number(a.xp || 0))
      .findIndex(item => item.userId === member.id) + 1;
    if (levelChannel?.isTextBased?.()) {
      const notice = await levelChannel.send(`${member} is now **Level ${result.level}**. Your activity rank is **#${Math.max(1, position)}**.`).catch(() => null);
      const deleteSeconds = Math.min(3600, Math.max(10, Number(configForGuild(state, guild.id).xpSettings?.levelUpDeleteSeconds || 60)));
      if (notice) setTimeout(() => notice.delete().catch(() => {}), deleteSeconds * 1000).unref?.();
    }
    const rewardName = configForGuild(state, guild.id).xpSettings?.roleRewards?.[String(result.level)];
    const rewardRole = rewardName ? guild.roles.cache.find(role => role.name === rewardName || role.id === rewardName) : null;
    if (rewardRole && guild.members.me?.roles.highest.comparePositionTo(rewardRole) > 0) {
      await member.roles.add(rewardRole, `Paradise level ${result.level} reward`).catch(() => {});
    }
  }
  return result;
}

async function updateLevelLeaderboard(guild) {
  const channel = await configuredChannel(guild, "level_channel", "level-leaderboard");
  if (!channel) return null;
  const state = await loadState();
  const rows = Object.values(state.memberLevels)
    .filter(item => belongsToGuild(item, guild.id))
    .sort((a, b) => Number(b.xp) - Number(a.xp))
    .slice(0, 20);
  const description = rows.map((item, index) => `**${index + 1}.** <@${item.userId}> · Level **${item.level}** · ${item.xp} XP`).join("\n")
    || "_No chat or voice activity recorded yet._";
  const config = configForGuild(state, guild.id);
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("◆ PARADISE ACTIVITY LEADERBOARD")
    .setDescription(`${description}\n\n-# Chat and non-AFK voice activity are rate-limited. Spam does not grant extra XP.`)
    .setFooter(paradiseFooter("Chat + voice levels"));
  let message = config.levelLeaderboardMessageId
    ? await channel.messages.fetch(config.levelLeaderboardMessageId).catch(() => null)
    : null;
  if (message) await message.edit({ embeds: [embed] }); else message = await channel.send({ embeds: [embed] });
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].levelLeaderboardMessageId = message.id;
    next.guildConfigs[guild.id].lastLevelLeaderboardAt = Date.now();
    return next;
  });
  return message;
}

async function handleMemberLevelMessage(message) {
  if (!message.guild || message.author.bot || !message.member) return false;
  if (!message.content?.trim() && !message.attachments?.size) return false;
  const config = configForGuild(await loadState(), message.guild.id);
  if (!config.activeSetupMode || config.xpSettings?.enabled === false) return false;
  const excluded = new Set(config.xpSettings?.excludedChannels || []);
  if (excluded.has(message.channel.id)
    || /(?:^|[-_])(bot|spam|logs?|transcripts?)(?:$|[-_])/i.test(message.channel.name || "")) return false;
  const key = guildUserKey(message.guild.id, message.author.id);
  const last = levelMessageCooldowns.get(key) || 0;
  const cooldownMs = Math.max(15, Number(config.xpSettings?.chatCooldownSeconds || 60)) * 1000;
  if (Date.now() - last < cooldownMs) return false;
  levelMessageCooldowns.set(key, Date.now());
  await addMemberXp(message.guild, message.member, Number(config.xpSettings?.chatXp || 10), "chat", message.channel);
  return true;
}

async function handleRankCommand(interaction) {
  const user = interaction.options.getUser("user") || interaction.user;
  const record = guildUserRecord((await loadState()).memberLevels, interaction.guildId, user.id)
    || { xp: 0, chatXp: 0, voiceXp: 0, weeklyXp: 0, monthlyXp: 0, level: 0 };
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`◆ ${user.username}'s Paradise Rank`)
      .addFields(
        { name: "Level", value: `**${record.level || 0}**`, inline: true },
        { name: "Total XP", value: `**${record.xp || 0}**`, inline: true },
        { name: "Chat / Voice", value: `**${record.chatXp || 0}** / **${record.voiceXp || 0}**`, inline: true },
        { name: "Weekly / Monthly", value: `**${record.weeklyXp || 0}** / **${record.monthlyXp || 0}**`, inline: true }
      ).setThumbnail(user.displayAvatarURL()).setFooter(paradiseFooter("Anti-spam XP enabled"))]
  });
}

async function updateRankedLeaderboardBoards(guild) {
  const state = await loadState();
  const guildConfig = configForGuild(state, guild.id);
  const language = guildLanguage(guildConfig);
  const color = await paradiseBrandColor();
  const leaderboard = leaderboardForGuild(state, guild.id);
  const topSize = Math.min(100, Math.max(2, Number(guildConfig.challenge?.topSize) || 30));
  const entries = Object.entries(leaderboard)
    .filter(([, row]) => Number.isInteger(Number(row.spot)) && Number(row.spot) >= 1 && Number(row.spot) <= topSize)
    .sort((a, b) => Number(a[1].spot) - Number(b[1].spot));
  const groups = [];
  for (let min = 1; min <= topSize; min += 10) {
    const max = Math.min(min + 9, topSize);
    const channelName = min <= 10 ? "top-10" : min <= 20 ? "top-20" : "top-30";
    groups.push({
      channel: channelName,
      min,
      max,
      label: `TOP ${min}-${max}`,
      messageKey: `${channelName}:${min}-${max}`
    });
  }
  const messageIds = guildConfig.rankedLeaderboardMessageIds || {};
  const posted = [];
  for (const group of groups) {
    const channel = guild.channels.cache.find(item => item.name === group.channel && item.isTextBased?.());
    if (!channel) continue;
    const cards = [];
    for (let rank = group.min; rank <= group.max; rank += 1) {
      const entry = entries.find(([, row]) => Number(row.spot) === rank);
      if (!entry) {
        cards.push(new EmbedBuilder()
          .setColor(color)
          .setTitle(language === "tr" ? `✦ #${rank} — Boş` : `✦ #${rank} — Vacant`)
          .setDescription(vacantLeaderboardDescription(rank, language))
          .setImage(PARADISE_LEADERBOARD_SEPARATOR_ASSET));
        continue;
      }
      const [userId, row] = entry;
      const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
      const profile = state.profiles?.[userId];
      const storedRank = row.stageRank || profile?.stageRank;
      const stage = storedRank?.stage != null ? rankToRoleName(storedRank)
        : member ? fighterRank(member)
          : row.stage || profile?.stage || "Unranked";
      const activeTicket = openChallengeFor(state, userId, guild.id);
      const status = rankedStatusText(row, activeTicket, language);
      const displayName = compactText(row.displayName || row.nickname || member?.displayName || profile?.robloxUsername || "Fighter", 60);
      const robloxName = compactText(profile?.robloxUsername || row.robloxName || row.robloxUsername || (language === "tr" ? "Bağlı değil" : "Not linked"), 60);
      const region = compactText(profile?.region || row.region || (language === "tr" ? "Ayarlanmadı" : "Not set"), 60);
      const wins = Number(row.wins || 0);
      const losses = Number(row.losses || 0);
      const shortNote = compactText(row.publicNote || row.shortNote || row.boardNote || "", 80);
      const description = language === "tr"
        ? [
          `◆ ${member ? `${member}` : `<@${userId}>`}`,
          `◆ Roblox: **${robloxName}**`,
          `◆ Seviye: **${stage}**`,
          `◆ Bölge: **${region}**`,
          `◆ Durum: **${status}**`,
          `◆ W/L: **${wins} / ${losses}**`,
          ...(shortNote ? [`◆ Not: _${shortNote}_`] : [])
        ].join("\n")
        : [
          `◆ ${member ? `${member}` : `<@${userId}>`}`,
          `◆ Roblox: **${robloxName}**`,
          `◆ Rank: **${stage}**`,
          `◆ Region: **${region}**`,
          `◆ Status: **${status}**`,
          `◆ W/L: **${wins} / ${losses}**`,
          ...(shortNote ? [`◆ Note: _${shortNote}_`] : [])
        ].join("\n");
      const card = new EmbedBuilder()
        .setColor(color)
        .setTitle(`✦ #${rank} — ${displayName}`)
        .setDescription(description)
        .setImage(PARADISE_LEADERBOARD_SEPARATOR_ASSET);
      const thumbnail = profile?.thumbnailUrl || profile?.avatarUrl || (profile?.robloxId ? await robloxHeadshot(profile.robloxId) : null);
      if (thumbnail) card.setThumbnail(thumbnail);
      cards.push(card);
    }
    if (cards.length) {
      cards[cards.length - 1].setFooter(paradiseFooter(language === "tr"
        ? `${group.label} • /profile view detayları gösterir`
        : `${group.label} • /profile view shows details`)).setTimestamp();
    }
    const storedMessageId = messageIds[group.messageKey]
      || (group.min <= 21 ? messageIds[group.channel] : null);
    let message = storedMessageId
      ? await channel.messages.fetch(storedMessageId).catch(() => null)
      : null;
    const boardContent = leaderboardBoardIntro(group.label, language);
    if (message) await message.edit({ content: boardContent, embeds: cards.slice(0, 10) });
    else message = await channel.send({ content: boardContent, embeds: cards.slice(0, 10) });
    messageIds[group.messageKey] = message.id;
    if (group.min <= 21) messageIds[group.channel] = message.id;
    posted.push({ channelId: channel.id, messageId: message.id, range: group.label });
  }
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].rankedLeaderboardMessageIds = messageIds;
    return next;
  });
  return posted;
}

async function handleLeaderboardCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "show") {
    const type = interaction.options.getString("type") || "total";
    const key = { total: "xp", chat: "chatXp", voice: "voiceXp", weekly: "weeklyXp", monthly: "monthlyXp" }[type];
    const rows = Object.values((await loadState()).memberLevels || {})
      .filter(item => belongsToGuild(item, interaction.guildId))
      .sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0))
      .slice(0, 20);
    const description = rows.length
      ? rows.map((item, index) => `**${index + 1}.** <@${item.userId}> · **${item[key] || 0} XP** · Lv. ${item.level || 0}`).join("\n")
      : "_No XP has been recorded yet._";
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`◆ PARADISE ${type.toUpperCase()} LEADERBOARD`)
        .setDescription(`${description}\n\n-# Bot, spam, log and configured excluded channels do not grant chat XP.`)
        .setFooter(paradiseFooter("Chat + voice activity"))]
    });
  }
  if (!canManageCompetitiveBoards(interaction.member)) {
    return interaction.reply({ content: "Leaderboard staff or administrator role required.", ephemeral: true });
  }
  if (sub === "repost" || sub === "panel") {
    const posted = await updateRankedLeaderboardBoards(interaction.guild);
    return interaction.reply({ content: `Updated **${posted.length}** ranked leaderboard board(s) in place.`, ephemeral: true });
  }
  const state = await loadState();
  const leaderboard = leaderboardForGuild(state, interaction.guildId);
  if (sub === "export") {
    const rows = Object.entries(leaderboard).map(([userId, row]) => ({ userId, rank: row.spot }))
      .filter(row => Number.isInteger(Number(row.rank))).sort((a, b) => a.rank - b.rank);
    return interaction.reply({ content: `\`\`\`json\n${JSON.stringify(rows, null, 2).slice(0, 3800)}\n\`\`\``, ephemeral: true });
  }
  if (sub === "import") {
    let rows;
    try { rows = JSON.parse(interaction.options.getString("json")); } catch { rows = null; }
    if (!Array.isArray(rows) || rows.some(row => !/^\d{16,22}$/.test(String(row.userId)) || !Number.isInteger(Number(row.rank)))) {
      return interaction.reply({ content: "Invalid JSON. Use an array of `{ \"userId\": \"...\", \"rank\": 25 }`.", ephemeral: true });
    }
    const ranks = rows.map(row => Number(row.rank));
    if (new Set(ranks).size !== ranks.length) return interaction.reply({ content: "Duplicate leaderboard positions are not allowed.", ephemeral: true });
    await saveState(next => {
      const target = ensureLeaderboardForGuild(next, interaction.guildId);
      for (const row of rows) target[String(row.userId)] = { ...(target[String(row.userId)] || {}), spot: Number(row.rank) };
      return next;
    });
  } else if (sub === "swap") {
    const user1 = interaction.options.getUser("user1");
    const user2 = interaction.options.getUser("user2");
    if (!leaderboard[user1.id]?.spot || !leaderboard[user2.id]?.spot) return interaction.reply({ content: "Both users must already be ranked.", ephemeral: true });
    await saveState(next => {
      const target = ensureLeaderboardForGuild(next, interaction.guildId);
      [target[user1.id].spot, target[user2.id].spot] = [target[user2.id].spot, target[user1.id].spot];
      return next;
    });
  } else {
    const user = interaction.options.getUser("user");
    if (sub === "remove") {
      await saveState(next => { delete ensureLeaderboardForGuild(next, interaction.guildId)[user.id]; return next; });
    } else {
      const rank = interaction.options.getInteger("rank");
      const occupied = Object.entries(leaderboard).find(([id, row]) => id !== user.id && Number(row.spot) === rank);
      if (occupied) return interaction.reply({ content: `Rank **#${rank}** is already occupied by <@${occupied[0]}>. Use \`/leaderboard swap\` or move that fighter first.`, ephemeral: true });
      await saveState(next => {
        const target = ensureLeaderboardForGuild(next, interaction.guildId);
        target[user.id] = { ...(target[user.id] || {}), spot: rank, updatedAt: new Date().toISOString(), updatedBy: interaction.user.id };
        return next;
      });
    }
  }
  const posted = await updateRankedLeaderboardBoards(interaction.guild);
  await logParadiseAction(interaction.guild, "roster_logs_channel", "roster-logs", "Ranked leaderboard updated", `${interaction.user} used \`/leaderboard ${sub}\`.`).catch(() => {});
  return interaction.reply({ content: `Leaderboard updated. Refreshed **${posted.length}** board(s).`, ephemeral: true });
}

async function sendMemberLifecycleMessage(member, kind, options = {}) {
  const state = await loadState();
  const config = configForGuild(state, member.guild.id);
  const preview = options.preview === true;
  if (!config.activeSetupMode && !preview) return false;
  const joined = kind === "join";
  const publicChannel = options.channel || (joined
    ? await configuredChannel(member.guild, "welcome_channel", "welcome")
    : await configuredChannel(member.guild, "leave_channel", "farewell"));
  const log = member.guild.channels.cache.find(channel => channel.name === (joined ? "welcome-logs" : "leave-logs") && channel.isTextBased?.());
  if (publicChannel) {
    const mentionIfFound = (mappingKey, fallback) => {
      const id = config.channelMappings?.[mappingKey];
      const channel = id ? member.guild.channels.cache.get(id) : member.guild.channels.cache.find(item => item.name === fallback);
      return channel?.isTextBased?.() ? `${channel}` : null;
    };
    const mode = config.activeSetupMode || "community";
    const tr = guildLanguage(config) === "tr";
    const channelRef = (mappingKey, fallback) => mentionIfFound(mappingKey, fallback);
    const destinations = [
      channelRef("rules_channel", "rules") ? (tr ? `- Kuralları ${channelRef("rules_channel", "rules")} kanalında oku.` : `- Read the rules in ${channelRef("rules_channel", "rules")}.`) : null,
      mode === "community" && channelRef("faq_channel", "security-and-trust") ? (tr ? `- Fima ve sunucu güvenliği için ${channelRef("faq_channel", "security-and-trust")} kanalına bak.` : `- Learn how Fima and this server stay safe in ${channelRef("faq_channel", "security-and-trust")}.`) : null,
      channelRef("role_guide_channel", "role-guide") ? (tr ? `- Dilini, bildirimlerini ve rollerini ${channelRef("role_guide_channel", "role-guide")} kanalından seç.` : `- Choose your language, pings and roles in ${channelRef("role_guide_channel", "role-guide")}.`) : null,
      mode !== "community" && channelRef("challenge_channel", "challenge-ticket") ? (tr ? `- ${channelRef("challenge_channel", "challenge-ticket")} kullanmadan önce profilini tamamla.` : `- Complete your profile before using ${channelRef("challenge_channel", "challenge-ticket")}.`) : null,
      mode === "community" && channelRef("support_ticket_channel", "open-ticket") ? (tr ? `- Özel yardım için ${channelRef("support_ticket_channel", "open-ticket")} kanalından ticket aç.` : `- Open a private support ticket in ${channelRef("support_ticket_channel", "open-ticket")}.`) : null
    ].filter(Boolean);
    const title = joined
      ? (tr ? `Hoş geldin, ${member.displayName}!` : `Welcome, ${member.displayName}!`)
      : (tr ? `${member.displayName} sunucudan ayrıldı` : `${member.displayName} left the server`);
    const description = joined
      ? (tr
        ? `# ${member.user.username}\n**${member.guild.name}** sunucusuna hoş geldin!\n\n${destinations.join("\n") || "- Sunucuyu keşfet ve sana uygun rolleri seç."}\n\n## ${member.guild.memberCount}. üyemizsin!\n\n-# Şifreni, çerezlerini veya tokenlerini kimseyle paylaşma • Made By Fieel${preview ? " • Önizleme" : ""}`
        : `# ${member.user.username}\nWelcome to **${member.guild.name}**!\n\n${destinations.join("\n") || "- Explore the server and choose the roles that fit you."}\n\n## You are member #${member.guild.memberCount}!\n\n-# Never share passwords, cookies or tokens • Made By Fieel${preview ? " • Preview" : ""}`)
      : (tr
        ? `${member.user.username}, **${member.guild.name}** sunucusundan ayrıldı.\n\n-# Güncel üye sayısı: ${member.guild.memberCount} • Made By Fieel${preview ? " • Önizleme" : ""}`
        : `${member.user.username} is no longer in **${member.guild.name}**.\n\n-# Current member count: ${member.guild.memberCount} • Made By Fieel${preview ? " • Preview" : ""}`);
    const embed = new EmbedBuilder().setColor(await paradiseBrandColor())
      .setTitle(title)
      .setDescription(description)
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();
    const banner = joined ? config.welcomeSettings?.bannerUrl : config.welcomeSettings?.leaveBannerUrl;
    if (banner && /^https:\/\//i.test(banner)) embed.setImage(banner);
    const sent = await publicChannel.send({
      content: joined ? `${member}` : undefined,
      embeds: [embed],
      allowedMentions: { users: joined ? [member.id] : [], parse: [] }
    }).catch(() => null);
    if (!sent) return false;
  }
  if (!preview && log) await log.send(`${joined ? "Joined" : "Left"}: ${member.user.tag} (${member.id}) · <t:${Math.floor(Date.now() / 1000)}:F>`).catch(() => {});
  return Boolean(publicChannel);
}

async function handleLifecyclePreview(interaction, kind) {
  if (!interaction.inGuild?.() || !interaction.channel?.isTextBased?.()) {
    return interaction.reply({ content: "This preview can only be used in a server text channel.", ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
  const sent = member ? await sendMemberLifecycleMessage(member, kind, { preview: true, channel: interaction.channel }) : false;
  const state = await loadState();
  const tr = guildLanguage(configForGuild(state, interaction.guildId)) === "tr";
  return interaction.editReply(sent
    ? (tr ? `${kind === "join" ? "Hoş geldin" : "Ayrılma"} önizlemesi bu kanala gönderildi.` : `${kind === "join" ? "Welcome" : "Leave"} preview posted in this channel.`)
    : (tr ? "Önizleme gönderilemedi. Botun bu kanalda mesaj ve embed gönderme yetkisini kontrol et." : "Preview could not be posted. Check the bot's Send Messages and Embed Links permissions here."));
}

export async function handleParadiseGuildMemberAdd(member) {
  await sendMemberLifecycleMessage(member, "join");
  const state = await loadState();
  const config = configForGuild(state, member.guild.id);
  const policy = config.moderationSettings || {};
  const security = state.securityState?.[member.guild.id] || {};
  const ageDays = Math.max(0, (Date.now() - member.user.createdTimestamp) / 86_400_000);
  const threshold = Math.max(0, Number(policy.suspiciousAccountDays ?? 7));
  const shouldQuarantine = policy.quarantineEnabled !== false
    && (security.raidMode === true || policy.raidModeDefault === true || (threshold > 0 && ageDays < threshold));
  if (shouldQuarantine) {
    const role = await ensureRole(member.guild, "Muted / Quarantined");
    if (member.guild.members.me?.roles.highest.comparePositionTo(role) > 0) {
      await member.roles.add(role, security.raidMode ? "Paradise raid mode join quarantine" : "Paradise suspicious account-age review").catch(() => {});
      await logParadiseAction(member.guild, "quarantine_review_channel", "quarantine-review", "Join quarantine review",
        `${member} was quarantined for staff review.\n**Signal:** ${security.raidMode ? "Raid mode" : `Account age below ${threshold} days`}\n-# This is not a ban; staff can use /mod unquarantine after review.`);
    }
  }
  return true;
}

export async function handleParadiseGuildMemberRemove(member) {
  await sendMemberLifecycleMessage(member, "leave");
  return true;
}

const WEEKLY_QUOTAS = Object.freeze({
  "Training Manager": { key: "training", minimum: 2 },
  "Training Hoster": { key: "training", minimum: 2 },
  "Tryout Manager": { key: "tryout", minimum: 2 },
  "Tryout Hoster": { key: "tryout", minimum: 1 },
  "Referee": { key: "referee", minimum: 2 },
  "Experienced Referee": { key: "referee", minimum: 2 },
  "Tournament Manager": { key: "tournament", minimum: 1 },
  "Event Manager": { key: "event", minimum: 1 },
  "Giveaway Manager": { key: "giveaway", minimum: 1 },
  "Game Night Manager": { key: "gamenight", minimum: 1 }
});

const ACTIVITY_GROUP_ROLES = Object.freeze({
  Referee: ["Referee", "Trial Referee", "Experienced Referee"],
  Tryout: ["Tryout Hoster", "Trial Tryout Hoster", "Experienced Tryout Hoster", "Tryout Manager", "Tryout Staff", "Trial Tryout Staff"],
  Training: ["Training Hoster", "Trial Training Hoster", "Experienced Training Hoster", "Training Manager", "Trial Training Manager"],
  Event: ["Event Manager"], Tournament: ["Tournament Manager"],
  Giveaway: ["Giveaway Manager"], "Game Night": ["Game Night Manager"]
});

function weekActivityCount(activity, key, now = Date.now()) {
  const since = now - 7 * 86_400_000;
  return (activity?.[key] || []).filter(value => Date.parse(value) >= since).length;
}

async function postAutomaticActivityCheck(guild, group, state) {
  const targetName = group === "Referee" ? "referee-activity-check" : "hoster-activity-check";
  const channel = await configuredChannel(guild, "activity_check_channel", targetName)
    || guild.channels.cache.find(item => item.name.includes(targetName));
  if (!channel) return null;
  const id = crypto.randomUUID();
  const deadlineHours = Number(configForGuild(state, guild.id).activity?.responseDeadlineHours || 24);
  const expiresAt = Date.now() + deadlineHours * 3_600_000;
  const check = { guildId: guild.id, group, startedBy: guild.members.me.id, automatic: true, startedAt: new Date().toISOString(), expiresAt, responses: [] };
  state.activityChecks[id] = check;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_activity_present:${id}`).setLabel("I am active / Aktifim").setStyle(ButtonStyle.Success)
  );
  await channel.send({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`${group} Activity Check`)
    .setDescription(`Respond within ${deadlineHours} hours. Missing the deadline creates a flag and may remove the related staff role only when automatic role changes are explicitly enabled. Whitelist and LOA exemptions apply.\nDeadline: <t:${Math.floor(expiresAt / 1000)}:R>`)
    .setFooter({ text: "Automatic Paradise activity check • Made By Fieel" })], components: [row] });
  return id;
}

function paradiseStateForGuildReconciliation(state, guildId) {
  const scoped = bucket => Object.fromEntries(Object.entries(bucket || {})
    .filter(([, record]) => belongsToGuild(record, guildId)));
  return {
    guildConfigs: state.guildConfigs?.[guildId] ? { [guildId]: state.guildConfigs[guildId] } : {},
    leaderboards: state.leaderboards?.[guildId] ? { [guildId]: state.leaderboards[guildId] } : {},
    supportTickets: scoped(state.supportTickets)
  };
}

async function runParadiseGuildReconciliation(guild) {
  const state = await loadState();
  const config = configForGuild(state, guild.id);
  const flag = resolveParadiseFeatureFlag({
    feature: "reconciliation_health",
    flags: config.featureFlags,
    guildId: guild.id
  });
  if (!flag.allowed || !shouldRunParadiseReconciliation({ lastRunAt: config.reconciliationHealth?.lastRunAt })) return null;
  const result = buildParadiseReconciliation({
    state: paradiseStateForGuildReconciliation(state, guild.id),
    managedGuildIds: [guild.id],
    existingChannelIds: [...guild.channels.cache.keys()]
  });
  const summary = summarizeParadiseReconciliation(result);
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].reconciliationHealth = summary;
    return next;
  });
  return summary;
}

async function runParadiseMaintenance(guild) {
  await guild.members.fetch().catch(() => {});
  await saveState(async state => {
    const now = Date.now();
    const config = configForGuild(state, guild.id);
    for (const [userId, item] of Object.entries(state.whitelists)) {
      if (!belongsToGuild(item, guild.id)) continue;
      if (item.expiresAt && Date.parse(item.expiresAt) <= now) {
        delete state.whitelists[userId];
        const member = guild.members.cache.get(item.userId || userId);
        const role = guild.roles.cache.find(entry => entry.name === "Activity Whitelist");
        if (member && role) await member.roles.remove(role, "Paradise activity whitelist expired").catch(() => {});
      }
    }
    for (const [userId, item] of Object.entries(state.loa)) {
      if (!belongsToGuild(item, guild.id)) continue;
      if (item.status === "approved" && Number(item.expiresAt) <= now) {
        state.loa[userId] = { ...item, status: "expired", endedAt: new Date().toISOString() };
        const member = guild.members.cache.get(item.userId || userId);
        const role = guild.roles.cache.find(entry => entry.name === "LOA");
        if (member && role) await member.roles.remove(role, "Paradise LOA expired").catch(() => {});
      }
    }
    for (const [id, check] of Object.entries(state.activityChecks)) {
      if (!belongsToGuild(check, guild.id)) continue;
      if (check.processedAt || Number(check.expiresAt) > now) continue;
      const roles = ACTIVITY_GROUP_ROLES[check.group] || [];
      const exempt = new Set(Object.entries(state.whitelists)
        .filter(([, item]) => belongsToGuild(item, guild.id) && (!item.expiresAt || Date.parse(item.expiresAt) > now))
        .map(([userId, item]) => item.userId || userId));
      for (const [userId, item] of Object.entries(state.loa)) {
        if (belongsToGuild(item, guild.id) && item.status === "approved" && Number(item.expiresAt) > now) exempt.add(item.userId || userId);
      }
      const responded = new Set(check.responses || []);
      const removed = [];
      if (config.autoActivityRoleRemoval === true && config.activity?.autoRoleChanges === true) {
        for (const member of guild.members.cache.values()) {
          if (member.user.bot || responded.has(member.id) || exempt.has(member.id)) continue;
          const removable = member.roles.cache.filter(role => roles.includes(role.name));
          if (removable.size) {
            await member.roles.remove(removable, `Missed ${check.group} activity check`).catch(() => {});
            removed.push(member.id);
          }
        }
      }
      state.activityChecks[id] = { ...check, processedAt: new Date().toISOString(), removed };
      const log = await configuredChannel(guild, "activity_logs_channel", "activity-review")
        || guild.channels.cache.find(channel => channel.name.includes("activity-review"));
      if (log) await log.send(`Activity check **${check.group}** closed. Responses: ${responded.size}. Role removals: ${removed.length}. Whitelists were respected.`).catch(() => {});
    }
    if (config.autoActivityChecks === true) {
      const last = Number(config.lastAutoActivityCheckAt || 0);
      const intervalHours = Number(config.activity?.checkEveryHours || 48);
      if (now - last >= intervalHours * 60 * 60_000) {
        for (const group of ["Referee", "Tryout", "Training"]) await postAutomaticActivityCheck(guild, group, state);
        config.lastAutoActivityCheckAt = now;
      }
    }
    const sundayKey = new Date(now).toISOString().slice(0, 10);
    if (new Date(now).getUTCDay() === 0 && config.lastWeeklyReview !== sundayKey) {
      const log = await configuredChannel(guild, "activity_logs_channel", "activity-review")
        || guild.channels.cache.find(channel => channel.name.includes("activity-review"));
      if (log) {
        const lines = [];
        const quotas = config.weeklyQuotas || WEEKLY_QUOTAS;
        const promotionMultiplier = Number(config.activity?.promotionMultiplier || 3);
        for (const member of guild.members.cache.values()) {
          const quota = Object.entries(quotas).find(([role]) => member.roles.cache.some(item => item.name === role));
          if (!quota) continue;
          const [role, rule] = quota;
          const count = weekActivityCount(state.staffActivity[member.id], rule.key, now);
          const recommendation = count < rule.minimum ? "demotion review" : count >= rule.minimum * promotionMultiplier ? "promotion review" : "meets quota";
          lines.push(`${member} — ${role}: ${count}/${rule.minimum} — ${recommendation}`);
        }
        await log.send({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Sunday Staff Review")
          .setDescription(lines.join("\n").slice(0, 4000) || "No quota roles found.")
          .setFooter({ text: "Recommendations only unless autoStaffChanges is explicitly enabled • Made By Fieel" })] }).catch(() => {});
      }
      config.lastWeeklyReview = sundayKey;
    }
    return state;
  });
  const state = await loadState();
  const config = configForGuild(state, guild.id);
  if (config.activeSetupMode && config.xpSettings?.enabled !== false) {
    const afkChannelId = guild.afkChannelId;
    for (const voiceState of guild.voiceStates.cache.values()) {
      if (!voiceState.member?.user?.bot && voiceState.channelId && voiceState.channelId !== afkChannelId
        && !voiceState.selfDeaf && !voiceState.serverDeaf) {
        await addMemberXp(guild, voiceState.member, Number(config.xpSettings?.voiceXpPerInterval || 15), "voice").catch(() => {});
      }
    }
  }
  const clock = berlinClock();
  const questionHour = Math.min(23, Math.max(0, Number(config.eventSettings?.dailyQuestionHour ?? 13)));
  if (config.activeSetupMode === "clan" && config.eventSettings?.dailyQuestionEnabled !== false && clock.hour >= questionHour) {
    await postDailyQuestion(guild).catch(() => {});
  }
  if (config.activeSetupMode && (!config.lastLevelLeaderboardAt || Date.now() - Number(config.lastLevelLeaderboardAt) >= 60 * 60_000)) {
    await updateLevelLeaderboard(guild).catch(() => {});
  }
  await updateLoaPanel(guild).catch(() => {});
  await updateAvailabilityPanel(guild).catch(() => {});
  await runParadiseGuildReconciliation(guild).catch(() => null);
}

async function handleWhitelist(interaction) {
  if (!isOwner(interaction) && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({ content: "Owner or Manage Server permission required.", ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  if (sub === "list") {
    const entries = Object.entries((await loadState()).whitelists)
      .filter(([, item]) => belongsToGuild(item, interaction.guildId) && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()))
      .map(([id, item]) => `<@${item.userId || id}> — ${item.group} — ${item.expiresAt ? `<t:${Math.floor(Date.parse(item.expiresAt) / 1000)}:R>` : "unlimited"}`);
    return interaction.reply({ content: entries.join("\n") || "No active activity whitelists.", ephemeral: true });
  }
  const user = interaction.options.getUser("user");
  if (sub === "remove") {
    await saveState(state => {
      delete state.whitelists[guildUserKey(interaction.guildId, user.id)];
      if (interaction.guildId === PARADISE_TEST_GUILD_ID) delete state.whitelists[user.id];
      return state;
    });
    return interaction.reply({ content: `${user} removed from the activity whitelist.`, ephemeral: true });
  }
  const days = interaction.options.getInteger("days");
  const item = {
    guildId: interaction.guildId, userId: user.id, group: interaction.options.getString("group"), grantedBy: interaction.user.id,
    grantedAt: new Date().toISOString(), expiresAt: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null
  };
  await saveState(state => { state.whitelists[guildUserKey(interaction.guildId, user.id)] = item; return state; });
  const role = await ensureRole(interaction.guild, "Activity Whitelist");
  const member = await interaction.guild.members.fetch(user.id);
  await member.roles.add(role, "Paradise activity whitelist");
  return interaction.reply({ content: `${user} whitelisted for **${item.group}** (${item.expiresAt ? `<t:${Math.floor(Date.parse(item.expiresAt) / 1000)}:R>` : "unlimited"}).`, ephemeral: true });
}

async function handleActivity(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "check") {
    if (!isOwner(interaction) && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return interaction.reply({ content: "Activity checks require Manage Roles.", ephemeral: true });
    }
    const group = interaction.options.getString("group");
    const id = crypto.randomUUID();
    const policy = configForGuild(await loadState(), interaction.guildId).activity || {};
    const deadlineHours = Number(policy.responseDeadlineHours || 24);
    const expiresAt = Date.now() + deadlineHours * 3_600_000;
    await saveState(state => {
      state.activityChecks[id] = { guildId: interaction.guildId, group, startedBy: interaction.user.id, startedAt: new Date().toISOString(), expiresAt, responses: [] };
      return state;
    });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`paradise_activity_present:${id}`).setLabel("I am active / Aktifim").setStyle(ButtonStyle.Success)
    );
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`${group} Activity Check`)
      .setDescription(`Respond within ${deadlineHours} hours. Missing responses create review flags; automatic role changes require explicit dashboard opt-in. Whitelist and LOA exemptions apply.\nDeadline: <t:${Math.floor(expiresAt / 1000)}:R>`)
      .setFooter({ text: "Made By Fieel" })], components: [row] });
  }
  const state = await loadState();
  const now = Date.now();
  const rows = [];
  const guildConfig = configForGuild(state, interaction.guildId);
  const quotas = guildConfig.weeklyQuotas || WEEKLY_QUOTAS;
  const promotionMultiplier = Number(guildConfig.activity?.promotionMultiplier || 3);
  for (const member of interaction.guild.members.cache.values()) {
    const quota = Object.entries(quotas).find(([role]) => member.roles.cache.some(item => item.name === role));
    if (!quota) continue;
    const [role, rule] = quota;
    const count = weekActivityCount(state.staffActivity[member.id], rule.key, now);
    const whitelist = guildUserRecord(state.whitelists, interaction.guildId, member.id);
    const exempt = whitelist && (!whitelist.expiresAt || Date.parse(whitelist.expiresAt) > now);
    const recommendation = exempt ? "WHITELIST" : count < rule.minimum ? "DEMOTION REVIEW" : count >= rule.minimum * promotionMultiplier ? "PROMOTION REVIEW" : "OK";
    rows.push(`${member} — ${role}: ${count}/${rule.minimum} — **${recommendation}**`);
  }
  const pendingTickets = Object.values(state.pendingChallenges).filter(item => ["open", "pending"].includes(item.status)).length;
  const missedChecks = Object.values(state.activityChecks).filter(item => item.processedAt && (item.removed || []).length).length;
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ WEEKLY STAFF ACTIVITY")
    .setDescription(`## ◆ Operations snapshot\n- **Pending/open challenge records:** ${pendingTickets}\n- **Activity checks with missed-role actions:** ${missedChecks}\n\n## ◆ Quota review\n${rows.join("\n").slice(0, 3500) || "_No quota roles found._"}\n\n-# Recommendations require manager review; automatic changes require explicit dashboard opt-in.`)
    .setFooter(paradiseFooter("Sunday staff review"))], ephemeral: true });
}

async function handleActivityResponse(interaction) {
  const id = interaction.customId.split(":")[1];
  const state = await loadState();
  const check = state.activityChecks[id];
  if (!check || check.expiresAt < Date.now()) return interaction.reply({ content: "This activity check has expired.", ephemeral: true });
  const responses = new Set(check.responses || []);
  responses.add(interaction.user.id);
  await saveState(current => { current.activityChecks[id] = { ...check, responses: [...responses] }; return current; });
  return interaction.reply({ content: "Activity response recorded. / Aktivite yanıtın kaydedildi.", ephemeral: true });
}

async function handleMainer(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "set") {
    if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
    const code = interaction.options.getString("code").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
    if (!code) return interaction.reply({ content: "Invalid mainer code.", ephemeral: true });
    await saveState(state => {
      state.guildConfigs[interaction.guildId] = state.guildConfigs[interaction.guildId] || structuredClone(state.config || {});
      state.guildConfigs[interaction.guildId].mainerCode = code;
      return state;
    });
  }
  const code = configForGuild(await loadState(), interaction.guildId).mainerCode || "Not configured";
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ PARADISE MAINING GUIDE")
    .setDescription(`# Official code\n\`${code}\`\n\n## ◆ How to main Paradise\n1. Open the **official TSBCC maining channel**.\n2. Run \`/mainclan code:${code} region:EU\`.\n3. Choose only your **approved staff role**.\n4. Keep proof in **mainer-proof** for review.\n\n> **Security:** Paradise never asks for cookies, passwords or tokens.\n\n-# Use only official Discord and Roblox links.`)
    .setFooter(paradiseFooter("Clan operations"))] });
}

async function handleReferee(interaction) {
  if (interaction.options.getSubcommand() === "works") {
    const count = weekActivityCount((await loadState()).staffActivity[interaction.user.id], "referee");
    return interaction.reply({ content: `Your approved referee works this week: **${count}** (minimum: 2).`, ephemeral: true });
  }
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("⚖️ REFEREE GUIDE")
    .setDescription("# Referee Operations\n## ◆ Required flow\n1. Check **profile**, **availability**, **cooldown** and open tickets.\n2. Create or claim the challenge ticket.\n3. Record the complete set and remain neutral.\n4. Submit `/challenge post` with score, spots, proof and ticket ID.\n5. Wait for **Experienced Referee / Referee Manager** approval.\n\n-# Approved posts are copied to referee-works and counted automatically.")
    .addFields(
      { name: "◇ __Trial Referee__", value: "- Must work with a second referee\n- Lower leaderboard ranges only" },
      { name: "◇ __Referee__", value: "- May independently handle **Top 11–30**\n- Top 1–10 requires senior approval" },
      { name: "◇ __Experienced / Manager__", value: "- Reviews pending posts\n- Coaches referees\n- Handles higher-ranked sets" },
      { name: "🛡️ __Non-negotiable standards__", value: "**Neutrality**, complete recording, correct ticket validation, consistent wording and saved transcripts." }
    ).setFooter(paradiseFooter("Referee Operations"))] });
}

async function handleStaffReport(interaction) {
  const reported = interaction.options.getUser("user");
  const category = interaction.guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && channel.name === "TICKET");
  const channel = await interaction.guild.channels.create({
    name: `staff-report-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90),
    type: ChannelType.GuildText, parent: category?.id,
    rateLimitPerUser: 30,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: interaction.guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels] }
    ],
    reason: "Paradise private staff report"
  });
  await channel.send({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("Private Staff Report")
    .addFields(
      { name: "Reporter", value: `${interaction.user}` },
      { name: "Reported member", value: `${reported}` },
      { name: "Reason", value: interaction.options.getString("reason").slice(0, 1000) },
      { name: "Proof", value: interaction.options.getString("proof") || "Not supplied" }
    ).setFooter({ text: "Keep evidence private • Made By Fieel" })] });
  return interaction.reply({ content: `Private report opened: ${channel}`, ephemeral: true });
}

const HELP_CATEGORIES = Object.freeze({
  community: {
    label: "Community",
    en: "# Fieel's Community\n## Purpose\nProduct support, events, applications, roles and community activity. Challenge/ranked commands are hidden here.\n\n## Commands\n- `/fima_ticket` — open private product support in **open-ticket**\n- `/fima_help` — Fima product and account help\n- `/application panel` — staff: publish the application menu\n- `/giveaway create`, `/event create`, `/gamenight start`\n- `/rank`, `/leaderboard show`\n\n## Common mistake\nDo not use clan challenge or roster commands in Community.\n\n-# Dashboard: Template Setup → Fieel's Community",
    tr: "# Fieel's Community\n## Amaç\nÜrün desteği, etkinlikler, başvurular, roller ve topluluk aktivitesi. Challenge/rank komutları burada gizlidir.\n\n## Komutlar\n- `/fima_ticket` — **open-ticket** kanalında özel ürün desteği\n- `/fima_help` — Fima ürün ve hesap yardımı\n- `/application panel` — staff: başvuru menüsünü yayınlar\n- `/giveaway create`, `/event create`, `/gamenight start`\n- `/rank`, `/leaderboard show`\n\n## Yaygın hata\nCommunity içinde klan challenge/roster komutlarını kullanmayın.\n\n-# Dashboard: Template Setup → Fieel's Community"
  },
  clan: {
    label: "Clan",
    en: "# Paradise Clan\n## Fighters\n- `/profile create` — verify Roblox and choose region\n- `/challenge create` — use in **challenge-ticket**\n- `/availability panel` — refresh live status\n\n## Clan operations\n- `/lineup add board:main user:@user role:Starter`\n- `/roster update user:@user rank:<rank>`\n- `/relation add type:ally name:<clan>`\n- `/mainer guide`\n\n## Required access\nMember commands require a completed profile; board edits require configured clan management roles.\n\n-# Dashboard: Roster / Lineups / Relations",
    tr: "# Paradise Clan\n## Oyuncular\n- `/profile create` — Roblox doğrula ve bölge seç\n- `/challenge create` — **challenge-ticket** kanalında kullan\n- `/availability panel` — canlı durumu yeniler\n\n## Klan operasyonları\n- `/lineup add board:main user:@user role:Starter`\n- `/roster update user:@user rank:<rank>`\n- `/relation add type:ally name:<clan>`\n- `/mainer guide`\n\n## Gerekli yetki\nÜye komutları tamamlanmış profil; pano düzenlemeleri ayarlı klan yönetim rolü gerektirir.\n\n-# Dashboard: Roster / Lineups / Relations"
  },
  tsbtr: {
    label: "TSBTR",
    en: "# TSBTR Operations\n- `/leaderboard add user:@user rank:25`\n- `/leaderboard move user:@user rank:20`\n- `/challenge create`\n- `/challenge post winner:@user loser:@user score:10-5`\n- `/autowin winner:@user reason:Dodged`\n- `/referee guide`, `/activity summary`\n\n## Required channels\n**top-10**, **top-20**, **top-30**, **challenge-results**, **availability**, **referee-post**.\n\n-# Dashboard: Challenge System + Leaderboard / Profiles / Rank Rules",
    tr: "# TSBTR Operasyonları\n- `/leaderboard add user:@user rank:25`\n- `/leaderboard move user:@user rank:20`\n- `/challenge create`\n- `/challenge post winner:@user loser:@user score:10-5`\n- `/autowin winner:@user reason:Dodged`\n- `/referee guide`, `/activity summary`\n\n## Gerekli kanallar\n**top-10**, **top-20**, **top-30**, **challenge-results**, **availability**, **referee-post**.\n\n-# Dashboard: Challenge System + Leaderboard / Profiles / Rank Rules"
  },
  staff: {
    label: "Staff",
    en: "# Staff Operations\n- `/activity check group:<group>` — Manage Roles\n- `/activity summary` — weekly quota review\n- `/whitelist add user:@user group:<group> days:<optional>`\n- `/loa approve|deny`\n- `/report staff user:@user reason:<reason>`\n\n## Rule\nNever grant ranks manually when Paradise has a controlled workflow.",
    tr: "# Staff Operasyonları\n- `/activity check group:<group>` — Rolleri Yönet yetkisi\n- `/activity summary` — haftalık kota özeti\n- `/whitelist add user:@user group:<group> days:<opsiyonel>`\n- `/loa approve|deny`\n- `/report staff user:@user reason:<neden>`\n\n## Kural\nParadise kontrollü akış sağlıyorsa rankı elle vermeyin."
  },
  moderator: {
    label: "Moderator",
    en: "# Moderator Guide\n- `/mod warn user:@user reason:<reason>`\n- `/mod mute user:@user duration:<minutes> reason:<reason>`\n- `/mod kick-request user:@user reason:<reason>`\n- `/mod ban-request user:@user reason:<reason>`\n- `/mod quarantine user:@user reason:<reason>`\n\n## Approval\nLower staff requests kick/ban; senior staff approve in **moderation-requests**. Preserve evidence and use proportional action.",
    tr: "# Moderator Rehberi\n- `/mod warn user:@user reason:<neden>`\n- `/mod mute user:@user duration:<dakika> reason:<neden>`\n- `/mod kick-request user:@user reason:<neden>`\n- `/mod ban-request user:@user reason:<neden>`\n- `/mod quarantine user:@user reason:<neden>`\n\n## Onay\nAlt staff kick/ban talebi açar; üst staff **moderation-requests** kanalında onaylar. Kanıtı koruyun ve orantılı ceza verin."
  },
  referee: {
    label: "Referee",
    en: "# Referee Guide\n- `/challenge post winner:@user loser:@user score:10-5 ticket_id:<id>`\n- `/challenge autowin winner:@user reason:Dodged`\n- `/referee works`\n\n## Format\nEnter only `10-5` or `Auto`; never type “to @user”. Auto/strike requires a note. Trial/normal Referee cannot approve by default.\n\n-# Use inside the challenge ticket or referee-post.",
    tr: "# Hakem Rehberi\n- `/challenge post winner:@user loser:@user score:10-5 ticket_id:<id>`\n- `/challenge autowin winner:@user reason:Dodged`\n- `/referee works`\n\n## Format\nYalnızca `10-5` veya `Auto` girin; “to @user” yazmayın. Auto/strike için not gerekir. Trial/normal Referee varsayılan olarak onaylayamaz.\n\n-# Challenge ticket veya referee-post içinde kullanın."
  },
  training: {
    label: "Training Hoster",
    en: "# Training Hoster\n- `/training start link:<roblox link> rules:<optional>`\n- `/training result score:3-1 winner:Red mvps:@user`\n\nUse **SERVER LOCKED**, **UNLOCK** and **END TRAINING** on your plain Markdown announcement. Only the recorded hoster or owner can control it.",
    tr: "# Training Hoster\n- `/training start link:<roblox link> rules:<opsiyonel>`\n- `/training result score:3-1 winner:Red mvps:@user`\n\nDüz Markdown duyurunuzdaki **SERVER LOCKED**, **UNLOCK** ve **END TRAINING** düğmelerini kullanın. Yalnızca kayıtlı hoster veya owner kontrol edebilir."
  },
  tryout: {
    label: "Tryout Hoster",
    en: "# Tryout Hoster\n- `/tryout start link:<roblox link>`\n- `/tryout result user:@player stage:2 level:High strength:Strong note:<optional>`\n\nEvaluate RC timing, movement, pressure, adaptation and game sense. You cannot grant above your configured authority.",
    tr: "# Tryout Hoster\n- `/tryout start link:<roblox link>`\n- `/tryout result user:@oyuncu stage:2 level:High strength:Strong note:<opsiyonel>`\n\nRC zamanlaması, movement, pressure, adaptasyon ve game sense değerlendirin. Ayarlı yetkinizin üstünde rank veremezsiniz."
  },
  events: {
    label: "Giveaway / Event",
    en: "# Giveaway & Event Hoster\n- `/giveaway create prize:<text> minutes:<n> winners:<n>`\n- `/event create title:<text> time:<timestamp> image:<file>`\n- `/gamenight start game:<name> link:<url> image:<file>`\n\nImages are required for events/game nights. Configure ping and log channels in the dashboard.",
    tr: "# Giveaway & Event Hoster\n- `/giveaway create prize:<metin> minutes:<n> winners:<n>`\n- `/event create title:<metin> time:<timestamp> image:<dosya>`\n- `/gamenight start game:<ad> link:<url> image:<dosya>`\n\nEtkinlik ve oyun gecesinde görsel zorunludur. Ping/log kanallarını dashboarddan ayarlayın."
  },
  tickets: {
    label: "Tickets",
    en: "# Ticket Guide\nUse the correct panel: support, application, challenge, staff report, appeal or bail. Close first, save transcript, then remove member access. Never post passwords, cookies, tokens or full keys.",
    tr: "# Ticket Rehberi\nDoğru paneli kullanın: support, application, challenge, staff report, appeal veya bail. Önce kapatın, transcript kaydedin, sonra üye erişimini kaldırın. Şifre, cookie, token veya tam key paylaşmayın."
  },
  applications: {
    label: "Applications",
    en: "# Applications\n- `/application panel`\n- `/application apply`\n- `/application status`\n\nReviewers use Approve, Deny or More Info. Role grants are blocked above reviewer/Paradise hierarchy; blacklisted users cannot apply.",
    tr: "# Başvurular\n- `/application panel`\n- `/application apply`\n- `/application status`\n\nİnceleyenler Approve, Deny veya More Info kullanır. Reviewer/Paradise hiyerarşisinin üstündeki roller engellenir; blacklist kullanıcı başvuramaz."
  },
  voice: {
    label: "Voice / Join-to-Create",
    en: "# Join-to-Create\nJoin **Join to Create**. Paradise creates your room and gives controls: rename, limit, lock, hide, permit, reject, transfer and delete. Unsafe names reset automatically.",
    tr: "# Join-to-Create\n**Join to Create** kanalına girin. Paradise odanızı kurup rename, limit, lock, hide, permit, reject, transfer ve delete kontrollerini verir. Güvensiz isimler otomatik sıfırlanır."
  },
  xp: {
    label: "XP / Levels",
    en: "# XP & Levels\n- `/rank [user]`\n- `/leaderboard show type:total|chat|voice|weekly|monthly`\n\nSpam, bot and log channels do not award XP. Channel exclusions and rewards are configured in Dashboard → XP / Levels.",
    tr: "# XP & Seviyeler\n- `/rank [user]`\n- `/leaderboard show type:total|chat|voice|weekly|monthly`\n\nSpam, bot ve log kanalları XP vermez. Kanal hariç tutma ve ödüller Dashboard → XP / Levels bölümündedir."
  },
  dashboard: {
    label: "Dashboard",
    en: "# Paradise Operations Console\n1. Select a managed server.\n2. Select its template.\n3. Auto-detect/remap channels and roles.\n4. Preview before create/repair/repost actions.\n5. Destructive rebuild always requires backup and typed confirmation.\n\n-# Owner-only: https://fimamacro.com/paradise",
    tr: "# Paradise Operations Console\n1. Yönetilecek sunucuyu seçin.\n2. Şablonunu seçin.\n3. Kanal/rolleri otomatik algılayın veya eşleyin.\n4. Create/repair/repost öncesi preview alın.\n5. Yıkıcı rebuild her zaman yedek ve yazılı onay ister.\n\n-# Yalnızca owner: https://fimamacro.com/paradise"
  },
  profile: {
    label: "Member / Profile / Verify",
    en: "# Member, Profile & Roblox Verification\n- `/help query:profile` — search this manual\n- `/profile create` — start the short Roblox-safe verification flow\n- `/profile view profile_id:<id>`\n- `/profile view user:@user`\n- `/profile view user_id:<discord id>`\n- `/profile view roblox_name:<name>`\n- `/rank` — view chat/voice XP\n\nDuplicate profiles are blocked. A completed profile is required for challenge and controlled result flows.",
    tr: "# Üye, Profil ve Roblox Doğrulama\n- `/help query:profile` — bu rehberde arama\n- `/profile create` — kısa, Roblox-güvenli doğrulamayı başlat\n- `/profile view profile_id:<id>`\n- `/profile view user:@user`\n- `/profile view user_id:<discord id>`\n- `/profile view roblox_name:<ad>`\n- `/rank` — chat/ses XP bilgisini göster\n\nAynı kişi için ikinci profil engellenir. Challenge ve kontrollü sonuçlar için tamamlanmış profil gerekir."
  },
  challenge: {
    label: "Challenge",
    en: "# Challenge System\n- `/challenge create` — show only currently eligible targets\n- `/challenge post winner:@user loser:@user score:10-5`\n- `/autowin winner:@user reason:Dodged` — inside the ticket\n\nThe bot rechecks range, profile, cooldown, immunity and open tickets immediately before creation. Enter only the score; Paradise formats the winner wording.",
    tr: "# Challenge Sistemi\n- `/challenge create` — yalnızca o anda uygun rakipleri gösterir\n- `/challenge post winner:@user loser:@user score:10-5`\n- `/autowin winner:@user reason:Dodged` — ticket içinde\n\nBot açmadan hemen önce range, profil, cooldown, immunity ve açık ticket kontrolünü tekrarlar. Yalnızca skoru girin; kazanan metnini Paradise yazar."
  },
  leaderboard: {
    label: "Leaderboard",
    en: "# Ranked Leaderboard\n- `/leaderboard panel` or `/leaderboard repost`\n- `/leaderboard add user:@user rank:25`\n- `/leaderboard move user:@user rank:20`\n- `/leaderboard swap user1:@a user2:@b`\n- `/leaderboard import|export`\n\nCards show full Stage + Level + Strength and update in place. Duplicate ranks are rejected.",
    tr: "# Rank Sıralaması\n- `/leaderboard panel` veya `/leaderboard repost`\n- `/leaderboard add user:@user rank:25`\n- `/leaderboard move user:@user rank:20`\n- `/leaderboard swap user1:@a user2:@b`\n- `/leaderboard import|export`\n\nKartlar tam Stage + Level + Strength gösterir ve yerinde güncellenir. Aynı rank iki kez kullanılamaz."
  },
  roster: {
    label: "Roster / Lineup",
    en: "# Roster & Lineups\n- `/lineup panel|repost`\n- `/lineup add board:main user:@user role:Starter`\n- `/lineup move`, `/lineup remove`, `/lineup clear`\n- `/roster add|remove|update|repost`\n- `/mainer proof add|approve|deny`\n\nBoard message IDs are stored so updates edit the existing board instead of spamming.",
    tr: "# Roster ve Kadrolar\n- `/lineup panel|repost`\n- `/lineup add board:main user:@user role:Starter`\n- `/lineup move`, `/lineup remove`, `/lineup clear`\n- `/roster add|remove|update|repost`\n- `/mainer proof add|approve|deny`\n\nPano mesaj ID'leri saklanır; güncellemeler yeni mesaj spamı yerine mevcut panoyu düzenler."
  },
  security: {
    label: "Security / Logs",
    en: "# Moderation Security\n- `/mod warn`, `/mod mute`\n- `/mod kick-request`, `/mod ban-request`\n- `/mod quarantine`, `/mod unquarantine`\n- `/mod lockdown`, `/mod raidmode`\n- `/security panel`\n\nLower staff submit approval requests. Paradise enforces role hierarchy and records audited actions.",
    tr: "# Moderasyon Güvenliği\n- `/mod warn`, `/mod mute`\n- `/mod kick-request`, `/mod ban-request`\n- `/mod quarantine`, `/mod unquarantine`\n- `/mod lockdown`, `/mod raidmode`\n- `/security panel`\n\nAlt staff onay talebi açar. Paradise rol hiyerarşisini uygular ve işlemleri loglar."
  },
  autoresponder: {
    label: "Auto Responder",
    en: "# Auto Responder\n**Status:** roadmap — not enabled on this server yet.\n\nPlanned controls: channel/role filters, cooldowns, variables, safe exact/contains matching and dashboard previews. No fake commands are advertised until the module is live.",
    tr: "# Otomatik Yanıt\n**Durum:** yol haritası — bu sunucuda henüz aktif değil.\n\nPlanlanan kontroller: kanal/rol filtreleri, cooldown, değişkenler, güvenli exact/contains eşleşmesi ve dashboard preview. Modül canlı olmadan sahte komut gösterilmez."
  },
  ai: {
    label: "AI Assistant",
    en: "# Safe AI Assistant\n**Status:** roadmap — disabled until an approved knowledge base and provider are configured.\n\nIt will be opt-in, channel-limited, rate-limited and escalate uncertain answers to staff tickets.",
    tr: "# Güvenli AI Asistanı\n**Durum:** yol haritası — onaylı bilgi tabanı ve sağlayıcı ayarlanana kadar kapalı.\n\nOpt-in, kanal sınırlı ve rate-limitli olacak; emin olmadığı cevapları staff ticket'a yönlendirecek."
  },
  social: {
    label: "Social Feeds",
    en: "# Social Feeds\n**Status:** roadmap. Only official APIs, RSS or webhooks will be supported. Private scraping, passwords and bypasses are forbidden.",
    tr: "# Sosyal Akışlar\n**Durum:** yol haritası. Yalnızca resmi API, RSS veya webhook desteklenecek. Özel scraping, şifre ve bypass yasaktır."
  },
  custom: {
    label: "Custom Commands",
    en: "# Custom Commands\n**Status:** roadmap. The planned builder will enforce cooldowns, permissions, mention limits and Discord role hierarchy before any role action.",
    tr: "# Özel Komutlar\n**Durum:** yol haritası. Planlanan oluşturucu rol işlemlerinden önce cooldown, yetki, mention sınırı ve Discord rol hiyerarşisini uygulayacak."
  },
  premium: {
    label: "Premium",
    en: "# Paradise Premium\n**Status:** planning only. Billing is not enabled. Free/Starter/Pro/Ultimate feature boundaries will be published only after owner approval.",
    tr: "# Paradise Premium\n**Durum:** yalnızca planlama. Ödeme açık değil. Free/Starter/Pro/Ultimate özellik sınırları owner onayından sonra yayınlanacak."
  },
  music: {
    label: "Music / Audio",
    en: "# Music / Audio\n**Status:** blocked until a licensed/legal provider is configured. Paradise will not rip YouTube or Spotify audio and will not use circumvention tools.",
    tr: "# Müzik / Ses\n**Durum:** lisanslı/yasal sağlayıcı ayarlanana kadar kapalı. Paradise YouTube veya Spotify sesi rip etmeyecek ve bypass aracı kullanmayacak."
  },
  welcome: {
    label: "Welcome / Leave",
    en: "# Welcome & Leave\n- `/welcome preview` — staff: preview the configured welcome card\n- `/leave preview` — staff: preview the leave message\n\nWelcome cards should mention the user, show the server name, useful channels, member count and configured banner. Missing channels are hidden instead of showing broken placeholders.\n\n-# Dashboard: Welcome / Leave + Branding",
    tr: "# Welcome & Leave\n- `/welcome preview` — staff: ayarlı welcome kartını önizler\n- `/leave preview` — staff: ayrılma mesajını önizler\n\nWelcome kartları kullanıcıyı etiketler, sunucu adını, önemli kanalları, üye sayısını ve ayarlı bannerı gösterir. Eksik kanallar bozuk placeholder yerine gizlenir.\n\n-# Dashboard: Welcome / Leave + Branding"
  },
  availability: {
    label: "Availability / LOA",
    en: "# Availability & LOA\n- `/availability panel` — repost the live cooldown/immunity/open-ticket board\n- `/loa request start:<date> end:<date> reason:<text>`\n- `/loa approve`, `/loa deny`\n\nChallenge cooldown, immunity, LOA and active tickets are separate states. Timed states use Discord timestamps so everyone sees local time.",
    tr: "# Availability & LOA\n- `/availability panel` — canlı cooldown/immunity/open-ticket panosunu tekrar postlar\n- `/loa request start:<tarih> end:<tarih> reason:<neden>`\n- `/loa approve`, `/loa deny`\n\nChallenge cooldown, immunity, LOA ve aktif ticket ayrı durumlardır. Süreler Discord timestamp ile herkesin yerel saatine göre görünür."
  },
  blacklist: {
    label: "Blacklist / Appeal / Bail",
    en: "# Blacklist, Appeal & Bail\n- `/blacklist add user:@user reason:<reason>`\n- `/blacklist remove user:@user reason:<reason>`\n- `/appeal panel`\n- `/bail panel`\n\nBlacklisted users should only see the configured appeal information area. Bail is never guaranteed; staff review proof and reason before any decision.",
    tr: "# Blacklist, Appeal & Bail\n- `/blacklist add user:@user reason:<neden>`\n- `/blacklist remove user:@user reason:<neden>`\n- `/appeal panel`\n- `/bail panel`\n\nBlacklist kullanıcı yalnızca ayarlı appeal bilgi alanını görmelidir. Bail garanti değildir; staff karar öncesi kanıtı ve nedeni inceler."
  },
  relations: {
    label: "Relations",
    en: "# Allies & Enemy Clans\n- `/relation panel`\n- `/relation add type:ally name:<clan> invite:<optional>`\n- `/relation add type:enemy name:<clan> note:<optional>`\n- `/relation edit`, `/relation remove`, `/relation repost`\n\nThe board keeps Current Allies and Enemy Clans separate and edits the same message in place.",
    tr: "# Ally ve Enemy Clanlar\n- `/relation panel`\n- `/relation add type:ally name:<klan> invite:<opsiyonel>`\n- `/relation add type:enemy name:<klan> note:<opsiyonel>`\n- `/relation edit`, `/relation remove`, `/relation repost`\n\nPano Current Allies ve Enemy Clans alanlarını ayrı tutar ve aynı mesajı yerinde günceller."
  },
  admin: {
    label: "Admin / Owner",
    en: "# Admin / Owner\n- `/setupfieelsclan preview|create-missing|repost-guides|repair|rebuild`\n- `/setupfieelscommunity preview|create-missing|repost-guides|repair|rebuild`\n- `/setupfieelstsbtr preview|create-missing|repost-guides|repair|rebuild`\n\nDestructive rebuild requires backup, preview and typed confirmation. Do not run production rebuild without owner approval.",
    tr: "# Admin / Owner\n- `/setupfieelsclan preview|create-missing|repost-guides|repair|rebuild`\n- `/setupfieelscommunity preview|create-missing|repost-guides|repair|rebuild`\n- `/setupfieelstsbtr preview|create-missing|repost-guides|repair|rebuild`\n\nYıkıcı rebuild için yedek, preview ve yazılı onay gerekir. Owner onayı olmadan production rebuild çalıştırmayın."
  }
});

function helpEmbed(scope, locale = "en") {
  const category = HELP_CATEGORIES[scope] || HELP_CATEGORIES.clan;
  const language = String(locale).toLowerCase().startsWith("tr") ? "tr" : "en";
  return new EmbedBuilder().setColor(DEFAULT_PARADISE_BRAND_COLOR)
    .setTitle(`✦ ${category.label.toUpperCase()} COMMAND GUIDE`)
    .setDescription(category[language])
    .setFooter(paradiseFooter(language === "tr" ? "Türkçe yardım" : "English help"));
}

function helpComponents(scope = "clan") {
  const entries = Object.entries(HELP_CATEGORIES);
  const menuRows = [];
  const buildMenu = (chunk, index) => new StringSelectMenuBuilder()
    .setCustomId(`paradise_help_category:${index}`)
    .setPlaceholder(index === 0 ? "Main guide categories / Ana rehber" : "More guides / Diğer rehberler")
    .addOptions(chunk.map(([value, item]) => ({
      label: item.label,
      value,
      default: value === scope
    })));
  for (let index = 0; index < entries.length; index += 25) {
    menuRows.push(new ActionRowBuilder().addComponents(buildMenu(entries.slice(index, index + 25), index / 25)));
  }
  const languageRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_help_lang:en:${scope}`).setLabel("English").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`paradise_help_lang:tr:${scope}`).setLabel("Türkçe").setStyle(ButtonStyle.Secondary)
  );
  return [...menuRows, languageRow];
}

function registryCommandLabel(entry) {
  return `/${entry.command}${entry.subcommand ? ` ${entry.subcommand}` : ""}`;
}

function memberHelpEntries(context) {
  return visibleParadiseCommands({ ...context, channelConstraintConfigured: false })
    .filter(entry => entry.memberSafe);
}

function memberHelpPayload(entries, locale = "en", selectedId = null) {
  const tr = String(locale || "").toLowerCase().startsWith("tr");
  const selected = entries.find(entry => entry.id === selectedId) || null;
  const description = selected
    ? [
      `## ${registryCommandLabel(selected)}`,
      selected.description,
      selected.examples?.length ? `\n**${tr ? "Örnek" : "Example"}:** \`${selected.examples[0]}\`` : null,
      selected.allowedChannels?.includes("any") ? null : `**${tr ? "Kanal" : "Channel"}:** ${tr ? "Yapılandırılmış ilgili kanalda kullan." : "Use it in its configured channel."}`,
      selected.relatedDashboardPage ? `**Dashboard:** ${selected.relatedDashboardPage}` : null,
      `\n-# ${tr ? "Bu yardım yalnızca sana açık üye komutlarını gösterir." : "This help shows only member commands currently available to you."}`
    ].filter(Boolean).join("\n")
    : [
      tr ? "Kullanabileceğin üye komutları aşağıda listelenir. Detay için bir komut seç." : "Your currently available member commands are listed below. Select one for details.",
      "",
      ...(entries.length
        ? entries.map(entry => `- **${registryCommandLabel(entry)}** — ${entry.description}`)
        : [tr ? "- Bu sunucuda sana açık bir Paradise üye komutu yok." : "- No Paradise member command is currently available to you in this server."])
    ].join("\n");
  const components = [];
  if (entries.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("paradise_member_help")
        .setPlaceholder(tr ? "Komut detayı seç" : "Choose a command detail")
        .addOptions(entries.slice(0, 25).map(entry => ({
          label: registryCommandLabel(entry).slice(0, 100),
          description: entry.description.slice(0, 100),
          value: entry.id,
          default: entry.id === selected?.id
        })))
    ));
  }
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_member_help_lang:en:${selected?.id || "overview"}`).setLabel("English").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`paradise_member_help_lang:tr:${selected?.id || "overview"}`).setLabel("Türkçe").setStyle(ButtonStyle.Secondary)
  ));
  return {
    embeds: [new EmbedBuilder().setColor(DEFAULT_PARADISE_BRAND_COLOR)
      .setTitle(tr ? "✦ PARADISE ÜYE YARDIMI" : "✦ PARADISE MEMBER HELP")
      .setDescription(description)],
    components
  };
}

const STAFF_GUIDE_CATEGORIES = Object.freeze([
  ["training", "Training"], ["tryout", "Tryout"], ["referee", "Referee / Challenge"],
  ["moderation", "Moderation / Security"], ["support", "Support / License"], ["setup", "Setup / Owner"]
]);

function staffGuideCategory(entry) {
  const command = String(entry?.command || "");
  if (["training", "paradisetraining"].includes(command)) return "training";
  if (command === "tryout") return "tryout";
  if (["challenge", "referee", "availability"].includes(command)) return "referee";
  if (["mod", "modcase", "moderation", "security", "blacklist", "appeal", "bail"].includes(command)) return "moderation";
  if (command.startsWith("fima_") || ["application"].includes(command)) return "support";
  return "setup";
}

function staffGuidePayload(language = "tr") {
  const tr = language !== "en";
  return {
    embeds: [new EmbedBuilder().setColor(DEFAULT_PARADISE_BRAND_COLOR)
      .setTitle(tr ? "◆ PERSONEL KOMUT REHBERİ" : "◆ STAFF COMMAND GUIDE")
      .setDescription(tr
        ? "Rolüne uygun komutları seçmek için aşağıdaki kategoriyi kullan. Ayrıntılar yalnız sana özel görünür; görünmeyen komutlar için yetkin yoktur."
        : "Choose a category to see only commands your current role can use. Details are private to you; unavailable commands are not authorized.")],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId("paradise_staff_guide_category")
        .setPlaceholder(tr ? "Yetkili komut kategorisi seç" : "Select a staff command category")
        .addOptions(STAFF_GUIDE_CATEGORIES.map(([value, label]) => ({ value, label })))),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("paradise_staff_guide_lang:tr").setLabel("Türkçe").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("paradise_staff_guide_lang:en").setLabel("English").setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

function staffGuideDetailPayload(entries, category, locale = "tr") {
  const tr = String(locale || "").toLowerCase().startsWith("tr");
  const categoryLabel = STAFF_GUIDE_CATEGORIES.find(([key]) => key === category)?.[1] || category;
  const visible = entries.filter(entry => staffGuideCategory(entry) === category);
  const lines = visible.length
    ? visible.map(entry => [
      `## ${registryCommandLabel(entry)}`,
      entry.description,
      `**${tr ? "Gerekli Paradise yetkisi" : "Required Paradise permission"}:** ${entry.requiredParadisePermission || (tr ? "Yapılandırılmış staff yetkisi" : "Configured staff permission")}`,
      entry.examples?.[0] ? `**${tr ? "Örnek" : "Example"}:** \`${entry.examples[0]}\`` : null,
      `**${tr ? "Kayıt" : "Audit"}:** ${entry.auditEvent || (tr ? "Yok" : "None")}`
    ].filter(Boolean).join("\n")).join("\n\n")
    : tr ? "Bu kategoride rolüne açık bir komut yok." : "Your current role has no available command in this category.";
  return {
    embeds: [new EmbedBuilder().setColor(DEFAULT_PARADISE_BRAND_COLOR)
      .setTitle(`${tr ? "◆ YETKİLİ REHBERİ" : "◆ STAFF GUIDE"} — ${categoryLabel}`)
      .setDescription(lines.slice(0, 4096))]
  };
}

async function handleRegistryHelp(interaction) {
  const state = await loadState();
  const entries = memberHelpEntries(paradiseRegistryContextForInteraction(interaction, state));
  const query = interaction.options.getString("query")?.trim().toLowerCase();
  const matches = query
    ? entries.filter(entry => `${entry.id} ${entry.command} ${entry.subcommand || ""} ${entry.description} ${entry.examples.join(" ")}`.toLowerCase().includes(query))
    : entries;
  const payload = memberHelpPayload(matches, interaction.locale, matches.length === 1 ? matches[0].id : null);
  payload.embeds[0].setColor(await paradiseBrandColor());
  return interaction.reply({ ...payload, ephemeral: true });
}

async function handleHelp(interaction) {
  const turkish = String(interaction.locale || "").toLowerCase().startsWith("tr");
  const query = interaction.options.getString("query")?.trim().toLowerCase();
  if (query) {
    const matches = Object.entries(HELP_CATEGORIES).filter(([, item]) =>
      `${item.label} ${item.en} ${item.tr}`.toLowerCase().includes(query)
    ).slice(0, 12);
    const description = matches.length
      ? matches.map(([key, item]) => "- **" + item.label + "** — `" + key + "`").join("\n")
      : turkish ? "Eşleşen komut veya sistem bulunamadı." : "No matching command or system was found.";
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor())
        .setTitle(turkish ? `✦ YARDIM ARAMASI: ${query}` : `✦ HELP SEARCH: ${query}`)
        .setDescription(`${description}\n\n-# ${turkish ? "Aşağıdaki menüden ilgili kategoriyi açın." : "Open the matching category from the menu below."}`)
        .setFooter(paradiseFooter("Searchable command directory"))],
      components: helpComponents(matches[0]?.[0] || "profile"),
      ephemeral: true
    });
  }
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ WHAT DO YOU NEED HELP WITH?")
      .setDescription(turkish
        ? "Bir sistem seçin. Komutun ne yaptığı, gereken yetki ve kullanılacağı kanal yalnızca size gösterilir."
        : "Choose a system below. Its command guide is shown privately, including what each command does, required permissions and where it belongs.")
      .setFooter(paradiseFooter("Interactive command directory"))],
    components: helpComponents(),
    ephemeral: true
  });
}

async function publishSetupGuides(guild, mode) {
  const channel = await configuredChannel(guild, "member_help_channel", ["⌁・bot-komutları", "◇・bot-komutları", "bot-commands", "command-guide"]);
  if (!channel?.isTextBased?.()) return null;
  const state = await loadState();
  const storedMessageId = configForGuild(state, guild.id).commandGuideMessageIds?.[mode];
  let message = storedMessageId ? await channel.messages.fetch(storedMessageId).catch(() => null) : null;
  const payload = memberHelpPayload(
    memberHelpEntries({ template: mode, enabledModules: null, roleKeys: [], plan: "free", isOwner: false }),
    guild.preferredLocale || "tr"
  );
  payload.embeds[0].setColor(await paradiseBrandColor());
  if (message) await message.edit(payload);
  else message = await channel.send(payload);
  await saveState(state => {
    state.guildConfigs[guild.id] = state.guildConfigs[guild.id] || structuredClone(state.config || {});
    state.guildConfigs[guild.id].commandGuideMessageIds = state.guildConfigs[guild.id].commandGuideMessageIds || {};
    state.guildConfigs[guild.id].commandGuideMessageIds[mode] = message.id;
    return state;
  });
  return message;
}

async function configuredChannel(guild, mappingKey, fallbackName) {
  const state = await loadState();
  const configuredId = configForGuild(state, guild.id).channelMappings?.[mappingKey];
  if (configuredId) {
    const configured = guild.channels.cache.get(configuredId) || await guild.channels.fetch(configuredId).catch(() => null);
    if (configured?.isTextBased?.()) return configured;
  }
  const fallbackNames = Array.isArray(fallbackName) ? fallbackName : [fallbackName];
  return guild.channels.cache.find(item => fallbackNames.includes(item.name) && item.isTextBased?.()) || null;
}

async function applyParadiseTemplateChannelMappings(guild, mode) {
  const defaults = PARADISE_TEMPLATE_CHANNEL_DEFAULTS[mode] || {};
  const mappings = Object.fromEntries(Object.entries(defaults)
    .map(([key, name]) => [key, guild.channels.cache.find(channel => channel.name === name && channel.isTextBased?.())?.id || null])
    .filter(([, id]) => Boolean(id)));
  await saveState(state => {
    state.guildConfigs[guild.id] = state.guildConfigs[guild.id] || structuredClone(state.config || {});
    const config = state.guildConfigs[guild.id];
    config.channelMappings = { ...(config.channelMappings || {}), ...mappings };
    config.channelMappingsUpdatedAt = new Date().toISOString();
    config.channelMappingLayout = "compact-v1";
    if (guild.id === PARADISE_TEST_GUILD_ID) state.config = structuredClone(config);
    return state;
  });
  return mappings;
}

async function saveChallengeTranscript(guild, channel, ticket, trigger) {
  if (!channel?.isTextBased?.()) return null;
  const state = await loadState();
  const guildConfig = configForGuild(state, guild.id);
  if (guildConfig.operations?.challengeTranscripts === false) return null;
  const destination = await configuredChannel(guild, "challenge_transcripts_channel", "challenge-ticket-transcripts");
  if (!destination) return null;
  const fetched = await channel.messages.fetch({ limit: 100 });
  const messages = [...fetched.values()].reverse();
  const lines = [
    `Paradise challenge transcript`,
    `Ticket: ${ticket.ticketId || channel.id}`,
    `Challenger: ${ticket.challengerId || "unknown"}`,
    `Challenged: ${ticket.opponentId || "unknown"}`,
    `Status: ${ticket.status || "unknown"}`,
    `Trigger: ${trigger}`,
    `Created: ${ticket.openedAt || "unknown"}`,
    `Closed: ${ticket.closedAt || new Date().toISOString()}`,
    "",
    ...messages.map(message => {
      const timestamp = message.createdAt?.toISOString?.() || "unknown";
      const author = message.author ? `${message.author.username} (${message.author.id})` : "unknown";
      const content = String(message.cleanContent || message.content || "[embed / attachment]").replace(/\r?\n/g, " ");
      const attachments = [...message.attachments.values()].map(item => item.url).join(" ");
      return `[${timestamp}] ${author}: ${content}${attachments ? ` | ${attachments}` : ""}`;
    })
  ];
  const transcriptMessage = await destination.send({
    content: `Challenge transcript · Ticket **${ticket.ticketId || channel.id}** · ${trigger}`,
    files: [{ attachment: Buffer.from(lines.join("\n"), "utf8"), name: `paradise-challenge-${ticket.ticketId || channel.id}.txt` }]
  });
  await saveState(next => {
    next.transcripts[ticket.ticketId || channel.id] = {
      type: "challenge",
      guildId: guild.id,
      sourceChannelId: channel.id,
      destinationChannelId: destination.id,
      messageId: transcriptMessage.id,
      trigger,
      savedAt: new Date().toISOString()
    };
    return next;
  });
  return transcriptMessage;
}

const GUIDE_POSTS = Object.freeze([
  {
    key: "rules",
    channel: "rules",
    title: "✦ PARADISE COMMUNITY RULES",
    body: "# English\n## Respect & safety\n- No harassment, threats, hate speech, scams, account theft or malicious links.\n- Never request cookies, passwords, tokens or private authentication data.\n- Use approved media channels for links and attachments.\n- Staff actions require evidence and remain auditable.\n\n# Türkçe\n## Saygı ve güvenlik\n- Taciz, tehdit, nefret söylemi, dolandırıcılık ve zararlı bağlantılar yasaktır.\n- Cookie, şifre, token veya özel giriş bilgisi istemeyin.\n- Link ve dosyaları yalnızca izin verilen kanallarda paylaşın.\n- Yetkili işlemleri kanıtlı ve denetlenebilir olmalıdır."
  },
  {
    key: "challenge_rules",
    channel: "challenge-rules",
    title: "⚔️ CHALLENGE HANDBOOK",
    body: "# Challenge range\n- **Top 1–10:** 1 position\n- **Top 11–20:** 2 positions\n- **Top 21–30:** 3 positions\n- **Unranked:** #29 or #30 only\n\n## Before opening / Açmadan önce\n- Complete `/profile create`.\n- Cooldown, immunity, LOA and open-ticket state are checked twice.\n- Record the full set and keep proof in the ticket.\n\n## Result approval\nTrial Referee and Referee cannot approve results. Experienced Referee, Head Referee or Referee Manager approval is required.\n\n-# Süreler Discord timestamp ile yerel saat diliminde gösterilir."
  },
  {
    key: "referee_guide",
    channel: "referee-guide",
    title: "👑 REFEREE GUIDE 👑",
    body: "# __Ticket control checklist__\n1. Confirm both Paradise profiles exist.\n2. Check challenger cooldown and target immunity.\n3. Check allowed rank range and open challenges.\n4. Add/ping both players and keep the pinned context header current.\n5. Record the complete set and remain neutral.\n\n## __If the ticket is valid__\n- Claim the match and add a co-referee when required.\n- Use `/challenge post` or `/challenge autowin` **inside the ticket**.\n- Close first; save transcript before access is removed.\n\n## __Score format__\n- `winner` = winning fighter\n- `loser` = losing fighter\n- `score` = only `10-3`, `10-5`, `10-7` or `Auto`\n- Never type `to @user`; Paradise formats the sentence.\n- Auto/strike requires a clear note; co-referee is optional.\n\n## __Recovery and corrections__\nIf a ticket was closed, recover context from the transcript/header. Managers use the correction workflow; never silently delete evidence.\n\n-# Yanlış postu aktif Referee Manager'a iletin."
  },
  {
    key: "referee_rules",
    channel: "referee-rules",
    title: "👑 REFEREE RULES 👑",
    body: "# __Role expectations__\n## ◆ Referee Manager\nOwns referee policy, disputes, coaching, promotions and audit decisions.\n\n## ◆ Experienced Referee\nMay manage **Top 1–30**, approve configured score posts and coach lower referees.\n\n## ◆ Referee\nMay independently manage **Top 11–30**. Cannot approve/deny by default.\n\n## ◆ Trial Referee\nMay manage **Top 21–30** with a second referee. Cannot approve/deny.\n\n# __Core rules__\n- **Neutrality is mandatory.** Favoritism triggers immediate review.\n- Record every set; missing recordings may require a rematch.\n- Announce sets in **challenges** and approved scores in **challenge-results**.\n- Use the structured score-post workflow; no manual result messages.\n- Stay active. Approved referee work counts automatically; fake activity is punishable.\n\n> Default ranges are configurable in the Paradise dashboard.\n\n-# Trial/normal Referee approval is blocked unless the owner explicitly changes policy."
  },
  {
    key: "referee_post_quick",
    channel: "referee-post",
    title: "📌 /POST QUICK GUIDE",
    body: "# __How to post a score__\n- `winner` / `profile_id_1` = winner\n- `loser` / `profile_id_2` = loser\n- `ticket_id` = challenge ticket ID\n- `score` / `total_score` = only `10-3`, `10-5`, `10-7` or `Auto`\n- Never write `to <user>` — Paradise adds consistent wording.\n- Add `co_referee` when another referee worked the set.\n- Add a note for Auto, no-show, dodge, strike or disqualification.\n\n## Example\n`/challenge post winner:@A loser:@B score:10-5 ticket_id:134 note:FF check was not requested`\n\n-# Submit from the ticket whenever possible so context is filled and rechecked."
  },
  {
    key: "referee_works",
    channel: "referee-works",
    title: "🛡️ REFEREE WORK & ACTIVITY",
    body: "# __What counts__\n- An approved, fully recorded challenge result.\n- A valid co-referee contribution attached to the same ticket.\n- A manager-approved Auto/no-show decision with evidence.\n\n## __Activity policy__\n- Default minimum: **2 approved matches per week**.\n- LOA and activity whitelist pause quota review.\n- Weekly summaries recommend promotion/demotion; automatic role changes remain off unless owner enables them.\n- Duplicate, false or recycled proof does not count and creates a staff review.\n\n-# Paradise writes approved work here automatically; staff should not self-post screenshots."
  },
  {
    key: "training_rules",
    channel: "training-hoster-rules",
    title: "✦ TRAINING HOSTER HANDBOOK",
    body: "# Training standard\n- Keep teams balanced and the session organized.\n- Never humiliate participants.\n- Record host, co-host, duration, participants, score, MVPs and proof.\n- Use `/training start`; finish with `/training result`.\n\n# Eğitim standardı\n- Takımları dengeli ve oturumu düzenli tutun.\n- Katılımcıları aşağılamayın.\n- Hoster, co-hoster, süre, katılımcı, skor, MVP ve kanıtı kaydedin.\n- Başlatmak için `/training start`, bitirmek için `/training result` kullanın."
  },
  {
    key: "tryout_rules",
    channel: "tryout-hoster-rules",
    title: "✦ TRYOUT HOSTER HANDBOOK",
    body: "# Evaluate play, not only wins\nObserve RC timing, catches, dash reactions, movement, pressure, adaptation and game sense.\n\n## Required flow\n1. Start with `/tryout start`.\n2. Lock the server after the entry window.\n3. Submit Stage → Level → Strength in order.\n4. Never assign above your configured authority.\n5. Wait for manager approval.\n\n-# Kazanmak tek başına yüksek rank garantisi değildir."
  },
  {
    key: "role_guide",
    channel: "role-guide",
    title: "✦ ROLE & AUTHORITY GUIDE",
    body: "# Rank model\n`Stage 0` is best. Progression inside a stage is **Low → Mid → High**, and inside each level **Weak → Stable → Strong**.\n\n## Staff boundaries\n- Trial roles have limited visibility and no high-impact approvals.\n- Hoster roles use bot workflows instead of manual rank-role management.\n- Only configured managers can approve scores, LOA and destructive setup.\n\n-# Rol yetkileri metinden değil, bot kontrolleri ve Discord izinlerinden uygulanır."
  },
  {
    key: "faq_trust",
    channel: "security-and-trust",
    title: "🛡️ TRUST & SECURITY",
    body: "# Paradise and Fima safety\n- Paradise never asks for cookies, passwords or Discord/Roblox tokens.\n- Fima downloads must come from official channels only.\n- Screenshots are not automatic proof of Roblox ownership or payment.\n- Suspicious links should be reported through the support ticket panel.\n\n# Güvenlik\n- Paradise cookie, şifre veya token istemez.\n- Fima dosyalarını yalnızca resmi kanallardan indirin.\n- Şüpheli bağlantıları destek ticket sistemiyle bildirin."
  },
  {
    key: "mainer_guide",
    channel: "maining-guide",
    title: "✦ PARADISE MAINING GUIDE",
    body: "# Official flow\nUse `/mainer guide` to display the current Paradise code and approved TSBCC command format.\n\n- Keep proof in **mainer-proof**.\n- Never share account credentials.\n- Staff role selection must match your approved role.\n\n-# Güncel kod bot state’inden alınır; eski mesajlardaki kodlara güvenmeyin."
  },
  {
    key: "availability_guide",
    channel: "availability",
    title: "✦ AVAILABILITY GUIDE",
    body: "# What the board means\n- **Cooldown:** player cannot initiate a challenge until expiry.\n- **Immunity:** player cannot be challenged until expiry.\n- **Being challenged:** an open ticket blocks another challenge.\n- **LOA:** shown separately when it affects ranked availability.\n\n-# Times use Discord relative timestamps and adapt to every user's timezone."
  },
  {
    key: "loa_guide",
    channel: "loa",
    title: "🌙 LOA GUIDE",
    body: "# Leave of absence\nUse `/loa request` with the duration and reason. A manager must approve it.\n\n## Separate from challenge availability\nLOA is a staff attendance record. Cooldown and immunity belong to the challenge system.\n\n-# İzin süresi dolduğunda durum otomatik olarak expired olur; yönetici erken kaldırabilir."
  },
  {
    key: "profile_guide",
    channel: "profile-guide",
    title: "◆ ROBLOX PROFILE & VERIFICATION",
    body: "# Short, Roblox-safe verification\n1. Run `/profile create`.\n2. Enter the exact Roblox username.\n3. Put the six-character code in Roblox About.\n4. Confirm before it expires.\n\n## Safety\n- Paradise never requests a Roblox password, cookie or token.\n- Screenshots are not automatic ownership proof.\n- Existing profiles are not duplicated; use `/profile edit` for region changes.\n\n-# Challenge and tryout results require a completed profile."
  },
  {
    key: "application_guide",
    channel: "application-guide",
    title: "▧ APPLICATION GUIDE",
    body: "# Apply with `/application apply`\nChoose the correct position and answer motivation, experience and availability honestly.\n\n## Review flow\n- One active application at a time.\n- Blacklisted users are blocked.\n- Staff can approve, deny or request more information.\n- A role is granted only when configured and below both reviewer and Paradise role hierarchy.\n\n-# Başvuru durumu `/application status` ile özel olarak görüntülenebilir."
  },
  {
    key: "staff_command_guide",
    channel: "staff-command-guide",
    title: "⛨ STAFF COMMAND GUIDE",
    body: "# Moderation\n- `/mod warn` records a documented warning.\n- `/mod mute` applies a bounded Discord timeout.\n- `/mod kick-request` and `/mod ban-request` enter senior review.\n- `/mod quarantine` isolates suspicious accounts for review.\n\n# Operations\n- Training, tryout, referee and activity actions use their structured command groups.\n- Never grant ranks manually when Paradise provides the controlled workflow.\n\n-# Every high-impact action is logged; lower staff cannot bypass the approval queue."
  },
  {
    key: "mod_command_guide",
    channel: "mod-command-guide",
    title: "🛡️ MODERATOR COMMAND GUIDE",
    body: "# __Proportional moderation__\n- `/mod warn user:@user reason:<reason>` — documented low-impact first response.\n- `/mod mute user:@user duration:<minutes> reason:<reason>` — bounded timeout for spam/disruption.\n- `/mod kick-request user:@user reason:<reason>` — senior approval queue.\n- `/mod ban-request user:@user reason:<reason>` — senior approval queue.\n- `/mod quarantine user:@user reason:<reason>` — isolate suspicious links/accounts.\n\n## Suggested ladder\n- Spam: warn → short timeout → escalation.\n- Toxicity/slurs: evidence + configured timeout; severe/repeated cases escalate.\n- Scam/raid: quarantine or lockdown first, then senior review.\n\n-# Never punish Owner/Admin or roles above Paradise; role hierarchy is rechecked."
  },
  {
    key: "training_hoster_guide",
    channel: "training-hoster-guide",
    title: "✦ TRAINING HOSTER GUIDE",
    body: "# __Start__\n`/training start link:<roblox link> rules:<optional>`\n\nThe live announcement is normal Discord Markdown. Use its hoster-only **SERVER LOCKED**, **UNLOCK** and **END TRAINING** buttons.\n\n# __Finish__\n`/training result score:3-1 winner:Red mvps:@A,@B note:<optional> proof:<url>`\n\nKeep teams balanced, the queue orderly and all participants respected. Approved completion counts toward weekly activity.\n\n-# Default quota: 2 trainings/week; LOA/whitelist pauses review."
  },
  {
    key: "tryout_hoster_guide",
    channel: "tryout-hoster-guide",
    title: "✦ TRYOUT HOSTER GUIDE",
    body: "# __Start__\n`/tryout start link:<roblox link>`\n\nLock after 1–5 minutes. Evaluate **RC timing, catches, dash reactions, movement, pressure, adaptation and game sense**, not only wins.\n\n# __Result__\n`/tryout result user:@player stage:2 level:High strength:Strong note:<optional>`\n\nParadise enforces Stage → Level → Strength, completed profile, lowest grantable rank and hoster authority. Never grant roles manually.\n\n-# Winning alone does not guarantee a higher stage."
  },
  {
    key: "giveaway_event_guide",
    channel: "giveaway-event-guide",
    title: "✺ GIVEAWAY & EVENT GUIDE",
    body: "# Giveaways\n`/giveaway create prize:<text> minutes:<n> winners:<n> requirements:<optional>`\n\n# Events and game nights\n- `/event create title:<text> time:<timestamp> image:<file>`\n- `/gamenight start game:<name> link:<url> image:<file>`\n\nImages are required for events/game nights. Use configured ping roles, keep requirements clear and record rerolls/results in logs.\n\n-# Do not promise rewards that staff cannot safely deliver."
  },
  {
    key: "hoster_rules",
    channel: "hoster-rules",
    title: "◆ HOSTER RULES",
    body: "# Hoster kuralları\n## ◆ Temel beklenti\n- Duyuruları bot komutlarıyla aç; manuel karışık mesaj atma.\n- Hoster olduğun etkinliği yarıda bırakma; sorun çıkarsa üst staffı etiketle.\n- Kanıt, sonuç ve katılımcı bilgisini düzgün gir.\n- Katılımcılara saygılı ol; toxic davranış hoster yetkisinin incelenmesine sebep olur.\n\n## ◆ Aktivite\n- Training hoster: varsayılan minimum **haftada 2** etkinlik.\n- Tryout hoster: varsayılan minimum **haftada 1** etkinlik.\n- Referee work ve event/giveaway/game night aktiviteleri ayrı loglanır.\n- LOA/whitelist varsa kota değerlendirmesi duraklatılır.\n\n## ◆ Komutlar\n- `/training start` ve `/tryout start` aktif duyuruları düz Markdown atar.\n- **SUNUCU KİLİTLİ**, **KİLİDİ AÇ**, **BİTİR** düğmeleri sadece hoster/owner tarafından kullanılır.\n- Sonuçlar `/training result`, `/tryout result`, `/activity log` gibi yapılandırılmış komutlarla girilir.\n\n-# Kurallar ve kotalar dashboard üzerinden değiştirilebilir."
  },
  {
    key: "dashboard_guide",
    channel: "dashboard-guide",
    title: "⚙ PARADISE DASHBOARD GUIDE",
    body: "# __Safe setup order__\n1. Select the managed server.\n2. Select Community, Clan or TSBTR template.\n3. Auto-detect and review channels/roles.\n4. Save each page and inspect its preview.\n5. Run **Preview**, **Create missing**, **Repost guides** or **Repair permissions**.\n6. Destructive rebuild requires backup and exact typed confirmation.\n\n-# Owner-only console: https://fimamacro.com/paradise"
  },
  {
    key: "moderation_policy",
    channel: "moderation-policy",
    title: "🛡️ MODERATION & QUARANTINE POLICY",
    body: "# Proportional action\n1. Preserve evidence and context.\n2. Warn for a first low-impact violation.\n3. Use a reasonable timeout for spam or disruption.\n4. Quarantine suspicious links/accounts while reviewed.\n5. Request senior approval for kick or ban where configured.\n\n## Safety boundary\nNo automatic first-offense ban. False positives must be reviewable, and appeals remain available.\n\n-# Staff must follow Discord role hierarchy and the server's configured punishment ladder."
  },
  {
    key: "ticket_guide",
    channel: "ticket-guide",
    title: "▣ TICKET & TRANSCRIPT GUIDE",
    body: "# Choose the correct ticket\nSupport, application, challenge, staff report, mod report, blacklist appeal and bail are separate workflows.\n\n## Ticket lifecycle\n- Claim and work privately.\n- Close first; do not immediately delete.\n- Remove member access after closure while configured staff retain access.\n- Save a transcript and audit every reopen, note, escalation and deletion.\n\n-# Never post passwords, cookies, tokens, full license keys or private payment data."
  },
  {
    key: "report_guide",
    channel: "report-guide",
    title: "◆ REPORT GUIDE",
    body: "# Staff / hoster nasıl reportlanır?\nBir staffın yetkisini kötüye kullandığını, taraf tuttuğunu, yanlış ceza verdiğini veya etkinliği bozduğunu düşünüyorsan **report ticket** aç.\n\n## Ticket açarken ekle\n- Olayın kısa özeti\n- Kanıt görseli/video/link\n- Tarih ve kanal bilgisi\n- İlgili kullanıcı veya staff\n\n## Kurallar\n- Sahte kanıt veya intikam reportu cezalandırılır.\n- Ticket kapatılmadan önce transcript alınır.\n- Normal üyeler staff-only notları göremez.\n- Düşük yetkili staff kick/ban talebi açabilir; üst staff onaylamadan uygulanmaz.\n\n-# Acil scam/raid durumlarında moderatorleri etiketle, fakat kişisel verileri public kanala atma."
  }
]);

const GUIDE_MAPPING_KEYS = Object.freeze({
  rules: "rules_channel",
  challenge_rules: "challenge_rules_channel",
  availability_guide: "availability_channel",
  loa_guide: "loa_channel",
  referee_guide: "staff_guides_channel",
  referee_rules: "staff_guides_channel",
  referee_post_quick: "staff_guides_channel",
  referee_works: "staff_guides_channel",
  training_rules: "staff_guides_channel",
  tryout_rules: "staff_guides_channel",
  role_guide: "roles_channel",
  faq_trust: "start_here_channel",
  mainer_guide: "mainer_proof_channel",
  profile_guide: "start_here_channel",
  application_guide: "staff_guides_channel",
  ticket_guide: "staff_guides_channel",
  staff_command_guide: "staff_command_guide_channel",
  mod_command_guide: "staff_guides_channel",
  training_hoster_guide: "staff_guides_channel",
  tryout_hoster_guide: "staff_guides_channel",
  giveaway_event_guide: "staff_guides_channel",
  hoster_rules: "staff_guides_channel",
  dashboard_guide: "staff_guides_channel",
  moderation_policy: "staff_guides_channel",
  report_guide: "staff_guides_channel"
});

// Only selected canonical public handbooks carry the credit footer. Staff
// instructions and operational messages stay focused on their workflow.
const GUIDE_FOOTER_KEYS = new Set(["rules", "role_guide", "faq_trust"]);

async function publishGuidePost(guild, definition) {
  const mappingKey = GUIDE_MAPPING_KEYS[definition.key];
  const channel = mappingKey
    ? await configuredChannel(guild, mappingKey, definition.channel)
    : guild.channels.cache.find(item => item.name === definition.channel && item.isTextBased?.());
  if (!channel) return false;
  const state = await loadState();
  const oldId = configForGuild(state, guild.id).guideMessageIds?.[definition.key];
  let message = oldId ? await channel.messages.fetch(oldId).catch(() => null) : null;
  const language = guildLanguage(configForGuild(state, guild.id));
  const color = await paradiseBrandColor();
  const payload = definition.key === "staff_command_guide"
    ? staffGuidePayload(language)
    : (() => {
      const embed = new EmbedBuilder().setColor(color).setTitle(definition.title)
        .setDescription(definition.body.slice(0, 4096)).setTimestamp();
      if (GUIDE_FOOTER_KEYS.has(definition.key)) embed.setFooter(paradiseFooter("TR / EN handbook"));
      return { embeds: [embed] };
    })();
  payload.embeds[0].setColor(color);
  if (message) await message.edit(payload); else message = await channel.send(payload);
  await message.pin?.("Paradise canonical channel handbook").catch(() => null);
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].guideMessageIds = next.guildConfigs[guild.id].guideMessageIds || {};
    next.guildConfigs[guild.id].guideMessageIds[definition.key] = message.id;
    return next;
  });
  return true;
}

async function publishAllGuides(guild, mode) {
  let posted = 0;
  if (await publishSetupGuides(guild, mode)) posted += 1;
  for (const definition of GUIDE_POSTS) {
    if (await publishGuidePost(guild, definition).catch(() => false)) posted += 1;
  }
  return { posted, mode };
}

export async function publishParadiseGuidesFromDashboard(guild, mode = "clan") {
  if (!guild) {
    const error = new Error("paradise_guild_unavailable");
    error.code = "paradise_guild_unavailable";
    throw error;
  }
  if (!["community", "clan", "tsbtr"].includes(mode)) {
    const error = new Error("invalid_paradise_setup_mode");
    error.code = "invalid_paradise_setup_mode";
    throw error;
  }
  return paradiseGuildContext.run(guild.id, () => publishAllGuides(guild, mode));
}

export async function syncParadiseMappedPanels(guild) {
  if (!guild) throw Object.assign(new Error("paradise_guild_unavailable"), { code: "paradise_guild_unavailable" });
  return paradiseGuildContext.run(guild.id, async () => {
    const state = await loadState();
    const config = configForGuild(state, guild.id);
    const details = [];
    let updated = 0;
    let skipped = 0;
    const challengeChannelId = config.channelMappings?.challenge_channel;
    const challengeChannel = challengeChannelId
      ? guild.channels.cache.get(challengeChannelId) || await guild.channels.fetch(challengeChannelId).catch(() => null)
      : null;
    if (challengeChannel?.isTextBased?.()) {
      await postChallengeCreatePanel(guild, challengeChannel);
      details.push({ panel: "challenge_create", channelId: challengeChannel.id, status: "updated" });
      updated += 1;
    } else {
      details.push({ panel: "challenge_create", status: "skipped", reason: "not_mapped" });
      skipped += 1;
    }
    for (const definition of GUIDE_POSTS) {
      const mappingKey = GUIDE_MAPPING_KEYS[definition.key];
      if (!mappingKey || !config.channelMappings?.[mappingKey]) continue;
      const ok = await publishGuidePost(guild, definition).catch(() => false);
      details.push({ panel: definition.key, channelId: config.channelMappings[mappingKey], status: ok ? "updated" : "skipped" });
      if (ok) updated += 1; else skipped += 1;
    }
    if (config.channelMappings?.availability_channel) {
      const panel = await updateAvailabilityPanel(guild).catch(() => null);
      details.push({ panel: "availability", channelId: config.channelMappings.availability_channel, status: panel ? "updated" : "skipped" });
      if (panel) updated += 1; else skipped += 1;
    }
    return { updated, skipped, details };
  });
}

function canManageClan(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator)
    || member.roles.cache.some(role => ["Owner", "Admin", "Overseer", "Community Manager"].includes(role.name));
}

function relationshipLines(entries, settings = {}) {
  const rows = Object.values(entries || {}).sort((a, b) =>
    settings.sortMode === "updated"
      ? Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0)
      : a.clan.localeCompare(b.clan)
  );
  return rows.length
    ? rows.map(item => `◆ **${item.clan}**${item.status ? ` · \`${item.status}\`` : ""}${settings.showRepresentatives !== false && item.representativeId ? ` — <@${item.representativeId}>` : ""}${settings.displayInvites !== false && item.invite ? `\n  [Server invite](${item.invite})` : ""}${item.note ? `\n  _${item.note}_` : ""}`).join("\n")
    : "_None configured._";
}

async function updateRelationsPanel(guild) {
  const channel = await configuredChannel(guild, "relation_panel_channel", "clan-relations");
  if (!channel?.isTextBased?.()) return null;
  const state = await loadState();
  const guildConfig = configForGuild(state, guild.id);
  const relationSettings = guildConfig.relationSettings || {};
  const relationState = state.relations?.[guild.id] || (state.relations?.allies || state.relations?.enemies ? state.relations : {});
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("🤝 PARADISE CLAN RELATIONS")
    .setDescription("Relations are managed by authorized clan leadership and update automatically.")
    .addFields(
      { name: "◆ __Currently Allies__", value: relationshipLines(relationState.allies, relationSettings).slice(0, 1024) },
      { name: "⚔️ __Enemy Clans__", value: relationshipLines(relationState.enemies, relationSettings).slice(0, 1024) }
    )
    .setFooter(paradiseFooter("Use /relation"));
  let message = guildConfig.relationsMessageId
    ? await channel.messages.fetch(guildConfig.relationsMessageId).catch(() => null)
    : null;
  if (message) await message.edit({ embeds: [embed] }); else message = await channel.send({ embeds: [embed] });
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].relationsMessageId = message.id;
    return next;
  });
  return message;
}

async function handleRelation(interaction) {
  if (!canManageClan(interaction.member)) return interaction.reply({ content: "Clan management role required.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  if (sub !== "panel") {
    const type = interaction.options.getString("type");
    const clan = interaction.options.getString("clan").trim();
    const invite = interaction.options.getString("invite")?.trim() || null;
    if (invite && !/^https:\/\/(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+\/?$/i.test(invite)) {
      return interaction.reply({ content: "Invite must be an official Discord invite URL.", ephemeral: true });
    }
    const key = clan.toLocaleLowerCase("en-US");
    await saveState(state => {
      if (state.relations.allies || state.relations.enemies) {
        state.relations[interaction.guildId] = {
          allies: structuredClone(state.relations.allies || {}),
          enemies: structuredClone(state.relations.enemies || {})
        };
        delete state.relations.allies;
        delete state.relations.enemies;
      }
      state.relations[interaction.guildId] = state.relations[interaction.guildId] || { allies: {}, enemies: {} };
      const relationState = state.relations[interaction.guildId];
      relationState.allies = relationState.allies || {};
      relationState.enemies = relationState.enemies || {};
      const bucket = type === "ally" ? relationState.allies : relationState.enemies;
      const opposite = type === "ally" ? relationState.enemies : relationState.allies;
      if (sub === "remove") delete bucket[key];
      else {
        delete opposite[key];
        const existing = bucket[key] || {};
        bucket[key] = {
          ...existing,
          clan,
          representativeId: interaction.options.getUser("representative")?.id || existing.representativeId || null,
          invite: invite || existing.invite || null,
          note: interaction.options.getString("note") || existing.note || null,
          status: interaction.options.getString("status") || existing.status || "active",
          updatedBy: interaction.user.id,
          updatedAt: new Date().toISOString()
        };
      }
      return state;
    });
  }
  const panel = await updateRelationsPanel(interaction.guild);
  return interaction.reply({ content: panel ? `Relations board updated: ${panel.url}` : "Create a `clan-relations` channel first.", ephemeral: true });
}

function rankLabel(state, userId, guildId = PARADISE_TEST_GUILD_ID) {
  const spot = leaderboardForGuild(state, guildId)[userId]?.spot;
  return spot ? `#${spot}` : "Unranked";
}

export function timedAvailabilityLines(state, field, now = Date.now(), guildId = PARADISE_TEST_GUILD_ID) {
  return Object.entries(leaderboardForGuild(state, guildId))
    .map(([userId, item]) => ({ userId, spot: item.spot, expiresAt: Number(item.availability?.[field] || 0) }))
    .filter(item => item.expiresAt > now)
    .sort((a, b) => a.expiresAt - b.expiresAt)
    .map(item => `• <@${item.userId}> | **${item.spot ? `Rank #${item.spot}` : "Unranked"}** expires <t:${Math.floor(item.expiresAt / 1000)}:R>`)
    .join("\n") || "_None._";
}

export function challengedLines(state, guildId = PARADISE_TEST_GUILD_ID) {
  return Object.values(state.pendingChallenges || {})
    .filter(item => belongsToGuild(item, guildId) && item.status === "open")
    .map(item => `<@${item.opponentId}> (${rankLabel(state, item.opponentId, guildId)}) is being challenged by <@${item.challengerId}> (${rankLabel(state, item.challengerId, guildId)})\n-# Ticket ID: ${item.ticketId}`)
    .join("\n\n") || "_No active challenge tickets._";
}

function rankedLoaLines(state, guildId = PARADISE_TEST_GUILD_ID, now = Date.now()) {
  const leaderboard = leaderboardForGuild(state, guildId);
  const rows = Object.values(state.loa || {})
    .filter(item => belongsToGuild(item, guildId) && item.status === "approved" && Number(item.expiresAt) > now && leaderboard[item.userId]?.spot)
    .sort((a, b) => Number(a.expiresAt) - Number(b.expiresAt));
  return rows.length
    ? rows.map(item => `• <@${item.userId}> | **Rank #${leaderboard[item.userId].spot}** unavailable until <t:${Math.floor(item.expiresAt / 1000)}:R>`).join("\n")
    : "_None._";
}

async function updateAvailabilityPanel(guild) {
  const channel = await configuredChannel(guild, "availability_channel", "availability");
  if (!channel?.isTextBased?.()) return null;
  const state = await loadState();
  const guildConfig = configForGuild(state, guild.id);
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ CHALLENGE AVAILABILITY")
    .setDescription(("## ◆ Current Cooldowns\n" + timedAvailabilityLines(state, "cooldownUntil", Date.now(), guild.id)
      + "\n\n## ◆ Current Immunity\n" + timedAvailabilityLines(state, "immunityUntil", Date.now(), guild.id)
      + "\n\n## ◆ Being Challenged\n" + challengedLines(state, guild.id)
      + "\n\n## ◆ Ranked LOA Impact\n" + rankedLoaLines(state, guild.id)
      + "\n\n-# Full LOA records remain in the separate LOA panel.").slice(0, 4096))
    .setFooter(paradiseFooter("Automatically refreshed by challenge results"));
  let message = guildConfig.availabilityMessageId
    ? await channel.messages.fetch(guildConfig.availabilityMessageId).catch(() => null)
    : null;
  const components = [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildParadiseComponentId({ family: "availability", guildId: guild.id, entityId: "availability", action: "refresh" }))
      .setLabel("Refresh availability").setStyle(ButtonStyle.Secondary)
  )];
  if (message) await message.edit({ embeds: [embed], components }); else message = await channel.send({ embeds: [embed], components });
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].availabilityMessageId = message.id;
    return next;
  });
  return message;
}

async function handleAvailability(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub !== "panel" && !await canApproveReferee(interaction.member)) {
    return interaction.reply({ content: "Referee Manager or administrator required.", ephemeral: true });
  }
  if (["cooldown", "immunity"].includes(sub)) {
    const user = interaction.options.getUser("user");
    const rank = interaction.options.getInteger("rank");
    const expiresAt = Date.now() + interaction.options.getInteger("hours") * 3_600_000;
    await saveState(state => {
      const leaderboard = ensureLeaderboardForGuild(state, interaction.guildId);
      const current = leaderboard[user.id] || { wins: 0, losses: 0, history: [] };
      if (rank) current.spot = rank;
      current.availability = current.availability || {};
      current.availability[sub === "cooldown" ? "cooldownUntil" : "immunityUntil"] = expiresAt;
      leaderboard[user.id] = current;
      return state;
    });
  } else if (sub === "clear") {
    const user = interaction.options.getUser("user");
    const type = interaction.options.getString("type");
    await saveState(state => {
      const leaderboard = ensureLeaderboardForGuild(state, interaction.guildId);
      if (leaderboard[user.id]?.availability) {
        delete leaderboard[user.id].availability[type === "cooldown" ? "cooldownUntil" : "immunityUntil"];
      }
      return state;
    });
  }
  const panel = await updateAvailabilityPanel(interaction.guild);
  return interaction.reply({ content: panel ? `Availability board updated: ${panel.url}` : "Create an `availability` channel first.", ephemeral: true });
}

function activeLoaLines(state, guildId = PARADISE_TEST_GUILD_ID) {
  const now = Date.now();
  const rows = Object.values(state.loa || {})
    .filter(item => belongsToGuild(item, guildId) && item.status === "approved" && item.expiresAt > now)
    .sort((a, b) => a.expiresAt - b.expiresAt);
  return rows.length
    ? rows.map(item => `◆ <@${item.userId}>${item.robloxUsername ? ` · **${item.robloxUsername}**` : ""}${item.region ? ` · ${item.region}` : ""}\n- **Ends:** <t:${Math.floor(item.expiresAt / 1000)}:F> (<t:${Math.floor(item.expiresAt / 1000)}:R>)\n- **Note:** ${item.reason || item.note || "No note"}${item.decidedBy ? `\n- **Approved by:** <@${item.decidedBy}>` : ""}`).join("\n\n")
    : "_No active staff LOAs._";
}

async function updateLoaPanel(guild) {
  const channel = await configuredChannel(guild, "loa_channel", "loa");
  if (!channel?.isTextBased?.()) return null;
  const state = await loadState();
  const guildConfig = configForGuild(state, guild.id);
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("🌙 STAFF LEAVE OF ABSENCE")
    .setDescription(("## ◆ Active LOAs\n" + activeLoaLines(state, guild.id) + "\n\n-# LOA is separate from challenge cooldown and immunity.").slice(0, 4096))
    .setFooter(paradiseFooter("Staff attendance"));
  let message = guildConfig.loaMessageId
    ? await channel.messages.fetch(guildConfig.loaMessageId).catch(() => null)
    : null;
  if (message) await message.edit({ embeds: [embed] }); else message = await channel.send({ embeds: [embed] });
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].loaMessageId = message.id;
    return next;
  });
  return message;
}

async function handleLoa(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "request") {
    const state = await loadState();
    const days = interaction.options.getInteger("days");
    const guildConfig = configForGuild(state, interaction.guildId);
    const maxDays = Number(guildConfig.loa?.maxDays || 90);
    if (days > maxDays) return interaction.reply({ content: `Maximum configured LOA is **${maxDays} days**.`, ephemeral: true });
    const evidence = interaction.options.getString("evidence") || null;
    if (guildConfig.loa?.requireEvidence && !evidence) {
      return interaction.reply({ content: "Evidence is required by the current LOA policy.", ephemeral: true });
    }
    const profile = await verifiedProfile(interaction.user.id);
    const expiresAt = Date.now() + days * 86_400_000;
    const record = {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      reason: interaction.options.getString("reason"),
      evidence,
      robloxUsername: profile?.robloxUsername || null,
      region: profile?.region || null,
      startsAt: Date.now(),
      expiresAt,
      status: "pending",
      requestedAt: new Date().toISOString()
    };
    await saveState(state => { state.loa[guildUserKey(interaction.guildId, interaction.user.id)] = record; return state; });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`paradise_loa_approve:${interaction.user.id}`).setLabel("Approve LOA").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`paradise_loa_deny:${interaction.user.id}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
    );
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("LOA Request — Pending")
        .setDescription(`**Staff:** ${interaction.user}\n**Ends:** <t:${Math.floor(expiresAt / 1000)}:F>\n**Reason:** ${record.reason}`)
        .setFooter(paradiseFooter("Manager approval required"))],
      components: [row]
    });
  }
  if (["add", "approve", "deny", "remove"].includes(sub)) {
    if (!canManageClan(interaction.member)) return interaction.reply({ content: "Clan management role required.", ephemeral: true });
    const user = interaction.options.getUser("user");
    const currentState = await loadState();
    const current = guildUserRecord(currentState.loa, interaction.guildId, user.id);
    if (sub === "add") {
      const days = interaction.options.getInteger("days");
      const profile = await verifiedProfile(user.id);
      const record = {
        guildId: interaction.guildId,
        userId: user.id,
        note: interaction.options.getString("note"),
        reason: interaction.options.getString("note"),
        evidence: interaction.options.getString("evidence") || null,
        robloxUsername: profile?.robloxUsername || null,
        region: profile?.region || null,
        startsAt: Date.now(),
        expiresAt: Date.now() + days * 86_400_000,
        status: "approved",
        decidedBy: interaction.user.id,
        decidedAt: new Date().toISOString(),
        requestedAt: new Date().toISOString()
      };
      await saveState(state => { state.loa[guildUserKey(interaction.guildId, user.id)] = record; return state; });
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const role = await ensureRole(interaction.guild, "LOA");
      if (member) await member.roles.add(role).catch(() => {});
    } else {
      if (!current) return interaction.reply({ content: "No LOA record exists for that user.", ephemeral: true });
      const status = sub === "approve" ? "approved" : sub === "deny" ? "denied" : "removed";
      await saveState(state => {
        const key = guildUserKey(interaction.guildId, user.id);
        state.loa[key] = {
          ...guildUserRecord(state.loa, interaction.guildId, user.id),
          guildId: interaction.guildId,
          status,
          decisionReason: interaction.options.getString("reason") || null,
          decidedBy: interaction.user.id,
          decidedAt: new Date().toISOString()
        };
        return state;
      });
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const role = interaction.guild.roles.cache.find(item => item.name === "LOA");
      if (status === "approved") {
        const loaRole = role || await ensureRole(interaction.guild, "LOA");
        if (member) await member.roles.add(loaRole).catch(() => {});
      } else if (member && role) await member.roles.remove(role).catch(() => {});
    }
    const panel = await updateLoaPanel(interaction.guild);
    return interaction.reply({ content: `LOA **${sub}** completed for ${user}.${panel ? ` Board: ${panel.url}` : ""}`, ephemeral: true });
  }
  if (sub === "end") {
    await saveState(state => {
      const key = guildUserKey(interaction.guildId, interaction.user.id);
      const record = guildUserRecord(state.loa, interaction.guildId, interaction.user.id);
      if (record) state.loa[key] = { ...record, guildId: interaction.guildId, status: "ended" };
      return state;
    });
    const role = interaction.guild.roles.cache.find(item => item.name === "LOA");
    if (role && interaction.member.roles.cache.has(role.id)) await interaction.member.roles.remove(role).catch(() => {});
  }
  const panel = await updateLoaPanel(interaction.guild);
  return interaction.reply({ content: panel ? `LOA board updated: ${panel.url}` : "Create an `loa` channel first.", ephemeral: true });
}

async function handleLoaDecision(interaction) {
  if (!canManageClan(interaction.member)) return interaction.reply({ content: "Clan management role required.", ephemeral: true });
  const [action, userId] = interaction.customId.replace("paradise_loa_", "").split(":");
  const state = await loadState();
  const record = guildUserRecord(state.loa, interaction.guildId, userId);
  if (!record || record.status !== "pending") return interaction.reply({ content: "This LOA request is no longer pending.", ephemeral: true });
  await saveState(next => {
    next.loa[guildUserKey(interaction.guildId, userId)] = { ...record, guildId: interaction.guildId, status: action === "approve" ? "approved" : "denied", decidedBy: interaction.user.id, decidedAt: new Date().toISOString() };
    return next;
  });
  if (action === "approve") {
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    const role = await ensureRole(interaction.guild, "LOA");
    if (member && role) await member.roles.add(role).catch(() => {});
  }
  await updateLoaPanel(interaction.guild).catch(() => {});
  return interaction.update({
    embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(await paradiseBrandColor())
      .setTitle(action === "approve" ? "LOA Request — Approved" : "LOA Request — Denied")],
    components: []
  });
}

async function handleFindFcw(interaction) {
  if (!interaction.member.roles.cache.some(role => ["Owner", "Overseer", "War Hoster"].includes(role.name))
    && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "War Hoster or owner role required.", ephemeral: true });
  }
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("⚔️ FCW SEARCH OPEN")
    .setDescription(`## ◆ Request\n- **Region:** ${interaction.options.getString("region").toUpperCase()}\n- **Format:** ${interaction.options.getString("format") || "Flexible"}\n\n> Paradise only contacts clans that explicitly opted into the FCW directory.\n\n-# No server scraping • No unsolicited DMs`)
    .setFooter(paradiseFooter("Opt-in matching"))] });
}

async function handleCommandChannel(interaction) {
  if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  const state = await loadState();
  const current = configForGuild(state, interaction.guildId).commandChannels || {};
  if (sub === "list") {
    const lines = Object.entries(current).map(([command, ids]) => `/${command}: ${ids.map(id => `<#${id}>`).join(", ")}`);
    return interaction.reply({ content: lines.join("\n") || "No command-channel restrictions configured.", ephemeral: true });
  }
  const command = interaction.options.getString("command").trim().replace(/^\//, "").toLowerCase();
  await saveState(next => {
    next.guildConfigs[interaction.guildId] = next.guildConfigs[interaction.guildId] || structuredClone(next.config || {});
    const mapping = next.guildConfigs[interaction.guildId].commandChannels || {};
    const ids = new Set(mapping[command] || []);
    if (sub === "add") ids.add(interaction.channelId); else ids.delete(interaction.channelId);
    if (ids.size) mapping[command] = [...ids]; else delete mapping[command];
    next.guildConfigs[interaction.guildId].commandChannels = mapping;
    return next;
  });
  return interaction.reply({ content: sub === "add" ? `/${command} is now allowed in this channel.` : `This channel was removed from /${command}.`, ephemeral: true });
}

async function postChallengeCreatePanel(guild, channel) {
  const state = await loadState();
  const oldId = configForGuild(state, guild.id).challengeCreatePanelMessageId;
  let message = oldId ? await channel.messages.fetch(oldId).catch(() => null) : null;
  const payload = {
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("⚔️ CREATE A RANKED CHALLENGE")
      .setDescription("# Ready to challenge?\nParadise will check your completed profile, leaderboard range, cooldown, opponent immunity, LOA and open tickets.\n\n## ◆ Before you continue\n- Record the complete set.\n- Keep evidence inside the ticket.\n- Result approval is restricted to senior referee roles.\n\n-# Hedef seçimi ve ticket açılışı sırasında durum iki kez kontrol edilir.")
      .setFooter(paradiseFooter("Guided challenge flow"))],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("paradise_challenge_open").setLabel("Choose an eligible opponent").setStyle(ButtonStyle.Primary)
    )]
  };
  if (message) await message.edit(payload); else message = await channel.send(payload);
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].challengeCreatePanelMessageId = message.id;
    return next;
  });
  return message;
}

function canManageCompetitiveBoards(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator)
    || member.permissions.has(PermissionsBitField.Flags.ManageGuild)
    || member.roles.cache.some(role => [
      "Owner", "Overseer", "Community Manager", "Training Manager", "War Manager",
      "Roster Manager", "Leaderboard Updater", "Referee Manager"
    ].includes(role.name));
}

function canManageBlacklist(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator)
    || member.permissions.has(PermissionsBitField.Flags.ManageGuild)
    || member.roles.cache.some(role => [
      "Owner", "Admin", "Overseer", "Administration Manager", "Head Admin",
      "Moderator Manager", "Head Moderator", "Security Staff"
    ].includes(role.name));
}

function normalizeLineupEntries(entries = []) {
  return entries.map(entry => typeof entry === "string" ? { userId: entry } : entry)
    .filter(entry => entry?.userId);
}

async function logParadiseAction(guild, mappingKey, fallbackName, title, description) {
  const channel = await configuredChannel(guild, mappingKey, fallbackName);
  if (!channel?.isTextBased?.()) return null;
  return channel.send({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(title)
      .setDescription(description).setFooter(paradiseFooter("Private operations log")).setTimestamp()]
  }).catch(() => null);
}

async function updateLineupPanel(guild, board) {
  const state = await loadState();
  const entries = normalizeLineupEntries(state.lineups?.[guild.id]?.[board] || []);
  const mappingKey = board === "war" ? "war_lineup_channel" : "main_lineup_channel";
  const channel = await configuredChannel(guild, mappingKey, board === "war" ? "war-lineup" : "main-line");
  if (!channel) return null;
  const guildConfig = configForGuild(state, guild.id);
  const messageKey = `${board}LineupMessageId`;
  let message = guildConfig[messageKey] ? await channel.messages.fetch(guildConfig[messageKey]).catch(() => null) : null;
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(board === "war" ? "⚔ PARADISE WAR LINEUP" : "♟ PARADISE MAIN LINEUP")
    .setDescription(entries.length
      ? entries.map((entry, index) => `**${index + 1}.** <@${entry.userId}>${entry.role ? ` · **${entry.role}**` : ""}${entry.note ? `\n-# ${entry.note}` : ""}`).join("\n")
      : "_No members assigned yet._")
    .setFooter(paradiseFooter("Managed with /lineup"))
    .setTimestamp();
  if (message) await message.edit({ embeds: [embed] }); else message = await channel.send({ embeds: [embed] });
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id][messageKey] = message.id;
    return next;
  });
  return message;
}

async function handleLineup(interaction) {
  if (!canManageCompetitiveBoards(interaction.member)) return interaction.reply({ content: "Roster or server manager authority required.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  const board = interaction.options.getString("board") || "main";
  if (sub === "panel" || sub === "repost") {
    const panel = await updateLineupPanel(interaction.guild, board);
    return interaction.reply({ content: panel ? `${board} lineup refreshed.` : "Map the lineup channel first.", ephemeral: true });
  }
  const user = interaction.options.getUser("user");
  const requestedPosition = interaction.options.getInteger("position");
  const role = interaction.options.getString("role");
  const note = interaction.options.getString("note");
  let affectedUserId = user?.id || null;
  let found = true;
  await saveState(state => {
    state.lineups[interaction.guildId] = state.lineups[interaction.guildId] || { main: [], war: [] };
    const entries = normalizeLineupEntries(state.lineups[interaction.guildId][board] || []);
    if (sub === "clear") {
      const index = requestedPosition - 1;
      const removed = entries.splice(index, 1)[0];
      affectedUserId = removed?.userId || null;
      found = Boolean(removed);
    } else {
      const existingIndex = entries.findIndex(entry => entry.userId === user.id);
      const existing = existingIndex >= 0 ? entries.splice(existingIndex, 1)[0] : null;
      if (sub === "remove") {
        found = Boolean(existing);
      } else if (sub === "edit") {
        found = Boolean(existing);
        if (existing) {
          entries.splice(existingIndex, 0, {
            ...existing,
            ...(role !== null ? { role } : {}),
            ...(note !== null ? { note } : {}),
            updatedBy: interaction.user.id,
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        const index = requestedPosition ? Math.min(entries.length, requestedPosition - 1) : entries.length;
        entries.splice(index, 0, {
          ...(existing || {}),
          userId: user.id,
          role: role ?? existing?.role ?? null,
          note: note ?? existing?.note ?? null,
          updatedBy: interaction.user.id,
          updatedAt: new Date().toISOString()
        });
      }
    }
    state.lineups[interaction.guildId][board] = entries;
    return state;
  });
  if (!found) return interaction.reply({ content: "That lineup member or slot does not exist. Nothing changed.", ephemeral: true });
  await updateLineupPanel(interaction.guild, board).catch(() => {});
  const actionText = sub === "remove" || sub === "clear" ? "removed from" : sub === "edit" ? "updated in" : "saved to";
  await logParadiseAction(interaction.guild, board === "war" ? "war_logs_channel" : "roster_logs_channel", board === "war" ? "war-logs" : "roster-logs",
    "Lineup record updated", `<@${affectedUserId}> was **${actionText}** the **${board} lineup** by <@${interaction.user.id}>.`);
  return interaction.reply({ content: `<@${affectedUserId}> ${actionText} the **${board} lineup**.`, ephemeral: true });
}

async function updateRosterPanel(guild) {
  const state = await loadState();
  const entries = Object.values(state.rosters?.[guild.id] || {}).sort((a, b) => String(a.region).localeCompare(String(b.region)) || a.addedAt.localeCompare(b.addedAt));
  const channel = await configuredChannel(guild, "roster_channel", "eu-rosters");
  if (!channel) return null;
  const guildConfig = configForGuild(state, guild.id);
  let message = guildConfig.rosterMessageId ? await channel.messages.fetch(guildConfig.rosterMessageId).catch(() => null) : null;
  const description = entries.length
    ? entries.map(item => `**${item.region}** · <@${item.userId}>${item.rank ? ` · **${item.rank}**` : ""}${item.main ? ` · ${item.main}` : ""}${item.note ? `\n-# ${item.note}` : ""}`).join("\n").slice(0, 3900)
    : "_Roster is currently empty._";
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("♟ PARADISE COMPETITIVE ROSTER").setDescription(description).setFooter(paradiseFooter("Managed with /roster")).setTimestamp();
  if (message) await message.edit({ embeds: [embed] }); else message = await channel.send({ embeds: [embed] });
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].rosterMessageId = message.id;
    return next;
  });
  return message;
}

async function handleRoster(interaction) {
  if (!canManageCompetitiveBoards(interaction.member)) return interaction.reply({ content: "Roster manager authority required.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  if (sub === "panel" || sub === "repost") {
    const panel = await updateRosterPanel(interaction.guild);
    return interaction.reply({ content: panel ? "Roster board refreshed." : "Map the roster channel first.", ephemeral: true });
  }
  const user = interaction.options.getUser("user");
  let found = true;
  await saveState(state => {
    state.rosters[interaction.guildId] = state.rosters[interaction.guildId] || {};
    if (sub === "remove") delete state.rosters[interaction.guildId][user.id];
    else {
      const existing = state.rosters[interaction.guildId][user.id];
      if (sub === "update" && !existing) {
        found = false;
        return state;
      }
      state.rosters[interaction.guildId][user.id] = {
        ...(existing || {}),
        userId: user.id,
        region: interaction.options.getString("region") || existing?.region,
        rank: interaction.options.getString("rank") ?? existing?.rank ?? null,
        main: interaction.options.getString("main") ?? existing?.main ?? null,
        note: interaction.options.getString("note") ?? existing?.note ?? null,
        addedBy: existing?.addedBy || interaction.user.id,
        addedAt: existing?.addedAt || new Date().toISOString(),
        updatedBy: interaction.user.id,
        updatedAt: new Date().toISOString()
      };
    }
    return state;
  });
  if (!found) return interaction.reply({ content: "That user is not on this server's roster. Nothing changed.", ephemeral: true });
  await updateRosterPanel(interaction.guild).catch(() => {});
  await logParadiseAction(interaction.guild, "roster_logs_channel", "roster-logs", "Roster record updated",
    `${user} was **${sub === "remove" ? "removed from" : sub === "update" ? "updated in" : "saved to"}** the roster by <@${interaction.user.id}>.`);
  return interaction.reply({ content: `${user} ${sub === "remove" ? "removed from" : "saved to"} the roster.`, ephemeral: true });
}

async function updateBlacklistPanel(guild) {
  const state = await loadState();
  const records = Object.values(state.blacklists?.[guild.id] || {}).filter(item => item.status === "active");
  const channel = await configuredChannel(guild, "blacklist_channel", "blacklist");
  if (!channel) return null;
  const guildConfig = configForGuild(state, guild.id);
  let message = guildConfig.blacklistMessageId ? await channel.messages.fetch(guildConfig.blacklistMessageId).catch(() => null) : null;
  const description = records.length
    ? records.map(item => `<@${item.userId}> — ${item.reason}\n-# Added <t:${Math.floor(Date.parse(item.createdAt) / 1000)}:R>`).join("\n\n").slice(0, 3900)
    : "_No active Paradise blacklist records._";
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("⊘ PARADISE BLACKLIST").setDescription(description).setFooter(paradiseFooter("Evidence-backed records only")).setTimestamp();
  if (message) await message.edit({ embeds: [embed] }); else message = await channel.send({ embeds: [embed] });
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].blacklistMessageId = message.id;
    return next;
  });
  return message;
}

async function updateBlacklistAppealPanel(guild) {
  const state = await loadState();
  const config = configForGuild(state, guild.id);
  const channel = await configuredChannel(guild, "blacklist_appeal_channel", "blacklist-appeal")
    || guild.channels.cache.find(item => item.name === "ban-appeal" && item.isTextBased?.());
  if (!channel?.isTextBased?.()) return null;
  const tr = guildLanguage(config) === "tr";
  const embed = new EmbedBuilder()
    .setColor(await paradiseBrandColor())
    .setTitle(tr ? "◇ BLACKLIST İTİRAZI" : "◇ BLACKLIST APPEAL")
    .setDescription(tr
      ? "# Kaydının yeniden incelenmesini iste\n`/appeal open` komutunu kullan; nedenini açıkça yaz ve varsa kanıt bağlantını ekle. İtirazın özel bir inceleme alanında değerlendirilir.\n\n> Bail garanti değildir ve blacklist kaydını otomatik kaldırmaz. Son karar yetkili incelemesinden sonra verilir.\n\n-# Şifre, cookie, token veya özel hesap bilgisi gönderme."
      : "# Ask staff to review your record\nUse `/appeal open`, explain clearly why the record should be reviewed and attach an evidence link if you have one. Your appeal is handled in a private review area.\n\n> Bail is never guaranteed and never removes a blacklist automatically. A qualified reviewer makes the final decision.\n\n-# Never send passwords, cookies, tokens or private account data.")
    .setFooter(paradiseFooter(tr ? "Özel ve kanıta dayalı inceleme" : "Private, evidence-based review"));
  let message = config.blacklistAppealPanelMessageId
    ? await channel.messages.fetch(config.blacklistAppealPanelMessageId).catch(() => null)
    : null;
  if (message) await message.edit({ embeds: [embed] });
  else message = await channel.send({ embeds: [embed] });
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].blacklistAppealPanelMessageId = message.id;
    return next;
  });
  return message;
}

async function handleBlacklist(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "status") {
    const user = interaction.options.getUser("user") || interaction.user;
    const record = (await loadState()).blacklists?.[interaction.guildId]?.[user.id];
    const summary = record?.status === "active"
      ? `${user} has an active Paradise blacklist record from <t:${Math.floor(Date.parse(record.createdAt) / 1000)}:R>. Use the private appeal flow for review.`
      : `${user} does not have an active Paradise blacklist record in this server.`;
    return interaction.reply({ content: summary, ephemeral: true });
  }
  if (!canManageBlacklist(interaction.member)) return interaction.reply({ content: "Blacklist manager or security authority required.", ephemeral: true });
  if (sub === "panel") {
    const panel = await updateBlacklistPanel(interaction.guild);
    return interaction.reply({ content: panel ? "Blacklist board refreshed." : "Map the blacklist channel first.", ephemeral: true });
  }
  if (sub === "appeal-panel") {
    const panel = await updateBlacklistAppealPanel(interaction.guild);
    return interaction.reply({ content: panel ? "Appeal information panel updated in place." : "Map or create the blacklist-appeal / ban-appeal channel first.", ephemeral: true });
  }
  const user = interaction.options.getUser("user");
  const reason = interaction.options.getString("reason");
  await saveState(state => {
    state.blacklists[interaction.guildId] = state.blacklists[interaction.guildId] || {};
    if (sub === "remove") {
      state.blacklists[interaction.guildId][user.id] = {
        ...(state.blacklists[interaction.guildId][user.id] || { userId: user.id }),
        status: "resolved", resolution: reason, resolvedBy: interaction.user.id, resolvedAt: new Date().toISOString()
      };
    } else {
      state.blacklists[interaction.guildId][user.id] = {
        userId: user.id, status: "active", reason,
        evidence: interaction.options.getString("evidence") || null,
        createdBy: interaction.user.id, createdAt: new Date().toISOString()
      };
    }
    return state;
  });
  const blacklistedRole = await ensureRole(interaction.guild, "BLACKLISTED").catch(() => null);
  const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
  let roleChanged = !targetMember;
  if (blacklistedRole && targetMember) {
    if (sub === "remove") {
      roleChanged = await targetMember.roles.remove(blacklistedRole, "Paradise blacklist resolved").then(() => true).catch(() => false);
    } else {
      roleChanged = await targetMember.roles.add(blacklistedRole, "Paradise blacklist active").then(() => true).catch(() => false);
    }
  }
  await updateBlacklistPanel(interaction.guild).catch(() => {});
  await logParadiseAction(interaction.guild, "blacklist_logs_channel", "blacklist-logs", "Blacklist record updated",
    `${user} record was **${sub === "remove" ? "resolved" : "created"}** by <@${interaction.user.id}>.\n**Reason:** ${reason}`);
  return interaction.reply({
    content: `${user} blacklist record ${sub === "remove" ? "resolved" : "created"}.${roleChanged ? "" : " Warning: the record was saved, but the BLACKLISTED role could not be changed. Move Paradise above that role and repair permissions."}`,
    ephemeral: true
  });
}

async function handleAppeal(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "open") {
    const state = await loadState();
    const blacklist = state.blacklists?.[interaction.guildId]?.[interaction.user.id];
    if (blacklist?.status !== "active") return interaction.reply({ content: "You do not have an active blacklist record in this server.", ephemeral: true });
    const existing = state.appeals?.[interaction.guildId]?.[interaction.user.id];
    if (existing?.status === "pending") {
      return interaction.reply({ content: `You already have a pending appeal${existing.threadId ? `: <#${existing.threadId}>` : "."}`, ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const parent = await configuredChannel(interaction.guild, "blacklist_appeal_channel", "blacklist-appeal");
    let thread = null;
    if (parent?.threads?.create) {
      thread = await parent.threads.create({
        name: `appeal-${interaction.user.username}`.slice(0, 90),
        type: ChannelType.PrivateThread,
        invitable: false,
        reason: "Paradise private blacklist appeal"
      }).catch(() => null);
      if (thread) {
        await thread.members.add(interaction.user.id).catch(() => {});
        await thread.send({
          content: `<@${interaction.user.id}>`,
          embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("◇ PRIVATE BLACKLIST APPEAL")
            .setDescription(`**Applicant:** <@${interaction.user.id}>\n**Reason:** ${interaction.options.getString("reason")}\n**Evidence:** ${interaction.options.getString("evidence") || "Not supplied"}\n\n> Staff review is evidence-based. Bail is never guaranteed and cannot automatically remove a blacklist.`)
            .setFooter(paradiseFooter("Private staff review")).setTimestamp()]
        }).catch(() => {});
      }
    }
    await saveState(next => {
      next.appeals[interaction.guildId] = next.appeals[interaction.guildId] || {};
      next.appeals[interaction.guildId][interaction.user.id] = {
        userId: interaction.user.id,
        status: "pending",
        reason: interaction.options.getString("reason"),
        evidence: interaction.options.getString("evidence") || null,
        threadId: thread?.id || null,
        createdAt: new Date().toISOString()
      };
      return next;
    });
    await logParadiseAction(interaction.guild, "blacklist_logs_channel", "blacklist-logs", "Blacklist appeal opened",
      `<@${interaction.user.id}> opened a private appeal${thread ? ` in ${thread}` : ""}.`);
    return interaction.editReply(thread
      ? `Your private appeal was created: ${thread}`
      : "Your appeal was recorded. Staff will review it privately; the mapped channel could not create a private thread.");
  }
  if (!canManageBlacklist(interaction.member)) return interaction.reply({ content: "Blacklist manager or security authority required.", ephemeral: true });
  const user = interaction.options.getUser("user");
  const reason = interaction.options.getString("reason");
  let found = true;
  await saveState(state => {
    state.appeals[interaction.guildId] = state.appeals[interaction.guildId] || {};
    const appeal = state.appeals[interaction.guildId][user.id];
    if (!appeal || appeal.status !== "pending") {
      found = false;
      return state;
    }
    state.appeals[interaction.guildId][user.id] = {
      ...appeal,
      status: sub === "approve" ? "approved" : "denied",
      decisionReason: reason,
      decidedBy: interaction.user.id,
      decidedAt: new Date().toISOString()
    };
    if (sub === "approve" && state.blacklists?.[interaction.guildId]?.[user.id]) {
      state.blacklists[interaction.guildId][user.id] = {
        ...state.blacklists[interaction.guildId][user.id],
        status: "resolved",
        resolution: `Appeal approved: ${reason}`,
        resolvedBy: interaction.user.id,
        resolvedAt: new Date().toISOString()
      };
    }
    return state;
  });
  if (!found) return interaction.reply({ content: "No pending appeal was found for that user.", ephemeral: true });
  let roleRemoved = true;
  if (sub === "approve") {
    const blacklistedRole = interaction.guild.roles.cache.find(role => role.name === "BLACKLISTED");
    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (blacklistedRole && targetMember) {
      roleRemoved = await targetMember.roles.remove(blacklistedRole, "Paradise appeal approved").then(() => true).catch(() => false);
    }
  }
  await updateBlacklistPanel(interaction.guild).catch(() => {});
  await logParadiseAction(interaction.guild, "blacklist_logs_channel", "blacklist-logs", `Appeal ${sub === "approve" ? "approved" : "denied"}`,
    `${user} appeal was decided by <@${interaction.user.id}>.\n**Decision:** ${reason}`);
  return interaction.reply({
    content: `${user} appeal ${sub === "approve" ? "approved and blacklist record resolved" : "denied"}.${sub === "approve" && !roleRemoved ? " Warning: the BLACKLISTED role could not be removed; fix the bot role hierarchy and remove it manually." : ""}`,
    ephemeral: true
  });
}

async function handleBail(interaction) {
  if (!canManageBlacklist(interaction.member)) return interaction.reply({ content: "Owner, blacklist manager or security authority required.", ephemeral: true });
  const state = await loadState();
  if (configForGuild(state, interaction.guildId).blacklist?.bailEnabled !== true) {
    return interaction.reply({ content: "Bail review is disabled for this server in the Paradise dashboard.", ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  const user = interaction.options.getUser("user");
  if (state.blacklists?.[interaction.guildId]?.[user.id]?.status !== "active") {
    return interaction.reply({ content: "That user does not have an active blacklist record.", ephemeral: true });
  }
  const detail = interaction.options.getString("condition") || interaction.options.getString("note") || interaction.options.getString("reason");
  await saveState(next => {
    next.bails[interaction.guildId] = next.bails[interaction.guildId] || {};
    const existing = next.bails[interaction.guildId][user.id] || {};
    next.bails[interaction.guildId][user.id] = {
      ...existing,
      userId: user.id,
      status: sub === "offer" ? "offered" : sub === "resolve" ? "resolved" : "denied",
      condition: sub === "offer" ? detail : existing.condition || null,
      decisionNote: sub === "offer" ? null : detail,
      updatedBy: interaction.user.id,
      updatedAt: new Date().toISOString(),
      createdAt: existing.createdAt || new Date().toISOString()
    };
    return next;
  });
  await logParadiseAction(interaction.guild, "blacklist_logs_channel", "blacklist-logs", `Bail review ${sub}`,
    `${user} bail review was marked **${sub}** by <@${interaction.user.id}>.\n**Condition / note:** ${detail}\n\n-# This action did not automatically remove the blacklist.`);
  return interaction.reply({
    content: `${user} bail review marked **${sub}**. The blacklist was not automatically removed.`,
    ephemeral: true
  });
}

async function handleSetChannel(interaction) {
  if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
  const key = interaction.options.getSubcommand();
  if (!PARADISE_CHANNEL_MAPPINGS.some(([name]) => name === key)) {
    return interaction.reply({ content: "Unknown Paradise channel mapping.", ephemeral: true });
  }
  const channel = interaction.options.getChannel("channel");
  await saveState(state => {
    state.guildConfigs[interaction.guildId] = state.guildConfigs[interaction.guildId] || structuredClone(state.config || {});
    state.guildConfigs[interaction.guildId].channelMappings = state.guildConfigs[interaction.guildId].channelMappings || {};
    state.guildConfigs[interaction.guildId].channelMappings[key] = channel.id;
    state.guildConfigs[interaction.guildId].channelMappingsUpdatedAt = new Date().toISOString();
    if (interaction.guildId === PARADISE_TEST_GUILD_ID) state.config = structuredClone(state.guildConfigs[interaction.guildId]);
    return state;
  });
  if (key === "challenge_channel") await postChallengeCreatePanel(interaction.guild, channel);
  if (key === "availability_channel") await updateAvailabilityPanel(interaction.guild);
  if (key === "loa_channel") await updateLoaPanel(interaction.guild);
  if (key === "relation_panel_channel") await updateRelationsPanel(interaction.guild);
  return interaction.reply({ content: `**${key}** is now mapped to ${channel}.`, ephemeral: true });
}

async function handleHandbook(interaction) {
  if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const mode = interaction.options.getString("template");
  const result = await publishAllGuides(interaction.guild, mode);
  return interaction.editReply(`Handbook regeneration complete: **${result.posted}** guide messages updated or created.`);
}

async function enforceCommandChannel(interaction) {
  if (isOwner(interaction)) return true;
  const allowed = configForGuild(await loadState(), interaction.guildId).commandChannels?.[interaction.commandName];
  if (!allowed?.length || allowed.includes(interaction.channelId)) return true;
  await interaction.reply({ content: `Use this command in: ${allowed.map(id => `<#${id}>`).join(", ")}`, ephemeral: true });
  return false;
}

function interactionSubcommand(interaction) {
  return interaction.options?.getSubcommand?.(false) || null;
}

function paradiseRegistryContextForInteraction(interaction, state) {
  const config = configForGuild(state, interaction.guildId);
  const roles = [...(interaction.member?.roles?.cache?.values?.() || [])];
  const subcommand = interactionSubcommand(interaction);
  const channel = paradiseCommandChannelContext({
    config,
    command: interaction.commandName,
    subcommand,
    channelId: interaction.channelId
  });
  return {
    config,
    command: interaction.commandName,
    subcommand,
    template: inferParadiseTemplate({ configuredTemplate: config.activeSetupMode, guildName: interaction.guild?.name }),
    enabledModules: enabledParadiseModules(config),
    plan: config.subscriptionPlan || config.plan || "free",
    roleKeys: paradiseRoleKeysForMember({
      roleIds: roles.map(role => role.id),
      roleNames: roles.map(role => role.name),
      mappings: config.roleMappings
    }),
    isOwner: isOwner(interaction),
    channelKeys: channel.channelKeys,
    channelConstraintConfigured: channel.channelConstraintConfigured
  };
}

function paradiseRegistryDenialMessage(code, locale) {
  const tr = String(locale || "").toLowerCase().startsWith("tr");
  const copy = {
    command_not_registered_for_template: tr ? "Bu komut seçili sunucu şablonunda etkin değil." : "This command is not enabled for this server template.",
    command_not_available_for_template: tr ? "Bu komut seçili sunucu şablonunda etkin değil." : "This command is not enabled for this server template.",
    command_module_disabled: tr ? "Bu modül bu sunucuda kapalı." : "This module is disabled for this server.",
    command_plan_required: tr ? "Bu komut seçili Paradise planını gerektiriyor." : "This command requires the selected Paradise plan.",
    command_wrong_channel: tr ? "Bu komutu yapılandırılmış kanalda kullan." : "Use this command in its configured channel.",
    command_permission_denied: tr ? "Bu komut için gerekli rol veya yetki sende yok." : "You do not have the required role or permission for this command."
  };
  return copy[code] || (tr ? "Bu komut şu anda kullanılamıyor." : "This command is not available right now.");
}

export function paradiseRuntimeCommandAccess(context = {}) {
  const registration = paradiseCommandRegistrationAllowed({ command: context.command, template: context.template });
  if (!registration.allowed) return Object.freeze({ allowed: false, code: registration.code, entry: null });
  if (!commandRegistryEntry(context.command, context.subcommand)) {
    return Object.freeze({ allowed: true, code: registration.code, entry: null });
  }
  return paradiseCommandAccess(context);
}

async function enforceParadiseCommandRegistry(interaction) {
  const state = await loadState();
  const context = paradiseRegistryContextForInteraction(interaction, state);
  const flag = resolveParadiseFeatureFlag({
    feature: "command_registry_enforcement",
    flags: context.config.featureFlags,
    guildId: interaction.guildId,
    userId: interaction.user?.id,
    isOwner: context.isOwner
  });
  if (!flag.allowed) return { allowed: true, context, code: flag.reason };
  const access = paradiseRuntimeCommandAccess(context);
  if (!access.allowed) {
    await interaction.reply({ content: paradiseRegistryDenialMessage(access.code, interaction.locale), ephemeral: true });
    return { allowed: false, context, code: access.code };
  }
  return { allowed: true, context, code: access.code };
}

async function handleSticky(interaction) {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages) && !isOwner(interaction)) {
    return interaction.reply({ content: "Manage Messages permission required.", ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  const state = await loadState();
  const stickies = configForGuild(state, interaction.guildId).stickies || {};
  if (sub === "list") {
    const lines = Object.entries(stickies).map(([channelId, item]) => `<#${channelId}> — ${String(item.text).slice(0, 80)}`);
    return interaction.reply({ content: lines.join("\n") || "No sticky messages configured.", ephemeral: true });
  }
  if (sub === "remove") {
    await saveState(next => {
      next.guildConfigs[interaction.guildId] = next.guildConfigs[interaction.guildId] || structuredClone(next.config || {});
      if (next.guildConfigs[interaction.guildId].stickies) delete next.guildConfigs[interaction.guildId].stickies[interaction.channelId];
      return next;
    });
    return interaction.reply({ content: "Sticky removed for this channel.", ephemeral: true });
  }
  const text = interaction.options.getString("text").trim();
  await saveState(next => {
    next.guildConfigs[interaction.guildId] = next.guildConfigs[interaction.guildId] || structuredClone(next.config || {});
    next.guildConfigs[interaction.guildId].stickies = next.guildConfigs[interaction.guildId].stickies || {};
    next.guildConfigs[interaction.guildId].stickies[interaction.channelId] = { text, updatedBy: interaction.user.id, updatedAt: new Date().toISOString(), lastSentAt: 0, messageId: null };
    return next;
  });
  const sent = await interaction.channel.send({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setDescription(text).setFooter(paradiseFooter("Sticky guide"))] });
  await saveState(next => {
    next.guildConfigs[interaction.guildId].stickies[interaction.channelId] = { ...next.guildConfigs[interaction.guildId].stickies[interaction.channelId], messageId: sent.id, lastSentAt: Date.now() };
    return next;
  });
  return interaction.reply({ content: "Sticky configured.", ephemeral: true });
}

async function handleBranding(interaction) {
  if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  if (sub === "color") {
    const raw = interaction.options.getString("hex").trim();
    if (!/^#?[0-9a-f]{6}$/i.test(raw)) {
      return interaction.reply({ content: "Invalid color. Use a six-digit HEX value such as `#000000`.", ephemeral: true });
    }
    const brandColor = normalizeParadiseBrandColor(raw);
    await saveState(state => {
      state.guildConfigs[interaction.guildId] = state.guildConfigs[interaction.guildId] || structuredClone(state.config || {});
      state.guildConfigs[interaction.guildId].brandColor = brandColor;
      return state;
    });
  }
  const color = normalizeParadiseBrandColor(configForGuild(await loadState(), interaction.guildId).brandColor);
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(paradiseBrandColorInteger(color)).setTitle("✦ PARADISE STYLE PREVIEW")
      .setDescription("# Primary heading\n## ◆ Clear section\n### ◇ Supporting detail\n\n**Bold priority** • __Underlined label__ • _soft emphasis_\n\n- Clean bullet hierarchy\n- Consistent spacing\n- Short, readable sections\n\n> Important callout text stays visually separate.\n\n-# This smaller line is Discord subtext.")
      .addFields(
        { name: "Current accent", value: `\`${color}\``, inline: true },
        { name: "Dashboard", value: "Change it anytime in the owner console.", inline: true }
      )
      .setFooter(paradiseFooter("Unified visual system"))],
    ephemeral: true
  });
}

async function handleParadiseMessageInner(message) {
  if (!message.guild || message.author.bot) return false;
  const state = await loadState();
  const qotdWon = await handleQotdAnswer(message, state);
  await handleMemberLevelMessage(message);
  const guildConfig = configForGuild(state, message.guild.id);
  const sticky = guildConfig.stickies?.[message.channelId];
  if (!sticky || Date.now() - Number(sticky.lastSentAt || 0) < 15_000) return qotdWon;
  if (sticky.messageId) await message.channel.messages.delete(sticky.messageId).catch(() => {});
  const sent = await message.channel.send({ embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setDescription(sticky.text).setFooter(paradiseFooter("Sticky guide"))] });
  await saveState(next => {
    next.guildConfigs[message.guild.id] = next.guildConfigs[message.guild.id] || structuredClone(next.config || {});
    next.guildConfigs[message.guild.id].stickies = next.guildConfigs[message.guild.id].stickies || {};
    next.guildConfigs[message.guild.id].stickies[message.channelId] = { ...sticky, messageId: sent.id, lastSentAt: Date.now() };
    return next;
  });
  return true;
}

export async function handleParadiseMessage(message) {
  return paradiseGuildContext.run(message.guild?.id || null, () => handleParadiseMessageInner(message));
}

async function updateStaffTeamEmbed(guild) {
  const channel = guild.channels.cache.find(item => item.name === "staff-team");
  if (!channel) return null;
  await guild.members.fetch().catch(() => {});
  const state = await loadState();
  const guildConfig = configForGuild(state, guild.id);
  const language = guildLanguage(guildConfig);
  const color = await paradiseBrandColor();
  const groups = [
    { title: language === "tr" ? "👑 Kurucular / Owners" : "👑 Founders / Owners", names: ["Founder", "Founders", "Owner", "Co-Owner"] },
    { title: language === "tr" ? "◆ Adminler" : "◆ Admins", names: ["Admin", "Administration Manager", "Head Admin", "Senior Admin", "Junior Admin"] },
    { title: language === "tr" ? "✦ Overseer / Manager Ekibi" : "✦ Overseers / Managers", names: ["Overseer", "Community Manager", "Training Manager", "Training Supervisor", "Tryout Manager", "Tournament Manager"] },
    { title: language === "tr" ? "🛡️ Moderation Team" : "🛡️ Moderation Team", names: ["Moderator Manager", "Head Moderator", "Senior Moderator", "Moderator", "Helper"] },
    { title: language === "tr" ? "💬 Community / Support / Security" : "💬 Community / Support / Security", names: ["Support Staff", "Support Lead", "Senior Support", "Trial Support", "Community Staff", "Security Staff"] },
    { title: language === "tr" ? "⚖️ Referee Team" : "⚖️ Referee Team", names: ["Referee Manager", "Head Referee", "Experienced Referee", "Referee", "Trial Referee"] },
    { title: language === "tr" ? "🏹 Training Hosters" : "🏹 Training Hosters", names: ["Experienced Training Hoster", "Training Hoster", "Trial Training Hoster"] },
    { title: language === "tr" ? "🗝️ Tryout Hosters" : "🗝️ Tryout Hosters", names: ["Experienced Tryout Hoster", "Tryout Hoster", "Trial Tryout Hoster"] },
    { title: language === "tr" ? "🎉 Event / Giveaway / Specialist Staff" : "🎉 Event / Giveaway / Specialist Staff", names: ["Event Manager", "Event Hoster", "Giveaway Manager", "Giveaway Hoster", "Game Night Manager", "War Hoster", "Macro Staff", "FFlag Staff", "Fima Support Staff", "Reseller", "Partner"] }
  ];
  const roleLine = name => {
    const role = guild.roles.cache.find(item => item.name === name);
    if (!role) return null;
    const members = [...role.members.values()].filter(member => !member.user.bot);
    if (!members.length) return `◆ **${name}** → _${language === "tr" ? "Boş" : "Vacant"}_`;
    const shown = members.slice(0, 8).map(member => `${member}`).join(", ");
    const extra = members.length > 8 ? ` +${members.length - 8}` : "";
    return `◆ **${name}** → ${shown}${extra}`;
  };
  const intro = new EmbedBuilder()
    .setColor(color)
    .setTitle("✦ PARADISE STAFF TEAM")
    .setDescription(language === "tr"
      ? [
        "# Staff Directory",
        "Staff rolleri burada bölümlere ayrılmış şekilde görünür. Biri role girince panel kendini yeniler; boş roller temizce **Boş** olarak kalır.",
        "",
        "-# Daha fazla bilgi için staff-command-guide ve mod-command-guide kanallarına bak."
      ].join("\n")
      : [
        "# Staff Directory",
        "Staff roles are grouped here so members can quickly see who handles what. Empty roles stay as **Vacant** and the board refreshes when roles change.",
        "",
        "-# Check staff-command-guide and mod-command-guide for command details."
      ].join("\n"));
  const banner = String(guildConfig.staffTeamBannerUrl || guildConfig.banners?.staffTeam || "").trim();
  if (/^https?:\/\//i.test(banner)) intro.setImage(banner);
  intro.setFooter(paradiseFooter(language === "tr" ? "Staff dizini" : "Staff directory")).setTimestamp();
  const embeds = [intro];
  for (const group of groups) {
    const lines = group.names.map(roleLine).filter(Boolean);
    if (!lines.length) {
      lines.push(language === "tr"
        ? "_Bu bölüm için henüz rol bağlanmadı._"
        : "_No role is mapped for this section yet._");
    }
    embeds.push(new EmbedBuilder()
      .setColor(color)
      .setTitle(group.title)
      .setDescription(lines.join("\n").slice(0, 3900))
      .setFooter(paradiseFooter(language === "tr" ? "Canlı staff dizini" : "Live role directory"))
      .setTimestamp());
  }
  let message = guildConfig.staffTeamMessageId
    ? await channel.messages.fetch(guildConfig.staffTeamMessageId).catch(() => null)
    : null;
  if (message) await message.edit({ embeds: embeds.slice(0, 10) }); else message = await channel.send({ embeds: embeds.slice(0, 10) });
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].staffTeamMessageId = message.id;
    return next;
  });
  return message;
}

export async function handleParadiseGuildMemberUpdate(oldMember, newMember) {
  if (oldMember.roles.cache.size === newMember.roles.cache.size
    && [...oldMember.roles.cache.keys()].every(id => newMember.roles.cache.has(id))) return false;
  clearTimeout(staffTeamRefreshTimers.get(newMember.guild.id));
  const timer = setTimeout(() => {
    staffTeamRefreshTimers.delete(newMember.guild.id);
    paradiseGuildContext.run(newMember.guild.id, () => updateStaffTeamEmbed(newMember.guild)).catch(() => {});
  }, 1500);
  timer.unref?.();
  staffTeamRefreshTimers.set(newMember.guild.id, timer);
  return true;
}

function localizedHelp(locale) {
  return String(locale).toLowerCase().startsWith("tr")
    ? "Komutlar: `/verifyroblox`, `/tryout start`, `/tryout result`, `/paradisetraining start`, `/challenge create`. Sonuçlar doğrulama ve yetki sınırlarından geçer."
    : "Commands: `/verifyroblox`, `/tryout start`, `/tryout result`, `/paradisetraining start`, `/challenge create`. Results pass verification and authority checks.";
}

const ROLE_PANEL_OPTIONS = Object.freeze({
  language: [
    { id: "tr", role: "Turkish", labelTr: "Türkçe", labelEn: "Turkish", emoji: "🇹🇷" },
    { id: "en", role: "English", labelTr: "English", labelEn: "English", emoji: "🇬🇧" }
  ],
  ping: [
    { id: "training", role: "Training Ping", labelTr: "Training", labelEn: "Training", emoji: "🏹" },
    { id: "tryout", role: "Tryout Ping", labelTr: "Tryout", labelEn: "Tryout", emoji: "🗝️" },
    { id: "spar", role: "Spar Ping", labelTr: "Spar", labelEn: "Spar", emoji: "⚔️" },
    { id: "tournament", role: "Tournament Ping", labelTr: "Tournament", labelEn: "Tournament", emoji: "🏆" },
    { id: "event", role: "Event Ping", labelTr: "Event", labelEn: "Event", emoji: "🎉" },
    { id: "giveaway", role: "Giveaway Ping", labelTr: "Giveaway", labelEn: "Giveaway", emoji: "🎁" },
    { id: "game_night", role: "Game Night Ping", labelTr: "Game Night", labelEn: "Game Night", emoji: "🎮" },
    { id: "updates", role: "Update Ping", labelTr: "Updates", labelEn: "Updates", emoji: "📢" }
  ],
  region: [
    { id: "eu", role: "Europe", labelTr: "Europe", labelEn: "Europe", emoji: "🌍" },
    { id: "as", role: "Asia", labelTr: "Asia", labelEn: "Asia", emoji: "🌏" },
    { id: "na", role: "North America", labelTr: "North America", labelEn: "North America", emoji: "🌎" },
    { id: "sa", role: "South America", labelTr: "South America", labelEn: "South America", emoji: "🧭" },
    { id: "oce", role: "Oceania", labelTr: "Oceania", labelEn: "Oceania", emoji: "🌊" }
  ]
});

function rolePanelCopy(kind, language = "tr") {
  const tr = language === "tr";
  if (kind === "language") {
    return {
      title: tr ? "◆ Dil Rolleri" : "◆ Language Roles",
      description: tr
        ? "Sunucuda hangi dilde yönlendirme görmek istediğini seç. Dil rolleri birbirinin yerine geçer; yeni seçim eski dili kaldırır."
        : "Choose the language you want for server guidance. Language roles are exclusive; choosing one removes the other."
    };
  }
  if (kind === "region") {
    return {
      title: tr ? "◆ Bölge Rolleri" : "◆ Region Roles",
      description: tr
        ? "Kendi bölgeni seç. Bölge rolleri matchmaking, etkinlik ve duyuru filtrelerinde kullanılır."
        : "Pick your region. Region roles are used for matchmaking, events and announcement filters."
    };
  }
  return {
    title: tr ? "◆ Bildirim Rolleri" : "◆ Notification Roles",
    description: tr
      ? "Sadece almak istediğin pingleri seç. Butona tekrar basarsan rol kaldırılır; spam ping yok, kontrol sende."
      : "Pick only the pings you want. Press a button again to remove the role; no spam pings, you stay in control."
  };
}

function rolePanelRows(kind, language = "tr") {
  const options = ROLE_PANEL_OPTIONS[kind] || [];
  const rows = [];
  for (let index = 0; index < options.length; index += 5) {
    rows.push(new ActionRowBuilder().addComponents(
      options.slice(index, index + 5).map(option =>
        new ButtonBuilder()
          .setCustomId(`paradise_role_${kind}:${option.id}`)
          .setLabel(language === "tr" ? option.labelTr : option.labelEn)
          .setEmoji(option.emoji)
          .setStyle(kind === "ping" ? ButtonStyle.Secondary : ButtonStyle.Primary)
      )
    ));
  }
  return rows;
}

async function sendRolePanel(interaction, kind) {
  const state = await loadState();
  const language = guildLanguage(configForGuild(state, interaction.guildId));
  const copy = rolePanelCopy(kind, language);
  const embed = new EmbedBuilder()
    .setColor(await paradiseBrandColor())
    .setTitle(copy.title)
    .setDescription(`${copy.description}\n\n-# ${language === "tr" ? "Rol panelleri Paradise tarafından yerinde güncellenir." : "Role panels are updated in place by Paradise."}`)
    .setFooter(paradiseFooter("Made By Fieel"));
  await interaction.reply({ embeds: [embed], components: rolePanelRows(kind, language) });
}

async function handleRolePanelButton(interaction, kind, optionId) {
  const options = ROLE_PANEL_OPTIONS[kind] || [];
  const option = options.find(item => item.id === optionId);
  if (!option) {
    await interaction.reply({ content: "This role option is no longer configured.", ephemeral: true });
    return;
  }
  const role = await ensureRole(interaction.guild, option.role);
  const exclusive = kind === "language" || kind === "region";
  try {
    if (exclusive) {
      for (const other of options) {
        if (other.role === option.role) continue;
        const otherRole = interaction.guild.roles.cache.find(item => item.name === other.role);
        if (otherRole && interaction.member.roles.cache.has(otherRole.id)) {
          await interaction.member.roles.remove(otherRole);
        }
      }
    }
    const hadRole = interaction.member.roles.cache.has(role.id);
    if (hadRole && !exclusive) {
      await interaction.member.roles.remove(role);
      await interaction.reply({ content: `Removed ${role.name}.`, ephemeral: true });
    } else {
      if (!hadRole) await interaction.member.roles.add(role);
      await interaction.reply({ content: `Selected ${role.name}.`, ephemeral: true });
    }
  } catch {
    await interaction.reply({
      content: "Paradise could not update that role. Check bot role position and Manage Roles permission.",
      ephemeral: true
    });
  }
}

async function handleParadiseInteractionInner(interaction) {
  if (interaction.isModalSubmit?.() && interaction.customId === "paradise_verify_modal") {
    await handleVerifyModal(interaction);
    return true;
  }
  if (interaction.isModalSubmit?.() && interaction.customId.startsWith("paradise_voice_rename_modal:")) {
    await handleTemporaryVoiceRenameModal(interaction);
    return true;
  }
  if (interaction.isModalSubmit?.() && /^paradise_voice_(permit|reject|transfer)_modal:/.test(interaction.customId)) {
    await handleTemporaryVoiceMemberModal(interaction);
    return true;
  }
  if (interaction.isModalSubmit?.() && interaction.customId.startsWith("paradise_application_review_reason:")) {
    await handleApplicationReviewReasonModal(interaction);
    return true;
  }
  if (interaction.isModalSubmit?.() && interaction.customId.startsWith("paradise_application_modal:")) {
    await handleApplicationModal(interaction);
    return true;
  }
  if (interaction.isModalSubmit?.() && interaction.customId.startsWith("paradise_qotd_gamepass_modal:")) {
    await handleQotdGamepassModal(interaction);
    return true;
  }
  if (interaction.isModalSubmit?.() && interaction.customId.startsWith("paradise_support_delete_confirm:")) {
    await handleParadiseSupportDeleteModal(interaction);
    return true;
  }
  if (interaction.isModalSubmit?.() && interaction.customId.startsWith("paradise_setup_final:")) {
    await handleSetupFinalConfirmation(interaction, interaction.customId.split(":")[1]);
    return true;
  }
  if (interaction.isButton?.()) {
    if (interaction.customId.startsWith("paradise_staff_guide_lang:")) {
      const language = interaction.customId.split(":")[1] === "en" ? "en" : "tr";
      await interaction.reply({ ...staffGuidePayload(language), ephemeral: true });
      return true;
    }
    if (interaction.customId.startsWith("paradise_member_help_lang:")) {
      const [, locale, selectedId] = interaction.customId.split(":");
      const state = await loadState();
      const entries = memberHelpEntries(paradiseRegistryContextForInteraction(interaction, state));
      const payload = memberHelpPayload(entries, locale, selectedId === "overview" ? null : selectedId);
      payload.embeds[0].setColor(await paradiseBrandColor());
      await interaction.update(payload);
      return true;
    }
    if (String(interaction.customId || "").startsWith("pv:")) {
      const component = parseParadiseComponentId(interaction.customId, { guildId: interaction.guildId });
      if (!component.ok) {
        await interaction.reply({ content: outdatedParadiseComponentMessage(interaction.locale), ephemeral: true });
        return true;
      }
      if (component.family === "availability" && component.action === "refresh") {
        const panel = await updateAvailabilityPanel(interaction.guild);
        await interaction.reply({ content: panel ? "Availability refreshed." : "Availability channel is not configured.", ephemeral: true });
        return true;
      }
      await interaction.reply({ content: outdatedParadiseComponentMessage(interaction.locale), ephemeral: true });
      return true;
    }
    if (interaction.customId === "paradise_verify_open") {
      const modal = new ModalBuilder().setCustomId("paradise_verify_modal").setTitle("Roblox Verification");
      const username = new TextInputBuilder().setCustomId("roblox_username").setLabel("Roblox Username")
        .setPlaceholder("Enter your exact Roblox username").setStyle(TextInputStyle.Short)
        .setMinLength(3).setMaxLength(20).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(username));
      await interaction.showModal(modal);
      return true;
    }
    if (interaction.customId === "paradise_verify_confirm") { await verifyCheck(interaction); return true; }
    if (interaction.customId === "paradise_verify_retry") {
      const challenge = verificationChallenges.get(interaction.user.id)
        || (await loadState()).verificationChallenges[interaction.user.id];
      if (!challenge) {
        await interaction.reply({ content: "Verification expired. Start again with `/verifyroblox`.", ephemeral: true });
      } else {
        await startVerification(interaction, challenge.username);
      }
      return true;
    }
    if (interaction.customId === "paradise_verify_cancel") {
      verificationChallenges.delete(interaction.user.id);
      await saveState(state => { delete state.verificationChallenges[interaction.user.id]; return state; });
      await interaction.update({ content: "Roblox verification cancelled.", embeds: [], components: [] });
      return true;
    }
    if (interaction.customId === "paradise_profile_create") { await beginProfileCreation(interaction); return true; }
    if (interaction.customId === "paradise_profile_region_change") { await beginProfileRegionChange(interaction); return true; }
    if (interaction.customId === "paradise_challenge_open") { await presentChallengeTargetMenu(interaction); return true; }
    if (interaction.customId === "paradise_availability_refresh") {
      const panel = await updateAvailabilityPanel(interaction.guild);
      await interaction.reply({ content: panel ? "Availability refreshed." : "Availability channel is not configured.", ephemeral: true });
      return true;
    }
    if (interaction.customId === "paradise_setup_confirm_clan") { await showSetupFinalConfirmation(interaction, "clan"); return true; }
    if (interaction.customId.startsWith("paradise_setup_select:")) {
      await setupPreview(interaction, interaction.customId.split(":")[1], true);
      return true;
    }
    if (interaction.customId.startsWith("paradise_setup_review:")) {
      await showSetupFinalConfirmation(interaction, interaction.customId.split(":")[1]);
      return true;
    }
    if (interaction.customId === "paradise_setup_cancel") { await interaction.update({ content: "Setup cancelled.", embeds: [], components: [] }); return true; }
    if (interaction.customId.startsWith("paradise_help:")) {
      const scope = interaction.customId.split(":")[1];
      await interaction.update({ embeds: [helpEmbed(scope, interaction.locale).setColor(await paradiseBrandColor())], components: helpComponents(scope) });
      return true;
    }
    if (interaction.customId.startsWith("paradise_help_lang:")) {
      const [, locale, scope] = interaction.customId.split(":");
      await interaction.reply({ embeds: [helpEmbed(scope, locale).setColor(await paradiseBrandColor())], ephemeral: true });
      return true;
    }
    if (interaction.customId.startsWith("paradise_loa_")) { await handleLoaDecision(interaction); return true; }
    if (interaction.customId.startsWith("paradise_tryout_")) { await handleTryoutApproval(interaction); return true; }
    if (interaction.customId.startsWith("paradise_challenge_")) { await handleChallengeApproval(interaction); return true; }
    if (interaction.customId.startsWith("paradise_session_")) { await handleSessionButton(interaction); return true; }
    if (interaction.customId.startsWith("paradise_activity_present:")) { await handleActivityResponse(interaction); return true; }
    if (interaction.customId.startsWith("paradise_support_")) { await handleParadiseSupportButton(interaction); return true; }
    if (interaction.customId === "paradise_application_open") {
      const mode = configForGuild(await loadState(), interaction.guildId).activeSetupMode;
      const types = APPLICATION_TYPES.filter(([value]) => applicationTypeAllowedForMode(value, mode));
      const menu = new StringSelectMenuBuilder().setCustomId("paradise_application_type")
        .setPlaceholder("Choose application type / Basvuru turu").addOptions(
          types.map(([value, label]) => ({ value, label }))
        );
      await interaction.reply({ content: "Choose the form you want to open.", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      return true;
    }
    if (interaction.customId.startsWith("paradise_application_continue:")) { await handleApplicationContinueButton(interaction); return true; }
    if (interaction.customId.startsWith("paradise_application_cancel:")) { await handleApplicationCancelButton(interaction); return true; }
    if (interaction.customId.startsWith("paradise_application_")) { await handleApplicationReview(interaction); return true; }
    if (interaction.customId.startsWith("paradise_mod_")) { await handleModerationReview(interaction); return true; }
    if (interaction.customId.startsWith("paradise_payout_")) { await handleQotdPayoutReview(interaction); return true; }
    if (interaction.customId.startsWith("paradise_voice_")) { await handleTemporaryVoiceButton(interaction); return true; }
    if (interaction.customId.startsWith("paradise_qotd_")) { await handleQotdButton(interaction); return true; }
    if (interaction.customId.startsWith("paradise_giveaway_enter:") || interaction.customId.startsWith("paradise_rsvp_")) { await handleOptInButton(interaction); return true; }
    if (interaction.customId.startsWith("paradise_role_")) {
      const match = interaction.customId.match(/^paradise_role_(language|ping|region):(.+)$/);
      if (match) {
        await handleRolePanelButton(interaction, match[1], match[2]);
        return true;
      }
    }
    if (["paradise_lang_en", "paradise_lang_tr"].includes(interaction.customId)) {
      const chosen = interaction.customId.endsWith("_tr") ? "Turkish" : "English";
      const other = chosen === "Turkish" ? "English" : "Turkish";
      const chosenRole = await ensureRole(interaction.guild, chosen);
      const otherRole = interaction.guild.roles.cache.find(r => r.name === other);
      if (otherRole && interaction.member.roles.cache.has(otherRole.id)) await interaction.member.roles.remove(otherRole);
      const removing = interaction.member.roles.cache.has(chosenRole.id);
      if (removing) await interaction.member.roles.remove(chosenRole); else await interaction.member.roles.add(chosenRole);
      await interaction.reply({ content: removing ? `${chosen} role removed.` : `${chosen} role added.`, ephemeral: true }); return true;
    }
  }
  if (interaction.isStringSelectMenu?.() && interaction.customId === "paradise_profile_region") {
    await handleProfileRegion(interaction);
    return true;
  }
  if (interaction.isStringSelectMenu?.() && interaction.customId === "paradise_member_help") {
    const state = await loadState();
    const entries = memberHelpEntries(paradiseRegistryContextForInteraction(interaction, state));
    const selectedId = interaction.values[0];
    if (!entries.some(entry => entry.id === selectedId)) {
      await interaction.reply({ content: "This help entry is no longer available to you.", ephemeral: true });
      return true;
    }
    const payload = memberHelpPayload(entries, interaction.locale, selectedId);
    payload.embeds[0].setColor(await paradiseBrandColor());
    await interaction.update(payload);
    return true;
  }
  if (interaction.isStringSelectMenu?.() && interaction.customId === "paradise_staff_guide_category") {
    const state = await loadState();
    const entries = visibleParadiseStaffCommands(paradiseRegistryContextForInteraction(interaction, state));
    await interaction.reply({ ...staffGuideDetailPayload(entries, interaction.values[0], interaction.locale), ephemeral: true });
    return true;
  }
  if (interaction.isStringSelectMenu?.() && interaction.customId.startsWith("paradise_help_category")) {
    const scope = interaction.values[0];
    await interaction.update({
      embeds: [helpEmbed(scope, interaction.locale).setColor(await paradiseBrandColor())],
      components: helpComponents(scope)
    });
    return true;
  }
  if (interaction.isStringSelectMenu?.() && interaction.customId === "paradise_profile_lookup") {
    await handleProfileLookupSelect(interaction);
    return true;
  }
  if (interaction.isStringSelectMenu?.() && interaction.customId === "paradise_application_type") {
    await interaction.showModal(applicationModal(interaction.values[0], 0, "new"));
    return true;
  }
  if (interaction.isStringSelectMenu?.() && interaction.customId === "paradise_challenge_target") {
    const draft = challengeDrafts.get(interaction.user.id);
    if (!draft || draft.expires < Date.now()) {
      challengeDrafts.delete(interaction.user.id);
      await interaction.reply({ content: "Challenge selection expired. Run `/challenge create` again.", ephemeral: true });
      return true;
    }
    const opponent = await interaction.client.users.fetch(interaction.values[0]).catch(() => null);
    if (!opponent) {
      await interaction.reply({ content: "That Discord user is no longer available.", ephemeral: true });
      return true;
    }
    await createChallengeTicket(interaction, opponent, draft.region);
    return true;
  }
  if (interaction.isStringSelectMenu?.() && interaction.customId === "paradise_ping_roles") {
    for (const label of ["Training", "Tournament", "Event", "Giveaway", "Game Night"]) {
      const role = await ensureRole(interaction.guild, `${label} Ping`);
      if (interaction.values.includes(label)) await interaction.member.roles.add(role); else if (interaction.member.roles.cache.has(role.id)) await interaction.member.roles.remove(role);
    }
    await interaction.reply({ content: "Paradise ping roles updated.", ephemeral: true }); return true;
  }
  if (!interaction.isChatInputCommand?.()) return false;
  if (!(await enforceParadiseCommandRegistry(interaction)).allowed) return true;
  if (!await enforceCommandChannel(interaction)) return true;
  if (interaction.commandName === "setupfieels" || interaction.commandName === "previewserversetup") { await setupChooser(interaction); return true; }
  if (interaction.commandName === "backupserverstructure") { await setupPreview(interaction, "clan"); return true; }
  if (interaction.commandName === "setupfieelscommunity") { await handleSetupAction(interaction, "community"); return true; }
  if (interaction.commandName === "setupfieelsclan") { await handleSetupAction(interaction, "clan"); return true; }
  if (interaction.commandName === "setupfieelstsbtr") { await handleSetupAction(interaction, "tsbtr"); return true; }
  if (interaction.commandName === "setup") { await handleSetupAction(interaction, interaction.options.getString("mode") || "community"); return true; }
  if (interaction.commandName === "help") { await handleRegistryHelp(interaction); return true; }
  if (interaction.commandName === "verifyroblox") { await verifyStart(interaction); return true; }
  if (interaction.commandName === "verifyrobloxcheck") { await verifyCheck(interaction); return true; }
  if (interaction.commandName === "profile") { await handleProfile(interaction); return true; }
  if (interaction.commandName === "paradisehelp") { await interaction.reply({ content: localizedHelp(interaction.locale), ephemeral: true }); return true; }
  if (interaction.commandName === "sendlanguagequestion") {
    await sendRolePanel(interaction, "language"); return true;
  }
  if (interaction.commandName === "sendpingroleselector") {
    await sendRolePanel(interaction, "ping"); return true;
  }
  if (interaction.commandName === "sendregionroleselector") {
    await sendRolePanel(interaction, "region"); return true;
  }
  if (interaction.commandName === "welcome") { await handleLifecyclePreview(interaction, "join"); return true; }
  if (interaction.commandName === "leave") { await handleLifecyclePreview(interaction, "leave"); return true; }
  if (interaction.commandName === "tryout") { await handleTryout(interaction); return true; }
  if (interaction.commandName === "challenge") { await handleChallenge(interaction); return true; }
  if (interaction.commandName === "paradisetraining" || interaction.commandName === "training") { await handleTraining(interaction); return true; }
  if (interaction.commandName === "tournament") { await handleTournament(interaction); return true; }
  if (interaction.commandName === "giveaway") { await handleGiveaway(interaction); return true; }
  if (interaction.commandName === "gamenight") { await handleCommunityEvent(interaction, "gamenight"); return true; }
  if (interaction.commandName === "event") { await handleCommunityEvent(interaction, "event"); return true; }
  if (interaction.commandName === "referee") { await handleReferee(interaction); return true; }
  if (interaction.commandName === "activity") { await handleActivity(interaction); return true; }
  if (interaction.commandName === "whitelist") { await handleWhitelist(interaction); return true; }
  if (interaction.commandName === "mainer") { await handleMainer(interaction); return true; }
  if (interaction.commandName === "report") { await handleStaffReport(interaction); return true; }
  if (interaction.commandName === "findfcw") { await handleFindFcw(interaction); return true; }
  if (interaction.commandName === "commandchannel") { await handleCommandChannel(interaction); return true; }
  if (interaction.commandName === "sticky") { await handleSticky(interaction); return true; }
  if (interaction.commandName === "branding") { await handleBranding(interaction); return true; }
  if (interaction.commandName === "relation") { await handleRelation(interaction); return true; }
  if (interaction.commandName === "availability") { await handleAvailability(interaction); return true; }
  if (interaction.commandName === "loa") { await handleLoa(interaction); return true; }
  if (interaction.commandName === "lineup") { await handleLineup(interaction); return true; }
  if (interaction.commandName === "roster") { await handleRoster(interaction); return true; }
  if (interaction.commandName === "blacklist") { await handleBlacklist(interaction); return true; }
  if (interaction.commandName === "appeal") { await handleAppeal(interaction); return true; }
  if (interaction.commandName === "bail") { await handleBail(interaction); return true; }
  if (interaction.commandName === "qotd") { await handleQotdCommand(interaction); return true; }
  if (interaction.commandName === "answer") { await handleQotdSlashAnswer(interaction); return true; }
  if (interaction.commandName === "application") { await handleApplicationCommand(interaction); return true; }
  if (interaction.commandName === "mod") { await handleModCommand(interaction); return true; }
  if (interaction.commandName === "modcase") { await handleModCaseCommand(interaction); return true; }
  if (interaction.commandName === "moderation") { await handleModerationStatsCommand(interaction); return true; }
  if (interaction.commandName === "security") { await handleSecurityCommand(interaction); return true; }
  if (interaction.commandName === "rank") { await handleRankCommand(interaction); return true; }
  if (interaction.commandName === "leaderboard") { await handleLeaderboardCommand(interaction); return true; }
  if (interaction.commandName === "set" || interaction.commandName === "setlogchannel") { await handleSetChannel(interaction); return true; }
  if (interaction.commandName === "handbook") { await handleHandbook(interaction); return true; }
  return false;
}

export async function handleParadiseInteraction(interaction) {
  return paradiseGuildContext.run(interaction.guildId || null, () => handleParadiseInteractionInner(interaction));
}
