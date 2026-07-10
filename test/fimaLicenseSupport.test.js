import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const botSource = fs.readFileSync(new URL("../src/discordBot.js", import.meta.url), "utf8");

test("Fima license support lookup stays masked and permits configured support staff", () => {
  assert.match(botSource, /function isFimaSupportInteraction/);
  assert.match(botSource, /DISCORD_FIMA_SUPPORT_ROLE_ID/);
  assert.match(botSource, /Full keys, full emails, HWIDs and payment secrets are never shown here/);
  assert.match(botSource, /fullKeysMasked:\s*true/);
  assert.match(botSource, /fullEmailsMasked:\s*true/);
});

test("license repair task actions stay owner-or-admin only", () => {
  assert.match(botSource, /function isLicenseRepairAdminInteraction/);
  assert.match(botSource, /Only the server owner or an administrator can create a license repair task/);
  assert.match(botSource, /setDisabled\(!canCreateRepairTask \|\| !supportLicenseRepairState\(license\)\.canCreateRepairTask\)/);
  assert.match(botSource, /entry\.actorId !== interaction\.user\.id/);
});

test("ticket close path is transcript-first and the public controls have no delete button", () => {
  const controlsStart = botSource.indexOf("function ticketActionRows");
  const controlsEnd = botSource.indexOf("function fimaTrustPanelPayload", controlsStart);
  const controls = botSource.slice(controlsStart, controlsEnd);
  assert.match(controls, /fima_ticket_transcript/);
  assert.doesNotMatch(controls, /delete/i);
  const closeStart = botSource.indexOf('if (action === "close")');
  const closeEnd = botSource.indexOf('if (action === "reopen")', closeStart);
  const closePath = botSource.slice(closeStart, closeEnd);
  assert.ok(closePath.indexOf("createFimaTicketTranscript") < closePath.indexOf("setName"));
  assert.match(closePath, /ticket was not closed/);
  assert.match(closePath, /status: "CLOSED"/);
});
