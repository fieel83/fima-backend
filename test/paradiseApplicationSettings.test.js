import test from "node:test";
import assert from "node:assert/strict";
import {
  PARADISE_APPLICATION_TYPES,
  sanitizeParadiseApplicationEvidenceRequirements,
  sanitizeParadiseApplicationExtraQuestions,
  sanitizeParadiseApplicationSettings
} from "../src/paradiseApplicationSettings.js";
import { FIMA_BOT_APPLICATION_ROUTES } from "../src/fimaBotApplicationRoute.js";

test("application settings expose the complete safe type registry", () => {
  for (const type of [
    "helper", "partnership", "creator", "reseller", "clan_mainer", "training_hoster",
    "content_creator", "video_team", "creative_team", "developer"
  ]) {
    assert.ok(PARADISE_APPLICATION_TYPES.includes(type));
  }
});

test("every public application route has a configurable settings bucket", () => {
  for (const route of Object.values(FIMA_BOT_APPLICATION_ROUTES)) {
    assert.ok(
      PARADISE_APPLICATION_TYPES.includes(route.type),
      `${route.type} is public but missing from the settings registry`
    );
  }
});

test("legacy flat questions migrate only into the Helper bucket", () => {
  assert.deepEqual(sanitizeParadiseApplicationExtraQuestions({ motivation_extra: "  Neden katılmak istiyorsun?  " }), {
    helper: { motivation_extra: "Neden katılmak istiyorsun?" }
  });
});

test("nested application questions retain safe type buckets and reject unknown types", () => {
  assert.deepEqual(sanitizeParadiseApplicationExtraQuestions({
    helper: { custom_helper: "Helper sorusu" },
    creator: { audience: "Hedef kitlen nedir?" },
    reseller: { sales_plan: "Satış planını açıkla" },
    video_team: { reel: "Portfolyo bağlantını paylaş" },
    creative_team: { portfolio: "Tasarım portfolyonu paylaş" },
    developer: { repository: "Doğrulanabilir bir proje paylaş" },
    owner: { secret: "Yetkisiz soru" }
  }), {
    helper: { custom_helper: "Helper sorusu" },
    creator: { audience: "Hedef kitlen nedir?" },
    reseller: { sales_plan: "Satış planını açıkla" },
    video_team: { reel: "Portfolyo bağlantını paylaş" },
    creative_team: { portfolio: "Tasarım portfolyonu paylaş" },
    developer: { repository: "Doğrulanabilir bir proje paylaş" }
  });
});

test("application question sanitizer enforces key, label and per-type limits", () => {
  const questions = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [
    `question-${index}`,
    ` Question ${index} ${"x".repeat(220)} `
  ]));
  const result = sanitizeParadiseApplicationExtraQuestions({ creator: questions });
  assert.equal(Object.keys(result.creator).length, 20);
  assert.ok(Object.keys(result.creator).every(key => key.length <= 32 && /^[a-z0-9_]+$/i.test(key)));
  assert.ok(Object.values(result.creator).every(label => label.length <= 180));
});

test("application question keys are case-insensitive and keep only the first normalized key", () => {
  assert.deepEqual(sanitizeParadiseApplicationExtraQuestions({
    creator: {
      Audience: "Hedef kitlen nedir?",
      AUDIENCE: "Aynı anahtarın ikinci sürümü",
      "Sales-Plan": "Satış planını açıkla"
    }
  }), {
    creator: {
      audience: "Hedef kitlen nedir?",
      salesplan: "Satış planını açıkla"
    }
  });
});

test("evidence settings accept only registered application types", () => {
  assert.deepEqual(sanitizeParadiseApplicationEvidenceRequirements({
    partnership: { portfolio: "required", optional_note: "anything" },
    video_team: { reel: "required" },
    creative_team: { portfolio: "required", style_notes: "optional" },
    developer: { repository: "optional" },
    unknown: { secret: "required" }
  }), {
    partnership: { portfolio: "required", optional_note: "optional" },
    video_team: { reel: "required" },
    creative_team: { portfolio: "required", style_notes: "optional" },
    developer: { repository: "optional" }
  });
});

test("application settings preserve unrelated mappings while sanitizing form data", () => {
  const result = sanitizeParadiseApplicationSettings({
    enabled: true,
    cooldownDays: 900,
    extraQuestions: { creator: { audience: "Hedef kitlen nedir?" } },
    evidenceRequirements: { creator: { audience: "required" } }
  }, {
    roleMappings: { helper: "Helper" },
    reviewChannelId: "configured-channel"
  });
  assert.equal(result.cooldownDays, 365);
  assert.deepEqual(result.roleMappings, { helper: "Helper" });
  assert.equal(result.reviewChannelId, "configured-channel");
  assert.equal(result.extraQuestions.creator.audience, "Hedef kitlen nedir?");
  assert.equal(result.evidenceRequirements.creator.audience, "required");
});
