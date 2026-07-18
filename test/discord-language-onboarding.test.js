import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../src/discordBot.js", import.meta.url);

async function discordBotSource() {
  return readFile(sourceUrl, "utf8");
}

test("language onboarding exposes only Turkish, English, and Decide Later", async () => {
  const source = await discordBotSource();
  const commandStart = source.indexOf('.setName("language")');
  const commandEnd = source.indexOf('new SlashCommandBuilder()', commandStart + 1);
  const command = source.slice(commandStart, commandEnd);

  assert.match(command, /\{ name: "Türkçe", value: "tr" \}/);
  assert.match(command, /\{ name: "English", value: "en" \}/);
  assert.match(command, /\{ name: "Decide Later", value: "later" \}/);
  assert.doesNotMatch(command, /German|French|Bosnian|"de"|"fr"|"bs"/);
});

test("language roles are never created by role setup helpers", async () => {
  const source = await discordBotSource();
  const ensureStart = source.indexOf("async function ensureFimaRoles");
  const ensureEnd = source.indexOf("async function organizeRolePositions", ensureStart);
  const ensureSection = source.slice(ensureStart, ensureEnd);
  assert.match(ensureSection, /if \(LANGUAGE_ROLE_TYPES\.has\(type\)\) continue;/);

  const helperStart = source.indexOf("async function getOrCreateRole");
  const helperEnd = source.indexOf("async function findRole", helperStart);
  const helperSection = source.slice(helperStart, helperEnd);
  const guardIndex = helperSection.indexOf("LANGUAGE_ROLE_TYPES.has(type)");
  const createIndex = helperSection.indexOf("guild.roles.create");
  assert.ok(guardIndex >= 0);
  assert.ok(createIndex > guardIndex);
  assert.match(helperSection, /discord_language_role_missing/);
});

test("language choice sync uses existing roles and onboarding is opt-in", async () => {
  const source = await discordBotSource();
  const applyStart = source.indexOf("async function applyLanguageChoice");
  const applyEnd = source.indexOf("function fimaPingRolePanelPayload", applyStart);
  const applySection = source.slice(applyStart, applyEnd);

  assert.match(applySection, /syncDiscordLanguageRole/);
  assert.doesNotMatch(applySection, /getOrCreateRole/);
  assert.match(source, /startsWith\("fima_language_select"\)/);
  assert.match(source, /env\("FIEELS_COMMUNITY_LANGUAGE_ONBOARDING", "false"\)/);
  assert.match(source, /config\.fallbackName, \.\.\.\(config\.aliases \|\| \[\]\)/);
});
