import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("test-guild smoke is not blocked behind multi-server maintenance", async () => {
  const source = await readFile(new URL("../src/discordBot.js", import.meta.url), "utf8");
  assert.match(source, /void initializeParadise\(client\)\.catch/);
  assert.match(source, /const smokeTimer = setTimeout/);
});

test("managed FT Community startup defaults are local and Discord mutations stay fail-closed", async () => {
  const source = await readFile(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  const initializeSource = source.slice(
    source.indexOf("export async function initializeParadise"),
    source.indexOf("\nfunction isOwner", source.indexOf("export async function initializeParadise"))
  );
  assert.match(initializeSource, /isFimaCommunityManagedGuild\(guild\.id\) && guildConfig\.activeSetupMode === "community"/);
  assert.match(initializeSource, /if \(!isFimaCommunityManagedGuild\(guild\.id\)\) continue/);
  assert.match(initializeSource, /FIMA_BOT_AUTOMATIC_MAINTENANCE_ENABLED/);
  assert.match(initializeSource, /if \(!automaticMaintenanceEnabled\) continue/);
  assert.match(initializeSource, /runParadiseMaintenance\(guild\)/);
  assert.doesNotMatch(initializeSource, /setUsername\(/);
  assert.doesNotMatch(initializeSource, /setNickname\(/);
  assert.doesNotMatch(initializeSource, /FIMA_BOT_PROFILE_SYNC_CONFIRMATION/);
  assert.doesNotMatch(initializeSource, /assertParadiseTestGuildMutation/);
});
