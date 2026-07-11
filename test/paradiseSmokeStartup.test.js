import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("test-guild smoke is not blocked behind multi-server maintenance", async () => {
  const source = await readFile(new URL("../src/discordBot.js", import.meta.url), "utf8");
  assert.match(source, /void initializeParadise\(client\)\.catch/);
  assert.match(source, /const smokeTimer = setTimeout/);
});
