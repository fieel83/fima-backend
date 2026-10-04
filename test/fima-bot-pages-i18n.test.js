import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const readPublic = path => fs.readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8");
const source = readPublic("assets/js/fima-bot-pages-i18n.js");
const pageNames = ["commands", "invite", "premium", "feedback"];
const pages = Object.fromEntries(pageNames.map(name => [name, readPublic(`fima-bot-${name}.html`)]));

function mountedOptions(surface) {
  let options = null;
  const context = {
    document: { body: { dataset: { fimaSurface: surface } } },
    window: { FimaSurfaceI18n: { mount(value) { options = value; } } }
  };
  vm.runInNewContext(source, context, { filename: "fima-bot-pages-i18n.js" });
  return options;
}

test("the shared FIMA Bot page localization consumer parses and mounts all four surfaces", () => {
  assert.doesNotThrow(() => new vm.Script(source, { filename: "fima-bot-pages-i18n.js" }));
  for (const surface of pageNames) {
    const options = mountedOptions(surface);
    assert.equal(options?.sourceLocale, "tr", `${surface} must localize from its Turkish source`);
    assert.equal(typeof options?.translations, "object");
    assert.match(options?.metadata?.en?.title || "", /FIMA Bot/u);
    assert.ok(options?.metadata?.en?.description);
  }
});

test("all four pages expose the shared selector and load localization in dependency order", () => {
  for (const [surface, page] of Object.entries(pages)) {
    assert.match(page, /id="fimaUiLanguage"/u, `${surface} must expose the language selector`);
    assert.match(page, /<option value="tr">Türkçe<\/option>/u);
    assert.match(page, /<option value="en">English<\/option>/u);
    const runtimeIndex = page.indexOf("/assets/js/fima-surface-i18n.js");
    const consumerIndex = page.indexOf("/assets/js/fima-bot-pages-i18n.js");
    assert.ok(runtimeIndex >= 0 && consumerIndex > runtimeIndex, `${surface} must load the runtime before the consumer`);
    if (surface === "commands" || surface === "invite") {
      assert.ok(page.indexOf(`/assets/js/fima-bot-${surface}.js`) > consumerIndex, `${surface} must localize before its functional module`);
    }
  }
});

test("page localization covers representative navigation, page and dynamic states", () => {
  const cases = {
    commands: [
      ["Komut veya özellik ara…", "Search for a command or feature…"],
      ["Bu aramayla eşleşen komut bulunamadı.", "No commands match this search."],
      ["Yetki her çalıştırmada kontrol edilir.", "Permissions are checked on every run."]
    ],
    invite: [
      ["Discord kurulum bağlantısı şu anda hazır değil. Daha sonra yeniden dene veya FIMA desteğe ulaş.", "The Discord setup link is not available right now. Try again later or contact FIMA support."],
      ["Discord’a devam et", "Continue to Discord"]
    ],
    premium: [
      ["Bu sayfa ödeme veya abonelik oluşturmaz.", null],
      ["Henüz kullanılamıyor", "Not available yet"]
    ],
    feedback: [
      ["Asla paylaşma:", "Never share:"],
      ["Güvenlik bildirimi", "Security report"]
    ]
  };

  for (const [surface, pairs] of Object.entries(cases)) {
    const options = mountedOptions(surface);
    for (const [turkish, english] of pairs) {
      assert.match(pages[surface], new RegExp(turkish.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
      if (english) assert.equal(options.translations[turkish], english);
      else assert.ok(Object.keys(options.translations).some(key => key.includes(turkish)), `${surface} must preserve the no-payment guarantee`);
    }
  }
});

test("every visible Turkish source string has an English mapping", () => {
  const turkishMarkers = /[çğıöşüÇĞİÖŞÜ]|\b(?:alt|ara|başlangıç|başvuru|destek|dahil|doğru|ekip|gizlilik|güvenlik|güvenli|henüz|işlem|kullanıcı|kurulum|mevcut|planlanıyor|sunucu|tümü|üye|yetki)\b/iu;
  for (const [surface, page] of Object.entries(pages)) {
    const body = page.slice(page.indexOf("<body"));
    const visibleSources = [];
    for (const match of body.matchAll(/>([^<>]+)</gu)) {
      const value = match[1].replace(/\s+/gu, " ").trim();
      if (value) visibleSources.push(value);
    }
    for (const match of body.matchAll(/(?:placeholder|aria-label|title)="([^"]+)"/gu)) visibleSources.push(match[1]);

    const translations = mountedOptions(surface).translations;
    const missing = [...new Set(visibleSources.filter(value => turkishMarkers.test(value) && value !== "Türkçe" && !Object.hasOwn(translations, value)))];
    assert.deepEqual(missing, [], `${surface} has visible Turkish source copy without an English mapping`);
  }
});

test("English safety copy keeps secret, authorization and payment boundaries explicit", () => {
  const invite = mountedOptions("invite").translations;
  assert.match(invite["Discord’a geçmeden önce kurulum adımlarını ve istenen erişimi burada görebilirsin. FIMA hiçbir zaman senden bot tokeni, parola, 2FA kodu veya security key bilgisi istemez."], /never ask.*bot token.*password.*2FA code.*security-key/iu);

  const premium = mountedOptions("premium").translations;
  assert.match(premium["Plan yükseltmesi yalnız doğrulanmış FIMA hesabı ve açık kullanıcı onayıyla başlatılır. Bu sayfa ödeme veya abonelik oluşturmaz."], /verified FIMA account.*explicit user approval.*does not create a payment or subscription/iu);

  const feedback = mountedOptions("feedback").translations;
  assert.match(feedback["bot tokenı, API anahtarı, parola, 2FA kodu, session cookie veya security key parolası."], /bot token.*API key.*password.*2FA code.*session cookie.*security-key password/iu);
});

test("unknown surfaces fail closed without mounting an unrelated dictionary", () => {
  assert.equal(mountedOptions("unknown"), null);
});
