import fs from "node:fs/promises";
import { fimaGuildProfileProjection, ensureFimaGlobalProfileId } from './fimaProfileProjection.js';
import { fimaInteractionModuleAllowed, fimaRuntimeModuleAllowed, fimaVoiceSettings } from './fimaGuildArchitecture.js';
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
import {
  buildParadiseRestoreDryRun,
  createParadiseBackupEnvelope,
  paradiseBackupStateDigest,
  validateParadiseBackupArtifactCopies,
  validateParadiseBackupEnvelope
} from "./paradiseBackupIntegrity.js";
import {
  captureParadiseGuildBackupSnapshot,
  paradiseProductionRestoreConfirmation,
  paradiseRestoreConfirmation,
  restoreParadiseGuildBackup
} from "./paradiseGuildRestore.js";
import {
  armParadiseRollbackMarker,
  assertNoUnresolvedParadiseRollback,
  readParadiseRollbackMarker,
  resolveParadiseRollbackMarker,
  updateParadiseRollbackMarker
} from "./paradiseRollbackMarker.js";
import { inspectCommunityActivityReadiness } from "./communityActivity.js";
import {
  paradiseGuildMutationLockStatus as mutationLockStatus,
  paradiseCurrentMutationLease,
  paradisePersistentMutationLockStatus,
  sanitizeParadiseMutationFailure,
  updateParadiseMutationLease,
  withParadiseGuildMutationLease
} from "./paradiseMutationLease.js";
import { inspectParadiseRebuildPreflight } from "./paradiseRebuildPreflight.js";
import {
  readParadiseProductionFinalizationReceipt,
  resolveParadiseProductionFinalizationReceipt,
  verifyParadiseProductionRebuildExecutionProof
} from "./paradiseProductionRebuildPlan.js";
import {
  FT_COMMUNITY_VISUAL_MANIFEST,
  assertFtCommunityVisualMutationApproved,
  createFtCommunityVisualSurfacePlan,
  loadVerifiedFtCommunityVisualAsset
} from "./ftCommunityVisualAssets.js";

export const PARADISE_TEST_GUILD_ID = "1520519015661961257";
export const FIMA_COMMUNITY_PRODUCTION_GUILD_ID = "1419335632324657306";
export const FIMA_COMMUNITY_REBUILD_CONFIRMATION = "REBUILD FIEELS COMMUNITY";
export const PARADISE_TEST_REHEARSAL_CONFIRMATION = "REHEARSE TEST COMMUNITY";
export const PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION = "RECOVER TEST COMMUNITY ROLLBACK";
const PARADISE_ARTIFACT_ROOT = path.resolve(process.cwd(), "artifacts", "post-security-backlog");
const PARADISE_TEST_REBUILD_POLICY = Object.freeze({
  allowedGuildId: PARADISE_TEST_GUILD_ID,
  expectedConfirmation: null,
  artifactPrefix: "3a65-test-server",
  restoreArtifactPrefix: "3a73-test-server",
  auditReason: "FIMA owner-confirmed test-guild",
  operationLabel: "full_test_server_rebuild",
  failurePrefix: "test_rebuild",
  isProduction: false,
  isTest: true
});
const FIMA_COMMUNITY_PRODUCTION_REBUILD_POLICY = Object.freeze({
  allowedGuildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
  expectedConfirmation: FIMA_COMMUNITY_REBUILD_CONFIRMATION,
  artifactPrefix: "production-ft-community",
  restoreArtifactPrefix: "production-ft-community",
  auditReason: "FIMA owner-confirmed production FT Community",
  operationLabel: "full_production_ft_community_rebuild",
  failurePrefix: "production_rebuild",
  requireTestGuildRehearsal: true,
  expectedTestGuildId: PARADISE_TEST_GUILD_ID,
  testGuildRehearsalMaxAgeMs: 24 * 60 * 60 * 1000,
  isProduction: true,
  isTest: false
});
const PARADISE_BACKUP_DIGEST_PATTERN = /^[a-f0-9]{64}$/i;
const DISCORD_UNKNOWN_CHANNEL_CODES = new Set([10003, "10003"]);
const PARADISE_ROLLBACK_CACHE_REFRESH_TIMEOUT_MS = 15_000;
export const DEFAULT_PARADISE_BRAND_COLOR = "#000000";

export function isParadiseUnknownChannelError(error) {
  return DISCORD_UNKNOWN_CHANNEL_CODES.has(error?.code)
    || DISCORD_UNKNOWN_CHANNEL_CODES.has(error?.rawError?.code)
    || DISCORD_UNKNOWN_CHANNEL_CODES.has(error?.cause?.code);
}

// Changing this revision reruns the guarded smoke suite only in the fixed
// Fixed FIMA Bot test guild. It never targets a production guild.
const PARADISE_AUTO_SMOKE_REVISION = "3a80-ft-community-activity-smoke-v11";
// This revision is intentionally limited to the fixed lab guild. It is the
// owner-authorized compact test layout, never a production-guild rebuild.
const PARADISE_TEST_LAB_LAYOUT_REVISION = "3a80-template-aware-canonical-lab-v3";
const DEFAULT_FIMA_FOOTER_BRAND = "Made By Fieel";
export function sanitizeParadisePublicAssetBase(value) {
  const safe = sanitizeParadiseHttpsUrl(value);
  if (!safe) return "https://fimamacro.com";
  const parsed = new URL(safe);
  parsed.search = "";
  parsed.hash = "";
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

const PARADISE_PUBLIC_ASSET_BASE = sanitizeParadisePublicAssetBase(
  process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || "https://fimamacro.com"
);
export const PARADISE_COMMUNITY_VISUAL_SURFACE_PLAN = createFtCommunityVisualSurfacePlan(
  PARADISE_PUBLIC_ASSET_BASE,
  FT_COMMUNITY_VISUAL_MANIFEST
);
export const PARADISE_COMMUNITY_ASSETS = PARADISE_COMMUNITY_VISUAL_SURFACE_PLAN.surfaces.webhookBanners;
const PARADISE_LEADERBOARD_SEPARATOR_ASSET = PARADISE_COMMUNITY_ASSETS.leaderboard;

export function paradiseCommunityGuideBannerUrl(definitionKey) {
  const assetKey = {
    rules: "rules",
    announcement: "announcement",
    booster: "booster"
  }[definitionKey];
  return assetKey ? PARADISE_COMMUNITY_ASSETS[assetKey] : null;
}
const LEVELS = ["Low", "Mid", "High"];
const STRENGTHS = ["Weak", "Stable", "Strong"];
const APPLICATION_TYPES = Object.freeze([
  ["helper", "Helper"],
  ["staff", "Staff"], ["moderator", "Moderator"], ["support", "Support"],
  ["training_hoster", "Training Hoster"], ["tryout_hoster", "Tryout Hoster"],
  ["referee", "Referee"], ["event_staff", "Event Staff"],
  ["giveaway_staff", "Giveaway Staff"], ["content_creator", "Content Creator"],
  ["video_team", "Video Team"], ["creative_team", "Creative Team"], ["developer", "Developer"],
  ["partnership", "Partnership / Ally"], ["clan_mainer", "Clan Member / Mainer"],
  ["fima_support", "Fima Support Helper"], ["macro_staff", "Macro Staff"],
  ["fflag_staff", "FFlag Staff"], ["war_hoster", "War Hoster"],
  ["creator", "Creator / Media Partner"],
  ["reseller", "Reseller / Affiliate"]
]);
export const FIEELS_COMMUNITY_STAFF_PROGRESSION = Object.freeze([
  "Helper", "Junior Moderator", "Moderator", "Senior Moderator", "Administrator", "Owner"
]);
const COMMUNITY_PUBLIC_STAFF_APPLICATION_TYPES = new Set([
  "helper",
  "staff",
  "moderator",
  "support",
  "training_hoster",
  "event_staff",
  "giveaway_staff",
  "content_creator",
  "video_team",
  "creative_team",
  "developer",
  "fima_support",
  "macro_staff",
  "fflag_staff"
]);
const BUSINESS_APPLICATION_TYPES = new Set(["partnership", "creator", "reseller"]);
const COMMUNITY_BLOCKED_APPLICATION_TYPES = new Set(["clan_mainer", "tryout_hoster", "referee", "war_hoster"]);
const CLAN_ONLY_APPLICATION_TYPES = new Set(["clan_mainer", "war_hoster"]);
const COMMUNITY_ONLY_APPLICATION_TYPES = new Set(["fima_support", "macro_staff", "fflag_staff", "reseller"]);
const TSBTR_BLOCKED_APPLICATION_TYPES = new Set(["clan_mainer", "fima_support", "macro_staff", "fflag_staff", "war_hoster", "reseller"]);
const DISCORD_APPLICATION_MODAL_LIMIT = 5;
const APPLICATION_EXTRA_QUESTION_LIMIT = 20;
const APPLICATION_DRAFT_TTL_MS = 30 * 60_000;
const APPLICATION_EVIDENCE_MAX_PER_QUESTION = 2;
const APPLICATION_EVIDENCE_MAX_FILES = 4;
const APPLICATION_EVIDENCE_MAX_FILE_BYTES = 160 * 1024;
const APPLICATION_EVIDENCE_MAX_TOTAL_BYTES = 480 * 1024;
const APPLICATION_EVIDENCE_STORAGE_ROOT = path.resolve(process.cwd(), "artifacts", "paradise-application-evidence");
const APPLICATION_EVIDENCE_TYPE_RULES = Object.freeze({
  "image/png": Object.freeze({ extensions: [".png"], extension: ".png" }),
  "image/jpeg": Object.freeze({ extensions: [".jpg", ".jpeg"], extension: ".jpg" }),
  "image/webp": Object.freeze({ extensions: [".webp"], extension: ".webp" })
});
let paradiseApplicationEvidenceScanner = null;
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
    ["why", "Neden sen?", "Neden FIMA Bot/FIMA reseller olmak istiyorsun?", TextInputStyle.Paragraph, 20, 700]
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
  helper: [
    ["motivation", "Motivasyon", "FIMA Helper ekibine neden katılmak istiyorsun?", TextInputStyle.Paragraph, 20, 700],
    ["availability", "Aktiflik planı", "Saat dilimin nedir; haftada hangi gün ve saatlerde aktif olabilirsin?", TextInputStyle.Short, 3, 180],
    ["first_response", "İlk müdahale", "Bir üye yardım istediğinde sorunu nasıl anlayıp ilk yanıtını nasıl verirsin?", TextInputStyle.Paragraph, 20, 700],
    ["conflict", "Tartışma yönetimi", "İki üye tartışırken ortamı sakinleştirmek için hangi adımları izlersin?", TextInputStyle.Paragraph, 20, 700],
    ["privacy", "Gizlilik ve güvenlik", "Bir üyeden hangi özel bilgileri asla istemezsin?", TextInputStyle.Paragraph, 20, 700],
    ["escalation", "Yetki sınırı", "Çözemediğin veya yetkini aşan bir olayı kime, hangi kanıtlarla aktarırsın?", TextInputStyle.Paragraph, 20, 700],
    ["teamwork", "Ekip çalışması", "Diğer ekip üyeleriyle fikir ayrılığı yaşarsan nasıl çözersin?", TextInputStyle.Paragraph, 20, 700],
    ["experience", "Deneyim", "Varsa topluluk desteği veya moderasyon deneyimini anlat.", TextInputStyle.Paragraph, 5, 700]
  ],
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
    ["why", "Neden sen?", "Neden FIMA Bot/FIMA reseller olmak istiyorsun?", TextInputStyle.Paragraph, 20, 700]
  ],
  content_creator: [
    ["platforms", "Platformlar", "Hangi platformlarda içerik üretiyorsun?", TextInputStyle.Short, 3, 180],
    ["portfolio", "Örnek iş", "Örnek video/link veya portfolyo açıklaması yaz.", TextInputStyle.Paragraph, 20, 700],
    ["schedule", "Plan", "Haftada kaç içerik çıkarabilirsin?", TextInputStyle.Short, 3, 180],
    ["style", "Stil", "İçerik tarzın nasıl?", TextInputStyle.Paragraph, 20, 700],
    ["brand", "Marka", "FIMA Bot/FIMA markasını nasıl doğru temsil edersin?", TextInputStyle.Paragraph, 20, 700],
    ["rules", "Kural", "Yanıltıcı başlık veya sahte vaat kullanmamak için ne yaparsın?", TextInputStyle.Paragraph, 20, 700],
    ["community", "Topluluk", "Yorumlarda toxiclik çıkarsa nasıl yönetirsin?", TextInputStyle.Paragraph, 20, 700],
    ["collab", "İşbirliği", "Diğer içerik üreticileriyle nasıl çalışırsın?", TextInputStyle.Paragraph, 20, 700],
    ["analytics", "Analiz", "İçeriğin performansını nasıl ölçersin?", TextInputStyle.Paragraph, 20, 700],
    ["assets", "Görsel", "Banner/thumbnail hazırlama deneyimin var mı?", TextInputStyle.Paragraph, 5, 700],
    ["availability", "Aktiflik", "Haftalık aktifliğin nedir?", TextInputStyle.Short, 3, 180],
    ["why", "Neden sen?", "Content Creator rolü için neden uygunsun?", TextInputStyle.Paragraph, 20, 700]
  ],
  video_team: [
    ["portfolio", "Video portfolyosu", "Kurgu, motion veya prodüksiyon çalışmalarından doğrulanabilir örneklerini paylaş.", TextInputStyle.Paragraph, 20, 700],
    ["editing_stack", "Kurgu araçları", "Hangi kurgu, ses, motion ve görsel araçlarını hangi seviyede kullanıyorsun?", TextInputStyle.Paragraph, 20, 700],
    ["weekly_capacity", "Haftalık kapasite", "Bir haftada gerçekçi olarak kaç kısa ve uzun video teslim edebilirsin?", TextInputStyle.Short, 3, 180],
    ["source_rights", "Kaynak ve kullanım hakları", "Müzik, font, görüntü ve diğer kaynakların kullanım haklarını nasıl doğrularsın?", TextInputStyle.Paragraph, 20, 700],
    ["privacy", "Gizlilik", "Kayıtlarda görünen kullanıcı adları, mesajlar ve kişisel verileri nasıl korursun?", TextInputStyle.Paragraph, 20, 700],
    ["delivery_workflow", "Teslim akışı", "Brief'ten dışa aktarma, dosya adlandırma ve arşivlemeye kadar teslim sürecini açıkla.", TextInputStyle.Paragraph, 20, 700],
    ["feedback", "Revizyon", "Çelişen veya yoğun geri bildirim geldiğinde revizyonları nasıl önceliklendirirsin?", TextInputStyle.Paragraph, 20, 700],
    ["brand_safety", "Marka güvenliği", "Yanıltıcı başlık, izinsiz içerik ve uygunsuz görselleri nasıl engellersin?", TextInputStyle.Paragraph, 20, 700],
    ["availability", "Uygunluk", "Saat dilimin, müsait günlerin ve acil teslimlere yaklaşımın nedir?", TextInputStyle.Short, 3, 180],
    ["why", "Neden sen?", "FIMA Video Team'e hangi özgün katkıyı sağlayabilirsin?", TextInputStyle.Paragraph, 20, 700]
  ],
  creative_team: [
    ["portfolio", "Tasarım portfolyosu", "Grafik, illüstrasyon, marka veya arayüz çalışmalarından doğrulanabilir örneklerini paylaş.", TextInputStyle.Paragraph, 20, 700],
    ["disciplines", "Yaratıcı alanlar", "En güçlü olduğun tasarım alanlarını, araçlarını ve seviyeni açıkla.", TextInputStyle.Paragraph, 20, 700],
    ["brief_process", "Brief süreci", "Belirsiz bir brief'i uygulanabilir yaratıcı hedeflere nasıl dönüştürürsün?", TextInputStyle.Paragraph, 20, 700],
    ["brand_consistency", "Marka tutarlılığı", "FIMA'nın görsel dilini farklı ürün ve yüzeylerde nasıl tutarlı tutarsın?", TextInputStyle.Paragraph, 20, 700],
    ["collaboration", "Ekip çalışması", "Video, içerik ve geliştirme ekipleriyle dosya ve karar akışını nasıl yönetirsin?", TextInputStyle.Paragraph, 20, 700],
    ["delivery", "Teslim akışı", "Kaynak dosya, dışa aktarma, adlandırma ve arşivleme düzenini açıkla.", TextInputStyle.Paragraph, 20, 700],
    ["feedback", "Geri bildirim", "Çelişen yaratıcı geri bildirimleri nasıl netleştirir ve revizyona dönüştürürsün?", TextInputStyle.Paragraph, 20, 700],
    ["rights", "Kaynak hakları", "Font, görsel, karakter ve diğer kaynakların lisans ve kullanım haklarını nasıl doğrularsın?", TextInputStyle.Paragraph, 20, 700],
    ["availability", "Uygunluk", "Saat dilimin, haftalık kapasiten ve acil teslimlere yaklaşımın nedir?", TextInputStyle.Short, 3, 180],
    ["why", "Neden sen?", "FIMA Creative Team'e hangi özgün katkıyı sağlayabilirsin?", TextInputStyle.Paragraph, 20, 700]
  ],
  developer: [
    ["languages", "Teknik yetkinlik", "Kullandığın dilleri, frameworkleri ve en güçlü olduğun alanları yaz.", TextInputStyle.Paragraph, 20, 700],
    ["projects", "Projeler", "Rolünle ilgili doğrulanabilir projelerini ve bu projelerdeki kişisel katkını açıkla.", TextInputStyle.Paragraph, 20, 700],
    ["debugging", "Hata ayıklama", "Tekrarlanamayan bir production hatasını nasıl araştırır ve kanıtlarsın?", TextInputStyle.Paragraph, 20, 700],
    ["review_workflow", "Kod inceleme", "Küçük, incelenebilir değişiklikler ve anlaşılır review notları için nasıl çalışırsın?", TextInputStyle.Paragraph, 20, 700],
    ["testing", "Test yaklaşımı", "Değişikliğin doğruluğunu ve geriye dönük uyumluluğunu hangi testlerle kanıtlarsın?", TextInputStyle.Paragraph, 20, 700],
    ["least_privilege", "En az yetki", "Araç, servis ve kullanıcı verisi erişimlerini en az yetkiyle nasıl sınırlandırırsın?", TextInputStyle.Paragraph, 20, 700],
    ["secrets", "Sır yönetimi", "API anahtarı, token ve kullanıcı sırlarını koddan, loglardan ve istemciden nasıl uzak tutarsın?", TextInputStyle.Paragraph, 20, 700],
    ["rollback", "Geri alma", "Riskli bir değişiklik için yayın, gözlem ve geri alma planını açıkla.", TextInputStyle.Paragraph, 20, 700],
    ["availability", "Uygunluk", "Saat dilimin, haftalık kapasiten ve bakım görevlerine ayırabileceğin zaman nedir?", TextInputStyle.Short, 3, 180],
    ["why", "Neden sen?", "FIMA geliştirme ekibine hangi özgün katkıyı sağlayabilirsin?", TextInputStyle.Paragraph, 20, 700]
  ],
  creator: [
    ["platforms", "Platformlar", "Hangi platformlarda ve hangi adla içerik üretiyorsun?", TextInputStyle.Short, 3, 180],
    ["portfolio", "Portfolyo", "Örnek içeriklerini veya doğrulanabilir portfolyo açıklamanı paylaş.", TextInputStyle.Paragraph, 20, 700],
    ["audience", "Kitle", "Kitlenin konusu, dili ve yaklaşık erişimi nedir?", TextInputStyle.Paragraph, 20, 700],
    ["proposal", "İşbirliği fikri", "FIMA ile nasıl bir creator işbirliği yapmak istiyorsun?", TextInputStyle.Paragraph, 20, 700],
    ["deliverables", "Teslimler", "Hangi içerikleri, hangi sıklıkta üretebilirsin?", TextInputStyle.Paragraph, 20, 700],
    ["brand_safety", "Marka güvenliği", "Reklam, sponsorluk ve yanıltıcı vaat sınırlarını nasıl korursun?", TextInputStyle.Paragraph, 20, 700],
    ["rights", "Kullanım hakları", "İçerik kullanım ve yeniden paylaşım beklentin nedir?", TextInputStyle.Paragraph, 10, 700],
    ["privacy", "Gizlilik", "Topluluk üyelerinin kişisel verilerini içerikte nasıl korursun?", TextInputStyle.Paragraph, 20, 700],
    ["measurement", "Başarı ölçümü", "İşbirliğinin başarısını hangi sinyallerle ölçersin?", TextInputStyle.Paragraph, 20, 700],
    ["compensation", "Koşullar", "Ücret, ürün erişimi veya karşılıklı tanıtım beklentin nedir?", TextInputStyle.Paragraph, 10, 700],
    ["contact", "İletişim", "İletişim planın ve uygun olduğun zamanlar nedir?", TextInputStyle.Paragraph, 10, 700],
    ["why", "Neden FIMA?", "Neden FIMA ile çalışmak istiyorsun?", TextInputStyle.Paragraph, 20, 700]
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
    ["why", "Neden biz?", "Neden FIMA Bot/FIMA ile çalışmak istiyorsun?", TextInputStyle.Paragraph, 20, 700]
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
    ["loyalty", "Bağlılık", "Neden FIMA Bot topluluğunu mainlemek istiyorsun?", TextInputStyle.Paragraph, 20, 700],
    ["proof", "Kanıt", "Mainer proof atmayı kabul ediyor musun?", TextInputStyle.Short, 2, 80],
    ["why", "Neden sen?", "Klanda seni öne çıkaran özellik nedir?", TextInputStyle.Paragraph, 20, 700]
  ],
  fima_support: [
    ["product", "Ürün bilgisi", "FIMA/FIMA Bot ürünleri hakkında neleri biliyorsun?", TextInputStyle.Paragraph, 20, 700],
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
const paradiseRoleCreatesInFlight = new Map();
const paradiseChannelCreatesInFlight = new Map();
const PROFILE_STORE = path.resolve(process.cwd(), "artifacts", "post-security-backlog", "3a59-verified-roblox-profiles.json");
const STATE_FALLBACK_STORE = path.resolve(process.cwd(), "artifacts", "post-security-backlog", "3a59-paradise-state-fallback.json");
const STATE_FALLBACK_LOCK_STORE = `${STATE_FALLBACK_STORE}.lock`;
const STATE_KEY = "paradise_3a59_state_v1";
const STATE_FALLBACK_LOCK_WAIT_MS = 7_500;
const STATE_FALLBACK_LOCK_STALE_MS = 30_000;
const STATE_FALLBACK_RENAME_RETRY_LIMIT = 5;
const STATE_FALLBACK_RENAME_RETRY_DELAY_MS = 35;
const EMPTY_STATE = Object.freeze({
  profiles: {}, verificationChallenges: {}, pendingTryouts: {}, pendingChallenges: {}, trainings: {},
  tournaments: {}, leaderboard: {}, leaderboards: {}, leaderboardHistory: {}, staffActivity: {}, activityChecks: {},
  whitelists: {}, giveaways: {}, rsvps: {}, relations: {}, loa: {},
  config: {}, guildConfigs: {}, ticketOptOuts: {}, transcripts: {},
  rosters: {}, lineups: {}, wars: {}, blacklists: {}, appeals: {}, bails: {},
  serverBackups: {}, realAudits: {}, setupPreviews: {},
  temporaryVoices: {}, memberLevels: {}, questionOfDay: {},
  applications: {}, applicationDrafts: {}, moderationCases: {}, securityState: {}, supportTickets: {}, paradiseLogs: {}, challengeAudits: {}
});
let lastKnownStateSnapshot = normalizeState({ config: { footerBrand: DEFAULT_FIMA_FOOTER_BRAND } });

function normalizedMutationResourceName(value) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function mutationResourceNameMatches(actual, desired) {
  return normalizedMutationResourceName(actual) === normalizedMutationResourceName(desired);
}

function exactMutationResourceNameMatches(actual, desired) {
  return String(actual || "") === String(desired || "");
}

/**
 * Serializes every Discord structure mutation per guild in this process and
 * acquires a persistent atomic lease before the callback starts. Nested calls
 * are re-entrant and keep the outer correlation/idempotency record.
 */
export async function withParadiseGuildMutationLock(guildOrId, operation, callback, options = {}) {
  return withParadiseGuildMutationLease(guildOrId, operation, callback, options);
}

export function paradiseGuildMutationLockStatus(guildId) {
  return mutationLockStatus(guildId);
}

export { paradisePersistentMutationLockStatus, updateParadiseMutationLease };

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

export function recordParadiseLeaderboardAudit(state, {
  guildId,
  action,
  actorId,
  metadata = {},
  now = new Date().toISOString()
} = {}) {
  if (!state || !guildId || !action) return state;
  state.leaderboardHistory = state.leaderboardHistory || {};
  const previous = Array.isArray(state.leaderboardHistory[guildId]) ? state.leaderboardHistory[guildId].slice(-99) : [];
  state.leaderboardHistory[guildId] = [...previous, {
    action: String(action).slice(0, 48),
    actorId: String(actorId || "system").slice(0, 32),
    at: new Date(now).toISOString(),
    metadata: structuredClone(metadata && typeof metadata === "object" ? metadata : {})
  }];
  return state;
}

async function readFallbackState() {
  try {
    return normalizeState(JSON.parse(await fs.readFile(STATE_FALLBACK_STORE, "utf8")));
  } catch {}
  try {
    return normalizeState(JSON.parse(await fs.readFile(PROFILE_STORE, "utf8")));
  } catch {
    return normalizeState({});
  }
}

function waitForFallbackStateLock(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acquireFallbackStateLock() {
  const startedAt = Date.now();
  await fs.mkdir(path.dirname(STATE_FALLBACK_STORE), { recursive: true });
  while (Date.now() - startedAt < STATE_FALLBACK_LOCK_WAIT_MS) {
    try {
      const handle = await fs.open(STATE_FALLBACK_LOCK_STORE, "wx", 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), "utf8");
      return handle;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const lockStats = await fs.stat(STATE_FALLBACK_LOCK_STORE);
        if (Date.now() - lockStats.mtimeMs > STATE_FALLBACK_LOCK_STALE_MS) {
          await fs.unlink(STATE_FALLBACK_LOCK_STORE).catch(() => {});
          continue;
        }
      } catch {}
      await waitForFallbackStateLock(20 + Math.floor(Math.random() * 30));
    }
  }
  const error = new Error("paradise_state_fallback_lock_timeout");
  error.code = "paradise_state_fallback_lock_timeout";
  throw error;
}

async function withFallbackStateLock(callback) {
  let handle = null;
  try {
    handle = await acquireFallbackStateLock();
    return await callback();
  } finally {
    await handle?.close().catch(() => {});
    if (handle) await fs.unlink(STATE_FALLBACK_LOCK_STORE).catch(() => {});
  }
}

function isTransientFallbackRenameError(error) {
  // Windows can briefly keep either the destination or the just-written
  // temporary file open (for example through Defender or an indexed handle).
  // Only retry lock-like failures; all other write failures must remain visible
  // to the caller so a state transition never appears to have succeeded.
  return ["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"].includes(error?.code);
}

async function renameFallbackStateWithRetry(temporaryPath) {
  let lastError;
  for (let attempt = 0; attempt <= STATE_FALLBACK_RENAME_RETRY_LIMIT; attempt += 1) {
    try {
      await fs.rename(temporaryPath, STATE_FALLBACK_STORE);
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientFallbackRenameError(error) || attempt === STATE_FALLBACK_RENAME_RETRY_LIMIT) {
        throw error;
      }
      await waitForFallbackStateLock(STATE_FALLBACK_RENAME_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError;
}

async function writeFallbackStateAtomically(state) {
  const directory = path.dirname(STATE_FALLBACK_STORE);
  const temporaryPath = path.join(directory, `${path.basename(STATE_FALLBACK_STORE)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await renameFallbackStateWithRetry(temporaryPath);
  } finally {
    await fs.unlink(temporaryPath).catch(() => {});
  }
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
  lastKnownStateSnapshot = await readFallbackState();
  return lastKnownStateSnapshot;
}

async function saveState(mutator) {
  let prisma;
  let row;
  try {
    ({ prisma } = await import("./db.js"));
    row = await prisma.setting.findUnique({ where: { key: STATE_KEY } });
  } catch {
    return withFallbackStateLock(async () => {
      // Always re-read after the cross-process lock is held.  A stale snapshot
      // here would silently discard another worker's application or ticket.
      const current = await readFallbackState();
      const next = normalizeState(await mutator(current) || current);
      await writeFallbackStateAtomically(next);
      lastKnownStateSnapshot = next;
      return next;
    });
  }

  const committed = await prisma.$transaction(async tx => {
  row = await tx.setting.findUnique({ where: { key: STATE_KEY } });
  const current = row?.value ? normalizeState(row.value) : await readFallbackState();
  // Keep the state transition outside the database error boundary.  A mutator
  // can close over an interaction or deliberately throw; treating that as a
  // storage outage would run it twice in the fallback path.
  const next = normalizeState(await mutator(current) || current);
    await tx.setting.upsert({ where: { key: STATE_KEY }, update: { value: next }, create: { key: STATE_KEY, value: next } });
    return next;
  }, { isolationLevel: "Serializable" });
  lastKnownStateSnapshot = committed;
  return committed;
}

export function normalizeParadiseBrandColor(value, fallback = DEFAULT_PARADISE_BRAND_COLOR) {
  const normalized = String(value || "").trim().replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? `#${normalized}` : fallback;
}

export function paradiseBrandColorInteger(value) {
  return Number.parseInt(normalizeParadiseBrandColor(value).slice(1), 16);
}

export function sanitizeParadiseHttpsUrl(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function isFimaCommunityManagedGuild(guildId) {
  const normalized = String(guildId || "");
  return normalized === PARADISE_TEST_GUILD_ID
    || normalized === FIMA_COMMUNITY_PRODUCTION_GUILD_ID;
}

export function mergeParadiseCommunityAssetDefaults(config, { guildId, mode } = {}) {
  const source = config && typeof config === "object" ? config : {};
  const next = structuredClone(source);
  if (!isFimaCommunityManagedGuild(guildId) || mode !== "community") return next;

  next.welcomeSettings = next.welcomeSettings && typeof next.welcomeSettings === "object"
    ? next.welcomeSettings
    : {};
  next.banners = next.banners && typeof next.banners === "object" ? next.banners : {};
  next.welcomeSettings.bannerUrl = sanitizeParadiseHttpsUrl(next.welcomeSettings.bannerUrl)
    || PARADISE_COMMUNITY_ASSETS.welcome;
  next.welcomeSettings.leaveBannerUrl = sanitizeParadiseHttpsUrl(next.welcomeSettings.leaveBannerUrl)
    || PARADISE_COMMUNITY_ASSETS.leave;
  next.staffTeamBannerUrl = sanitizeParadiseHttpsUrl(next.staffTeamBannerUrl)
    || PARADISE_COMMUNITY_ASSETS.staffTeam;
  next.banners.staffTeam = sanitizeParadiseHttpsUrl(next.banners.staffTeam)
    || PARADISE_COMMUNITY_ASSETS.staffTeam;
  next.videoTeamBannerUrl = sanitizeParadiseHttpsUrl(next.videoTeamBannerUrl)
    || PARADISE_COMMUNITY_ASSETS.videoTeam;
  next.banners.videoTeam = sanitizeParadiseHttpsUrl(next.banners.videoTeam)
    || PARADISE_COMMUNITY_ASSETS.videoTeam;
  return next;
}

async function paradiseBrandColor() {
  const state = await loadState();
  return paradiseBrandColorInteger(configForGuild(state, paradiseGuildContext.getStore()).brandColor);
}

function paradiseFooter(context = "", guildId = paradiseGuildContext.getStore()) {
  const footerBrand = String(configForGuild(lastKnownStateSnapshot, guildId).footerBrand || DEFAULT_FIMA_FOOTER_BRAND).trim()
    || DEFAULT_FIMA_FOOTER_BRAND;
  return { text: `${context ? `${context} • ` : ""}${footerBrand}` };
}

export function paradiseGuildContentLanguage(config = {}) {
  // Guild content is a server choice.  A dashboard visitor's personal theme or
  // language must never silently rewrite the canonical Discord panel locale.
  const raw = String(config.language || config.locale || "tr").toLowerCase();
  return raw.startsWith("en") ? "en" : "tr";
}

function guildLanguage(config = {}) {
  return paradiseGuildContentLanguage(config);
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
  "━━━━━ OWNERSHIP ━━━━━", "Owner",
  "━━━━━ STAFF ━━━━━", "Administrator", "Senior Moderator", "Moderator", "Junior Moderator", "Helper",
  "━━━━━ CREATIVE TEAM ━━━━━", "Content Creator", "Outfit Designer", "Cape Designer",
  "━━━━━ VIDEO TEAM ━━━━━", "Video Team", "Video Editor", "Thumbnail Designer",
  "━━━━━ PRODUCT SUPPORT ━━━━━", "FIMA Support", "Macro Specialist", "FFlag Specialist",
  "━━━━━ COMMUNITY ━━━━━", "Member", "Verified", "Media Trusted", "Link Trusted",
  "━━━━━ SAFETY ━━━━━", "BLACKLISTED", "Muted / Quarantined",
  "━━━━━ LANGUAGE ━━━━━", "Turkish", "English",
  "━━━━━ REGIONS ━━━━━", "Europe", "Asia", "North America", "South America", "Oceania",
  "━━━━━ PRODUCT ACCESS ━━━━━", "FIMA Customer", "FIMA Macro Customer", "FIMA AI Customer", "Lifetime Customer",
  "━━━━━ NOTIFICATIONS ━━━━━", "Product Notifications", "FIMA Updates", "FIMA Macro Updates", "FIMA AI Updates",
  "Fieel Content Notifications", "Tatu Content Notifications", "Event Notifications", "Security Alerts",
  "━━━━━ TEXT ACTIVITY ━━━━━", "Text Level 5", "Text Level 10", "Text Level 20", "Text Level 35", "Text Level 50",
  "━━━━━ VOICE ACTIVITY ━━━━━", "Voice Level 5", "Voice Level 10", "Voice Level 20", "Voice Level 35", "Voice Level 50",
  "━━━━━ BOOSTERS ━━━━━", "Booster"
];

export const PARADISE_COMMUNITY_ROLE_ICONS = Object.freeze({
  Owner: Object.freeze({ unicodeEmoji: "👑" }),
  Administrator: Object.freeze({ unicodeEmoji: "🛡️" }),
  "Senior Moderator": Object.freeze({ unicodeEmoji: "🛡️" }),
  Moderator: Object.freeze({ unicodeEmoji: "🔨" }),
  "Junior Moderator": Object.freeze({ unicodeEmoji: "🤝" }),
  Helper: Object.freeze({ unicodeEmoji: "🤝" }),
  "Content Creator": Object.freeze({ unicodeEmoji: "🎬" }),
  "Outfit Designer": Object.freeze({ unicodeEmoji: "👕" }),
  "Cape Designer": Object.freeze({ unicodeEmoji: "🦸" }),
  "Video Team": Object.freeze({ unicodeEmoji: "🎥" }),
  "Video Editor": Object.freeze({ unicodeEmoji: "✂️" }),
  "Thumbnail Designer": Object.freeze({ unicodeEmoji: "🎨" }),
  "FIMA Support": Object.freeze({ unicodeEmoji: "🎧" }),
  "Macro Specialist": Object.freeze({ unicodeEmoji: "⌨️" }),
  "FFlag Specialist": Object.freeze({ unicodeEmoji: "⚙️" }),
  Member: Object.freeze({ unicodeEmoji: "👤" }),
  Verified: Object.freeze({ unicodeEmoji: "✅" }),
  "Media Trusted": Object.freeze({ unicodeEmoji: "🖼️" }),
  "Link Trusted": Object.freeze({ unicodeEmoji: "🔗" }),
  BLACKLISTED: Object.freeze({ unicodeEmoji: "⛔" }),
  "Muted / Quarantined": Object.freeze({ unicodeEmoji: "🔇" }),
  Turkish: Object.freeze({ unicodeEmoji: "🇹🇷" }),
  English: Object.freeze({ unicodeEmoji: "🇬🇧" }),
  Europe: Object.freeze({ unicodeEmoji: "🌍" }),
  Asia: Object.freeze({ unicodeEmoji: "🌏" }),
  "North America": Object.freeze({ unicodeEmoji: "🌎" }),
  "South America": Object.freeze({ unicodeEmoji: "🌎" }),
  Oceania: Object.freeze({ unicodeEmoji: "🌏" }),
  "FIMA Customer": Object.freeze({ unicodeEmoji: "◆" }),
  "FIMA Macro Customer": Object.freeze({ unicodeEmoji: "⌨️" }),
  "FIMA AI Customer": Object.freeze({ unicodeEmoji: "🧠" }),
  "Lifetime Customer": Object.freeze({ unicodeEmoji: "♾️" }),
  "Product Notifications": Object.freeze({ unicodeEmoji: "🔔" }),
  "FIMA Updates": Object.freeze({ unicodeEmoji: "◆" }),
  "FIMA Macro Updates": Object.freeze({ unicodeEmoji: "⌨️" }),
  "FIMA AI Updates": Object.freeze({ unicodeEmoji: "🧠" }),
  "Fieel Content Notifications": Object.freeze({ unicodeEmoji: "🎬" }),
  "Tatu Content Notifications": Object.freeze({ unicodeEmoji: "🎬" }),
  "Event Notifications": Object.freeze({ unicodeEmoji: "📅" }),
  "Security Alerts": Object.freeze({ unicodeEmoji: "🚨" }),
  "Text Level 5": Object.freeze({ unicodeEmoji: "💬" }),
  "Text Level 10": Object.freeze({ unicodeEmoji: "💬" }),
  "Text Level 20": Object.freeze({ unicodeEmoji: "💬" }),
  "Text Level 35": Object.freeze({ unicodeEmoji: "💬" }),
  "Text Level 50": Object.freeze({ unicodeEmoji: "💬" }),
  "Voice Level 5": Object.freeze({ unicodeEmoji: "🎙️" }),
  "Voice Level 10": Object.freeze({ unicodeEmoji: "🎙️" }),
  "Voice Level 20": Object.freeze({ unicodeEmoji: "🎙️" }),
  "Voice Level 35": Object.freeze({ unicodeEmoji: "🎙️" }),
  "Voice Level 50": Object.freeze({ unicodeEmoji: "🎙️" }),
  Booster: Object.freeze({ unicodeEmoji: "💎" })
});

const PARADISE_COMMUNITY_EXTENDED_ROLE_ASSET_KEYS = Object.freeze({
  Owner: "owner",
  Administrator: "administrator",
  "Senior Moderator": "moderator",
  Moderator: "moderator",
  "Junior Moderator": "helper",
  Helper: "helper",
  "Content Creator": "creative",
  "Outfit Designer": "creative",
  "Cape Designer": "creative",
  "Video Team": "video-team",
  "Video Editor": "video-team",
  "Thumbnail Designer": "video-team",
  "FIMA Support": "support",
  "Macro Specialist": "macro-specialist",
  "FFlag Specialist": "support",
  Member: "member",
  Verified: "verified",
  "Media Trusted": "verified",
  "Link Trusted": "verified",
  BLACKLISTED: "safety",
  "Muted / Quarantined": "safety",
  Turkish: "language",
  English: "language",
  Europe: "region",
  Asia: "region",
  "North America": "region",
  "South America": "region",
  Oceania: "region",
  "FIMA Customer": "member",
  "FIMA Macro Customer": "macro-specialist",
  "FIMA AI Customer": "fima-ai",
  "Lifetime Customer": "verified",
  "Product Notifications": "notifications",
  "FIMA Updates": "notifications",
  "FIMA Macro Updates": "macro-specialist",
  "FIMA AI Updates": "fima-ai",
  "Fieel Content Notifications": "creative",
  "Tatu Content Notifications": "creative",
  "Event Notifications": "notifications",
  "Security Alerts": "safety",
  "Text Level 5": "member",
  "Text Level 10": "member",
  "Text Level 20": "member",
  "Text Level 35": "member",
  "Text Level 50": "member",
  "Voice Level 5": "member",
  "Voice Level 10": "member",
  "Voice Level 20": "member",
  "Voice Level 35": "member",
  "Voice Level 50": "member",
  Booster: "booster"
});

export const PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS = Object.freeze(Object.fromEntries(
  Object.entries(PARADISE_COMMUNITY_EXTENDED_ROLE_ASSET_KEYS).map(([roleName, assetKey]) => [
    roleName,
    PARADISE_COMMUNITY_VISUAL_SURFACE_PLAN.assetBindings.roleIcons[assetKey]
  ])
));

export const PARADISE_GUIDE_CATEGORY_ASSET_KEYS = Object.freeze({
  rules: "start",
  role_guide: "community",
  faq_trust: "start",
  application_guide: "personnel",
  ticket_guide: "support",
  staff_command_guide: "personnel",
  training_hoster_guide: "personnel",
  tryout_hoster_guide: "personnel",
  giveaway_event_guide: "community",
  dashboard_guide: "fima",
  fieel_style_guide: "fieel-style",
  turkish_community_guide: "turkish-community",
  voice_guide: "voice",
  moderation_policy: "support",
  report_guide: "support",
  video_team: "video-team"
});

export function paradiseCommunityGuideThumbnailUrl(
  definitionKey,
  visualPlan = PARADISE_COMMUNITY_VISUAL_SURFACE_PLAN
) {
  if (visualPlan?.liveMutationApproved !== true) return null;
  const assetKey = PARADISE_GUIDE_CATEGORY_ASSET_KEYS[definitionKey];
  return assetKey ? visualPlan.surfaces?.categoryThumbnails?.[assetKey] || null : null;
}

export function paradiseCommunityGuideThumbnailAttachment(
  definitionKey,
  visualPlan = PARADISE_COMMUNITY_VISUAL_SURFACE_PLAN
) {
  if (visualPlan?.liveMutationApproved !== true) return null;
  const assetKey = PARADISE_GUIDE_CATEGORY_ASSET_KEYS[definitionKey];
  const binding = assetKey
    ? visualPlan.assetBindings?.categoryThumbnails?.[assetKey]
    : null;
  if (!binding?.assetId || !binding?.sha256) return null;
  try {
    const asset = loadVerifiedFtCommunityVisualAsset(binding.assetId, {
      expectedUsage: "category-thumbnail"
    });
    if (asset.sha256 !== binding.sha256) return null;
    return Object.freeze({
      assetId: asset.id,
      sha256: asset.sha256,
      url: asset.attachmentUrl,
      file: Object.freeze({ attachment: asset.buffer, name: asset.filename })
    });
  } catch {
    return null;
  }
}

export function sanitizeParadiseCommunityRoleIconDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) return null;
  const hasUnicodeEmoji = Object.hasOwn(descriptor, "unicodeEmoji");
  const hasAssetId = Object.hasOwn(descriptor, "assetId");
  if (hasUnicodeEmoji === hasAssetId) return null;

  if (hasUnicodeEmoji) {
    const unicodeEmoji = String(descriptor.unicodeEmoji || "").trim();
    const allowedUnicodeEmoji = new Set(Object.values(PARADISE_COMMUNITY_ROLE_ICONS)
      .map(item => item.unicodeEmoji)
      .filter(Boolean));
    if (!allowedUnicodeEmoji.has(unicodeEmoji)) return null;
    return Object.freeze({ kind: "unicode", unicodeEmoji });
  }

  try {
    const sha256 = String(descriptor.sha256 || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
    const asset = loadVerifiedFtCommunityVisualAsset(descriptor.assetId, { expectedUsage: "role-icon" });
    if (sha256 !== asset.sha256) return null;
    return Object.freeze({
      kind: "icon",
      assetId: asset.id,
      sha256: asset.sha256,
      discordContentHash: asset.discordContentHash
    });
  } catch {
    return null;
  }
}

export const COMMUNITY_STAFF_ACCESS_ROLES = [
  "Owner", "Administrator", "Senior Moderator", "Moderator", "Junior Moderator", "Helper"
];

export const COMMUNITY_TURKISH_ACCESS_ROLES = [
  "Turkish",
  ...COMMUNITY_STAFF_ACCESS_ROLES
];

export const COMMUNITY_VIDEO_TEAM_ACCESS_ROLES = [
  "Video Team",
  ...COMMUNITY_STAFF_ACCESS_ROLES
];

export const PARADISE_DEFAULT_XP_ROLE_REWARDS = Object.freeze({
  "5": "Text Level 5",
  "10": "Text Level 10",
  "20": "Text Level 20",
  "35": "Text Level 35",
  "50": "Text Level 50"
});

export function paradiseXpPolicy(config = {}) {
  const settings = config.xpSettings && typeof config.xpSettings === "object" ? config.xpSettings : {};
  const configuredRewards = settings.roleRewards && typeof settings.roleRewards === "object" ? settings.roleRewards : {};
  return Object.freeze({
    chatCooldownSeconds: Math.max(15, Math.min(3600, Number(settings.chatCooldownSeconds) || 60)),
    levelUpDeleteSeconds: Math.max(10, Math.min(3600, Number(settings.levelUpDeleteSeconds) || 60)),
    roleRewards: Object.freeze({ ...PARADISE_DEFAULT_XP_ROLE_REWARDS, ...configuredRewards })
  });
}

export const PARADISE_ROLES = PARADISE_CLAN_ROLES;

export const PARADISE_VOICE_CHANNEL_NAMES = Object.freeze([
  "⌁・join-to-create",
  "⌁・community-voice",
  "⌁・afk",
  "〆・turkish-voice",
  "〆・video-voice",
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
    joinToCreateChannelId: find(["⌁・join-to-create", "◜・oda-oluştur", "Join to Create"]),
    communityVoiceChannelId: find(["⌁・community-voice", "◜・topluluk-sesi", "Community Voice"]),
    warVoiceChannelId: find(["◜・savaş-odası", "War VC"]),
    afkChannelId: find(["⌁・afk", "◞・afk", "AFK"]),
    privateVoiceCategoryId: guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && ["⌁・VOICE", "━━ ÖZEL SESLER ━━", "PRIVATE VOICE"].includes(channel.name))?.id || null
  };
}

async function configureParadiseAfkChannel(guild, voiceIds) {
  if (!voiceIds?.afkChannelId || typeof guild?.setAFKChannel !== "function") return false;
  await guild.setAFKChannel(voiceIds.afkChannelId, "FIMA Bot configured AFK voice channel").catch(() => null);
  return true;
}

export const PARADISE_CHANNEL_MAPPINGS = Object.freeze([
  ["start_here_channel", "Public getting-started handbook"],
  ["rules_channel", "Public rules handbook"],
  ["announcement_channel", "Public announcements handbook"],
  ["activity_rewards_channel", "Public activity and booster rewards handbook"],
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
  ["⟐・START", ["⟐・overview", "⟐・rules", "⟐・announcements", "⌁・get-roles", "⌁・faq-help"], false],
  ["⌁・COMMUNITY", ["⌁・general", "⌁・media", "⌁・events", "⌁・commands"], false],
  ["⌁・FIEEL-AND-TATU", ["⌁・content-feed", "⌁・fieel-content", "⌁・tatu-content", "⌁・collaborations"], false],
  ["⟐・FIMA", ["⟐・fima-overview", "⌁・fima-macro", "⌁・fima-ai", "⌁・fima-updates", "⌁・vouches", "⌁・support"], false],
  ["⟐・ACTIVITY", ["⌁・text-activity", "⌁・voice-activity", "⌁・activity-rewards"], false],
  ["⌁・STYLE", ["⌁・outfits", "⌁・capes"], false],
  ["⟐・APPLICATIONS", ["⌁・applications", "⌁・application-status"], false],
  ["⌁・VOICE", ["⌁・join-to-create", "⌁・community-voice", "⌁・afk"], false],
  ["〆・PRIVATE TURKISH", ["〆・turkish-chat", "〆・turkish-media", "〆・turkish-announcements", "〆・turkish-voice"], true, COMMUNITY_TURKISH_ACCESS_ROLES],
  ["〆・PRIVATE VIDEO TEAM", ["〆・video-hub", "〆・video-ideas", "〆・video-scripts", "〆・video-assets", "〆・video-review", "〆・video-upload-schedule", "〆・video-voice"], true, COMMUNITY_VIDEO_TEAM_ACCESS_ROLES],
  ["〆・PRIVATE STAFF", ["〆・staff-hub", "〆・staff-guides", "〆・staff-application-reviews", "〆・staff-logs", "〆・staff-security-logs", "〆・staff-transcripts"], true, COMMUNITY_STAFF_ACCESS_ROLES]
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
    start_here_channel: "⟐・overview", rules_channel: "⟐・rules", welcome_channel: "⟐・overview", leave_channel: "⟐・overview", roles_channel: "⌁・get-roles",
    announcement_channel: "⟐・announcements", activity_rewards_channel: "⌁・activity-rewards",
    member_help_channel: "⌁・faq-help", level_channel: "⌁・text-activity", faq_channel: "⌁・faq-help", role_guide_channel: "⌁・get-roles",
    support_ticket_channel: "⌁・support", application_ticket_channel: "⌁・applications", blacklist_appeal_channel: "⌁・support", staff_command_guide_channel: "〆・staff-hub", staff_guides_channel: "〆・staff-guides",
    application_review_channel: "〆・staff-application-reviews", moderation_requests_channel: "〆・staff-security-logs", quarantine_review_channel: "〆・staff-security-logs",
    support_transcripts_channel: "〆・staff-transcripts", challenge_transcripts_channel: "〆・staff-transcripts",
    support_logs_channel: "〆・staff-logs", application_logs_channel: "〆・staff-logs", moderation_logs_channel: "〆・staff-security-logs", activity_logs_channel: "〆・staff-logs", voice_logs_channel: "〆・staff-logs", level_logs_channel: "〆・staff-logs", blacklist_logs_channel: "〆・staff-security-logs", payout_queue_channel: "〆・staff-logs"
  },
  clan: {
    start_here_channel: "⌁・başlangıç", rules_channel: "⌁・kurallar", welcome_channel: "⌁・hoş-geldin", leave_channel: "⌁・hoş-geldin", roles_channel: "⌁・roller",
    member_help_channel: "┆・genel", level_channel: "┆・seviyeler", faq_channel: "⌁・başlangıç", role_guide_channel: "⌁・roller",
    challenge_channel: "⟡・meydan-okuma", challenge_rules_channel: "⟡・meydan-okuma", challenge_results_channel: "◆・sonuçlar", availability_channel: "⟡・müsaitlik-ve-loa", loa_channel: "⟡・müsaitlik-ve-loa",
    training_channel: "◆・aktif-oturumlar", tryout_channel: "◆・aktif-oturumlar", training_results_channel: "◆・sonuçlar", tryout_results_channel: "◆・sonuçlar",
    main_lineup_channel: "◆・lineuplar", war_lineup_channel: "◆・lineuplar", roster_channel: "◆・lineuplar", mainer_proof_channel: "◆・mainer-kanit",
    support_ticket_channel: "◇・destek", application_ticket_channel: "◇・destek", blacklist_appeal_channel: "◇・destek", staff_command_guide_channel: "〢・personel-komutları", staff_guides_channel: "〢・personel-rehberleri",
    application_review_channel: "〢・incelemeler", moderation_requests_channel: "〢・incelemeler", quarantine_review_channel: "〢・incelemeler", bail_appeal_channel: "〢・incelemeler",
    support_transcripts_channel: "〢・transcriptler", challenge_transcripts_channel: "〢・transcriptler",
    support_logs_channel: "〢・personel-logları", application_logs_channel: "〢・personel-logları", moderation_logs_channel: "〢・personel-logları", activity_logs_channel: "〢・personel-logları", voice_logs_channel: "〢・personel-logları", level_logs_channel: "〢・personel-logları", blacklist_logs_channel: "〢・personel-logları", roster_logs_channel: "〢・personel-logları", war_logs_channel: "〢・personel-logları"
  },
  tsbtr: {
    start_here_channel: "⌁・başlangıç", rules_channel: "⌁・kurallar", welcome_channel: "⌁・hoş-geldin", leave_channel: "⌁・hoş-geldin", roles_channel: "⌁・roller",
    member_help_channel: "┆・genel", level_channel: "┆・seviyeler", faq_channel: "⌁・başlangıç", role_guide_channel: "⌁・roller",
    challenge_channel: "⟡・meydan-okuma", challenge_rules_channel: "⟡・meydan-okuma", challenge_results_channel: "◆・sonuçlar", availability_channel: "⟡・müsaitlik-ve-loa", loa_channel: "⟡・müsaitlik-ve-loa",
    training_channel: "◆・aktif-oturumlar", tryout_channel: "◆・aktif-oturumlar", training_results_channel: "◆・sonuçlar", tryout_results_channel: "◆・sonuçlar",
    support_ticket_channel: "◇・destek", application_ticket_channel: "◇・destek", blacklist_appeal_channel: "◇・destek", staff_command_guide_channel: "〢・personel-komutları", staff_guides_channel: "〢・personel-rehberleri",
    application_review_channel: "〢・incelemeler", moderation_requests_channel: "〢・incelemeler", quarantine_review_channel: "〢・incelemeler", bail_appeal_channel: "〢・incelemeler",
    support_transcripts_channel: "〢・transcriptler", challenge_transcripts_channel: "〢・transcriptler",
    support_logs_channel: "〢・personel-logları", application_logs_channel: "〢・personel-logları", moderation_logs_channel: "〢・personel-logları", activity_logs_channel: "〢・personel-logları", voice_logs_channel: "〢・personel-logları", level_logs_channel: "〢・personel-logları", blacklist_logs_channel: "〢・personel-logları"
  }
});

export const PARADISE_SETUP_SCHEMAS = Object.freeze({
  community: { label: "FT Community", schema: PARADISE_COMMUNITY_SCHEMA, roles: PARADISE_COMMUNITY_ROLES },
  clan: { label: "FIMA Bot Clan", schema: PARADISE_CLAN_SCHEMA, roles: PARADISE_CLAN_ROLES },
  tsbtr: { label: "TSBTR-style Community", schema: PARADISE_TSBTR_SCHEMA, roles: PARADISE_CLAN_ROLES }
});

// Typical UTF-8 bytes decoded as Windows-1252/Latin-1. Discord accepts these
// strings, so catch them before a rebuild can persist visibly corrupted names.
const PARADISE_MOJIBAKE_PATTERN = /[\u00c2-\u00c5\u00e2\ufffd]/u;

export function inspectParadiseCanonicalTextEncoding(mode = "community") {
  const selected = PARADISE_SETUP_SCHEMAS[String(mode || "")];
  if (!selected) {
    return Object.freeze({ ready: false, code: "canonical_template_unknown", affected: Object.freeze([]) });
  }
  const affected = [];
  const check = (value, path) => {
    if (PARADISE_MOJIBAKE_PATTERN.test(String(value || ""))) affected.push(path);
  };
  check(selected.label, "label");
  selected.schema.forEach(([category, channels], categoryIndex) => {
    check(category, `categories[${categoryIndex}]`);
    channels.forEach((channel, channelIndex) => {
      check(channel, `categories[${categoryIndex}].channels[${channelIndex}]`);
    });
  });
  selected.roles.forEach((role, roleIndex) => check(role, `roles[${roleIndex}]`));
  return Object.freeze({
    ready: affected.length === 0,
    code: affected.length === 0 ? "canonical_text_encoding_verified" : "canonical_text_encoding_invalid",
    // Paths identify the broken template slot without echoing its text.
    affected: Object.freeze(affected)
  });
}

export function buildParadiseCommunityOperationalSemantics() {
  const typeFor = (categoryName, channelName) =>
    paradiseSetupChannelType(categoryName, channelName) === ChannelType.GuildVoice ? "voice" : "text";
  const categoryPurpose = (name) => {
    if (name === "〆・PRIVATE TURKISH") return "turkish";
    if (name === "〆・PRIVATE VIDEO TEAM") return "video_team";
    if (name === "〆・PRIVATE STAFF") return "staff";
    return null;
  };
  const channelPurpose = new Map([
    ["〆・turkish-chat", "turkish_chat"], ["〆・turkish-media", "turkish_media"],
    ["〆・turkish-announcements", "turkish_announcements"], ["〆・turkish-voice", "turkish_voice"],
    ["〆・video-hub", "video_hub"], ["〆・video-ideas", "video_ideas"],
    ["〆・video-scripts", "video_scripts"], ["〆・video-assets", "video_assets"],
    ["〆・video-review", "video_review"], ["〆・video-upload-schedule", "video_upload_schedule"],
    ["〆・video-voice", "video_voice"], ["〆・staff-hub", "staff_hub"],
    ["〆・staff-guides", "staff_guides"], ["〆・staff-application-reviews", "application_reviews"],
    ["〆・staff-logs", "staff_logs"], ["〆・staff-security-logs", "security_logs"],
    ["〆・staff-transcripts", "transcripts"]
  ]);
  const accessClasses = (roles = []) => [
    ...(roles.some(role => COMMUNITY_TURKISH_ACCESS_ROLES.includes(role) && role === "Turkish") ? ["turkish"] : []),
    ...(roles.some(role => COMMUNITY_VIDEO_TEAM_ACCESS_ROLES.includes(role) && role === "Video Team") ? ["video_team"] : []),
    ...(roles.some(role => COMMUNITY_STAFF_ACCESS_ROLES.includes(role)) ? ["staff"] : [])
  ];
  const privateCategories = PARADISE_COMMUNITY_SCHEMA
    .filter(([name]) => categoryPurpose(name))
    .map(([name, channels, privateCategory, accessRoles]) => ({
      purpose: categoryPurpose(name),
      private: privateCategory === true,
      accessClasses: accessClasses(accessRoles),
      channels: channels.map(channel => ({
        purpose: channelPurpose.get(channel),
        name: channel,
        type: typeFor(name, channel)
      }))
    }));
  const channelNames = PARADISE_COMMUNITY_SCHEMA.flatMap(([, channels]) => channels);
  const defaults = PARADISE_TEMPLATE_CHANNEL_DEFAULTS.community;
  return {
    identity: PARADISE_SETUP_SCHEMAS.community.label,
    publicLanguage: "en",
    privateCategories,
    channelNames,
    roleClasses: {
      staff: [...COMMUNITY_STAFF_ACCESS_ROLES],
      turkish: ["Turkish"],
      video_team: ["Video Team"]
    },
    mappings: {
      welcome: defaults.welcome_channel,
      leave: defaults.leave_channel,
      rules: defaults.rules_channel,
      announcements: defaults.announcement_channel,
      activityRewards: defaults.activity_rewards_channel,
      support: defaults.support_ticket_channel,
      applications: defaults.application_ticket_channel
    }
  };
}

const COMMUNITY_HIDDEN_COMMANDS = new Set([
  "challenge", "referee", "lineup", "roster", "mainer", "findfcw", "relation",
  "war", "spar", "training", "fighter", "profile", "leaderboard", "ranked", "autowin",
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
    new SlashCommandBuilder().setName("help").setDescription("Open or search the complete FIMA Bot command manual.")
      .addStringOption(option => option.setName("query").setDescription("Optional command or system to search for").setRequired(false)),
    new SlashCommandBuilder().setName("ticket").setDescription("FIMA Bot support ticket lifecycle")
      .addSubcommand(s => s.setName("open").setDescription("Open your private support ticket")
        .addStringOption(o => o.setName("category").setDescription("Support category for this server")
          .addChoices(...[...new Set(Object.values(PARADISE_TICKET_CATEGORY_DEFAULTS).flat().map(([id, label]) => ({ name: label, value: id })))])))
      .addSubcommand(s => s.setName("info").setDescription("Show safe status for this ticket"))
      .addSubcommand(s => s.setName("claim").setDescription("Staff: claim this ticket"))
      .addSubcommand(s => s.setName("unclaim").setDescription("Staff: release this claimed ticket"))
      .addSubcommand(s => s.setName("close").setDescription("Close this ticket and save a transcript"))
      .addSubcommand(s => s.setName("reopen").setDescription("Staff: reopen this closed ticket"))
      .addSubcommand(s => s.setName("delete").setDescription("Staff: securely delete a closed ticket"))
      .addSubcommand(s => s.setName("rename").setDescription("Staff: rename this ticket")
        .addStringOption(o => o.setName("name").setDescription("Safe channel name").setRequired(true).setMaxLength(90)))
      .addSubcommand(s => s.setName("add").setDescription("Staff: add a member to this ticket")
        .addUserOption(o => o.setName("user").setDescription("Member to add").setRequired(true)))
      .addSubcommand(s => s.setName("remove").setDescription("Staff: remove a member from this ticket")
        .addUserOption(o => o.setName("user").setDescription("Member to remove").setRequired(true)))
      .addSubcommand(s => s.setName("escalate").setDescription("Staff: mark this ticket for escalation")
        .addStringOption(o => o.setName("note").setDescription("Safe escalation note").setMaxLength(300)))
      .addSubcommand(s => s.setName("transcript").setDescription("Staff: save a redacted transcript"))
      .addSubcommand(s => s.setName("panel").setDescription("Staff: post the support ticket panel"))
      .addSubcommand(s => s.setName("config").setDescription("Admin: show the customer dashboard settings route"))
      .addSubcommand(s => s.setName("repair").setDescription("Admin: repair this ticket header in place"))
      .addSubcommand(s => s.setName("logs").setDescription("Staff: show safe lifecycle metadata")),
    new SlashCommandBuilder().setName("sendlanguagequestion").setDescription("Post English/Turkish language buttons."),
    new SlashCommandBuilder().setName("sendpingroleselector").setDescription("Post FIMA Bot notification-role selector."),
    new SlashCommandBuilder().setName("sendregionroleselector").setDescription("Post FIMA Bot region-role selector."),
    new SlashCommandBuilder().setName("welcome").setDescription("Preview the configured FIMA Bot welcome message.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
      .addSubcommand(s => s.setName("preview").setDescription("Post a safe welcome preview in this channel")),
    new SlashCommandBuilder().setName("leave").setDescription("Preview the configured FIMA Bot leave message.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
      .addSubcommand(s => s.setName("preview").setDescription("Post a safe leave preview in this channel")),
    new SlashCommandBuilder().setName("backupserverstructure").setDescription("Back up channels, roles and permission overwrites.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder().setName("previewserversetup").setDescription("Preview the full Clan/Training rebuild.")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder().setName("verifyroblox").setDescription("Verify Roblox ownership with a profile About code.")
      .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true)),
    new SlashCommandBuilder().setName("verifyrobloxcheck").setDescription("Check the short FIMA Bot code in your Roblox About."),
    new SlashCommandBuilder().setName("profile").setDescription("Create or view a verified FIMA Bot fighter profile")
      .setDescriptionLocalizations({ tr: "Doğrulanmış FIMA Bot oyuncu profili oluştur, düzenle veya görüntüle" })
      .addSubcommand(s => s.setName("create").setDescription("Verify Roblox and create your fighter profile"))
      .addSubcommand(s => s.setName("view").setDescription("View a FIMA Bot fighter profile")
        .addUserOption(o => o.setName("user").setDescription("Discord profile owner"))
        .addIntegerOption(o => o.setName("profile_id").setDescription("FIMA Bot profile ID").setMinValue(1))
        .addStringOption(o => o.setName("user_id").setDescription("Discord user ID"))
        .addStringOption(o => o.setName("roblox_name").setDescription("Exact Roblox username"))
        .addStringOption(o => o.setName("query").setDescription("Display name, nickname or Roblox name")))
      .addSubcommand(s => s.setName("edit").setDescription("Edit your profile region without changing Profile ID"))
      .addSubcommand(s => s.setName("privacy").setDescription("Choose whether other members can open your profile")
        .addStringOption(o => o.setName("visibility").setDescription("Profile visibility").setRequired(true)
          .addChoices({ name: "Public", value: "public" }, { name: "Private", value: "private" })))
      .addSubcommand(s => s.setName("verify-status").setDescription("Show your Roblox verification and profile-completion status")),
    new SlashCommandBuilder().setName("tryout").setNameLocalizations({ tr: "deneme" }).setDescription("FIMA Bot tryout system").setDescriptionLocalizations({ tr: "FIMA Bot deneme ve sonuç sistemi" })
      .addSubcommand(s => s.setName("start").setDescription("Start a tryout")
        .addStringOption(o => o.setName("link").setDescription("Roblox private server link").setRequired(true))
        .addBooleanOption(o => o.setName("ping").setDescription("Ping tryout/training members").setRequired(false)))
      .addSubcommand(s => rankOptions(s.setName("result").setDescription("Submit a structured tryout result")
        .addUserOption(o => o.setName("user").setDescription("Verified fighter").setRequired(true)))
        .addStringOption(o => o.setName("note").setDescription("Optional note").setRequired(false))),
    new SlashCommandBuilder().setName("challenge").setNameLocalizations({ tr: "meydan-okuma" }).setDescription("Verified FIMA Bot challenge system").setDescriptionLocalizations({ tr: "Doğrulanmış FIMA Bot meydan okuma sistemi" })
      .addSubcommand(s => s.setName("create").setDescription("Create a verified challenge ticket")
        .addUserOption(o => o.setName("opponent").setDescription("Verified opponent; omit to choose from eligible ranks"))
        .addStringOption(o => o.setName("region").setDescription("Match region").setRequired(false)
          .addChoices(...["Paris", "London", "Amsterdam", "Frankfurt"].map(value => ({ name: value, value })))))
      .addSubcommand(s => s.setName("result").setDescription("Submit a challenge result for approval")
        .addUserOption(o => o.setName("winner").setDescription("Winner").setRequired(true))
        .addUserOption(o => o.setName("loser").setDescription("Loser").setRequired(true))
        .addStringOption(o => o.setName("score").setDescription("Score, e.g. 10-4 or Auto").setRequired(true))
        .addUserOption(o => o.setName("co_ref").setDescription("Optional co-referee")))
      .addSubcommand(s => s.setName("post").setDescription("Post a referee score for manager approval")
        .addUserOption(o => o.setName("winner").setDescription("Winner").setRequired(true))
        .addUserOption(o => o.setName("loser").setDescription("Loser").setRequired(true))
        .addStringOption(o => o.setName("score").setDescription("Score, e.g. 10-5 or Auto").setRequired(true))
        .addIntegerOption(o => o.setName("winner_spot").setDescription("Winner leaderboard spot").setMinValue(1).setMaxValue(30))
        .addIntegerOption(o => o.setName("loser_spot").setDescription("Loser leaderboard spot").setMinValue(1).setMaxValue(30))
        .addStringOption(o => o.setName("note").setDescription("Optional referee note"))
        .addUserOption(o => o.setName("co_ref").setDescription("Optional co-referee"))
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
        .addStringOption(o => o.setName("note").setDescription("Optional staff note"))
        .addUserOption(o => o.setName("co_ref").setDescription("Optional co-referee")))
      .addSubcommand(s => s.setName("close").setDescription("Close this challenge and remove player access")
        .addStringOption(o => o.setName("reason").setDescription("Closure reason").setRequired(true))),
    new SlashCommandBuilder().setName("training").setDescription("FIMA Bot training setup, start and result")
      .setDescriptionLocalizations({ tr: "FIMA Bot eğitim kurulum, başlatma ve sonuç sistemi" })
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
    new SlashCommandBuilder().setName("tournament").setNameLocalizations({ tr: "turnuva" }).setDescription("FIMA Bot tournament system").setDescriptionLocalizations({ tr: "FIMA Bot turnuva sistemi" })
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
    new SlashCommandBuilder().setName("giveaway").setNameLocalizations({ tr: "cekilis" }).setDescription("FIMA Bot giveaway operations").setDescriptionLocalizations({ tr: "FIMA Bot çekiliş işlemleri" })
      .addSubcommand(s => s.setName("create").setDescription("Create a giveaway")
        .addStringOption(o => o.setName("prize").setDescription("Prize").setRequired(true))
        .addIntegerOption(o => o.setName("minutes").setDescription("Duration in minutes").setRequired(true).setMinValue(1).setMaxValue(43200))
        .addIntegerOption(o => o.setName("winners").setDescription("Winner count").setMinValue(1).setMaxValue(20))
        .addStringOption(o => o.setName("requirements").setDescription("Entry requirements")))
      .addSubcommand(s => s.setName("end").setDescription("End an open giveaway and choose eligible winners")
        .addStringOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true)))
      .addSubcommand(s => s.setName("reroll").setDescription("Reroll completed giveaway winners")
        .addStringOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true)))
      .addSubcommand(s => s.setName("cancel").setDescription("Cancel an open giveaway with an audit reason")
        .addStringOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Cancellation reason").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("list").setDescription("List safe recent giveaway lifecycle metadata")),
    new SlashCommandBuilder().setName("gamenight").setNameLocalizations({ tr: "oyun-gecesi" }).setDescription("FIMA Bot game night operations").setDescriptionLocalizations({ tr: "FIMA Bot oyun gecesi işlemleri" })
      .addSubcommand(s => s.setName("start").setDescription("Start a game night")
        .addStringOption(o => o.setName("game").setDescription("Game name").setRequired(true))
        .addStringOption(o => o.setName("link").setDescription("Game/server link").setRequired(true))
        .addAttachmentOption(o => o.setName("image").setDescription("Game image").setRequired(true))
        .addStringOption(o => o.setName("notes").setDescription("Rules or notes"))),
    new SlashCommandBuilder().setName("event").setNameLocalizations({ tr: "etkinlik" }).setDescription("FIMA Bot event operations").setDescriptionLocalizations({ tr: "FIMA Bot etkinlik işlemleri" })
      .addSubcommand(s => s.setName("create").setDescription("Create an event")
        .addStringOption(o => o.setName("title").setDescription("Event title").setRequired(true))
        .addStringOption(o => o.setName("time").setDescription("Time or Discord timestamp").setRequired(true))
        .addAttachmentOption(o => o.setName("image").setDescription("Event image").setRequired(true))
        .addStringOption(o => o.setName("link").setDescription("Optional link"))
        .addStringOption(o => o.setName("rules").setDescription("Rules or details"))),
    new SlashCommandBuilder().setName("referee").setNameLocalizations({ tr: "hakem" }).setDescription("FIMA Bot referee operations").setDescriptionLocalizations({ tr: "FIMA Bot hakem işlemleri" })
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
    new SlashCommandBuilder().setName("mainer").setDescription("FIMA Bot clan mainer code and guide")
      .addSubcommand(s => s.setName("set").setDescription("Set the official clan mainer code")
        .addStringOption(o => o.setName("code").setDescription("TSBCC clan mainer code").setRequired(true))
        .addStringOption(o => o.setName("region").setDescription("Official mainer region").addChoices({ name: "EU", value: "EU" }, { name: "NA", value: "NA" }, { name: "AS", value: "AS" }, { name: "SA", value: "SA" }, { name: "OCE", value: "OCE" }))
        .addChannelOption(o => o.setName("main-channel").setDescription("Official Roblox/TSB main channel")))
      .addSubcommand(s => s.setName("panel").setDescription("Create or update the canonical pinned mainer notice"))
      .addSubcommand(s => s.setName("guide").setDescription("Show the current maining guide")),
    new SlashCommandBuilder().setName("spar").setDescription("Create a controlled spar request")
      .addSubcommand(s => s.setName("request").setDescription("Request a spar against a clan or contact")
        .addStringOption(o => o.setName("opponent").setDescription("Opponent clan or contact").setRequired(true).setMaxLength(80))
        .addStringOption(o => o.setName("format").setDescription("Requested format, e.g. 5v5 FT3").setRequired(true).setMaxLength(80))
        .addStringOption(o => o.setName("region").setDescription("Preferred region").addChoices({ name: "EU", value: "EU" }, { name: "NA", value: "NA" }, { name: "AS", value: "AS" }, { name: "SA", value: "SA" }, { name: "OCE", value: "OCE" }))),
    new SlashCommandBuilder().setName("war").setDescription("Manage FIMA Bot war state and results")
      .addSubcommand(s => s.setName("create").setDescription("Create an auditable war record")
        .addStringOption(o => o.setName("opponent").setDescription("Opponent clan").setRequired(true).setMaxLength(80))
        .addStringOption(o => o.setName("format").setDescription("War format").setRequired(true).setMaxLength(80))
        .addStringOption(o => o.setName("region").setDescription("War region").addChoices({ name: "EU", value: "EU" }, { name: "NA", value: "NA" }, { name: "AS", value: "AS" }, { name: "SA", value: "SA" }, { name: "OCE", value: "OCE" })))
      .addSubcommand(s => s.setName("referee").setDescription("Assign a referee to an open war")
        .addStringOption(o => o.setName("id").setDescription("War ID").setRequired(true))
        .addUserOption(o => o.setName("user").setDescription("Referee").setRequired(true)))
      .addSubcommand(s => s.setName("score").setDescription("Record an interim war score")
        .addStringOption(o => o.setName("id").setDescription("War ID").setRequired(true))
        .addStringOption(o => o.setName("score").setDescription("Score, e.g. 3-1").setRequired(true)))
      .addSubcommand(s => s.setName("result").setDescription("Close a war with evidence")
        .addStringOption(o => o.setName("id").setDescription("War ID").setRequired(true))
        .addStringOption(o => o.setName("winner").setDescription("Winning side").setRequired(true).addChoices({ name: "FIMA Bot", value: "paradise" }, { name: "Opponent", value: "opponent" }))
        .addStringOption(o => o.setName("proof").setDescription("Evidence message or image URL").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("cancel").setDescription("Cancel an open war with an audit reason")
        .addStringOption(o => o.setName("id").setDescription("War ID").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Cancellation reason").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("logs").setDescription("Show safe recent war lifecycle metadata")),
    new SlashCommandBuilder().setName("report").setNameLocalizations({ tr: "rapor" }).setDescription("Report a staff member or hoster privately").setDescriptionLocalizations({ tr: "Personel veya hosteri özel olarak raporla" })
      .addSubcommand(s => s.setName("staff").setDescription("Open a private staff report")
        .addUserOption(o => o.setName("user").setDescription("Reported staff member").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("What happened").setRequired(true))
        .addStringOption(o => o.setName("proof").setDescription("Optional proof link"))),
    new SlashCommandBuilder().setName("findfcw").setNameLocalizations({ tr: "fcw-bul" }).setDescription("Find an opt-in clan war opponent.").setDescriptionLocalizations({ tr: "İzinli havuzdan FCW rakibi bul" })
      .addStringOption(o => o.setName("region").setDescription("EU, NA, AS, SA or OCE").setRequired(true))
      .addStringOption(o => o.setName("format").setDescription("Requested format, e.g. 5v5 FT3")),
    new SlashCommandBuilder().setName("commandchannel").setDescription("Configure where FIMA Bot commands can run")
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
    new SlashCommandBuilder().setName("branding").setDescription("Configure FIMA Bot embed appearance")
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addSubcommand(s => s.setName("color").setDescription("Set the embed side-accent color")
        .addStringOption(o => o.setName("hex").setDescription("Six-digit HEX color, e.g. #000000").setRequired(true)))
      .addSubcommand(s => s.setName("preview").setDescription("Preview FIMA Bot typography and symbols")),
    new SlashCommandBuilder().setName("relation").setDescription("Manage the FIMA Bot ally and enemy clan board")
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
    new SlashCommandBuilder().setName("lineup").setDescription("Manage FIMA Bot main and war lineup boards")
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
    new SlashCommandBuilder().setName("roster").setDescription("Manage the FIMA Bot competitive roster")
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
    new SlashCommandBuilder().setName("appeal").setDescription("Open or review a private FIMA Bot blacklist appeal")
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
    new SlashCommandBuilder().setName("answer").setDescription("Answer today's FIMA Bot clan question")
      .addStringOption(o => o.setName("answer").setDescription("Your answer").setRequired(true).setMaxLength(120)),
    new SlashCommandBuilder().setName("application").setDescription("FIMA Bot application forms and review queue")
      .addSubcommand(s => s.setName("panel").setDescription("Post the application launcher panel"))
      .addSubcommand(s => s.setName("apply").setDescription("Open an application form")
        .addStringOption(o => o.setName("type").setDescription("Application type").setRequired(true)
          .addChoices(...APPLICATION_TYPES.map(([value, name]) => ({ name, value })))))
      .addSubcommand(s => s.setName("status").setDescription("View your latest application status"))
      .addSubcommand(s => s.setName("continue").setDescription("Reply to a staff request for more information")),
    new SlashCommandBuilder().setName("mod").setDescription("FIMA Bot moderation cases and approval queue")
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
        .addStringOption(o => o.setName("id").setDescription("Case ID").setRequired(true)))
      .addSubcommand(s => s.setName("purge").setDescription("Delete a bounded number of recent messages")
        .addIntegerOption(o => o.setName("amount").setDescription("Messages to delete (1-100)").setRequired(true).setMinValue(1).setMaxValue(100)))
      .addSubcommand(s => s.setName("slowmode").setDescription("Set this channel's slowmode")
        .addIntegerOption(o => o.setName("seconds").setDescription("Seconds; 0 disables slowmode").setRequired(true).setMinValue(0).setMaxValue(21600)))
      .addSubcommand(s => s.setName("nick-reset").setDescription("Restore a member's Discord nickname")
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Audit reason").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("timeout-remove").setDescription("End a member's active timeout")
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Review reason").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("warn-remove").setDescription("Senior: revoke a recorded warning")
        .addStringOption(o => o.setName("id").setDescription("Warning case ID").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Review reason").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("case-edit").setDescription("Senior: correct the safe reason on a case")
        .addStringOption(o => o.setName("id").setDescription("Case ID").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Corrected reason").setRequired(true).setMaxLength(500)))
      .addSubcommand(s => s.setName("case-revoke").setDescription("Senior: revoke a case without deleting its audit history")
        .addStringOption(o => o.setName("id").setDescription("Case ID").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Review reason").setRequired(true).setMaxLength(500))),
    new SlashCommandBuilder().setName("channel").setDescription("FIMA Bot safe channel operations")
      .addSubcommand(s => s.setName("lock").setDescription("Lock this channel for @everyone"))
      .addSubcommand(s => s.setName("unlock").setDescription("Unlock this channel for @everyone"))
      .addSubcommand(s => s.setName("hide").setDescription("Hide this channel from @everyone"))
      .addSubcommand(s => s.setName("unhide").setDescription("Show this channel to @everyone")),
    new SlashCommandBuilder().setName("modcase").setDescription("Review FIMA Bot moderation case history")
      .addSubcommand(s => s.setName("user").setDescription("Show recent cases for a member")
        .addUserOption(o => o.setName("user").setDescription("Moderated member").setRequired(true)))
      .addSubcommand(s => s.setName("staff").setDescription("Show recent cases created by a staff member")
        .addUserOption(o => o.setName("staff").setDescription("Staff member").setRequired(true)))
      .addSubcommand(s => s.setName("weekly").setDescription("Show this server's seven-day moderation summary")),
    new SlashCommandBuilder().setName("moderation").setDescription("FIMA Bot moderation statistics")
      .addSubcommand(s => s.setName("stats").setDescription("Show seven-day and all-time moderation counts")),
    new SlashCommandBuilder().setName("security").setDescription("FIMA Bot security and quarantine controls")
      .addSubcommand(s => s.setName("panel").setDescription("Post the security status panel"))
      .addSubcommand(s => s.setName("quarantine").setDescription("Show quarantine status"))
      .addSubcommand(s => s.setName("automod").setDescription("Show active AutoMod policy")),
    new SlashCommandBuilder().setName("rank").setDescription("Show FIMA Bot chat and voice XP")
      .addUserOption(o => o.setName("user").setDescription("Member; defaults to you")),
    new SlashCommandBuilder().setName("leaderboard").setDescription("FIMA Bot XP and ranked leaderboard operations")
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
      .addSubcommand(s => s.setName("edit").setDescription("Edit a fighter's leaderboard position")
        .addUserOption(o => o.setName("user").setDescription("Fighter").setRequired(true))
        .addIntegerOption(o => o.setName("rank").setDescription("New position").setRequired(true).setMinValue(1).setMaxValue(100)))
      .addSubcommand(s => s.setName("swap").setDescription("Swap two fighters")
        .addUserOption(o => o.setName("user1").setDescription("First fighter").setRequired(true))
        .addUserOption(o => o.setName("user2").setDescription("Second fighter").setRequired(true)))
      .addSubcommand(s => s.setName("repost").setDescription("Update Top 10/20/30 boards in place"))
      .addSubcommand(s => s.setName("panel").setDescription("Post or update Top 10/20/30 boards"))
      .addSubcommand(s => s.setName("export").setDescription("Export ranked leaderboard JSON privately"))
      .addSubcommand(s => s.setName("history").setDescription("Show recent private leaderboard audit entries"))
      .addSubcommand(s => s.setName("clear").setDescription("Clear ranked leaderboard after typed confirmation")
        .addStringOption(o => o.setName("confirm").setDescription("Type CLEAR to confirm").setRequired(true).setMaxLength(8)))
      .addSubcommand(s => s.setName("import").setDescription("Import ranked leaderboard JSON")
        .addStringOption(o => o.setName("json").setDescription("Array of {userId,rank}").setRequired(true).setMaxLength(4000))),
    (() => {
      const command = new SlashCommandBuilder().setName("set").setDescription("Map FIMA Bot systems to Discord channels")
        .setDescriptionLocalizations({ tr: "FIMA Bot sistemlerini Discord kanallarına eşle" });
      command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
      for (const [name, description] of PARADISE_CHANNEL_MAPPINGS.slice(0, 25)) {
        command.addSubcommand(subcommand => subcommand.setName(name).setDescription(description)
          .addChannelOption(option => option.setName("channel").setDescription(description).addChannelTypes(ChannelType.GuildText).setRequired(true)));
      }
      return command;
    })(),
    (() => {
      const command = new SlashCommandBuilder().setName("setlogchannel").setDescription("Map FIMA Bot appeal, bail and private log channels")
        .setDescriptionLocalizations({ tr: "FIMA Bot itiraz, bail ve özel log kanallarını eşle" });
      command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
      for (const [name, description] of PARADISE_CHANNEL_MAPPINGS.slice(25, 50)) {
        command.addSubcommand(subcommand => subcommand.setName(name).setDescription(description)
          .addChannelOption(option => option.setName("channel").setDescription(description).addChannelTypes(ChannelType.GuildText).setRequired(true)));
      }
      return command;
    })(),
    (() => {
      const command = new SlashCommandBuilder().setName("setcommunitychannel").setDescription("Map additional FIMA Bot Community channels")
        .setDescriptionLocalizations({ tr: "Ek FIMA Bot Community kanallarini esle" });
      command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
      for (const [name, description] of PARADISE_CHANNEL_MAPPINGS.slice(50, 75)) {
        command.addSubcommand(subcommand => subcommand.setName(name).setDescription(description)
          .addChannelOption(option => option.setName("channel").setDescription(description).addChannelTypes(ChannelType.GuildText).setRequired(true)));
      }
      return command;
    })(),
    new SlashCommandBuilder().setName("handbook").setDescription("Post or regenerate FIMA Bot guide panels")
      .setDescriptionLocalizations({ tr: "FIMA Bot rehber panellerini gönder veya yenile" })
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addSubcommand(s => s.setName("post").setDescription("Post all guides for a setup template")
        .addStringOption(o => o.setName("template").setDescription("Guide family").setRequired(true)
          .addChoices(
            { name: "FIMA", value: "community" },
            { name: "FIMA Bot Clan", value: "clan" },
            { name: "TSBTR-style", value: "tsbtr" }
          )))
  ];
}

export async function initializeParadise(client) {
  await saveState(state => {
    if (state.config.blackThemeVersion !== 1) {
      state.config.brandColor = DEFAULT_PARADISE_BRAND_COLOR;
      state.config.blackThemeVersion = 1;
      state.config.blackThemeAppliedAt = new Date().toISOString();
    }
    state.config.footerBrand = String(state.config.footerBrand || DEFAULT_FIMA_FOOTER_BRAND).trim() || DEFAULT_FIMA_FOOTER_BRAND;
    return state;
  });
  // Discord profile changes are intentionally excluded from startup. They are
  // available only through the fresh-owner-proof profile sync routes.
  const automaticMaintenanceEnabled = String(process.env.FIMA_BOT_AUTOMATIC_MAINTENANCE_ENABLED || "")
    .trim()
    .toLowerCase() === "true";
  for (const guild of client.guilds.cache.values()) {
    await saveState(state => {
      state.guildConfigs[guild.id] = state.guildConfigs[guild.id] || structuredClone(state.config || {});
      let guildConfig = state.guildConfigs[guild.id];
      guildConfig.footerBrand = String(guildConfig.footerBrand || DEFAULT_FIMA_FOOTER_BRAND).trim() || DEFAULT_FIMA_FOOTER_BRAND;
      if (isFimaCommunityManagedGuild(guild.id) && guildConfig.activeSetupMode === "community") {
        guildConfig = mergeParadiseCommunityAssetDefaults(guildConfig, { guildId: guild.id, mode: "community" });
        state.guildConfigs[guild.id] = guildConfig;
        if (guild.id === PARADISE_TEST_GUILD_ID) state.config = structuredClone(guildConfig);
      }
      return state;
    });
    if (!isFimaCommunityManagedGuild(guild.id)) continue;
    if (!automaticMaintenanceEnabled) continue;
    await withParadiseGuildMutationLock(guild, "startup_maintenance", () =>
      paradiseGuildContext.run(guild.id, () => runParadiseMaintenance(guild))).catch(() => {});
    const timer = setInterval(() => withParadiseGuildMutationLock(guild, "scheduled_maintenance", () =>
      paradiseGuildContext.run(guild.id, () => runParadiseMaintenance(guild))).catch(() => {}), 15 * 60_000);
    timer.unref?.();
  }
}

function isOwner(interaction) {
  return interaction.guild?.ownerId === interaction.user.id;
}

async function writeArtifact(name, data) {
  const dir = path.resolve(process.cwd(), "artifacts", "post-security-backlog");
  await fs.mkdir(dir, { recursive: true });
  const artifactPath = path.resolve(dir, name);
  await fs.writeFile(artifactPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return artifactPath;
}

async function loadProfileStore() {
  return (await loadState()).profiles;
}

export function assertUniqueParadiseRobloxIdentity(profiles = {}, discordId, robloxId) {
  const conflict = Object.entries(profiles || {}).find(([storedDiscordId, storedProfile]) =>
    storedDiscordId !== String(discordId)
    && robloxId
    && String(storedProfile?.robloxId || "") === String(robloxId));
  if (!conflict) return true;
  const error = new Error("roblox_identity_already_verified");
  error.code = "roblox_identity_already_verified";
  throw error;
}

async function saveVerifiedProfile(discordId, profile) {
  let saved = null;
  await saveState(state => {
    assertUniqueParadiseRobloxIdentity(state.profiles, discordId, profile.robloxId);
    const existing = state.profiles[discordId] || {};
    saved = {
      ...existing,
      ...profile,
      discordUserId: discordId,
      createdAt: existing.createdAt || profile.verifiedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.profiles[discordId] = saved;
    ensureFimaGlobalProfileId(state, discordId);
    return state;
  });
  const profileCount = Object.keys((await loadState()).profiles || {}).length;
  await writeArtifact("3a59-verified-roblox-profiles.json", {
    status: "LOCAL VERIFIED",
    generatedAt: new Date().toISOString(),
    profileCount,
    outputPolicy: "Identity records are intentionally not written to artifacts."
  });
  return saved;
}

export async function snapshotGuild(guild) {
  await guild.channels.fetch();
  await guild.roles.fetch();
  return {
    capturedAt: new Date().toISOString(), guildId: guild.id, guildName: guild.name,
    channels: [...guild.channels.cache.values()].filter(Boolean).map(c => ({
      id: c.id, name: c.name, type: c.type, parentId: c.parentId,
      position: c.rawPosition, permissionOverwrites: [...(c.permissionOverwrites?.cache?.values() || [])].map(p => p.toJSON())
    })),
    roles: [...guild.roles.cache.values()].map(r => ({
      id: r.id, name: r.name, position: r.position, color: r.color, permissions: r.permissions.bitfield.toString(), managed: r.managed
    }))
  };
}

async function setupChooser(interaction) {
  if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("paradise_setup_select:community").setLabel("FIMA").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("paradise_setup_select:clan").setLabel("FIMA Bot Clan").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("paradise_setup_select:tsbtr").setLabel("TSBTR-style").setStyle(ButtonStyle.Secondary)
  );
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ CHOOSE A SERVER SETUP")
      .setDescription("## ◆ FIMA\nFima product, support, buyer and community server.\n\n## ◆ FIMA Bot Clan\nFocused clan, training, challenge, relations and event server.\n\n## ◆ TSBTR-style\nLarge community/leaderboard structure kept as an optional future template.\n\n-# Every choice creates a backup and a second confirmation screen before destructive work.")
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
    .setLabel(`Type REBUILD TEST ${mode.toUpperCase()}`)
    .setPlaceholder(`REBUILD TEST ${mode.toUpperCase()}`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(confirmation));
  return interaction.showModal(modal);
}

async function handleSetupFinalConfirmation(interaction, mode) {
  const expected = `REBUILD TEST ${mode.toUpperCase()}`;
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
    const result = await publishParadiseGuidesFromDashboard(interaction.guild, mode);
    const brand = mode === "community" ? "FIMA" : "FIMA Bot";
    return interaction.editReply(`${brand} handbooks regenerated: **${result.posted}** posts updated or created.`);
  }
  return setupPreview(interaction, mode);
}

const ROLE_PERMISSION_NAMES = Object.freeze({
  Owner: ["Administrator"],
  Admin: ["Administrator"],
  Administrator: ["ManageGuild", "ManageRoles", "ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "BanMembers", "ViewAuditLog"],
  Overseer: ["ManageGuild", "ManageRoles", "ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "BanMembers", "ViewAuditLog"],
  "Administration Manager": ["ManageGuild", "ManageRoles", "ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  "Head Admin": ["ManageRoles", "ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  "Senior Admin": ["ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  "Moderator Manager": ["ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  "Head Moderator": ["ManageMessages", "ModerateMembers", "KickMembers"],
  "Senior Moderator": ["ManageMessages", "ModerateMembers", "KickMembers"],
  Manager: ["ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  "Community Manager": ["ManageChannels", "ManageMessages", "ModerateMembers", "KickMembers", "ViewAuditLog"],
  Moderator: ["ManageMessages", "ModerateMembers"],
  "Junior Moderator": ["ManageMessages"],
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
  "Owner", "Admin", "Administrator", "Overseer", "Manager", "Community Manager", "Moderator", "Junior Moderator", "Helper",
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

function permissionBitfieldValue(value) {
  const raw = value?.bitfield ?? value;
  try {
    return raw === undefined || raw === null ? null : BigInt(raw);
  } catch {
    return null;
  }
}

function expectedRolePermissionBitfield(name) {
  return new PermissionsBitField(rolePermissions(name)).bitfield;
}

function paradisePermissionRepairError(code, context, cause = null) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, context);
  if (cause) error.cause = cause;
  return error;
}

export async function ensureRole(guild, name, applyPermissions = false) {
  const cachedRoles = () => [...guild.roles.cache.values()].filter(item => !item.managed);
  const findCachedRole = () => cachedRoles().find(item => exactMutationResourceNameMatches(item.name, name))
    || cachedRoles().find(item => mutationResourceNameMatches(item.name, name));
  let role = findCachedRole();
  const permissions = rolePermissions(name);
  if (!role) {
    const key = `${guild.id}:role:${normalizedMutationResourceName(name)}`;
    let creation = paradiseRoleCreatesInFlight.get(key);
    if (!creation) {
      creation = (async () => {
        const cached = findCachedRole();
        if (cached) return cached;
        return guild.roles.create({ name, permissions, reason: "3A59 FIMA Bot setup" });
      })();
      paradiseRoleCreatesInFlight.set(key, creation);
      void creation.then(
        () => { if (paradiseRoleCreatesInFlight.get(key) === creation) paradiseRoleCreatesInFlight.delete(key); },
        () => { if (paradiseRoleCreatesInFlight.get(key) === creation) paradiseRoleCreatesInFlight.delete(key); }
      );
    }
    role = await creation;
  }
  if (applyPermissions) {
    const expected = expectedRolePermissionBitfield(name);
    const actual = permissionBitfieldValue(role.permissions);
    if (actual !== expected) {
      if (role.managed || !role.editable || typeof role.setPermissions !== "function") {
        throw paradisePermissionRepairError("role_permission_repair_unavailable", {
          roleId: role.id,
          roleName: name,
          expectedPermissions: expected.toString(),
          actualPermissions: actual?.toString() ?? null
        });
      }
      try {
        await role.setPermissions(permissions, "3A59 FIMA Bot permission template");
      } catch (cause) {
        throw paradisePermissionRepairError("role_permission_repair_failed", {
          roleId: role.id,
          roleName: name,
          expectedPermissions: expected.toString(),
          actualPermissions: actual?.toString() ?? null,
          discordCode: String(cause?.code || "unknown")
        }, cause);
      }
    }
  }
  return role;
}

function paradiseRoleIconError(code, context = {}, cause = null) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, context);
  if (cause) error.cause = cause;
  return error;
}

function paradiseGuildPremiumTier(guild) {
  const direct = Number(guild?.premiumTier);
  if (Number.isFinite(direct)) return direct;
  const match = String(guild?.premiumTier || "").match(/[0-3]/);
  return match ? Number(match[0]) : 0;
}

function paradiseCurrentRoleIcon(role) {
  let iconUrl = null;
  try {
    iconUrl = role?.iconURL?.({ extension: "png", size: 256 }) || null;
  } catch {
    iconUrl = null;
  }
  return Object.freeze({
    iconHash: role?.icon || null,
    iconUrl,
    unicodeEmoji: role?.unicodeEmoji || null
  });
}

function sanitizeParadiseRoleIconEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
  const entries = [];
  for (const [roleId, record] of Object.entries(value)) {
    const safeRoleId = String(roleId || "").trim();
    const assetId = String(record?.assetId || "").trim();
    const sha256 = String(record?.sha256 || "").trim().toLowerCase();
    const iconHash = String(record?.iconHash || "").trim().toLowerCase();
    if (!/^[-_a-zA-Z0-9]{1,64}$/.test(safeRoleId)
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(assetId)
      || !/^[a-f0-9]{64}$/.test(sha256)
      || !/^(?:a_)?[a-f0-9]{32}$/.test(iconHash)) continue;
    entries.push([safeRoleId, Object.freeze({ assetId, sha256, iconHash })]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

function paradiseRoleIconMatches(current, expected, roleId, roleIconEvidence) {
  if (!expected) return !current.iconHash && !current.unicodeEmoji;
  if (expected.kind === "unicode") {
    return !current.iconHash && current.unicodeEmoji === expected.unicodeEmoji;
  }
  const evidence = roleIconEvidence[roleId];
  return !current.unicodeEmoji
    && Boolean(current.iconHash)
    && evidence?.assetId === expected.assetId
    && evidence?.sha256 === expected.sha256
    && evidence?.iconHash === current.iconHash;
}

function paradiseRoleIconMutationAvailable(role, expected, current) {
  if (!expected) return typeof role?.edit === "function";
  if (expected.kind === "unicode") {
    return current.iconHash
      ? typeof role?.edit === "function"
      : typeof role?.setUnicodeEmoji === "function" || typeof role?.edit === "function";
  }
  return current.unicodeEmoji
    ? typeof role?.edit === "function"
    : typeof role?.setIcon === "function" || typeof role?.edit === "function";
}

export function inspectParadiseRoleIconReadiness(guild, {
  roleIcons = PARADISE_COMMUNITY_ROLE_ICONS,
  visualPlan = null,
  roleIconEvidence = configForGuild(lastKnownStateSnapshot, guild?.id).roleIconEvidence
} = {}) {
  const guildId = String(guild?.id || "");
  const features = [...(guild?.features || [])].map(value => String(value));
  const premiumTier = paradiseGuildPremiumTier(guild);
  const roleIconsFeature = features.some(value => value.toUpperCase() === "ROLE_ICONS");
  const roleIconsAvailable = roleIconsFeature || premiumTier >= 2;
  const me = guild?.members?.me || null;
  let canManageRoles = false;
  try {
    canManageRoles = Boolean(me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles));
  } catch {
    canManageRoles = false;
  }
  const highestBotRolePosition = Number.isFinite(Number(me?.roles?.highest?.position))
    ? Number(me.roles.highest.position)
    : null;
  const blockers = [];
  const mismatches = [];
  const targets = [];
  const safeRoleIconEvidence = sanitizeParadiseRoleIconEvidence(roleIconEvidence);

  if (!isFimaCommunityManagedGuild(guildId)) {
    blockers.push({
      code: "managed_community_guild_only",
      guildId,
      expectedGuildIds: [PARADISE_TEST_GUILD_ID, FIMA_COMMUNITY_PRODUCTION_GUILD_ID]
    });
  }
  if (!roleIconsAvailable) {
    blockers.push({
      code: "role_icons_feature_unavailable",
      features,
      premiumTier,
      requiredFeature: "ROLE_ICONS",
      requiredPremiumTier: 2
    });
  }
  if (visualPlan && visualPlan.liveMutationApproved !== true) {
    blockers.push({
      code: "ft_community_visual_live_mutation_not_approved",
      theme: visualPlan.theme || null
    });
  }
  if (!me) blockers.push({ code: "bot_member_unavailable" });
  if (me && !canManageRoles) blockers.push({ code: "manage_roles_missing", botMemberId: me.id || null });
  if (me && highestBotRolePosition === null) blockers.push({ code: "bot_role_hierarchy_unknown", botMemberId: me.id || null });

  for (const roleName of PARADISE_COMMUNITY_ROLES) {
    const configured = roleIcons[roleName] || null;
    const expected = configured ? sanitizeParadiseCommunityRoleIconDescriptor(configured) : null;
    const matches = [...(guild?.roles?.cache?.values?.() || [])]
      .filter(role => mutationResourceNameMatches(role.name, roleName) && !role.managed);
    if (matches.length === 0) {
      blockers.push({ code: "role_icon_target_missing", roleName });
      continue;
    }
    if (matches.length > 1) {
      blockers.push({ code: "role_icon_target_ambiguous", roleName, count: matches.length });
      continue;
    }

    const role = matches[0];
    const current = paradiseCurrentRoleIcon(role);
    const matchesExpected = paradiseRoleIconMatches(current, expected, role.id, safeRoleIconEvidence);
    targets.push({
      roleId: role.id,
      roleName,
      expected,
      current,
      matches: matchesExpected
    });
    if (matchesExpected) continue;

    mismatches.push({
      roleId: role.id,
      roleName,
      expected,
      current,
      reason: expected ? "icon_mismatch" : "divider_icon_must_be_empty"
    });
    if (role.editable !== true) {
      blockers.push({ code: "role_icon_target_not_editable", roleId: role.id, roleName });
    }
    const rolePosition = Number(role.position);
    if (!Number.isFinite(rolePosition)) {
      blockers.push({ code: "role_icon_target_hierarchy_unknown", roleId: role.id, roleName });
    } else if (highestBotRolePosition !== null && rolePosition >= highestBotRolePosition) {
      blockers.push({
        code: "role_icon_target_above_bot",
        roleId: role.id,
        roleName,
        rolePosition,
        highestBotRolePosition
      });
    }
    if (!paradiseRoleIconMutationAvailable(role, expected, current)) {
      blockers.push({ code: "role_icon_mutation_unavailable", roleId: role.id, roleName });
    }
  }

  return Object.freeze({
    guildId,
    scope: "managed_fima_community_guilds",
    ready: blockers.length === 0 && mismatches.length === 0,
    canReconcile: blockers.length === 0,
    capability: Object.freeze({
      roleIconsFeature,
      roleIconsAvailable,
      premiumTier,
      canManageRoles,
      botMemberId: me?.id || null,
      highestBotRolePosition,
      visualTheme: visualPlan?.theme || null,
      visualMutationApproved: visualPlan ? visualPlan.liveMutationApproved === true : null
    }),
    targets: Object.freeze(targets),
    mismatches: Object.freeze(mismatches),
    blockers: Object.freeze(blockers),
    roleIconEvidence: safeRoleIconEvidence
  });
}

async function applyParadiseRoleIconMutation(role, expected) {
  const reason = "FIMA Community canonical role icon";
  const current = paradiseCurrentRoleIcon(role);
  if (!expected) {
    return role.edit({ icon: null, unicodeEmoji: null, reason });
  }
  if (expected.kind === "unicode") {
    if (current.iconHash || typeof role.setUnicodeEmoji !== "function") {
      return role.edit({ icon: null, unicodeEmoji: expected.unicodeEmoji, reason });
    }
    return role.setUnicodeEmoji(expected.unicodeEmoji, reason);
  }
  const asset = loadVerifiedFtCommunityVisualAsset(expected.assetId, { expectedUsage: "role-icon" });
  if (asset.sha256 !== expected.sha256 || asset.discordContentHash !== expected.discordContentHash) {
    throw paradiseRoleIconError("role_icon_asset_binding_changed", { assetId: expected.assetId });
  }
  if (current.unicodeEmoji || typeof role.setIcon !== "function") {
    return role.edit({ icon: asset.buffer, unicodeEmoji: null, reason });
  }
  return role.setIcon(asset.buffer, reason);
}

function canonicalParadiseRoleIconEvidence(guild, targets, priorEvidence, changedRoleIds = new Set()) {
  const records = {};
  for (const target of targets) {
    if (target.expected?.kind !== "icon") continue;
    const role = guild?.roles?.cache?.get?.(target.roleId);
    const current = paradiseCurrentRoleIcon(role);
    if (!current.iconHash || current.unicodeEmoji) continue;
    const priorMatches = paradiseRoleIconMatches(
      current,
      target.expected,
      target.roleId,
      priorEvidence
    );
    if (!priorMatches && !changedRoleIds.has(target.roleId)) continue;
    records[target.roleId] = {
      assetId: target.expected.assetId,
      sha256: target.expected.sha256,
      iconHash: current.iconHash
    };
  }
  return sanitizeParadiseRoleIconEvidence(records);
}

async function persistParadiseRoleIconEvidence(guildId, roleIconEvidence) {
  await saveState(next => {
    next.guildConfigs[guildId] = next.guildConfigs[guildId] || structuredClone(next.config || {});
    next.guildConfigs[guildId].roleIconEvidence = structuredClone(roleIconEvidence);
    return next;
  });
}

export async function reconcileParadiseCommunityRoleIcons(guild, options = {}) {
  const configuredRoleIcons = options.roleIcons || PARADISE_COMMUNITY_ROLE_ICONS;
  const requiresAssetEvidence = Object.values(configuredRoleIcons)
    .some(descriptor => Boolean(descriptor?.assetId));
  const evidenceWasProvided = Object.hasOwn(options, "roleIconEvidence");
  const state = requiresAssetEvidence && !evidenceWasProvided ? await loadState() : null;
  const roleIconEvidence = sanitizeParadiseRoleIconEvidence(evidenceWasProvided
    ? options.roleIconEvidence
    : configForGuild(state || lastKnownStateSnapshot, guild?.id).roleIconEvidence);
  const scopedOptions = { ...options, roleIconEvidence };
  const before = inspectParadiseRoleIconReadiness(guild, scopedOptions);
  if (!before.canReconcile) {
    return Object.freeze({
      status: "blocked",
      changed: 0,
      unchanged: before.targets.filter(target => target.matches).length,
      readiness: before,
      blockers: before.blockers,
      roleIconEvidence
    });
  }
  if (before.mismatches.length === 0) {
    const canonicalEvidence = canonicalParadiseRoleIconEvidence(
      guild,
      before.targets,
      roleIconEvidence
    );
    if (requiresAssetEvidence && !evidenceWasProvided
      && JSON.stringify(canonicalEvidence) !== JSON.stringify(roleIconEvidence)) {
      await persistParadiseRoleIconEvidence(guild.id, canonicalEvidence);
    }
    return Object.freeze({
      status: "verified",
      changed: 0,
      unchanged: before.targets.length,
      readiness: before,
      blockers: Object.freeze([]),
      roleIconEvidence: canonicalEvidence
    });
  }

  if (options.visualPlan) assertFtCommunityVisualMutationApproved(options.visualPlan);

  const changed = [];
  const changedRoleIds = new Set();
  for (const mismatch of before.mismatches) {
    const role = guild.roles.cache.get(mismatch.roleId);
    if (!role) {
      throw paradiseRoleIconError("role_icon_target_disappeared", {
        guildId: guild.id,
        roleId: mismatch.roleId,
        roleName: mismatch.roleName
      });
    }
    try {
      await applyParadiseRoleIconMutation(role, mismatch.expected);
      changed.push({
        roleId: mismatch.roleId,
        roleName: mismatch.roleName,
        expected: mismatch.expected
      });
      changedRoleIds.add(mismatch.roleId);
    } catch (cause) {
      throw paradiseRoleIconError("role_icon_reconcile_failed", {
        guildId: guild.id,
        roleId: mismatch.roleId,
        roleName: mismatch.roleName,
        expected: mismatch.expected,
        discordCode: String(cause?.code || "unknown"),
        changed
      }, cause);
    }
  }

  if (typeof guild.roles.fetch === "function") {
    try {
      await guild.roles.fetch();
    } catch (cause) {
      throw paradiseRoleIconError("role_icon_refresh_failed", {
        guildId: guild.id,
        discordCode: String(cause?.code || "unknown"),
        changed
      }, cause);
    }
  }
  const nextRoleIconEvidence = canonicalParadiseRoleIconEvidence(
    guild,
    before.targets,
    roleIconEvidence,
    changedRoleIds
  );
  const after = inspectParadiseRoleIconReadiness(guild, {
    ...scopedOptions,
    roleIconEvidence: nextRoleIconEvidence
  });
  if (!after.ready) {
    throw paradiseRoleIconError("role_icon_verification_failed", {
      guildId: guild.id,
      changed,
      readiness: after
    });
  }
  if (requiresAssetEvidence && !evidenceWasProvided) {
    try {
      await persistParadiseRoleIconEvidence(guild.id, nextRoleIconEvidence);
    } catch (cause) {
      throw paradiseRoleIconError("role_icon_evidence_persist_failed", {
        guildId: guild.id,
        changed
      }, cause);
    }
  }
  return Object.freeze({
    status: "verified",
    changed: changed.length,
    unchanged: after.targets.length - changed.length,
    changes: Object.freeze(changed),
    readiness: after,
    blockers: Object.freeze([]),
    roleIconEvidence: nextRoleIconEvidence
  });
}

export function inspectParadiseCommunityExtendedRoleIconReadiness(
  guild,
  options = {}
) {
  const visualPlan = options.visualPlan || PARADISE_COMMUNITY_VISUAL_SURFACE_PLAN;
  return inspectParadiseRoleIconReadiness(guild, {
    ...options,
    roleIcons: PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS,
    visualPlan
  });
}

export async function reconcileParadiseCommunityExtendedRoleIcons(
  guild,
  options = {}
) {
  const visualPlan = options.visualPlan || PARADISE_COMMUNITY_VISUAL_SURFACE_PLAN;
  return reconcileParadiseCommunityRoleIcons(guild, {
    ...options,
    roleIcons: PARADISE_COMMUNITY_EXTENDED_ROLE_ICONS,
    visualPlan
  });
}

async function ensureSetupChannel(guild, { name, type, parent = null, reason }) {
  const cachedChannels = () => [...guild.channels.cache.values()].filter(item => item.type === type);
  const findCachedChannel = () => cachedChannels().find(item => exactMutationResourceNameMatches(item.name, name))
    || cachedChannels().find(item => mutationResourceNameMatches(item.name, name));
  let channel = findCachedChannel();
  if (channel) return channel;
  const key = `${guild.id}:channel:${type}:${normalizedMutationResourceName(name)}`;
  let creation = paradiseChannelCreatesInFlight.get(key);
  if (!creation) {
    creation = (async () => {
      const cached = findCachedChannel();
      if (cached) return cached;
      return guild.channels.create({ name, type, parent, reason });
    })();
    paradiseChannelCreatesInFlight.set(key, creation);
    void creation.then(
      () => { if (paradiseChannelCreatesInFlight.get(key) === creation) paradiseChannelCreatesInFlight.delete(key); },
      () => { if (paradiseChannelCreatesInFlight.get(key) === creation) paradiseChannelCreatesInFlight.delete(key); }
    );
  }
  channel = await creation;
  return channel;
}

async function editParadiseCategoryOverwrite(category, target, permissions, context) {
  if (!category?.permissionOverwrites?.edit) {
    throw paradisePermissionRepairError("category_permission_repair_unavailable", context);
  }
  try {
    await category.permissionOverwrites.edit(target, permissions, {
      reason: "FIMA canonical category visibility template"
    });
  } catch (cause) {
    throw paradisePermissionRepairError("category_permission_repair_failed", {
      ...context,
      discordCode: String(cause?.code || "unknown")
    }, cause);
  }
}

async function editParadiseChannelOverwrite(channel, target, permissions, context) {
  if (!channel?.permissionOverwrites?.edit) {
    throw paradisePermissionRepairError("channel_permission_repair_unavailable", context);
  }
  try {
    await channel.permissionOverwrites.edit(target, permissions, {
      reason: "FIMA canonical private channel permissions"
    });
  } catch (cause) {
    throw paradisePermissionRepairError("channel_permission_repair_failed", {
      ...context,
      discordCode: String(cause?.code || "unknown")
    }, cause);
  }
}

export async function repairParadiseCommunityChannelPermissions(
  guild,
  channel,
  channelName,
  categoryName
) {
  const normalizedChannel = normalizedMutationResourceName(channelName || channel?.name);
  const normalizedCategory = normalizedMutationResourceName(categoryName);
  const isTurkish = normalizedCategory === normalizedMutationResourceName("〆・PRIVATE TURKISH");
  const isVideo = normalizedCategory === normalizedMutationResourceName("〆・PRIVATE VIDEO TEAM");
  const isAnnouncements = isTurkish
    && normalizedChannel === normalizedMutationResourceName("〆・turkish-announcements");
  const isPrivateVoice = channel?.type === ChannelType.GuildVoice && (isTurkish || isVideo);
  if (!isAnnouncements && !isPrivateVoice) return;

  const accessRoleNames = isTurkish
    ? COMMUNITY_TURKISH_ACCESS_ROLES
    : COMMUNITY_VIDEO_TEAM_ACCESS_ROLES;
  const everyonePermissions = {
    ViewChannel: false,
    ...(isAnnouncements ? { SendMessages: false } : {}),
    ...(isPrivateVoice ? { Connect: false } : {})
  };
  await editParadiseChannelOverwrite(channel, guild.roles.everyone, everyonePermissions, {
    channelId: channel?.id,
    channelName,
    targetId: guild.roles.everyone?.id,
    targetName: "@everyone"
  });

  for (const roleName of accessRoleNames) {
    const role = guild.roles.cache.find(item => item.name === roleName && !item.managed);
    if (!role) continue;
    const staff = COMMUNITY_STAFF_ACCESS_ROLES.includes(roleName);
    const permissions = {
      ViewChannel: true,
      ...(isAnnouncements ? { SendMessages: staff } : {}),
      ...(isPrivateVoice ? { Connect: true } : {})
    };
    await editParadiseChannelOverwrite(channel, role, permissions, {
      channelId: channel.id,
      channelName,
      targetId: role.id,
      targetName: roleName
    });
  }
}

export async function repairParadiseCategoryVisibilityPermissions(
  guild,
  category,
  roleNames,
  privateCategory,
  accessRoleNames = null
) {
  await editParadiseCategoryOverwrite(
    category,
    guild.roles.everyone,
    { ViewChannel: privateCategory ? false : null },
    {
      categoryId: category?.id,
      categoryName: category?.name,
      targetId: guild.roles.everyone?.id,
      targetName: "@everyone",
      expectedView: privateCategory ? "deny" : "inherit"
    }
  );
  if (!privateCategory) return;
  const explicitAccess = Array.isArray(accessRoleNames);
  const allowedRoleNames = explicitAccess
    ? new Set(accessRoleNames)
    : PRIVATE_ACCESS_ROLES;
  for (const roleName of roleNames.filter(name => allowedRoleNames.has(name))) {
    const role = guild.roles.cache.find(item => item.name === roleName && !item.managed);
    if (!role) continue;
    await editParadiseCategoryOverwrite(category, role, { ViewChannel: true }, {
      categoryId: category.id,
      categoryName: category.name,
      targetId: role.id,
      targetName: roleName,
      expectedView: "allow"
    });
  }
  if (!explicitAccess) return;
  for (const roleName of roleNames.filter(name => !allowedRoleNames.has(name))) {
    const role = guild.roles.cache.find(item => item.name === roleName && !item.managed);
    if (!role) continue;
    await editParadiseCategoryOverwrite(category, role, { ViewChannel: null }, {
      categoryId: category.id,
      categoryName: category.name,
      targetId: role.id,
      targetName: roleName,
      expectedView: "inherit"
    });
  }
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
    }, { reason: "FIMA Bot blacklist appeal visibility" }).catch(() => {});
    await channel.permissionOverwrites.edit(blacklisted, {
      ViewChannel: true,
      SendMessages: false,
      AddReactions: false,
      ReadMessageHistory: true
    }, { reason: "FIMA Bot blacklist appeal visibility" }).catch(() => {});
    for (const roleName of staffRoles) {
      const role = guild.roles.cache.find(item => item.name === roleName);
      if (role) await channel.permissionOverwrites.edit(role, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      }, { reason: "FIMA Bot blacklist staff review visibility" }).catch(() => {});
    }
    return;
  }

  if (staffOnly.has(name)) {
    await channel.permissionOverwrites.edit(guild.roles.everyone, {
      ViewChannel: false,
      SendMessages: false,
      AddReactions: false
    }, { reason: "FIMA Bot staff-only blacklist review visibility" }).catch(() => {});
    for (const roleName of staffRoles) {
      const role = guild.roles.cache.find(item => item.name === roleName);
      if (role) await channel.permissionOverwrites.edit(role, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      }, { reason: "FIMA Bot staff-only blacklist review visibility" }).catch(() => {});
    }
    return;
  }

  if (publicReadOnly.has(name)) {
    await channel.permissionOverwrites.edit(guild.roles.everyone, {
      ViewChannel: true,
      SendMessages: false,
      AddReactions: false,
      ReadMessageHistory: true
    }, { reason: "FIMA Bot public blacklist board read-only" }).catch(() => {});
  }
}

async function ensureCommunityProgressionPermissions(guild, channel, channelName, { mode, privateCategory = false } = {}) {
  if (mode !== "community" || privateCategory || !channel?.isTextBased?.()) return;
  const normalized = String(channelName || channel.name || "").toLowerCase();
  const mediaChannel = /(?:^|[-_・])(?:media|medya|uploads?)(?:$|[-_・])/.test(normalized);
  const everyone = guild.roles.everyone;
  const mediaTrusted = guild.roles.cache.find(role => role.name === "Media Trusted");
  const linkTrusted = guild.roles.cache.find(role => role.name === "Link Trusted");
  const mediaApproved = guild.roles.cache.find(role => role.name === "Media Approved");
  const linksApproved = guild.roles.cache.find(role => role.name === "Links Approved");
  const legacyApproved = guild.roles.cache.find(role => role.name === "Media & Links Approved");
  // Members may share media only in the dedicated media channel until their
  // level/manual trust role opens it elsewhere. Links remain protected by the
  // runtime scam/invite guard even once Link Trusted is granted.
  await channel.permissionOverwrites.edit(everyone, { AttachFiles: mediaChannel ? true : false, EmbedLinks: false }, { reason: "FIMA Bot level-based media/link baseline" }).catch(() => {});
  for (const role of [mediaTrusted, mediaApproved, legacyApproved].filter(Boolean)) {
    await channel.permissionOverwrites.edit(role, { AttachFiles: true }, { reason: "FIMA Bot Media Trusted progression" }).catch(() => {});
  }
  for (const role of [linkTrusted, linksApproved, legacyApproved].filter(Boolean)) {
    await channel.permissionOverwrites.edit(role, { EmbedLinks: true }, { reason: "FIMA Bot Link Trusted progression" }).catch(() => {});
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

const PARADISE_AUTOMOD_RULE_SUFFIXES = Object.freeze({
  link: "Invite & Scam Link Guard",
  mention: "Mention Spam Guard"
});

export function paradiseAutoModRuleNamesForTemplate(template = "clan") {
  const brand = template === "community" ? "FIMA" : "FIMA Bot";
  const desired = Object.fromEntries(Object.entries(PARADISE_AUTOMOD_RULE_SUFFIXES)
    .map(([key, suffix]) => [key, `${brand} ${suffix}`]));
  const managed = [...new Set(Object.values(PARADISE_AUTOMOD_RULE_SUFFIXES)
    .flatMap(suffix => [`FIMA ${suffix}`, `FIMA Bot ${suffix}`, `Paradise ${suffix}`]))];
  return Object.freeze({ brand, ...desired, managed: Object.freeze(managed) });
}

export function planParadiseAutoModRuleReconciliation(ruleNames = [], template = "clan") {
  const policy = paradiseAutoModRuleNamesForTemplate(template);
  const existing = [...new Set(ruleNames.map(name => String(name || "").trim()).filter(Boolean))];
  const rules = Object.entries(PARADISE_AUTOMOD_RULE_SUFFIXES).map(([key, suffix]) => {
    const desiredName = policy[key];
    const managedForRule = [`FIMA ${suffix}`, `FIMA Bot ${suffix}`, `Paradise ${suffix}`];
    const matches = managedForRule.filter(name => existing.includes(name));
    const primary = matches.includes(desiredName) ? desiredName : (matches[0] || null);
    return Object.freeze({
      key,
      desiredName,
      existingName: primary,
      action: !primary ? "create" : (primary === desiredName ? "keep" : "rename"),
      duplicateNames: Object.freeze(matches.filter(name => name !== primary))
    });
  });
  return Object.freeze({ brand: policy.brand, managedNames: policy.managed, rules: Object.freeze(rules) });
}

async function ensureParadiseAutoMod(guild) {
  const rules = await guild.autoModerationRules.fetch().catch(() => null);
  if (!rules) return { status: "unavailable" };
  const state = await loadState();
  const guildConfig = configForGuild(state, guild.id);
  const config = guildConfig.automod || {};
  const template = guildConfig.activeSetupMode || "clan";
  const policy = paradiseAutoModRuleNamesForTemplate(template);
  const reconciliation = planParadiseAutoModRuleReconciliation([...rules.values()].map(rule => rule.name), template);
  const managedNames = new Set(reconciliation.managedNames);
  const reasonBrand = policy.brand;
  if (config.enabled === false) {
    for (const rule of rules.values()) {
      if (managedNames.has(rule.name)) await rule.edit({ enabled: false, reason: `${reasonBrand} dashboard AutoMod disabled` }).catch(() => {});
    }
    return { status: "disabled" };
  }
  // Approval/trusted roles may unlock ordinary media/link posting, but they do
  // not bypass the server-wide invite and scam guard.
  const exemptRoleIds = (template === "community"
    ? ["Owner", "Administrator", "Senior Moderator"]
    : ["Owner", "Admin", "Overseer"])
    .map(name => guild.roles.cache.find(role => role.name === name)?.id).filter(Boolean);
  const logChannel = guild.channels.cache.find(channel => ["mod-logs", "〆・staff-security-logs"].includes(channel.name));
  const actions = [{ type: AutoModerationActionType.BlockMessage, metadata: { customMessage: "That link is not allowed here. Use an approved media/ticket channel or ask staff." } }];
  if (logChannel) actions.push({ type: AutoModerationActionType.SendAlertMessage, metadata: { channel: logChannel.id } });
  const keywords = [];
  if (config.blockInvites !== false) keywords.push("*discord.gg/*", "*discord.com/invite/*", "*discordapp.com/invite/*");
  if (config.blockScamKeywords !== false) keywords.push("*free nitro*", "*steam gift*", "*claim reward*", "*verify account here*", "*limited gift*");
  const rulesByName = new Map([...rules.values()].map(rule => [rule.name, rule]));
  const errors = [];
  let created = 0;
  let migrated = 0;
  let duplicatesDisabled = 0;

  const reconcileRule = async (key, createOptions, shouldEnable = true) => {
    const planned = reconciliation.rules.find(item => item.key === key);
    if (!planned) return;
    const primary = planned.existingName ? rulesByName.get(planned.existingName) : null;
    if (!shouldEnable) {
      for (const name of [planned.existingName, ...planned.duplicateNames].filter(Boolean)) {
        const rule = rulesByName.get(name);
        if (rule?.enabled !== false) await rule.edit({ enabled: false, reason: `${reasonBrand} AutoMod policy disabled this guard` })
          .catch(error => errors.push({ key, action: "disable", code: error.code || error.message }));
      }
      return;
    }
    if (planned.action === "create") {
      await guild.autoModerationRules.create({ ...createOptions, name: planned.desiredName, enabled: true })
        .then(() => { created += 1; })
        .catch(error => errors.push({ key, action: "create", code: error.code || error.message }));
    } else if (planned.action === "rename" && primary) {
      await primary.edit({ name: planned.desiredName, enabled: true, reason: `${reasonBrand} template AutoMod brand migration` })
        .then(() => { migrated += 1; })
        .catch(error => errors.push({ key, action: "rename", code: error.code || error.message }));
    } else if (primary?.enabled === false) {
      await primary.edit({ enabled: true, reason: `${reasonBrand} dashboard AutoMod enabled` })
        .catch(error => errors.push({ key, action: "enable", code: error.code || error.message }));
    }
    for (const name of planned.duplicateNames) {
      const duplicate = rulesByName.get(name);
      if (duplicate?.enabled !== false) await duplicate.edit({ enabled: false, reason: `${reasonBrand} AutoMod duplicate disabled after safe migration` })
        .then(() => { duplicatesDisabled += 1; })
        .catch(error => errors.push({ key, action: "disable_duplicate", code: error.code || error.message }));
    }
  };

  await reconcileRule("link", {
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerType: AutoModerationRuleTriggerType.Keyword,
    triggerMetadata: { keywordFilter: keywords },
    actions,
    exemptRoles: exemptRoleIds,
    reason: `${reasonBrand} anti-scam and invite-link protection`
  }, keywords.length > 0);
  await reconcileRule("mention", {
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerType: AutoModerationRuleTriggerType.MentionSpam,
    triggerMetadata: { mentionTotalLimit: Math.min(50, Math.max(3, Number(config.mentionSpamLimit) || 8)), mentionRaidProtectionEnabled: true },
    actions,
    exemptRoles: exemptRoleIds,
    reason: `${reasonBrand} mention-spam protection`
  });
  return {
    status: errors.length ? "partial" : "configured",
    rules: [...rules.values()].length + created,
    created,
    migrated,
    duplicatesDisabled,
    errors
  };
}

async function applyServerSetup(interaction, mode, destructive = true) {
  return withParadiseGuildMutationLock(
    interaction.guild,
    destructive ? "interactive_rebuild" : "interactive_repair",
    async () => {
      await updateParadiseMutationLease({ phase: destructive ? "interactive_rebuild" : "interactive_repair" });
      return applyServerSetupUnlocked(interaction, mode, destructive);
    },
    {
      purposeKey: destructive ? "discord_template_rebuild" : "discord_template_repair",
      idempotencyKey: `${interaction.guildId}:${mode}:${destructive ? "rebuild" : "repair"}:${interaction.id || crypto.randomUUID()}`,
      phase: "request_validated"
    }
  );
}

async function applyServerSetupUnlocked(interaction, mode, destructive = true) {
  if (!isOwner(interaction) || interaction.guildId !== PARADISE_TEST_GUILD_ID) {
    return interaction.reply({ content: "Blocked: wrong guild or non-owner.", ephemeral: true });
  }
  assertParadiseTestGuildMutation({ guildId: interaction.guildId, operation: destructive ? "rebuild" : "repair" });
  const selected = PARADISE_SETUP_SCHEMAS[mode];
  if (!selected) return interaction.reply({ content: "Blocked: unknown setup template.", ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  if (destructive) {
    const result = await rebuildParadiseTemplateUnlocked(
      interaction.guild,
      mode,
      `REBUILD TEST ${mode.toUpperCase()}`,
      PARADISE_TEST_REBUILD_POLICY
    );
    return interaction.editReply(result.status === "LIVE DISCORD VERIFIED"
      ? `${selected.label} rebuild verified against the live test-guild structure.`
      : `${selected.label} rebuild finished but live verification failed. Review the rebuild artifact before retrying.`);
  }
  const snapshot = await snapshotGuild(interaction.guild);
  await writeArtifact("3a59-discord-test-server-backup.json", snapshot);
  for (const name of selected.roles) await ensureRole(interaction.guild, name, true);
  const desiredNames = new Set(selected.schema.flatMap(([category, channels]) => [category, ...channels]));
  const wrongTypeChannelIds = new Set();
  const wrongTypeChannels = [];
  for (const [categoryName, channelNames, privateCategory, accessRoleNames] of selected.schema) {
    let category = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === categoryName);
    if (!category) category = await ensureSetupChannel(interaction.guild, {
      name: categoryName, type: ChannelType.GuildCategory, reason: "3A59 FIMA Bot setup"
    });
    await repairParadiseCategoryVisibilityPermissions(
      interaction.guild,
      category,
      selected.roles,
      privateCategory,
      accessRoleNames
    );
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
        channel = await ensureSetupChannel(interaction.guild, {
          name: channelName, type: expectedType,
          parent: category.id, reason: "3A59 FIMA Bot setup"
        });
      } else if (channel.parentId !== category.id) await channel.setParent(category.id, { lockPermissions: privateCategory });
      await ensureBlacklistVisibility(interaction.guild, channel, channelName, selected.roles).catch(() => {});
      await ensureCommunityProgressionPermissions(interaction.guild, channel, channelName, { mode, privateCategory });
      if (mode === "community") {
        await repairParadiseCommunityChannelPermissions(interaction.guild, channel, channelName, categoryName);
      }
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
  const roleIcons = mode === "community"
    ? await reconcileParadiseCommunityExtendedRoleIcons(interaction.guild)
    : { status: "not_applicable", changed: 0, blockers: [] };
  await applyParadiseTemplateChannelMappings(interaction.guild, mode);
  const autoMod = await ensureParadiseAutoMod(interaction.guild).catch(error => ({ status: "failed", error: error.message }));
  const guideResult = await publishAllGuides(interaction.guild, mode).catch(() => ({
    posted: 0,
    verified: 0,
    required: 1,
    ready: false,
    mode,
    details: [sanitizeParadiseMessageReadback(failedParadiseMessageReadback({ reason: "publisher_failed" }), "guides")]
  }));
  if (mode !== "community") {
    await updateRelationsPanel(interaction.guild).catch(() => {});
    await updateAvailabilityPanel(interaction.guild).catch(() => {});
    await updateLoaPanel(interaction.guild).catch(() => {});
  }
  const staffResult = await updateStaffTeamEmbed(interaction.guild, mode)
    .catch(() => failedParadiseMessageReadback({ reason: "publisher_failed" }));
  const voiceIds = paradiseVoiceSetupIds(interaction.guild);
  await configureParadiseAfkChannel(interaction.guild, voiceIds);
  await interaction.guild.channels.fetch?.();
  await interaction.guild.roles.fetch?.();
  const structureVerification = verifyParadiseTemplateStructure(interaction.guild, selected);
  const liveReady = structureVerification.ready && guideResult.ready && staffResult.ready;
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
      wrongChannelTypes: wrongTypeChannels,
      roleIconStatus: roleIcons.status,
      roleIconBlockers: roleIcons.blockers || []
    };
    config.autoActivityChecks = true;
    config.autoActivityRoleRemoval = true;
    config.weeklyQuotas = config.weeklyQuotas || WEEKLY_QUOTAS;
    config.voiceSettings = { ...(config.voiceSettings || {}), ...voiceIds };
    if (interaction.guildId === PARADISE_TEST_GUILD_ID) state.config = structuredClone(config);
    return state;
  });
  await writeArtifact(`3a59-discord-${mode}-setup-live.json`, {
    status: liveReady ? "LIVE DISCORD VERIFIED" : "LIVE DISCORD FAILED",
    completedAt: new Date().toISOString(), operation: destructive ? "rebuild" : "repair",
    guildId: interaction.guildId, template: selected.label, categories: selected.schema.length,
    channels: selected.schema.reduce((n, [, rows]) => n + rows.length, 0), roles: selected.roles.length,
    wrongChannelTypes: wrongTypeChannels.map(item => ({ name: item.name, actualType: item.actualType, expectedType: item.expectedType })),
    roleIcons,
    autoMod,
    guideReadback: {
      posted: guideResult.posted,
      verified: guideResult.verified,
      required: guideResult.required,
      ready: guideResult.ready,
      details: guideResult.details
    },
    staffReadback: sanitizeParadiseMessageReadback(staffResult),
    structureVerification
  });
  return interaction.editReply(liveReady
    ? `${selected.label} repair is live-verified. No extra channel or role was deleted.`
    : `${selected.label} repair ran, but live permission/structure verification failed. No extra channel or role was deleted.`);
}

export async function applyParadiseTemplateMissingOnly(guild, mode, options = {}) {
  return withParadiseGuildMutationLock(guild, "create_missing", async () => {
    await updateParadiseMutationLease({ phase: options.repairPermissions ? "repairing_permissions" : "creating_missing_resources" });
    return applyParadiseTemplateMissingOnlyUnlocked(guild, mode, options);
  }, {
    purposeKey: options.repairPermissions ? "discord_template_repair" : "discord_create_missing",
    idempotencyKey: `${guild?.id}:${mode}:create-missing:${options.repairPermissions === true}`,
    phase: "request_validated"
  });
}

async function applyParadiseTemplateMissingOnlyUnlocked(guild, mode, {
  repairPermissions = true,
  mutationPolicy = PARADISE_TEST_REBUILD_POLICY
} = {}) {
  assertParadiseMutationPolicy(guild, mode, null, mutationPolicy, { confirmationRequired: false });
  const selected = PARADISE_SETUP_SCHEMAS[mode];
  if (!selected) {
    const error = new Error("invalid_template");
    error.code = "invalid_template";
    throw error;
  }

  const snapshot = await snapshotGuild(guild);
  await writeArtifact(`${mutationPolicy.artifactPrefix}-create-missing-backup.json`, snapshot);
  const beforeChannelIds = new Set(guild.channels.cache.keys());
  const beforeRoleIds = new Set(guild.roles.cache.keys());
  const wrongTypeChannels = [];

  const roleNamesToEnsure = repairPermissions
    ? selected.roles
    : selected.roles.filter(name => !guild.roles.cache.some(role => role.name === name));
  const roleCreationFailures = [];
  for (const name of roleNamesToEnsure) {
    try {
      await ensureRole(guild, name, repairPermissions);
    } catch (error) {
      roleCreationFailures.push({
        name,
        code: String(error?.code || "role_create_failed"),
        roleId: error?.roleId || null,
        expectedPermissions: error?.expectedPermissions ?? null,
        actualPermissions: error?.actualPermissions ?? null,
        discordCode: error?.discordCode || null
      });
    }
  }
  if (roleCreationFailures.length) {
    const error = new Error("template_role_creation_failed");
    error.code = "template_role_creation_failed";
    error.failures = roleCreationFailures;
    throw error;
  }

  for (const [categoryName, channelNames, privateCategory, accessRoleNames] of selected.schema) {
    let category = guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && channel.name === categoryName);
    if (!category) {
      category = await ensureSetupChannel(guild, {
        name: categoryName,
        type: ChannelType.GuildCategory,
        reason: `${mutationPolicy.auditReason} create-missing`
      });
    }
    if (repairPermissions) {
      await repairParadiseCategoryVisibilityPermissions(
        guild,
        category,
        selected.roles,
        privateCategory,
        accessRoleNames
      );
    }
    for (const channelName of channelNames) {
      const expectedType = paradiseSetupChannelType(categoryName, channelName);
      let channel = guild.channels.cache.find(item => item.name === channelName && item.type === expectedType);
      const wrongType = guild.channels.cache.find(item => item.name === channelName && paradiseSetupChannelTypeMismatch(item, categoryName, channelName));
      if (wrongType) wrongTypeChannels.push({ name: channelName, actualType: wrongType.type, expectedType });
      if (!channel) {
        channel = await ensureSetupChannel(guild, {
          name: channelName,
          type: expectedType,
          parent: category.id,
          reason: `${mutationPolicy.auditReason} create-missing`
        });
      } else if (channel.parentId !== category.id) {
        await channel.setParent(category.id, { lockPermissions: privateCategory }).catch(() => {});
      }
      await ensureBlacklistVisibility(guild, channel, channelName, selected.roles).catch(() => {});
      if (repairPermissions) await ensureCommunityProgressionPermissions(guild, channel, channelName, { mode, privateCategory });
      if (mode === "community" && repairPermissions) {
        await repairParadiseCommunityChannelPermissions(guild, channel, channelName, categoryName);
      }
    }
  }

  if (repairPermissions) {
    await organizeRoleHierarchy(guild, selected.roles);
  }
  const roleIcons = mode === "community" && repairPermissions
    ? await reconcileParadiseCommunityExtendedRoleIcons(guild)
    : { status: "not_requested", changed: 0, blockers: [] };
  const autoMod = repairPermissions
    ? await ensureParadiseAutoMod(guild).catch(error => ({ status: "failed", error: error.message }))
    : { status: "not_requested" };
  const mappedChannels = await applyParadiseTemplateChannelMappings(guild, mode);
  const guideResult = await publishAllGuides(guild, mode).catch(() => ({
    posted: 0,
    verified: 0,
    required: 1,
    ready: false,
    mode,
    details: [sanitizeParadiseMessageReadback(failedParadiseMessageReadback({ reason: "publisher_failed" }), "guides")]
  }));
  if (mode !== "community") {
    await updateRelationsPanel(guild).catch(() => {});
    await updateAvailabilityPanel(guild).catch(() => {});
    await updateLoaPanel(guild).catch(() => {});
    await updateRankedLeaderboardBoards(guild).catch(() => {});
  }
  const staffResult = await updateStaffTeamEmbed(guild, mode)
    .catch(() => failedParadiseMessageReadback({ reason: "publisher_failed" }));
  const voiceIds = paradiseVoiceSetupIds(guild);
  await configureParadiseAfkChannel(guild, voiceIds);
  await guild.channels.fetch?.();
  await guild.roles.fetch?.();
  const structureVerification = verifyParadiseTemplateStructure(guild, selected);
  const liveReady = structureVerification.ready && guideResult.ready && staffResult.ready;

  const createdChannels = [...guild.channels.cache.keys()].filter(id => !beforeChannelIds.has(id)).length;
  const createdRoles = [...guild.roles.cache.keys()].filter(id => !beforeRoleIds.has(id)).length;
  const result = {
    status: liveReady ? "LIVE DISCORD VERIFIED" : "LIVE DISCORD FAILED",
    completedAt: new Date().toISOString(),
    guildId: guild.id,
    mode,
    template: selected.label,
    operation: repairPermissions ? "create_missing_and_repair_permissions" : "create_missing_only",
    createdChannels,
    createdRoles,
    pendingRoleCreates: 0,
    mappedChannelCount: Object.keys(mappedChannels).length,
    guidePosts: Number(guideResult.posted || 0),
    guideReadback: {
      posted: guideResult.posted,
      verified: guideResult.verified,
      required: guideResult.required,
      ready: guideResult.ready,
      details: guideResult.details
    },
    staffReadback: sanitizeParadiseMessageReadback(staffResult),
    wrongChannelTypes: wrongTypeChannels,
    roleIcons,
    autoMod,
    structureVerification
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
  await writeArtifact(`${mutationPolicy.artifactPrefix}-${mode}-create-missing-live.json`, result);
  return result;
}

function assertParadiseMutationPolicy(guild, mode, confirmation, policy, { confirmationRequired = true } = {}) {
  if (!policy || !policy.allowedGuildId) {
    const error = new Error("invalid_mutation_policy");
    error.code = "invalid_mutation_policy";
    throw error;
  }
  const guildId = String(guild?.id || "");
  if (guildId !== String(policy.allowedGuildId)
      || (policy.isProduction && guildId === PARADISE_TEST_GUILD_ID)) {
    const error = new Error(policy.isProduction ? "production_guild_only" : "test_guild_only");
    error.code = policy.isProduction ? "production_guild_only" : "test_guild_only";
    throw error;
  }
  if (policy.isProduction && mode !== "community") {
    const error = new Error("production_community_only");
    error.code = "production_community_only";
    throw error;
  }
  const selected = PARADISE_SETUP_SCHEMAS[mode];
  if (!selected) {
    const error = new Error("invalid_template");
    error.code = "invalid_template";
    throw error;
  }
  const expected = policy.expectedConfirmation || `REBUILD TEST ${mode.toUpperCase()}`;
  if (confirmationRequired && String(confirmation || "").trim().toUpperCase() !== expected.toUpperCase()) {
    const error = new Error("typed_confirmation_mismatch");
    error.code = "typed_confirmation_mismatch";
    throw error;
  }
  return { selected, expected };
}

async function requireParadiseRebuildPreflight(guild, allowedCorrelationId = null, policy = PARADISE_TEST_REBUILD_POLICY) {
  const state = await loadState();
  const preflight = await inspectParadiseRebuildPreflight(guild, {
    state,
    allowedCorrelationId,
    allowedGuildId: policy.allowedGuildId,
    requireTestGuildRehearsal: policy.requireTestGuildRehearsal === true,
    requireProductionDeploymentReadiness: policy.isProduction === true,
    deploymentEnvironment: policy.deploymentEnvironment,
    expectedTestGuildId: policy.expectedTestGuildId,
    testGuildRehearsalMaxAgeMs: policy.testGuildRehearsalMaxAgeMs,
    testGuildRehearsalEvidenceSecret: policy.testGuildRehearsalEvidenceSecret
  });
  if (!preflight.ready) {
    const error = new Error(preflight.code || "paradise_rebuild_preflight_blocked");
    error.code = preflight.code || "paradise_rebuild_preflight_blocked";
    error.preflight = preflight;
    throw error;
  }
  if (policy.isProduction) {
    const expectedBackupDigest = String(policy.expectedBackupDigest || "").trim().toLowerCase();
    if (!PARADISE_BACKUP_DIGEST_PATTERN.test(expectedBackupDigest)) {
      const error = new Error("production_preflight_backup_digest_required");
      error.code = "production_preflight_backup_digest_required";
      error.preflight = preflight;
      throw error;
    }
    if (String(preflight.backup?.guildId || "") !== String(policy.allowedGuildId)
        || String(preflight.backup?.digest || "").toLowerCase() !== expectedBackupDigest) {
      const error = new Error("production_preflight_backup_digest_mismatch");
      error.code = "production_preflight_backup_digest_mismatch";
      error.preflight = preflight;
      throw error;
    }
  }
  return preflight;
}

export async function inspectParadiseTestTemplateRebuildPreflight(guild) {
  const state = await loadState();
  return inspectParadiseRebuildPreflight(guild, { state });
}

export async function inspectFimaCommunityProductionRebuildPreflight(guild, options = {}) {
  const state = await loadState();
  return inspectParadiseRebuildPreflight(guild, {
    state,
    allowedGuildId: FIMA_COMMUNITY_PRODUCTION_REBUILD_POLICY.allowedGuildId,
    requireTestGuildRehearsal: true,
    requireProductionDeploymentReadiness: true,
    deploymentEnvironment: options.deploymentEnvironment,
    expectedTestGuildId: FIMA_COMMUNITY_PRODUCTION_REBUILD_POLICY.expectedTestGuildId,
    testGuildRehearsalMaxAgeMs: FIMA_COMMUNITY_PRODUCTION_REBUILD_POLICY.testGuildRehearsalMaxAgeMs,
    testGuildRehearsalEvidenceSecret: options.testGuildRehearsalEvidenceSecret,
    includeBackupEnvelope: options.includeBackupEnvelope === true
  });
}

export async function rebuildParadiseTestTemplate(guild, mode, confirmation) {
  return rebuildParadiseTemplateWithPolicy(guild, mode, confirmation, PARADISE_TEST_REBUILD_POLICY);
}

async function persistParadiseRestoredState({ guildId, tickets, legacyTranscripts, guildConfig }) {
  await saveState(next => {
    next.guildConfigs = next.guildConfigs || {};
    next.guildConfigs[guildId] = structuredClone(guildConfig || {});
    if (guildId === PARADISE_TEST_GUILD_ID) next.config = structuredClone(next.guildConfigs[guildId]);

    next.supportTickets = next.supportTickets || {};
    next.supportTickets[guildId] = Object.fromEntries((tickets || []).map((ticket, index) => [
      String(ticket?.id || ticket?.ticketId || ticket?.channelId || `restored-${index + 1}`),
      structuredClone(ticket)
    ]));

    next.transcripts = Object.fromEntries(Object.entries(next.transcripts || {}).filter(([key, transcript]) =>
      String(transcript?.guildId || "") !== guildId && !String(key).includes(`:${guildId}:`)
    ));
    Object.assign(next.transcripts, structuredClone(legacyTranscripts || {}));
    return next;
  });
}

function paradiseRehearsalError(code, details = {}) {
  return Object.assign(new Error(code), { code, ...details });
}

async function refreshParadiseRollbackCaches(guild, timeoutMs = PARADISE_ROLLBACK_CACHE_REFRESH_TIMEOUT_MS) {
  const boundedTimeoutMs = Number.isFinite(Number(timeoutMs))
    ? Math.max(1, Math.min(60_000, Number(timeoutMs)))
    : PARADISE_ROLLBACK_CACHE_REFRESH_TIMEOUT_MS;
  let timer = null;
  const refresh = Promise.all([
    Promise.resolve().then(() => guild.channels?.fetch?.()),
    Promise.resolve().then(() => guild.roles?.fetch?.())
  ]);
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(paradiseRehearsalError("rollback_recovery_cache_refresh_timeout", {
        timeoutMs: boundedTimeoutMs
      }));
    }, boundedTimeoutMs);
    timer.unref?.();
  });

  try {
    await Promise.race([refresh, timeout]);
  } catch (cause) {
    if (cause?.code === "rollback_recovery_cache_refresh_timeout") throw cause;
    throw paradiseRehearsalError("rollback_recovery_cache_refresh_failed", { cause });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function assertParadiseRollbackRecoveryArtifactPath(artifactPath, artifactRoot = PARADISE_ARTIFACT_ROOT) {
  const root = path.resolve(artifactRoot);
  const candidate = path.resolve(String(artifactPath || ""));
  const relative = path.relative(root, candidate);
  if (!artifactPath
      || path.extname(candidate).toLowerCase() !== ".json"
      || relative === ""
      || relative.startsWith(`..${path.sep}`)
      || relative === ".."
      || path.isAbsolute(relative)) {
    throw paradiseRehearsalError("rollback_recovery_backup_path_invalid");
  }
  return { root, candidate };
}

async function assertParadiseRollbackRecoveryRealPath(root, candidate, realpath) {
  if (typeof realpath !== "function") return candidate;
  let realRoot;
  let realCandidate;
  try {
    [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
  } catch (cause) {
    throw paradiseRehearsalError("rollback_recovery_backup_artifact_unavailable", { cause });
  }
  const relative = path.relative(path.resolve(realRoot), path.resolve(realCandidate));
  if (relative === ""
      || relative.startsWith(`..${path.sep}`)
      || relative === ".."
      || path.isAbsolute(relative)
      || path.extname(realCandidate).toLowerCase() !== ".json") {
    throw paradiseRehearsalError("rollback_recovery_backup_path_invalid");
  }
  return realCandidate;
}

/**
 * Recovers a stranded test-guild rollback marker from its authenticated backup.
 * An already matching guild is resolved without mutation; otherwise the backup
 * is restored under the persistent mutation lease and reconciled again before
 * the marker can be resolved.
 */
async function recoverParadiseRollback(guild, confirmation, dependencies, recoveryPolicy) {
  const targetGuildId = recoveryPolicy.guildId;
  const isProduction = recoveryPolicy.isProduction === true;
  if (String(guild?.id || "") !== targetGuildId) {
    throw paradiseRehearsalError(isProduction ? "production_guild_only" : "test_guild_only");
  }
  if (!isProduction
      && String(confirmation || "").trim() !== PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION) {
    throw paradiseRehearsalError("typed_confirmation_mismatch");
  }

  const withMutationLock = dependencies.withMutationLock || withParadiseGuildMutationLock;
  const readRollback = dependencies.readRollback || readParadiseRollbackMarker;
  const resolveRollback = dependencies.resolveRollback || resolveParadiseRollbackMarker;
  const updateRollback = dependencies.updateRollback || updateParadiseRollbackMarker;
  const loadCurrentState = dependencies.loadState || loadState;
  const captureSnapshot = dependencies.captureSnapshot || captureParadiseGuildBackupSnapshot;
  const validateBackup = dependencies.validateBackup || validateParadiseBackupEnvelope;
  const backupStateDigest = dependencies.backupStateDigest || paradiseBackupStateDigest;
  const createRestoreDryRun = dependencies.createRestoreDryRun || buildParadiseRestoreDryRun;
  const restoreBackup = dependencies.restoreBackup || restoreParadiseGuildBackup;
  const persistRestoredState = dependencies.persistRestoredState || persistParadiseRestoredState;
  const persistArtifact = dependencies.persistArtifact || writeArtifact;
  const updateLease = dependencies.updateLease || updateParadiseMutationLease;
  const refreshRollbackCaches = dependencies.refreshRollbackCaches || refreshParadiseRollbackCaches;
  const rollbackCacheRefreshTimeoutMs = dependencies.rollbackCacheRefreshTimeoutMs
    ?? PARADISE_ROLLBACK_CACHE_REFRESH_TIMEOUT_MS;
  const artifactRoot = path.resolve(dependencies.artifactRoot || PARADISE_ARTIFACT_ROOT);
  const readBackupArtifact = dependencies.readBackupArtifact || (async artifactPath => {
    try {
      return JSON.parse(await fs.readFile(artifactPath, "utf8"));
    } catch (cause) {
      throw paradiseRehearsalError("rollback_recovery_backup_artifact_invalid", { cause });
    }
  });
  const realpath = dependencies.realpath
    || (dependencies.readBackupArtifact ? null : fs.realpath.bind(fs));

  return withMutationLock(guild, "recover_rollback", async () => {
    await updateLease({ phase: "rollback_recovery_validating_marker", status: "active" });
    const marker = await readRollback(targetGuildId);
    if (!marker) throw paradiseRehearsalError("rollback_marker_missing");
    if (Number(marker.schemaVersion) !== 1
        || String(marker.guildId || "") !== targetGuildId
        || !String(marker.markerId || "")) {
      throw paradiseRehearsalError("rollback_marker_schema_invalid");
    }
    const markerStatus = String(marker.status || "");
    if (!["rollback_required", "rollback_in_progress"].includes(markerStatus)) {
      throw paradiseRehearsalError("rollback_marker_not_recoverable");
    }
    const markerId = String(marker.markerId);
    const markerDigest = String(marker.backupDigest || "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(markerDigest)) {
      throw paradiseRehearsalError("rollback_marker_backup_invalid");
    }
    if (String(marker.mode || "") !== recoveryPolicy.markerMode) {
      throw paradiseRehearsalError("rollback_recovery_marker_mode_mismatch");
    }

    const checkedPath = assertParadiseRollbackRecoveryArtifactPath(marker.backupArtifact, artifactRoot);
    const backupPath = await assertParadiseRollbackRecoveryRealPath(
      checkedPath.root,
      checkedPath.candidate,
      realpath
    );
    let backup;
    try {
      backup = await readBackupArtifact(backupPath);
    } catch (cause) {
      if (cause?.code === "rollback_recovery_backup_artifact_invalid") throw cause;
      throw paradiseRehearsalError("rollback_recovery_backup_artifact_invalid", { cause });
    }
    const validation = validateBackup(backup);
    if (!validation?.valid) {
      throw paradiseRehearsalError("rollback_recovery_backup_invalid", {
        validation: { code: String(validation?.code || "backup_invalid") }
      });
    }
    const canonicalDigest = String(backup?.integrity?.digest || "").toLowerCase();
    const calculatedStateDigest = String(backupStateDigest(backup) || "").toLowerCase();
    const recordedStateDigest = String(backup?.integrity?.stateDigest || calculatedStateDigest).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(calculatedStateDigest)
        || calculatedStateDigest !== recordedStateDigest) {
      throw paradiseRehearsalError("rollback_recovery_backup_state_digest_mismatch");
    }
    if (canonicalDigest !== markerDigest) {
      throw paradiseRehearsalError("rollback_recovery_backup_digest_mismatch");
    }
    if (String(backup?.guildId || backup?.guild?.id || "") !== targetGuildId) {
      throw paradiseRehearsalError("rollback_recovery_backup_guild_mismatch");
    }
    if (isProduction) {
      const authorization = confirmation || {};
      let proof;
      try {
        proof = verifyParadiseProductionRebuildExecutionProof(authorization.executionProof, {
          secret: authorization.executionProofSecret,
          guildId: targetGuildId,
          mode: "community",
          backupDigest: calculatedStateDigest,
          planId: authorization.planId,
          nowMs: authorization.nowMs ?? Date.now()
        });
      } catch {
        throw paradiseRehearsalError("production_rebuild_execution_proof_invalid");
      }
      if (!proof?.ok) throw paradiseRehearsalError(proof?.code || "production_rebuild_execution_proof_invalid");
      if (String(marker.confirmation || "") !== paradiseProductionRestoreConfirmation(backup)) {
        throw paradiseRehearsalError("rollback_recovery_marker_confirmation_mismatch");
      }
    }

    const assertMarkerUnchanged = (currentMarker, expectedStatus = "rollback_required") => {
      if (!currentMarker
          || Number(currentMarker.schemaVersion) !== 1
          || String(currentMarker.guildId || "") !== targetGuildId
          || String(currentMarker.markerId || "") !== markerId
          || String(currentMarker.status || "") !== expectedStatus
          || String(currentMarker.backupDigest || "").toLowerCase() !== markerDigest
          || String(currentMarker.backupArtifact || "") !== String(marker.backupArtifact || "")) {
        throw paradiseRehearsalError("rollback_recovery_marker_changed");
      }
      return currentMarker;
    };

    const persistReconciliation = async (reconciliation, source, resolutionEligible) => {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return persistArtifact(`${recoveryPolicy.artifactPrefix}-rollback-recovery-reconciliation-${stamp}.json`, {
        schemaVersion: 1,
        guildId: targetGuildId,
        markerId,
        backupDigest: markerDigest,
        capturedAt: new Date().toISOString(),
        source,
        reconciliation,
        resolutionEligible
      });
    };

    await updateLease({ phase: "rollback_recovery_fresh_snapshot" });
    const state = await loadCurrentState();
    const snapshot = await captureSnapshot(guild, { state });
    const reconciliation = createRestoreDryRun({
      backup,
      currentSnapshot: snapshot,
      expectedGuildId: targetGuildId,
      allowedGuildId: targetGuildId
    });
    const safeReconciliation = {
      canRestore: reconciliation?.canRestore === true,
      mutationsPlanned: Number(reconciliation?.mutationsPlanned || 0),
      source: `fresh_${recoveryPolicy.sourceLabel}_rollback_recovery_snapshot`
    };
    await persistReconciliation(
      reconciliation,
      safeReconciliation.source,
      safeReconciliation.canRestore && safeReconciliation.mutationsPlanned === 0
    );
    if (!safeReconciliation.canRestore) {
      throw paradiseRehearsalError("rollback_recovery_reconciliation_not_zero", {
        reconciliation: safeReconciliation
      });
    }

    assertMarkerUnchanged(await readRollback(targetGuildId), markerStatus);

    let resolutionReconciliation = safeReconciliation;
    if (safeReconciliation.mutationsPlanned !== 0) {
      let restore = null;
      let rollbackInProgress = markerStatus === "rollback_in_progress";
      try {
        await updateLease({ phase: "rollback_recovery_restoring_backup", status: "rolling_back" });
        if (rollbackInProgress) {
          assertMarkerUnchanged(
            await readRollback(targetGuildId),
            "rollback_in_progress"
          );
        } else {
          const inProgressMarker = await updateRollback(targetGuildId, markerId, {
            status: "rollback_in_progress",
            reconciliation: safeReconciliation
          });
          rollbackInProgress = true;
          if (String(inProgressMarker?.markerId || "") !== markerId
              || String(inProgressMarker?.status || "") !== "rollback_in_progress") {
            throw paradiseRehearsalError("rollback_recovery_marker_update_failed");
          }
        }
        restore = await restoreBackup({
          guild,
          backup,
          confirmation: isProduction
            ? paradiseProductionRestoreConfirmation(backup)
            : paradiseRestoreConfirmation(backup),
          allowedGuildId: targetGuildId,
          productionAuthorization: isProduction ? {
            executionProof: confirmation.executionProof,
            executionProofSecret: confirmation.executionProofSecret,
            planId: confirmation.planId,
            mode: "community",
            nowMs: confirmation.nowMs ?? Date.now()
          } : null,
          currentState: await loadCurrentState(),
          persistRestoredState,
          reason: recoveryPolicy.reason
        });

        await refreshRollbackCaches(guild, rollbackCacheRefreshTimeoutMs);
        await updateLease({ phase: "rollback_recovery_post_restore_snapshot", status: "rolling_back" });
        const restoredState = await loadCurrentState();
        const restoredSnapshot = await captureSnapshot(guild, { state: restoredState });
        const postRestoreReconciliation = createRestoreDryRun({
          backup,
          currentSnapshot: restoredSnapshot,
          expectedGuildId: targetGuildId,
          allowedGuildId: targetGuildId
        });
        resolutionReconciliation = {
          canRestore: postRestoreReconciliation?.canRestore === true,
          mutationsPlanned: Number(postRestoreReconciliation?.mutationsPlanned || 0),
          source: `fresh_${recoveryPolicy.sourceLabel}_rollback_recovery_post_restore_snapshot`
        };
        const reconciliationArtifact = await persistReconciliation(
          postRestoreReconciliation,
          resolutionReconciliation.source,
          resolutionReconciliation.canRestore && resolutionReconciliation.mutationsPlanned === 0
        );
        if (!resolutionReconciliation.canRestore || resolutionReconciliation.mutationsPlanned !== 0) {
          throw paradiseRehearsalError("rollback_recovery_post_restore_reconciliation_not_zero", {
            reconciliation: resolutionReconciliation,
            reconciliationArtifact
          });
        }
        assertMarkerUnchanged(await readRollback(targetGuildId), "rollback_in_progress");
      } catch (error) {
        if (rollbackInProgress) {
          const currentMarker = await readRollback(targetGuildId).catch(() => null);
          if (currentMarker
              && String(currentMarker.markerId || "") === markerId
              && String(currentMarker.status || "") === "rollback_in_progress"
              && String(currentMarker.backupDigest || "").toLowerCase() === markerDigest
              && String(currentMarker.backupArtifact || "") === String(marker.backupArtifact || "")) {
            await updateRollback(targetGuildId, markerId, {
              status: "rollback_required",
              rollback: restore,
              rollbackError: sanitizeParadiseMutationFailure(error, "rollback_recovery_restore_failed")
            }).catch(() => null);
          }
          await updateLease({
            phase: "rollback_recovery_failed_rollback_required",
            status: "failed_rollback_required"
          }).catch(() => null);
        }
        throw error;
      }
    }

    let resolved;
    try {
      resolved = await resolveRollback(targetGuildId, markerId, resolutionReconciliation);
      if (String(resolved?.markerId || "") !== markerId || String(resolved?.status || "") !== "resolved") {
        throw paradiseRehearsalError("rollback_recovery_resolution_failed");
      }
    } catch (error) {
      if (safeReconciliation.mutationsPlanned !== 0 || markerStatus === "rollback_in_progress") {
        const currentMarker = await readRollback(targetGuildId).catch(() => null);
        if (currentMarker
            && String(currentMarker.markerId || "") === markerId
            && String(currentMarker.status || "") === "rollback_in_progress"
            && String(currentMarker.backupDigest || "").toLowerCase() === markerDigest
            && String(currentMarker.backupArtifact || "") === String(marker.backupArtifact || "")) {
          await updateRollback(targetGuildId, markerId, {
            status: "rollback_required",
            rollbackError: sanitizeParadiseMutationFailure(error, "rollback_recovery_resolution_failed")
          }).catch(() => null);
        }
        await updateLease({
          phase: "rollback_recovery_failed_rollback_required",
          status: "failed_rollback_required"
        }).catch(() => null);
      }
      throw error;
    }
    await updateLease({
      phase: "rollback_recovery_reconciled",
      status: "completed",
      reconciliation: resolutionReconciliation
    });
    return Object.freeze({
      action: "recover-rollback",
      status: "ok",
      completedAt: new Date().toISOString(),
      mode: "community",
      rollbackRecovered: true,
      reconciliationCanRestore: true,
      reconciliationMutationsPlanned: 0
    });
  }, {
    failIfLocked: true,
    purposeKey: recoveryPolicy.purposeKey,
    idempotencyKey: `${targetGuildId}:community:${isProduction ? confirmation.planId : PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION}`,
    phase: "request_validated",
    expectedGuildId: targetGuildId
  });
}

export async function recoverParadiseTestRollback(guild, confirmation, dependencies = {}) {
  return recoverParadiseRollback(guild, confirmation, dependencies, {
    guildId: PARADISE_TEST_GUILD_ID,
    isProduction: false,
    markerMode: "test_guild_rebuild:community",
    artifactPrefix: "test-guild",
    sourceLabel: "test_guild",
    reason: "FIMA test-guild stranded rollback recovery",
    purposeKey: "discord_test_guild_rollback_recovery"
  });
}

export async function recoverFimaCommunityProductionRollback(guild, authorization, dependencies = {}) {
  return recoverParadiseRollback(guild, authorization, dependencies, {
    guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
    isProduction: true,
    markerMode: "production_ft_community_rebuild:community",
    artifactPrefix: "production-ft-community",
    sourceLabel: "production_ft_community",
    reason: "FIMA FT Community stranded production rollback recovery",
    purposeKey: "discord_ft_community_production_rollback_recovery"
  });
}

/**
 * Resolves the production rollback marker only after the outer orchestrator
 * has completed its fresh audit, profile readbacks and sealed the plan. The
 * marker stays fail-closed for every earlier return path.
 */
export async function finalizeFimaCommunityProductionRollback(
  guild,
  authorization = {},
  dependencies = {}
) {
  const targetGuildId = FIMA_COMMUNITY_PRODUCTION_GUILD_ID;
  if (String(guild?.id || "") !== targetGuildId) {
    throw paradiseRehearsalError("production_guild_only");
  }

  const markerId = String(authorization.markerId || "").trim();
  const expectedBackupDigest = String(authorization.expectedBackupDigest || "").trim().toLowerCase();
  const planId = String(authorization.planId || "").trim();
  if (!/^[a-z0-9_-]{8,128}$/i.test(markerId)
      || !PARADISE_BACKUP_DIGEST_PATTERN.test(expectedBackupDigest)
      || !planId) {
    throw paradiseRehearsalError("rollback_finalization_scope_invalid");
  }

  const withMutationLock = dependencies.withMutationLock || withParadiseGuildMutationLock;
  const readRollback = dependencies.readRollback || readParadiseRollbackMarker;
  const resolveRollback = dependencies.resolveRollback || resolveParadiseRollbackMarker;
  const verifyExecutionProof = dependencies.verifyExecutionProof
    || verifyParadiseProductionRebuildExecutionProof;
  const validateBackup = dependencies.validateBackup || validateParadiseBackupEnvelope;
  const backupStateDigest = dependencies.backupStateDigest || paradiseBackupStateDigest;
  const artifactRoot = path.resolve(dependencies.artifactRoot || PARADISE_ARTIFACT_ROOT);
  const readBackupArtifact = dependencies.readBackupArtifact || (async artifactPath => {
    try {
      return JSON.parse(await fs.readFile(artifactPath, "utf8"));
    } catch (cause) {
      throw paradiseRehearsalError("rollback_finalization_backup_artifact_invalid", { cause });
    }
  });
  const realpath = dependencies.realpath
    || (dependencies.readBackupArtifact ? null : fs.realpath.bind(fs));

  return withMutationLock(guild, "finalize_production_rollback", async () => {
    let proof;
    try {
      proof = verifyExecutionProof(authorization.executionProof, {
        secret: authorization.executionProofSecret,
        guildId: targetGuildId,
        mode: "community",
        backupDigest: expectedBackupDigest,
        planId,
        nowMs: authorization.nowMs ?? Date.now()
      });
    } catch {
      throw paradiseRehearsalError("production_rebuild_execution_proof_invalid");
    }
    if (!proof?.ok) {
      throw paradiseRehearsalError("production_rebuild_execution_proof_invalid");
    }

    const marker = await readRollback(targetGuildId);
    const markerDigest = String(marker?.backupDigest || "").toLowerCase();
    if (!marker
        || Number(marker.schemaVersion) !== 1
        || String(marker.guildId || "") !== targetGuildId
        || String(marker.markerId || "") !== markerId
        || String(marker.mode || "") !== "production_ft_community_rebuild:community"
        || String(marker.status || "") !== "rollback_required"
        || marker.pendingFinalization !== true
        || String(marker.phase || "") !== "orchestrator_verification_pending"
        || !PARADISE_BACKUP_DIGEST_PATTERN.test(markerDigest)) {
      throw paradiseRehearsalError("rollback_finalization_marker_invalid");
    }

    const checkedPath = assertParadiseRollbackRecoveryArtifactPath(marker.backupArtifact, artifactRoot);
    const backupPath = await assertParadiseRollbackRecoveryRealPath(
      checkedPath.root,
      checkedPath.candidate,
      realpath
    );
    const backup = await readBackupArtifact(backupPath);
    const validation = validateBackup(backup);
    const calculatedStateDigest = String(backupStateDigest(backup) || "").toLowerCase();
    if (!validation?.valid
        || String(backup?.guildId || backup?.guild?.id || "") !== targetGuildId
        || String(backup?.integrity?.digest || "").toLowerCase() !== markerDigest
        || !PARADISE_BACKUP_DIGEST_PATTERN.test(calculatedStateDigest)
        || calculatedStateDigest !== expectedBackupDigest
        || String(marker.confirmation || "") !== paradiseProductionRestoreConfirmation(backup)) {
      throw paradiseRehearsalError("rollback_finalization_backup_invalid");
    }

    const current = await readRollback(targetGuildId);
    if (!current
        || String(current.markerId || "") !== markerId
        || String(current.status || "") !== "rollback_required"
        || String(current.mode || "") !== "production_ft_community_rebuild:community"
        || current.pendingFinalization !== true
        || String(current.backupDigest || "").toLowerCase() !== markerDigest
        || String(current.backupArtifact || "") !== String(marker.backupArtifact || "")) {
      throw paradiseRehearsalError("rollback_finalization_marker_changed");
    }

    const resolved = await resolveRollback(targetGuildId, markerId, {
      canRestore: true,
      mutationsPlanned: 0,
      source: "fresh_ft_community_orchestrator_verification"
    });
    if (String(resolved?.markerId || "") !== markerId
        || String(resolved?.status || "") !== "resolved") {
      throw paradiseRehearsalError("rollback_finalization_resolution_failed");
    }
    return Object.freeze({
      status: "ok",
      rollbackFinalized: true
    });
  }, {
    failIfLocked: true,
    purposeKey: "discord_ft_community_production_rollback_finalization",
    idempotencyKey: `${targetGuildId}:community:${planId}:finalize`,
    phase: "request_validated",
    expectedGuildId: targetGuildId
  });
}

/**
 * Restart-safe finalization path. It deliberately accepts no Discord client
 * or guild object and authorizes only an authenticated, persisted receipt
 * bound to the completed plan and unresolved rollback marker.
 */
export async function finalizeFimaCommunityProductionRollbackFromReceipt(
  authorization = {},
  dependencies = {}
) {
  const targetGuildId = FIMA_COMMUNITY_PRODUCTION_GUILD_ID;
  const secret = String(authorization.secret || "");
  const withMutationLock = dependencies.withMutationLock || withParadiseGuildMutationLock;
  const readReceipt = dependencies.readReceipt || readParadiseProductionFinalizationReceipt;
  const readRollback = dependencies.readRollback || readParadiseRollbackMarker;
  const resolveRollback = dependencies.resolveRollback || resolveParadiseRollbackMarker;
  const resolveReceipt = dependencies.resolveReceipt
    || resolveParadiseProductionFinalizationReceipt;
  const validateBackup = dependencies.validateBackup || validateParadiseBackupEnvelope;
  const backupStateDigest = dependencies.backupStateDigest || paradiseBackupStateDigest;
  const artifactRoot = path.resolve(dependencies.artifactRoot || PARADISE_ARTIFACT_ROOT);
  const readBackupArtifact = dependencies.readBackupArtifact || (async artifactPath => {
    try {
      return JSON.parse(await fs.readFile(artifactPath, "utf8"));
    } catch (cause) {
      throw paradiseRehearsalError("rollback_finalization_backup_artifact_invalid", { cause });
    }
  });
  const realpath = dependencies.realpath
    || (dependencies.readBackupArtifact ? null : fs.realpath.bind(fs));

  let initialMarker;
  let receipt;
  try {
    initialMarker = await readRollback(targetGuildId);
    const initialMarkerId = String(initialMarker?.markerId || "").trim();
    try {
      receipt = await readReceipt({
        guildId: targetGuildId,
        markerId: initialMarkerId,
        lifecycle: "pending",
        planRoot: authorization.planRoot,
        secret,
        fileApi: dependencies.fileApi
      });
    } catch (error) {
      if (error?.code !== "production_finalization_receipt_index_unavailable"
          || String(initialMarker?.status || "") !== "resolved") {
        throw error;
      }
      receipt = await readReceipt({
        guildId: targetGuildId,
        markerId: initialMarkerId,
        lifecycle: "resolved",
        planRoot: authorization.planRoot,
        secret,
        fileApi: dependencies.fileApi
      });
    }
  } catch {
    throw paradiseRehearsalError("production_finalization_receipt_invalid");
  }
  const markerId = String(receipt?.markerId || "").trim();
  const planId = String(receipt?.planId || "").trim();
  const stateDigest = String(receipt?.backupDigest || "").trim().toLowerCase();
  const artifactDigest = String(receipt?.backupArtifactDigest || "").trim().toLowerCase();
  if (String(receipt?.guildId || "") !== targetGuildId
      || String(receipt?.mode || "") !== "community"
      || receipt?.outcome !== "completed"
      || !/^[0-9a-f-]{36}$/i.test(planId)
      || !/^[a-z0-9_-]{8,128}$/i.test(markerId)
      || String(initialMarker?.markerId || "") !== markerId
      || !PARADISE_BACKUP_DIGEST_PATTERN.test(stateDigest)
      || !PARADISE_BACKUP_DIGEST_PATTERN.test(artifactDigest)) {
    throw paradiseRehearsalError("rollback_finalization_scope_invalid");
  }

  return withMutationLock(targetGuildId, "finalize_production_rollback_from_receipt", async () => {
    const marker = await readRollback(targetGuildId);
    if (!marker
        || Number(marker.schemaVersion) !== 1
        || String(marker.guildId || "") !== targetGuildId
        || String(marker.markerId || "") !== markerId
        || String(marker.mode || "") !== "production_ft_community_rebuild:community"
        || String(marker.backupDigest || "").toLowerCase() !== artifactDigest) {
      throw paradiseRehearsalError("rollback_finalization_marker_invalid");
    }
    if (String(marker.status || "") === "resolved") {
      await resolveReceipt({
        guildId: targetGuildId,
        markerId,
        planId,
        planRoot: authorization.planRoot,
        secret,
        fileApi: dependencies.fileApi
      });
      return Object.freeze({
        status: "ok",
        rollbackFinalized: true,
        alreadyFinalized: true
      });
    }
    if (String(marker.status || "") !== "rollback_required"
        || marker.pendingFinalization !== true
        || String(marker.phase || "") !== "orchestrator_verification_pending") {
      throw paradiseRehearsalError("rollback_finalization_marker_invalid");
    }

    const checkedPath = assertParadiseRollbackRecoveryArtifactPath(marker.backupArtifact, artifactRoot);
    const backupPath = await assertParadiseRollbackRecoveryRealPath(
      checkedPath.root,
      checkedPath.candidate,
      realpath
    );
    const backup = await readBackupArtifact(backupPath);
    const validation = validateBackup(backup);
    if (!validation?.valid
        || String(backup?.guildId || backup?.guild?.id || "") !== targetGuildId
        || String(backup?.integrity?.digest || "").toLowerCase() !== artifactDigest
        || String(backupStateDigest(backup) || "").toLowerCase() !== stateDigest
        || String(marker.confirmation || "") !== paradiseProductionRestoreConfirmation(backup)) {
      throw paradiseRehearsalError("rollback_finalization_backup_invalid");
    }

    const current = await readRollback(targetGuildId);
    if (!current
        || String(current.markerId || "") !== markerId
        || String(current.status || "") !== "rollback_required"
        || String(current.mode || "") !== "production_ft_community_rebuild:community"
        || current.pendingFinalization !== true
        || String(current.backupDigest || "").toLowerCase() !== artifactDigest
        || String(current.backupArtifact || "") !== String(marker.backupArtifact || "")) {
      throw paradiseRehearsalError("rollback_finalization_marker_changed");
    }
    const resolved = await resolveRollback(targetGuildId, markerId, {
      canRestore: true,
      mutationsPlanned: 0,
      source: "authenticated_ft_community_finalization_receipt"
    });
    if (String(resolved?.markerId || "") !== markerId
        || String(resolved?.status || "") !== "resolved") {
      throw paradiseRehearsalError("rollback_finalization_resolution_failed");
    }
    await resolveReceipt({
      guildId: targetGuildId,
      markerId,
      planId,
      planRoot: authorization.planRoot,
      secret,
      fileApi: dependencies.fileApi
    });
    return Object.freeze({ status: "ok", rollbackFinalized: true, alreadyFinalized: false });
  }, {
    failIfLocked: true,
    purposeKey: "discord_ft_community_production_rollback_finalization",
    idempotencyKey: `${targetGuildId}:community:${planId}:${markerId}:receipt-finalize`,
    phase: "request_validated",
    expectedGuildId: targetGuildId
  });
}

export async function rehearseParadiseTestTemplate(
  guild,
  mode,
  confirmation,
  dependencies = {}
) {
  if (String(guild?.id || "") !== PARADISE_TEST_GUILD_ID) {
    throw paradiseRehearsalError("test_guild_only");
  }
  if (mode !== "community") throw paradiseRehearsalError("test_rehearsal_community_only");
  if (String(confirmation || "").trim() !== PARADISE_TEST_REHEARSAL_CONFIRMATION) {
    throw paradiseRehearsalError("typed_confirmation_mismatch");
  }

  const loadCurrentState = dependencies.loadState || loadState;
  const captureSnapshot = dependencies.captureSnapshot || captureParadiseGuildBackupSnapshot;
  const createBackup = dependencies.createBackup || createParadiseBackupEnvelope;
  const validateBackup = dependencies.validateBackup || validateParadiseBackupEnvelope;
  const createRestoreDryRun = dependencies.createRestoreDryRun || buildParadiseRestoreDryRun;
  const validateBackupCopies = dependencies.validateBackupCopies || validateParadiseBackupArtifactCopies;
  const persistArtifact = dependencies.persistArtifact || writeArtifact;
  const readArtifact = dependencies.readArtifact || (artifactPath => fs.readFile(artifactPath, "utf8").then(JSON.parse));
  const rebuildTemplate = dependencies.rebuildTemplate || rebuildParadiseTemplateUnlocked;
  const runSmoke = dependencies.runSmoke || runParadiseTestSmokeSuiteUnlocked;
  const restoreBackup = dependencies.restoreBackup || restoreParadiseGuildBackup;
  const persistRestoredState = dependencies.persistRestoredState || persistParadiseRestoredState;
  const requirePreflight = dependencies.requirePreflight || requireParadiseRebuildPreflight;
  const withMutationLock = dependencies.withMutationLock || withParadiseGuildMutationLock;
  const currentLease = dependencies.currentLease || paradiseCurrentMutationLease;
  const updateLease = dependencies.updateLease || updateParadiseMutationLease;
  const updateRollback = dependencies.updateRollback || updateParadiseRollbackMarker;
  const resolveRollback = dependencies.resolveRollback || resolveParadiseRollbackMarker;

  await requirePreflight(guild, null, PARADISE_TEST_REBUILD_POLICY);
  return withMutationLock(guild, "rehearsal", async () => {
    const lease = currentLease();
    await requirePreflight(guild, lease?.correlationId || null, PARADISE_TEST_REBUILD_POLICY);
    await updateLease({ phase: "rehearsal_backup", status: "active" });

    let initialBackup = null;
    let initialBackupArtifact = null;
    let rollbackMarker = null;
    let mutationStarted = false;

    const restoreOriginalAndVerify = async source => {
      await updateLease({ phase: `${source}_restore_original`, status: "rolling_back" });
      const restore = await restoreBackup({
        guild,
        backup: initialBackup,
        confirmation: paradiseRestoreConfirmation(initialBackup),
        allowedGuildId: PARADISE_TEST_GUILD_ID,
        currentState: await loadCurrentState(),
        persistRestoredState,
        reason: "FIMA test-guild rehearsal original-state restoration"
      });
      await guild.channels?.fetch?.();
      await guild.roles?.fetch?.();
      const restoredState = await loadCurrentState();
      const restoredSnapshot = await captureSnapshot(guild, { state: restoredState });
      const reconciliation = createRestoreDryRun({
        backup: initialBackup,
        currentSnapshot: restoredSnapshot,
        expectedGuildId: PARADISE_TEST_GUILD_ID,
        allowedGuildId: PARADISE_TEST_GUILD_ID
      });
      if (!reconciliation.canRestore || reconciliation.mutationsPlanned !== 0) {
        throw paradiseRehearsalError("test_rehearsal_original_state_mismatch", {
          reconciliation: {
            canRestore: reconciliation.canRestore === true,
            mutationsPlanned: Number(reconciliation.mutationsPlanned || 0)
          }
        });
      }
      return { restore, reconciliation };
    };

    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const initialState = await loadCurrentState();
      const initialSnapshot = await captureSnapshot(guild, { state: initialState });
      initialBackup = createBackup(initialSnapshot);
      const initialValidation = validateBackup(initialBackup);
      if (!initialValidation.valid) throw paradiseRehearsalError("test_rehearsal_backup_invalid");

      const initialDryRun = createRestoreDryRun({
        backup: initialBackup,
        currentSnapshot: initialSnapshot,
        expectedGuildId: PARADISE_TEST_GUILD_ID,
        allowedGuildId: PARADISE_TEST_GUILD_ID
      });
      if (!initialDryRun.canRestore || initialDryRun.mutationsPlanned !== 0) {
        throw paradiseRehearsalError("test_rehearsal_initial_zero_diff_failed");
      }

      await updateLease({ phase: "rehearsal_persisting_backup" });
      initialBackupArtifact = await persistArtifact(`test-guild-rehearsal-backup-${stamp}.json`, initialBackup);
      const canonicalBackupArtifact = await persistArtifact("test-guild-rehearsal-pre-rebuild-backup.json", initialBackup);
      const [diskBackup, canonicalDiskBackup] = await Promise.all([
        readArtifact(initialBackupArtifact),
        readArtifact(canonicalBackupArtifact)
      ]);
      const copiesValidation = validateBackupCopies({
        timestampedBackup: diskBackup,
        canonicalBackup: canonicalDiskBackup,
        expectedBackup: initialBackup,
        expectedGuildId: PARADISE_TEST_GUILD_ID
      });
      if (!copiesValidation.valid) throw paradiseRehearsalError("test_rehearsal_persisted_backup_invalid");
      initialBackup = diskBackup;

      mutationStarted = true;
      await updateLease({ phase: "rehearsal_rebuild" });
      const rehearsalRebuildPolicy = {
        ...PARADISE_TEST_REBUILD_POLICY,
        retainRollbackMarkerForRehearsal: true
      };
      const rebuild = await rebuildTemplate(
        guild,
        "community",
        "REBUILD TEST COMMUNITY",
        rehearsalRebuildPolicy
      );
      if (rebuild?.status !== "LIVE DISCORD VERIFIED") {
        throw paradiseRehearsalError("test_rehearsal_rebuild_not_verified");
      }
      if (rebuild?.rollback?.required !== true
          || rebuild?.rollback?.markerStatus !== "smoke_in_progress"
          || !rebuild?.rollback?.markerId) {
        throw paradiseRehearsalError("test_rehearsal_rollback_marker_not_retained");
      }
      rollbackMarker = {
        markerId: String(rebuild.rollback.markerId),
        status: String(rebuild.rollback.markerStatus)
      };

      const smokeRuns = [];
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        await updateLease({ phase: `rehearsal_full_smoke_${attempt}` });
        const smoke = await runSmoke(guild, { fast: false });
        if (smoke?.status !== "LIVE DISCORD VERIFIED") {
          throw paradiseRehearsalError(`test_rehearsal_smoke_${attempt}_not_verified`);
        }
        smokeRuns.push(smoke);
      }

      rollbackMarker = await updateRollback(PARADISE_TEST_GUILD_ID, rollbackMarker.markerId, {
        status: "restoring_original_state"
      });
      const { reconciliation } = await restoreOriginalAndVerify("rehearsal");
      mutationStarted = false;
      rollbackMarker = await resolveRollback(PARADISE_TEST_GUILD_ID, rollbackMarker.markerId, {
        canRestore: true,
        mutationsPlanned: 0,
        source: "fresh_post_rehearsal_restore_snapshot"
      });
      await updateLease({
        phase: "rehearsal_reconciled",
        status: "completed",
        rollback: { markerId: rollbackMarker.markerId, status: rollbackMarker.status },
        reconciliation: { canRestore: true, mutationsPlanned: 0 }
      });

      const result = {
        action: "rehearsal",
        status: "LIVE DISCORD VERIFIED",
        completedAt: new Date().toISOString(),
        mode: "community",
        smokeRunsCompleted: smokeRuns.length,
        fullSmokeRunsVerified: smokeRuns.every(item => item.status === "LIVE DISCORD VERIFIED"),
        initialBackupVerified: true,
        persistedBackupVerified: true,
        backupAlgorithm: String(diskBackup.integrity.algorithm || "").toLowerCase(),
        backupArtifactDigest: String(diskBackup.integrity.digest || "").toLowerCase(),
        backupStateDigest: String(
          diskBackup.integrity.stateDigest || paradiseBackupStateDigest(diskBackup)
        ).toLowerCase(),
        persistedBackupArtifactDigest: String(canonicalDiskBackup.integrity.digest || "").toLowerCase(),
        persistedBackupStateDigest: String(
          canonicalDiskBackup.integrity.stateDigest || paradiseBackupStateDigest(canonicalDiskBackup)
        ).toLowerCase(),
        restoredOriginalState: true,
        originalStateCanRestore: reconciliation.canRestore === true,
        originalStateMutationsPlanned: Number(reconciliation.mutationsPlanned || 0)
      };
      await persistArtifact("test-guild-rehearsal-result.json", result);
      return Object.freeze(result);
    } catch (error) {
      const nestedRollbackMarker = error?.rollbackMarker;
      if (!rollbackMarker
          && nestedRollbackMarker?.markerId
          && String(nestedRollbackMarker.status || "") !== "resolved") {
        rollbackMarker = {
          markerId: String(nestedRollbackMarker.markerId),
          status: String(nestedRollbackMarker.status || "rollback_required")
        };
      }
      if (initialBackup && mutationStarted) {
        let rollback = null;
        let rollbackError = null;
        try {
          if (rollbackMarker) {
            rollbackMarker = await updateRollback(PARADISE_TEST_GUILD_ID, rollbackMarker.markerId, {
              status: "rollback_in_progress",
              failure: sanitizeParadiseMutationFailure(error, "test_rehearsal_failed")
            });
          }
          rollback = await restoreOriginalAndVerify("rehearsal_failure");
          mutationStarted = false;
          if (rollbackMarker) {
            rollbackMarker = await resolveRollback(PARADISE_TEST_GUILD_ID, rollbackMarker.markerId, {
              canRestore: true,
              mutationsPlanned: 0,
              source: "fresh_post_rehearsal_failure_rollback_snapshot"
            });
          }
        } catch (restoreError) {
          rollbackError = restoreError;
          if (rollbackMarker) {
            rollbackMarker = await updateRollback(PARADISE_TEST_GUILD_ID, rollbackMarker.markerId, {
              status: "rollback_required",
              rollbackError: sanitizeParadiseMutationFailure(restoreError, "test_rehearsal_rollback_failed")
            }).catch(() => rollbackMarker);
          }
        }
        error.rollback = rollback
          ? { restoredOriginalState: true, originalStateMutationsPlanned: 0 }
          : null;
        error.rollbackError = rollbackError
          ? paradiseRehearsalError(String(rollbackError?.code || "test_rehearsal_rollback_failed"))
          : null;
        error.rollbackMarker = rollbackMarker
          ? { markerId: rollbackMarker.markerId, status: rollbackMarker.status }
          : null;
      }
      await updateLease({
        phase: mutationStarted ? "rehearsal_rollback_required" : "rehearsal_failed_rolled_back",
        status: mutationStarted ? "failed" : "failed_rolled_back"
      }).catch(() => {});
      throw error;
    }
  }, {
    purposeKey: "discord_test_guild_rehearsal",
    idempotencyKey: `${PARADISE_TEST_GUILD_ID}:community:${PARADISE_TEST_REHEARSAL_CONFIRMATION}`,
    phase: "request_validated",
    expectedGuildId: PARADISE_TEST_GUILD_ID
  });
}

export async function rebuildFimaCommunityProduction(guild, mode, confirmation, {
  expectedBackupDigest,
  executionProof,
  planId,
  executionProofSecret,
  testGuildRehearsalEvidenceSecret
} = {}) {
  return rebuildParadiseTemplateWithPolicy(
    guild,
    mode,
    confirmation,
    Object.freeze({
      ...FIMA_COMMUNITY_PRODUCTION_REBUILD_POLICY,
      expectedBackupDigest: String(expectedBackupDigest || "").trim().toLowerCase(),
      executionProof,
      planId: String(planId || "").trim(),
      executionProofSecret,
      testGuildRehearsalEvidenceSecret
    })
  );
}

function assertParadiseProductionExecutionCapability(guild, mode, policy) {
  if (!policy?.isProduction) return;
  const verification = verifyParadiseProductionRebuildExecutionProof(policy.executionProof, {
    secret: policy.executionProofSecret,
    guildId: String(guild?.id || ""),
    mode,
    backupDigest: policy.expectedBackupDigest,
    planId: policy.planId
  });
  if (!verification.ok) {
    const error = new Error(verification.code);
    error.code = verification.code;
    throw error;
  }
}

async function rebuildParadiseTemplateWithPolicy(guild, mode, confirmation, policy) {
  assertParadiseMutationPolicy(guild, mode, confirmation, policy, {
    confirmationRequired: policy?.isProduction !== true
  });
  const canonicalTextEncoding = inspectParadiseCanonicalTextEncoding(mode);
  if (!canonicalTextEncoding.ready) {
    const error = new Error(canonicalTextEncoding.code);
    error.code = canonicalTextEncoding.code;
    error.affected = canonicalTextEncoding.affected;
    throw error;
  }
  assertParadiseProductionExecutionCapability(guild, mode, policy);
  // The legacy template rebuild deletes objects and deduplicates roles/channels.
  // A signed execution proof authorizes the target; it does not authorize loss
  // of existing Discord IDs, messages, memberships, or external destinations.
  // Production migrations must use the reviewed metadata-only executor instead.
  if (policy?.isProduction) {
    throw Object.assign(new Error("production_destructive_rebuild_disabled"), {
      code: "production_destructive_rebuild_disabled"
    });
  }
  const inheritedLease = paradiseCurrentMutationLease();
  const inheritedCorrelationId = inheritedLease?.guildId === String(guild?.id || "")
    ? inheritedLease.correlationId
    : null;
  await requireParadiseRebuildPreflight(guild, inheritedCorrelationId, policy);
  return withParadiseGuildMutationLock(guild, "rebuild", async () => {
    const ownedLease = paradiseCurrentMutationLease();
    await requireParadiseRebuildPreflight(guild, ownedLease?.correlationId || null, policy);
    await updateParadiseMutationLease({ phase: "backup_and_rebuild" });
    return rebuildParadiseTemplateUnlocked(guild, mode, confirmation, policy);
  }, {
    purposeKey: "discord_template_rebuild",
    idempotencyKey: `${guild?.id}:${mode}:${confirmation}`,
    phase: "request_validated",
    expectedGuildId: policy.allowedGuildId
  });
}

function roleMemberCount(role) {
  return Number(role?.members?.size || 0);
}

export function planParadiseDesiredRoleDeduplication(roles, {
  everyoneRoleId,
  botHighestPosition,
  desiredName = null,
  preferredRoleId = null
} = {}) {
  const available = [...(roles || [])];
  const highestPosition = Number(botHighestPosition);
  const hasBotHierarchy = Number.isFinite(highestPosition) && highestPosition > 0;
  const candidates = available
    .filter(role => role?.id !== everyoneRoleId
      && !role?.managed
      && (!hasBotHierarchy || Number(role?.position || 0) < highestPosition))
    .sort((left, right) =>
      Number(String(right?.id || "") === String(preferredRoleId || ""))
      - Number(String(left?.id || "") === String(preferredRoleId || ""))
      || Number(desiredName !== null && exactMutationResourceNameMatches(right?.name, desiredName))
      - Number(desiredName !== null && exactMutationResourceNameMatches(left?.name, desiredName))
      ||
      roleMemberCount(right) - roleMemberCount(left)
      || Number(right?.position || 0) - Number(left?.position || 0)
      || String(left?.id || "").localeCompare(String(right?.id || "")));
  const canonical = candidates[0] || null;
  const duplicateActions = available
    .filter(role => role?.id !== canonical?.id)
    .map(role => {
      let protection = null;
      if (role?.id === everyoneRoleId) protection = "everyone_role";
      else if (role?.managed) protection = "managed_role";
      else if (hasBotHierarchy && Number(role?.position || 0) >= highestPosition) protection = "above_bot_hierarchy";
      return { role, protection };
    });
  return { canonical, duplicateActions };
}

export async function cleanupParadiseDesiredRoleDuplicates(
  guild,
  desiredRoleNames,
  me,
  mutationPolicy = PARADISE_TEST_REBUILD_POLICY
) {
  assertParadiseMutationPolicy(guild, "community", null, mutationPolicy, { confirmationRequired: false });
  const report = { deleted: [], protected: [], failed: [], memberMigrations: 0 };
  for (const name of desiredRoleNames) {
    const matching = [...guild.roles.cache.values()].filter(role => mutationResourceNameMatches(role.name, name));
    if (matching.length <= 1) continue;
    const plan = planParadiseDesiredRoleDeduplication(matching, {
      everyoneRoleId: guild.id,
      botHighestPosition: me.roles.highest.position,
      desiredName: name
    });
    if (!plan.canonical) {
      for (const { role, protection } of plan.duplicateActions) {
        report.protected.push({ id: role.id, name, reason: protection || "no_canonical_role" });
      }
      continue;
    }
    for (const { role, protection } of plan.duplicateActions) {
      if (protection) {
        report.protected.push({ id: role.id, name, reason: protection });
        continue;
      }
      const members = [...(role.members?.values?.() || [])];
      let migrationFailed = false;
      for (const member of members) {
        if (member.roles?.cache?.has?.(plan.canonical.id)) continue;
        if (!plan.canonical.editable || Number(plan.canonical.position || 0) >= me.roles.highest.position) {
          migrationFailed = true;
          report.protected.push({ id: role.id, name, reason: "member_migration_hierarchy_blocked", memberId: member.id });
          break;
        }
        try {
          await member.roles.add(plan.canonical, "FIMA duplicate-role member preservation");
          report.memberMigrations += 1;
        } catch (error) {
          migrationFailed = true;
          report.failed.push({ id: role.id, name, reason: "member_migration_failed", code: String(error?.code || "unknown") });
          break;
        }
      }
      if (migrationFailed) continue;
      try {
        await role.delete(`${mutationPolicy.auditReason} canonical duplicate-role cleanup`);
        guild.roles.cache.delete(role.id);
        report.deleted.push({ id: role.id, name, canonicalId: plan.canonical.id });
      } catch (error) {
        report.failed.push({ id: role.id, name, reason: "delete_failed", code: String(error?.code || "unknown") });
      }
    }
  }
  return report;
}

function canonicalParadiseChannel(channels, {
  desiredName,
  expectedType,
  expectedParentId = null,
  mappedChannelIds = new Set()
} = {}) {
  return [...channels]
    .filter(channel => channel?.type === expectedType)
    .sort((left, right) =>
      Number(mappedChannelIds.has(String(right?.id || ""))) - Number(mappedChannelIds.has(String(left?.id || "")))
      || Number(expectedParentId !== null && right?.parentId === expectedParentId)
      - Number(expectedParentId !== null && left?.parentId === expectedParentId)
      || Number(exactMutationResourceNameMatches(right?.name, desiredName))
      - Number(exactMutationResourceNameMatches(left?.name, desiredName))
      || Number(left?.rawPosition || 0) - Number(right?.rawPosition || 0)
      || String(left?.id || "").localeCompare(String(right?.id || "")))[0] || null;
}

export async function cleanupParadiseDesiredChannelDuplicates(guild, selected, {
  mappedChannelIds = new Set(),
  mutationPolicy = PARADISE_TEST_REBUILD_POLICY
} = {}) {
  assertParadiseMutationPolicy(guild, "community", null, mutationPolicy, { confirmationRequired: false });
  const preferredIds = new Set([...(mappedChannelIds || [])].map(String));
  const report = { deleted: [], failed: [], reparented: [] };
  for (const [categoryName, channelNames, privateCategory] of selected.schema) {
    const categoryMatches = [...guild.channels.cache.values()]
      .filter(channel => !channel.isThread?.() && mutationResourceNameMatches(channel.name, categoryName));
    const category = canonicalParadiseChannel(categoryMatches, {
      desiredName: categoryName,
      expectedType: ChannelType.GuildCategory,
      mappedChannelIds: preferredIds
    });
    for (const duplicate of categoryMatches.filter(channel => channel.id !== category?.id)) {
      try {
        await duplicate.delete(`${mutationPolicy.auditReason} canonical duplicate-category cleanup`);
        guild.channels.cache.delete(duplicate.id);
        report.deleted.push({ id: duplicate.id, name: categoryName, type: duplicate.type });
      } catch (error) {
        report.failed.push({ id: duplicate.id, name: categoryName, code: String(error?.code || "unknown") });
      }
    }
    if (!category) continue;
    for (const channelName of channelNames) {
      const expectedType = paradiseSetupChannelType(categoryName, channelName);
      const sameName = [...guild.channels.cache.values()]
        .filter(channel => !channel.isThread?.() && mutationResourceNameMatches(channel.name, channelName));
      const canonical = canonicalParadiseChannel(sameName, {
        desiredName: channelName,
        expectedType,
        expectedParentId: category.id,
        mappedChannelIds: preferredIds
      });
      if (canonical && canonical.parentId !== category.id) {
        try {
          await canonical.setParent(category.id, { lockPermissions: privateCategory });
          report.reparented.push({ id: canonical.id, name: channelName, parentId: category.id });
        } catch (error) {
          report.failed.push({ id: canonical.id, name: channelName, code: String(error?.code || "parent_update_failed") });
        }
      }
      for (const duplicate of sameName.filter(channel => channel.id !== canonical?.id)) {
        try {
          await duplicate.delete(`${mutationPolicy.auditReason} canonical duplicate-channel cleanup`);
          guild.channels.cache.delete(duplicate.id);
          report.deleted.push({ id: duplicate.id, name: channelName, type: duplicate.type });
        } catch (error) {
          report.failed.push({ id: duplicate.id, name: channelName, code: String(error?.code || "unknown") });
        }
      }
    }
  }
  return report;
}

export function verifyParadiseTemplateStructure(guild, selected, roleIconOptions = {}) {
  const missingDesiredRoles = [];
  const duplicateDesiredRoles = [];
  const rolePermissionMismatches = [];
  for (const name of selected.roles) {
    const matches = [...guild.roles.cache.values()]
      .filter(role => mutationResourceNameMatches(role.name, name) && !role.managed);
    const count = matches.length;
    if (count === 0) missingDesiredRoles.push(name);
    if (count > 1) duplicateDesiredRoles.push({ name, count });
    for (const role of matches) {
      const expected = expectedRolePermissionBitfield(name);
      const actual = permissionBitfieldValue(role.permissions);
      if (actual !== expected) {
        rolePermissionMismatches.push({
          id: role.id,
          name,
          expected: expected.toString(),
          actual: actual?.toString() ?? null
        });
      }
    }
  }
  const missingDesiredChannels = [];
  const duplicateDesiredChannels = [];
  const categoryPermissionMismatches = [];
  const channelPermissionMismatches = [];
  const desiredChannelKeys = new Set();
  for (const [categoryName, channelNames, privateCategory, accessRoleNames] of selected.schema) {
    desiredChannelKeys.add(`${ChannelType.GuildCategory}:${normalizedMutationResourceName(categoryName)}`);
    const categories = [...guild.channels.cache.values()]
      .filter(channel => mutationResourceNameMatches(channel.name, categoryName) && channel.type === ChannelType.GuildCategory);
    if (categories.length === 0) missingDesiredChannels.push({ name: categoryName, type: ChannelType.GuildCategory });
    if (categories.length > 1) duplicateDesiredChannels.push({ name: categoryName, type: ChannelType.GuildCategory, count: categories.length });
    const category = categories[0];
    if (category) {
      const everyoneId = guild.roles.everyone?.id || guild.id;
      const actualEveryoneView = overwriteViewDecision(permissionOverwriteFor(category, everyoneId)) || "inherit";
      const expectedEveryoneView = privateCategory ? "deny" : "inherit";
      if (actualEveryoneView !== expectedEveryoneView) {
        categoryPermissionMismatches.push({
          categoryId: category.id,
          categoryName,
          targetId: everyoneId,
          targetName: "@everyone",
          expected: expectedEveryoneView,
          actual: actualEveryoneView
        });
      }
      if (privateCategory) {
        const explicitAccess = Array.isArray(accessRoleNames);
        const allowedRoleNames = explicitAccess ? new Set(accessRoleNames) : PRIVATE_ACCESS_ROLES;
        for (const roleName of selected.roles.filter(name => allowedRoleNames.has(name))) {
          const role = guild.roles.cache.find(item => mutationResourceNameMatches(item.name, roleName) && !item.managed);
          if (!role) continue;
          const actual = overwriteViewDecision(permissionOverwriteFor(category, role.id)) || "inherit";
          if (actual !== "allow") {
            categoryPermissionMismatches.push({
              categoryId: category.id,
              categoryName,
              targetId: role.id,
              targetName: roleName,
              expected: "allow",
              actual
            });
          }
        }
        if (explicitAccess) {
          for (const roleName of selected.roles.filter(name => !allowedRoleNames.has(name))) {
            const role = guild.roles.cache.find(item => mutationResourceNameMatches(item.name, roleName) && !item.managed);
            if (!role) continue;
            const actual = overwriteViewDecision(permissionOverwriteFor(category, role.id)) || "inherit";
            if (actual !== "inherit") {
              categoryPermissionMismatches.push({
                categoryId: category.id,
                categoryName,
                targetId: role.id,
                targetName: roleName,
                expected: "inherit",
                actual
              });
            }
          }
        }
      }
    }
    for (const channelName of channelNames) {
      const expectedType = paradiseSetupChannelType(categoryName, channelName);
      desiredChannelKeys.add(`${expectedType}:${normalizedMutationResourceName(channelName)}`);
      const matches = [...guild.channels.cache.values()]
        .filter(channel => mutationResourceNameMatches(channel.name, channelName) && channel.type === expectedType);
      if (matches.length === 0 || (category && !matches.some(channel => channel.parentId === category.id))) {
        missingDesiredChannels.push({ name: channelName, type: expectedType, parent: categoryName });
      }
      if (matches.length > 1) duplicateDesiredChannels.push({ name: channelName, type: expectedType, count: matches.length });
      const canonical = category
        ? matches.find(channel => channel.parentId === category.id)
        : matches[0];
      const normalizedCategory = normalizedMutationResourceName(categoryName);
      const normalizedChannel = normalizedMutationResourceName(channelName);
      const isTurkish = normalizedCategory === normalizedMutationResourceName("〆・PRIVATE TURKISH");
      const isVideo = normalizedCategory === normalizedMutationResourceName("〆・PRIVATE VIDEO TEAM");
      const isAnnouncements = isTurkish
        && normalizedChannel === normalizedMutationResourceName("〆・turkish-announcements");
      const isPrivateVoice = expectedType === ChannelType.GuildVoice && (isTurkish || isVideo);
      if (canonical && (isAnnouncements || isPrivateVoice)) {
        const expectedRoles = isTurkish
          ? COMMUNITY_TURKISH_ACCESS_ROLES
          : COMMUNITY_VIDEO_TEAM_ACCESS_ROLES;
        const checks = [{
          target: guild.roles.everyone,
          targetName: "@everyone",
          permissions: {
            ViewChannel: "deny",
            ...(isAnnouncements ? { SendMessages: "deny" } : {}),
            ...(isPrivateVoice ? { Connect: "deny" } : {})
          }
        }];
        for (const roleName of expectedRoles) {
          const role = guild.roles.cache.find(item => mutationResourceNameMatches(item.name, roleName) && !item.managed);
          if (!role) continue;
          const staff = COMMUNITY_STAFF_ACCESS_ROLES.includes(roleName);
          checks.push({
            target: role,
            targetName: roleName,
            permissions: {
              ViewChannel: "allow",
              ...(isAnnouncements ? { SendMessages: staff ? "allow" : "deny" } : {}),
              ...(isPrivateVoice ? { Connect: "allow" } : {})
            }
          });
        }
        for (const check of checks) {
          const overwrite = permissionOverwriteFor(canonical, check.target?.id);
          for (const [permission, expected] of Object.entries(check.permissions)) {
            const flag = PermissionsBitField.Flags[permission];
            const actual = overwrite?.allow?.has?.(flag)
              ? "allow"
              : overwrite?.deny?.has?.(flag) ? "deny" : "inherit";
            if (actual !== expected) {
              channelPermissionMismatches.push({
                channelId: canonical.id,
                channelName,
                targetId: check.target?.id,
                targetName: check.targetName,
                permission,
                expected,
                actual
              });
            }
          }
        }
      }
    }
  }
  const extraChannels = [...guild.channels.cache.values()]
    .filter(channel => !channel.isThread?.()
      && !desiredChannelKeys.has(`${channel.type}:${normalizedMutationResourceName(channel.name)}`))
    .map(channel => ({ id: channel.id, name: channel.name, type: channel.type }));
  const desiredRoleNames = new Set(selected.roles.map(normalizedMutationResourceName));
  const extraRoles = [...guild.roles.cache.values()]
    .filter(role => role.id !== guild.id
      && !role.managed
      && !desiredRoleNames.has(normalizedMutationResourceName(role.name)))
    .map(role => ({ id: role.id, name: role.name, position: role.position }));
  const roleIconReadiness = selected?.roles === PARADISE_COMMUNITY_ROLES
    ? inspectParadiseCommunityExtendedRoleIconReadiness(guild, roleIconOptions)
    : null;
  const roleIconMismatches = roleIconReadiness?.mismatches || [];
  const roleIconBlockers = roleIconReadiness?.blockers || [];
  return {
    ready: missingDesiredRoles.length === 0
      && duplicateDesiredRoles.length === 0
      && rolePermissionMismatches.length === 0
      && missingDesiredChannels.length === 0
      && duplicateDesiredChannels.length === 0
      && categoryPermissionMismatches.length === 0
      && channelPermissionMismatches.length === 0
      && extraChannels.length === 0
      && extraRoles.length === 0
      && (!roleIconReadiness || roleIconReadiness.ready),
    missingDesiredRoles,
    duplicateDesiredRoles,
    rolePermissionMismatches,
    missingDesiredChannels,
    duplicateDesiredChannels,
    categoryPermissionMismatches,
    channelPermissionMismatches,
    extraChannels,
    extraRoles,
    roleIconReadiness,
    roleIconMismatches,
    roleIconBlockers
  };
}

async function rebuildParadiseTemplateUnlocked(
  guild,
  mode,
  confirmation,
  mutationPolicy = PARADISE_TEST_REBUILD_POLICY
) {
  const { selected, expected } = assertParadiseMutationPolicy(guild, mode, confirmation, mutationPolicy, {
    confirmationRequired: mutationPolicy?.isProduction !== true
  });
  assertParadiseProductionExecutionCapability(guild, mode, mutationPolicy);
  await assertNoUnresolvedParadiseRollback(guild.id);

  const fail = (code, details = {}) => {
    const error = new Error(code);
    error.code = code;
    Object.assign(error, details);
    throw error;
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await updateParadiseMutationLease({ phase: "capturing_complete_backup", status: "active" });
  const state = await loadState();
  const snapshot = await captureParadiseGuildBackupSnapshot(guild, { state });
  const backup = createParadiseBackupEnvelope(snapshot);
  const backupValidation = validateParadiseBackupEnvelope(backup);
  if (!backupValidation.valid) fail("backup_envelope_validation_failed", { validation: backupValidation });
  if (mutationPolicy.isProduction
      && paradiseBackupStateDigest(backup).toLowerCase() !== String(mutationPolicy.expectedBackupDigest || "").toLowerCase()) {
    fail("production_preflight_backup_digest_mismatch");
  }
  const restoreDryRun = buildParadiseRestoreDryRun({
    backup,
    currentSnapshot: snapshot,
    expectedGuildId: guild.id,
    allowedGuildId: mutationPolicy.allowedGuildId
  });
  if (!restoreDryRun.canRestore) fail("backup_restore_dry_run_failed", { restoreDryRun });

  await updateParadiseMutationLease({ phase: "persisting_verified_backup" });
  const timestampedBackupPath = await writeArtifact(`${mutationPolicy.artifactPrefix}-backup-${mode}-${stamp}.json`, backup);
  const canonicalBackupPath = await writeArtifact(`${mutationPolicy.artifactPrefix}-pre-rebuild-backup.json`, backup);
  const restoreDryRunPath = await writeArtifact(`${mutationPolicy.restoreArtifactPrefix}-restore-dry-run.json`, restoreDryRun);

  await updateParadiseMutationLease({ phase: "validating_persisted_backup" });
  const readPersistedBackup = async (artifact, artifactPath) => {
    try {
      return JSON.parse(await fs.readFile(artifactPath, "utf8"));
    } catch (cause) {
      fail("persisted_backup_read_failed", { artifact, artifactPath, cause });
    }
  };
  const diskBackup = await readPersistedBackup("timestamped", timestampedBackupPath);
  const canonicalDiskBackup = await readPersistedBackup("canonical", canonicalBackupPath);
  const persistedBackupValidation = validateParadiseBackupArtifactCopies({
    timestampedBackup: diskBackup,
    canonicalBackup: canonicalDiskBackup,
    expectedBackup: backup,
    expectedGuildId: guild.id
  });
  if (!persistedBackupValidation.valid) {
    fail("persisted_backup_validation_failed", { persistedBackupValidation });
  }

  const leaseStatus = await paradisePersistentMutationLockStatus(guild.id).catch(() => null);
  let rollbackMarker = await armParadiseRollbackMarker({
    guildId: guild.id,
    backupArtifact: timestampedBackupPath,
    backupDigest: diskBackup.integrity.digest,
    mode: `${mutationPolicy.isProduction ? "production_ft_community_rebuild" : "test_guild_rebuild"}:${mode}`,
    confirmation: mutationPolicy.isProduction
      ? paradiseProductionRestoreConfirmation(diskBackup)
      : paradiseRestoreConfirmation(diskBackup),
    correlationId: leaseStatus?.correlationId || crypto.randomUUID()
  });

  const deleted = { channels: 0, roles: 0 };
  const deletionFailures = { channels: [], roles: [] };
  let roleDeduplication = { deleted: [], failed: [], protected: [], memberMigrations: 0 };
  let channelDeduplication = { deleted: [], failed: [], reparented: [] };
  try {
    rollbackMarker = await updateParadiseRollbackMarker(guild.id, rollbackMarker.markerId, {
      status: "rebuild_in_progress"
    });
    await updateParadiseMutationLease({ phase: "deleting_existing_channels", status: "active" });
    const channels = [...guild.channels.cache.values()]
      .filter(channel => !channel.isThread?.())
      .sort((a, b) => Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)));
    for (const channel of channels) {
      try {
        await channel.delete(`${mutationPolicy.auditReason} ${mode} rebuild`);
        guild.channels.cache.delete(channel.id);
        deleted.channels += 1;
      } catch (error) {
        if (isParadiseUnknownChannelError(error)) {
          // A category deletion or a concurrent Discord cache refresh can make a
          // cached child disappear before its turn. The desired end state has
          // already been reached, so treat Discord's Unknown Channel as an
          // idempotent success while keeping every other API/permission error
          // fail-closed.
          guild.channels.cache.delete(channel.id);
          continue;
        }
        deletionFailures.channels.push({ id: channel.id, name: channel.name, code: String(error?.code || "unknown") });
        fail(`${mutationPolicy.failurePrefix}_channel_delete_failed`, { deletionFailures });
      }
    }

    await updateParadiseMutationLease({ phase: "deleting_existing_roles" });
    const me = guild.members.me || await guild.members.fetchMe();
    const desiredRoleNames = new Set(selected.roles.map(normalizedMutationResourceName));
    const roles = [...guild.roles.cache.values()]
      .filter(role => !role.managed
        && role.id !== guild.id
        && role.position < me.roles.highest.position
        && !desiredRoleNames.has(normalizedMutationResourceName(role.name)))
      .sort((a, b) => a.position - b.position);
    for (const role of roles) {
      try {
        await role.delete(`${mutationPolicy.auditReason} ${mode} rebuild`);
        guild.roles.cache.delete(role.id);
        deleted.roles += 1;
      } catch (error) {
        deletionFailures.roles.push({ id: role.id, name: role.name, code: String(error?.code || "unknown") });
        fail(`${mutationPolicy.failurePrefix}_role_delete_failed`, { deletionFailures });
      }
    }

    await updateParadiseMutationLease({ phase: "deduplicating_roles" });
    await guild.channels.fetch();
    await guild.roles.fetch();
    roleDeduplication = await cleanupParadiseDesiredRoleDuplicates(guild, selected.roles, me, mutationPolicy);
    deleted.roles += roleDeduplication.deleted.length;
    if (roleDeduplication.failed.length) fail(`${mutationPolicy.failurePrefix}_role_deduplication_failed`, { roleDeduplication });

    await updateParadiseMutationLease({ phase: "installing_template" });
    const installed = await applyParadiseTemplateMissingOnlyUnlocked(guild, mode, {
      repairPermissions: true,
      mutationPolicy
    });
    if (installed.status !== "LIVE DISCORD VERIFIED") {
      fail(`${mutationPolicy.failurePrefix}_installation_not_verified`, { installed });
    }

    await updateParadiseMutationLease({ phase: "deduplicating_channels" });
    const installedState = await loadState();
    const mappedChannelIds = new Set(Object.values(configForGuild(installedState, guild.id).channelMappings || {})
      .filter(Boolean)
      .map(String));
    channelDeduplication = await cleanupParadiseDesiredChannelDuplicates(guild, selected, {
      mappedChannelIds,
      mutationPolicy
    });
    deleted.channels += channelDeduplication.deleted.length;
    if (channelDeduplication.failed.length) fail(`${mutationPolicy.failurePrefix}_channel_deduplication_failed`, { channelDeduplication });

    await updateParadiseMutationLease({ phase: "verifying_rebuilt_structure" });
    await guild.channels.fetch();
    await guild.roles.fetch();
    const structureVerification = verifyParadiseTemplateStructure(guild, selected);
    if (!structureVerification.ready) {
      fail(`${mutationPolicy.failurePrefix}_structure_not_verified`, { structureVerification });
    }

    const postRebuildState = await loadState();
    const postRebuildSnapshot = await captureParadiseGuildBackupSnapshot(guild, { state: postRebuildState });
    const postRebuildBackup = createParadiseBackupEnvelope(postRebuildSnapshot);
    const postRebuildValidation = validateParadiseBackupEnvelope(postRebuildBackup);
    if (!postRebuildValidation.valid) {
      fail("post_rebuild_backup_validation_failed", { postRebuildValidation });
    }
    const reconciliation = buildParadiseRestoreDryRun({
      backup: postRebuildBackup,
      currentSnapshot: postRebuildSnapshot,
      expectedGuildId: guild.id,
      allowedGuildId: mutationPolicy.allowedGuildId
    });
    if (!reconciliation.canRestore || reconciliation.mutationsPlanned !== 0) {
      fail("post_rebuild_reconciliation_failed", { reconciliation });
    }
    const postRebuildBackupPath = await writeArtifact(`${mutationPolicy.artifactPrefix}-post-rebuild-${mode}-${stamp}.json`, postRebuildBackup);
    const reconciliationEvidence = {
      ...reconciliation,
      verifiedAt: new Date().toISOString(),
      backupArtifact: postRebuildBackupPath,
      source: "fresh_post_rebuild_snapshot"
    };
    const reconciliationPath = await writeArtifact(`${mutationPolicy.artifactPrefix}-reconciliation-${mode}-${stamp}.json`, reconciliationEvidence);
    const retainRollbackMarkerForRehearsal = mutationPolicy.retainRollbackMarkerForRehearsal === true
      && mutationPolicy.isProduction !== true;
    const retainRollbackMarkerForProduction = mutationPolicy.isProduction === true;
    rollbackMarker = retainRollbackMarkerForRehearsal
      ? await updateParadiseRollbackMarker(guild.id, rollbackMarker.markerId, {
          status: "smoke_in_progress",
          reconciliation: { ...reconciliationEvidence, artifact: reconciliationPath }
        })
      : retainRollbackMarkerForProduction
        ? await updateParadiseRollbackMarker(guild.id, rollbackMarker.markerId, {
            status: "rollback_required",
            pendingFinalization: true,
            phase: "orchestrator_verification_pending",
            reconciliation: { ...reconciliationEvidence, artifact: reconciliationPath }
          })
        : await resolveParadiseRollbackMarker(guild.id, rollbackMarker.markerId, {
            ...reconciliationEvidence,
            artifact: reconciliationPath
          });
    await updateParadiseMutationLease({
      phase: retainRollbackMarkerForRehearsal
        ? "rebuild_reconciled_rehearsal_pending"
        : retainRollbackMarkerForProduction
          ? "rebuild_reconciled_orchestrator_pending"
          : "rebuild_reconciled",
      status: retainRollbackMarkerForRehearsal ? "active" : "completed",
      rollback: {
        markerId: rollbackMarker.markerId,
        status: retainRollbackMarkerForRehearsal
          ? "smoke_in_progress"
          : retainRollbackMarkerForProduction
            ? "rollback_required"
            : "not_required"
      },
      reconciliation: reconciliationEvidence
    });

    const result = {
      ...installed,
      status: "LIVE DISCORD VERIFIED",
      operation: mutationPolicy.operationLabel,
      confirmation: expected,
      deleted,
      deletionFailures,
      roleDeduplication,
      channelDeduplication,
      structureVerification,
      preservedDesiredRoles: [...guild.roles.cache.values()]
        .filter(role => desiredRoleNames.has(normalizedMutationResourceName(role.name))).length,
      backup: timestampedBackupPath,
      canonicalBackup: canonicalBackupPath,
      restoreDryRun: { code: restoreDryRun.code, artifact: restoreDryRunPath },
      rollback: {
        required: retainRollbackMarkerForRehearsal || retainRollbackMarkerForProduction,
        markerId: rollbackMarker.markerId,
        markerStatus: rollbackMarker.status,
        pendingFinalization: retainRollbackMarkerForProduction
      },
      reconciliation: { ...reconciliationEvidence, artifact: reconciliationPath }
    };
    await writeArtifact(`${mutationPolicy.artifactPrefix}-full-rebuild-${mode}.json`, result);
    return result;
  } catch (originalError) {
    let rollback = null;
    let rollbackError = null;
    let reconciliation = null;
    try {
      rollbackMarker = await updateParadiseRollbackMarker(guild.id, rollbackMarker.markerId, {
        status: "rollback_in_progress",
        failure: sanitizeParadiseMutationFailure(originalError, `${mutationPolicy.failurePrefix}_failed`)
      });
      await updateParadiseMutationLease({ phase: "automatic_rollback", status: "rolling_back" });
      rollback = await withParadiseGuildMutationLock(guild, "automatic_rollback", async () => restoreParadiseGuildBackup({
        guild,
        backup: diskBackup,
        confirmation: mutationPolicy.isProduction
          ? paradiseProductionRestoreConfirmation(diskBackup)
          : paradiseRestoreConfirmation(diskBackup),
        allowedGuildId: mutationPolicy.allowedGuildId,
        productionAuthorization: mutationPolicy.isProduction ? {
          executionProof: mutationPolicy.executionProof,
          executionProofSecret: mutationPolicy.executionProofSecret,
          planId: mutationPolicy.planId,
          mode,
          nowMs: Date.now()
        } : null,
        currentState: await loadState(),
        persistRestoredState: persistParadiseRestoredState,
        reason: `FIMA automatic rollback after failed ${mutationPolicy.auditReason} ${mode} rebuild`
      }));
      rollbackMarker = await updateParadiseRollbackMarker(guild.id, rollbackMarker.markerId, {
        status: "restored_pending_reconciliation",
        rollback
      });
      await updateParadiseMutationLease({ phase: "reconciling_automatic_rollback", rollback });

      const restoredState = await loadState();
      const restoredSnapshot = await captureParadiseGuildBackupSnapshot(guild, { state: restoredState });
      reconciliation = buildParadiseRestoreDryRun({
        backup: diskBackup,
        currentSnapshot: restoredSnapshot,
        expectedGuildId: guild.id,
        allowedGuildId: mutationPolicy.allowedGuildId
      });
      const reconciliationPath = await writeArtifact(`${mutationPolicy.artifactPrefix}-rollback-reconciliation-${mode}-${stamp}.json`, {
        ...reconciliation,
        verifiedAt: new Date().toISOString(),
        backupArtifact: timestampedBackupPath,
        source: "fresh_post_rollback_snapshot"
      });
      reconciliation = { ...reconciliation, artifact: reconciliationPath };
      if (!reconciliation.canRestore || reconciliation.mutationsPlanned !== 0) {
        fail("automatic_rollback_reconciliation_failed", { reconciliation });
      }
      rollbackMarker = await resolveParadiseRollbackMarker(guild.id, rollbackMarker.markerId, reconciliation);
      await updateParadiseMutationLease({
        phase: "automatic_rollback_reconciled",
        status: "failed_rolled_back",
        rollback,
        reconciliation
      });
    } catch (error) {
      rollbackError = error;
      rollbackMarker = await updateParadiseRollbackMarker(guild.id, rollbackMarker.markerId, {
        status: "rollback_required",
        rollback,
        reconciliation,
        rollbackError: sanitizeParadiseMutationFailure(error, "automatic_rollback_failed")
      }).catch(() => rollbackMarker);
      await updateParadiseMutationLease({
        phase: "rollback_required",
        status: "failed",
        rollback,
        reconciliation
      }).catch(() => {});
    }
    originalError.rollback = rollback;
    originalError.rollbackError = rollbackError;
    originalError.reconciliation = reconciliation;
    originalError.rollbackMarker = rollbackMarker;
    throw originalError;
  }
}

async function upsertParadiseCommunitySmokePanel(guild, key, channel, payload) {
  const state = await loadState();
  const storedId = configForGuild(state, guild.id).smokePanelMessageIds?.[key];
  let message = storedId ? await channel.messages.fetch(storedId).catch(() => null) : null;
  if (message) await message.edit(payload); else message = await channel.send(payload);
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].smokePanelMessageIds = next.guildConfigs[guild.id].smokePanelMessageIds || {};
    next.guildConfigs[guild.id].smokePanelMessageIds[key] = message.id;
    return next;
  });
  return message;
}

function communityActivityBoardDescription(board) {
  const entries = board?.entries || [];
  if (!entries.length) return "_No qualifying activity has been recorded for this UTC month yet._";
  return entries.map(entry => {
    const score = board.board === "voice"
      ? `${Math.floor(Number(entry.voiceSeconds || 0) / 60)} min · ${entry.xp} XP`
      : `${entry.textMessages} messages · ${entry.xp} XP`;
    return `**${entry.rank}.** <@${entry.discordUserId}> · ${score}`;
  }).join("\n");
}

async function runParadiseCommunityTestSmokeSuite(guild, { fast = false } = {}) {
  assertParadiseTestGuildMutation({ guildId: guild?.id, operation: "community_test_smoke" });
  const state = await loadState();
  const guildConfig = configForGuild(state, guild.id);
  const activity = await inspectCommunityActivityReadiness(guild.client);
  if (!activity.ready) {
    const error = new Error("community_activity_not_ready");
    error.code = "community_activity_not_ready";
    error.readiness = activity;
    throw error;
  }

  const channelByName = names => cachedValues(guild.channels?.cache).find(channel =>
    names.includes(channel.name) && channel.isTextBased?.()
  ) || null;
  const textActivityChannel = await configuredChannel(guild, "level_channel", ["⌁・text-activity", "text-activity"]);
  const voiceActivityChannel = channelByName(["⌁・voice-activity", "voice-activity"]);
  const rewardsChannel = channelByName(["⌁・activity-rewards", "activity-rewards"]);
  if (!textActivityChannel || !voiceActivityChannel || !rewardsChannel) {
    const error = new Error("community_activity_channels_missing");
    error.code = "community_activity_channels_missing";
    throw error;
  }

  const color = await paradiseBrandColor();
  const seasonLabel = activity.season.key;
  const textBoard = await upsertParadiseCommunitySmokePanel(guild, "textActivity", textActivityChannel, {
    embeds: [new EmbedBuilder().setColor(color).setTitle("FIMA · TEXT ACTIVITY")
      .setDescription(`# ${seasonLabel} UTC leaderboard\n${communityActivityBoardDescription(activity.leaderboards.text)}\n\n-# Monthly reset · Anti-spam scoring · Top 3: 15 / 10 / 7 FIMA Macro days`)
      .setFooter({ text: "FT Community · Text activity" })]
  });
  const voiceBoard = await upsertParadiseCommunitySmokePanel(guild, "voiceActivity", voiceActivityChannel, {
    embeds: [new EmbedBuilder().setColor(color).setTitle("FIMA · VOICE ACTIVITY")
      .setDescription(`# ${seasonLabel} UTC leaderboard\n${communityActivityBoardDescription(activity.leaderboards.voice)}\n\n-# Monthly reset · Non-AFK voice only · Top 3: 15 / 10 / 7 FIMA Macro days`)
      .setFooter({ text: "FT Community · Voice activity" })]
  });
  const rewardBoard = await upsertParadiseCommunitySmokePanel(guild, "activityRewards", rewardsChannel, {
    embeds: [new EmbedBuilder().setColor(color).setTitle("FIMA · ACTIVITY REWARDS")
      .setDescription("# Monthly FIMA Macro rewards\n**1st:** 15 days\n**2nd:** 10 days\n**3rd:** 7 days\n\nText and Voice rewards stack. Every verified boost adds **3 days** for that UTC month. Lifetime entitlements are never shortened or replaced.\n\n-# Universal first-use trial: disabled")
      .setFooter({ text: "FT Community · Idempotent reward ledger" })]
  });

  const ownerId = guild.ownerId;
  const owner = await guild.members.fetch(ownerId).catch(() => null);
  if (owner) {
    await sendMemberLifecycleMessage(owner, "join");
    await sendMemberLifecycleMessage(owner, "leave");
  }
  const staffTeam = await updateStaffTeamEmbed(guild).catch(() => null);
  const helpGuide = fast ? null : await publishSetupGuides(guild, "community").catch(() => null);
  const applicationChannel = await configuredChannel(guild, "application_ticket_channel", ["⌁・applications", "applications"]);
  const supportChannel = await configuredChannel(guild, "support_ticket_channel", ["⌁・support", "support"]);
  const moderationChannel = await configuredChannel(guild, "moderation_requests_channel", ["〆・staff-security-logs", "moderation-requests"]);
  const securityChannel = await configuredChannel(guild, "quarantine_review_channel", ["〆・staff-security-logs", "quarantine-review"]);
  const applicationPanel = applicationChannel
    ? await upsertParadiseCommunitySmokePanel(guild, "application", applicationChannel, paradiseApplicationPanelPayload(
      color, guildLanguage(guildConfig), guildConfig.applicationSettings
    ))
    : null;
  const supportPanel = supportChannel
    ? await upsertParadiseCommunitySmokePanel(guild, "support", supportChannel, paradiseSupportPanelPayload(
      color, guildLanguage(guildConfig), "community"
    ))
    : null;
  const supportTicket = owner && supportChannel
    ? await createParadiseSupportTicket(guild, owner.user, supportChannel, { test: true })
    : null;
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
        requestedBy: ownerId, reason: "Safe FT Community approval-queue test; no member action is executed.",
        status: "pending", test: true, createdAt: new Date().toISOString()
      };
      await saveState(next => {
        next.moderationCases[guild.id] = next.moderationCases[guild.id] || {};
        next.moderationCases[guild.id][moderationRecord.id] = moderationRecord;
        return next;
      });
    }
    moderationPanel = await upsertParadiseCommunitySmokePanel(guild, "moderation", moderationChannel, {
      embeds: [new EmbedBuilder().setColor(color).setTitle("FIMA MODERATION · SAFE TEST")
        .setDescription(`Case: \`${moderationRecord.id.slice(0, 8)}\`\nRequested by: <@${ownerId}>\nAction: **review-only**\n\nThis validates the senior approval queue without applying a member action.`)
        .setFooter({ text: "FT Community · No action on approval" })],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`paradise_mod_approve:${moderationRecord.id}`).setLabel("Approve safe test").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`paradise_mod_deny:${moderationRecord.id}`).setLabel("Deny safe test").setStyle(ButtonStyle.Secondary)
      )]
    });
  }
  const securityPanel = securityChannel
    ? await upsertParadiseCommunitySmokePanel(guild, "security", securityChannel, {
      embeds: [new EmbedBuilder().setColor(color).setTitle("FIMA SECURITY · LIVE STATUS")
        .setDescription("# Audit-first protection\n- Discord AutoMod rules installed\n- Invite/scam and mention-spam guards configured\n- Quarantine review channel mapped\n- Raid mode and lockdown remain owner/senior-staff actions\n- No automatic first-offense ban\n\n-# Safe test: this message changes no moderation state.")
        .setFooter({ text: "FT Community · Quarantine review" })]
    })
    : null;

  const readbackReady = staffTeam?.ready === true && (fast || helpGuide?.ready === true);

  const result = {
    status: readbackReady ? "LIVE DISCORD VERIFIED" : "LIVE DISCORD FAILED",
    completedAt: new Date().toISOString(),
    guildId: guild.id,
    template: "community",
    activity,
    training: null,
    tryout: null,
    welcomeLeaveSimulation: Boolean(owner),
    leaderboardBoards: [
      { board: "text", channelId: textBoard.channelId, messageId: textBoard.id, url: textBoard.url },
      { board: "voice", channelId: voiceBoard.channelId, messageId: voiceBoard.id, url: voiceBoard.url }
    ],
    staffTeam: sanitizeParadiseMessageReadback(staffTeam),
    helpGuide: fast
      ? { resolved: false, posted: false, verified: false, ready: false, reason: "fast_smoke_skipped" }
      : sanitizeParadiseMessageReadback(helpGuide),
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
      textActivity: { channelId: textBoard.channelId, messageId: textBoard.id, url: textBoard.url },
      voiceActivity: { channelId: voiceBoard.channelId, messageId: voiceBoard.id, url: voiceBoard.url },
      activityRewards: { channelId: rewardBoard.channelId, messageId: rewardBoard.id, url: rewardBoard.url }
    }
  };
  await writeArtifact("3a80-ft-community-live-smoke-suite.json", result);
  return result;
}

async function runParadiseTestSmokeSuiteUnlocked(guild, { fast = false } = {}) {
  let smokeStep = "guard";
  try {
  assertParadiseTestGuildMutation({ guildId: guild?.id, operation: "test_smoke" });
  const initialSmokeConfig = configForGuild(await loadState(), guild.id);
  const smokeTemplate = inferParadiseTemplate({
    configuredTemplate: initialSmokeConfig.activeSetupMode,
    guildName: guild.name
  });
  if (smokeTemplate === "community") return runParadiseCommunityTestSmokeSuite(guild, { fast });
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
      "https://www.roblox.com/share?code=FIMA-TEST",
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
      link: "https://www.roblox.com/share?code=FIMA-TEST",
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
      "https://www.roblox.com/share?code=FIMA-TEST",
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
      link: "https://www.roblox.com/share?code=FIMA-TEST",
      hoster: `<@${ownerId}>`
    }),
    allowedMentions: { users: [], roles: [], parse: [] }
  }, "smoke_tryout_send_failed");

  smokeStep = "lifecycle_send";
  const smokeFooter = smokeLanguage === "tr" ? "-# FIMA Bot yaşam döngüsü testi" : "-# FIMA Bot lifecycle rendering test";
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
        robloxUsername: "FimaBotTest",
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
  const supportConfig = configForGuild(await loadState(), guild.id);
  const applicationPanel = applicationChannel
    ? await upsertSmokePanel("application", applicationChannel, paradiseApplicationPanelPayload(
      await paradiseBrandColor(), guildLanguage(supportConfig), supportConfig.applicationSettings
    ))
    : null;
  const supportPanel = supportChannel
    ? await upsertSmokePanel("support", supportChannel, paradiseSupportPanelPayload(
      await paradiseBrandColor(), guildLanguage(supportConfig), supportConfig.activeSetupMode || "community"
    ))
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
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("FIMA BOT SECURITY · LIVE STATUS")
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
    await ensureSetupChannel(guild, {
      name: "level-leaderboard",
      type: ChannelType.GuildText,
      parent: parent?.id,
      reason: "FIMA Bot test-lab XP board verification"
    });
  }
  const xpBoard = await updateLevelLeaderboard(guild).catch(() => null);
  const readbackReady = staffTeam?.ready === true && (fast || helpGuide?.ready === true);
  const result = {
    status: readbackReady ? "LIVE DISCORD VERIFIED" : "LIVE DISCORD FAILED",
    completedAt: new Date().toISOString(),
    guildId: guild.id,
    training: { channelId: trainingChannel.id, messageId: training.id, url: training.url, plainMarkdown: Number(training.embeds?.size ?? training.embeds?.length ?? 0) === 0, lifecycleReplies: 3 },
    tryout: { channelId: tryoutChannel.id, messageId: tryout.id, url: tryout.url, plainMarkdown: Number(tryout.embeds?.size ?? tryout.embeds?.length ?? 0) === 0, lifecycleReplies: 3 },
    lifecycleMessages: 6,
    welcomeLeaveSimulation: Boolean(owner),
    leaderboardBoards,
    staffTeam: sanitizeParadiseMessageReadback(staffTeam),
    helpGuide: fast
      ? { resolved: false, posted: false, verified: false, ready: false, reason: "fast_smoke_skipped" }
      : sanitizeParadiseMessageReadback(helpGuide),
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

export async function runParadiseTestSmokeSuite(guild, { fast = false } = {}) {
  return withParadiseGuildMutationLock(guild, "smoke", async () => {
    await updateParadiseMutationLease({ phase: "live_smoke" });
    return runParadiseTestSmokeSuiteUnlocked(guild, { fast });
  }, {
    purposeKey: "discord_live_smoke",
    idempotencyKey: `${guild?.id}:smoke:${fast ? "fast" : "full"}`,
    phase: "request_validated",
    expectedGuildId: PARADISE_TEST_GUILD_ID
  });
}

function cachedValues(cache) {
  return cache?.values ? [...cache.values()] : [];
}

export function paradiseChannelNameMatches(actualName, expectedName) {
  const normalize = value => String(value || "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("tr");
  const actual = normalize(actualName);
  const expected = normalize(expectedName);
  if (!actual || !expected) return false;
  return actual === expected || actual.split("・").at(-1) === expected;
}

export function paradiseTextChannelByName(guild, ...names) {
  return cachedValues(guild?.channels?.cache).find(channel =>
    channel?.isTextBased?.()
    && names.some(name => paradiseChannelNameMatches(channel.name, name))
  ) || null;
}

function permissionOverwriteFor(channel, targetId) {
  return channel?.permissionOverwrites?.cache?.get?.(targetId) || null;
}

function overwriteViewDecision(overwrite) {
  if (!overwrite) return null;
  if (overwrite.allow?.has?.(PermissionsBitField.Flags.ViewChannel)) return "allow";
  if (overwrite.deny?.has?.(PermissionsBitField.Flags.ViewChannel)) return "deny";
  return null;
}

function channelDeniesEveryoneView(guild, channel) {
  const everyoneId = guild?.roles?.everyone?.id;
  if (!everyoneId || !channel) return false;
  const direct = overwriteViewDecision(permissionOverwriteFor(channel, everyoneId));
  if (direct) return direct === "deny";
  const parent = channel.parent
    || guild.channels?.cache?.get?.(channel.parentId)
    || null;
  return overwriteViewDecision(permissionOverwriteFor(parent, everyoneId)) === "deny";
}

async function liveMappedChannel(guild, guildConfig, mappingKey, legacyNames = []) {
  const configuredId = guildConfig?.channelMappings?.[mappingKey];
  if (configuredId) {
    let configured = guild.channels?.cache?.get?.(configuredId) || null;
    if (!configured && typeof guild.channels?.fetch === "function") {
      configured = await guild.channels.fetch(configuredId).catch(() => null);
    }
    return configured?.isTextBased?.() ? configured : null;
  }
  return paradiseTextChannelByName(guild, ...legacyNames);
}

function messageEmbedTitle(message) {
  const first = message?.embeds?.[0] || message?.embeds?.first?.() || null;
  return String(first?.title || "").trim();
}

function rankedLeaderboardGroups(guildConfig = {}) {
  const topSize = Math.min(100, Math.max(2, Number(guildConfig.challenge?.topSize) || 30));
  const groups = [];
  for (let min = 1; min <= topSize; min += 10) {
    const max = Math.min(min + 9, topSize);
    const channel = min <= 10 ? "top-10" : min <= 20 ? "top-20" : "top-30";
    groups.push({ channel, min, max, label: `TOP ${min}-${max}`, messageKey: `${channel}:${min}-${max}` });
  }
  return groups;
}

export async function inspectParadiseLiveTestLabReadiness(guild, guildConfig = {}) {
  const security = await inspectParadiseLiveSecurityReadiness(guild, guildConfig);
  const leaderboardMessageIds = guildConfig.rankedLeaderboardMessageIds || {};
  const groups = rankedLeaderboardGroups(guildConfig);
  let leaderboardBoardCount = 0;
  for (const group of groups) {
    const channel = paradiseTextChannelByName(guild, group.channel);
    const messageId = leaderboardMessageIds[group.messageKey]
      || (group.min <= 21 ? leaderboardMessageIds[group.channel] : null);
    const message = channel?.messages?.fetch && messageId
      ? await channel.messages.fetch(messageId).catch(() => null)
      : null;
    if (
      messageId
      && message?.id === messageId
      && (!message.channelId || message.channelId === channel.id)
      && messageEmbedTitle(message).startsWith("✦ #")
    ) leaderboardBoardCount += 1;
  }

  const staffChannel = paradiseTextChannelByName(guild, "staff-team", "personel-merkezi");
  const staffMessageId = guildConfig.staffTeamMessageId || null;
  const staffMessage = staffChannel?.messages?.fetch && staffMessageId
    ? await staffChannel.messages.fetch(staffMessageId).catch(() => null)
    : null;
  const staffTeamReady = Boolean(
    staffMessage?.id === staffMessageId
    && (!staffMessage.channelId || staffMessage.channelId === staffChannel.id)
    && messageEmbedTitle(staffMessage) === "✦ FIMA STAFF TEAM"
  );

  return {
    ...security,
    leaderboardBoardCount,
    leaderboardBoardExpectedCount: groups.length,
    leaderboardBoardsReady: groups.length > 0 && leaderboardBoardCount === groups.length,
    staffTeamReady
  };
}

function paradiseCollectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === "function") return [...collection.values()];
  return [];
}

function firstParadiseMessageEmbed(message) {
  return message?.embeds?.[0] || message?.embeds?.first?.() || null;
}

function failedParadiseMessageReadback({ resolved = false, posted = false, reason }) {
  return {
    resolved,
    posted,
    verified: false,
    ready: false,
    reason,
    message: null
  };
}

async function verifyParadiseMessageReadback(channel, message, {
  botUserId,
  expectedTitle,
  expectedBannerUrl = null,
  expectedThumbnail = null
} = {}) {
  if (!channel?.isTextBased?.()) {
    return failedParadiseMessageReadback({ reason: "channel_not_resolved" });
  }
  if (!message?.id) {
    return failedParadiseMessageReadback({ resolved: true, reason: "message_not_posted" });
  }
  if (typeof channel.messages?.fetch !== "function") {
    return failedParadiseMessageReadback({ resolved: true, posted: true, reason: "readback_unavailable" });
  }
  const fetched = await channel.messages.fetch(message.id).catch(() => null);
  if (!fetched) {
    return failedParadiseMessageReadback({ resolved: true, posted: true, reason: "readback_failed" });
  }
  if (fetched.id !== message.id) {
    return failedParadiseMessageReadback({ resolved: true, posted: true, reason: "message_id_mismatch" });
  }
  if (fetched.channelId !== channel.id) {
    return failedParadiseMessageReadback({ resolved: true, posted: true, reason: "channel_mismatch" });
  }
  if (!botUserId || fetched.author?.id !== botUserId) {
    return failedParadiseMessageReadback({ resolved: true, posted: true, reason: "author_mismatch" });
  }
  if (messageEmbedTitle(fetched) !== String(expectedTitle || "").trim()) {
    return failedParadiseMessageReadback({ resolved: true, posted: true, reason: "title_mismatch" });
  }

  const embed = firstParadiseMessageEmbed(fetched);
  if (expectedBannerUrl && String(embed?.image?.url || "") !== String(expectedBannerUrl)) {
    return failedParadiseMessageReadback({ resolved: true, posted: true, reason: "banner_mismatch" });
  }
  if (expectedThumbnail) {
    const expectedFilename = String(expectedThumbnail.file?.name || "");
    const attachments = paradiseCollectionValues(fetched.attachments);
    const attachment = attachments.find(item => item?.name === expectedFilename) || null;
    if (!expectedFilename || !attachment) {
      return failedParadiseMessageReadback({ resolved: true, posted: true, reason: "thumbnail_filename_mismatch" });
    }
    const thumbnailUrl = String(embed?.thumbnail?.url || "");
    const attachmentUrls = [attachment.url, attachment.proxyURL].filter(Boolean).map(String);
    if (!thumbnailUrl || !attachmentUrls.includes(thumbnailUrl)) {
      return failedParadiseMessageReadback({ resolved: true, posted: true, reason: "thumbnail_url_mismatch" });
    }
  }

  return {
    resolved: true,
    posted: true,
    verified: true,
    ready: true,
    reason: null,
    message: fetched
  };
}

function sanitizeParadiseMessageReadback(result, key = null) {
  return {
    ...(key ? { key } : {}),
    resolved: result?.resolved === true,
    posted: result?.posted === true,
    verified: result?.verified === true,
    ready: result?.ready === true,
    reason: result?.reason || null
  };
}

function paradisePayloadFirstEmbed(payload) {
  const embed = payload?.embeds?.[0] || null;
  return embed?.toJSON?.() || embed?.data || embed || {};
}

export async function inspectParadiseCommunityLiveEvidenceReadiness(guild, guildConfig = {}) {
  const unavailable = {
    liveEvidenceAvailable: false,
    textActivityReady: false,
    voiceActivityReady: false,
    activityRewardsPanelReady: false,
    applicationPanelReady: false,
    supportPanelReady: false,
    moderationPanelReady: false,
    securityPanelReady: false,
    helpGuideReady: false,
    staffTeamReady: false,
    verifiedCount: 0,
    requiredCount: 9,
    ready: false
  };
  if (!guild?.id || !guild.channels?.cache) return unavailable;

  const language = guildLanguage(guildConfig);
  const channelByName = names => paradiseTextChannelByName(guild, ...names);
  const [
    textActivityChannel,
    applicationChannel,
    supportChannel,
    moderationChannel,
    securityChannel,
    helpGuideChannel
  ] = await Promise.all([
    liveMappedChannel(guild, guildConfig, "level_channel", ["⌁・text-activity", "text-activity"]),
    liveMappedChannel(guild, guildConfig, "application_ticket_channel", ["⌁・applications", "applications", "application-ticket"]),
    liveMappedChannel(guild, guildConfig, "support_ticket_channel", ["⌁・support", "support", "support-ticket"]),
    liveMappedChannel(guild, guildConfig, "moderation_requests_channel", ["〆・staff-security-logs", "moderation-requests"]),
    liveMappedChannel(guild, guildConfig, "quarantine_review_channel", ["〆・staff-security-logs", "quarantine-review"]),
    liveMappedChannel(guild, guildConfig, "member_help_channel", [
      "⌁・faq-help", "⌁・bot-komutları", "◇・bot-komutları", "bot-commands", "command-guide"
    ])
  ]);
  const expectedApplicationTitle = safeApplicationPanelText(
    guildConfig.applicationSettings?.panelTitle,
    language === "en" ? "FIMA APPLICATIONS" : "FIMA BAŞVURULARI",
    80
  );
  const records = [
    {
      key: "textActivityReady",
      messageId: guildConfig.smokePanelMessageIds?.textActivity,
      channel: textActivityChannel,
      title: "FIMA · TEXT ACTIVITY"
    },
    {
      key: "voiceActivityReady",
      messageId: guildConfig.smokePanelMessageIds?.voiceActivity,
      channel: channelByName(["⌁・voice-activity", "voice-activity"]),
      title: "FIMA · VOICE ACTIVITY"
    },
    {
      key: "activityRewardsPanelReady",
      messageId: guildConfig.smokePanelMessageIds?.activityRewards,
      channel: channelByName(["⌁・activity-rewards", "activity-rewards"]),
      title: "FIMA · ACTIVITY REWARDS"
    },
    {
      key: "applicationPanelReady",
      messageId: guildConfig.smokePanelMessageIds?.application,
      channel: applicationChannel,
      title: expectedApplicationTitle
    },
    {
      key: "supportPanelReady",
      messageId: guildConfig.smokePanelMessageIds?.support,
      channel: supportChannel,
      title: language === "en" ? "FIMA SUPPORT" : "FIMA DESTEK"
    },
    {
      key: "moderationPanelReady",
      messageId: guildConfig.smokePanelMessageIds?.moderation,
      channel: moderationChannel,
      title: "FIMA MODERATION · SAFE TEST"
    },
    {
      key: "securityPanelReady",
      messageId: guildConfig.smokePanelMessageIds?.security,
      channel: securityChannel,
      title: "FIMA SECURITY · LIVE STATUS"
    },
    {
      key: "helpGuideReady",
      messageId: guildConfig.commandGuideMessageIds?.community,
      channel: helpGuideChannel,
      title: language === "en" ? "✦ FIMA MEMBER HELP" : "✦ FIMA ÜYE YARDIMI"
    },
    {
      key: "staffTeamReady",
      messageId: guildConfig.staffTeamMessageId,
      channel: channelByName(["staff-team", "personel-merkezi", "〆・staff-hub"]),
      title: "✦ FIMA STAFF TEAM"
    }
  ];

  const readinessEntries = await Promise.all(records.map(async record => {
    const storedId = String(record.messageId || "").trim();
    if (!storedId || !record.channel?.isTextBased?.() || typeof record.channel.messages?.fetch !== "function") {
      return [record.key, false];
    }
    const message = await record.channel.messages.fetch(storedId).catch(() => null);
    return [record.key, Boolean(
      message?.id === storedId
      && message.channelId === record.channel.id
      && message.author?.id === guild.client?.user?.id
      && messageEmbedTitle(message) === record.title
    )];
  }));
  const readiness = Object.fromEntries(readinessEntries);
  const verifiedCount = readinessEntries.filter(([, ready]) => ready).length;
  return {
    liveEvidenceAvailable: true,
    ...readiness,
    verifiedCount,
    requiredCount: records.length,
    ready: verifiedCount === records.length
  };
}

export async function inspectParadiseLiveSecurityReadiness(guild, guildConfig = {}) {
  const unavailable = {
    liveReadinessAvailable: false,
    blacklistedRoleReady: false,
    blacklistPermissionReady: false,
    blacklistLayout: null,
    securityPanelReady: false
  };
  if (!guild?.id || !guild.channels?.cache || !guild.roles?.cache || !guild.roles?.everyone) return unavailable;

  const roles = cachedValues(guild.roles.cache);
  const blacklistedRole = roles.find(role => role.name === "BLACKLISTED") || null;
  const appealChannel = await liveMappedChannel(guild, guildConfig, "blacklist_appeal_channel", [
    "blacklist-appeal", "ban-appeal"
  ]);
  const isLegacyAppeal = Boolean(appealChannel && ["blacklist-appeal", "ban-appeal"].includes(appealChannel.name));
  const legacyReviewChannels = cachedValues(guild.channels.cache).filter(channel =>
    ["unblacklist", "bail-review", "blacklist-logs"].includes(channel.name) && channel.isTextBased?.()
  );
  const legacyEveryoneDenied = appealChannel
    ? overwriteViewDecision(permissionOverwriteFor(appealChannel, guild.roles.everyone.id)) === "deny"
    : false;
  const legacyBlacklistedAllowed = appealChannel && blacklistedRole
    ? overwriteViewDecision(permissionOverwriteFor(appealChannel, blacklistedRole.id)) === "allow"
    : false;
  const legacyReady = Boolean(
    blacklistedRole
    && isLegacyAppeal
    && legacyEveryoneDenied
    && legacyBlacklistedAllowed
    && legacyReviewChannels.length >= 2
    && legacyReviewChannels.every(channel => channelDeniesEveryoneView(guild, channel))
  );

  const compactReviewChannels = (await Promise.all([
    liveMappedChannel(guild, guildConfig, "quarantine_review_channel"),
    liveMappedChannel(guild, guildConfig, "blacklist_logs_channel")
  ])).filter(Boolean);
  const uniqueCompactReviewChannels = [...new Map(compactReviewChannels.map(channel => [channel.id, channel])).values()];
  const botPermissions = appealChannel?.permissionsFor?.(guild.members?.me) || null;
  const botCanCreatePrivateThreads = Boolean(
    botPermissions
    && botPermissions.has?.(PermissionsBitField.Flags.CreatePrivateThreads)
    && botPermissions.has?.(PermissionsBitField.Flags.SendMessagesInThreads)
  );
  const compactReady = Boolean(
    blacklistedRole
    && appealChannel
    && !isLegacyAppeal
    && appealChannel.type === ChannelType.GuildText
    && typeof appealChannel.threads?.create === "function"
    && botCanCreatePrivateThreads
    && !channelDeniesEveryoneView(guild, appealChannel)
    && uniqueCompactReviewChannels.length >= 2
    && uniqueCompactReviewChannels.every(channel =>
      channel.id !== appealChannel.id && channelDeniesEveryoneView(guild, channel)
    )
  );

  const securityChannel = await liveMappedChannel(guild, guildConfig, "quarantine_review_channel");
  const securityMessageId = guildConfig?.smokePanelMessageIds?.security || null;
  let securityMessage = null;
  if (securityChannel?.isTextBased?.() && securityMessageId && channelDeniesEveryoneView(guild, securityChannel)) {
    if (typeof securityChannel.messages?.fetch === "function") {
      securityMessage = await securityChannel.messages.fetch(securityMessageId).catch(() => null);
    }
  }
  const template = inferParadiseTemplate({
    configuredTemplate: guildConfig.activeSetupMode,
    guildName: guild.name
  });
  const expectedSecurityTitle = template === "community"
    ? "FIMA SECURITY · LIVE STATUS"
    : "FIMA BOT SECURITY · LIVE STATUS";
  const securityPanelReady = Boolean(
    securityMessage?.id === securityMessageId
    && (!securityMessage.channelId || securityMessage.channelId === securityChannel.id)
    && messageEmbedTitle(securityMessage) === expectedSecurityTitle
  );

  return {
    liveReadinessAvailable: true,
    blacklistedRoleReady: Boolean(blacklistedRole),
    blacklistPermissionReady: legacyReady || compactReady,
    blacklistLayout: legacyReady ? "legacy_dedicated" : compactReady ? "compact_private_thread" : null,
    securityPanelReady
  };
}

export function paradiseAutoSmokeRepairAction({
  existingTestLab = false,
  needsCompactLab = false,
  blacklistPermissionReady = false,
  roleIconReady = true,
  structureReady = true
} = {}) {
  if (needsCompactLab) return "compact_rebuild";
  if (!existingTestLab || !blacklistPermissionReady || !roleIconReady || !structureReady) {
    return "repair_permissions";
  }
  return "skip_existing_lab";
}

export function paradiseCommunitySmokeEvidenceReadiness(result = {}) {
  const evidence = {
    welcomeLeaveReady: result.welcomeLeaveReady === true,
    leaderboardReady: Number(result.leaderboardBoardCount || 0) === 2,
    staffTeamReady: result.staffTeamReady === true,
    helpGuideReady: result.helpGuideReady === true,
    applicationPanelReady: result.applicationPanelReady === true,
    supportPanelReady: result.supportPanelReady === true,
    supportTicketReady: result.supportTicketReady === true || Boolean(result.supportTicketChannelId),
    supportTicketTranscriptReady: result.supportTicketTranscriptReady === true,
    supportTicketReopenReady: result.supportTicketReopenReady === true,
    moderationPanelReady: result.moderationPanelReady === true,
    securityPanelReady: result.securityPanelReady === true,
    textActivityReady: result.textActivityReady === true,
    voiceActivityReady: result.voiceActivityReady === true,
    activityRewardsPanelReady: result.activityRewardsPanelReady === true,
    rewardPolicyReady: result.rewardPolicyReady === true,
    activityWorkerReady: result.activityWorkerReady === true,
    activityDatabaseReady: result.activityDatabaseReady === true,
    blacklistedRoleReady: result.blacklistedRoleReady === true,
    blacklistPermissionReady: result.blacklistPermissionReady === true
  };
  const missing = Object.entries(evidence)
    .filter(([, ready]) => !ready)
    .map(([key]) => key);
  return {
    ...evidence,
    ready: missing.length === 0,
    missing,
    missingCount: missing.length
  };
}

export async function runParadiseAutoSmokeOnce(guild) {
  return withParadiseGuildMutationLock(guild, "auto_smoke", () => runParadiseAutoSmokeOnceUnlocked(guild));
}

async function runParadiseAutoSmokeOnceUnlocked(guild) {
  try {
    assertParadiseTestGuildMutation({ guildId: guild?.id, operation: "auto_smoke" });
  } catch (error) {
    if (error.code === "test_guild_only") return { skipped: true, reason: "test_guild_only" };
    throw error;
  }
  try {
    const state = await loadState();
    const guildSecurityState = state.securityState?.[guild.id] || {};
    const smokeConfig = configForGuild(state, guild.id);
    const smokeTemplate = inferParadiseTemplate({
      configuredTemplate: smokeConfig.activeSetupMode,
      guildName: guild.name
    });
    const recordedTemplate = guildSecurityState.lastAutoSmokeResult?.template || null;
    const needsCompactLab = guildSecurityState.testLabLayoutRevision !== PARADISE_TEST_LAB_LAYOUT_REVISION
      || (Boolean(guildSecurityState.lastAutoSmokeResult) && recordedTemplate !== smokeTemplate);
    const existingTestLab = Boolean(guildSecurityState.lastAutoSmokeResult) && !needsCompactLab;
    const preSmokeReadiness = existingTestLab
      ? await inspectParadiseLiveTestLabReadiness(guild, smokeConfig)
      : null;
    const preCommunityLiveEvidence = existingTestLab && smokeTemplate === "community"
      ? await inspectParadiseCommunityLiveEvidenceReadiness(guild, smokeConfig)
      : null;
    const preActivityReadiness = existingTestLab && smokeTemplate === "community"
      ? await inspectCommunityActivityReadiness(guild.client)
      : null;
    const preRoleIconReadiness = existingTestLab && smokeTemplate === "community"
      ? inspectParadiseCommunityExtendedRoleIconReadiness(guild)
      : null;
    const preStructureVerification = existingTestLab && PARADISE_SETUP_SCHEMAS[smokeTemplate]
      ? verifyParadiseTemplateStructure(guild, PARADISE_SETUP_SCHEMAS[smokeTemplate])
      : null;
    const preStructureReady = preStructureVerification?.ready === true;
    const previousSmokeResult = guildSecurityState.lastAutoSmokeResult || {};
    const preCommunityEvidence = smokeTemplate === "community"
      ? paradiseCommunitySmokeEvidenceReadiness({
          ...previousSmokeResult,
          staffTeamReady: preCommunityLiveEvidence?.staffTeamReady === true,
          helpGuideReady: preCommunityLiveEvidence?.helpGuideReady === true,
          applicationPanelReady: preCommunityLiveEvidence?.applicationPanelReady === true,
          supportPanelReady: preCommunityLiveEvidence?.supportPanelReady === true,
          moderationPanelReady: preCommunityLiveEvidence?.moderationPanelReady === true,
          securityPanelReady: Boolean(
            preCommunityLiveEvidence?.securityPanelReady
            && preSmokeReadiness?.securityPanelReady
          ),
          textActivityReady: Boolean(
            preCommunityLiveEvidence?.textActivityReady
            && preActivityReadiness?.textLeaderboardReady
          ),
          voiceActivityReady: Boolean(
            preCommunityLiveEvidence?.voiceActivityReady
            && preActivityReadiness?.voiceLeaderboardReady
          ),
          activityRewardsPanelReady: preCommunityLiveEvidence?.activityRewardsPanelReady === true,
          rewardPolicyReady: Boolean(
            previousSmokeResult.rewardPolicyReady
            && preActivityReadiness?.rewardPolicyReady
          ),
          activityWorkerReady: preActivityReadiness?.workerActive === true,
          activityDatabaseReady: preActivityReadiness?.databaseReady === true,
          blacklistedRoleReady: preSmokeReadiness?.blacklistedRoleReady === true,
          blacklistPermissionReady: preSmokeReadiness?.blacklistPermissionReady === true
        })
      : null;
    const completedRevisionIsHealthy = Boolean(
      existingTestLab
      && preStructureReady
      && !guildSecurityState.lastAutoSmokeError
      && preSmokeReadiness?.blacklistPermissionReady
      && preSmokeReadiness?.securityPanelReady
      && (smokeTemplate !== "community" || preActivityReadiness?.ready)
      && (smokeTemplate !== "community" || preRoleIconReadiness?.ready)
      && (smokeTemplate !== "community" || preCommunityLiveEvidence?.ready)
      && (smokeTemplate !== "community" || preCommunityEvidence?.ready)
      && preSmokeReadiness?.leaderboardBoardsReady
      && preSmokeReadiness?.staffTeamReady
    );
    if (
      guildSecurityState.lastAutoSmokeRevision === PARADISE_AUTO_SMOKE_REVISION
      && completedRevisionIsHealthy
    ) {
      return { skipped: true, reason: "already_completed", revision: PARADISE_AUTO_SMOKE_REVISION };
    }
    const repairAction = paradiseAutoSmokeRepairAction({
      existingTestLab,
      needsCompactLab,
      blacklistPermissionReady: preSmokeReadiness?.blacklistPermissionReady === true,
      roleIconReady: smokeTemplate !== "community" || preRoleIconReadiness?.ready === true,
      structureReady: preStructureReady
    });
    // The test guild was expressly designated as a disposable template lab.
    // This call is still guarded inside rebuildParadiseTestTemplate by its
    // fixed guild ID and creates a timestamped backup before any deletion.
    const rebuildConfirmation = smokeTemplate === "community"
      ? "REBUILD TEST COMMUNITY"
      : smokeTemplate === "clan" ? "REBUILD TEST CLAN" : "REBUILD TEST TSBTR";
    const compactRebuild = repairAction === "compact_rebuild"
      ? await rebuildParadiseTestTemplate(guild, smokeTemplate, rebuildConfirmation)
      : null;
    // A full missing-only repair is needed for an empty lab, but repeating the
    // whole template on every healthy source revision delays panel smoke tests for minutes.
    // An existing lab with broken blacklist permissions must still be repaired.
    const repair = compactRebuild || (repairAction === "repair_permissions"
      ? await applyParadiseTemplateMissingOnly(guild, smokeTemplate, { repairPermissions: true })
      : { skipped: true, reason: "existing_test_lab" });
    const fastSmoke = existingTestLab && (
      smokeTemplate !== "community"
      || (repairAction === "skip_existing_lab" && preCommunityLiveEvidence?.helpGuideReady === true)
    );
    const result = await runParadiseTestSmokeSuite(guild, { fast: fastSmoke });
    const postSmokeConfig = configForGuild(await loadState(), guild.id);
    const liveReadiness = await inspectParadiseLiveTestLabReadiness(
      guild,
      postSmokeConfig
    );
    const liveCommunityEvidence = smokeTemplate === "community"
      ? await inspectParadiseCommunityLiveEvidenceReadiness(guild, postSmokeConfig)
      : null;
    const roleIconReadiness = smokeTemplate === "community"
      ? inspectParadiseCommunityExtendedRoleIconReadiness(guild)
      : null;
    if (roleIconReadiness && !roleIconReadiness.ready) {
      const error = new Error("community_role_icons_not_ready");
      error.code = "community_role_icons_not_ready";
      error.roleIconMismatchCount = Number(roleIconReadiness.mismatches?.length || 0);
      error.roleIconBlockerCount = Number(roleIconReadiness.blockers?.length || 0);
      throw error;
    }
    const postStructureVerification = PARADISE_SETUP_SCHEMAS[smokeTemplate]
      ? verifyParadiseTemplateStructure(guild, PARADISE_SETUP_SCHEMAS[smokeTemplate])
      : null;
    if (!postStructureVerification?.ready) {
      const error = new Error("community_structure_not_ready");
      error.code = "community_structure_not_ready";
      error.structureMismatchCount = [
        "missingDesiredRoles",
        "duplicateDesiredRoles",
        "rolePermissionMismatches",
        "missingDesiredChannels",
        "duplicateDesiredChannels",
        "categoryPermissionMismatches",
        "extraChannels",
        "extraRoles"
      ].reduce((count, key) => count + Number(postStructureVerification?.[key]?.length || 0), 0);
      throw error;
    }
    const persistedSmokeResult = {
      template: smokeTemplate,
      trainingMessageId: result.training?.messageId || null,
      tryoutMessageId: result.tryout?.messageId || null,
      trainingPlainMarkdown: result.training?.plainMarkdown === true,
      tryoutPlainMarkdown: result.tryout?.plainMarkdown === true,
      trainingLifecycleReplies: Number(result.training?.lifecycleReplies || 0),
      tryoutLifecycleReplies: Number(result.tryout?.lifecycleReplies || 0),
      welcomeLeaveReady: result.welcomeLeaveSimulation === true,
      leaderboardBoardCount: Number(result.leaderboardBoards?.length || 0),
      staffTeamReady: liveCommunityEvidence?.staffTeamReady === true,
      helpGuideReady: liveCommunityEvidence?.helpGuideReady === true,
      supportTicketChannelId: result.workflowPanels?.supportTicket?.channelId || null,
      supportTicketReady: Boolean(result.workflowPanels?.supportTicket?.channelId),
      supportTicketTranscriptReady: Boolean(result.workflowPanels?.supportTicket?.transcriptSaved),
      supportTicketReopenReady: Boolean(result.workflowPanels?.supportTicket?.closedThenReopened),
      applicationPanelReady: liveCommunityEvidence?.applicationPanelReady === true,
      supportPanelReady: liveCommunityEvidence?.supportPanelReady === true,
      moderationPanelReady: liveCommunityEvidence?.moderationPanelReady === true,
      securityPanelReady: Boolean(
        liveCommunityEvidence?.securityPanelReady
        && liveReadiness.securityPanelReady
      ),
      xpPanelReady: Boolean(result.workflowPanels?.xp),
      textActivityReady: liveCommunityEvidence?.textActivityReady === true,
      voiceActivityReady: liveCommunityEvidence?.voiceActivityReady === true,
      activityRewardsPanelReady: liveCommunityEvidence?.activityRewardsPanelReady === true,
      rewardPolicyReady: result.activity?.rewardPolicyReady === true,
      activityWorkerReady: result.activity?.workerActive === true,
      activityDatabaseReady: result.activity?.databaseReady === true,
      roleIconReady: roleIconReadiness?.ready === true,
      roleIconMismatchCount: Number(roleIconReadiness?.mismatches?.length || 0),
      roleIconBlockerCount: Number(roleIconReadiness?.blockers?.length || 0),
      repairCreatedChannels: Number(repair?.createdChannels ?? repair?.created?.channels ?? 0),
      repairCreatedRoles: Number(repair?.createdRoles ?? repair?.created?.roles ?? 0),
      blacklistedRoleReady: liveReadiness.blacklistedRoleReady === true,
      blacklistPermissionReady: liveReadiness.blacklistPermissionReady === true,
      blacklistLayout: liveReadiness.blacklistLayout
    };
    if (smokeTemplate === "community") {
      const smokeEvidence = paradiseCommunitySmokeEvidenceReadiness(persistedSmokeResult);
      if (!smokeEvidence.ready) {
        const error = new Error("community_smoke_evidence_incomplete");
        error.code = "community_smoke_evidence_incomplete";
        error.smokeEvidenceMissingCount = smokeEvidence.missingCount;
        throw error;
      }
    }
    await saveState(next => {
      next.securityState[guild.id] = {
        ...(next.securityState[guild.id] || {}),
        lastAutoSmokeRevision: PARADISE_AUTO_SMOKE_REVISION,
        testLabLayoutRevision: PARADISE_TEST_LAB_LAYOUT_REVISION,
        lastAutoSmokeAt: new Date().toISOString(),
        lastAutoSmokeError: null,
        lastAutoSmokeFailedAt: null,
        lastAutoSmokeResult: persistedSmokeResult
      };
      return next;
    });
    return {
      skipped: false,
      revision: PARADISE_AUTO_SMOKE_REVISION,
      template: smokeTemplate,
      repair,
      blacklistedRoleReady: liveReadiness.blacklistedRoleReady,
      blacklistPermissionReady: liveReadiness.blacklistPermissionReady,
      blacklistLayout: liveReadiness.blacklistLayout,
      roleIconReady: roleIconReadiness?.ready === true,
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

export async function paradiseTestLabStatus(guild = null) {
  const state = await loadState();
  const record = state.securityState?.[PARADISE_TEST_GUILD_ID] || {};
  const result = record.lastAutoSmokeResult || {};
  const stateConfig = guild?.id === PARADISE_TEST_GUILD_ID
    ? configForGuild(state, guild.id)
    : configForGuild(state, PARADISE_TEST_GUILD_ID);
  const template = result.template || inferParadiseTemplate({
    configuredTemplate: stateConfig.activeSetupMode,
    guildName: guild?.name
  });
  const liveReadiness = guild?.id === PARADISE_TEST_GUILD_ID
    ? await inspectParadiseLiveTestLabReadiness(guild, stateConfig)
    : {
        liveReadinessAvailable: false,
        blacklistedRoleReady: false,
        blacklistPermissionReady: false,
        blacklistLayout: null,
        securityPanelReady: false,
        leaderboardBoardCount: 0,
        leaderboardBoardExpectedCount: 0,
        leaderboardBoardsReady: false,
        staffTeamReady: false
      };
  const liveCommunityEvidence = guild?.id === PARADISE_TEST_GUILD_ID && template === "community"
    ? await inspectParadiseCommunityLiveEvidenceReadiness(guild, stateConfig)
    : {
        liveEvidenceAvailable: false,
        textActivityReady: false,
        voiceActivityReady: false,
        activityRewardsPanelReady: false,
        applicationPanelReady: false,
        supportPanelReady: false,
        moderationPanelReady: false,
        securityPanelReady: false,
        helpGuideReady: false,
        staffTeamReady: false,
        verifiedCount: 0,
        requiredCount: 9,
        ready: false
      };
  const liveActivityReadiness = guild?.id === PARADISE_TEST_GUILD_ID && template === "community"
    ? await inspectCommunityActivityReadiness(guild.client)
    : null;
  const selectedTemplate = guild?.id === PARADISE_TEST_GUILD_ID
    ? PARADISE_SETUP_SCHEMAS[template]
    : null;
  const structureVerification = selectedTemplate
    ? verifyParadiseTemplateStructure(guild, selectedTemplate)
    : null;
  const structureMismatchCount = structureVerification
    ? [
        "missingDesiredRoles",
        "duplicateDesiredRoles",
        "rolePermissionMismatches",
        "missingDesiredChannels",
        "duplicateDesiredChannels",
        "categoryPermissionMismatches",
        "extraChannels",
        "extraRoles"
      ].reduce((count, key) => count + Number(structureVerification[key]?.length || 0), 0)
    : 0;
  const structureReady = structureVerification?.ready === true;
  const roleIconReady = template === "community"
    && structureVerification?.roleIconReadiness?.ready === true;
  const roleIconMismatchCount = Number(structureVerification?.roleIconMismatches?.length || 0);
  const roleIconBlockerCount = Number(structureVerification?.roleIconBlockers?.length || 0);
  const smokeEvidence = paradiseCommunitySmokeEvidenceReadiness({
    ...result,
    staffTeamReady: liveCommunityEvidence.staffTeamReady === true,
    helpGuideReady: liveCommunityEvidence.helpGuideReady === true,
    applicationPanelReady: liveCommunityEvidence.applicationPanelReady === true,
    supportPanelReady: liveCommunityEvidence.supportPanelReady === true,
    moderationPanelReady: liveCommunityEvidence.moderationPanelReady === true,
    securityPanelReady: Boolean(
      liveCommunityEvidence.securityPanelReady
      && liveReadiness.securityPanelReady
    ),
    textActivityReady: Boolean(
      liveCommunityEvidence.textActivityReady
      && liveActivityReadiness?.textLeaderboardReady
    ),
    voiceActivityReady: Boolean(
      liveCommunityEvidence.voiceActivityReady
      && liveActivityReadiness?.voiceLeaderboardReady
    ),
    activityRewardsPanelReady: liveCommunityEvidence.activityRewardsPanelReady === true,
    rewardPolicyReady: Boolean(
      result.rewardPolicyReady
      && liveActivityReadiness?.rewardPolicyReady
    ),
    activityWorkerReady: liveActivityReadiness?.workerActive === true,
    activityDatabaseReady: liveActivityReadiness?.databaseReady === true,
    blacklistedRoleReady: liveReadiness.blacklistedRoleReady === true,
    blacklistPermissionReady: liveReadiness.blacklistPermissionReady === true
  });
  const currentRevisionReady = Boolean(
    record.lastAutoSmokeRevision === PARADISE_AUTO_SMOKE_REVISION
    && !record.lastAutoSmokeError
  );
  const communityReady = template === "community" && Boolean(
    currentRevisionReady
    && structureReady
    && roleIconReady
    && liveActivityReadiness?.ready
    && liveCommunityEvidence.ready
    && smokeEvidence.ready
  );
  return {
    completed: currentRevisionReady,
    template,
    communityReady,
    revision: record.lastAutoSmokeRevision || null,
    completedAt: record.lastAutoSmokeAt || null,
    lastError: record.lastAutoSmokeError || null,
    lastFailureAt: record.lastAutoSmokeFailedAt || null,
    structureVerificationAvailable: Boolean(structureVerification),
    structureReady,
    structureMismatchCount,
    roleIconReady,
    roleIconMismatchCount,
    roleIconBlockerCount,
    smokeEvidenceReady: smokeEvidence.ready,
    smokeEvidenceMissingCount: smokeEvidence.missingCount,
    trainingReady: Boolean(result.trainingMessageId),
    tryoutReady: Boolean(result.tryoutMessageId),
    trainingPlainMarkdown: result.trainingPlainMarkdown === true,
    tryoutPlainMarkdown: result.tryoutPlainMarkdown === true,
    trainingLifecycleReplies: Number(result.trainingLifecycleReplies || 0),
    tryoutLifecycleReplies: Number(result.tryoutLifecycleReplies || 0),
    leaderboardBoardCount: Number(result.leaderboardBoardCount || 0),
    leaderboardReady: smokeEvidence.leaderboardReady,
    welcomeLeaveReady: smokeEvidence.welcomeLeaveReady,
    staffTeamReady: smokeEvidence.staffTeamReady,
    helpGuideReady: smokeEvidence.helpGuideReady,
    supportTicketReady: smokeEvidence.supportTicketReady,
    supportTicketTranscriptReady: smokeEvidence.supportTicketTranscriptReady,
    supportTicketReopenReady: smokeEvidence.supportTicketReopenReady,
    applicationPanelReady: smokeEvidence.applicationPanelReady,
    supportPanelReady: smokeEvidence.supportPanelReady,
    moderationPanelReady: smokeEvidence.moderationPanelReady,
    leaderboardBoardExpectedCount: Number(liveReadiness.leaderboardBoardExpectedCount || 0),
    leaderboardBoardsReady: liveReadiness.leaderboardBoardsReady === true,
    liveReadinessAvailable: liveReadiness.liveReadinessAvailable,
    liveEvidenceAvailable: liveCommunityEvidence.liveEvidenceAvailable,
    liveEvidenceVerifiedCount: liveCommunityEvidence.verifiedCount,
    liveEvidenceRequiredCount: liveCommunityEvidence.requiredCount,
    securityPanelReady: smokeEvidence.securityPanelReady,
    xpPanelReady: result.xpPanelReady === true,
    textActivityReady: smokeEvidence.textActivityReady,
    voiceActivityReady: smokeEvidence.voiceActivityReady,
    activityRewardsPanelReady: smokeEvidence.activityRewardsPanelReady,
    rewardPolicyReady: smokeEvidence.rewardPolicyReady,
    activityWorkerReady: smokeEvidence.activityWorkerReady,
    activityDatabaseReady: smokeEvidence.activityDatabaseReady,
    blacklistedRoleReady: smokeEvidence.blacklistedRoleReady,
    blacklistPermissionReady: smokeEvidence.blacklistPermissionReady,
    blacklistLayout: liveReadiness.blacklistLayout,
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
  let savedProfile;
  try {
    savedProfile = await saveVerifiedProfile(interaction.user.id, {
      robloxId: String(challenge.robloxId), robloxUsername: challenge.username, verifiedAt: new Date().toISOString()
    });
  } catch (error) {
    if (error.code === "roblox_identity_already_verified") {
      return interaction.reply({ content: "This Roblox account is already verified to another FIMA Bot profile. Use the profile-transfer support flow instead.", ephemeral: true });
    }
    throw error;
  }
  verifiedProfiles.set(interaction.user.id, savedProfile);
  verificationChallenges.delete(interaction.user.id);
  await saveState(state => { delete state.verificationChallenges[interaction.user.id]; return state; });
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✓ ROBLOX VERIFIED")
      .setDescription(`Your Discord is now linked to **${challenge.username}**.\nYou can remove the code from your Roblox bio.\n\nPress **Create FIMA Profile** to choose your region.`)
      .setFooter(paradiseFooter("Identity verified"))],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("paradise_profile_create").setLabel("Create FIMA Profile").setStyle(ButtonStyle.Success)
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

async function completedProfile(discordId, guildId = null) {
  const profile = await verifiedProfile(discordId);
  if (!profile) return null;
  const state = await loadState();
  const guildProfile = guildId ? state.guildProfiles?.[guildId]?.[discordId] || {} : {};
  // Legacy profileId/region is read only as a compatibility fallback. New
  // profile state is guild-scoped so one server cannot overwrite another.
  const merged = fimaGuildProfileProjection(profile, guildProfile);
  return merged.profileId && merged.region ? merged : null;
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

async function profileEmbed(guild, discordId, viewer = {}) {
  const profile = await completedProfile(discordId, guild.id);
  if (!profile) return null;
  if (profile.visibility === "private" && viewer.userId !== discordId && viewer.isStaff !== true) return null;
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return null;
  const thumbnail = await robloxHeadshot(profile.robloxId);
  const state = await loadState();
  if (inferParadiseTemplate({ configuredTemplate: configForGuild(state, guild.id).activeSetupMode, guildName: guild.name }) === "community") {
    const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ FIMA PROFILE")
      .setDescription(`${member}\nVerified Roblox identity`)
      .addFields(
        { name: "Profile ID", value: `#${profile.profileId}`, inline: true },
        { name: "Roblox", value: String(profile.robloxUsername), inline: true },
        { name: "Region", value: String(profile.region || "Not selected"), inline: true }
      ).setFooter(paradiseFooter("Guild roles and permissions are managed separately"));
    if (thumbnail) embed.setThumbnail(thumbnail);
    return embed;
  }
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
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ FIMA BOT FIGHTER PROFILE")
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
        .setDescription("You must link your Roblox account before creating a FIMA Bot fighter profile.")],
      components: [verificationStartButton()],
      ephemeral: true
    });
  }
  const currentGuildProfile = await completedProfile(interaction.user.id, interaction.guildId);
  if (currentGuildProfile) {
    const embed = await profileEmbed(interaction.guild, interaction.user.id, { userId: interaction.user.id });
    return interaction.reply({
      content: `You already have a FIMA Bot fighter profile (ID: **#${currentGuildProfile.profileId}**).`,
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
    if (!await completedProfile(interaction.user.id, interaction.guildId)) return beginProfileCreation(interaction);
    return beginProfileRegionChange(interaction);
  }
  if (sub === "privacy") {
    const verified = await verifiedProfile(interaction.user.id);
    if (!verified) return beginProfileCreation(interaction);
    const visibility = interaction.options.getString("visibility") === "private" ? "private" : "public";
    await saveState(state => {
      state.guildProfiles = state.guildProfiles || {};
      state.guildProfiles[interaction.guildId] = state.guildProfiles[interaction.guildId] || {};
      state.guildProfiles[interaction.guildId][interaction.user.id] = {
        ...(state.guildProfiles[interaction.guildId][interaction.user.id] || {}),
        visibility,
        privacyUpdatedAt: new Date().toISOString()
      };
      return state;
    });
    return interaction.reply({ content: visibility === "private" ? "Your FIMA Bot profile is now private to other members; staff may still view it for moderation/support." : "Your FIMA Bot profile is now visible to members in this server.", ephemeral: true });
  }
  if (sub === "verify-status") {
    const profile = await verifiedProfile(interaction.user.id);
    const guildProfile = await completedProfile(interaction.user.id, interaction.guildId);
    const complete = Boolean(guildProfile);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ PROFILE VERIFICATION STATUS")
        .addFields(
          { name: "Roblox linked", value: profile?.robloxId ? "✓ Yes" : "✗ No", inline: true },
          { name: "Profile complete", value: complete ? "✓ Yes" : "✗ No", inline: true },
          { name: "Profile ID", value: guildProfile?.profileId ? `#${guildProfile.profileId}` : "Not assigned", inline: true },
          { name: "Region", value: guildProfile?.region || "Not selected", inline: true }
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
    const profileState = await loadState();
    const profiles = profileState.profiles || {};
    const guildProfiles = profileState.guildProfiles?.[interaction.guildId] || {};
    const matches = [];
    for (const [discordId, identity] of Object.entries(profiles)) {
      const profile = fimaGuildProfileProjection(identity, guildProfiles[discordId] || {});
      if (!profile.profileId || !profile.region) continue;
      const member = interaction.guild.members.cache.get(discordId);
      if (!member || (profile.visibility === "private" && interaction.user.id !== discordId && !canModerate(interaction.member))) continue;
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
      const profilesById = profiles;
      const menu = new StringSelectMenuBuilder().setCustomId("paradise_profile_lookup")
        .setPlaceholder("Choose the matching FIMA Bot profile")
        .addOptions(...matches.slice(0, 25).map(id => {
          const member = interaction.guild.members.cache.get(id);
          const profile = fimaGuildProfileProjection(profilesById[id] || {}, guildProfiles[id] || {});
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
  const embed = await profileEmbed(interaction.guild, targetId, { userId: interaction.user.id, isStaff: canModerate(interaction.member) });
  if (!embed) return interaction.reply({ content: `<@${targetId}> has not completed a FIMA Bot fighter profile.`, ephemeral: true });
  return interaction.reply({ embeds: [embed] });
}

async function handleProfileLookupSelect(interaction) {
  const targetId = interaction.values[0];
  const embed = await profileEmbed(interaction.guild, targetId, { userId: interaction.user.id, isStaff: canModerate(interaction.member) });
  if (!embed) return interaction.update({ content: "That profile is no longer available.", embeds: [], components: [] });
  return interaction.update({ content: "", embeds: [embed], components: [] });
}

async function handleProfileRegion(interaction) {
  const region = interaction.values[0];
  let saved = null;
  await saveState(state => {
    const identity = state.profiles[interaction.user.id];
    if (!identity) return state;
    ensureFimaGlobalProfileId(state, interaction.user.id);
    state.guildProfiles = state.guildProfiles || {};
    state.guildProfiles[interaction.guildId] = state.guildProfiles[interaction.guildId] || {};
    state.guildProfileMeta = state.guildProfileMeta || {};
    state.guildProfileMeta[interaction.guildId] = state.guildProfileMeta[interaction.guildId] || { nextProfileId: 100 };
    const existing = state.guildProfiles[interaction.guildId][interaction.user.id] || {};
    if (!existing.profileId) {
      const legacyId = Number(identity.profileId || 0);
      if (legacyId > 0) existing.profileId = legacyId;
      else {
        state.guildProfileMeta[interaction.guildId].nextProfileId = Number(state.guildProfileMeta[interaction.guildId].nextProfileId || 100) + 1;
        existing.profileId = state.guildProfileMeta[interaction.guildId].nextProfileId;
      }
    }
    const updatedAt = new Date().toISOString();
    saved = {
      ...existing,
      profileId: existing.profileId,
      region,
      visibility: existing.visibility === "private" ? "private" : "public",
      profileUpdatedAt: updatedAt,
      updatedAt
    };
    state.guildProfiles[interaction.guildId][interaction.user.id] = saved;
    return state;
  });
  if (!saved) return interaction.reply({ content: "Verify Roblox first.", ephemeral: true });
  const embed = await profileEmbed(interaction.guild, interaction.user.id, { userId: interaction.user.id });
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
  if (old.size) await member.roles.remove(old, "FIMA Bot rank replacement");
  const role = await ensureRole(guild, rankToRoleName(rank));
  await member.roles.add(role, "Approved FIMA Bot tryout result");
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
  if (!await completedProfile(target.id, interaction.guildId)) return interaction.reply({ content: "Target must complete `/profile create` first.", ephemeral: true });
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
  if (!await completedProfile(interaction.user.id, interaction.guildId)) {
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
    if (!await completedProfile(discordId, interaction.guildId)) continue;
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
    await message.pin("FIMA Bot live challenge context").catch(() => {});
  }
  return message;
}

async function createChallengeTicket(interaction, opponent, region = null) {
  if (!await completedProfile(interaction.user.id, interaction.guildId) || !await completedProfile(opponent.id, interaction.guildId)) {
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
    reason: "FIMA Bot verified challenge"
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

async function resolveParadiseChallengeCoReferee(interaction) {
  const coReferee = interaction.options.getUser("co_ref");
  if (!coReferee) return null;
  if (coReferee.id === interaction.user.id) {
    const error = new Error("challenge_co_referee_must_differ");
    error.code = "challenge_co_referee_must_differ";
    throw error;
  }
  const member = await interaction.guild.members.fetch(coReferee.id).catch(() => null);
  if (!member || !await canWorkReferee(member)) {
    const error = new Error("challenge_co_referee_not_authorized");
    error.code = "challenge_co_referee_not_authorized";
    throw error;
  }
  return coReferee;
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
    if (!ticket || ticket.status !== "open") return interaction.reply({ content: "Run this inside an open FIMA Bot challenge ticket.", ephemeral: true });
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
    let coReferee;
    try {
      coReferee = await resolveParadiseChallengeCoReferee(interaction);
    } catch {
      return interaction.reply({ content: "Co-referee must be another authorized referee.", ephemeral: true });
    }
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
      strikeReason: reason,
      coRefereeId: coReferee?.id || null,
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
          ...(coReferee ? [{ name: "Co-referee", value: `${coReferee}`, inline: true }] : []),
          { name: "Ticket ID", value: interaction.channelId, inline: false }
        ).setFooter(paradiseFooter("Senior referee approval required"))],
      components: [approvalRow]
    });
  }
  if (!await canWorkReferee(interaction.member)) return interaction.reply({ content: "Referee role required.", ephemeral: true });
  const submittedWinner = interaction.options.getUser("winner");
  const submittedLoser = interaction.options.getUser("loser");
  const ticketId = sub === "post" ? (interaction.options.getString("ticket_id") || interaction.channelId) : interaction.channelId;
  const state = await loadState();
  const ticket = state.pendingChallenges?.[ticketId];
  if (!ticket || !belongsToGuild(ticket, interaction.guildId) || ticket.status !== "open") {
    return interaction.reply({ content: "Submit the score inside an open FIMA Bot challenge ticket.", ephemeral: true });
  }
  const participants = new Set([ticket.challengerId, ticket.opponentId]);
  if (submittedWinner.id === submittedLoser.id || !participants.has(submittedWinner.id) || !participants.has(submittedLoser.id)) {
    return interaction.reply({ content: "Winner and loser must be the two fighters recorded in this challenge ticket.", ephemeral: true });
  }
  let submittedScore;
  try {
    submittedScore = normalizeParadiseChallengeScore(interaction.options.getString("score"));
  } catch {
    return interaction.reply({ content: "Use a score such as `10-5` or `Auto`; do not include player names or `to`.", ephemeral: true });
  }
  if (!await completedProfile(submittedWinner.id, interaction.guildId) || !await completedProfile(submittedLoser.id, interaction.guildId)) {
    return interaction.reply({ content: "Winner and loser must both have completed FIMA Bot fighter profiles.", ephemeral: true });
  }
  let coReferee;
  try {
    coReferee = await resolveParadiseChallengeCoReferee(interaction);
  } catch {
    return interaction.reply({ content: "Co-referee must be another authorized referee.", ephemeral: true });
  }
  const submissionId = crypto.randomUUID();
  const submission = {
    status: "pending", guildId: interaction.guildId, winnerId: submittedWinner.id, loserId: submittedLoser.id, score: submittedScore,
    refereeId: interaction.user.id,
    winnerSpot: sub === "post" ? (interaction.options.getInteger("winner_spot") ?? (submittedWinner.id === ticket.challengerId ? ticket.challengerSpot : ticket.opponentSpot)) : (submittedWinner.id === ticket.challengerId ? ticket.challengerSpot : ticket.opponentSpot),
    loserSpot: sub === "post" ? (interaction.options.getInteger("loser_spot") ?? (submittedLoser.id === ticket.challengerId ? ticket.challengerSpot : ticket.opponentSpot)) : (submittedLoser.id === ticket.challengerId ? ticket.challengerSpot : ticket.opponentSpot),
    note: sub === "post" ? interaction.options.getString("note") : null,
    strikeReason: submittedScore === "Auto" ? (sub === "post" ? interaction.options.getString("note") : null) : null,
    coRefereeId: coReferee?.id || null,
    ticketId,
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
      ...(coReferee ? [{ name: "Co-referee", value: `${coReferee}`, inline: true }] : []),
      { name: "Note", value: submission.note || "—", inline: false },
      { name: "Ticket ID", value: submission.ticketId || "—", inline: true },
      { name: "Status", value: "Pending Referee Manager / Experienced Referee approval", inline: false }
    ).setFooter({ text: "Made By Fieel" })], components: [approvalRow] });
}

export function canRoleNamesApproveScore(roleNames = [], isAdministrator = false) {
  return isAdministrator || roleNames.some(name =>
    ["Owner", "Overseer", "Referee Manager", "Head Referee", "Experienced Referee"].includes(name)
  );
}

export function normalizeParadiseChallengeScore(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "auto") return "Auto";
  const match = raw.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!match) {
    const error = new Error("invalid_challenge_score");
    error.code = "invalid_challenge_score";
    throw error;
  }
  const left = Number(match[1]);
  const right = Number(match[2]);
  if (left === right || left > 99 || right > 99) {
    const error = new Error("invalid_challenge_score");
    error.code = "invalid_challenge_score";
    throw error;
  }
  return `${left}-${right}`;
}

export function recordParadiseChallengeAudit(state, {
  guildId,
  action,
  actorId,
  submissionId = null,
  ticketId = null,
  metadata = {},
  now = new Date().toISOString()
} = {}) {
  if (!state || !guildId || !action) return state;
  state.challengeAudits = state.challengeAudits || {};
  const existing = Array.isArray(state.challengeAudits[guildId]) ? state.challengeAudits[guildId].slice(-99) : [];
  state.challengeAudits[guildId] = [...existing, {
    action: String(action).slice(0, 48),
    actorId: String(actorId || "system").slice(0, 32),
    submissionId: submissionId ? String(submissionId).slice(0, 80) : null,
    ticketId: ticketId ? String(ticketId).slice(0, 80) : null,
    metadata: redactParadiseLogValue(metadata),
    at: new Date(now).toISOString()
  }];
  return state;
}

// Keep the persistent part of an approved challenge result together.  The
// Discord posts, header refresh and transcript happen afterwards and are
// deliberately not allowed to leave a half-written leaderboard/ticket state.
// `saveState` persists this returned snapshot as one Setting value today; this
// pure helper also gives a future relational migration one place to wrap in a
// database transaction.
export function applyApprovedParadiseChallengeResult(state, {
  submissionId,
  approvedBy,
  now = Date.now()
} = {}) {
  const source = state && typeof state === "object" ? state : null;
  const record = source?.pendingChallenges?.[submissionId];
  if (!record || record.status !== "pending") {
    const error = new Error("challenge_submission_not_pending");
    error.code = "challenge_submission_not_pending";
    throw error;
  }
  const ticket = source.pendingChallenges?.[record.ticketId];
  if (!ticket || ticket.status !== "open" || !belongsToGuild(ticket, record.guildId)) {
    const error = new Error("challenge_ticket_not_open");
    error.code = "challenge_ticket_not_open";
    throw error;
  }
  const ticketParticipants = new Set([ticket.challengerId, ticket.opponentId]);
  if (!ticketParticipants.has(record.winnerId) || !ticketParticipants.has(record.loserId) || record.winnerId === record.loserId) {
    const error = new Error("challenge_ticket_participant_mismatch");
    error.code = "challenge_ticket_participant_mismatch";
    throw error;
  }
  const normalizedScore = normalizeParadiseChallengeScore(record.score);
  const next = structuredClone(source);
  const challengeConfig = configForGuild(next, record.guildId).challenge || {};
  const leaderboard = ensureLeaderboardForGuild(next, record.guildId);
  const normalCooldownDays = Math.max(0, Number(challengeConfig.cooldownDays || 3));
  const top10CooldownDays = Math.max(0, Number(challengeConfig.top10CooldownDays || 7));
  const immunityDays = Math.max(0, Number(challengeConfig.immunityDays || normalCooldownDays));
  const timestamp = new Date(now).toISOString();
  const winner = { ...(leaderboard[record.winnerId] || { wins: 0, losses: 0, history: [] }) };
  const loser = { ...(leaderboard[record.loserId] || { wins: 0, losses: 0, history: [] }) };
  const history = {
    resultId: submissionId,
    winnerId: record.winnerId,
    loserId: record.loserId,
    score: normalizedScore,
    at: timestamp
  };
  winner.wins = Number(winner.wins || 0) + 1;
  loser.losses = Number(loser.losses || 0) + 1;
  winner.spot = record.winnerSpot || winner.spot || null;
  loser.spot = record.loserSpot || loser.spot || null;
  winner.history = [...(winner.history || []), history].slice(-50);
  loser.history = [...(loser.history || []), history].slice(-50);
  loser.availability = {
    ...(loser.availability || {}),
    cooldownUntil: now + ((record.loserSpot && record.loserSpot <= 10 ? top10CooldownDays : normalCooldownDays) * 86_400_000)
  };
  winner.availability = {
    ...(winner.availability || {}),
    immunityUntil: now + ((record.winnerSpot && record.winnerSpot <= 10 ? top10CooldownDays : immunityDays) * 86_400_000)
  };
  leaderboard[record.winnerId] = winner;
  leaderboard[record.loserId] = loser;
  const closedTicket = {
    ...ticket,
    status: "closed",
    resultType: record.resultType || "score",
    winnerId: record.winnerId,
    loserId: record.loserId,
    finalScore: normalizedScore,
    refereeId: record.refereeId,
    approvedBy,
    closedAt: timestamp
  };
  next.pendingChallenges[record.ticketId] = closedTicket;
  const approvedRecord = { ...record, score: normalizedScore, status: "approved", approvedBy, decidedAt: timestamp };
  next.pendingChallenges[submissionId] = approvedRecord;
  const activity = next.staffActivity[record.refereeId] || {};
  activity.referee = [...(activity.referee || []), timestamp];
  next.staffActivity[record.refereeId] = activity;
  recordParadiseChallengeAudit(next, {
    guildId: record.guildId,
    action: "approved",
    actorId: approvedBy,
    submissionId,
    ticketId: record.ticketId,
    now: timestamp,
    metadata: {
      resultType: record.resultType || "score",
      winnerId: record.winnerId,
      loserId: record.loserId,
      score: normalizedScore,
      refereeId: record.refereeId,
      coRefereeId: record.coRefereeId || null,
      strikeReason: record.strikeReason || null
    }
  });
  return { state: next, record: approvedRecord, ticket: closedTicket, history };
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
      recordParadiseChallengeAudit(state, {
        guildId: interaction.guildId,
        action: "denied",
        actorId: interaction.user.id,
        submissionId: id,
        ticketId: record.ticketId,
        metadata: { refereeId: record.refereeId, resultType: record.resultType || "score" }
      });
      return state;
    });
    pendingChallenges.delete(id);
    return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(await paradiseBrandColor())
      .setTitle("Challenge Score — Denied").setFooter({ text: `Denied by ${interaction.user.username} • Made By Fieel` })], components: [] });
  }
  let applied;
  try {
    await saveState(state => {
      applied = applyApprovedParadiseChallengeResult(state, {
        submissionId: id,
        approvedBy: interaction.user.id
      });
      return applied.state;
    });
  } catch (error) {
    return interaction.reply({
      content: error?.code === "challenge_ticket_not_open"
        ? "This challenge ticket is no longer open; the result was not applied."
        : "The result could not be applied safely. No leaderboard changes were saved.",
      ephemeral: true
    });
  }
  pendingChallenges.delete(id);
  await updateAvailabilityPanel(interaction.guild).catch(() => {});
  const finalState = await loadState();
  const closedTicket = finalState.pendingChallenges[record.ticketId] || applied?.ticket;
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
    return interaction.reply({ content: posted.ready ? "Training handbook updated." : "Create `training-hoster-rules` first.", ephemeral: true });
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
  if (configForGuild(state, interaction.guildId).verification?.requireProfileForTrainingResult !== false && !await completedProfile(interaction.user.id, interaction.guildId)) {
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
      .setDescription(`**Server:** ${tournament.link}\n**Rules:** ${tournament.rules || "Standard FIMA Bot tournament rules."}\n**Prize:** ${tournament.prize || "None announced"}`)
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

export function selectParadiseGiveawayWinners(entries = [], count = 1, randomIndex = size => crypto.randomInt(size)) {
  const pool = [...new Set((entries || []).map(String).filter(Boolean))];
  const winners = [];
  while (pool.length && winners.length < Math.max(1, Number(count) || 1)) {
    const index = Math.max(0, Math.min(pool.length - 1, Number(randomIndex(pool.length)) || 0));
    winners.push(pool.splice(index, 1)[0]);
  }
  return winners;
}

function findParadiseGiveaway(state, guildId, prefix) {
  return Object.values(state.giveaways || {}).find(record => record.guildId === guildId && record.id?.startsWith(String(prefix || ""))) || null;
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
  { category: "FIMA Bot", prompt: "Bir challenge sonucu onaylanmadan önce hangi iki tarafsız kanıt türünden biri saklanmalıdır?", answers: ["video", "kayit", "recording", "proof"] },
  { category: "FIMA Bot", prompt: "Stage sisteminde en iyi stage numarası kaçtır?", answers: ["0", "stage 0"] },
  { category: "FIMA Bot", prompt: "Stage 1 Low Strong'dan sonraki rank nedir?", answers: ["stage 1 mid weak", "1 mid weak"] },
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
      .setDescription(`# ${question.prompt}\n\nDoğru cevabı bu kanala yaz. İlk doğru cevap kazanır.\n\n> Ödül otomatik ödenmez. Kazanan güvenli gamepass bağlantısını FIMA Bot paneliyle gönderir; owner kontrol ederek öder.\n\n-# ${question.category} · Her gün ${String(hour).padStart(2, "0")}:00 Europe/Berlin · Made By Fieel`)
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
  const payload = `QOTD reward claim · ${interaction.user} (${interaction.user.id}) · ${dateKey}\n${gamepassUrl}\nManual review required; FIMA Bot does not auto-pay.`;
  const dmSent = owner ? await owner.send(payload).then(() => true).catch(() => false) : false;
  let queueMessageId = null;
  if (rewardLog) {
    const queueMessage = await rewardLog.send({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("◆ 25 ROBUX PAYOUT · PENDING")
        .setDescription(`Winner: ${interaction.user}\nDate: **${dateKey}**\n[Open official Roblox gamepass](${gamepassUrl})\n\n-# Manual owner/staff decision required. FIMA Bot never auto-pays.`)
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
  await winner?.send(`Your ${dateKey} FIMA Bot question reward was marked **${status}** by staff.`).catch(() => {});
  return interaction.update({
    embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setTitle(`◆ 25 ROBUX PAYOUT · ${status.toUpperCase()}`)
      .setFooter(paradiseFooter(`Reviewed by ${interaction.user.username}`))],
    components: []
  });
}

function safeApplicationPanelText(value, fallback, max, { multiline = false } = {}) {
  const source = String(value || fallback || "")
    .replace(/@(everyone|here)/gi, "@\u200b$1")
    .trim();
  const normalized = multiline ? source.replace(/\r\n?/g, "\n") : source.replace(/\s+/g, " ");
  return normalized.slice(0, max) || String(fallback || "").slice(0, max);
}

function paradiseApplicationPanelPayload(color, language = "tr", applicationSettings = {}) {
  const tr = language !== "en";
  const defaultTitle = tr ? "FIMA BA\u015eVURU MERKEZ\u0130" : "FIMA APPLICATION CENTER";
  const defaultDescription = tr
    ? "# Ba\u015fvuru merkezi\\nFIMA i\u00e7in uygun personel, topluluk, i\u015f birli\u011fi ve i\u00e7erik rollerini bu merkezden se\u00e7erek ba\u015fvurabilirsin. Her ak\u0131\u015f ayr\u0131 incelenir; hi\u00e7bir rol otomatik verilmez.\\n\\n- FIMA hesab\u0131, ba\u011fl\u0131 Discord ve sunucu \u00fcyeli\u011fi gerekir\\n- Staff, creator, partnership ve reseller ak\u0131\u015flar\u0131 ayn\u0131 g\u00fcvenli inceleme kuyru\u011funa gider\\n- Kan\u0131tlar g\u00fcvenlik taramas\u0131ndan ge\u00e7meden kabul edilmez\\n- Ba\u015fvuru t\u00fcr\u00fcn\u00fc web formunda se\u00e7ebilirsin"
    : "# Application center\\nChoose the staff, community, partnership, creator or reseller track that fits you. Each workflow is reviewed separately and no role is granted automatically.\\n\\n- A FIMA account, linked Discord and guild membership are required\\n- Staff, creator, partnership and reseller requests enter the same secure review queue\\n- Evidence is scanned before it is accepted\\n- Choose the application type in the website form";
  const buttonLabel = tr ? "Ba\u015fvuru merkezini a\u00e7" : "Open application center";
  const businessLabel = tr ? "\u0130\u015f birli\u011fi ba\u015fvurusu" : "Business application";
  return {
    embeds: [new EmbedBuilder().setColor(color)
      .setTitle(safeApplicationPanelText(applicationSettings?.panelTitle, defaultTitle, 80))
      .setDescription(safeApplicationPanelText(applicationSettings?.panelDescription, defaultDescription, 1200, { multiline: true }))
      .setFooter(paradiseFooter(tr ? "\u00d6zel inceleme kuyru\u011fu" : "Private review queue"))],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(safeApplicationPanelText(applicationSettings?.panelButtonLabel, buttonLabel, 40))
        .setEmoji("\ud83d\udcdd")
        .setStyle(ButtonStyle.Link)
        .setURL(`${PARADISE_PUBLIC_ASSET_BASE}/fima-bot/apply?workflow=staff`),
      new ButtonBuilder()
        .setLabel(businessLabel)
        .setEmoji("\ud83e\udd1d")
        .setStyle(ButtonStyle.Link)
        .setURL(`${PARADISE_PUBLIC_ASSET_BASE}/fima-bot/apply?workflow=business`)
    )]
  };
}

export const PARADISE_TICKET_CATEGORY_DEFAULTS = Object.freeze({
  community: Object.freeze([
    ["support", "Genel destek", "Hesap, topluluk veya genel yardım"],
    ["payment_license", "Ödeme / lisans", "Ödeme, lisans ve My Products yardımı"],
    ["app_problem", "Fima uygulama sorunu", "Uygulama hata veya teknik destek"],
    ["application", "Başvuru", "Başvuru veya inceleme sorusu"],
    ["security_report", "Güvenlik bildirimi", "Scam, hesap güvenliği veya ciddi risk"],
    ["other", "Diğer", "Diğer özel destek konusu"]
  ]),
  clan: Object.freeze([
    ["clan_support", "Klan desteği", "Klan veya üye desteği"],
    ["challenge_problem", "Challenge sorunu", "Açık maç veya rank challenge sorunu"],
    ["lineup_mainer", "Lineup / Mainer", "Lineup, mainer veya roster desteği"],
    ["training_tryout", "Training / Tryout", "Oturum veya hoster desteği"],
    ["blacklist_appeal", "Blacklist / itiraz", "İtiraz ve güvenli inceleme"],
    ["other", "Diğer", "Diğer özel destek konusu"]
  ]),
  tsbtr: Object.freeze([
    ["challenge", "Challenge", "Challenge veya maç ticketı"],
    ["leaderboard_profile", "Leaderboard / profil", "Profil veya sıralama desteği"],
    ["referee_report", "Referee bildirimi", "Referee veya skor bildirimi"],
    ["training_tryout", "Training / Tryout", "Oturum veya hoster desteği"],
    ["blacklist_appeal", "Blacklist / itiraz", "İtiraz ve güvenli inceleme"],
    ["other", "Diğer", "Diğer özel destek konusu"]
  ])
});

export function paradiseTicketCategoriesForMode(mode = "community") {
  return PARADISE_TICKET_CATEGORY_DEFAULTS[mode] || PARADISE_TICKET_CATEGORY_DEFAULTS.community;
}

export function normalizeParadiseTicketCategory(mode, category) {
  const normalized = String(category || "").trim().toLowerCase();
  return paradiseTicketCategoriesForMode(mode).some(([id]) => id === normalized) ? normalized : null;
}

function paradiseTicketCategoryLabel(mode, category, language = "tr") {
  const row = paradiseTicketCategoriesForMode(mode).find(([id]) => id === category);
  if (!row) return language === "en" ? "Support" : "Destek";
  if (language !== "en") return row[1];
  return {
    support: "General support", payment_license: "Payment / license", app_problem: "Fima app issue", application: "Application", security_report: "Security report", other: "Other",
    clan_support: "Clan support", challenge_problem: "Challenge issue", lineup_mainer: "Lineup / Mainer", training_tryout: "Training / Tryout", blacklist_appeal: "Blacklist / appeal",
    challenge: "Challenge", leaderboard_profile: "Leaderboard / profile", referee_report: "Referee report"
  }[category] || row[1];
}

function paradiseTicketCategoryDescription(category, language = "tr") {
  if (language !== "en") return paradiseTicketCategoriesForMode("community").find(([id]) => id === category)?.[2]
    || paradiseTicketCategoriesForMode("clan").find(([id]) => id === category)?.[2]
    || paradiseTicketCategoriesForMode("tsbtr").find(([id]) => id === category)?.[2]
    || "Özel destek konusu";
  return {
    support: "Account, community or general help", payment_license: "Payment, license or My Products help", app_problem: "App error or technical support",
    application: "Application or review question", security_report: "Scam, account safety or serious risk", other: "Another private support issue",
    clan_support: "Clan or member support", challenge_problem: "Open match or ranked challenge issue", lineup_mainer: "Lineup, mainer or roster support",
    training_tryout: "Session or hoster support", blacklist_appeal: "Appeal and safe review", challenge: "Challenge or match ticket",
    leaderboard_profile: "Profile or leaderboard support", referee_report: "Referee or score report"
  }[category] || "Private support issue";
}

export function renderParadiseTicketChannelName({
  format = "{category}-{username}",
  number = 1,
  username = "member",
  displayName = "member",
  category = "support",
  status = "open",
  claimedBy = ""
} = {}) {
  const safeToken = value => String(value || "")
    .toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "member";
  const rendered = String(format || "{category}-{username}")
    .replaceAll("{number}", String(Math.max(1, Number(number) || 1)))
    .replaceAll("{username}", safeToken(username))
    .replaceAll("{display_name}", safeToken(displayName))
    .replaceAll("{category}", safeToken(category))
    .replaceAll("{status}", safeToken(status))
    .replaceAll("{claimed_by}", safeToken(claimedBy || "staff"));
  return safeSupportTicketChannelName(rendered) || `support-${safeToken(username)}`;
}

export function paradiseSupportPanelPayload(color, language = "tr", mode = "community") {
  const tr = language !== "en";
  const categories = paradiseTicketCategoriesForMode(mode);
  return {
    embeds: [new EmbedBuilder().setColor(color).setTitle(tr ? "FIMA DESTEK" : "FIMA SUPPORT")
      .setDescription(tr
        ? "# Özel destek ticketı\nKonuna en uygun kategoriyi seç; aynı anda yalnızca bir aktif ticket açabilirsin.\n\n- Ticket kapanırken transcript otomatik kaydedilir\n- Kapanınca üye erişimi kaldırılır, yetkililer erişimi korur\n- Silme yalnız güvenli transcript akışıyla yapılır\n- Şifre, cookie, token veya tam lisans anahtarı paylaşma"
        : "# Private support ticket\nChoose the category that fits your issue; you can have one active ticket at a time.\n\n- Closing saves a transcript automatically\n- Member access is removed after close while staff retain access\n- Deletion only uses the secure transcript-first flow\n- Never share passwords, cookies, tokens or a full license key")],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId("paradise_support_category")
        .setPlaceholder(tr ? "Destek kategorisi seç" : "Choose a support category")
        .addOptions(categories.map(([id, label, description]) => ({
          value: id,
          label: tr ? label : paradiseTicketCategoryLabel(mode, id, "en"),
          description: (tr ? description : paradiseTicketCategoryDescription(id, "en")).slice(0, 100)
        })))
    )]
  };
}

export function paradiseSupportTicketControls(ticketId, status = "open") {
  const normalized = String(status || "open").toLowerCase();
  if (normalized === "delete_pending" || normalized === "deleted") return [];
  if (["closed", "transcript_failed"].includes(normalized)) {
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

export const PARADISE_SUPPORT_TICKET_STATES = Object.freeze([
  "open", "claimed", "closed", "delete_pending", "deleted", "transcript_failed"
]);

const SUPPORT_TICKET_TRANSITIONS = Object.freeze({
  claim: { open: "claimed" },
  unclaim: { claimed: "open" },
  close: { open: "closed", claimed: "closed" },
  reopen: { closed: "open", transcript_failed: "open" },
  begin_delete: { closed: "delete_pending", transcript_failed: "delete_pending" },
  transcript_saved: { delete_pending: "deleted" },
  transcript_failed: { delete_pending: "transcript_failed" },
  channel_delete_failed: { deleted: "closed" }
});

// Button and slash-command paths share this gate. Discord side effects occur
// around it, so stale requests cannot mutate a ticket to an invalid state.
export function transitionParadiseSupportTicket(record, { action, actorId, now = new Date(), metadata = {} } = {}) {
  const from = String(record?.status || "open").toLowerCase();
  const normalizedAction = String(action || "").toLowerCase();
  const to = SUPPORT_TICKET_TRANSITIONS[normalizedAction]?.[from];
  if (!to) {
    const error = new Error("support_ticket_invalid_transition");
    error.code = "support_ticket_invalid_transition";
    error.from = from;
    error.action = normalizedAction;
    throw error;
  }
  const updated = {
    ...record,
    status: to,
    updatedAt: new Date(now).toISOString(),
    updatedBy: String(actorId || "system")
  };
  if (normalizedAction === "claim") updated.claimedBy = String(actorId || "");
  if (["unclaim", "close", "reopen"].includes(normalizedAction)) updated.claimedBy = null;
  if (normalizedAction === "begin_delete") updated.deletionState = "transcript_pending";
  if (normalizedAction === "transcript_failed") updated.deletionState = "transcript_failed";
  if (normalizedAction === "transcript_saved") {
    updated.deletionState = "ready";
    updated.deletedAt = new Date(now).toISOString();
    updated.deletedBy = String(actorId || "system");
  }
  if (normalizedAction === "channel_delete_failed") updated.deletionState = "channel_delete_failed";
  return supportTicketAudit(updated, normalizedAction, actorId, metadata);
}

function supportTicketStatusLabel(status = "open", language = "tr") {
  const normalized = String(status || "open").toLowerCase();
  if (language === "en") {
    if (normalized === "closed") return "CLOSED";
    if (normalized === "claimed") return "CLAIMED";
    if (normalized === "deleted") return "DELETED";
    if (normalized === "transcript_failed") return "TRANSCRIPT FAILED";
    if (normalized === "delete_pending") return "DELETE PENDING";
    return "OPEN";
  }
  if (normalized === "closed") return "KAPALI";
  if (normalized === "claimed") return "ÜSTLENİLDİ";
  if (normalized === "deleted") return "SİLİNDİ";
  if (normalized === "transcript_failed") return "TRANSCRIPT BAŞARISIZ";
  if (normalized === "delete_pending") return "SİLME BEKLİYOR";
  return "AÇIK";
}

function paradiseSupportTicketDescription(record, language = "tr") {
  const status = supportTicketStatusLabel(record.status, language);
  const tr = language !== "en";
  const lines = [
    `${tr ? "Üye" : "Member"}: <@${record.userId}>`,
    `Ticket: \`${record.id.slice(0, 8)}\``,
    `${tr ? "Kategori" : "Category"}: **${record.categoryLabel || record.category || (tr ? "Destek" : "Support")}**`,
    `${tr ? "Durum" : "Status"}: **${status}**`
  ];
  if (record.claimedBy) lines.push(`${tr ? "Üstlenen" : "Claimed by"}: <@${record.claimedBy}>`);
  lines.push("");
  if (String(record.status || "open").toLowerCase() === "open") lines.push(tr ? "Kapatıldığında transcript otomatik kaydedilir ve üye erişimi kaldırılır." : "Closing automatically saves a transcript and removes member access.");
  else if (String(record.status || "").toLowerCase() === "claimed") lines.push(tr ? "Bu ticket bir yetkili tarafından üstlenildi. Kapatma transcript'i otomatik kaydeder." : "A staff member claimed this ticket. Closing automatically saves a transcript.");
  else if (String(record.status || "").toLowerCase() === "closed") lines.push(tr ? "Ticket kapalı. Yeniden açabilir veya güvenli silme akışını başlatabilirsin. Silme, transcript kaydedilmeden devam etmez." : "This ticket is closed. You can reopen it or start the secure deletion flow. Deletion never continues without a transcript.");
  else if (String(record.status || "").toLowerCase() === "transcript_failed") lines.push(tr ? "Transcript kaydedilemedi. Ticket korunuyor; ayar düzeltildikten sonra silmeyi güvenle tekrar deneyebilirsin." : "Transcript delivery failed. The ticket is protected; fix the destination and retry deletion safely.");
  else if (String(record.status || "").toLowerCase() === "delete_pending") lines.push(tr ? "Silme için transcript hazırlanıyor. Ticket işlemleri geçici olarak kilitli." : "A transcript is being prepared for deletion. Ticket changes are temporarily locked.");
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

async function createParadiseSupportTicket(guild, user, sourceChannel, { test = false, category = null } = {}) {
  const state = await loadState();
  const config = configForGuild(state, guild.id);
  const mode = config.activeSetupMode || "community";
  const selectedCategory = normalizeParadiseTicketCategory(mode, category || (mode === "community" ? "support" : "other"));
  if (!selectedCategory) {
    const error = new Error("invalid_support_ticket_category");
    error.code = "invalid_support_ticket_category";
    throw error;
  }
  const existing = Object.values(state.supportTickets?.[guild.id] || {})
    .find(item => item.userId === user.id && ["open", "claimed"].includes(String(item.status || "open").toLowerCase()));
  if (existing) {
    const channel = guild.channels.cache.get(existing.channelId) || await guild.channels.fetch(existing.channelId).catch(() => null);
    if (channel) return { channel, record: existing, existing: true };
  }
  const ticketId = crypto.randomUUID();
  const existingCount = Object.keys(state.supportTickets?.[guild.id] || {}).length + 1;
  const openFormat = String(config.ticketSettings?.openNameFormat || "{category}-{username}");
  const safeName = renderParadiseTicketChannelName({
    format: openFormat,
    number: existingCount,
    username: user.username,
    displayName: user.globalName || user.username,
    category: selectedCategory,
    status: "open"
  });
  const staffRoles = [...guild.roles.cache.values()].filter(role => ["Owner", "Admin", "Overseer", "Manager", "Moderator", "Support Staff"].includes(role.name));
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
    { id: guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageMessages] },
    ...staffRoles.map(role => ({ id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }))
  ];
  const channel = await guild.channels.create({
    name: `${test ? "smoke-" : ""}${safeName}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: sourceChannel?.parentId || undefined,
    topic: `FIMA Bot support ticket ${ticketId.slice(0, 8)}. Keep secrets masked.`,
    permissionOverwrites: overwrites,
    reason: test ? "FIMA Bot live support-ticket smoke test" : "FIMA Bot support ticket opened"
  });
  const record = {
    id: ticketId, guildId: guild.id, channelId: channel.id, userId: user.id, username: String(user.username || "member").slice(0, 64),
    category: selectedCategory, categoryLabel: paradiseTicketCategoryLabel(mode, selectedCategory, guildLanguage(config)),
    nameFormat: openFormat, channelName: channel.name,
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
    files: [{ attachment: Buffer.from(lines.join("\n"), "utf8"), name: `fima-bot-support-${record.id.slice(0, 8)}.txt` }]
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
    ...transitionParadiseSupportTicket(record, { action: "close", actorId: "system-test" }),
    ...transcriptMetadataFromMessage(transcript, "smoke-close")
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

  const reopened = transitionParadiseSupportTicket(closed, { action: "reopen", actorId: "system-test" });
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
  if (!["closed", "transcript_failed"].includes(String(record.status || "").toLowerCase())) {
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
  if (!record || record.channelId !== interaction.channelId || !canDelete || !["closed", "transcript_failed"].includes(String(record.status || "").toLowerCase())) {
    return interaction.editReply({ content: "Bu kapalı ticketı silme yetkin yok veya ticket artık geçerli değil." });
  }
  const locked = transitionParadiseSupportTicket(record, { action: "begin_delete", actorId: interaction.user.id });
  await saveState(next => {
    next.supportTickets[interaction.guildId] = next.supportTickets[interaction.guildId] || {};
    next.supportTickets[interaction.guildId][ticketId] = locked;
    return next;
  });
  await refreshParadiseSupportTicketHeader(interaction.channel, locked).catch(() => null);
  const transcript = await saveParadiseSupportTranscript(interaction.guild, interaction.channel, locked, "delete").catch(() => null);
  if (!transcript) {
    let failedRecord = null;
    await saveState(next => {
      const current = next.supportTickets?.[interaction.guildId]?.[ticketId] || locked;
      failedRecord = transitionParadiseSupportTicket(current, {
        action: "transcript_failed",
        actorId: interaction.user.id,
        metadata: { reason: "transcript_unavailable" }
      });
      next.supportTickets[interaction.guildId][ticketId] = failedRecord;
      return next;
    });
    await refreshParadiseSupportTicketHeader(interaction.channel, failedRecord).catch(() => null);
    await logParadiseAction(interaction.guild, "support_logs_channel", "support-logs", "Support ticket deletion blocked", `Ticket \`${record.id.slice(0, 8)}\` transcript could not be saved; the channel was kept.`).catch(() => null);
    return interaction.editReply({ content: "Transcript kaydedilemedi; ticket silinmedi ve yönetilebilir durumda bırakıldı." });
  }
  let deletedRecord = null;
  await saveState(next => {
    const current = next.supportTickets?.[interaction.guildId]?.[ticketId] || locked;
    const transcribed = persistSupportTranscript(next, interaction.guildId, ticketId, current, transcript, "delete", interaction.user.id);
    deletedRecord = transitionParadiseSupportTicket(transcribed, { action: "transcript_saved", actorId: interaction.user.id });
    next.supportTickets[interaction.guildId][ticketId] = deletedRecord;
    return next;
  });
  await logParadiseAction(interaction.guild, "support_logs_channel", "support-logs", "Support ticket deleted", `Ticket \`${record.id.slice(0, 8)}\` was transcripted and deleted by <@${interaction.user.id}>.`).catch(() => null);
  try {
    await interaction.channel.delete("FIMA Bot transcript-first support ticket deletion");
    return interaction.editReply({ content: "Transcript kaydedildi ve ticket güvenle silindi." });
  } catch {
    await saveState(next => {
      const current = next.supportTickets?.[interaction.guildId]?.[ticketId] || deletedRecord || locked;
      const recovered = transitionParadiseSupportTicket(current, { action: "channel_delete_failed", actorId: interaction.user.id });
      next.supportTickets[interaction.guildId][ticketId] = recovered;
      deletedRecord = recovered;
      return next;
    });
    await refreshParadiseSupportTicketHeader(interaction.channel, deletedRecord).catch(() => null);
    return interaction.editReply({ content: "Transcript kaydedildi fakat kanal silinemedi; ticket kapalı ve yönetilebilir bırakıldı." });
  }
}

async function refreshParadiseSupportTicketHeader(channel, record) {
  if (!record?.headerMessageId || !channel?.isTextBased?.()) return null;
  const header = await channel.messages.fetch(record.headerMessageId).catch(() => null);
  if (!header) return null;
  await header.edit({
    embeds: [await paradiseSupportTicketEmbed(record)],
    components: paradiseSupportTicketControls(record.id, record.status)
  });
  return header;
}

async function mutateParadiseSupportTicketLifecycle({ guild, channel, record, ticketId, action, actorId }) {
  const normalizedAction = String(action || "").toLowerCase();
  const state = await loadState();
  const ticketSettings = configForGuild(state, guild.id).ticketSettings || {};
  let updated = transitionParadiseSupportTicket(record, { action: normalizedAction, actorId });
  let transcript = null;

  if (normalizedAction === "close") {
    transcript = await saveParadiseSupportTranscript(guild, channel, updated, "closed").catch(() => null);
    if (!transcript) {
      const error = new Error("support_ticket_transcript_required");
      error.code = "support_ticket_transcript_required";
      throw error;
    }
    updated = { ...updated, ...transcriptMetadataFromMessage(transcript, "closed") };
    await channel.permissionOverwrites.edit(record.userId, { ViewChannel: false }).catch(() => {});
  } else if (normalizedAction === "reopen") {
    await channel.permissionOverwrites.edit(record.userId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    }).catch(() => {});
  }
  const lifecycleFormat = normalizedAction === "claim" ? ticketSettings.claimedNameFormat
    : normalizedAction === "close" ? ticketSettings.closedNameFormat
      : ["unclaim", "reopen"].includes(normalizedAction) ? ticketSettings.openNameFormat
        : null;
  if (lifecycleFormat !== null || ["claim", "close", "unclaim", "reopen"].includes(normalizedAction)) {
    const defaultFormat = normalizedAction === "claim" ? "claimed-{category}-{username}"
      : normalizedAction === "close" ? "closed-{category}-{username}"
        : "{category}-{username}";
    const channelName = renderParadiseTicketChannelName({
      format: lifecycleFormat || defaultFormat,
      number: Object.keys(state.supportTickets?.[guild.id] || {}).length,
      username: record.username || channel.name,
      displayName: record.username || channel.name,
      category: record.category || "support",
      status: updated.status,
      claimedBy: updated.claimedBy || "staff"
    });
    await channel.setName(channelName, `FIMA Bot ticket ${normalizedAction} lifecycle name`).catch(() => null);
    updated = { ...updated, channelName };
  }

  await saveState(next => {
    next.supportTickets[guild.id] = next.supportTickets[guild.id] || {};
    if (normalizedAction === "close" && transcript) {
      updated = persistSupportTranscript(next, guild.id, ticketId, updated, transcript, "closed", actorId);
    } else {
      next.supportTickets[guild.id][ticketId] = updated;
    }
    return next;
  });
  await logParadiseAction(guild, "support_logs_channel", "support-logs", `Support ticket ${updated.status}`,
    `Ticket \`${record.id.slice(0, 8)}\` was **${updated.status}** by <@${actorId}>.${transcript ? " Transcript saved." : ""}`).catch(() => null);
  return updated;
}

function supportTicketRecordForChannel(state, guildId, channelId) {
  return Object.values(state.supportTickets?.[guildId] || {}).find(item => item.channelId === channelId) || null;
}

function safeSupportTicketChannelName(value) {
  const normalized = String(value || "").toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
  return normalized || null;
}

async function handleParadiseTicketCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "open") {
    const created = await createParadiseSupportTicket(interaction.guild, interaction.user, interaction.channel, {
      category: interaction.options.getString("category")
    }).catch(error => ({ error }));
    if (created.error) return interaction.reply({ content: "This ticket category is not enabled for the selected server template.", ephemeral: true });
    return interaction.reply({ content: created.existing ? `You already have an open ticket: ${created.channel}` : `Support ticket opened: ${created.channel}`, ephemeral: true });
  }
  if (sub === "panel") {
    if (!canApproveModeration(interaction.member)) return interaction.reply({ content: "Ticket Manager authority required.", ephemeral: true });
    const state = await loadState();
    const config = configForGuild(state, interaction.guildId);
    await interaction.channel.send(paradiseSupportPanelPayload(await paradiseBrandColor(), guildLanguage(config), config.activeSetupMode || "community"));
    return interaction.reply({ content: "Support panel posted.", ephemeral: true });
  }
  if (sub === "config") {
    if (!canApproveModeration(interaction.member)) return interaction.reply({ content: "Ticket Manager authority required.", ephemeral: true });
    return interaction.reply({ content: "Configure ticket lifecycle, transcript retention and private log channels in FIMA Bot Dashboard → Tickets.", ephemeral: true });
  }
  const state = await loadState();
  const record = supportTicketRecordForChannel(state, interaction.guildId, interaction.channelId);
  if (!record) return interaction.reply({ content: "Use this command inside a FIMA Bot support ticket.", ephemeral: true });
  const isStaff = canModerate(interaction.member) || canApproveModeration(interaction.member);
  const isManager = canApproveModeration(interaction.member);
  const canClose = isStaff || record.userId === interaction.user.id;

  if (sub === "info") {
    if (!isStaff && record.userId !== interaction.user.id) return interaction.reply({ content: "You cannot view this ticket's status.", ephemeral: true });
    return interaction.reply({ embeds: [await paradiseSupportTicketEmbed(record)], ephemeral: true });
  }
  if (sub === "delete") {
    if (!isManager) return interaction.reply({ content: "Ticket deletion requires owner or senior admin authority.", ephemeral: true });
    return showParadiseSupportDeleteConfirmation(interaction, record, record.id);
  }
  if (["claim", "unclaim", "reopen", "transcript", "escalate", "logs"].includes(sub) && !isStaff) {
    return interaction.reply({ content: "Staff authority required.", ephemeral: true });
  }
  if (["rename", "add", "remove", "repair"].includes(sub) && !isManager) {
    return interaction.reply({ content: "Ticket Manager authority required.", ephemeral: true });
  }
  if (sub === "close" && !canClose) return interaction.reply({ content: "You cannot close this ticket.", ephemeral: true });

  if (["claim", "unclaim", "close", "reopen"].includes(sub)) {
    try {
      const updated = await mutateParadiseSupportTicketLifecycle({
        guild: interaction.guild, channel: interaction.channel, record, ticketId: record.id, action: sub, actorId: interaction.user.id
      });
      await refreshParadiseSupportTicketHeader(interaction.channel, updated);
      return interaction.reply({ content: `Ticket is now ${updated.status}.`, ephemeral: true });
    } catch (error) {
      const message = error.code === "support_ticket_transcript_required"
        ? "Transcript could not be saved; the ticket was not closed. Configure the transcript channel and retry."
        : "This ticket action is no longer valid for its current state.";
      return interaction.reply({ content: message, ephemeral: true });
    }
  }
  if (sub === "transcript") {
    const transcript = await saveParadiseSupportTranscript(interaction.guild, interaction.channel, record, "manual").catch(() => null);
    if (!transcript) return interaction.reply({ content: "Transcript could not be saved; no ticket state was changed.", ephemeral: true });
    let updated = record;
    await saveState(next => { updated = persistSupportTranscript(next, interaction.guildId, record.id, record, transcript, "manual", interaction.user.id); return next; });
    await refreshParadiseSupportTicketHeader(interaction.channel, updated);
    return interaction.reply({ content: "Redacted transcript saved to the private transcript channel.", ephemeral: true });
  }
  if (sub === "rename") {
    const name = safeSupportTicketChannelName(interaction.options.getString("name"));
    if (!name) return interaction.reply({ content: "Use a readable channel name with letters, numbers, - or _.", ephemeral: true });
    await interaction.channel.setName(name, "FIMA Bot ticket manager rename");
    const updated = supportTicketAudit({ ...record, channelName: name, updatedAt: new Date().toISOString() }, "renamed", interaction.user.id);
    await saveState(next => { next.supportTickets[interaction.guildId][record.id] = updated; return next; });
    return interaction.reply({ content: `Ticket renamed to ${name}.`, ephemeral: true });
  }
  if (sub === "add" || sub === "remove") {
    const member = interaction.options.getUser("user", true);
    if (sub === "add") await interaction.channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    else await interaction.channel.permissionOverwrites.delete(member.id).catch(() => {});
    const updated = supportTicketAudit(record, sub === "add" ? "member_added" : "member_removed", interaction.user.id, { memberId: member.id });
    await saveState(next => { next.supportTickets[interaction.guildId][record.id] = updated; return next; });
    return interaction.reply({ content: sub === "add" ? `Added ${member}.` : `Removed ${member}.`, ephemeral: true });
  }
  if (sub === "escalate") {
    const note = String(interaction.options.getString("note") || "Staff escalation requested.").slice(0, 300);
    const updated = supportTicketAudit({ ...record, escalatedAt: new Date().toISOString(), escalatedBy: interaction.user.id }, "escalated", interaction.user.id, { note });
    await saveState(next => { next.supportTickets[interaction.guildId][record.id] = updated; return next; });
    await logParadiseAction(interaction.guild, "support_logs_channel", "support-logs", "Support ticket escalated", `Ticket \`${record.id.slice(0, 8)}\` was escalated.`, { safe: true }).catch(() => null);
    return interaction.reply({ content: "Ticket escalation was recorded for staff review.", ephemeral: true });
  }
  if (sub === "repair") {
    await refreshParadiseSupportTicketHeader(interaction.channel, record);
    return interaction.reply({ content: "Canonical ticket header repaired in place.", ephemeral: true });
  }
  if (sub === "logs") {
    const actions = (record.auditTrail || []).slice(-8).map(item => `- ${item.action} · <t:${Math.floor(new Date(item.at).getTime() / 1000)}:R>`);
    return interaction.reply({ content: actions.join("\n") || "No safe lifecycle metadata is stored yet.", ephemeral: true });
  }
  return interaction.reply({ content: "This ticket command is not available yet.", ephemeral: true });
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
    const claimed = await mutateParadiseSupportTicketLifecycle({ guild: interaction.guild, channel: interaction.channel, record, ticketId, action: "claim", actorId: interaction.user.id });
    return interaction.update({
      embeds: [await paradiseSupportTicketEmbed(claimed)],
      components: paradiseSupportTicketControls(ticketId, "claimed")
    });
  }
  if (action === "unclaim") {
    if (String(record.status || "").toLowerCase() !== "claimed") return interaction.reply({ content: "Bu ticket üstlenilmiş durumda değil.", ephemeral: true });
    const reopened = await mutateParadiseSupportTicketLifecycle({ guild: interaction.guild, channel: interaction.channel, record, ticketId, action: "unclaim", actorId: interaction.user.id });
    return interaction.update({ embeds: [await paradiseSupportTicketEmbed(reopened)], components: paradiseSupportTicketControls(ticketId, "open") });
  }
  if (action === "delete") return showParadiseSupportDeleteConfirmation(interaction, record, ticketId);
  if (!["close", "reopen"].includes(action)) return interaction.reply({ content: "Bilinmeyen ticket işlemi.", ephemeral: true });
  if (action === "close" && !["open", "claimed"].includes(String(record.status || "open").toLowerCase())) {
    return interaction.reply({ content: "Bu ticket zaten kapalı veya silinmiş durumda.", ephemeral: true });
  }
  if (action === "reopen" && !["closed", "transcript_failed"].includes(String(record.status || "").toLowerCase())) return interaction.reply({ content: "Yalnız kapalı ticket yeniden açılabilir.", ephemeral: true });
  let updatedRecord;
  try {
    updatedRecord = await mutateParadiseSupportTicketLifecycle({ guild: interaction.guild, channel: interaction.channel, record, ticketId, action, actorId: interaction.user.id });
  } catch (error) {
    if (error.code === "support_ticket_transcript_required") return interaction.reply({ content: "Transcript kaydedilemedi; ticket kapatılmadı. Transcript/log kanalını ayarlayıp tekrar dene.", ephemeral: true });
    return interaction.reply({ content: "Bu ticket işlemi artık geçerli değil.", ephemeral: true });
  }
  if (!interaction.message) return interaction.reply({ content: `Ticket ${action === "close" ? "kapatıldı" : "yeniden açıldı"}.`, ephemeral: true });
  return interaction.update({
    embeds: [await paradiseSupportTicketEmbed(updatedRecord)],
    components: paradiseSupportTicketControls(ticketId, updatedRecord.status)
  });
}

function applicationLabel(type) {
  return APPLICATION_TYPES.find(([value]) => value === type)?.[1] || type;
}

export function normalizeParadiseApplicationWorkflow(value) {
  return value === "business" ? "business" : "staff";
}

export function paradiseApplicationWorkflowForType(type) {
  return BUSINESS_APPLICATION_TYPES.has(type) ? "business" : "staff";
}

function applicationTypeAllowedForMode(type, mode, workflow = "staff") {
  const normalizedWorkflow = normalizeParadiseApplicationWorkflow(workflow);
  if (normalizedWorkflow === "business") return BUSINESS_APPLICATION_TYPES.has(type);
  if (BUSINESS_APPLICATION_TYPES.has(type)) return false;
  if (mode === "community") return COMMUNITY_PUBLIC_STAFF_APPLICATION_TYPES.has(type);
  if (type === "helper") return false;
  if (mode === "tsbtr") return !TSBTR_BLOCKED_APPLICATION_TYPES.has(type);
  if (mode === "clan") return !COMMUNITY_ONLY_APPLICATION_TYPES.has(type);
  return false;
}

export function paradiseWebsiteApplicationTypesForMode(mode, workflow = "staff") {
  const normalizedWorkflow = normalizeParadiseApplicationWorkflow(workflow);
  return APPLICATION_TYPES
    .filter(([type]) => applicationTypeAllowedForMode(type, mode, normalizedWorkflow))
    .map(([type, label]) => ({ type, label }));
}

function applicationExtraQuestionBucket(type, applicationSettings = {}) {
  const configured = applicationSettings?.extraQuestions;
  if (!configured || typeof configured !== "object" || Array.isArray(configured)) return {};
  const nested = Object.values(configured).some(value => value && typeof value === "object" && !Array.isArray(value));
  if (nested) {
    const bucket = configured[type];
    return bucket && typeof bucket === "object" && !Array.isArray(bucket) ? bucket : {};
  }
  // Older dashboard versions stored one flat Helper-only question map.
  return type === "helper" ? configured : {};
}

function applicationQuestions(type, applicationSettings = {}) {
  const base = APPLICATION_QUESTION_BANK_V2[type] || APPLICATION_QUESTION_BANK_V2.default
    || APPLICATION_QUESTION_BANK[type] || APPLICATION_QUESTION_BANK.default;
  const reserved = new Set(base.map(([key]) => String(key).toLowerCase()));
  const extra = Object.entries(applicationExtraQuestionBucket(type, applicationSettings))
    .slice(0, APPLICATION_EXTRA_QUESTION_LIMIT)
    .map(([rawKey, rawLabel]) => {
      const key = String(rawKey || "").replace(/[^a-z0-9_]/gi, "").toLowerCase().slice(0, 32);
      const label = String(rawLabel || "").replace(/\s+/g, " ").trim().slice(0, 180);
      if (!key || !label || reserved.has(key)) return null;
      reserved.add(key);
      return [key, label, "Yanıtını ayrıntılı ve güvenli biçimde yaz.", TextInputStyle.Paragraph, 1, 700];
    })
    .filter(Boolean);
  return [...base, ...extra];
}

export function applicationQuestionChunks(type, applicationSettings = {}) {
  const questions = applicationQuestions(type, applicationSettings);
  const chunks = [];
  for (let index = 0; index < questions.length; index += DISCORD_APPLICATION_MODAL_LIMIT) {
    chunks.push(questions.slice(index, index + DISCORD_APPLICATION_MODAL_LIMIT));
  }
  return chunks.length ? chunks : [[]];
}

function applicationModal(type, step = 0, draftId = "new", applicationSettings = {}) {
  const chunks = applicationQuestionChunks(type, applicationSettings);
  const safeStep = Math.min(Math.max(Number(step) || 0, 0), chunks.length - 1);
  const modal = new ModalBuilder()
    .setCustomId(`paradise_application_modal:${type}:${safeStep}:${draftId}`)
    .setTitle(`${applicationLabel(type)} ${safeStep + 1}/${chunks.length}`);
  modal.addComponents(...chunks[safeStep].map(([id, label, placeholder, style, min, max]) =>
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(String(label).slice(0, 45)).setStyle(style)
        .setPlaceholder(String(placeholder).slice(0, 100)).setMinLength(min).setMaxLength(max).setRequired(true)
    )));
  return modal;
}

function collectApplicationAnswers(interaction, type, step, applicationSettings = {}) {
  const chunk = applicationQuestionChunks(type, applicationSettings)[step] || [];
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

function applicationReviewComponents(id) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_application_approve:${id}`).setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`paradise_application_more:${id}`).setLabel("Ask More Info").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`paradise_application_deny:${id}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
  )];
}

function applicationMoreInfoModal(record, language = "tr") {
  const tr = language !== "en";
  const request = maskApplicationReviewText(record.reviewReason || "Please clarify the requested details.", 120);
  return new ModalBuilder()
    .setCustomId(`paradise_application_more_info:${record.id}`)
    .setTitle(tr ? "Başvuru için ek bilgi" : "Additional application information")
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("more_info_response")
        .setLabel(tr ? "Yetkilinin istediği açıklama" : "Staff requested clarification")
        .setPlaceholder(request)
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(5)
        .setMaxLength(700)
        .setRequired(true)
    ));
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
  if (action === "approve") return "approved";
  if (action === "deny") return "denied";
  if (action === "more") return "more_info";
  throw Object.assign(new Error("invalid_application_review_action"), {
    code: "invalid_application_review_action",
    statusCode: 400
  });
}

export function transitionParadiseApplicationReview(record, {
  action, reviewerId, reason = "", now = new Date()
} = {}) {
  if (!record || record.status !== "pending") {
    throw Object.assign(new Error("application_not_pending"), {
      code: "application_not_pending",
      statusCode: 409
    });
  }
  const status = applicationReviewStatus(action);
  const reviewReason = ["denied", "more_info"].includes(status)
    ? maskApplicationReviewText(reason, 700)
    : "";
  if (["denied", "more_info"].includes(status) && reviewReason.length < 5) {
    throw Object.assign(new Error("application_review_reason_required"), {
      code: "application_review_reason_required",
      statusCode: 400
    });
  }
  const timestamp = new Date(now).toISOString();
  return {
    ...record,
    status,
    reviewedBy: String(reviewerId || ""),
    reviewedAt: timestamp,
    updatedAt: timestamp,
    reviewReason: reviewReason || null
  };
}

export function transitionParadiseApplicationClarification(record, {
  userId, response = "", now = new Date()
} = {}) {
  if (!record || record.userId !== userId || record.status !== "more_info") {
    throw Object.assign(new Error("application_not_waiting_for_clarification"), {
      code: "application_not_waiting_for_clarification",
      statusCode: 409
    });
  }
  const safeResponse = maskApplicationReviewText(response, 700);
  if (safeResponse.length < 5) {
    throw Object.assign(new Error("application_clarification_required"), {
      code: "application_clarification_required",
      statusCode: 400
    });
  }
  const timestamp = new Date(now).toISOString();
  return {
    ...record,
    status: "pending",
    moreInfoResponse: safeResponse,
    moreInfoRespondedAt: timestamp,
    updatedAt: timestamp
  };
}

function applicationReviewReasonModal(action, id, language = "tr") {
  const tr = language !== "en";
  const isMoreInfo = action === "more";
  return new ModalBuilder()
    .setCustomId(`paradise_application_review_reason:${action}:${id}`)
    .setTitle(isMoreInfo ? (tr ? "Ek bilgi iste" : "Ask More Info") : (tr ? "Başvuruyu reddet" : "Deny Application"))
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("review_reason")
        .setLabel(isMoreInfo ? (tr ? "Başvuru sahibi neyi netleştirmeli?" : "What should the applicant clarify?") : (tr ? "Başvuru neden reddedildi?" : "Why is this application denied?"))
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(5)
        .setMaxLength(700)
        .setPlaceholder(isMoreInfo
          ? (tr ? "Örnek: Haftalık aktifliğini ve önceki bir staff deneyimini açıkla." : "Example: Please explain your weekly availability and provide one previous staff example.")
          : (tr ? "Örnek: Moderasyon senaryolarında yeterli ayrıntı yok. Cevaplarını geliştirip tekrar başvurabilirsin." : "Example: Not enough detail in moderation scenarios. Please apply again after improving your answers."))
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

function applicationEvidenceError(code, details = {}) {
  return Object.assign(new Error(code), { code, statusCode: 400, ...details });
}

function detectedApplicationEvidenceMime(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

function normalizedApplicationEvidenceName(value) {
  const basename = path.basename(String(value || "evidence").normalize("NFKC").replaceAll("\\", "/"));
  const normalized = basename
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (normalized || "evidence").slice(0, 80);
}

export function validateParadiseApplicationEvidenceFile(entry, validQuestionKeys = []) {
  if (!entry || typeof entry !== "object") throw applicationEvidenceError("invalid_evidence_file");
  const questionKey = String(entry.questionKey || "").trim();
  if (!new Set(validQuestionKeys).has(questionKey)) {
    throw applicationEvidenceError("invalid_evidence_question", { question: questionKey });
  }
  const originalName = normalizedApplicationEvidenceName(entry.name);
  const suppliedMime = String(entry.mimeType || "").trim().toLowerCase();
  if (!APPLICATION_EVIDENCE_TYPE_RULES[suppliedMime]) {
    throw applicationEvidenceError("unsupported_evidence_type", { question: questionKey });
  }
  let encoded = String(entry.data || "");
  if (encoded.startsWith("data:")) {
    const match = encoded.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/i);
    if (!match || match[1].toLowerCase() !== suppliedMime) {
      throw applicationEvidenceError("invalid_evidence_encoding", { question: questionKey });
    }
    encoded = match[2];
  }
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
    || encoded.length > Math.ceil(APPLICATION_EVIDENCE_MAX_FILE_BYTES / 3) * 4 + 4) {
    throw applicationEvidenceError("invalid_evidence_encoding", { question: questionKey });
  }
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > APPLICATION_EVIDENCE_MAX_FILE_BYTES
    || buffer.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
    throw applicationEvidenceError("invalid_evidence_size", { question: questionKey });
  }
  const detectedMime = detectedApplicationEvidenceMime(buffer);
  const extension = path.extname(originalName).toLowerCase();
  const detectedRule = detectedMime ? APPLICATION_EVIDENCE_TYPE_RULES[detectedMime] : null;
  if (!detectedRule || detectedMime !== suppliedMime || !detectedRule.extensions.includes(extension)) {
    throw applicationEvidenceError("evidence_signature_mismatch", { question: questionKey });
  }
  return {
    questionKey,
    originalName,
    mimeType: detectedMime,
    extension: detectedRule.extension,
    size: buffer.length,
    buffer
  };
}

export function setParadiseApplicationEvidenceScanner(scanner = null) {
  if (scanner !== null && typeof scanner !== "function") {
    throw new TypeError("FIMA Bot application evidence scanner must be a function or null.");
  }
  paradiseApplicationEvidenceScanner = scanner;
}

export const PARADISE_APPLICATION_EVIDENCE_POLICY = Object.freeze({
  allowedMimeTypes: Object.freeze(Object.keys(APPLICATION_EVIDENCE_TYPE_RULES)),
  maxPerQuestion: APPLICATION_EVIDENCE_MAX_PER_QUESTION,
  maxFiles: APPLICATION_EVIDENCE_MAX_FILES,
  maxFileBytes: APPLICATION_EVIDENCE_MAX_FILE_BYTES,
  maxTotalBytes: APPLICATION_EVIDENCE_MAX_TOTAL_BYTES,
  scannerUnavailableAction: "quarantine"
});

export function paradiseApplicationEvidenceRequirement(applicationSettings = {}, type, questionKey) {
  const configured = applicationSettings?.evidenceRequirements?.[type]?.[questionKey];
  return configured === "required" ? "required" : "optional";
}

export function validateParadiseApplicationEvidenceSubmission({
  guildId, applicationId, questions, evidence, requiredQuestionKeys = []
}) {
  const evidenceEntries = evidence === undefined || evidence === null ? [] : evidence;
  if (!Array.isArray(evidenceEntries) || evidenceEntries.length > APPLICATION_EVIDENCE_MAX_FILES) {
    throw applicationEvidenceError("invalid_evidence_count");
  }
  const questionMap = new Map(questions.map(question => [question.key, question.label]));
  const validated = evidenceEntries.map(entry => validateParadiseApplicationEvidenceFile(entry, [...questionMap.keys()]));
  const counts = new Map();
  let totalBytes = 0;
  for (const file of validated) {
    counts.set(file.questionKey, (counts.get(file.questionKey) || 0) + 1);
    if (counts.get(file.questionKey) > APPLICATION_EVIDENCE_MAX_PER_QUESTION) {
      throw applicationEvidenceError("too_many_evidence_files_for_question", { question: file.questionKey });
    }
    totalBytes += file.size;
  }
  if (totalBytes > APPLICATION_EVIDENCE_MAX_TOTAL_BYTES) {
    throw applicationEvidenceError("evidence_total_size_exceeded");
  }
  for (const questionKey of new Set(requiredQuestionKeys)) {
    if (!questionMap.has(questionKey)) {
      throw applicationEvidenceError("invalid_evidence_question", { question: questionKey });
    }
    if (!counts.get(questionKey)) {
      throw applicationEvidenceError("required_evidence_missing", { question: questionKey });
    }
  }

  return { validated, questionMap };
}

async function processParadiseApplicationEvidence({
  guildId, applicationId, questions, evidence, requiredQuestionKeys = []
}) {
  const { validated, questionMap } = validateParadiseApplicationEvidenceSubmission({
    guildId, applicationId, questions, evidence, requiredQuestionKeys
  });

  const guildDirectory = String(guildId || "").replace(/\D/g, "").slice(0, 32) || "unknown";
  const applicationDirectory = String(applicationId || "").replace(/[^a-z0-9-]/gi, "").slice(0, 64) || crypto.randomUUID();
  const stored = [];
  try {
    for (const file of validated) {
      let status = "quarantined";
      let reason = "scanner_unavailable";
      if (paradiseApplicationEvidenceScanner) {
        try {
          const scan = await paradiseApplicationEvidenceScanner({
            buffer: Buffer.from(file.buffer),
            name: file.originalName,
            mimeType: file.mimeType,
            size: file.size,
            questionKey: file.questionKey
          });
          if (scan?.clean === true) {
            status = "accepted";
            reason = null;
          } else {
            reason = "scanner_rejected";
          }
        } catch {
          reason = "scanner_error";
        }
      }
      const bucket = status === "accepted" ? "accepted" : "quarantine";
      const storageFileName = `${crypto.randomUUID()}${file.extension}`;
      const storageName = path.posix.join(bucket, guildDirectory, applicationDirectory, storageFileName);
      const destination = path.resolve(APPLICATION_EVIDENCE_STORAGE_ROOT, ...storageName.split("/"));
      if (!destination.startsWith(`${APPLICATION_EVIDENCE_STORAGE_ROOT}${path.sep}`)) {
        throw applicationEvidenceError("invalid_evidence_storage_path");
      }
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, file.buffer, { flag: "wx", mode: 0o600 });
      stored.push({
        id: crypto.randomUUID(),
        questionKey: file.questionKey,
        questionLabel: questionMap.get(file.questionKey),
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        status,
        quarantineReason: reason,
        storageName
      });
    }
    return stored;
  } catch (error) {
    await removeParadiseApplicationEvidence(stored);
    throw error;
  }
}

async function removeParadiseApplicationEvidence(evidence = []) {
  await Promise.allSettled(evidence.map(async file => {
    const storageName = String(file?.storageName || "");
    if (!storageName) return;
    const destination = path.resolve(APPLICATION_EVIDENCE_STORAGE_ROOT, ...storageName.split("/"));
    if (!destination.startsWith(`${APPLICATION_EVIDENCE_STORAGE_ROOT}${path.sep}`)) return;
    await fs.rm(destination, { force: true });
  }));
}

function applicationEvidenceDiscordFiles(evidence = []) {
  return evidence
    .filter(file => file.status === "accepted" && String(file.storageName || "").startsWith("accepted/"))
    .map(file => {
      const attachment = path.resolve(APPLICATION_EVIDENCE_STORAGE_ROOT, ...String(file.storageName).split("/"));
      if (!attachment.startsWith(`${APPLICATION_EVIDENCE_STORAGE_ROOT}${path.sep}`)) return null;
      return { attachment, name: file.originalName, description: `Evidence for ${file.questionLabel || file.questionKey}` };
    })
    .filter(Boolean);
}

function applicationPrivateReviewError(cause = null) {
  return Object.assign(new Error("application_private_review_unavailable", { cause }), {
    code: "application_private_review_unavailable",
    statusCode: 503
  });
}

export async function applicationPrivateReviewTarget(reviewChannel, applicationId, type) {
  if (reviewChannel?.type !== ChannelType.GuildText || !reviewChannel.threads?.create) {
    throw applicationPrivateReviewError();
  }
  let thread = null;
  try {
    thread = await reviewChannel.threads.create({
      name: `application-${type}-${applicationId.slice(0, 8)}`.slice(0, 100),
      type: ChannelType.PrivateThread,
      autoArchiveDuration: 1440,
      invitable: false,
      reason: "FIMA Bot private application review"
    });
  } catch (error) {
    throw applicationPrivateReviewError(error);
  }
  if (!thread?.id || typeof thread.send !== "function") throw applicationPrivateReviewError();
  return {
    channel: thread,
    parentChannelId: reviewChannel.id,
    privateThread: true
  };
}

function applicationRecordWorkflow(record) {
  return normalizeParadiseApplicationWorkflow(
    record?.workflow || (BUSINESS_APPLICATION_TYPES.has(record?.type) ? "business" : "staff")
  );
}

export function paradiseApplicationAutoGrantRoleKey(record, guildConfig = {}) {
  const workflow = applicationRecordWorkflow(record);
  if (workflow !== "staff") return null;
  if ((guildConfig.activeSetupMode || "community") === "community") return null;
  return {
    helper: "helper_role",
    staff: "staff_role",
    moderator: "moderator_role",
    support: "support_role",
    training_hoster: "training_hoster_role",
    tryout_hoster: "tryout_hoster_role",
    referee: "referee_role",
    event_staff: "event_staff_role",
    giveaway_staff: "giveaway_staff_role",
    content_creator: "content_creator_role",
    partnership: "partner_role",
    clan_mainer: "clan_mainer_role",
    fima_support: "fima_support_role",
    macro_staff: "macro_staff_role",
    fflag_staff: "fflag_staff_role",
    reseller: "reseller_role"
  }[record?.type] || null;
}

export function paradiseApplicationAutoGrantRoleName(record, guildConfig = {}) {
  const roleKey = paradiseApplicationAutoGrantRoleKey(record, guildConfig);
  if (!roleKey) return null;
  return guildConfig.applicationSettings?.roleMappings?.[record.type]
    || guildConfig.roleMappings?.[roleKey]
    || (roleKey === "helper_role" ? "Helper" : null);
}

export function buildParadisePrivateApplicationPreview({
  id, type, userId, answers = {}, evidence = []
} = {}) {
  const accepted = evidence.filter(file => file?.status === "accepted");
  return {
    title: `Application · ${maskApplicationReviewText(applicationLabel(type), 80)}`,
    description: [
      `Applicant: <@${String(userId || "").replace(/\D/g, "") || "unknown"}>`,
      `Application ID: \`${String(id || "").slice(0, 8)}\``,
      "Source: **Fima website**"
    ].join("\n"),
    fields: [
      ...Object.entries(answers).map(([label, value]) => ({
        name: maskApplicationReviewText(label, 256),
        value: maskApplicationReviewText(value, 1024),
        inline: false
      })),
      {
        name: "Evidence security",
        value: evidence.length
          ? `Accepted after scan: **${accepted.length}**\nQuarantined or awaiting scanner: **${evidence.length - accepted.length}**`
          : "No evidence files attached.",
        inline: false
      }
    ],
    attachments: accepted.map(file => ({
      name: maskApplicationReviewText(file.originalName || file.name || "evidence", 120),
      mimeType: String(file.mimeType || "application/octet-stream"),
      size: Number(file.size || 0)
    }))
  };
}

export async function paradiseWebsiteApplicationContext(guild, userId, { workflow = "staff" } = {}) {
  const normalizedWorkflow = normalizeParadiseApplicationWorkflow(workflow);
  const member = await guild.members.fetch(userId).catch(() => null);
  const state = await loadState();
  const guildConfig = configForGuild(state, guild.id);
  const applicationSettings = guildConfig.applicationSettings || {};
  const records = Object.values(state.applications?.[guild.id] || {})
    .filter(item => item.userId === userId && applicationRecordWorkflow(item) === normalizedWorkflow);
  const active = records.find(item => ["pending", "more_info"].includes(item.status));
  const cooldownUntil = applicationCooldownUntil(records, applicationSettings);
  return {
    guildId: guild.id,
    guildName: guild.name,
    member: Boolean(member),
    applicationsOpen: applicationSettings.enabled !== false,
    activeSetupMode: guildConfig.activeSetupMode || "community",
    workflow: normalizedWorkflow,
    evidencePolicy: PARADISE_APPLICATION_EVIDENCE_POLICY,
    blacklisted: state.blacklists?.[guild.id]?.[userId]?.status === "active",
    activeApplication: active ? {
      id: active.id.slice(0, 8), type: active.type, label: applicationLabel(active.type), status: active.status,
      createdAt: active.createdAt
    } : null,
    cooldownUntil: cooldownUntil > Date.now() ? new Date(cooldownUntil).toISOString() : null,
    types: paradiseWebsiteApplicationTypesForMode(guildConfig.activeSetupMode || "community", normalizedWorkflow).map(({ type, label }) => ({
      type,
      label,
      questions: applicationQuestions(type, applicationSettings).map(([key, questionLabel, placeholder, style, min, max]) => ({
        key,
        label: questionLabel,
        placeholder,
        multiline: style === TextInputStyle.Paragraph,
        min,
        max,
        evidenceRequirement: paradiseApplicationEvidenceRequirement(applicationSettings, type, key)
      }))
    }))
  };
}

export async function submitParadiseWebsiteApplication(guild, {
  userId, type, answers, evidence = [], siteUserId = null, workflow = "staff"
}) {
  const normalizedWorkflow = normalizeParadiseApplicationWorkflow(workflow);
  const context = await paradiseWebsiteApplicationContext(guild, userId, { workflow: normalizedWorkflow });
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
  const storedEvidence = await processParadiseApplicationEvidence({
    guildId: guild.id,
    applicationId: id,
    questions: selected.questions,
    evidence,
    requiredQuestionKeys: selected.questions
      .filter(question => question.evidenceRequirement === "required")
      .map(question => question.key)
  });
  const record = {
    id, guildId: guild.id, userId, type, workflow: normalizedWorkflow,
    answers: normalizedAnswers, evidence: storedEvidence, source: "fima_website",
    siteUserId, status: "pending", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  const review = await configuredChannel(guild, "application_review_channel", "application-reviews");
  if (!review) {
    await removeParadiseApplicationEvidence(storedEvidence);
    throw applicationPrivateReviewError();
  }
  let reviewTarget = null;
  let reviewMessage = null;
  try {
    reviewTarget = await applicationPrivateReviewTarget(review, id, type);
    const preview = buildParadisePrivateApplicationPreview({
      id, type, userId, answers: normalizedAnswers, evidence: storedEvidence
    });
    reviewMessage = await reviewTarget.channel.send({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(preview.title)
        .setDescription(preview.description)
        .addFields(preview.fields)
        .setFooter(paradiseFooter("Pending private review")).setTimestamp()],
      components: applicationReviewComponents(id),
      files: applicationEvidenceDiscordFiles(storedEvidence)
    });
    if (!reviewMessage?.id) throw applicationPrivateReviewError();
    record.reviewChannelId = reviewTarget.channel.id;
    record.reviewParentChannelId = reviewTarget.parentChannelId;
    record.privateReviewThread = true;
    record.reviewMessageId = reviewMessage.id;
    record.updatedAt = new Date().toISOString();
    await saveState(next => {
      next.applications = next.applications || {};
      next.applications[guild.id] = next.applications[guild.id] || {};
      next.applications[guild.id][id] = record;
      return next;
    });
  } catch (error) {
    await Promise.allSettled([
      reviewMessage?.delete?.(),
      reviewTarget?.privateThread ? reviewTarget.channel?.delete?.("Application delivery failed") : undefined,
      removeParadiseApplicationEvidence(storedEvidence)
    ].filter(Boolean));
    if (error?.code === "application_private_review_unavailable") throw error;
    throw applicationPrivateReviewError(error);
  }
  await logParadiseAction(guild, "application_logs_channel", "application-logs", "Website application submitted",
    `<@${userId}> submitted **${applicationLabel(type)}** from the Fima website · \`${id.slice(0, 8)}\`.`);
  return {
    id: id.slice(0, 8), status: "pending", type, label: applicationLabel(type), workflow: normalizedWorkflow,
    reviewQueued: true,
    evidence: {
      total: storedEvidence.length,
      accepted: storedEvidence.filter(file => file.status === "accepted").length,
      quarantined: storedEvidence.filter(file => file.status !== "accepted").length
    },
    createdAt: record.createdAt
  };
}

async function handleApplicationCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "panel") {
    if (!canManageClan(interaction.member)) return interaction.reply({ content: "Application management authority required.", ephemeral: true });
    const channel = await configuredChannel(interaction.guild, "application_ticket_channel", "application-ticket") || interaction.channel;
    const guildConfig = configForGuild(await loadState(), interaction.guildId);
    const language = guildLanguage(guildConfig);
    await channel.send(paradiseApplicationPanelPayload(
      await paradiseBrandColor(), language, guildConfig.applicationSettings
    ));
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
  if (sub === "continue") {
    const pendingMoreInfo = records.find(item => item.status === "more_info");
    if (!pendingMoreInfo) return interaction.reply({ content: "You do not have an application waiting for more information.", ephemeral: true });
    return interaction.showModal(applicationMoreInfoModal(pendingMoreInfo, guildLanguage(configForGuild(state, interaction.guildId))));
  }
  if (state.blacklists?.[interaction.guildId]?.[interaction.user.id]?.status === "active") {
    return interaction.reply({ content: "Active blacklist records block applications. Use the appeal flow first.", ephemeral: true });
  }
  const pending = records.find(item => ["pending", "more_info"].includes(item.status));
  if (pending) return interaction.reply({ content: `You already have an active **${applicationLabel(pending.type)}** application.`, ephemeral: true });
  const guildConfig = configForGuild(state, interaction.guildId);
  const applicationSettings = guildConfig.applicationSettings || {};
  const selectedType = interaction.options.getString("type");
  const workflow = paradiseApplicationWorkflowForType(selectedType);
  if (!APPLICATION_TYPES.some(([value]) => value === selectedType)
    || !applicationTypeAllowedForMode(selectedType, guildConfig.activeSetupMode, workflow)) {
    return interaction.reply({ content: "This application type is not available for the active server template.", ephemeral: true });
  }
  const cooldownDays = Number(applicationSettings.cooldownDays ?? 7);
  const latestAt = records[0] ? Date.parse(records[0].createdAt) : 0;
  const cooldownUntil = latestAt + cooldownDays * 86_400_000;
  if (cooldownUntil > Date.now()) {
    return interaction.reply({ content: `Application cooldown ends <t:${Math.floor(cooldownUntil / 1000)}:R>.`, ephemeral: true });
  }
  return interaction.showModal(applicationModal(selectedType, 0, "new", applicationSettings));
}

async function handleApplicationModal(interaction) {
  const [, type, rawStep = "0", draftId = "new"] = interaction.customId.split(":");
  if (!APPLICATION_TYPES.some(([value]) => value === type)) {
    return interaction.reply({ content: "Unknown application type.", ephemeral: true });
  }
  const state = await loadState();
  const guildConfig = configForGuild(state, interaction.guildId);
  const applicationSettings = guildConfig.applicationSettings || {};
  const workflow = paradiseApplicationWorkflowForType(type);
  const chunks = applicationQuestionChunks(type, applicationSettings);
  const step = Math.min(Math.max(Number(rawStep) || 0, 0), chunks.length - 1);
  const submittedAnswers = collectApplicationAnswers(interaction, type, step, applicationSettings);
  if (!applicationTypeAllowedForMode(type, guildConfig.activeSetupMode, workflow)) {
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
        workflow,
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
      content: `Başvuru bölümü kaydedildi: **${step + 1}/${chunks.length}**. Sonraki bölümü doldurmak için devam et.`,
      components: applicationContinueComponents(activeDraftId),
      ephemeral: true
    });
  }
  const id = crypto.randomUUID();
  const record = {
    id, guildId: interaction.guildId, userId: interaction.user.id, type, workflow, answers: mergedAnswers,
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
      components: applicationReviewComponents(id)
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
  const guildConfig = configForGuild(state, interaction.guildId);
  return interaction.showModal(applicationModal(
    draft.type, draft.nextStep, draftId, guildConfig.applicationSettings || {}
  ));
}

async function handleApplicationMoreInfoModal(interaction) {
  const id = interaction.customId.split(":")[1];
  const response = maskApplicationReviewText(interaction.fields.getTextInputValue("more_info_response"), 700);
  const state = await loadState();
  const record = state.applications?.[interaction.guildId]?.[id];
  let updatedRecord;
  try {
    updatedRecord = transitionParadiseApplicationClarification(record, {
      userId: interaction.user.id,
      response
    });
  } catch {
    return interaction.reply({ content: "This application is not waiting for your clarification.", ephemeral: true });
  }
  await saveState(next => {
    next.applications = next.applications || {};
    next.applications[interaction.guildId] = next.applications[interaction.guildId] || {};
    next.applications[interaction.guildId][id] = updatedRecord;
    return next;
  });
  const review = record.reviewChannelId ? await interaction.guild.channels.fetch(record.reviewChannelId).catch(() => null) : null;
  const message = review?.isTextBased?.() && record.reviewMessageId
    ? await review.messages.fetch(record.reviewMessageId).catch(() => null)
    : null;
  if (message) {
    const embed = message.embeds?.[0]
      ? EmbedBuilder.from(message.embeds[0])
      : new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`Application · ${applicationLabel(record.type)}`);
    embed
      .setTitle(`Application · ${applicationLabel(record.type)} · FOLLOW-UP RECEIVED`)
      .addFields({ name: "Applicant clarification", value: response, inline: false })
      .setFooter(paradiseFooter("Awaiting private re-review"))
      .setTimestamp();
    await message.edit({ embeds: [embed], components: applicationReviewComponents(id) }).catch(() => null);
  }
  await logParadiseAction(interaction.guild, "application_logs_channel", "application-logs", "Application clarification submitted",
    `Application \`${id.slice(0, 8)}\` was returned to private review.`, { safe: true }).catch(() => null);
  return interaction.reply({ content: "Your clarification was sent back to the private review queue.", ephemeral: true });
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
    content: "Başvuru taslağı iptal edildi. İstersen panelden tekrar başlayabilirsin. / Application draft cancelled.",
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
  if (!["approve", "deny", "more"].includes(action) || !id) {
    return interaction.reply({ content: "This application review control is invalid or outdated.", ephemeral: true });
  }
  if (["deny", "more"].includes(action)) {
    const language = guildLanguage(configForGuild(await loadState(), interaction.guildId));
    return interaction.showModal(applicationReviewReasonModal(action, id, language));
  }
  return finalizeApplicationReview(interaction, action, id);
}

async function handleApplicationReviewReasonModal(interaction) {
  if (!canReviewApplications(interaction.member)) return interaction.reply({ content: "Application reviewer authority required.", ephemeral: true });
  const [, action, id] = interaction.customId.split(":");
  if (!["deny", "more"].includes(action) || !id) {
    return interaction.reply({ content: "This application review control is invalid or outdated.", ephemeral: true });
  }
  return finalizeApplicationReview(interaction, action, id, interaction.fields.getTextInputValue("review_reason"));
}

async function finalizeApplicationReview(interaction, action, id, rawReason = "") {
  if (!canReviewApplications(interaction.member)) return interaction.reply({ content: "Application reviewer authority required.", ephemeral: true });
  const state = await loadState();
  const record = state.applications?.[interaction.guildId]?.[id];
  if (!record || record.status !== "pending") return interaction.reply({ content: "This application is no longer pending.", ephemeral: true });
  let updatedRecord;
  try {
    updatedRecord = transitionParadiseApplicationReview(record, {
      action,
      reviewerId: interaction.user.id,
      reason: rawReason
    });
  } catch (error) {
    return interaction.reply({
      content: error?.code === "application_review_reason_required"
        ? "A review reason of at least five characters is required."
        : "This application review control is invalid or outdated.",
      ephemeral: true
    });
  }
  const { status, reviewReason } = updatedRecord;
  let grantedRole = null;
  if (status === "approved" && configForGuild(state, interaction.guildId).applicationSettings?.autoGrantRole !== false) {
    const guildConfig = configForGuild(state, interaction.guildId);
    const roleName = paradiseApplicationAutoGrantRoleName(record, guildConfig);
    const role = roleName
      ? interaction.guild.roles.cache.find(item => item.name === roleName || item.id === roleName)
      : null;
    const applicant = await interaction.guild.members.fetch(record.userId).catch(() => null);
    const botMember = interaction.guild.members.me;
    if (role && applicant && !role.managed
      && interaction.member.roles.highest.comparePositionTo(role) > 0
      && botMember?.roles.highest.comparePositionTo(role) > 0) {
      await applicant.roles.add(role, `FIMA Bot approved ${applicationLabel(record.type)} application`).catch(() => {});
      grantedRole = role.id;
    }
  }
  updatedRecord = { ...updatedRecord, grantedRole };
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

async function updateModerationCaseByPrefix(interaction, idOrPrefix, mutate) {
  let updated = null;
  await saveState(state => {
    const cases = state.moderationCases?.[interaction.guildId] || {};
    const [id, record] = Object.entries(cases).find(([key]) => key.startsWith(String(idOrPrefix || "").trim())) || [];
    if (!record) return state;
    updated = { ...record, ...mutate(record), updatedBy: interaction.user.id, updatedAt: new Date().toISOString() };
    state.moderationCases[interaction.guildId][id] = updated;
    return state;
  });
  return updated;
}

async function handleChannelCommand(interaction) {
  if (!canApproveModeration(interaction.member)) return interaction.reply({ content: "Senior moderation authority required.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  const everyone = interaction.guild.roles.everyone;
  const overwrite = sub === "lock" ? { SendMessages: false }
    : sub === "unlock" ? { SendMessages: null }
      : sub === "hide" ? { ViewChannel: false }
        : { ViewChannel: null };
  try {
    await interaction.channel.permissionOverwrites.edit(everyone, overwrite, { reason: `FIMA Bot channel ${sub} by ${interaction.user.id}` });
  } catch {
    return interaction.reply({ content: "FIMA could not update this channel. Check the bot's Manage Channels permission and role position.", ephemeral: true });
  }
  await logParadiseAction(interaction.guild, "moderation_logs_channel", "mod-logs", "Channel operation",
    `${interaction.user} used **/channel ${sub}** in ${interaction.channel}.`, { type: "moderation", metadata: { operation: sub, channelId: interaction.channelId } });
  const label = { lock: "locked", unlock: "unlocked", hide: "hidden", unhide: "visible" }[sub] || "updated";
  return interaction.reply({ content: `This channel is now **${label}**.`, ephemeral: true });
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
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: enabled ? false : null }, { reason: `FIMA Bot lockdown by ${interaction.user.id}` });
    await logParadiseAction(interaction.guild, "moderation_logs_channel", "mod-logs", "Channel lockdown", `${interaction.user} set ${interaction.channel} lockdown to **${enabled}**.`);
    return interaction.reply({ content: `This channel is now **${enabled ? "locked" : "unlocked"}**.`, ephemeral: true });
  }
  if (sub === "purge") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: "Manage Messages permission required for purge.", ephemeral: true });
    const amount = interaction.options.getInteger("amount");
    const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);
    if (!deleted) return interaction.reply({ content: "FIMA could not purge these messages. Discord only permits recent bulk deletions.", ephemeral: true });
    await logParadiseAction(interaction.guild, "moderation_logs_channel", "mod-logs", "Messages purged",
      `${interaction.user} purged **${deleted.size}** recent message(s) in ${interaction.channel}.`, { type: "moderation", metadata: { count: deleted.size, channelId: interaction.channelId } });
    return interaction.reply({ content: `Purged **${deleted.size}** recent message(s).`, ephemeral: true });
  }
  if (sub === "slowmode") {
    if (!canApproveModeration(interaction.member)) return interaction.reply({ content: "Senior moderation authority required.", ephemeral: true });
    const seconds = interaction.options.getInteger("seconds");
    try { await interaction.channel.setRateLimitPerUser(seconds, `FIMA Bot slowmode by ${interaction.user.id}`); } catch {
      return interaction.reply({ content: "FIMA could not change slowmode. Check the bot's Manage Channels permission.", ephemeral: true });
    }
    await logParadiseAction(interaction.guild, "moderation_logs_channel", "mod-logs", "Slowmode changed",
      `${interaction.user} set ${interaction.channel} slowmode to **${seconds} seconds**.`, { type: "moderation", metadata: { seconds, channelId: interaction.channelId } });
    return interaction.reply({ content: seconds ? `Slowmode set to **${seconds} seconds**.` : "Slowmode disabled.", ephemeral: true });
  }
  if (sub === "warn-remove" || sub === "case-edit" || sub === "case-revoke") {
    if (!canApproveModeration(interaction.member)) return interaction.reply({ content: "Senior moderation authority required.", ephemeral: true });
    const id = interaction.options.getString("id");
    const reason = interaction.options.getString("reason");
    const record = await updateModerationCaseByPrefix(interaction, id, current => {
      if (sub === "warn-remove" && current.action !== "warn") return {};
      if (sub === "case-edit") return { reason, correctionReason: reason, correctedAt: new Date().toISOString() };
      return { status: "revoked", revokeReason: reason, revokedAt: new Date().toISOString() };
    });
    if (!record || (sub === "warn-remove" && record.action !== "warn")) return interaction.reply({ content: sub === "warn-remove" ? "Active warning case not found." : "Case not found.", ephemeral: true });
    if (sub === "warn-remove") await updateModerationCaseByPrefix(interaction, id, () => ({ status: "revoked", revokeReason: reason, revokedAt: new Date().toISOString() }));
    await logParadiseAction(interaction.guild, "moderation_logs_channel", "mod-logs", "Moderation case updated",
      `${interaction.user} used **/mod ${sub}** on case \`${record.id.slice(0, 8)}\`.`, { type: "moderation", metadata: { action: sub, caseId: record.id } });
    return interaction.reply({ content: `Case \`${record.id.slice(0, 8)}\` updated safely; its audit history remains preserved.`, ephemeral: true });
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
    if (!target.moderatable) return interaction.reply({ content: "FIMA Bot cannot timeout this member because of Discord role hierarchy.", ephemeral: true });
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
  if (sub === "timeout-remove") {
    if (!target.moderatable) return interaction.reply({ content: "FIMA Bot cannot change this member's timeout because of Discord role hierarchy.", ephemeral: true });
    await target.timeout(null, reason);
    const record = await recordModerationCase(interaction, "timeout_removed", target, reason);
    await logParadiseAction(interaction.guild, "moderation_logs_channel", "mod-logs", "Timeout removed", `${target} timeout removed by ${interaction.user}.`, { type: "moderation", metadata: { caseId: record.id } });
    return interaction.reply({ content: `Timeout removed · case \`${record.id.slice(0, 8)}\`.`, ephemeral: true });
  }
  if (sub === "nick-reset") {
    if (!target.manageable) return interaction.reply({ content: "FIMA Bot cannot reset this nickname because of Discord role hierarchy.", ephemeral: true });
    await target.setNickname(null, reason);
    const record = await recordModerationCase(interaction, "nickname_reset", target, reason);
    await logParadiseAction(interaction.guild, "moderation_logs_channel", "mod-logs", "Nickname reset", `${target} nickname reset by ${interaction.user}.`, { type: "moderation", metadata: { caseId: record.id } });
    return interaction.reply({ content: `Nickname reset · case \`${record.id.slice(0, 8)}\`.`, ephemeral: true });
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
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("◆ FIMA BOT SECURITY")
      .setDescription(`# Safe operations\n${lines.join("\n")}\n\n-# False positives require staff review; FIMA Bot does not auto-ban on the first mistake.`)
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
    await channel.permissionOverwrites.edit(everyone, { Connect: locked ? null : false }, { reason: "FIMA Bot private voice owner control" });
    await saveState(next => { next.temporaryVoices[channelId] = { ...record, locked: !locked }; return next; });
    return interaction.reply({ content: locked ? "Ses kanalı açıldı." : "Ses kanalı kilitlendi.", ephemeral: true });
  }
  if (action === "limit") {
    const limits = [0, 2, 4, 6, 8, 10];
    const nextLimit = limits[(limits.indexOf(channel.userLimit) + 1) % limits.length];
    await channel.setUserLimit(nextLimit, "FIMA Bot private voice owner control");
    return interaction.reply({ content: `Kullanıcı limiti **${nextLimit || "sınırsız"}** olarak ayarlandı.`, ephemeral: true });
  }
  if (action === "hide") {
    const everyone = interaction.guild.roles.everyone;
    const hidden = Boolean(record.hidden);
    await channel.permissionOverwrites.edit(everyone, { ViewChannel: hidden ? null : false }, { reason: "FIMA Bot private voice owner control" });
    await saveState(next => { next.temporaryVoices[channelId] = { ...record, hidden: !hidden }; return next; });
    return interaction.reply({ content: hidden ? "Ses kanalı görünür oldu." : "Ses kanalı gizlendi.", ephemeral: true });
  }
  if (channel.members.size > 0) return interaction.reply({ content: "Kanalı silmeden önce herkesin çıkması gerekir.", ephemeral: true });
  await channel.delete("FIMA Bot private voice owner request");
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
  await channel.setName(safeName, "FIMA Bot private voice safe rename");
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
    await channel.permissionOverwrites.edit(member, { ViewChannel: true, Connect: true }, { reason: "FIMA Bot private voice permit" });
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
    if (member.voice.channelId === channel.id) await member.voice.disconnect("FIMA Bot private voice owner rejected member").catch(() => {});
    await channel.permissionOverwrites.edit(member, { Connect: false }, { reason: "FIMA Bot private voice reject" });
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
    await channel.permissionOverwrites.edit(interaction.user.id, { ManageChannels: null, MoveMembers: null }, { reason: "FIMA Bot voice ownership transfer" });
    await channel.permissionOverwrites.edit(member, {
      ViewChannel: true, Connect: true, ManageChannels: true, MoveMembers: true
    }, { reason: "FIMA Bot voice ownership transfer" });
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
  const voiceConfig = fimaVoiceSettings(guildConfig);
  if (!fimaRuntimeModuleAllowed(guildConfig, 'voice')) return false;
  if (!activeMode || voiceConfig.enabled === false) return false;
  const joined = newState.channel;
  const isJoinToCreate = joined?.type === ChannelType.GuildVoice
    && (voiceConfig.joinToCreateChannelId ? joined.id === voiceConfig.joinToCreateChannelId : ["⌁・join-to-create", "◜・oda-oluştur", "Join to Create"].includes(joined.name));
  if (isJoinToCreate) {
    const fallbackName = `${newState.member.displayName || newState.member.user.username}'s room`;
    const privateCategory = guild.channels.cache.get(voiceConfig.privateVoiceCategoryId)
      || guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && ["⌁・VOICE", "━━ ÖZEL SESLER ━━", "PRIVATE VOICE"].includes(channel.name));
    const channel = await guild.channels.create({
      name: sanitizeTemporaryVoiceName(fallbackName, "Private Room"),
      type: ChannelType.GuildVoice,
      parent: privateCategory?.id || joined.parentId,
      userLimit: Math.min(99, Math.max(0, Number(voiceConfig.defaultLimit) || 0)),
      permissionOverwrites: [
        { id: guild.roles.everyone.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] },
        { id: newState.member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers] }
      ],
      reason: "FIMA Bot Join to Create"
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
    await newState.setChannel(channel, "FIMA Bot Join to Create");
    await channel.send(temporaryVoicePanel(channel.id)).catch(() => {});
    return true;
  }
  const oldChannel = oldState.channel;
  if (oldChannel && oldChannel.id !== newState.channelId) {
    const record = (await loadState()).temporaryVoices?.[oldChannel.id];
    if (record && oldChannel.members.size === 0 && voiceConfig.autoDelete !== false) {
      await oldChannel.delete("FIMA Bot empty temporary voice cleanup").catch(() => {});
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
    const guildConfig = configForGuild(state, guild.id);
    const policy = paradiseXpPolicy(guildConfig);
    const levelChannel = await configuredChannel(guild, "level_channel", "level-leaderboard")
      || guild.channels.cache.find(channel => channel.name === "level-logs" && channel.isTextBased?.())
      || sourceChannel;
    const position = Object.values(state.memberLevels || {})
      .filter(item => belongsToGuild(item, guild.id))
      .sort((a, b) => Number(b.xp || 0) - Number(a.xp || 0))
      .findIndex(item => item.userId === member.id) + 1;
    if (levelChannel?.isTextBased?.()) {
      const tr = paradiseGuildContentLanguage(guildConfig) === "tr";
      const notice = await levelChannel.send(tr
        ? `${member} artık **Seviye ${result.level}**! Sunucu sıralaması: **#${Math.max(1, position)}**.`
        : `${member} is now **Level ${result.level}**! Your server rank is **#${Math.max(1, position)}**.`).catch(() => null);
      const deleteSeconds = policy.levelUpDeleteSeconds;
      if (notice) setTimeout(() => notice.delete().catch(() => {}), deleteSeconds * 1000).unref?.();
    }
    const rewardName = policy.roleRewards[String(result.level)];
    const rewardRole = rewardName ? guild.roles.cache.find(role => role.name === rewardName || role.id === rewardName) : null;
    if (rewardRole && guild.members.me?.roles.highest.comparePositionTo(rewardRole) > 0) {
      await member.roles.add(rewardRole, `FIMA Bot level ${result.level} reward`).catch(() => {});
    }
  }
  return result;
}

async function updateLevelLeaderboard(guild) {
  const state = await loadState();
  const config = configForGuild(state, guild.id);
  const template = inferParadiseTemplate({ configuredTemplate: config.activeSetupMode, guildName: guild.name });
  if (template === "community") return null;
  const channel = await configuredChannel(guild, "level_channel", "level-leaderboard");
  if (!channel) return null;
  const rows = Object.values(state.memberLevels)
    .filter(item => belongsToGuild(item, guild.id))
    .sort((a, b) => Number(b.xp) - Number(a.xp))
    .slice(0, 20);
  const description = rows.map((item, index) => `**${index + 1}.** <@${item.userId}> · Level **${item.level}** · ${item.xp} XP`).join("\n")
    || "_No chat or voice activity recorded yet._";
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("◆ FIMA BOT ACTIVITY LEADERBOARD")
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
  if (!fimaRuntimeModuleAllowed(config, "levels") || !config.activeSetupMode || config.xpSettings?.enabled === false) return false;
  if (inferParadiseTemplate({ configuredTemplate: config.activeSetupMode, guildName: message.guild.name }) === "community") return false;
  const excluded = new Set(config.xpSettings?.excludedChannels || []);
  if (excluded.has(message.channel.id)
    || /(?:^|[-_])(bot|spam|logs?|transcripts?)(?:$|[-_])/i.test(message.channel.name || "")) return false;
  const key = guildUserKey(message.guild.id, message.author.id);
  const last = levelMessageCooldowns.get(key) || 0;
  const cooldownMs = paradiseXpPolicy(config).chatCooldownSeconds * 1000;
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
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`◆ ${user.username}'s FIMA Bot Rank`)
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
  const showPublicNotes = guildConfig.leaderboard?.showPublicNotes === true;
  const color = await paradiseBrandColor();
  const leaderboard = leaderboardForGuild(state, guild.id);
  const topSize = Math.min(100, Math.max(2, Number(guildConfig.challenge?.topSize) || 30));
  const entries = Object.entries(leaderboard)
    .filter(([, row]) => Number.isInteger(Number(row.spot)) && Number(row.spot) >= 1 && Number(row.spot) <= topSize)
    .sort((a, b) => Number(a[1].spot) - Number(b[1].spot));
  const groups = rankedLeaderboardGroups(guildConfig);
  const messageIds = guildConfig.rankedLeaderboardMessageIds || {};
  const posted = [];
  for (const group of groups) {
    const channel = paradiseTextChannelByName(guild, group.channel);
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
      // Notes/feats are staff or profile detail by default.  A guild can opt
      // into a compact public note, but a board never leaks it accidentally.
      const shortNote = showPublicNotes ? compactText(row.publicNote || row.shortNote || row.boardNote || "", 80) : "";
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
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(`◆ FIMA BOT ${type.toUpperCase()} LEADERBOARD`)
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
  if (sub === "history") {
    const rows = (state.leaderboardHistory?.[interaction.guildId] || []).slice(-12).reverse();
    const text = rows.length
      ? rows.map(item => `- **${item.action}** · <t:${Math.floor(Date.parse(item.at) / 1000)}:R> · <@${item.actorId}>`).join("\n")
      : "No ranked leaderboard audit entries are stored yet.";
    return interaction.reply({ content: text, ephemeral: true });
  }
  if (sub === "clear") {
    if (String(interaction.options.getString("confirm") || "").trim().toUpperCase() !== "CLEAR") {
      return interaction.reply({ content: "Leaderboard was not changed. Type `CLEAR` exactly to confirm.", ephemeral: true });
    }
    await saveState(next => {
      next.leaderboards[interaction.guildId] = {};
      recordParadiseLeaderboardAudit(next, {
        guildId: interaction.guildId,
        action: "clear",
        actorId: interaction.user.id,
        metadata: { previousCount: Object.keys(leaderboard).length }
      });
      return next;
    });
    const posted = await updateRankedLeaderboardBoards(interaction.guild);
    await logParadiseAction(interaction.guild, "roster_logs_channel", "roster-logs", "Ranked leaderboard cleared", "A manager cleared the ranked leaderboard after typed confirmation.", { safe: true }).catch(() => null);
    return interaction.reply({ content: `Ranked leaderboard cleared and **${posted.length}** board(s) refreshed.`, ephemeral: true });
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
      recordParadiseLeaderboardAudit(next, {
        guildId: interaction.guildId,
        action: "import",
        actorId: interaction.user.id,
        metadata: { count: rows.length }
      });
      return next;
    });
  } else if (sub === "swap") {
    const user1 = interaction.options.getUser("user1");
    const user2 = interaction.options.getUser("user2");
    if (!leaderboard[user1.id]?.spot || !leaderboard[user2.id]?.spot) return interaction.reply({ content: "Both users must already be ranked.", ephemeral: true });
    await saveState(next => {
      const target = ensureLeaderboardForGuild(next, interaction.guildId);
      [target[user1.id].spot, target[user2.id].spot] = [target[user2.id].spot, target[user1.id].spot];
      recordParadiseLeaderboardAudit(next, {
        guildId: interaction.guildId,
        action: "swap",
        actorId: interaction.user.id,
        metadata: { user1Id: user1.id, user2Id: user2.id }
      });
      return next;
    });
  } else {
    const user = interaction.options.getUser("user");
    if (sub === "remove") {
      await saveState(next => {
        delete ensureLeaderboardForGuild(next, interaction.guildId)[user.id];
        recordParadiseLeaderboardAudit(next, {
          guildId: interaction.guildId,
          action: "remove",
          actorId: interaction.user.id,
          metadata: { userId: user.id }
        });
        return next;
      });
    } else {
      const rank = interaction.options.getInteger("rank");
      const occupied = Object.entries(leaderboard).find(([id, row]) => id !== user.id && Number(row.spot) === rank);
      if (occupied) return interaction.reply({ content: `Rank **#${rank}** is already occupied by <@${occupied[0]}>. Use \`/leaderboard swap\` or move that fighter first.`, ephemeral: true });
      await saveState(next => {
        const target = ensureLeaderboardForGuild(next, interaction.guildId);
        target[user.id] = { ...(target[user.id] || {}), spot: rank, updatedAt: new Date().toISOString(), updatedBy: interaction.user.id };
        recordParadiseLeaderboardAudit(next, {
          guildId: interaction.guildId,
          action: sub === "edit" ? "edit" : sub,
          actorId: interaction.user.id,
          metadata: { userId: user.id, rank }
        });
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
  const rawConfig = configForGuild(state, member.guild.id);
  if (!fimaRuntimeModuleAllowed(rawConfig, 'welcome')) return false;
  const mode = rawConfig.activeSetupMode || "community";
  const config = mergeParadiseCommunityAssetDefaults(rawConfig, {
    guildId: member.guild.id,
    mode
  });
  const preview = options.preview === true;
  if (!rawConfig.activeSetupMode && !preview) return false;
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
    const tr = guildLanguage(config) === "tr";
    const channelRef = (mappingKey, fallback) => mentionIfFound(mappingKey, fallback);
    const destinations = [
      channelRef("rules_channel", "rules") ? (tr ? `- Kuralları ${channelRef("rules_channel", "rules")} kanalında oku.` : `- Read the rules in ${channelRef("rules_channel", "rules")}.`) : null,
      mode === "community" && channelRef("faq_channel", "security-and-trust") ? (tr ? `- Fima ve sunucu güvenliği için ${channelRef("faq_channel", "security-and-trust")} kanalına bak.` : `- Learn how Fima and this server stay safe in ${channelRef("faq_channel", "security-and-trust")}.`) : null,
      channelRef("role_guide_channel", "role-guide") ? (tr ? `- Dilini, bildirimlerini ve rollerini ${channelRef("role_guide_channel", "role-guide")} kanalından seç.` : `- Choose your language, pings and roles in ${channelRef("role_guide_channel", "role-guide")}.`) : null,
      mode !== "community" && channelRef("challenge_channel", "challenge-ticket") ? (tr ? `- ${channelRef("challenge_channel", "challenge-ticket")} kullanmadan önce profilini tamamla.` : `- Complete your profile before using ${channelRef("challenge_channel", "challenge-ticket")}.`) : null,
      mode === "community" && fimaRuntimeModuleAllowed(rawConfig, "tickets") && channelRef("support_ticket_channel", "open-ticket") ? (tr ? `- Özel yardım için ${channelRef("support_ticket_channel", "open-ticket")} kanalından ticket aç.` : `- Open a private support ticket in ${channelRef("support_ticket_channel", "open-ticket")}.`) : null
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
    const banner = sanitizeParadiseHttpsUrl(joined ? config.welcomeSettings?.bannerUrl : config.welcomeSettings?.leaveBannerUrl);
    if (banner) embed.setImage(banner);
    const sent = await publicChannel.send({
      content: joined ? `${member}` : undefined,
      embeds: [embed],
      allowedMentions: { users: joined ? [member.id] : [], parse: [] }
    }).catch(() => null);
    if (!sent) return false;
  }
  if (!preview && log && fimaRuntimeModuleAllowed(rawConfig, "logs")) await log.send(`${joined ? "Joined" : "Left"}: ${member.user.tag} (${member.id}) · <t:${Math.floor(Date.now() / 1000)}:F>`).catch(() => {});
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
  if (!fimaRuntimeModuleAllowed(config, "security")) return true;
  const policy = config.moderationSettings || {};
  const security = state.securityState?.[member.guild.id] || {};
  const ageDays = Math.max(0, (Date.now() - member.user.createdTimestamp) / 86_400_000);
  const threshold = Math.max(0, Number(policy.suspiciousAccountDays ?? 7));
  const shouldQuarantine = policy.quarantineEnabled !== false
    && (security.raidMode === true || policy.raidModeDefault === true || (threshold > 0 && ageDays < threshold));
  if (shouldQuarantine) {
    const role = await ensureRole(member.guild, "Muted / Quarantined");
    if (member.guild.members.me?.roles.highest.comparePositionTo(role) > 0) {
      await member.roles.add(role, security.raidMode ? "FIMA Bot raid mode join quarantine" : "FIMA Bot suspicious account-age review").catch(() => {});
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
    .setFooter({ text: "Automatic FIMA Bot activity check • Made By Fieel" })], components: [row] });
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
    const storedLogs = Array.isArray(state.paradiseLogs?.[guild.id]) ? state.paradiseLogs[guild.id] : [];
    state.paradiseLogs[guild.id] = storedLogs.filter(event => {
      const expiresAt = Date.parse(event?.createdAt || 0) + (Math.max(1, Number(event?.retentionDays) || 180) * 86_400_000);
      return Number.isFinite(expiresAt) && expiresAt > now;
    });
    for (const [userId, item] of Object.entries(state.whitelists)) {
      if (!belongsToGuild(item, guild.id) || !fimaRuntimeModuleAllowed(config, "availability")) continue;
      if (item.expiresAt && Date.parse(item.expiresAt) <= now) {
        delete state.whitelists[userId];
        const member = guild.members.cache.get(item.userId || userId);
        const role = guild.roles.cache.find(entry => entry.name === "Activity Whitelist");
        if (member && role) await member.roles.remove(role, "FIMA Bot activity whitelist expired").catch(() => {});
      }
    }
    for (const [userId, item] of Object.entries(state.loa)) {
      if (!belongsToGuild(item, guild.id) || !fimaRuntimeModuleAllowed(config, "availability")) continue;
      if (item.status === "approved" && Number(item.expiresAt) <= now) {
        state.loa[userId] = { ...item, status: "expired", endedAt: new Date().toISOString() };
        const member = guild.members.cache.get(item.userId || userId);
        const role = guild.roles.cache.find(entry => entry.name === "LOA");
        if (member && role) await member.roles.remove(role, "FIMA Bot LOA expired").catch(() => {});
      }
    }
    for (const [id, check] of Object.entries(state.activityChecks)) {
      if (!belongsToGuild(check, guild.id) || !fimaRuntimeModuleAllowed(config, "sessions")) continue;
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
    if (fimaRuntimeModuleAllowed(config, "sessions") && config.autoActivityChecks === true) {
      const last = Number(config.lastAutoActivityCheckAt || 0);
      const intervalHours = Number(config.activity?.checkEveryHours || 48);
      if (now - last >= intervalHours * 60 * 60_000) {
        for (const group of ["Referee", "Tryout", "Training"]) await postAutomaticActivityCheck(guild, group, state);
        config.lastAutoActivityCheckAt = now;
      }
    }
    const sundayKey = new Date(now).toISOString().slice(0, 10);
    if (fimaRuntimeModuleAllowed(config, "sessions") && new Date(now).getUTCDay() === 0 && config.lastWeeklyReview !== sundayKey) {
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
  const activeTemplate = inferParadiseTemplate({ configuredTemplate: config.activeSetupMode, guildName: guild.name });
  if (fimaRuntimeModuleAllowed(config, "levels") && config.activeSetupMode && activeTemplate !== "community" && config.xpSettings?.enabled !== false) {
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
  if (fimaRuntimeModuleAllowed(config, "events") && config.activeSetupMode === "clan" && config.eventSettings?.dailyQuestionEnabled !== false && clock.hour >= questionHour) {
    await postDailyQuestion(guild).catch(() => {});
  }
  if (fimaRuntimeModuleAllowed(config, "levels") && config.activeSetupMode && activeTemplate !== "community"
    && (!config.lastLevelLeaderboardAt || Date.now() - Number(config.lastLevelLeaderboardAt) >= 60 * 60_000)) {
    await updateLevelLeaderboard(guild).catch(() => {});
  }
  if (fimaRuntimeModuleAllowed(config, "availability")) await updateLoaPanel(guild).catch(() => {});
  if (fimaRuntimeModuleAllowed(config, "availability")) await updateAvailabilityPanel(guild).catch(() => {});
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
  await member.roles.add(role, "FIMA Bot activity whitelist");
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

export function paradiseMainerAnnouncement({ code = null, region = "EU", mainChannelId = null, language = "tr" } = {}) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  const normalizedRegion = String(region || "EU").trim().toUpperCase();
  const mainChannel = mainChannelId ? `<#${mainChannelId}>` : (language === "tr" ? "_Henüz main kanalı seçilmedi._" : "_No main channel has been selected yet._");
  if (!normalizedCode) {
    return language === "tr"
      ? "# ⚠️ Mainer kodu henüz ayarlanmadı\n\n> Owner, FIMA Bot Dashboard veya `/mainer set` üzerinden kodu ve bölgeyi ayarladığında bu mesaj aynı yerde otomatik güncellenir."
      : "# ⚠️ Mainer code has not been configured yet\n\n> Once the owner sets the code and region in FIMA Bot Dashboard or with `/mainer set`, this same message updates automatically.";
  }
  return language === "tr"
    ? `# 🌴 Mainer kodumuz hazır!\n\nFIMA Bot'u main klanın olarak ayarlamak için aşağıdaki bilgileri kullanabilirsin.\n\n### Kod\n\`${normalizedCode}\`\n\n### Main kanalı\n${mainChannel}\n\n### Kullanacağın komut\n\`/mainclan code:${normalizedCode} region:${normalizedRegion}\`\n\n> Bir sorun yaşarsan destek kanalından bize ulaş. Hesap şifresi, cookie veya token paylaşma.`
    : `# 🌴 Our mainer code is ready!\n\nUse the details below to set FIMA Bot as your main clan.\n\n### Code\n\`${normalizedCode}\`\n\n### Main channel\n${mainChannel}\n\n### Command to use\n\`/mainclan code:${normalizedCode} region:${normalizedRegion}\`\n\n> If you need help, contact support. Never share a password, cookie or token.`;
}

async function updateParadiseMainerAnnouncement(guild) {
  const state = await loadState();
  const config = configForGuild(state, guild.id);
  const channel = config.mainerAnnouncementChannelId
    ? await guild.channels.fetch(config.mainerAnnouncementChannelId).catch(() => null)
    : await configuredChannel(guild, "mainer_proof_channel", "mainer-proof");
  if (!channel?.isTextBased?.()) return null;
  const content = paradiseMainerAnnouncement({
    code: config.mainerCode,
    region: config.mainerRegion || "EU",
    mainChannelId: config.mainChannelId || null,
    language: paradiseGuildContentLanguage(config)
  });
  let message = config.mainerAnnouncementMessageId
    ? await channel.messages.fetch(config.mainerAnnouncementMessageId).catch(() => null)
    : null;
  if (message) await message.edit({ content, embeds: [], components: [] });
  else message = await channel.send({ content });
  await message.pin().catch(() => null);
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].mainerAnnouncementMessageId = message.id;
    next.guildConfigs[guild.id].mainerAnnouncementChannelId = channel.id;
    return next;
  });
  return message;
}

async function handleMainer(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "set") {
    if (!isOwner(interaction)) return interaction.reply({ content: "Owner only.", ephemeral: true });
    const code = interaction.options.getString("code").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
    if (!code) return interaction.reply({ content: "Invalid mainer code.", ephemeral: true });
    const region = interaction.options.getString("region") || "EU";
    const mainChannel = interaction.options.getChannel("main-channel");
    await saveState(state => {
      state.guildConfigs[interaction.guildId] = state.guildConfigs[interaction.guildId] || structuredClone(state.config || {});
      const config = state.guildConfigs[interaction.guildId];
      config.mainerEnabled = true;
      config.mainerCode = code;
      config.mainerRegion = region;
      if (mainChannel?.isTextBased?.()) config.mainChannelId = mainChannel.id;
      config.mainerCodeUpdatedAt = new Date().toISOString();
      config.mainerCodeUpdatedBy = interaction.user.id;
      return state;
    });
    const panel = await updateParadiseMainerAnnouncement(interaction.guild);
    await logParadiseAction(interaction.guild, "roster_logs_channel", "roster-logs", "Mainer code updated",
      `${interaction.user} updated the canonical mainer code notice.`, { type: "configuration", metadata: { region, announcementMessageId: panel?.id || null } });
    return interaction.reply({ content: panel ? `Mainer code saved and canonical notice updated: ${panel.url}` : "Mainer code saved. Map a mainer proof/announcement channel, then run /mainer panel.", ephemeral: true });
  }
  if (sub === "panel") {
    if (!canManageCompetitiveBoards(interaction.member)) return interaction.reply({ content: "Clan management role required.", ephemeral: true });
    const panel = await updateParadiseMainerAnnouncement(interaction.guild);
    return interaction.reply({ content: panel ? `Canonical mainer notice updated: ${panel.url}` : "Map a mainer proof/announcement channel first.", ephemeral: true });
  }
  const config = configForGuild(await loadState(), interaction.guildId);
  return interaction.reply({ content: paradiseMainerAnnouncement({ code: config.mainerCode, region: config.mainerRegion || "EU", mainChannelId: config.mainChannelId, language: paradiseGuildContentLanguage(config) }), ephemeral: true });
}

export function transitionParadiseWar(record, { action, actorId, now = new Date().toISOString(), refereeId = null, score = null, winner = null, proof = null, reason = null } = {}) {
  const current = structuredClone(record || {});
  if (!current.id || !current.guildId) throw Object.assign(new Error("war_not_found"), { code: "war_not_found" });
  if (!["open", "requested"].includes(current.status) && action !== "logs") throw Object.assign(new Error("war_not_open"), { code: "war_not_open" });
  const next = { ...current, updatedAt: now, updatedBy: actorId };
  if (action === "assign_referee") {
    if (!refereeId) throw Object.assign(new Error("war_referee_required"), { code: "war_referee_required" });
    next.refereeId = refereeId;
    next.status = "open";
  } else if (action === "score") {
    if (!/^\d{1,2}-\d{1,2}$/.test(String(score || ""))) throw Object.assign(new Error("war_score_invalid"), { code: "war_score_invalid" });
    next.score = String(score);
    next.status = "open";
  } else if (action === "result") {
    if (!["paradise", "opponent"].includes(winner) || !/^https:\/\//i.test(String(proof || ""))) throw Object.assign(new Error("war_result_invalid"), { code: "war_result_invalid" });
    next.winner = winner;
    next.proof = String(proof).slice(0, 500);
    next.status = "completed";
    next.completedAt = now;
  } else if (action === "cancel") {
    if (!String(reason || "").trim()) throw Object.assign(new Error("war_cancel_reason_required"), { code: "war_cancel_reason_required" });
    next.status = "cancelled";
    next.cancelReason = String(reason).slice(0, 500);
    next.cancelledAt = now;
  } else {
    throw Object.assign(new Error("war_action_invalid"), { code: "war_action_invalid" });
  }
  next.auditTrail = [...(current.auditTrail || []), { action, actorId, at: now }].slice(-50);
  return next;
}

function findParadiseWar(state, guildId, prefix) {
  return Object.values(state.wars?.[guildId] || {}).find(record => record.id.startsWith(String(prefix || ""))) || null;
}

async function handleSpar(interaction) {
  if (!canManageClan(interaction.member)) return interaction.reply({ content: "Clan management role required.", ephemeral: true });
  const record = {
    id: crypto.randomUUID(), guildId: interaction.guildId, kind: "spar", status: "requested",
    opponent: interaction.options.getString("opponent").trim(), format: interaction.options.getString("format").trim(),
    region: interaction.options.getString("region") || "EU", createdBy: interaction.user.id, createdAt: new Date().toISOString(), auditTrail: []
  };
  await saveState(state => {
    state.wars[interaction.guildId] = state.wars[interaction.guildId] || {};
    state.wars[interaction.guildId][record.id] = record;
    return state;
  });
  await logParadiseAction(interaction.guild, "war_logs_channel", "war-logs", "Spar request created",
    `${interaction.user} created a spar request against **${record.opponent}** · ${record.format} · ${record.region}.`, { type: "war", metadata: { warId: record.id, kind: "spar" } });
  return interaction.reply({ content: `Spar request saved as \`${record.id.slice(0, 8)}\`. Staff can convert it into an approved war record after review.`, ephemeral: true });
}

async function handleWar(interaction) {
  if (!canManageClan(interaction.member)) return interaction.reply({ content: "Clan management role required.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  if (sub === "logs") {
    const records = Object.values((await loadState()).wars?.[interaction.guildId] || {}).sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt)).slice(0, 10);
    const lines = records.length ? records.map(record => `- \`${record.id.slice(0, 8)}\` **${record.kind}** · ${record.opponent} · **${record.status}**${record.score ? ` · ${record.score}` : ""}`).join("\n") : "No FIMA Bot war or spar records yet.";
    return interaction.reply({ content: lines, ephemeral: true });
  }
  if (sub === "create") {
    const record = {
      id: crypto.randomUUID(), guildId: interaction.guildId, kind: "war", status: "open",
      opponent: interaction.options.getString("opponent").trim(), format: interaction.options.getString("format").trim(),
      region: interaction.options.getString("region") || "EU", createdBy: interaction.user.id, createdAt: new Date().toISOString(), auditTrail: []
    };
    await saveState(state => {
      state.wars[interaction.guildId] = state.wars[interaction.guildId] || {};
      state.wars[interaction.guildId][record.id] = record;
      return state;
    });
    await logParadiseAction(interaction.guild, "war_logs_channel", "war-logs", "War created",
      `${interaction.user} created a war against **${record.opponent}** · ${record.format} · ${record.region}.`, { type: "war", metadata: { warId: record.id } });
    return interaction.reply({ content: `War record created: \`${record.id.slice(0, 8)}\`. Use /war referee, /war score and /war result in order.`, ephemeral: true });
  }
  const id = interaction.options.getString("id");
  const state = await loadState();
  const current = findParadiseWar(state, interaction.guildId, id);
  if (!current) return interaction.reply({ content: "Open war record not found.", ephemeral: true });
  let action;
  let payload = { actorId: interaction.user.id };
  if (sub === "referee") {
    const referee = await interaction.guild.members.fetch(interaction.options.getUser("user").id).catch(() => null);
    if (!referee || !await canWorkReferee(referee)) return interaction.reply({ content: "Choose a configured referee role.", ephemeral: true });
    action = "assign_referee"; payload.refereeId = referee.id;
  } else if (sub === "score") {
    action = "score"; payload.score = interaction.options.getString("score");
  } else if (sub === "result") {
    action = "result"; payload.winner = interaction.options.getString("winner"); payload.proof = interaction.options.getString("proof");
  } else {
    action = "cancel"; payload.reason = interaction.options.getString("reason");
  }
  let updated;
  try { updated = transitionParadiseWar(current, { action, ...payload }); } catch (error) {
    return interaction.reply({ content: `War update blocked: \`${error.code || "invalid_war_update"}\`.`, ephemeral: true });
  }
  await saveState(next => {
    next.wars[interaction.guildId] = next.wars[interaction.guildId] || {};
    next.wars[interaction.guildId][updated.id] = updated;
    return next;
  });
  await logParadiseAction(interaction.guild, "war_logs_channel", "war-logs", "War updated",
    `${interaction.user} used **/war ${sub}** on \`${updated.id.slice(0, 8)}\` · **${updated.status}**.`, { type: "war", metadata: { warId: updated.id, action: sub, status: updated.status } });
  return interaction.reply({ content: `War \`${updated.id.slice(0, 8)}\` is now **${updated.status}**.`, ephemeral: true });
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
    reason: "FIMA Bot private staff report"
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
    en: "# FIMA Community\n## Purpose\nProduct support, events, multi-role applications, self-roles and community activity.\n\n## Commands\n- `/help` — show only the commands currently available to you\n- `/ticket` — open private FIMA product and account support\n- `/application apply` — open the website-first application center and choose an available staff, support, event, content or FIMA product role\n- Partnership, Creator and Reseller use the business tab in the same application center\n- `/giveaway create`, `/event create`, `/gamenight start` — authorized staff tools\n\n## Review policy\nCommunity and business applications enter a private review queue. No role is auto-granted without an explicit configured mapping and authorized approval.\n\n## Monthly activity rewards\nText and voice have separate monthly Top 3 boards. Each board awards **15 / 10 / 7 FIMA Macro days**. Every boost adds **3 days** through the idempotent reward ledger.\n\n-# Dashboard: Template Setup → FIMA Community",
    tr: "# FIMA Community\n## Amaç\nÜrün desteği, etkinlikler, çok rollü başvurular, kişisel roller ve topluluk aktivitesi.\n\n## Komutlar\n- `/help` — yalnızca şu anda kullanabildiğin komutları gösterir\n- `/ticket` — özel FIMA ürün ve hesap desteği açar\n- `/application apply` — website-first başvuru merkezini açar; uygun staff, support, etkinlik, içerik veya FIMA ürün rolünü seçersin\n- Partnership, Creator ve Reseller aynı merkezin iş birliği sekmesini kullanır\n- `/giveaway create`, `/event create`, `/gamenight start` — yetkili staff araçları\n\n## İnceleme politikası\nCommunity ve business başvuruları özel inceleme kuyruğuna gider. Açık rol eşlemesi ve yetkili onayı olmadan hiçbir rol otomatik verilmez.\n\n## Aylık aktivite ödülleri\nText ve voice için ayrı aylık Top 3 panoları bulunur. Her pano **15 / 10 / 7 FIMA Macro günü** verir. Her boost, idempotent ödül defteri üzerinden **3 gün** ekler.\n\n-# Dashboard: Template Setup → FIMA Community"
  },
  clan: {
    label: "Clan",
    en: "# FIMA Bot Clan\n## Fighters\n- `/profile create` — verify Roblox and choose region\n- `/challenge create` — use in **challenge-ticket**\n- `/availability panel` — refresh live status\n\n## Clan operations\n- `/lineup add board:main user:@user role:Starter`\n- `/roster update user:@user rank:<rank>`\n- `/relation add type:ally name:<clan>`\n- `/mainer guide`\n\n## Required access\nMember commands require a completed profile; board edits require configured clan management roles.\n\n-# Dashboard: Roster / Lineups / Relations",
    tr: "# FIMA Bot Clan\n## Oyuncular\n- `/profile create` — Roblox doğrula ve bölge seç\n- `/challenge create` — **challenge-ticket** kanalında kullan\n- `/availability panel` — canlı durumu yeniler\n\n## Klan operasyonları\n- `/lineup add board:main user:@user role:Starter`\n- `/roster update user:@user rank:<rank>`\n- `/relation add type:ally name:<clan>`\n- `/mainer guide`\n\n## Gerekli yetki\nÜye komutları tamamlanmış profil; pano düzenlemeleri ayarlı klan yönetim rolü gerektirir.\n\n-# Dashboard: Roster / Lineups / Relations"
  },
  tsbtr: {
    label: "TSBTR",
    en: "# TSBTR Operations\n- `/leaderboard add user:@user rank:25`\n- `/leaderboard move user:@user rank:20`\n- `/challenge create`\n- `/challenge post winner:@user loser:@user score:10-5`\n- `/autowin winner:@user reason:Dodged`\n- `/referee guide`, `/activity summary`\n\n## Required channels\n**top-10**, **top-20**, **top-30**, **challenge-results**, **availability**, **referee-post**.\n\n-# Dashboard: Challenge System + Leaderboard / Profiles / Rank Rules",
    tr: "# TSBTR Operasyonları\n- `/leaderboard add user:@user rank:25`\n- `/leaderboard move user:@user rank:20`\n- `/challenge create`\n- `/challenge post winner:@user loser:@user score:10-5`\n- `/autowin winner:@user reason:Dodged`\n- `/referee guide`, `/activity summary`\n\n## Gerekli kanallar\n**top-10**, **top-20**, **top-30**, **challenge-results**, **availability**, **referee-post**.\n\n-# Dashboard: Challenge System + Leaderboard / Profiles / Rank Rules"
  },
  staff: {
    label: "Staff",
    en: "# Staff Operations\n- `/activity check group:<group>` — Manage Roles\n- `/activity summary` — weekly quota review\n- `/whitelist add user:@user group:<group> days:<optional>`\n- `/loa approve|deny`\n- `/report staff user:@user reason:<reason>`\n\n## Rule\nNever grant ranks manually when FIMA Bot has a controlled workflow.",
    tr: "# Staff Operasyonları\n- `/activity check group:<group>` — Rolleri Yönet yetkisi\n- `/activity summary` — haftalık kota özeti\n- `/whitelist add user:@user group:<group> days:<opsiyonel>`\n- `/loa approve|deny`\n- `/report staff user:@user reason:<neden>`\n\n## Kural\nFIMA Bot kontrollü akış sağlıyorsa rankı elle vermeyin."
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
    en: "# Applications\n- `/application panel`\n- `/application apply`\n- `/application status`\n\nReviewers use Approve, Deny or More Info. Role grants are blocked above reviewer/FIMA Bot hierarchy; blacklisted users cannot apply.",
    tr: "# Başvurular\n- `/application panel`\n- `/application apply`\n- `/application status`\n\nİnceleyenler Approve, Deny veya More Info kullanır. Reviewer/FIMA Bot hiyerarşisinin üstündeki roller engellenir; blacklist kullanıcı başvuramaz."
  },
  voice: {
    label: "Voice / Join-to-Create",
    en: "# Join-to-Create\nJoin **Join to Create**. FIMA Bot creates your room and gives controls: rename, limit, lock, hide, permit, reject, transfer and delete. Unsafe names reset automatically.",
    tr: "# Join-to-Create\n**Join to Create** kanalına girin. FIMA Bot odanızı kurup rename, limit, lock, hide, permit, reject, transfer ve delete kontrollerini verir. Güvensiz isimler otomatik sıfırlanır."
  },
  xp: {
    label: "XP / Levels",
    en: "# XP & Levels\n- `/rank [user]`\n- `/leaderboard show type:total|chat|voice|weekly|monthly`\n\nSpam, bot and log channels do not award XP. Channel exclusions and rewards are configured in Dashboard → XP / Levels.",
    tr: "# XP & Seviyeler\n- `/rank [user]`\n- `/leaderboard show type:total|chat|voice|weekly|monthly`\n\nSpam, bot ve log kanalları XP vermez. Kanal hariç tutma ve ödüller Dashboard → XP / Levels bölümündedir."
  },
  dashboard: {
    label: "Dashboard",
    en: "# FIMA Operations Console\n1. Select a managed server.\n2. Select its template.\n3. Auto-detect/remap channels and roles.\n4. Preview before create/repair/repost actions.\n5. Destructive rebuild always requires backup and typed confirmation.\n\n-# Owner-only: https://fimamacro.com/fima-bot",
    tr: "# FIMA Operations Console\n1. Yönetilecek sunucuyu seçin.\n2. Şablonunu seçin.\n3. Kanal/rolleri otomatik algılayın veya eşleyin.\n4. Create/repair/repost öncesi preview alın.\n5. Yıkıcı rebuild her zaman yedek ve yazılı onay ister.\n\n-# Yalnızca owner: https://fimamacro.com/fima-bot"
  },
  profile: {
    label: "Member / Profile / Verify",
    en: "# Member, Profile & Roblox Verification\n- `/help query:profile` — search this manual\n- `/profile create` — start the short Roblox-safe verification flow\n- `/profile view profile_id:<id>`\n- `/profile view user:@user`\n- `/profile view user_id:<discord id>`\n- `/profile view roblox_name:<name>`\n- `/rank` — view chat/voice XP\n\nDuplicate profiles are blocked. A completed profile is required for challenge and controlled result flows.",
    tr: "# Üye, Profil ve Roblox Doğrulama\n- `/help query:profile` — bu rehberde arama\n- `/profile create` — kısa, Roblox-güvenli doğrulamayı başlat\n- `/profile view profile_id:<id>`\n- `/profile view user:@user`\n- `/profile view user_id:<discord id>`\n- `/profile view roblox_name:<ad>`\n- `/rank` — chat/ses XP bilgisini göster\n\nAynı kişi için ikinci profil engellenir. Challenge ve kontrollü sonuçlar için tamamlanmış profil gerekir."
  },
  challenge: {
    label: "Challenge",
    en: "# Challenge System\n- `/challenge create` — show only currently eligible targets\n- `/challenge post winner:@user loser:@user score:10-5`\n- `/autowin winner:@user reason:Dodged` — inside the ticket\n\nThe bot rechecks range, profile, cooldown, immunity and open tickets immediately before creation. Enter only the score; FIMA Bot formats the winner wording.",
    tr: "# Challenge Sistemi\n- `/challenge create` — yalnızca o anda uygun rakipleri gösterir\n- `/challenge post winner:@user loser:@user score:10-5`\n- `/autowin winner:@user reason:Dodged` — ticket içinde\n\nBot açmadan hemen önce range, profil, cooldown, immunity ve açık ticket kontrolünü tekrarlar. Yalnızca skoru girin; kazanan metnini FIMA Bot yazar."
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
    en: "# Moderation Security\n- `/mod warn`, `/mod mute`\n- `/mod kick-request`, `/mod ban-request`\n- `/mod quarantine`, `/mod unquarantine`\n- `/mod lockdown`, `/mod raidmode`\n- `/security panel`\n\nLower staff submit approval requests. FIMA Bot enforces role hierarchy and records audited actions.",
    tr: "# Moderasyon Güvenliği\n- `/mod warn`, `/mod mute`\n- `/mod kick-request`, `/mod ban-request`\n- `/mod quarantine`, `/mod unquarantine`\n- `/mod lockdown`, `/mod raidmode`\n- `/security panel`\n\nAlt staff onay talebi açar. FIMA Bot rol hiyerarşisini uygular ve işlemleri loglar."
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
    en: "# FIMA Bot Premium\n**Status:** planning only. Billing is not enabled. Free/Starter/Pro/Ultimate feature boundaries will be published only after owner approval.",
    tr: "# FIMA Bot Premium\n**Durum:** yalnızca planlama. Ödeme açık değil. Free/Starter/Pro/Ultimate özellik sınırları owner onayından sonra yayınlanacak."
  },
  music: {
    label: "Music / Audio",
    en: "# Music / Audio\n**Status:** blocked until a licensed/legal provider is configured. FIMA Bot will not rip YouTube or Spotify audio and will not use circumvention tools.",
    tr: "# Müzik / Ses\n**Durum:** lisanslı/yasal sağlayıcı ayarlanana kadar kapalı. FIMA Bot YouTube veya Spotify sesi rip etmeyecek ve bypass aracı kullanmayacak."
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
    en: "# Admin / Owner\n- `/setupfieelsclan preview|create-missing|repost-guides|repair|rebuild`\n- `/setupfima preview|create-missing|repost-guides|repair|rebuild`\n- `/setupfieelstsbtr preview|create-missing|repost-guides|repair|rebuild`\n\nDestructive rebuild requires backup, preview and typed confirmation. Do not run production rebuild without owner approval.",
    tr: "# Admin / Owner\n- `/setupfieelsclan preview|create-missing|repost-guides|repair|rebuild`\n- `/setupfima preview|create-missing|repost-guides|repair|rebuild`\n- `/setupfieelstsbtr preview|create-missing|repost-guides|repair|rebuild`\n\nYıkıcı rebuild için yedek, preview ve yazılı onay gerekir. Owner onayı olmadan production rebuild çalıştırmayın."
  }
});

const COMMUNITY_HIDDEN_HELP_SCOPES = new Set([
  "clan", "tsbtr", "referee", "training", "tryout", "profile", "challenge",
  "leaderboard", "roster", "availability", "blacklist", "relations"
]);

export function paradiseHelpCategoryKeysForTemplate(template = "clan") {
  return Object.keys(HELP_CATEGORIES)
    .filter(scope => template !== "community" || !COMMUNITY_HIDDEN_HELP_SCOPES.has(scope));
}

function normalizedHelpScope(scope, template = "clan") {
  const allowed = paradiseHelpCategoryKeysForTemplate(template);
  return allowed.includes(scope) ? scope : (template === "community" ? "community" : "clan");
}

function normalizedApplicationHelpText(value, language = "en") {
  const en = language === "en";
  return String(value || "")
    .replace(/Helper applications/g, en ? "applications" : "ba\u015fvurular")
    .replace(/Helper ba\u00c5\u0178vurular\u00c4\u00b1/g, "ba\u015fvurular")
    .replace(/`\/application apply type:helper`[^\n]*/g, en
      ? "`/application apply` — choose staff, creator, partnership or reseller in the website form"
      : "`/application apply` — web formunda staff, creator, partnership veya reseller t\u00fcr\u00fcn\u00fc se\u00e7")
    .replace(/website-first Helper workflow/g, en ? "website-first application workflow" : "website-first ba\u015fvuru ak\u0131\u015f\u0131")
    .replace(/website-first Helper ak\u00c4\u00b1\u00c5\u0178\u00c4\u00b1na devam eder/g, "website-first ba\u015fvuru ak\u0131\u015f\u0131na devam eder");
}

function helpEmbed(scope, locale = "en", template = "clan") {
  const safeScope = normalizedHelpScope(scope, template);
  const category = HELP_CATEGORIES[safeScope];
  const language = String(locale).toLowerCase().startsWith("tr") ? "tr" : "en";
  return new EmbedBuilder().setColor(DEFAULT_PARADISE_BRAND_COLOR)
    .setTitle(`✦ ${category.label.toUpperCase()} COMMAND GUIDE`)
    .setDescription(normalizedApplicationHelpText(category[language], language))
    .setFooter(paradiseFooter(language === "tr" ? "Türkçe yardım" : "English help"));
}

function helpComponents(scope = "clan", template = "clan") {
  const safeScope = normalizedHelpScope(scope, template);
  const allowedKeys = new Set(paradiseHelpCategoryKeysForTemplate(template));
  const entries = Object.entries(HELP_CATEGORIES).filter(([key]) => allowedKeys.has(key));
  const menuRows = [];
  const buildMenu = (chunk, index) => new StringSelectMenuBuilder()
    .setCustomId(`paradise_help_category:${index}`)
    .setPlaceholder(index === 0 ? "Main guide categories / Ana rehber" : "More guides / Diğer rehberler")
    .addOptions(chunk.map(([value, item]) => ({
      label: item.label,
      value,
      default: value === safeScope
    })));
  for (let index = 0; index < entries.length; index += 25) {
    menuRows.push(new ActionRowBuilder().addComponents(buildMenu(entries.slice(index, index + 25), index / 25)));
  }
  const languageRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`paradise_help_lang:en:${safeScope}`).setLabel("English").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`paradise_help_lang:tr:${safeScope}`).setLabel("Türkçe").setStyle(ButtonStyle.Secondary)
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

export function memberHelpPayload(entries, locale = "en", selectedId = null, template = "clan") {
  const tr = String(locale || "").toLowerCase().startsWith("tr");
  const community = template === "community";
  const visibleBrand = community ? "FIMA" : "FIMA Bot";
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
        : [tr ? `- Bu sunucuda sana açık bir ${visibleBrand} üye komutu yok.` : `- No ${visibleBrand} member command is currently available to you in this server.`])
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
      .setTitle(community
        ? (tr ? "✦ FIMA ÜYE YARDIMI" : "✦ FIMA MEMBER HELP")
        : (tr ? "✦ FIMA BOT ÜYE YARDIMI" : "✦ FIMA BOT MEMBER HELP"))
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
  if (command.startsWith("fima_") || ["application", "ticket"].includes(command)) return "support";
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
      `**${tr ? "Gerekli FIMA Bot yetkisi" : "Required FIMA Bot permission"}:** ${entry.requiredParadisePermission || (tr ? "Yapılandırılmış staff yetkisi" : "Configured staff permission")}`,
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
  const context = paradiseRegistryContextForInteraction(interaction, state);
  const entries = memberHelpEntries(context);
  const query = interaction.options.getString("query")?.trim().toLowerCase();
  const matches = query
    ? entries.filter(entry => `${entry.id} ${entry.command} ${entry.subcommand || ""} ${entry.description} ${entry.examples.join(" ")}`.toLowerCase().includes(query))
    : entries;
  const payload = memberHelpPayload(matches, interaction.locale, matches.length === 1 ? matches[0].id : null, context.template);
  payload.embeds[0].setColor(await paradiseBrandColor());
  return interaction.reply({ ...payload, ephemeral: true });
}

async function handleHelp(interaction) {
  const turkish = String(interaction.locale || "").toLowerCase().startsWith("tr");
  const state = await loadState();
  const { template } = paradiseRegistryContextForInteraction(interaction, state);
  const allowedKeys = new Set(paradiseHelpCategoryKeysForTemplate(template));
  const query = interaction.options.getString("query")?.trim().toLowerCase();
  if (query) {
    const matches = Object.entries(HELP_CATEGORIES).filter(([key, item]) =>
      allowedKeys.has(key) && `${item.label} ${item.en} ${item.tr}`.toLowerCase().includes(query)
    ).slice(0, 12);
    const description = matches.length
      ? matches.map(([key, item]) => "- **" + item.label + "** — `" + key + "`").join("\n")
      : turkish ? "Eşleşen komut veya sistem bulunamadı." : "No matching command or system was found.";
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(await paradiseBrandColor())
        .setTitle(turkish ? `✦ YARDIM ARAMASI: ${query}` : `✦ HELP SEARCH: ${query}`)
        .setDescription(`${description}\n\n-# ${turkish ? "Aşağıdaki menüden ilgili kategoriyi açın." : "Open the matching category from the menu below."}`)
        .setFooter(paradiseFooter("Searchable command directory"))],
      components: helpComponents(matches[0]?.[0] || template, template),
      ephemeral: true
    });
  }
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("✦ WHAT DO YOU NEED HELP WITH?")
      .setDescription(turkish
        ? "Bir sistem seçin. Komutun ne yaptığı, gereken yetki ve kullanılacağı kanal yalnızca size gösterilir."
        : "Choose a system below. Its command guide is shown privately, including what each command does, required permissions and where it belongs.")
      .setFooter(paradiseFooter("Interactive command directory"))],
    components: helpComponents(template, template),
    ephemeral: true
  });
}

async function publishSetupGuides(guild, mode) {
  const channel = await configuredChannel(guild, "member_help_channel", ["⌁・bot-komutları", "◇・bot-komutları", "bot-commands", "command-guide"]);
  if (!channel?.isTextBased?.()) {
    return failedParadiseMessageReadback({ reason: "member_help_channel_not_resolved" });
  }
  const state = await loadState();
  const storedMessageId = configForGuild(state, guild.id).commandGuideMessageIds?.[mode];
  let message = storedMessageId ? await channel.messages.fetch(storedMessageId).catch(() => null) : null;
  const payload = memberHelpPayload(
    memberHelpEntries({ template: mode, enabledModules: null, roleKeys: [], plan: "free", isOwner: false }),
    guildLanguage(configForGuild(state, guild.id)),
    null,
    mode
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
  return verifyParadiseMessageReadback(channel, message, {
    botUserId: guild.client?.user?.id,
    expectedTitle: paradisePayloadFirstEmbed(payload).title
  });
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
    `FIMA Bot challenge transcript`,
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
    files: [{ attachment: Buffer.from(lines.join("\n"), "utf8"), name: `fima-bot-challenge-${ticket.ticketId || channel.id}.txt` }]
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

export const GUIDE_POSTS = Object.freeze([
  {
    key: "rules",
    channel: "rules",
    title: "✦ FIMA COMMUNITY RULES",
    body: "# English\n## Respect & safety\n- No harassment, threats, hate speech, scams, account theft or malicious links.\n- Never request cookies, passwords, tokens or private authentication data.\n- Use approved media channels for links and attachments.\n- Staff actions require evidence and remain auditable.\n\n# Türkçe\n## Saygı ve güvenlik\n- Taciz, tehdit, nefret söylemi, dolandırıcılık ve zararlı bağlantılar yasaktır.\n- Cookie, şifre, token veya özel giriş bilgisi istemeyin.\n- Link ve dosyaları yalnızca izin verilen kanallarda paylaşın.\n- Yetkili işlemleri kanıtlı ve denetlenebilir olmalıdır."
  },
  {
    key: "announcement",
    channel: "⟐・announcements",
    title: "✦ FT COMMUNITY ANNOUNCEMENTS",
    body: "# Official updates\nServer news, events, FIMA releases and important community changes are published here. Treat only messages posted by authorized staff or FIMA Bot as official.\n\n## Stay safe\n- FIMA never asks for passwords, cookies or authentication tokens.\n- Check the destination before opening a link.\n- Use the support panel when an announcement looks suspicious or unclear."
  },
  {
    key: "booster",
    channel: "⌁・activity-rewards",
    title: "✦ BOOSTER & ACTIVITY REWARDS",
    body: "# Thank you for supporting FT Community\nEach verified server boost grants **3 days of FIMA Macro access per month** while the boost remains eligible. Rewards are processed through the protected account-link and payout workflow.\n\n## Safe delivery\n- Link the correct FIMA account through the official flow.\n- Never post a license key, password, cookie or token in Discord.\n- Duplicate, refunded or unverifiable claims enter staff review instead of receiving an automatic reward.\n- Use the support panel if a verified reward is delayed."
  },
  {
    key: "fieel_style_guide",
    channel: "⌁・fieel-content",
    title: "✦ FIEEL STYLE & CREATOR GUIDE",
    body: "# Create in the FT Community style\nShare approved Fieel edits, clips, thumbnails and community art here. Keep every post readable, original and suitable for the shared Kaneki × Luffy visual language.\n\n## Publishing standard\n- Credit collaborators and the original creator when required.\n- Use the proper media channel and a clear title.\n- Do not repost stolen work, private files or misleading download links.\n- Ask the Video Team or Content Team for review before using an asset as an official server visual."
  },
  {
    key: "turkish_community_guide",
    channel: "〆・turkish-announcements",
    title: "✦ TURKISH COMMUNITY HUB",
    body: "# Turkish-language updates\nThis channel carries the Turkish counterpart of important FT Community news, events and safety notices. The main server structure remains English-first while this hub keeps Turkish members fully informed.\n\n## Community standard\n- Follow the same rules and safety boundaries as every FT Community channel.\n- Treat only authorized staff and FIMA Bot posts as official.\n- Use the correct support or report flow instead of sharing private account data in public."
  },
  {
    key: "voice_guide",
    channel: "⌁・voice-activity",
    title: "✦ VOICE COMMUNITY GUIDE",
    body: "# Voice activity\nJoin voice rooms to play, create and spend time with the community. Keep conversations welcoming and follow staff direction during organized sessions.\n\n## Voice safety\n- No harassment, disruptive audio, recording without consent or attempts to expose private information.\n- Move game, media and event conversations to the appropriate room when asked.\n- Report serious issues through the protected report flow; do not start public call-outs."
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
    body: "# __Ticket control checklist__\n1. Confirm both FIMA Bot profiles exist.\n2. Check challenger cooldown and target immunity.\n3. Check allowed rank range and open challenges.\n4. Add/ping both players and keep the pinned context header current.\n5. Record the complete set and remain neutral.\n\n## __If the ticket is valid__\n- Claim the match and add a co-referee when required.\n- Use `/challenge post` or `/challenge autowin` **inside the ticket**.\n- Close first; save transcript before access is removed.\n\n## __Score format__\n- `winner` = winning fighter\n- `loser` = losing fighter\n- `score` = only `10-3`, `10-5`, `10-7` or `Auto`\n- Never type `to @user`; FIMA Bot formats the sentence.\n- Auto/strike requires a clear note; co-referee is optional.\n\n## __Recovery and corrections__\nIf a ticket was closed, recover context from the transcript/header. Managers use the correction workflow; never silently delete evidence.\n\n-# Yanlış postu aktif Referee Manager'a iletin."
  },
  {
    key: "referee_rules",
    channel: "referee-rules",
    title: "👑 REFEREE RULES 👑",
    body: "# __Role expectations__\n## ◆ Referee Manager\nOwns referee policy, disputes, coaching, promotions and audit decisions.\n\n## ◆ Experienced Referee\nMay manage **Top 1–30**, approve configured score posts and coach lower referees.\n\n## ◆ Referee\nMay independently manage **Top 11–30**. Cannot approve/deny by default.\n\n## ◆ Trial Referee\nMay manage **Top 21–30** with a second referee. Cannot approve/deny.\n\n# __Core rules__\n- **Neutrality is mandatory.** Favoritism triggers immediate review.\n- Record every set; missing recordings may require a rematch.\n- Announce sets in **challenges** and approved scores in **challenge-results**.\n- Use the structured score-post workflow; no manual result messages.\n- Stay active. Approved referee work counts automatically; fake activity is punishable.\n\n> Default ranges are configurable in the FIMA Bot dashboard.\n\n-# Trial/normal Referee approval is blocked unless the owner explicitly changes policy."
  },
  {
    key: "referee_post_quick",
    channel: "referee-post",
    title: "📌 /POST QUICK GUIDE",
    body: "# __How to post a score__\n- `winner` / `profile_id_1` = winner\n- `loser` / `profile_id_2` = loser\n- `ticket_id` = challenge ticket ID\n- `score` / `total_score` = only `10-3`, `10-5`, `10-7` or `Auto`\n- Never write `to <user>` — FIMA Bot adds consistent wording.\n- Add `co_referee` when another referee worked the set.\n- Add a note for Auto, no-show, dodge, strike or disqualification.\n\n## Example\n`/challenge post winner:@A loser:@B score:10-5 ticket_id:134 note:FF check was not requested`\n\n-# Submit from the ticket whenever possible so context is filled and rechecked."
  },
  {
    key: "referee_works",
    channel: "referee-works",
    title: "🛡️ REFEREE WORK & ACTIVITY",
    body: "# __What counts__\n- An approved, fully recorded challenge result.\n- A valid co-referee contribution attached to the same ticket.\n- A manager-approved Auto/no-show decision with evidence.\n\n## __Activity policy__\n- Default minimum: **2 approved matches per week**.\n- LOA and activity whitelist pause quota review.\n- Weekly summaries recommend promotion/demotion; automatic role changes remain off unless owner enables them.\n- Duplicate, false or recycled proof does not count and creates a staff review.\n\n-# FIMA Bot writes approved work here automatically; staff should not self-post screenshots."
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
    body: "# FIMA Bot and FIMA safety\n- FIMA Bot never asks for cookies, passwords or Discord/Roblox tokens.\n- FIMA downloads must come from official channels only.\n- Screenshots are not automatic proof of Roblox ownership or payment.\n- Suspicious links should be reported through the support ticket panel.\n\n# Güvenlik\n- FIMA Bot cookie, şifre veya token istemez.\n- FIMA dosyalarını yalnızca resmi kanallardan indirin.\n- Şüpheli bağlantıları destek ticket sistemiyle bildirin."
  },
  {
    key: "mainer_guide",
    channel: "maining-guide",
    title: "✦ FIMA BOT MAINING GUIDE",
    body: "# Official flow\nUse `/mainer guide` to display the current FIMA Bot code and approved TSBCC command format.\n\n- Keep proof in **mainer-proof**.\n- Never share account credentials.\n- Staff role selection must match your approved role.\n\n-# Güncel kod bot state’inden alınır; eski mesajlardaki kodlara güvenmeyin."
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
    body: "# Short, Roblox-safe verification\n1. Run `/profile create`.\n2. Enter the exact Roblox username.\n3. Put the six-character code in Roblox About.\n4. Confirm before it expires.\n\n## Safety\n- FIMA Bot never requests a Roblox password, cookie or token.\n- Screenshots are not automatic ownership proof.\n- Existing profiles are not duplicated; use `/profile edit` for region changes.\n\n-# Challenge and tryout results require a completed profile."
  },
  {
    key: "application_guide",
    channel: "application-guide",
    title: "▧ APPLICATION GUIDE",
    body: "# Apply with `/application apply`\nChoose the correct position and answer motivation, experience and availability honestly.\n\n## Review flow\n- One active application at a time.\n- Blacklisted users are blocked.\n- Staff can approve, deny or request more information.\n- A role is granted only when configured and below both reviewer and FIMA Bot role hierarchy.\n\n-# Başvuru durumu `/application status` ile özel olarak görüntülenebilir."
  },
  {
    key: "staff_command_guide",
    channel: "staff-command-guide",
    title: "⛨ STAFF COMMAND GUIDE",
    body: "# Moderation\n- `/mod warn` records a documented warning.\n- `/mod mute` applies a bounded Discord timeout.\n- `/mod kick-request` and `/mod ban-request` enter senior review.\n- `/mod quarantine` isolates suspicious accounts for review.\n\n# Operations\n- Training, tryout, referee and activity actions use their structured command groups.\n- Never grant ranks manually when FIMA Bot provides the controlled workflow.\n\n-# Every high-impact action is logged; lower staff cannot bypass the approval queue."
  },
  {
    key: "mod_command_guide",
    channel: "mod-command-guide",
    title: "🛡️ MODERATOR COMMAND GUIDE",
    body: "# __Proportional moderation__\n- `/mod warn user:@user reason:<reason>` — documented low-impact first response.\n- `/mod mute user:@user duration:<minutes> reason:<reason>` — bounded timeout for spam/disruption.\n- `/mod kick-request user:@user reason:<reason>` — senior approval queue.\n- `/mod ban-request user:@user reason:<reason>` — senior approval queue.\n- `/mod quarantine user:@user reason:<reason>` — isolate suspicious links/accounts.\n\n## Suggested ladder\n- Spam: warn → short timeout → escalation.\n- Toxicity/slurs: evidence + configured timeout; severe/repeated cases escalate.\n- Scam/raid: quarantine or lockdown first, then senior review.\n\n-# Never punish Owner/Admin or roles above FIMA Bot; role hierarchy is rechecked."
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
    body: "# __Start__\n`/tryout start link:<roblox link>`\n\nLock after 1–5 minutes. Evaluate **RC timing, catches, dash reactions, movement, pressure, adaptation and game sense**, not only wins.\n\n# __Result__\n`/tryout result user:@player stage:2 level:High strength:Strong note:<optional>`\n\nFIMA Bot enforces Stage → Level → Strength, completed profile, lowest grantable rank and hoster authority. Never grant roles manually.\n\n-# Winning alone does not guarantee a higher stage."
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
    title: "⚙ FIMA BOT DASHBOARD GUIDE",
    body: "# __Safe setup order__\n1. Select the managed server.\n2. Select Community, Clan or TSBTR template.\n3. Auto-detect and review channels/roles.\n4. Save each page and inspect its preview.\n5. Run **Preview**, **Create missing**, **Repost guides** or **Repair permissions**.\n6. Destructive rebuild requires backup and exact typed confirmation.\n\n-# Owner-only console: https://fimamacro.com/fima-bot"
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

// Canonical guide messages are not a word-for-word machine translation.  The
// Turkish copy is intentionally compact for Discord/mobile, while the source
// definitions remain the English canonical counterpart.
export const PARADISE_GUIDE_TR_COPY = Object.freeze({
  rules: {
    title: "✦ FIMA KURALLARI",
    body: "# Herkese açık ve saygılı kal\n- Spam, toxic davranış, hakaret, scam ve hesap paylaşımı yasaktır.\n- Cookie, şifre, token, tam lisans anahtarı veya özel hesap verisi istemeyin/paylaşmayın.\n- Staff kararına itirazın varsa public tartışma yerine destek ticketı aç.\n\n## Kısa yol\nRollerini seç, kuralları oku ve yardıma ihtiyacın varsa destek panelini kullan."
  },
  announcement: {
    title: "✦ FT COMMUNITY DUYURULARI",
    body: "# Resmî güncellemeler\nSunucu haberleri, etkinlikler, FIMA sürümleri ve önemli topluluk değişiklikleri burada yayınlanır. Yalnız yetkili ekip veya FIMA Bot tarafından gönderilen mesajları resmî kabul et.\n\n## Güvenli kal\n- FIMA şifre, cookie veya giriş tokeni istemez.\n- Bağlantıyı açmadan önce hedefini kontrol et.\n- Şüpheli veya belirsiz duyuruları destek panelinden bildir."
  },
  booster: {
    title: "✦ BOOSTER VE AKTİVİTE ÖDÜLLERİ",
    body: "# FT Community desteğin için teşekkürler\nDoğrulanan her sunucu boostu, boost uygun kaldığı sürece aylık **3 günlük FIMA Macro erişimi** kazandırır. Ödül, korumalı hesap bağlantısı ve ödeme kuyruğu üzerinden işlenir.\n\n## Güvenli teslimat\n- Doğru FIMA hesabını yalnız resmî akıştan bağla.\n- Lisans anahtarı, şifre, cookie veya tokeni Discord'a yazma.\n- Yinelenen, iade edilmiş veya doğrulanamayan talepler otomatik ödül yerine incelemeye gider.\n- Doğrulanmış ödül gecikirse destek panelini kullan."
  },
  fieel_style_guide: {
    title: "✦ FIEEL STİLİ VE İÇERİK REHBERİ",
    body: "# FT Community stilinde üret\nOnaylı Fieel editlerini, kliplerini, thumbnaillerini ve topluluk çalışmalarını burada paylaş. Her gönderi okunaklı, özgün ve ortak Kaneki × Luffy görsel diline uygun olmalı.\n\n## Yayın standardı\n- Gerektiğinde birlikte çalıştığın kişileri ve asıl üreticiyi belirt.\n- Doğru medya kanalını ve anlaşılır bir başlığı kullan.\n- Çalıntı çalışma, özel dosya veya yanıltıcı indirme bağlantısı paylaşma.\n- Bir görseli resmî sunucu varlığı yapmadan önce Video Team ya da Content Team incelemesi iste."
  },
  turkish_community_guide: {
    title: "✦ TÜRK TOPLULUK MERKEZİ",
    body: "# Türkçe güncellemeler\nÖnemli FT Community haberlerinin, etkinliklerinin ve güvenlik duyurularının Türkçe karşılığı burada yayınlanır. Ana sunucu yapısı İngilizce kalırken Türk üyeler bu bölümden eksiksiz bilgilendirilir.\n\n## Topluluk standardı\n- Tüm FT Community kanallarındaki aynı kurallara ve güvenlik sınırlarına uy.\n- Yalnız yetkili ekip ve FIMA Bot mesajlarını resmî kabul et.\n- Özel hesap verisini public alanda paylaşmak yerine doğru support veya report akışını kullan."
  },
  voice_guide: {
    title: "✦ SESLİ TOPLULUK REHBERİ",
    body: "# Sesli aktivite\nOyun oynamak, üretmek ve toplulukla vakit geçirmek için ses odalarına katıl. Sohbeti kapsayıcı tut ve düzenlenen oturumlarda staff yönlendirmesine uy.\n\n## Ses güvenliği\n- Taciz, rahatsız edici ses, izinsiz kayıt veya özel bilgiyi açığa çıkarma girişimi yasaktır.\n- İstendiğinde oyun, medya ve etkinlik sohbetini uygun odaya taşı.\n- Ciddi sorunları korumalı report akışından bildir; public linç başlatma."
  },
  challenge_rules: {
    title: "✦ CHALLENGE KURALLARI",
    body: "# Challenge açmadan önce\n- İki oyuncunun da doğrulanmış profili olmalı.\n- Cooldown, immunity, LOA ve açık ticket kontrol edilir.\n- Hedef rank, sunucunun izin verdiği aralıkta olmalı.\n\n## Maç sırasında\n- Referee tarafsız kalır; skor ve kanıt ticketa girilir.\n- Sonuç onaylanmadan leaderboard değişmez."
  },
  referee_guide: {
    title: "✦ REFEREE REHBERİ",
    body: "# Referee görevi\nTarafsız ol, ticket başlığındaki oyuncu/rank bilgilerini kontrol et ve maç boyunca kanıtı koru.\n\n## Sonuç akışı\n1. Ticketın açık olduğunu doğrula.\n2. `/challenge post` veya `/challenge autowin` kullan.\n3. Skoru yalnız `10-5` ya da `Auto` formatında yaz.\n4. Gerekirse co-ref ve not ekle.\n5. Yetkili onayını bekle."
  },
  referee_rules: {
    title: "✦ REFEREE KURALLARI",
    body: "# Temel sınırlar\n- Trial Referee skor onaylayamaz.\n- Normal Referee yalnız ayarda izin varsa onay verir.\n- Experienced Referee / Referee Manager kendi yetki sınırında işlem yapar.\n- Top rank maçlarında kayıt, ticket ve kanıt zorunludur.\n\nTaraf tutma, kanıtsız auto-win ve gizli skor değişikliği yasaktır."
  },
  referee_post_quick: {
    title: "✦ /POST HIZLI REHBERİ",
    body: "# Doğru post\n`/challenge post winner:@kazanan loser:@kaybeden score:10-5`\n\n- Oyuncular mevcut ticketın iki tarafı olmalı.\n- `to @oyuncu` yazma; final metni bot tarafından oluşturulur.\n- Auto/strike durumunda sebebi not olarak ekle.\n- Sonuç onay bekler; hemen rank verme."
  },
  referee_works: {
    title: "✦ REFEREE AKTİVİTESİ",
    body: "# Aktivite nasıl sayılır?\nOnaylanan maç sonucu referee aktivitesine eklenir. Haftalık kota, LOA ve whitelist durumuyla birlikte değerlendirilir.\n\nEksik aktivite otomatik ceza değildir; önce manager incelemesi ve gerekirse uyarı/öneri oluşturulur."
  },
  training_rules: {
    title: "✦ TRAINING HOSTER REHBERİ",
    body: "# Training başlat\n`/training start link:<roblox-link>` ile temiz Markdown duyurusu aç.\n\n## Oturum\n- Takımları dengeli kur ve sırayı koru.\n- Kilitle/Aç/Bitir kontrollerini yalnız yetkili hoster kullanır.\n- Sonuçta skor, kazanan taraf, MVP ve kanıtı kaydet.\n- Aktif duyurunun altında marka footerı kullanma."
  },
  tryout_rules: {
    title: "✦ TRYOUT HOSTER REHBERİ",
    body: "# Oyuncuyu bütün olarak değerlendir\nRC timing, catch, dash tepkisi, hareket, baskı, adaptasyon ve game sense birlikte değerlendirilir; yalnız kazanmak yeterli değildir.\n\n## Sonuç\nStage → Level → Strength sırasını kullan. Kendi yetki tavanının üstünde rank veremezsin; manager onayı bekleyen sonucu manuel rol ile verme."
  },
  role_guide: {
    title: "✦ ROL VE YETKİ REHBERİ",
    body: "# Roller\nDil, ping, bölge ve ilgili topluluk rolleri `roller` kanalından seçilir. Aynı butona tekrar basmak rolü kaldırır.\n\n## Yetki\nStaff yetkileri yazıdan değil, bot RBAC ve Discord hiyerarşisinden uygulanır. Trial roller yüksek etkili onaylara erişemez."
  },
  faq_trust: {
    title: "✦ GÜVENLİK VE GÜVEN",
    body: "# FIMA Bot / FIMA güvenliği\n- FIMA Bot veya FIMA asla cookie, şifre, token ya da Roblox parolası istemez.\n- Dosyaları yalnız resmi bağlantılardan indir.\n- Şüpheli linkleri açma; destek ticketı ile bildir.\n- Ekran görüntüsü tek başına ödeme veya hesap sahipliği kanıtı değildir."
  },
  mainer_guide: {
    title: "✦ MAINER REHBERİ",
    body: "# Main clan bilgisi\nGüncel kod ve bölge sadece canonical mainer mesajından alınır. Kod değişirse aynı mesaj yerinde güncellenir.\n\n- Kanıtı `mainer-kanıt` kanalına gönder.\n- `/mainclan code:<kod> region:<bölge>` formatını kullan.\n- Hesap bilgisi, cookie veya şifre paylaşma."
  },
  availability_guide: {
    title: "✦ MÜSAİTLİK REHBERİ",
    body: "# Panel neyi gösterir?\n- **Cooldown:** oyuncu challenge başlatamaz.\n- **Immunity:** oyuncuya challenge atılamaz.\n- **Meydan okunuyor:** açık ticket ikinci maçı engeller.\n- **LOA:** aktiflik durumunu ayrıca belirtir.\n\nSüreler herkese kendi saatine göre görünen Discord zaman damgalarıdır."
  },
  loa_guide: {
    title: "✦ LOA REHBERİ",
    body: "# İzin / LOA\n`/loa request` ile süre ve kısa sebep gir. Manager onayından sonra durum aktif olur.\n\nLOA, challenge cooldown veya immunity ile aynı şey değildir. Süre dolunca sistem durumu otomatik olarak günceller."
  },
  profile_guide: {
    title: "✦ PROFİL VE ROBLOX DOĞRULAMA",
    body: "# Güvenli doğrulama\n1. `/profile create` çalıştır.\n2. Kısa kodu Roblox About alanına koy.\n3. Süresi dolmadan doğrula.\n4. Bölge/gizlilik ayarını profilden düzenle.\n\nFIMA Bot Roblox şifresi, cookie veya token istemez. Aynı Roblox hesabı ikinci aktif profile bağlanamaz."
  },
  application_guide: {
    title: "✦ BAŞVURU REHBERİ",
    body: "# Ekibe katıl\n`/application apply` ile doğru pozisyonu seç ve soruları dürüstçe yanıtla.\n\n- Aynı anda bir aktif başvuru tutulur.\n- İstenen ek bilgi aynı başvuruya eklenir; yeni kayıt açılmaz.\n- Onay, red veya ek-bilgi sonucu özel olarak bildirilir.\n- Rol yalnız hiyerarşi uygunsa verilir."
  },
  mod_command_guide: {
    title: "✦ MODERASYON REHBERİ",
    body: "# Orantılı işlem\n- İlk düşük etkili ihlalde uyarı ve kanıtla başla.\n- Spam/disrupt için sınırlı timeout kullan.\n- Kick/ban talebi ayar açıksa üst yetkili onayına gider.\n- Scam/raid durumunda önce quarantine veya lockdown değerlendirilir.\n\nHer işlem case ve güvenli log kaydı oluşturur."
  },
  training_hoster_guide: {
    title: "✦ TRAINING HOSTER KOMUTLARI",
    body: "# Başlat\n`/training start link:<roblox-link>`\n\n# Bitir\n`/training result score:3-1 winner:<taraf> mvps:<üyeler> proof:<url>`\n\nOturum bitince bot orijinal duyuruya yanıt verir, kontrolleri kapatır ve aktiviteyi kaydeder. Varsayılan kota haftada iki trainingdir; LOA/whitelist incelemeyi duraklatır."
  },
  tryout_hoster_guide: {
    title: "✦ TRYOUT HOSTER KOMUTLARI",
    body: "# Başlat\n`/tryout start link:<roblox-link>`\n\n# Sonuç\n`/tryout result user:@oyuncu stage:2 level:High strength:Strong`\n\nBot profil doğrulamasını, minimum rankı ve hoster yetki tavanını kontrol eder. Sonucu manuel rol vererek atlama; manager onayı gerekiyorsa bekle."
  },
  giveaway_event_guide: {
    title: "✦ ETKİNLİK VE ÇEKİLİŞ REHBERİ",
    body: "# Çekiliş\n`/giveaway create` ile ödül, süre, kazanan sayısı ve gereksinimleri tanımla. Reroll geçmişi loglanır.\n\n# Etkinlik / Game Night\nBaşlık, saat, ping rolü ve görsel önizlemeyi net gir. Teslim edemeyeceğin ödülü duyurma; şüpheli alt hesapları review kuyruğuna bırak."
  },
  hoster_rules: {
    title: "✦ HOSTER KURALLARI",
    body: "# Beklenti\nDuyuruları bot komutlarıyla aç, sırayı ve katılımcıları düzenli tut, kanıt/sonuç bilgisini doğru gir. Sorunda üst staffa haber ver.\n\nToxic davranış, yarım bırakılan oturum veya kanıtsız sonuç hoster yetkisinin incelenmesine neden olur."
  },
  dashboard_guide: {
    title: "✦ DASHBOARD REHBERİ",
    body: "# Güvenli ayar sırası\n1. Yönetilen sunucuyu seç.\n2. Template seç veya mevcut templatei incele.\n3. Kanal/rol eşlemelerini kontrol et.\n4. Önizleme yap, kaydet ve gerekirse yerinde repost et.\n5. Rebuild yalnız yedek, preview ve yazılı owner onayıyla kullanılabilir."
  },
  moderation_policy: {
    title: "✦ MODERASYON VE QUARANTINE POLİTİKASI",
    body: "# Güvenli sıra\n1. Bağlamı ve kanıtı koru.\n2. Hafif ihlalde orantılı uyarı ver.\n3. Spam için makul timeout kullan.\n4. Şüpheli link/hesabı review için quarantine et.\n5. Ağır işlemde üst onay akışını kullan.\n\nİlk ihlalde otomatik ban yoktur; yanlış işlem incelenebilir olmalıdır."
  },
  ticket_guide: {
    title: "✦ TICKET VE TRANSCRIPT REHBERİ",
    body: "# Doğru kategori\nDestek, ödeme/lisans, başvuru, challenge, report ve itirazlar kendi güvenli akışını kullanır.\n\n## Yaşam döngüsü\n- Staff ticketı üstlenir ve kapatır.\n- Kapatma transcript kaydetmeden başarılı olmaz.\n- Kapalı ticketta yalnız yeniden açma veya güvenli silme görünür.\n- Silme transcript + log sonrası olur; hata varsa kanal korunur."
  },
  report_guide: {
    title: "✦ REPORT REHBERİ",
    body: "# Report açarken\nOlay özeti, tarih/kanal, ilgili kişi ve güvenli kanıtı ekle. İntikam veya sahte report yasaktır.\n\nStaff-only notlar üyeye görünmez. Düşük yetkili staff kick/ban talebi açabilir; üst onay olmadan uygulanmaz. Acil scam/raid durumunda kişisel veriyi public kanala yazma."
  }
});

export function localizeParadiseGuide(definition, language = "tr") {
  if (language === "en") return definition;
  const localized = PARADISE_GUIDE_TR_COPY[definition?.key];
  return localized ? { ...definition, ...localized } : definition;
}

const GUIDE_MAPPING_KEYS = Object.freeze({
  rules: "rules_channel",
  announcement: "announcement_channel",
  booster: "activity_rewards_channel",
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
  if (!channel?.isTextBased?.()) {
    return failedParadiseMessageReadback({ reason: "guide_channel_not_resolved" });
  }
  const state = await loadState();
  const oldId = configForGuild(state, guild.id).guideMessageIds?.[definition.key];
  let message = oldId ? await channel.messages.fetch(oldId).catch(() => null) : null;
  const language = guildLanguage(configForGuild(state, guild.id));
  const localizedDefinition = localizeParadiseGuide(definition, language);
  const color = await paradiseBrandColor();
  const payload = definition.key === "staff_command_guide"
    ? staffGuidePayload(language)
    : (() => {
      const embed = new EmbedBuilder().setColor(color).setTitle(localizedDefinition.title)
        .setDescription(localizedDefinition.body.slice(0, 4096)).setTimestamp();
      if (GUIDE_FOOTER_KEYS.has(definition.key)) embed.setFooter(paradiseFooter("TR / EN handbook"));
      const bannerUrl = paradiseCommunityGuideBannerUrl(definition.key);
      if (bannerUrl) embed.setImage(bannerUrl);
      return { embeds: [embed] };
    })();
  const thumbnail = paradiseCommunityGuideThumbnailAttachment(definition.key);
  if (thumbnail) {
    payload.embeds[0].setThumbnail(thumbnail.url);
    payload.files = [thumbnail.file];
  }
  payload.embeds[0].setColor(color);
  if (message) await message.edit(payload); else message = await channel.send(payload);
  await message.pin?.("FIMA Bot canonical channel handbook").catch(() => null);
  await saveState(next => {
    next.guildConfigs[guild.id] = next.guildConfigs[guild.id] || structuredClone(next.config || {});
    next.guildConfigs[guild.id].guideMessageIds = next.guildConfigs[guild.id].guideMessageIds || {};
    next.guildConfigs[guild.id].guideMessageIds[definition.key] = message.id;
    return next;
  });
  return verifyParadiseMessageReadback(channel, message, {
    botUserId: guild.client?.user?.id,
    expectedTitle: paradisePayloadFirstEmbed(payload).title,
    expectedBannerUrl: paradiseCommunityGuideBannerUrl(definition.key),
    expectedThumbnail: thumbnail
  });
}

export function paradiseCommunityVideoTeamPanelPayload({
  color = DEFAULT_PARADISE_BRAND_COLOR,
  language = "en",
  bannerUrl = PARADISE_COMMUNITY_ASSETS.videoTeam
} = {}) {
  const turkish = language === "tr";
  const embed = new EmbedBuilder()
    .setColor(normalizeParadiseBrandColor(color))
    .setTitle("✦ FIMA VIDEO TEAM")
    .setDescription(turkish
      ? [
        "# İçerik üretim merkezi",
        "FIMA Video Team; fikirden yayına kadar bütün üretim akışını tek yerde ve düzenli biçimde yönetir.",
        "",
        "**Akış**  →  Fikir › Senaryo › Asset › İnceleme › Yayın",
        "",
        "• `〆・video-ideas` — fikirler ve içerik briefleri",
        "• `〆・video-scripts` — senaryo, başlık ve açıklama taslakları",
        "• `〆・video-assets` — görsel, ses ve proje dosyaları",
        "• `〆・video-review` — kalite kontrol ve son onay",
        "• `〆・video-upload-schedule` — yayın planı ve teslim takibi",
        "",
        "-# Erişim yalnız Video Team ve yetkili staff rolleri içindir."
      ].join("\n")
      : [
        "# Content production hub",
        "FIMA Video Team keeps the complete production flow organized from the first idea to publication.",
        "",
        "**Flow**  →  Idea › Script › Assets › Review › Publish",
        "",
        "• `〆・video-ideas` — concepts and creative briefs",
        "• `〆・video-scripts` — scripts, titles and descriptions",
        "• `〆・video-assets` — visual, audio and project files",
        "• `〆・video-review` — quality control and final approval",
        "• `〆・video-upload-schedule` — publishing plan and delivery tracking",
        "",
        "-# Access is limited to Video Team and authorized staff roles."
      ].join("\n"))
    .setImage(sanitizeParadiseHttpsUrl(bannerUrl) || PARADISE_COMMUNITY_ASSETS.videoTeam)
    .setFooter({ text: `${turkish ? "Video ekibi merkezi" : "Video team hub"} • ${DEFAULT_FIMA_FOOTER_BRAND}` })
    .setTimestamp();
  return { embeds: [embed] };
}

async function updateParadiseCommunityVideoTeamPanel(guild, mode) {
  if (!isFimaCommunityManagedGuild(guild?.id) || mode !== "community") {
    return failedParadiseMessageReadback({ reason: "video_team_not_applicable" });
  }
  const channel = guild.channels.cache.find(item => item.name === "〆・video-hub");
  if (!channel?.isTextBased?.() || typeof channel.send !== "function") {
    return failedParadiseMessageReadback({ reason: "video_team_channel_not_resolved" });
  }

  const state = await loadState();
  const guildConfig = mergeParadiseCommunityAssetDefaults(configForGuild(state, guild.id), {
    guildId: guild.id,
    mode
  });
  const payload = paradiseCommunityVideoTeamPanelPayload({
    color: guildConfig.brandColor,
    language: guildLanguage(guildConfig),
    bannerUrl: guildConfig.videoTeamBannerUrl || guildConfig.banners?.videoTeam
  });
  let message = guildConfig.videoTeamMessageId && typeof channel.messages?.fetch === "function"
    ? await channel.messages.fetch(guildConfig.videoTeamMessageId).catch(() => null)
    : null;
  if (!message && typeof channel.messages?.fetch === "function") {
    const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    message = recent?.find?.(item => item.author?.id === guild.client?.user?.id
      && item.embeds?.some?.(embed => embed.title === "✦ FIMA VIDEO TEAM")) || null;
  }
  if (message) await message.edit(payload); else message = await channel.send(payload);
  await message.pin?.("FIMA canonical Video Team hub").catch(() => null);
  await saveState(next => {
    next.guildConfigs[guild.id] = mergeParadiseCommunityAssetDefaults(
      next.guildConfigs[guild.id] || structuredClone(next.config || {}),
      { guildId: guild.id, mode }
    );
    next.guildConfigs[guild.id].videoTeamMessageId = message.id;
    if (guild.id === PARADISE_TEST_GUILD_ID) next.config = structuredClone(next.guildConfigs[guild.id]);
    return next;
  });
  const embed = paradisePayloadFirstEmbed(payload);
  return verifyParadiseMessageReadback(channel, message, {
    botUserId: guild.client?.user?.id,
    expectedTitle: embed.title,
    expectedBannerUrl: embed.image?.url
  });
}

async function publishAllGuides(guild, mode) {
  if (isFimaCommunityManagedGuild(guild?.id) && mode === "community") {
    await saveState(state => {
      state.guildConfigs[guild.id] = mergeParadiseCommunityAssetDefaults(
        state.guildConfigs[guild.id] || structuredClone(state.config || {}),
        { guildId: guild.id, mode }
      );
      if (guild.id === PARADISE_TEST_GUILD_ID) state.config = structuredClone(state.guildConfigs[guild.id]);
      return state;
    });
  }
  const details = [];
  const collect = (key, result) => {
    const sanitized = sanitizeParadiseMessageReadback(result, key);
    details.push(sanitized);
    return sanitized;
  };
  const runPublisher = async (key, publisher) => {
    try {
      return collect(key, await publisher());
    } catch {
      return collect(key, failedParadiseMessageReadback({ reason: "publisher_failed" }));
    }
  };

  await runPublisher("member_help", () => publishSetupGuides(guild, mode));
  for (const definition of GUIDE_POSTS) {
    await runPublisher(definition.key, () => publishGuidePost(guild, definition));
  }
  if (isFimaCommunityManagedGuild(guild?.id) && mode === "community") {
    await runPublisher("video_team", () => updateParadiseCommunityVideoTeamPanel(guild, mode));
  }
  const required = details.length;
  const posted = details.filter(item => item.posted).length;
  const verified = details.filter(item => item.verified).length;
  return {
    posted,
    verified,
    required,
    ready: required > 0 && verified === required,
    mode,
    details
  };
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
  return withParadiseGuildMutationLock(guild, "publish_guides", async () => {
    await updateParadiseMutationLease({ phase: "publishing_guides" });
    return paradiseGuildContext.run(guild.id, () => publishAllGuides(guild, mode));
  }, {
    purposeKey: "discord_publish_guides",
    idempotencyKey: `${guild.id}:${mode}:publish-guides`,
    phase: "request_validated"
  });
}

export async function syncParadiseMappedPanels(guild) {
  if (!guild) throw Object.assign(new Error("paradise_guild_unavailable"), { code: "paradise_guild_unavailable" });
  return withParadiseGuildMutationLock(guild, "sync_panels", async () => {
    await updateParadiseMutationLease({ phase: "syncing_mapped_panels" });
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
      details.push({ panel: "challenge_create", status: "updated" });
      updated += 1;
    } else {
      details.push({ panel: "challenge_create", status: "skipped", reason: "not_mapped" });
      skipped += 1;
    }
    for (const definition of GUIDE_POSTS) {
      const mappingKey = GUIDE_MAPPING_KEYS[definition.key];
      if (mappingKey && !config.channelMappings?.[mappingKey]) continue;
      if (!mappingKey) {
        const exactChannel = guild.channels.cache.find(item =>
          item.name === definition.channel && item.isTextBased?.()
        );
        if (!exactChannel) continue;
      }
      let guide;
      try {
        guide = await publishGuidePost(guild, definition);
      } catch {
        guide = failedParadiseMessageReadback({ reason: "publisher_failed" });
      }
      const readback = sanitizeParadiseMessageReadback(guide);
      details.push({ panel: definition.key, status: guide.ready ? "updated" : "skipped", ...readback });
      if (guide.ready) updated += 1; else skipped += 1;
    }
    if (config.channelMappings?.availability_channel) {
      const panel = await updateAvailabilityPanel(guild).catch(() => null);
      details.push({ panel: "availability", status: panel ? "updated" : "skipped" });
      if (panel) updated += 1; else skipped += 1;
    }
      return { updated, skipped, details };
    });
  }, {
    purposeKey: "discord_sync_mapped_panels",
    idempotencyKey: `${guild.id}:sync-mapped-panels`,
    phase: "request_validated"
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
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("🤝 FIMA BOT CLAN RELATIONS")
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
    .setDescription(`## ◆ Request\n- **Region:** ${interaction.options.getString("region").toUpperCase()}\n- **Format:** ${interaction.options.getString("format") || "Flexible"}\n\n> FIMA Bot only contacts clans that explicitly opted into the FCW directory.\n\n-# No server scraping • No unsolicited DMs`)
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
      .setDescription("# Ready to challenge?\nFIMA Bot will check your completed profile, leaderboard range, cooldown, opponent immunity, LOA and open tickets.\n\n## ◆ Before you continue\n- Record the complete set.\n- Keep evidence inside the ticket.\n- Result approval is restricted to senior referee roles.\n\n-# Hedef seçimi ve ticket açılışı sırasında durum iki kez kontrol edilir.")
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

export const PARADISE_LOG_EVENT_TYPES = Object.freeze([
  "message", "member", "role", "channel", "webhook", "invite", "voice", "moderation", "ticket", "transcript",
  "application", "payment_license", "profile_transfer", "leaderboard_challenge", "ai", "security", "setup", "dashboard", "premium_billing"
]);

export function redactParadiseLogValue(value) {
  if (typeof value === "string") {
    return maskParadiseTranscriptText(value)
      .replace(/https?:\/\/(?:canary\.)?discord(?:app)?\.com\/api\/webhooks\/[^\s)]+/gi, "[masked-webhook]");
  }
  if (Array.isArray(value)) return value.slice(0, 25).map(redactParadiseLogValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [
      String(key).replace(/(?:secret|token|password|cookie|license.?key|hwid|webhook|authorization)/i, "masked"),
      /(?:secret|token|password|cookie|license.?key|hwid|webhook|authorization)/i.test(key) ? "[masked]" : redactParadiseLogValue(item)
    ]));
  }
  return value == null || ["number", "boolean"].includes(typeof value) ? value : String(value).slice(0, 120);
}

function paradiseLogTypeForMapping(mappingKey = "") {
  const key = String(mappingKey).toLowerCase();
  if (key.includes("transcript")) return "transcript";
  if (key.includes("ticket") || key.includes("support")) return "ticket";
  if (key.includes("application")) return "application";
  if (key.includes("payment") || key.includes("license")) return "payment_license";
  if (key.includes("moderation") || key.includes("mod_")) return "moderation";
  if (key.includes("blacklist") || key.includes("quarantine") || key.includes("security")) return "security";
  if (key.includes("voice")) return "voice";
  if (key.includes("roster") || key.includes("war") || key.includes("challenge")) return "leaderboard_challenge";
  return "setup";
}

export function buildParadiseSafeLogEvent({
  guildId,
  type = "setup",
  title = "FIMA Bot event",
  description = "",
  metadata = {},
  correlationId = crypto.randomUUID(),
  retentionDays = 180,
  viewerScope = "staff",
  createdAt = new Date().toISOString()
} = {}) {
  const safeType = PARADISE_LOG_EVENT_TYPES.includes(type) ? type : "setup";
  return Object.freeze({
    id: crypto.randomUUID(),
    guildId: String(guildId || ""),
    type: safeType,
    title: redactParadiseLogValue(String(title || "FIMA Bot event")).slice(0, 256),
    description: redactParadiseLogValue(String(description || "")).slice(0, 1800),
    metadata: redactParadiseLogValue(metadata),
    correlationId: String(correlationId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 96),
    retentionDays: Math.max(1, Math.min(3650, Number(retentionDays) || 180)),
    viewerScope: ["staff", "managers", "owners"].includes(viewerScope) ? viewerScope : "staff",
    createdAt: new Date(createdAt).toISOString()
  });
}

export function paradiseLogPolicy(config = {}, type = "setup") {
  const settings = config?.logSettings && typeof config.logSettings === "object" ? config.logSettings : {};
  const perType = settings.eventPolicies?.[type] && typeof settings.eventPolicies[type] === "object" ? settings.eventPolicies[type] : {};
  const retentionDays = Math.max(1, Math.min(3650, Number(perType.retentionDays ?? settings.retentionDays ?? 180) || 180));
  const viewerScope = ["staff", "managers", "owners"].includes(perType.viewerScope || settings.viewerScope)
    ? (perType.viewerScope || settings.viewerScope)
    : "staff";
  return Object.freeze({ retentionDays, viewerScope });
}

export function canViewParadiseLogEvent({ event, roleKeys = [], isOwner = false, isAdministrator = false } = {}) {
  if (isOwner || isAdministrator) return true;
  const roles = new Set((roleKeys || []).map(value => String(value).toLowerCase()));
  const owner = roles.has("owner") || roles.has("overseer");
  if (event?.viewerScope === "owners") return owner;
  const manager = owner || ["admin", "manager", "moderator_manager", "referee_manager", "training_manager", "tryout_manager"].some(key => roles.has(key));
  if (event?.viewerScope === "managers") return manager;
  return manager || ["moderator", "support", "fima_support", "security", "referee", "training_hoster", "tryout_hoster", "application_reviewer"].some(key => roles.has(key));
}

async function logParadiseAction(guild, mappingKey, fallbackName, title, description, options = {}) {
  const state = await loadState();
  const type = options.type || paradiseLogTypeForMapping(mappingKey);
  const policy = paradiseLogPolicy(configForGuild(state, guild?.id), type);
  const event = buildParadiseSafeLogEvent({
    guildId: guild?.id,
    type,
    title,
    description,
    metadata: options.metadata || {},
    correlationId: options.correlationId,
    retentionDays: options.retentionDays ?? policy.retentionDays,
    viewerScope: options.viewerScope ?? policy.viewerScope
  });
  if (guild?.id) {
    await saveState(next => {
      const previous = Array.isArray(next.paradiseLogs?.[guild.id]) ? next.paradiseLogs[guild.id].slice(-199) : [];
      next.paradiseLogs[guild.id] = [...previous, event];
      return next;
    });
  }
  if (!fimaRuntimeModuleAllowed(configForGuild(state, guild?.id), 'logs')) return event;
  const channel = await configuredChannel(guild, mappingKey, fallbackName);
  if (!channel?.isTextBased?.()) return null;
  return channel.send({
    embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(event.title)
      .setDescription(event.description || "—")
      .setFooter(paradiseFooter(`Private ${event.type} log · ${event.correlationId.slice(0, 8)}`)).setTimestamp()]
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
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle(board === "war" ? "⚔ FIMA BOT WAR LINEUP" : "♟ FIMA BOT MAIN LINEUP")
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
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("♟ FIMA BOT COMPETITIVE ROSTER").setDescription(description).setFooter(paradiseFooter("Managed with /roster")).setTimestamp();
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
    : "_No active FIMA Bot blacklist records._";
  const embed = new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("⊘ FIMA BOT BLACKLIST").setDescription(description).setFooter(paradiseFooter("Evidence-backed records only")).setTimestamp();
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

function blacklistAppealPrivateReviewError(cause = null) {
  return Object.assign(new Error("blacklist_appeal_private_review_unavailable", { cause }), {
    code: "blacklist_appeal_private_review_unavailable",
    statusCode: 503
  });
}

function blacklistAppealReviewerIds(guild, applicantId, explicitReviewerIds = []) {
  const cachedReviewers = cachedValues(guild?.members?.cache)
    .filter(member => {
      try { return canManageBlacklist(member); } catch { return false; }
    })
    .map(member => member.id);
  return [...new Set([guild?.ownerId, ...explicitReviewerIds, ...cachedReviewers]
    .map(value => String(value || "").trim())
    .filter(value => value && value !== String(applicantId)))].slice(0, 8);
}

export async function createBlacklistAppealPrivateReview({
  guild,
  parentChannel,
  applicantId,
  applicantName = "member",
  reviewerIds = [],
  messagePayload
} = {}) {
  if (
    !guild?.id
    || parentChannel?.type !== ChannelType.GuildText
    || typeof parentChannel.threads?.create !== "function"
    || !applicantId
  ) throw blacklistAppealPrivateReviewError();

  const reviewers = blacklistAppealReviewerIds(guild, applicantId, reviewerIds);
  if (!reviewers.length) throw blacklistAppealPrivateReviewError();

  let thread = null;
  let firstMessage = null;
  try {
    const safeName = String(applicantName || "member")
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "member";
    thread = await parentChannel.threads.create({
      name: `appeal-${safeName}`.slice(0, 90),
      type: ChannelType.PrivateThread,
      autoArchiveDuration: 1440,
      invitable: false,
      reason: "FIMA Bot private blacklist appeal"
    });
    if (
      !thread?.id
      || thread.type !== ChannelType.PrivateThread
      || typeof thread.members?.add !== "function"
      || typeof thread.send !== "function"
    ) throw blacklistAppealPrivateReviewError();

    const applicantMembership = await thread.members.add(String(applicantId));
    if (!applicantMembership) throw blacklistAppealPrivateReviewError();
    const reviewerMemberships = await Promise.allSettled(reviewers.map(id => thread.members.add(id)));
    if (!reviewerMemberships.some(result => result.status === "fulfilled" && result.value)) {
      throw blacklistAppealPrivateReviewError();
    }
    firstMessage = await thread.send(messagePayload);
    if (!firstMessage?.id) throw blacklistAppealPrivateReviewError();
    return {
      channel: thread,
      parentChannelId: parentChannel.id,
      privateThread: true,
      message: firstMessage,
      reviewerIds: reviewers
    };
  } catch (error) {
    await Promise.allSettled([
      firstMessage?.delete?.(),
      thread?.delete?.("Blacklist appeal delivery failed")
    ].filter(Boolean));
    if (error?.code === "blacklist_appeal_private_review_unavailable") throw error;
    throw blacklistAppealPrivateReviewError(error);
  }
}

async function handleBlacklist(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "status") {
    const user = interaction.options.getUser("user") || interaction.user;
    const record = (await loadState()).blacklists?.[interaction.guildId]?.[user.id];
    const summary = record?.status === "active"
      ? `${user} has an active FIMA Bot blacklist record from <t:${Math.floor(Date.parse(record.createdAt) / 1000)}:R>. Use the private appeal flow for review.`
      : `${user} does not have an active FIMA Bot blacklist record in this server.`;
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
      roleChanged = await targetMember.roles.remove(blacklistedRole, "FIMA Bot blacklist resolved").then(() => true).catch(() => false);
    } else {
      roleChanged = await targetMember.roles.add(blacklistedRole, "FIMA Bot blacklist active").then(() => true).catch(() => false);
    }
  }
  await updateBlacklistPanel(interaction.guild).catch(() => {});
  await logParadiseAction(interaction.guild, "blacklist_logs_channel", "blacklist-logs", "Blacklist record updated",
    `${user} record was **${sub === "remove" ? "resolved" : "created"}** by <@${interaction.user.id}>.\n**Reason:** ${reason}`);
  return interaction.reply({
    content: `${user} blacklist record ${sub === "remove" ? "resolved" : "created"}.${roleChanged ? "" : " Warning: the record was saved, but the BLACKLISTED role could not be changed. Move FIMA Bot above that role and repair permissions."}`,
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
    const parent = await configuredChannel(interaction.guild, "blacklist_appeal_channel", [
      "blacklist-appeal", "ban-appeal", "◇・destek"
    ]);
    const reason = interaction.options.getString("reason");
    const evidence = interaction.options.getString("evidence") || null;
    let privateReview = null;
    try {
      privateReview = await createBlacklistAppealPrivateReview({
        guild: interaction.guild,
        parentChannel: parent,
        applicantId: interaction.user.id,
        applicantName: interaction.user.username,
        messagePayload: {
          content: `<@${interaction.user.id}>`,
          allowedMentions: { users: [interaction.user.id], roles: [], parse: [] },
          embeds: [new EmbedBuilder().setColor(await paradiseBrandColor()).setTitle("◇ PRIVATE BLACKLIST APPEAL")
            .setDescription(`**Applicant:** <@${interaction.user.id}>\n**Reason:** ${reason}\n**Evidence:** ${evidence || "Not supplied"}\n\n> Staff review is evidence-based. Bail is never guaranteed and cannot automatically remove a blacklist.`)
            .setFooter(paradiseFooter("Private staff review")).setTimestamp()]
        }
      });
      await saveState(next => {
        next.appeals[interaction.guildId] = next.appeals[interaction.guildId] || {};
        next.appeals[interaction.guildId][interaction.user.id] = {
          userId: interaction.user.id,
          status: "pending",
          reason,
          evidence,
          threadId: privateReview.channel.id,
          reviewMessageId: privateReview.message.id,
          createdAt: new Date().toISOString()
        };
        return next;
      });
    } catch {
      await Promise.allSettled([
        privateReview?.message?.delete?.(),
        privateReview?.channel?.delete?.("Blacklist appeal state save failed")
      ].filter(Boolean));
      return interaction.editReply("Your appeal could not be opened privately, so nothing was recorded. Please ask staff to repair the appeal channel permissions and try again.");
    }
    await logParadiseAction(interaction.guild, "blacklist_logs_channel", "blacklist-logs", "Blacklist appeal opened",
      `<@${interaction.user.id}> opened a private appeal in ${privateReview.channel}.`);
    return interaction.editReply(`Your private appeal was created: ${privateReview.channel}`);
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
      roleRemoved = await targetMember.roles.remove(blacklistedRole, "FIMA Bot appeal approved").then(() => true).catch(() => false);
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
    return interaction.reply({ content: "Bail review is disabled for this server in the FIMA Bot dashboard.", ephemeral: true });
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
    return interaction.reply({ content: "Unknown FIMA Bot channel mapping.", ephemeral: true });
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
  const result = await publishParadiseGuidesFromDashboard(interaction.guild, mode);
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
    command_plan_required: tr ? "Bu komut seçili FIMA Bot planını gerektiriyor." : "This command requires the selected FIMA Bot plan.",
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
    embeds: [new EmbedBuilder().setColor(paradiseBrandColorInteger(color)).setTitle("✦ FIMA BOT STYLE PREVIEW")
      .setDescription("# Primary heading\n## ◆ Clear section\n### ◇ Supporting detail\n\n**Bold priority** • __Underlined label__ • _soft emphasis_\n\n- Clean bullet hierarchy\n- Consistent spacing\n- Short, readable sections\n\n> Important callout text stays visually separate.\n\n-# This smaller line is Discord subtext.")
      .addFields(
        { name: "Current accent", value: `\`${color}\``, inline: true },
        { name: "Dashboard", value: "Change it anytime in the owner console.", inline: true }
      )
      .setFooter(paradiseFooter("Unified visual system"))],
    ephemeral: true
  });
}

const PARADISE_HIGH_RISK_LINK_TERMS = Object.freeze([
  "free nitro", "steam gift", "claim reward", "verify account here", "limited gift", "discord.gift/"
]);
const PARADISE_RISKY_ATTACHMENT_TYPES = Object.freeze([
  "text/html", "application/javascript", "application/x-msdownload", "application/x-sh", "image/svg+xml"
]);

export function evaluateParadiseContentSafety({
  content = "",
  attachments = [],
  roleKeys = [],
  isOwner = false,
  config = {}
} = {}) {
  const text = String(content || "").replace(/[\u200B-\u200D\uFEFF\s]+/g, "").toLowerCase();
  const roles = new Set((roleKeys || []).map(key => String(key).toLowerCase()));
  const isInviteApproved = isOwner || roles.has("invite_approved") || roles.has("owner") || roles.has("admin");
  const hasInvite = /discord\.gg\/|discord(?:app)?\.com\/invite\//i.test(text);
  const highRiskText = PARADISE_HIGH_RISK_LINK_TERMS.some(term => text.includes(term.replace(/\s+/g, "")));
  const riskyAttachment = (attachments || []).some(attachment => {
    const type = String(attachment?.contentType || attachment?.content_type || "").toLowerCase();
    const name = String(attachment?.name || attachment?.filename || "").toLowerCase();
    return PARADISE_RISKY_ATTACHMENT_TYPES.includes(type) || /\.(?:exe|msi|bat|cmd|ps1|js|html?|svg)$/i.test(name);
  });
  const blocked = highRiskText || riskyAttachment || (hasInvite && config.blockInvites !== false && !isInviteApproved);
  const reason = highRiskText ? "scam_pattern" : riskyAttachment ? "unsafe_attachment" : hasInvite && !isInviteApproved ? "invite_not_approved" : null;
  return Object.freeze({
    blocked,
    reason,
    hasInvite,
    highRiskText,
    riskyAttachment,
    // Trusted media/link roles intentionally never clear high-risk content.
    trustedRolePresent: roles.has("media_trusted") || roles.has("link_trusted") || roles.has("media_approved") || roles.has("links_approved")
  });
}

async function handleParadiseMessageInner(message) {
  if (!message.guild || message.author.bot) return false;
  const state = await loadState();
  const guildConfig = configForGuild(state, message.guild.id);
  const safety = evaluateParadiseContentSafety({
    content: message.content,
    attachments: [...(message.attachments?.values?.() || [])],
    roleKeys: [...(message.member?.roles?.cache?.values?.() || [])].map(role => role.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")),
    isOwner: message.guild.ownerId === message.author.id,
    config: guildConfig.automod || {}
  });
  if (fimaRuntimeModuleAllowed(guildConfig, "security") && safety.blocked && guildConfig.automod?.runtimeSafety !== false) {
    await message.delete().catch(() => null);
    await logParadiseAction(message.guild, "security_logs_channel", "security-logs", "Message safety action",
      `A message was quarantined by the runtime safety policy. Reason: **${safety.reason}**.`, {
        type: "security",
        metadata: { channelId: message.channelId, authorId: message.author.id, reason: safety.reason }
      }).catch(() => null);
    return true;
  }
  const qotdWon = fimaRuntimeModuleAllowed(guildConfig, "events") ? await handleQotdAnswer(message, state) : false;
  await handleMemberLevelMessage(message);
  const sticky = guildConfig.stickies?.[message.channelId];
  if (!fimaRuntimeModuleAllowed(guildConfig, "content") || !sticky || Date.now() - Number(sticky.lastSentAt || 0) < 15_000) return qotdWon;
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

async function updateStaffTeamEmbed(guild, requestedMode = null) {
  const state = await loadState();
  const storedGuildConfig = configForGuild(state, guild.id);
  const mode = requestedMode || storedGuildConfig.activeSetupMode || null;
  const guildConfig = mergeParadiseCommunityAssetDefaults(storedGuildConfig, { guildId: guild.id, mode });
  const channel = paradiseTextChannelByName(guild, "staff-team", "personel-merkezi", "〆・staff-hub", "staff-hub");
  if (!channel?.isTextBased?.()) {
    return failedParadiseMessageReadback({ reason: "staff_team_channel_not_resolved" });
  }
  await guild.members.fetch().catch(() => {});
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
    .setTitle(mode === "community" ? "✦ FIMA STAFF TEAM" : "✦ FIMA BOT STAFF TEAM")
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
  const banner = sanitizeParadiseHttpsUrl(guildConfig.staffTeamBannerUrl || guildConfig.banners?.staffTeam);
  if (banner) intro.setImage(banner);
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
  return verifyParadiseMessageReadback(channel, message, {
    botUserId: guild.client?.user?.id,
    expectedTitle: paradisePayloadFirstEmbed({ embeds: [intro] }).title,
    expectedBannerUrl: banner
  });
}

export async function handleParadiseGuildMemberUpdate(oldMember, newMember) {
  if (!fimaRuntimeModuleAllowed(configForGuild(await loadState(), newMember.guild.id), 'roles')) return false;
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

function localizedHelpLegacy(locale, template = "clan") {
  const tr = String(locale).toLowerCase().startsWith("tr");
  if (template === "community") {
    return tr
      ? "FIMA komutları: `/help`, `/ticket`, `/application apply type:helper`. `/help` yalnız sana açık komutları gösterir. Text ve voice aylık Top 3 ödülleri ayrı ayrı 15/10/7 FIMA Macro günüdür; her boost 3 gün ekler."
      : "FIMA commands: `/help`, `/ticket`, `/application apply type:helper`. `/help` shows only commands available to you. Monthly text and voice Top 3 rewards are 15/10/7 FIMA Macro days per board; every boost adds 3 days.";
  }
  return tr
    ? "Komutlar: `/verifyroblox`, `/tryout start`, `/tryout result`, `/training start`, `/challenge create`. Sonuçlar doğrulama ve yetki sınırlarından geçer."
    : "Commands: `/verifyroblox`, `/tryout start`, `/tryout result`, `/training start`, `/challenge create`. Results pass verification and authority checks.";
}

export function localizedHelp(locale, template = "clan") {
  const tr = String(locale).toLowerCase().startsWith("tr");
  if (template === "community") {
    return tr
      ? "FIMA komutlar\u0131: `/help`, `/ticket`, `/application apply`. Web formunda staff, creator, partnership veya reseller t\u00fcr\u00fcn\u00fc se\u00e7ebilirsin. `/help` yaln\u0131z sana a\u00e7\u0131k komutlar\u0131 g\u00f6sterir. Text ve voice ayl\u0131k Top 3 \u00f6d\u00fclleri ayr\u0131 ayr\u0131 15/10/7 FIMA Macro g\u00fcn\u00fcd\u00fcr; her boost 3 g\u00fcn ekler."
      : "FIMA commands: `/help`, `/ticket`, `/application apply`. Choose staff, creator, partnership or reseller in the website form. `/help` shows only commands available to you. Monthly text and voice Top 3 rewards are 15/10/7 FIMA Macro days per board; every boost adds 3 days.";
  }
  return tr
    ? "Komutlar: `/verifyroblox`, `/tryout start`, `/tryout result`, `/training start`, `/challenge create`. Sonu\u00e7lar do\u011frulama ve yetki s\u0131n\u0131rlar\u0131ndan ge\u00e7er."
    : "Commands: `/verifyroblox`, `/tryout start`, `/tryout result`, `/training start`, `/challenge create`. Results pass verification and authority checks.";
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

const COMMUNITY_NOTIFICATION_ROLE_OPTIONS = Object.freeze([
  { id: "live", role: "Live Notifications", labelTr: "Canlı Yayın", labelEn: "Live Streams", emoji: "🔴" },
  { id: "upload", role: "Upload Notifications", labelTr: "Yeni Videolar", labelEn: "Uploads", emoji: "🎬" },
  { id: "giveaway", role: "Giveaway Notifications", labelTr: "Çekilişler", labelEn: "Giveaways", emoji: "🎁" },
  { id: "community", role: "Community Notifications", labelTr: "Topluluk", labelEn: "Community", emoji: "💬" },
  { id: "poll", role: "Poll Notifications", labelTr: "Anketler", labelEn: "Polls", emoji: "📊" },
  { id: "anti_teamer", role: "Anti-Teamer Notifications", labelTr: "Anti-Teamer", labelEn: "Anti-Teamer", emoji: "⚔️" },
  { id: "glads_eu", role: "Glads • Europe", labelTr: "Glads Europe", labelEn: "Glads Europe", emoji: "🌍" },
  { id: "glads_asia", role: "Glads • Asia", labelTr: "Glads Asia", labelEn: "Glads Asia", emoji: "🌏" },
  { id: "glads_na", role: "Glads • North America", labelTr: "Glads North America", labelEn: "Glads North America", emoji: "🌎" },
  { id: "product", role: "Product Notifications", labelTr: "Ürünler", labelEn: "Products", emoji: "🛍️" },
  { id: "fima", role: "FIMA Updates", labelTr: "FIMA", labelEn: "FIMA", emoji: "💎" },
  { id: "macro", role: "FIMA Macro Updates", labelTr: "FIMA Macro", labelEn: "FIMA Macro", emoji: "⌨️" },
  { id: "ai", role: "FIMA AI Updates", labelTr: "FIMA AI", labelEn: "FIMA AI", emoji: "🧠" },
  { id: "fieel", role: "Fieel Content Notifications", labelTr: "Fieel İçerik", labelEn: "Fieel Content", emoji: "🎬" },
  { id: "tatu", role: "Tatu Content Notifications", labelTr: "Tatu İçerik", labelEn: "Tatu Content", emoji: "📹" },
  { id: "event", role: "Event Notifications", labelTr: "Etkinlikler", labelEn: "Events", emoji: "🎉" },
  { id: "security", role: "Security Alerts", labelTr: "Güvenlik", labelEn: "Security", emoji: "🛡️" }
]);

const LEGACY_PING_ROLE_OPTIONS = Object.freeze([
  { value: "Training", role: "Training Ping" },
  { value: "Tournament", role: "Tournament Ping" },
  { value: "Event", role: "Event Ping" },
  { value: "Giveaway", role: "Giveaway Ping" },
  { value: "Game Night", role: "Game Night Ping" }
]);

export function rolePanelOptionsForTemplate(kind, template = "clan") {
  if (kind === "ping" && template === "community") return COMMUNITY_NOTIFICATION_ROLE_OPTIONS;
  return ROLE_PANEL_OPTIONS[kind] || [];
}

export function legacyPingRoleOptionsForTemplate(template = "clan") {
  if (template === "community") {
    // Existing Community panels may still submit the old "Event" value. Map
    // only that non-competitive choice; never create or remove old competitive
    // memberships during compatibility handling.
    return Object.freeze([{ value: "Event", role: "Event Notifications" }]);
  }
  return LEGACY_PING_ROLE_OPTIONS;
}

export function rolePanelCopy(kind, language = "tr", template = "clan") {
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
      description: template === "community"
        ? (tr
          ? "Kendi bölgeni seç. Bölge rolleri etkinlikleri, topluluk buluşmalarını ve ilgili duyuruları sana göre düzenler."
          : "Pick your region. Region roles tailor events, community meetups and relevant announcements to you.")
        : (tr
          ? "Kendi bölgeni seç. Bölge rolleri matchmaking, etkinlik ve duyuru filtrelerinde kullanılır."
          : "Pick your region. Region roles are used for matchmaking, events and announcement filters.")
    };
  }
  return {
    title: tr ? "◆ Bildirim Rolleri" : "◆ Notification Roles",
    description: tr
      ? "Sadece almak istediğin pingleri seç. Butona tekrar basarsan rol kaldırılır; spam ping yok, kontrol sende."
      : "Pick only the pings you want. Press a button again to remove the role; no spam pings, you stay in control."
  };
}

export function rolePanelRows(kind, language = "tr", template = "clan") {
  const options = rolePanelOptionsForTemplate(kind, template);
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

async function sendRolePanel(interaction, kind, template = "clan") {
  const state = await loadState();
  const language = guildLanguage(configForGuild(state, interaction.guildId));
  const copy = rolePanelCopy(kind, language, template);
  const visibleBrand = template === "community" ? "FIMA" : "FIMA Bot";
  const embed = new EmbedBuilder()
    .setColor(await paradiseBrandColor())
    .setTitle(copy.title)
    .setDescription(`${copy.description}\n\n-# ${language === "tr" ? `Rol panelleri ${visibleBrand} tarafından yerinde güncellenir.` : `Role panels are updated in place by ${visibleBrand}.`}`)
    .setFooter(paradiseFooter("Made By Fieel"));
  await interaction.reply({ embeds: [embed], components: rolePanelRows(kind, language, template) });
}

async function handleRolePanelButton(interaction, kind, optionId, template = "clan") {
  const options = rolePanelOptionsForTemplate(kind, template);
  const option = options.find(item => item.id === optionId);
  if (!option) {
    await interaction.reply({ content: "This role option is no longer configured.", ephemeral: true });
    return;
  }
  const exclusive = kind === "language" || kind === "region";
  try {
    const role = await ensureRole(interaction.guild, option.role);
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
    const visibleBrand = template === "community" ? "FIMA" : "FIMA Bot";
    await interaction.reply({
      content: `${visibleBrand} could not update that role. Check bot role position and Manage Roles permission.`,
      ephemeral: true
    });
  }
}

async function handleParadiseInteractionInner(interaction) {
  if (interaction.guildId && !fimaInteractionModuleAllowed(configForGuild(await loadState(), interaction.guildId), interaction)) {
    await interaction.reply({ content: 'This FIMA module is disabled for this server.', ephemeral: true });
    return true;
  }
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
  if (interaction.isModalSubmit?.() && interaction.customId.startsWith("paradise_application_more_info:")) {
    await handleApplicationMoreInfoModal(interaction);
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
      const context = paradiseRegistryContextForInteraction(interaction, state);
      const entries = memberHelpEntries(context);
      const payload = memberHelpPayload(entries, locale, selectedId === "overview" ? null : selectedId, context.template);
      payload.embeds[0].setColor(await paradiseBrandColor());
      // This control may live on the canonical public help panel.  A personal
      // translation belongs to the clicker, not to everyone reading that
      // channel, so never edit or repost the stored panel here.
      await interaction.reply({ ...payload, ephemeral: true });
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
      const state = await loadState();
      const { template } = paradiseRegistryContextForInteraction(interaction, state);
      await interaction.update({ embeds: [helpEmbed(scope, interaction.locale, template).setColor(await paradiseBrandColor())], components: helpComponents(scope, template) });
      return true;
    }
    if (interaction.customId.startsWith("paradise_help_lang:")) {
      const [, locale, scope] = interaction.customId.split(":");
      const state = await loadState();
      const { template } = paradiseRegistryContextForInteraction(interaction, state);
      await interaction.reply({ embeds: [helpEmbed(scope, locale, template).setColor(await paradiseBrandColor())], ephemeral: true });
      return true;
    }
    if (interaction.customId.startsWith("paradise_loa_")) { await handleLoaDecision(interaction); return true; }
    if (interaction.customId.startsWith("paradise_tryout_")) { await handleTryoutApproval(interaction); return true; }
    if (interaction.customId.startsWith("paradise_challenge_")) { await handleChallengeApproval(interaction); return true; }
    if (interaction.customId.startsWith("paradise_session_")) { await handleSessionButton(interaction); return true; }
    if (interaction.customId.startsWith("paradise_activity_present:")) { await handleActivityResponse(interaction); return true; }
    if (interaction.customId.startsWith("paradise_support_")) { await handleParadiseSupportButton(interaction); return true; }
    if (interaction.customId === "paradise_application_open") {
      const guildConfig = configForGuild(await loadState(), interaction.guildId);
      const mode = guildConfig.activeSetupMode;
      const types = APPLICATION_TYPES.filter(([value]) =>
        applicationTypeAllowedForMode(value, mode, "staff")
        || applicationTypeAllowedForMode(value, mode, "business"));
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
        const state = await loadState();
        const { template } = paradiseRegistryContextForInteraction(interaction, state);
        await handleRolePanelButton(interaction, match[1], match[2], template);
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
    const context = paradiseRegistryContextForInteraction(interaction, state);
    const entries = memberHelpEntries(context);
    const selectedId = interaction.values[0];
    if (!entries.some(entry => entry.id === selectedId)) {
      await interaction.reply({ content: "This help entry is no longer available to you.", ephemeral: true });
      return true;
    }
    const payload = memberHelpPayload(entries, interaction.locale, selectedId, context.template);
    payload.embeds[0].setColor(await paradiseBrandColor());
    // Command detail is role/personal-plan aware; keep the canonical panel
    // unchanged and show it privately.
    await interaction.reply({ ...payload, ephemeral: true });
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
    const state = await loadState();
    const { template } = paradiseRegistryContextForInteraction(interaction, state);
    await interaction.update({
      embeds: [helpEmbed(scope, interaction.locale, template).setColor(await paradiseBrandColor())],
      components: helpComponents(scope, template)
    });
    return true;
  }
  if (interaction.isStringSelectMenu?.() && interaction.customId === "paradise_profile_lookup") {
    await handleProfileLookupSelect(interaction);
    return true;
  }
  if (interaction.isStringSelectMenu?.() && interaction.customId === "paradise_application_type") {
    const guildConfig = configForGuild(await loadState(), interaction.guildId);
    await interaction.showModal(applicationModal(
      interaction.values[0], 0, "new", guildConfig.applicationSettings || {}
    ));
    return true;
  }
  if (interaction.isStringSelectMenu?.() && interaction.customId === "paradise_support_category") {
    const category = interaction.values[0];
    const created = await createParadiseSupportTicket(interaction.guild, interaction.user, interaction.channel, { category }).catch(error => ({ error }));
    if (created.error) {
      await interaction.reply({ content: "This ticket category is not enabled for the selected server template.", ephemeral: true });
      return true;
    }
    await interaction.reply({
      content: created.existing ? `You already have an open ticket: ${created.channel}` : `Support ticket opened: ${created.channel}`,
      ephemeral: true
    });
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
    const state = await loadState();
    const { template } = paradiseRegistryContextForInteraction(interaction, state);
    for (const option of legacyPingRoleOptionsForTemplate(template)) {
      const role = await ensureRole(interaction.guild, option.role);
      if (interaction.values.includes(option.value)) await interaction.member.roles.add(role); else if (interaction.member.roles.cache.has(role.id)) await interaction.member.roles.remove(role);
    }
    await interaction.reply({ content: `${template === "community" ? "FIMA" : "FIMA Bot"} notification roles updated.`, ephemeral: true }); return true;
  }
  if (!interaction.isChatInputCommand?.()) return false;
  if (!(await enforceParadiseCommandRegistry(interaction)).allowed) return true;
  if (!await enforceCommandChannel(interaction)) return true;
  if (interaction.commandName === "setupfieels" || interaction.commandName === "previewserversetup") { await setupChooser(interaction); return true; }
  if (interaction.commandName === "backupserverstructure") { await setupPreview(interaction, "clan"); return true; }
  if (interaction.commandName === "setupfima" || interaction.commandName === "setupfieelscommunity") { await handleSetupAction(interaction, "community"); return true; }
  if (interaction.commandName === "setupfieelsclan") { await handleSetupAction(interaction, "clan"); return true; }
  if (interaction.commandName === "setupfieelstsbtr") { await handleSetupAction(interaction, "tsbtr"); return true; }
  if (interaction.commandName === "setup") { await handleSetupAction(interaction, interaction.options.getString("mode") || "community"); return true; }
  if (interaction.commandName === "help") { await handleRegistryHelp(interaction); return true; }
  if (interaction.commandName === "ticket") { await handleParadiseTicketCommand(interaction); return true; }
  if (interaction.commandName === "verifyroblox") { await verifyStart(interaction); return true; }
  if (interaction.commandName === "verifyrobloxcheck") { await verifyCheck(interaction); return true; }
  if (interaction.commandName === "profile") { await handleProfile(interaction); return true; }
  if (interaction.commandName === "paradisehelp") {
    const state = await loadState();
    const { template } = paradiseRegistryContextForInteraction(interaction, state);
    await interaction.reply({ content: localizedHelp(interaction.locale, template), ephemeral: true }); return true;
  }
  if (interaction.commandName === "sendlanguagequestion") {
    const state = await loadState();
    const { template } = paradiseRegistryContextForInteraction(interaction, state);
    await sendRolePanel(interaction, "language", template); return true;
  }
  if (interaction.commandName === "sendpingroleselector") {
    const state = await loadState();
    const { template } = paradiseRegistryContextForInteraction(interaction, state);
    await sendRolePanel(interaction, "ping", template); return true;
  }
  if (interaction.commandName === "sendregionroleselector") {
    const state = await loadState();
    const { template } = paradiseRegistryContextForInteraction(interaction, state);
    await sendRolePanel(interaction, "region", template); return true;
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
  if (interaction.commandName === "spar") { await handleSpar(interaction); return true; }
  if (interaction.commandName === "war") { await handleWar(interaction); return true; }
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
  if (interaction.commandName === "channel") { await handleChannelCommand(interaction); return true; }
  if (interaction.commandName === "modcase") { await handleModCaseCommand(interaction); return true; }
  if (interaction.commandName === "moderation") { await handleModerationStatsCommand(interaction); return true; }
  if (interaction.commandName === "security") { await handleSecurityCommand(interaction); return true; }
  if (interaction.commandName === "rank") { await handleRankCommand(interaction); return true; }
  if (interaction.commandName === "leaderboard") { await handleLeaderboardCommand(interaction); return true; }
  if (["set", "setlogchannel", "setcommunitychannel"].includes(interaction.commandName)) { await handleSetChannel(interaction); return true; }
  if (interaction.commandName === "handbook") { await handleHandbook(interaction); return true; }
  return false;
}

export async function handleParadiseInteraction(interaction) {
  return paradiseGuildContext.run(interaction.guildId || null, () => handleParadiseInteractionInner(interaction));
}
