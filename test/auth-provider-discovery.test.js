import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// Exercise the registered production handler without starting bots or a database.
const source = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const start = source.indexOf('app.get("/api/auth/providers",');
const end = source.indexOf('app.get("/auth/discord/start",', start);
assert.ok(start >= 0 && end > start);
const route = source.slice(start, end);

test("provider discovery requires both credentials and never exposes their values", () => {
  const names = ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
  for (let mask = 0; mask < 16; mask += 1) {
    const configuration = Object.fromEntries(names.map((name, bit) => [name, mask & (1 << bit) ? `private-${name}` : ""]));
    let handler;
    vm.runInNewContext(route, {
      app: { get(path, callback) { assert.equal(path, "/api/auth/providers"); handler = callback; } },
      env: (name) => configuration[name]
    });
    const headers = {};
    let body;
    handler({}, { set(name, value) { headers[name] = value; }, json(value) { body = JSON.parse(JSON.stringify(value)); } });
    assert.equal(headers["Cache-Control"], "no-store");
    assert.deepEqual(body, { providers: [
      ...((mask & 3) === 3 ? ["discord"] : []),
      ...((mask & 12) === 12 ? ["google"] : [])
    ] });
    assert.equal(JSON.stringify(body).includes("private-"), false);
  }
});
