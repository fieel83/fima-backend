const DEFAULT_TIMEOUT_MS = 1800;
const DEFAULT_MIN_CONFIDENCE = 0.78;

export const FIMA_APPROVED_KNOWLEDGE = Object.freeze([
  Object.freeze({
    id: "download.official",
    title: "Official download",
    summary: "Use fimamacro.com/download and verify hashes on the security page.",
    keywords: ["download", "install", "installer", "setup", "hash", "official"]
  }),
  Object.freeze({
    id: "security.no-secrets",
    title: "No cookie/token/password stealing",
    summary: "Fima never asks for Roblox cookies, Discord tokens or browser passwords.",
    keywords: ["cookie", "token", "password", "security", "safe", "virus", "crack", "inject"]
  }),
  Object.freeze({
    id: "license.hwid",
    title: "License and HWID",
    summary: "Keys bind to an account/device after activation. HWID help belongs in a private ticket with masked details.",
    keywords: ["license", "licence", "key", "hwid", "device", "activation", "reset"]
  }),
  Object.freeze({
    id: "pricing.activity-rewards",
    title: "Paid pricing, gifts, Activity Rewards and Booster Rewards",
    summary: "Current paid plans and gifts live on fimamacro.com. New universal trials are unavailable; old trial records remain readable until expiry. Each month, separate text and voice Top 3 Activity Rewards grant 15/10/7 days and stack. Each verified active server boost adds 3 days for that UTC month and also stacks. The Discord account must be linked to FIMA for reward delivery. Payment, Robux order, boost evidence and license status must be verified; never invent them.",
    keywords: ["price", "pricing", "payment", "paid", "order", "robux", "trial", "gift", "refund", "boost", "booster", "leaderboard", "reward"]
  }),
  Object.freeze({
    id: "setup.basics",
    title: "App setup basics",
    summary: "Choose language, set sensitivity/MS, configure screen, assign a bind, then test safely.",
    keywords: ["sensitivity", "screen", "bind", "macro", "configure", "configuration", "setup"]
  }),
  Object.freeze({
    id: "fpsms.honesty",
    title: "FPS/MS source",
    summary: "Fima labels values exact, estimated or unavailable and does not read Roblox panels as source.",
    keywords: ["fps", "ms", "ping", "latency", "estimate", "timing"]
  }),
  Object.freeze({
    id: "community.training",
    title: "Training and events",
    summary: "Fima training queues are community practice/support systems, not clan membership requirements.",
    keywords: ["training", "event", "practice", "queue", "clan"]
  }),
  Object.freeze({
    id: "oldtgmacro.proof",
    title: "Old TGMacro proof",
    summary: "Old TGMacro buyer proof belongs in a private ticket. Staff can review masked proof manually.",
    keywords: ["tgmacro", "proof", "buyer", "old"]
  }),
  Object.freeze({
    id: "support.escalate",
    title: "Escalation",
    summary: "If the bot is unsure, it should open or escalate a ticket for staff.",
    keywords: ["support", "staff", "ticket", "help", "unknown"]
  })
]);

const KNOWLEDGE_BY_ID = new Map(FIMA_APPROVED_KNOWLEDGE.map((item) => [item.id, item]));
const RISKY_QUESTION = /\b(crack|bypass|injector|inject|cookie|token|stolen|steal|fake file|decompile|patch)\b/i;
const COMMERCIAL_OR_ACCOUNT = /\b(payment|paid|refund|charge|invoice|order|robux|license|licence|key|hwid|account|activation)\b/i;
const UNVERIFIED_OPERATION_CLAIM = /\b(payment (?:has been |was |is )?(?:received|verified|confirmed)|refund (?:has been |was |is )?(?:issued|approved|sent)|order (?:has been |was |is )?(?:paid|complete|completed|approved)|license (?:has been |is |was )?(?:active|activated|valid|approved)|key (?:has been |was |is )?(?:generated|activated|valid)|hwid (?:has been |was |is )?(?:reset|changed)|(?:i|we) (?:have )?(?:refunded|activated|approved|reset|changed|completed|verified))\b/i;
const UNVERIFIED_OPERATION_CLAIM_TR = /(?:ödeme(?:n|niz|si|nizi|nızı)?(?:\s+başarıyla)?\s+(?:alındı|onaylandı|doğrulandı|tamamlandı|aldık)|[iİ]ade(?:n|niz|si|nizi|nızı)?(?:\s+başarıyla)?\s+(?:yapıldı|onaylandı|gönderildi|tamamlandı|ettik)|sipariş(?:in|iniz|i)?\s+(?:ödendi|tamamlandı|onaylandı)|lisans(?:ın|ınız|in|iniz|ı|i)?\s+(?:aktif|etkin|geçerli|onaylandı|aktifleştirildi|etkinleştirildi|aktive edildi)|anahtar(?:ın|ınız|in|iniz|ı|i)?\s+(?:oluşturuldu|etkinleştirildi|aktifleştirildi|geçerli)|hwid(?:'in|'iniz|in|iniz)?\s+(?:sıfırlandı|değiştirildi)|(?:[iİ]ade|lisans|ödeme|sipariş|anahtar|hwid)(?:nizi|ınızı|inizi|ı|i)?\s+(?:onayladık|doğruladık|aktifleştirdik|sıfırladık|değiştirdik|tamamladık))/iu;
const SECRET_PATTERNS = [
  /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+/gi,
  /\b(?:mfa\.)?[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/g,
  /\b[A-Fa-f0-9]{32,}\b/g,
  /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g
];

function cleanText(value, maxLength = 1800) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "::1" || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function resolveAdapterBaseUrl(value = process.env.FIMA_AI_ADAPTER_URL) {
  const raw = String(value || "").trim();
  if (!raw) return { url: null, configured: false, reason: "adapter_not_configured" };
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return { url: null, configured: true, reason: "adapter_url_invalid" };
    }
    if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) {
      return { url: null, configured: true, reason: "adapter_url_insecure" };
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return { url: url.toString().replace(/\/$/, ""), configured: true, reason: null };
  } catch {
    return { url: null, configured: true, reason: "adapter_url_invalid" };
  }
}

