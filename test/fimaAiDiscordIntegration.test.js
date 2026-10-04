import test from "node:test";
import assert from "node:assert/strict";
import { handleFimaAiSupportInteraction } from "../src/discordBot.js";

function interactionFor(question) {
  const replies = [];
  return {
    interaction: {
      options: { getString: (name) => name === "question" ? question : null },
      user: { id: "discord-user-1" },
      reply: async (payload) => {
        replies.push(payload);
        return payload;
      }
    },
    replies
  };
}

test("Discord AI support keeps timeout fallback private and audits metadata without question content", async () => {
  const question = "Where is the official FIMA download? private phrase 47";
  const { interaction, replies } = interactionFor(question);
  const audits = [];
  await handleFimaAiSupportInteraction(interaction, {
    answerOptions: {
      baseUrl: "https://adapter.example.test",
      timeoutMs: 60,
      fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      })
    },
    auditAction: async (...args) => audits.push(args)
  });

  assert.equal(replies.length, 1);
  assert.equal(replies[0].ephemeral, true);
  assert.equal(replies[0].embeds.length, 1);
  assert.equal(replies[0].components.length, 0);
  assert.equal(audits.length, 1);
  assert.equal(audits[0][0], "discord_ai_support_answered");
  assert.equal(audits[0][1], "discord_user");
  assert.equal(audits[0][2], "discord-user-1");
  assert.equal(audits[0][3].fallbackReason, "adapter_timeout");
  assert.equal(audits[0][3].questionLength, question.length);
  assert.doesNotMatch(JSON.stringify(audits[0][3]), /private phrase 47/i);
});

test("Discord AI support rejects invented payment and license operations and shows escalation", async () => {
  const { interaction, replies } = interactionFor("Was my payment received and is my license active?");
  const audits = [];
  await handleFimaAiSupportInteraction(interaction, {
    answerOptions: {
      baseUrl: "https://adapter.example.test",
      fetchImpl: async () => new Response(JSON.stringify({
        answer: "Your payment was received and your license is active.",
        confidence: 0.99,
        knowledgeIds: ["pricing.activity-rewards", "license.hwid"]
      }), { status: 200, headers: { "content-type": "application/json" } })
    },
    auditAction: async (...args) => audits.push(args)
  });

  assert.equal(replies[0].ephemeral, true);
  const embedJson = replies[0].embeds[0].toJSON();
  assert.match(embedJson.description, /staff/i);
  assert.ok(embedJson.fields.some(field => field.name === "Next step" && /private ticket/i.test(field.value)));
  assert.equal(replies[0].components.length, 1);
  assert.equal(replies[0].components[0].components[0].data.custom_id, "fima_ticket_category");
  assert.equal(audits[0][3].source, "approved_knowledge_fallback");
  assert.equal(audits[0][3].fallback, true);
  assert.equal(audits[0][3].escalation, true);
  assert.equal(audits[0][3].fallbackReason, "adapter_answer_rejected");
});
