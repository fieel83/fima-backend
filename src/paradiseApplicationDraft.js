import crypto from "node:crypto";

export const PARADISE_APPLICATION_DRAFT_SCHEMA_VERSION = 1;
export const PARADISE_APPLICATION_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function draftError(code, statusCode = 400, details = {}) {
  return Object.assign(new Error(code), { code, statusCode, ...details });
}

export function normalizeParadiseApplicationDraftScope(input = {}) {
  const userId = String(input.userId || "").trim();
  const guildId = String(input.guildId || "").trim();
  const workflow = String(input.workflow || "staff").trim().toLowerCase();
  const type = String(input.type || "").trim().toLowerCase();

  if (!userId || userId.length > 160) throw draftError("invalid_application_draft_scope");
  if (!/^\d{16,22}$/.test(guildId)) throw draftError("invalid_application_draft_scope");
  if (!["staff", "business"].includes(workflow)) throw draftError("invalid_application_draft_scope");
  if (!/^[a-z][a-z0-9_]{0,47}$/.test(type)) throw draftError("invalid_application_draft_scope");
  return { userId, guildId, workflow, type };
}

export function paradiseApplicationDraftSettingKey(input = {}) {
  const scope = normalizeParadiseApplicationDraftScope(input);
  const digest = crypto
    .createHash("sha256")
    .update(`fima-paradise-application-draft-v1\0${scope.userId}\0${scope.guildId}\0${scope.workflow}\0${scope.type}`, "utf8")
    .digest("hex");
  return `paradise_application_draft_v1_${digest}`;
}

export function normalizeParadiseApplicationDraftAnswers(answers, questions = []) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw draftError("invalid_application_draft_answers");
  }
  const definitions = new Map(
    questions
      .filter(question => question && typeof question === "object")
      .map(question => [String(question.key || ""), question])
      .filter(([key]) => key)
  );
  const normalized = {};
  for (const [key, value] of Object.entries(answers)) {
    const question = definitions.get(key);
    if (!question || typeof value !== "string") {
      throw draftError("invalid_application_draft_answer", 400, { question: key || null });
    }
    const max = Math.max(1, Math.min(4_000, Number(question.max) || 1_000));
    if (value.length > max) {
      throw draftError("invalid_application_draft_answer", 400, { question: key });
    }
    normalized[key] = value;
  }
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > 32 * 1024) {
    throw draftError("application_draft_too_large", 413);
  }
  return normalized;
}

export function normalizeParadiseApplicationDraftRecord(value, { scope, questions = [], now = new Date() } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const normalizedScope = normalizeParadiseApplicationDraftScope(scope);
  if (value.schemaVersion !== PARADISE_APPLICATION_DRAFT_SCHEMA_VERSION) return null;
  if (
    value.guildId !== normalizedScope.guildId
    || value.workflow !== normalizedScope.workflow
    || value.type !== normalizedScope.type
  ) return null;

  const revision = Number(value.revision);
  const updatedAt = new Date(value.updatedAt);
  const expiresAt = new Date(value.expiresAt);
  if (!Number.isSafeInteger(revision) || revision < 1) return null;
  if (!Number.isFinite(updatedAt.getTime()) || !Number.isFinite(expiresAt.getTime())) return null;
  if (expiresAt.getTime() <= now.getTime()) return null;

  let answers;
  try {
    answers = normalizeParadiseApplicationDraftAnswers(value.answers, questions);
  } catch {
    return null;
  }
  return {
    schemaVersion: PARADISE_APPLICATION_DRAFT_SCHEMA_VERSION,
    guildId: normalizedScope.guildId,
    workflow: normalizedScope.workflow,
    type: normalizedScope.type,
    answers,
    revision,
    updatedAt: updatedAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  };
}

export function buildParadiseApplicationDraftRecord({
  scope,
  answers,
  questions = [],
  current = null,
  expectedRevision = 0,
  now = new Date()
} = {}) {
  const normalizedScope = normalizeParadiseApplicationDraftScope(scope);
  const normalizedCurrent = normalizeParadiseApplicationDraftRecord(current, {
    scope: normalizedScope,
    questions,
    now
  });
  const normalizedExpectedRevision = Number(expectedRevision);
  if (!Number.isSafeInteger(normalizedExpectedRevision) || normalizedExpectedRevision < 0) {
    throw draftError("invalid_application_draft_revision");
  }
  const currentRevision = normalizedCurrent?.revision || 0;
  if (normalizedExpectedRevision !== currentRevision) {
    throw draftError("application_draft_conflict", 409, { currentDraft: normalizedCurrent });
  }

  const updatedAt = new Date(now);
  if (!Number.isFinite(updatedAt.getTime())) throw draftError("invalid_application_draft_timestamp");
  return {
    schemaVersion: PARADISE_APPLICATION_DRAFT_SCHEMA_VERSION,
    guildId: normalizedScope.guildId,
    workflow: normalizedScope.workflow,
    type: normalizedScope.type,
    answers: normalizeParadiseApplicationDraftAnswers(answers, questions),
    revision: currentRevision + 1,
    updatedAt: updatedAt.toISOString(),
    expiresAt: new Date(updatedAt.getTime() + PARADISE_APPLICATION_DRAFT_TTL_MS).toISOString()
  };
}