export function redactFimaSupportText(value) {
  let output = cleanText(value);
  for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, "[REDACTED]");
  output = output.replace(/\b(?:license|licence|key|token|password|cookie|secret|hwid)\s*[:=]\s*\S+/gi, (match) => `${match.split(/[:=]/, 1)[0]}: [REDACTED]`);
  return output;
}

export function matchApprovedKnowledge(question, { limit = 4 } = {}) {
  const text = cleanText(question).toLowerCase();
  const words = new Set(text.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2));
  const scored = FIMA_APPROVED_KNOWLEDGE
    .filter((item) => item.id !== "support.escalate")
    .map((item) => ({
      item,
      score: item.keywords.reduce((total, keyword) => total + (text.includes(keyword) || words.has(keyword) ? 1 : 0), 0)
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id))
    .slice(0, Math.max(1, Math.min(4, Number(limit) || 4)))
    .map(({ item }) => item);
  return scored;
}

function selectedKnowledge(question) {
  const risky = RISKY_QUESTION.test(String(question || ""));
  if (risky) {
    return {
      risky,
      selected: [KNOWLEDGE_BY_ID.get("security.no-secrets"), KNOWLEDGE_BY_ID.get("download.official")].filter(Boolean)
    };
  }
  const matches = matchApprovedKnowledge(question);
  return {
    risky,
    selected: matches.length ? matches : [KNOWLEDGE_BY_ID.get("support.escalate")].filter(Boolean)
  };
}

function fallbackAnswer(question, { reason = "offline" } = {}) {
  const { risky, selected } = selectedKnowledge(question);
  const commercialOrAccount = COMMERCIAL_OR_ACCOUNT.test(String(question || ""));
  return {
    source: "approved_knowledge_fallback",
    confidence: risky || selected[0]?.id !== "support.escalate" ? 1 : 0,
    risky,
    escalation: commercialOrAccount || selected[0]?.id === "support.escalate",
    reason,
    title: risky ? "Fima safety answer" : "Fima support answer",
    description: risky
      ? "I can help with safe Fima support only. Do not use cracked files, bypasses, injectors, cookies or token-based instructions."
      : commercialOrAccount
        ? "Here is the approved general guidance. Account, payment, order, license and HWID status must be verified by staff in a private ticket."
        : "This answer uses only the approved Fima knowledge base. If it does not solve the issue, open a private support ticket.",
    fields: selected.map((item) => ({ name: `${item.id} - ${item.title}`, value: item.summary, inline: false })),
    matchedIds: selected.map((item) => item.id)
  };
}

function normalizedTimeoutMs(value) {
  const numeric = Number(value);
  return Math.max(50, Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_TIMEOUT_MS);
}

