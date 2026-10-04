import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

const EXPECTED_WIDTH = 1983;
const EXPECTED_HEIGHT = 793;
const MIN_BYTES = 100 * 1024;
const MAX_BYTES = 8 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const bannerNames = [
  "welcome",
  "leave",
  "rules",
  "staff",
  "video-team",
  "announcement",
  "leaderboard",
  "booster"
];

const reviewedReplacementBanners = Object.freeze({
  welcome: "3ad7f90f02b9cd9be85d05decf95026301fa9d5f7fd01765a7f224029549b200",
  leave: "4f4e1b4fdc206b8c9730b9b2043359bc9797e57e09b21c3902f3df213756be04",
  rules: "4ea793f808bca29c4c5180697fa773657c973330e0c31d347058e1bb48d4bcee",
  staff: "388eb0fa09f5defdff5e952cf2a8f0a5ca3fda8378a423fc052a48e13197410c",
  "video-team": "ee80a4d755e8d97b3bd13b1d661b2267a8ae2c9fe66789320114a60b00e289f3",
  announcement: "ba6628c75b9053c4a04bb6220b1d0181844a5c0727a2a82f9372d7e08383d822",
  leaderboard: "5ce677749512564a56b8a98ee5d7530777c7362ef95ace105456d464aff088ef",
  booster: "752655d1ee02d5462e47eb6e09140e73ca978a740f9cc0ac1869a724646a54cf"
});

for (const name of bannerNames) {
  test(`Community ${name} v4 banner is a crop-safe PNG asset`, async () => {
    const assetUrl = new URL(
      `../public/assets/images/paradise/banners/fima-community-${name}-v4.png`,
      import.meta.url
    );
    const [bytes, metadata] = await Promise.all([readFile(assetUrl), stat(assetUrl)]);

    assert.deepEqual(bytes.subarray(0, 8), PNG_SIGNATURE);
    assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR");
    assert.equal(bytes.readUInt32BE(16), EXPECTED_WIDTH);
    assert.equal(bytes.readUInt32BE(20), EXPECTED_HEIGHT);
    assert.ok(metadata.size > MIN_BYTES, `${name} banner is unexpectedly small`);
    assert.ok(metadata.size < MAX_BYTES, `${name} banner is too large for an embed asset`);

    const aspectRatio = bytes.readUInt32BE(16) / bytes.readUInt32BE(20);
    assert.ok(aspectRatio >= 2.49 && aspectRatio <= 2.51, `${name} banner ratio is ${aspectRatio}`);
  });
}

for (const [name, expectedSha256] of Object.entries(reviewedReplacementBanners)) {
  test(`Community ${name} v5 reviewed replacement is the canonical runtime asset`, async () => {
    const assetUrl = new URL(
      `../public/assets/images/discord/v5/ft-community-${name}-v5.png`,
      import.meta.url
    );
    const bytes = await readFile(assetUrl);
    assert.deepEqual(bytes.subarray(0, 8), PNG_SIGNATURE);
    assert.equal(bytes.readUInt32BE(16), EXPECTED_WIDTH);
    assert.equal(bytes.readUInt32BE(20), EXPECTED_HEIGHT);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedSha256);

    const manifest = JSON.parse(await readFile(
      new URL("../public/assets/images/discord/v5/discord-asset-manifest-v5.json", import.meta.url),
      "utf8"
    ));
    const canonical = manifest.assets.find(asset => asset.id === `ft-community-${name}`);
    assert.equal(canonical?.path, `/assets/images/discord/v5/ft-community-${name}-v5.png`);
    assert.equal(canonical?.sha256, expectedSha256);
  });
}

test("ranked leaderboard embeds use the canonical FIMA Community banner", async () => {
  const sourceUrl = new URL("../src/paradise3a59.js", import.meta.url);
  const source = await readFile(sourceUrl, "utf8");

  assert.match(
    source,
    /const PARADISE_LEADERBOARD_SEPARATOR_ASSET = PARADISE_COMMUNITY_ASSETS\.leaderboard;/
  );
  assert.doesNotMatch(source, /line-gifs\/fixedbulletlines\.gif/);
  assert.ok(
    source.match(/\.setImage\(PARADISE_LEADERBOARD_SEPARATOR_ASSET\)/g)?.length >= 2,
    "vacant and occupied leaderboard cards must use the canonical banner"
  );
});
