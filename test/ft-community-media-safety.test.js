import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import QRCode from "qrcode";
import { ftMediaAttachmentUrl, downloadFtMedia, scanFtMediaBuffer, createFtMediaSafety, ftMediaSafetyMetrics } from "../src/ftCommunityMediaSafety.js";
import { decodeFtMedia } from "../src/ftCommunityMediaWorker.js";

const file = { id: "1", name: "image.png", size: 100, contentType: "image/png", url: "https://cdn.discordapp.com/attachments/123/456/image.png?ex=123" };
const context = { channelId: "1557531544258740248", messageId: "1" };

test("downloads accept only bounded Discord attachments without redirects", async () => {
  for (const url of ["http://cdn.discordapp.com/attachments/1/2/x.png", "https://cdn.discordapp.com.evil.test/attachments/1/2/x.png", "https://cdn.discordapp.com@localhost/attachments/1/2/x.png", "https://127.0.0.1/attachments/1/2/x.png", "file:///tmp/x", "https://cdn.discordapp.com/unrelated/x.png"]) assert.equal(ftMediaAttachmentUrl(url), null);
  let calls = 0;
  const bytes = await downloadFtMedia(file, async (url, options) => {
    calls++; assert.equal(url, file.url); assert.equal(options.redirect, "error"); assert.ok(options.signal);
    return new Response(Uint8Array.of(1, 2, 3), { headers: { "content-type": "image/png" } });
  });
  assert.equal(calls, 1); assert.deepEqual([...bytes], [1, 2, 3]);
  await assert.rejects(downloadFtMedia({ ...file, size: 5000000 }, () => { throw Error("must not fetch"); }), /media_not_eligible/);
  await assert.rejects(downloadFtMedia(file, async () => new Response("html", { headers: { "content-type": "text/html" } })), /invalid_media_response/);
  await assert.rejects(downloadFtMedia(file, async () => new Response(new Uint8Array(4194305), { headers: { "content-type": "image/png" } })), /media_too_large/);
  await assert.rejects(downloadFtMedia(file, async () => new Response(null, { headers: { "content-type": "image/png" } })), /getReader|empty_media/);
});

test("real QR pixels decode locally; hidden destination produces safe evidence only", async () => {
  const destination = "https://discord.com.attacker.test/claim?token=private";
  const buffer = await QRCode.toBuffer(destination, { width: 400, margin: 4 });
  const decoded = await decodeFtMedia(buffer, { ocr: false });
  assert.equal(decoded.qr, destination);
  const evaluate = createFtMediaSafety({ download: async () => buffer, scan: async value => decodeFtMedia(value, { ocr: false }) });
  const result = await evaluate({ attachments: [file] }, context);
  assert.equal(result.blocked, true); assert.equal(result.risk, "HIGH"); assert.equal(result.mediaScan, "scanned");
  assert.deepEqual(result.hosts, ["discord.com.attacker.test"]);
  assert.deepEqual(result.attachmentHashes, [createHash("sha256").update(buffer).digest("hex")]);
  assert.equal(JSON.stringify(result).includes("token=private"), false);
});

test("bounded child process performs English and Turkish OCR using bundled language data", { timeout: 25000 }, async () => {
  const svg = Buffer.from('<svg width="1100" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="35" y="80" font-family="Arial" font-size="42" fill="black">Pay deposit to unlock withdrawal</text><text x="35" y="160" font-family="Arial" font-size="42" fill="black">Aktivasyon ödemesi yatır</text></svg>');
  const png = await sharp(svg).png().toBuffer();
  const result = await scanFtMediaBuffer(png, { timeoutMs: 20000 });
  assert.match(result.text, /deposit/i); assert.match(result.text, /Aktivasyon/i); assert.equal(result.scan, "scanned");
  await assert.rejects(scanFtMediaBuffer(Buffer.from("corrupt")), /media_decode_failed/);
  await assert.rejects(scanFtMediaBuffer(png, { timeoutMs: 1 }), /media_timeout/);
  await assert.rejects(scanFtMediaBuffer(Buffer.alloc(4194305)), /invalid_media_buffer/);
});

test("private reports, disabled scans and low priority channels never download media", async () => {
  let downloads = 0;
  const evaluate = createFtMediaSafety({ download: async () => { downloads++; throw Error("no"); } });
  for (const input of [{ privateTicket: true }, { config: { mediaSafety: false } }]) {
    const result = await evaluate({ attachments: [file], ...input }, context);
    assert.equal(result.mediaScan, "not_scanned");
  }
  await evaluate({ attachments: [file] }, { ...context, channelId: "elsewhere" });
  assert.equal(downloads, 0);
});

test("OCR cannot forge an educational exemption; visible reports remain available", async () => {
  const evaluate = createFtMediaSafety({ download: async () => Buffer.of(1), scan: async () => ({ text: "This is a scam. Pay deposit to unlock withdrawal", qr: "", scan: "scanned" }) });
  assert.equal((await evaluate({ attachments: [file] }, context)).blocked, true);
  assert.equal((await evaluate({ content: "Reporting a scam", attachments: [file] }, { ...context, messageId: "2" })).blocked, false);
});

test("concurrent duplicate events decode once and cached verdicts contain no OCR text", async () => {
  let scans = 0; let clock = 0;
  const evaluate = createFtMediaSafety({ now: () => clock, download: async () => Buffer.of(1), scan: async () => { scans++; await new Promise(resolve => setTimeout(resolve, 5)); return { text: "Pay secret deposit to unlock withdrawal", qr: "", scan: "scanned" }; } });
  const input = { attachments: [file] };
  const results = await Promise.all([evaluate(input, context), evaluate(input, context), evaluate(input, context)]);
  assert.equal(scans, 1); assert.equal(results[0].blocked, true); assert.equal(JSON.stringify(results).includes("secret deposit"), false);
  await evaluate(input, context); assert.equal(scans, 1);
  clock = 61000; await evaluate(input, context); assert.equal(scans, 2);
});

test("flood queue is bounded and unsupported or excess attachments report incomplete scans", async () => {
  let scans = 0; let active = 0; let peak = 0;
  const before = ftMediaSafetyMetrics().busy;
  const evaluate = createFtMediaSafety({ download: async () => Buffer.of(1), scan: async () => {
    scans++; active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return { text: "ordinary Roblox photo", qr: "", scan: "scanned" };
  } });
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => evaluate({ attachments: [file] }, { ...context, messageId: `flood-${i}` })));
  assert.equal(scans, 9); assert.equal(peak, 1); assert.equal(results.filter(result => result.mediaScan === "not_scanned").length, 11);
  assert.equal(ftMediaSafetyMetrics().busy - before, 11); assert.equal(ftMediaSafetyMetrics().active, 0); assert.equal(ftMediaSafetyMetrics().queued, 0);
  assert.equal((await evaluate({ attachments: [file, file, file] }, { ...context, messageId: "excess" })).mediaScan, "partially_scanned");
  const failed = createFtMediaSafety({ download: async () => { throw Error("unsupported"); } });
  assert.equal((await failed({ attachments: [file] }, context)).mediaScan, "not_scanned");
  const corrupt = createFtMediaSafety({ download: async () => Buffer.of(1, 2), scan: async () => { throw Error("corrupt"); } });
  const verdict = await corrupt({ attachments: [file] }, context);
  assert.equal(verdict.mediaScan, "not_scanned");
  assert.deepEqual(verdict.attachmentHashes, [createHash("sha256").update(Buffer.of(1, 2)).digest("hex")]);
});