async function fetchJsonWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("FIMA AI adapter request timed out");
      error.name = "AbortError";
      controller.abort(error);
      reject(error);
    }, normalizedTimeoutMs(timeoutMs));
  });
  const request = (async () => {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response?.ok) return { response, body: null, jsonError: null };
    try {
      return { response, body: await response.json(), jsonError: null };
    } catch (jsonError) {
      return { response, body: null, jsonError };
    }
  })();
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function fimaAiHealth({
  baseUrl,
  token = process.env.FIMA_AI_ADAPTER_TOKEN,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const adapter = resolveAdapterBaseUrl(baseUrl);
  if (!adapter.url) return { status: "offline", configured: adapter.configured, reason: adapter.reason };
  if (typeof fetchImpl !== "function") return { status: "offline", configured: true, reason: "fetch_unavailable" };
  const startedAt = Date.now();
  try {
    const { response, body, jsonError } = await fetchJsonWithTimeout(fetchImpl, `${adapter.url}/health`, {
      method: "GET",
      headers: {
        accept: "application/json",
        ...(token ? { authorization: `Bearer ${String(token).trim()}` } : {})
      }
    }, timeoutMs);
    if (!response.ok) return { status: "degraded", configured: true, reason: `http_${response.status}`, latencyMs: Date.now() - startedAt };
    if (jsonError) return { status: "degraded", configured: true, reason: "invalid_json", latencyMs: Date.now() - startedAt };
    const hasModelReady = body && typeof body === "object" && Object.hasOwn(body, "modelReady");
    const serviceHealthy = body?.status === "ready" || body?.status === "ok" || body?.healthy === true;
    const modelReady = body?.modelReady === true || (!hasModelReady && body?.status === "ready");
    const ready = serviceHealthy && modelReady;
    return {
      status: ready ? "ready" : "degraded",
      configured: true,
      modelReady,
      ...(ready ? {} : { reason: serviceHealthy ? "model_not_ready" : "adapter_not_healthy" }),
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      status: "offline",
      configured: true,
      reason: error?.name === "AbortError" ? "timeout" : "request_failed",
      latencyMs: Date.now() - startedAt
    };
  }
}

function validatedRemoteAnswer(body, selectedIds, minConfidence) {
  const answer = cleanText(body?.answer, 1500);
  const confidence = Number(body?.confidence);
  const citations = Array.isArray(body?.knowledgeIds)
    ? [...new Set(body.knowledgeIds.map((id) => cleanText(id, 80)).filter(Boolean))]
    : [];
  if (!answer || !Number.isFinite(confidence) || confidence < minConfidence || confidence > 1) return null;
  if (!citations.length || citations.some((id) => !selectedIds.includes(id))) return null;
  if (UNVERIFIED_OPERATION_CLAIM.test(answer) || UNVERIFIED_OPERATION_CLAIM_TR.test(answer)) return null;
  const redacted = redactFimaSupportText(answer);
  if (redacted.includes("[REDACTED]")) return null;
  return { answer: redacted, confidence, citations };
}

export async function answerFimaSupportQuestion(question, {
  baseUrl,
  token = process.env.FIMA_AI_ADAPTER_TOKEN,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  minConfidence = DEFAULT_MIN_CONFIDENCE
} = {}) {
  const sanitizedQuestion = redactFimaSupportText(question).slice(0, 1000);
  const fallback = fallbackAnswer(sanitizedQuestion);
  const adapter = resolveAdapterBaseUrl(baseUrl);
  if (!adapter.url) return { ...fallback, reason: adapter.reason };
  if (typeof fetchImpl !== "function") return { ...fallback, reason: "adapter_fetch_unavailable" };

  const selected = fallback.matchedIds.map((id) => KNOWLEDGE_BY_ID.get(id)).filter(Boolean);
  try {
    const { response, body, jsonError } = await fetchJsonWithTimeout(fetchImpl, `${adapter.url}/v1/support/answer`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${String(token).trim()}` } : {})
      },
      body: JSON.stringify({
        question: sanitizedQuestion,
        policy: {
          approvedKnowledgeOnly: true,
          noTransactionOrLicenseStatusClaims: true,
          escalateWhenUncertain: true
        },
        knowledge: selected.map(({ id, title, summary }) => ({ id, title, summary }))
      })
    }, timeoutMs);
    if (!response.ok) return { ...fallback, reason: `adapter_http_${response.status}` };
    if (jsonError) return { ...fallback, reason: "adapter_invalid_json" };
    const validated = validatedRemoteAnswer(body, fallback.matchedIds, Math.max(0, Math.min(1, Number(minConfidence) || DEFAULT_MIN_CONFIDENCE)));
    if (!validated) return { ...fallback, reason: "adapter_answer_rejected" };
    const commercialOrAccount = COMMERCIAL_OR_ACCOUNT.test(sanitizedQuestion);
    return {
      ...fallback,
      source: "fima_ai_adapter",
      reason: null,
      confidence: validated.confidence,
      escalation: fallback.escalation || commercialOrAccount,
      description: commercialOrAccount
        ? `${validated.answer}\n\nAccount, payment, order, license and HWID status still requires staff verification in a private ticket.`
        : validated.answer,
      matchedIds: validated.citations
    };
  } catch (error) {
    return { ...fallback, reason: error?.name === "AbortError" ? "adapter_timeout" : "adapter_request_failed" };
  }
}
