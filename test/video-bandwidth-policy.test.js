import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const marketingPages = [
  "index.html",
  "faq.html",
  "download.html",
  "features.html",
  "legal.html",
  "macros.html",
  "pricing.html",
  "support.html"
];
const pageSources = Object.fromEntries(marketingPages.map((file) => [
  file,
  fs.readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8")
]));
const appSource = fs.readFileSync(new URL("../public/assets/js/app.js", import.meta.url), "utf8");
const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");

test("marketing pages do not download a macro video during initial HTML load", () => {
  for (const [file, source] of Object.entries(pageSources)) {
    const videoTag = source.match(/<video[^>]+id="macroVideo"[^>]*>/u)?.[0] || "";
    const videoSource = source.match(/<source[^>]+id="macroVideoSource"[^>]*>/u)?.[0] || "";
    assert.ok(videoTag, `${file} must keep the macro video player`);
    assert.match(videoTag, /preload="none"/u, `${file} must disable eager media preload`);
    assert.doesNotMatch(videoTag, /\bautoplay\b/u, `${file} must not autoplay before lazy activation`);
    assert.doesNotMatch(videoSource, /\bsrc=/u, `${file} must not ship an initial MP4 URL`);
    assert.match(source, /assets\/js\/app\.js\?v=20260723-locale-3/u, `${file} must use the bandwidth-safe localized script revision`);
  }
});

test("macro gallery performs one guarded lazy load and supports an HTTPS media CDN", () => {
  assert.doesNotMatch(appSource, /createElement\(["']video["']\)/u);
  assert.match(appSource, /navigator\.connection\?\.saveData/u);
  assert.match(appSource, /new IntersectionObserver/u);
  assert.match(appSource, /data-video-id/u);
  assert.match(appSource, /video\.dataset\.loadedSource === sourceUrl/u);
  assert.match(appSource, /fetch\("assets\/videos\/macro-videos\.json\?v=20260722-1", \{ cache: "default" \}\)/u);
  assert.match(appSource, /parsed\.protocol !== "https:"/u);
  assert.match(appSource, /macroVideoBaseUrl = normalizeMacroVideoBaseUrl\(manifest\.baseUrl\)/u);
  assert.match(appSource, /\^\[A-Za-z0-9\]\[A-Za-z0-9\._-\]\*\\\.\(\?:mp4\|webm\)\$/u);
});

test("server applies media CSP, hotlink protection, rate limiting and aggregate telemetry", () => {
  assert.match(serverSource, /"media-src": \["'self'", "https:"\]/u);
  assert.match(serverSource, /const videoAssetLimiter = rateLimit\(\{[\s\S]*?limit: 300/u);
  assert.match(serverSource, /req\.get\("sec-fetch-site"\)/u);
  assert.match(serverSource, /req\.get\("referer"\)/u);
  assert.match(serverSource, /fetchMode === "navigate" && fetchDest === "document"/u);
  assert.match(serverSource, /if \(!referer && fetchSite !== "cross-site"\) return true;/u);
  assert.match(serverSource, /app\.use\("\/assets\/videos", recordVideoAssetTraffic, videoAssetLimiter/u);
  assert.match(serverSource, /setInterval\(flushVideoAssetTraffic, 15 \* 60 \* 1000\)\.unref/u);
  assert.doesNotMatch(serverSource, /console\.(?:info|log)\([^\n]*video[^\n]*req/u);
});

test("versioned public assets are immutable while HTML and manifests revalidate", () => {
  assert.match(serverSource, /versionedAsset = \/\(\?:\^\|\[\?&\]\)v=/u);
  assert.match(serverSource, /public, max-age=31536000, immutable/u);
  assert.match(serverSource, /normalized\.endsWith\("\/latest\.json"\)[\s\S]*?no-cache, max-age=0, must-revalidate/u);
  assert.match(serverSource, /extension === "\.html"[\s\S]*?no-cache, max-age=0, must-revalidate/u);
});
