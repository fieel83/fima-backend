import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const readSource = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
const currentAvatarCacheKey = "20260722-bandwidth-1";

const publicHtmlSources = async () => {
  const root = new URL("../public/", import.meta.url);
  const rootPath = fileURLToPath(root);
  const entries = await readdir(rootPath, { recursive: true, withFileTypes: true });
  const htmlFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".html"));
  return Promise.all(htmlFiles.map(async (entry) => ({
    path: join(entry.parentPath, entry.name),
    source: await readFile(join(entry.parentPath, entry.name), "utf8")
  })));
};

test("public and account profile avatars fail safely to a one-time text initial", async () => {
  const sources = await Promise.all([
    readSource("public/assets/js/app.js"),
    readSource("public/assets/js/account.js")
  ]);

  for (const source of sources) {
    assert.match(source, /img\[data-profile-avatar\]/);
    assert.match(source, /safeProfileInitial\(avatar\.dataset\.avatarFallback, fallback\)/);
    assert.match(source, /addEventListener\("error", replaceBrokenAvatar, \{ once: true \}\)/);
    assert.match(source, /avatar\.complete && avatar\.naturalWidth === 0/);
    assert.match(source, /replacement\.textContent = initial/);
    assert.match(source, /avatar\.replaceWith\(replacement\)/);
    assert.doesNotMatch(source, /replacement\.innerHTML\s*=/);
  }
});

test("all public HTML pages use one current avatar script cache key", async () => {
  const htmlSources = await publicHtmlSources();
  const keysByScript = { "app.js": new Set(), "account.js": new Set() };

  for (const { source } of htmlSources) {
    for (const match of source.matchAll(/assets\/js\/(app|account)\.js\?v=([^"'\s>]+)/g)) {
      keysByScript[`${match[1]}.js`].add(match[2]);
    }
  }

  assert.deepEqual([...keysByScript["app.js"]], [currentAvatarCacheKey]);
  assert.deepEqual([...keysByScript["account.js"]], [currentAvatarCacheKey]);
});

test("HTML responses revalidate before serving profile-avatar script references", async () => {
  const serverSource = await readSource("src/server.js");
  assert.match(
    serverSource,
    /if \(extension === "\.html"\) \{\s*res\.setHeader\("Cache-Control", "no-cache, max-age=0, must-revalidate"\)/
  );
});

test("account mini profiles carry per-image safe fallback labels", async () => {
  const source = await readSource("public/assets/js/account.js");
  const protectedContexts = [
    "user.robloxUsername",
    "guild.name || \"D\"",
    "account.username || fallbackLabel",
    "current || roblox.username || \"R\"",
    "name"
  ];

  for (const context of protectedContexts) {
    assert.ok(
      source.includes(`data-avatar-fallback=\"\${escapeHtml(${context})}\"`),
      `missing escaped avatar fallback for ${context}`
    );
  }
  assert.match(source, /wireAccountProfileAvatarFallbacks\(results, "F"\)/);
  assert.match(source, /wireAccountProfileAvatarFallbacks\(target, "F"\)/);
});

test("malformed labels and failed avatars can only render safe text initials", async () => {
  const sources = await Promise.all([
    readSource("public/assets/js/app.js"),
    readSource("public/assets/js/account.js")
  ]);

  for (const source of sources) {
    assert.ok(source.includes('.normalize("NFKC").replace(/[^\\p{L}\\p{N}]/gu, "")'));
    assert.match(source, /replacement\.textContent = initial/);
    assert.match(source, /data-avatar-fallback="\$\{escapeHtml\(/);
  }
});
