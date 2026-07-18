import test from "node:test";
import assert from "node:assert/strict";
import {
  answerFimaSupportQuestion,
  fimaAiHealth,
  matchApprovedKnowledge,
  redactFimaSupportText
} from "../src/fimaAiAdapter.js";

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("redacts secrets and personal identifiers before adapter use", () => {
  const redacted = redactFimaSupportText("email me at user@example.com key=ABCDEF0123456789ABCDEF0123456789");
  assert.doesNotMatch(redacted, /user@example\.com/);
  assert.doesNotMatch(redacted, /ABCDEF0123456789ABCDEF0123456789/);
  assert.match(redacted, /\[REDACTED\]/);
});

test("matches only approved knowledge records", () => {
  const records = matchApprovedKnowledge("How can I reset the HWID on my license key?");
  assert.equal(records[0]?.id, "license.hwid");
  assert.ok(records.every((record) => typeof record.summary === "string" && record.id));
});

test("owner-independent offline fallback does not claim payment or license status", async () => {
  const answer = await answerFimaSupportQuestion("Was my payment received and is my license active?", { baseUrl: "" });
  assert.equal(answer.source, "approved_knowledge_fallback");
  assert.equal(answer.escalation, true);
  assert.match(answer.description, /must be verified by staff/i);
  assert.ok(answer.matchedIds.includes("pricing.trial") || answer.matchedIds.includes("license.hwid"));
});

test("adapter receives redacted question and only selected approved knowledge", async () => {
  let requestBody = null;
  const answer = await answerFimaSupportQuestion("Where is setup? email user@example.com", {
    baseUrl: "https://adapter.example.test",
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return jsonResponse({
        answer: "Use the approved setup and official download guidance.",
        confidence: 0.91,
        knowledgeIds: ["setup.basics", "download.official"]
      });
    }
  });
  assert.equal(answer.source, "fima_ai_adapter");
  assert.doesNotMatch(requestBody.question, /user@example\.com/);
  assert.equal(requestBody.policy.approvedKnowledgeOnly, true);
  assert.deepEqual(new Set(requestBody.knowledge.map((item) => item.id)), new Set(answer.matchedIds));
});

test("rejects low confidence, unapproved citations, and unverifiable operation claims", async (t) => {
  await t.test("low confidence", async () => {
    const answer = await answerFimaSupportQuestion("download setup", {
      baseUrl: "https://adapter.example.test",
      fetchImpl: async () => jsonResponse({ answer: "Maybe use it.", confidence: 0.2, knowledgeIds: ["download.official"] })
    });
    assert.equal(answer.source, "approved_knowledge_fallback");
    assert.equal(answer.reason, "adapter_answer_rejected");
  });
  await t.test("unapproved citation", async () => {
    const answer = await answerFimaSupportQuestion("download setup", {
      baseUrl: "https://adapter.example.test",
      fetchImpl: async () => jsonResponse({ answer: "Use a secret source.", confidence: 0.99, knowledgeIds: ["invented.source"] })
    });
    assert.equal(answer.source, "approved_knowledge_fallback");
  });
  await t.test("operation claim", async () => {
    const answer = await answerFimaSupportQuestion("license key", {
      baseUrl: "https://adapter.example.test",
      fetchImpl: async () => jsonResponse({ answer: "Your license is active.", confidence: 0.99, knowledgeIds: ["license.hwid"] })
    });
    assert.equal(answer.source, "approved_knowledge_fallback");
    assert.match(answer.description, /staff/i);
  });
  for (const claim of ["Ödemen alındı.", "Lisansın aktif.", "İaden yapıldı."]) {
    await t.test(`Turkish operation claim: ${claim}`, async () => {
      const answer = await answerFimaSupportQuestion("payment refund license key", {
        baseUrl: "https://adapter.example.test",
        fetchImpl: async () => jsonResponse({ answer: claim, confidence: 0.99, knowledgeIds: ["pricing.trial"] })
      });
      assert.equal(answer.source, "approved_knowledge_fallback");
      assert.equal(answer.reason, "adapter_answer_rejected");
    });
  }
});

