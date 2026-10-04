export const PARADISE_APPLICATION_TYPES = Object.freeze([
  "helper",
  "staff",
  "moderator",
  "support",
  "training_hoster",
  "tryout_hoster",
  "referee",
  "event_staff",
  "giveaway_staff",
  "content_creator",
  "video_team",
  "creative_team",
  "developer",
  "partnership",
  "clan_mainer",
  "fima_support",
  "macro_staff",
  "fflag_staff",
  "war_hoster",
  "creator",
  "reseller"
]);

const APPLICATION_TYPE_SET = new Set(PARADISE_APPLICATION_TYPES);
const EXTRA_QUESTION_LIMIT = 20;
const EVIDENCE_REQUIREMENT_LIMIT = 40;

function safeQuestionKey(value) {
  return String(value || "").replace(/[^a-z0-9_]/gi, "").toLowerCase().slice(0, 32);
}

function sanitizeQuestionLabels(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [rawKey, rawLabel] of Object.entries(value).slice(0, EXTRA_QUESTION_LIMIT)) {
    const key = safeQuestionKey(rawKey);
    const label = typeof rawLabel === "string" ? rawLabel.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    if (key && label && !(key in result)) result[key] = label;
  }
  return result;
}

export function sanitizeParadiseApplicationExtraQuestions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const nested = Object.values(value).some(item => item && typeof item === "object" && !Array.isArray(item));
  if (!nested) {
    const helper = sanitizeQuestionLabels(value);
    return Object.keys(helper).length ? { helper } : {};
  }

  const result = {};
  for (const [rawType, questions] of Object.entries(value)) {
    const type = String(rawType || "").toLowerCase();
    if (!APPLICATION_TYPE_SET.has(type)) continue;
    const bucket = sanitizeQuestionLabels(questions);
    if (Object.keys(bucket).length) result[type] = bucket;
  }
  return result;
}

export function sanitizeParadiseApplicationEvidenceRequirements(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [rawType, requirements] of Object.entries(value)) {
    const type = String(rawType || "").toLowerCase();
    if (!APPLICATION_TYPE_SET.has(type) || !requirements || typeof requirements !== "object" || Array.isArray(requirements)) continue;
    const bucket = {};
    for (const [rawKey, requirement] of Object.entries(requirements).slice(0, EVIDENCE_REQUIREMENT_LIMIT)) {
      const key = safeQuestionKey(rawKey);
      if (key && !(key in bucket)) bucket[key] = requirement === "required" ? "required" : "optional";
    }
    if (Object.keys(bucket).length) result[type] = bucket;
  }
  return result;
}

export function sanitizeParadiseApplicationSettings(value = {}, previous = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const existing = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
  return {
    ...existing,
    enabled: input.enabled !== false,
    cooldownDays: Math.min(365, Math.max(0, Number(input.cooldownDays) || 0)),
    autoGrantRole: input.autoGrantRole !== false,
    blockBlacklisted: input.blockBlacklisted !== false,
    panelTitle: String(input.panelTitle || "").trim().slice(0, 80),
    panelDescription: String(input.panelDescription || "").trim().slice(0, 1200),
    panelButtonLabel: String(input.panelButtonLabel || "").trim().slice(0, 40),
    extraQuestions: sanitizeParadiseApplicationExtraQuestions(input.extraQuestions),
    evidenceRequirements: sanitizeParadiseApplicationEvidenceRequirements(input.evidenceRequirements)
  };
}
