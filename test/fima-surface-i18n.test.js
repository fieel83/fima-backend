import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { paradiseWebsiteApplicationTypesForMode } from "../src/paradise3a59.js";

const readPublic = path => fs.readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8");
const runtimeSource = readPublic("assets/js/fima-surface-i18n.js");
const applySource = readPublic("assets/js/paradise-apply.js");
const applyPage = readPublic("paradise-apply.html");
const studioSource = readPublic("assets/js/paradise-content-studio.js");
const studioPage = readPublic("paradise-content-studio.html");

test("shared surface localization runtime and both consumers parse", () => {
  assert.doesNotThrow(() => new vm.Script(runtimeSource, { filename: "fima-surface-i18n.js" }));
  assert.doesNotThrow(() => new vm.Script(applySource, { filename: "paradise-apply.js" }));
  assert.doesNotThrow(() => new vm.Script(studioSource, { filename: "paradise-content-studio.js" }));
});

test("language choice resolves from query, site, current or legacy storage and stays synchronized", () => {
  assert.match(runtimeSource, /new URLSearchParams\(location\.search\)\.get\("lang"\)/u);
  assert.match(runtimeSource, /const preferenceKey = "fimaUiLanguage"/u);
  assert.match(runtimeSource, /const legacyPreferenceKey = "paradiseUiLanguage"/u);
  assert.match(runtimeSource, /const sitePreferenceKey = "fima\.language"/u);
  assert.match(runtimeSource, /const siteManualPreferenceKey = "fima\.language\.manual"/u);
  assert.match(runtimeSource, /localStorage\.setItem\(preferenceKey, language\)/u);
  assert.match(runtimeSource, /localStorage\.setItem\(legacyPreferenceKey, language\)/u);
  assert.match(runtimeSource, /localStorage\.setItem\(sitePreferenceKey, language\)/u);
  assert.match(runtimeSource, /localStorage\.setItem\(siteManualPreferenceKey, "true"\)/u);
  assert.match(runtimeSource, /window\.addEventListener\("storage", storageListener\)/u);
  assert.match(runtimeSource, /document\.documentElement\.lang = language/u);
  assert.match(runtimeSource, /new CustomEvent\("fima:language-change"/u);
});

test("the two-language surfaces preserve a stored multilingual site preference", () => {
  assert.match(runtimeSource, /if \(supportedLanguages\.has\(siteLanguage\)\) return siteLanguage/u);
  assert.match(runtimeSource, /syncSite && \(!siteLanguage \|\| supportedLanguages\.has\(siteLanguage\)\)/u);
  assert.match(runtimeSource, /setLanguage\(language, \{ syncSite: false \}\)/u);
  assert.match(runtimeSource, /event\.key === sitePreferenceKey/u);
});

test("dynamic text, form attributes and metadata participate in translation", () => {
  assert.match(runtimeSource, /new MutationObserver/u);
  assert.match(runtimeSource, /characterData:\s*true/u);
  assert.match(runtimeSource, /attributeFilter:\s*\["placeholder", "title", "aria-label"\]/u);
  assert.match(runtimeSource, /document\.createTreeWalker/u);
  assert.match(runtimeSource, /meta\[name="description"\]/u);
  assert.match(runtimeSource, /activeController\?\.destroy\(\)/u);
});

test("Apply and Content Studio mount the shared runtime before their page logic", () => {
  for (const [name, page, sourceLocale] of [
    ["Apply", applyPage, "tr"],
    ["Content Studio", studioPage, "en"]
  ]) {
    assert.match(page, /id="fimaUiLanguage"/u, `${name} must expose the shared language selector`);
    const runtimeIndex = page.indexOf("/assets/js/fima-surface-i18n.js");
    const pageScriptIndex = page.indexOf(name === "Apply" ? "/assets/js/paradise-apply.js" : "/assets/js/paradise-content-studio.js");
    assert.ok(runtimeIndex >= 0 && pageScriptIndex > runtimeIndex, `${name} must load the runtime first`);
    const source = name === "Apply" ? applySource : studioSource;
    assert.match(source, new RegExp(`sourceLocale:\\s*"${sourceLocale}"`, "u"));
    assert.match(source, /metadata:\s*\{/u);
  }
  assert.match(applyPage, /<meta name="description"/u);
  assert.match(studioPage, /<meta name="description"/u);
});

test("Apply English localization covers static journey, status and review controls", () => {
  for (const [source, translation] of [
    ["STAFF + BUSINESS · AÇIK", "STAFF + BUSINESS · OPEN"],
    ["Gözden geçir ve onayla", "Review and confirm"],
    ["Sunucu, cevap ve kanıt metadata özeti", "Server, answers and evidence metadata summary"],
    [
      "Önce FIMA hesabına giriş yap. Ardından Discord hesabını bağlayıp sunucu üyeliğini doğrulayacağız.",
      "Sign in to your FIMA account first. Then connect Discord and we will verify your server membership."
    ],
    ["Başvuruyu gözden geçir", "Review application"]
  ]) {
    assert.match(applyPage + applySource, new RegExp(source.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.match(applySource, new RegExp(translation.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});

test("Apply English localization covers dynamic draft, evidence, access and submission states", () => {
  for (const [source, translation] of [
    [
      "Yerel taslak alanına erişilemedi; cevapların FIMA hesabınla eşitlenmeye çalışılıyor.",
      "Local draft storage is unavailable; we are still trying to sync your answers with your FIMA account."
    ],
    [
      "Başka bir cihazdaki daha yeni FIMA taslağı geri yüklendi; kanıt dosyalarını yeniden seçmelisin.",
      "A newer FIMA draft from another device was restored; select your evidence files again."
    ],
    [
      "FIMA hesabı taslak eşitlemesi şu anda kullanılamıyor; yerel kopya korunuyor ve başvuru göndermeyi engellemiyor.",
      "FIMA account draft sync is currently unavailable; the local copy is preserved and does not block submission."
    ],
    ["Zorunlu görsel kanıt alanlarından en az biri boş.", "At least one required visual-evidence field is empty."],
    ["Kanıt dosyası yalnızca PNG, JPG/JPEG veya WebP olabilir.", "Evidence files must be PNG, JPG/JPEG or WebP."],
    ["Önce Discord sunucusuna katıl", "Join the Discord server first"],
    ["Sunucu seç", "Select a server"],
    [
      "Başvuru servisi şu anda yüklenemedi. Biraz sonra tekrar dene.",
      "The application service could not be loaded. Try again shortly."
    ],
    [
      "Bir kanıt dosyasının uzantısı, MIME türü ve gerçek imzası eşleşmiyor.",
      "An evidence file's extension, MIME type and true signature do not match."
    ],
    [
      "Başvuru gönderilemedi. Alanları kontrol edip tekrar dene.",
      "The application could not be submitted. Check the fields and try again."
    ]
  ]) {
    assert.match(applySource, new RegExp(source.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.match(applySource, new RegExp(translation.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }

  assert.match(applySource, /Optional or required PNG, JPEG or WebP depending on the question:/u);
  assert.match(applySource, /Application received: \$\{match\[1\]\}/u);
  assert.match(applySource, /Evidence: \$\{match\[3\]\} scanned and accepted/u);
  assert.match(
    applySource,
    /new Date\(draft\.updatedAt\)\.toLocaleString\(activeLocale\(\)\)/u,
    "restored draft timestamps must follow the active interface locale"
  );
});

test("application discovery covers six visible families and the complete 21-type catalog", () => {
  for (const family of [
    "Community Staff",
    "Clan Operations",
    "Competitive / TSBTR",
    "Partnership",
    "Creator / Media",
    "Reseller / Affiliate"
  ]) {
    assert.match(applyPage, new RegExp(family.replace("/", "\\/"), "u"));
  }

  const types = new Set();
  for (const mode of ["community", "clan", "tsbtr"]) {
    for (const workflow of ["staff", "business"]) {
      for (const item of paradiseWebsiteApplicationTypesForMode(mode, workflow)) types.add(item.type);
    }
  }
  assert.equal(types.size, 21);
  assert.ok(types.has("video_team"));
  assert.ok(types.has("developer"));
  assert.match(applyPage, /Helper dahil hiçbir rol otomatik verilmez/u);
  assert.match(applyPage, /Clan ve Competitive \/ TSBTR public akışta kapalıdır/u);
  assert.match(applySource, /renderTypeCards\(context\.types\)/u);
  assert.doesNotMatch(applySource, /roles?\.add\(/u);
});

test("Content Studio keeps archive, webhook and guild mutations fail-closed", () => {
  assert.match(studioPage, /PUBLISH TEST CONTENT/u);
  assert.match(studioPage, /No webhook URL or token is accepted\./u);
  assert.match(studioPage, /Read-only archive import\./u);
  assert.match(studioSource, /const testPhrase = "PUBLISH TEST CONTENT"/u);
  assert.match(studioSource, /test_guild_only/u);
  assert.match(studioSource, /production_guild_mutation_blocked/u);
  assert.match(studioSource, /non_test_guild_mutation_blocked/u);
  assert.match(studioSource, /arbitrary_webhook_forbidden/u);
  assert.match(studioSource, /x-paradise-owner-action/u);
  assert.match(studioSource, /content_archive_backup_missing/u);
  assert.doesNotMatch(`${studioPage}\n${studioSource}`, /(?:webhookUrl|webhookToken|discordToken)\s*[:=]/iu);
});

test("localized Content Studio safety copy never weakens guarded publishing", () => {
  for (const copy of [
    "Production Discord değişikliği engellendi.",
    "Yalnızca izole test sunucusu değiştirilebilir.",
    "Keyfi webhook URL'leri ve tokenlar yasaktır.",
    "Salt okunur arşiv içe aktarımı."
  ]) {
    assert.match(studioSource, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});