test("rejects insecure remote adapter URLs while allowing loopback HTTP", async () => {
  let remoteFetchCalled = false;
  const insecureHealth = await fimaAiHealth({
    baseUrl: "http://adapter.example.test",
    fetchImpl: async () => {
      remoteFetchCalled = true;
      return jsonResponse({ status: "ready", modelReady: true });
    }
  });
  assert.deepEqual(insecureHealth, { status: "offline", configured: true, reason: "adapter_url_insecure" });
  assert.equal(remoteFetchCalled, false);

  const insecureAnswer = await answerFimaSupportQuestion("download", {
    baseUrl: "http://adapter.example.test",
    fetchImpl: async () => {
      remoteFetchCalled = true;
      return jsonResponse({ answer: "Official download guidance.", confidence: 1, knowledgeIds: ["download.official"] });
    }
  });
  assert.equal(insecureAnswer.source, "approved_knowledge_fallback");
  assert.equal(insecureAnswer.reason, "adapter_url_insecure");
  assert.equal(remoteFetchCalled, false);

  const loopbackHealth = await fimaAiHealth({
    baseUrl: "http://127.0.0.1:8787",
    fetchImpl: async () => jsonResponse({ status: "ready", modelReady: true })
  });
  assert.equal(loopbackHealth.status, "ready");
});

test("applies one timeout to connection and JSON body consumption", async (t) => {
  await t.test("stalled request", async () => {
    const answer = await answerFimaSupportQuestion("download", {
      baseUrl: "https://adapter.example.test",
      timeoutMs: 60,
      fetchImpl: async (_url, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      })
    });
    assert.equal(answer.source, "approved_knowledge_fallback");
    assert.equal(answer.reason, "adapter_timeout");
  });

  await t.test("stalled JSON body", async () => {
    const answer = await answerFimaSupportQuestion("download", {
      baseUrl: "https://adapter.example.test",
      timeoutMs: 60,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => new Promise(() => {}) })
    });
    assert.equal(answer.source, "approved_knowledge_fallback");
    assert.equal(answer.reason, "adapter_timeout");
  });
});

test("reports malformed JSON without treating the worker as healthy", async () => {
  const invalidResponse = () => ({
    ok: true,
    status: 200,
    json: async () => { throw new SyntaxError("invalid JSON"); }
  });
  const health = await fimaAiHealth({
    baseUrl: "https://adapter.example.test",
    fetchImpl: invalidResponse
  });
  assert.equal(health.status, "degraded");
  assert.equal(health.reason, "invalid_json");

  const answer = await answerFimaSupportQuestion("download", {
    baseUrl: "https://adapter.example.test",
    fetchImpl: invalidResponse
  });
  assert.equal(answer.source, "approved_knowledge_fallback");
  assert.equal(answer.reason, "adapter_invalid_json");
});

test("health reports ready, degraded, and unconfigured states without exposing URL", async () => {
  let authorization = null;
  const ready = await fimaAiHealth({
    baseUrl: "https://adapter.example.test",
    token: "health-token",
    fetchImpl: async (_url, init) => {
      authorization = init.headers.authorization;
      return jsonResponse({ status: "ready", modelReady: true });
    }
  });
  assert.equal(ready.status, "ready");
  assert.equal(ready.modelReady, true);
  assert.equal(authorization, "Bearer health-token");
  assert.equal(Object.hasOwn(ready, "url"), false);

  const modelNotReady = await fimaAiHealth({
    baseUrl: "https://adapter.example.test",
    fetchImpl: async () => jsonResponse({ status: "ready", modelReady: false })
  });
  assert.equal(modelNotReady.status, "degraded");
  assert.equal(modelNotReady.modelReady, false);
  assert.equal(modelNotReady.reason, "model_not_ready");

  const degraded = await fimaAiHealth({
    baseUrl: "https://adapter.example.test",
    fetchImpl: async () => jsonResponse({}, { status: 503 })
  });
  assert.equal(degraded.status, "degraded");

  const offline = await fimaAiHealth({ baseUrl: "" });
  assert.deepEqual(offline, { status: "offline", configured: false, reason: "adapter_not_configured" });
});
