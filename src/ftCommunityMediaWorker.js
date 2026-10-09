import sharp from "sharp";
import jsQR from "jsqr";
import { createWorker } from "tesseract.js";
import eng from "@tesseract.js-data/eng";
import tur from "@tesseract.js-data/tur";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

sharp.cache(false);
sharp.concurrency(1);

// The parent kills this entire process, including OCR threads, at the deadline.
// Only decoded pixels reach OCR; language data is bundled locally, never fetched.
export async function decodeFtMedia(buffer, { ocr = true } = {}) {
  const inputOptions = { limitInputPixels: 4000000, animated: false, failOn: "warning" };
  const meta = await sharp(buffer, inputOptions).metadata();
  if (!["png", "jpeg", "webp", "gif"].includes(meta.format)) throw new Error("unsupported_format");
  const pages = Math.max(1, Number(meta.pages) || 1);
  const frames = [...new Set([0, Math.floor(pages / 2), pages - 1])];
  const qrs = [];
  let text = "";
  let worker;
  let langPath;
  try {
    if (ocr) {
      langPath = await mkdtemp(join(tmpdir(), "ft-ocr-languages-"));
      await Promise.all([eng, tur].map(language => copyFile(join(language.langPath, `${language.code}.traineddata.gz`), join(langPath, `${language.code}.traineddata.gz`))));
      worker = await createWorker("eng+tur", 1, { langPath, gzip: true, cacheMethod: "none", errorHandler: () => {} });
    }
    // Decode one bounded frame at a time; never load an entire animation into RAM.
    for (const page of frames) {
      const { data, info } = await sharp(buffer, { ...inputOptions, page, pages: 1 }).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).flatten({ background: "white" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const qr = jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: "attemptBoth" });
      if (qr?.data && !qrs.includes(String(qr.data).slice(0, 2000))) qrs.push(String(qr.data).slice(0, 2000));
      if (worker) {
        const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
        const result = await worker.recognize(png);
        text = `${text}\n${String(result.data.text || "").slice(0, 3999)}`.slice(0, 12000);
      }
    }
  } finally {
    await worker?.terminate();
    if (langPath) await rm(langPath, { recursive: true, force: true });
  }
  return { text, qr: qrs[0] || "", qrs, sampledFrames: frames, totalFrames: pages, scan: frames.length === pages ? "scanned" : "sampled_frames_scanned" };
}

if (process.send) process.once("message", async ({ buffer }) => {
  try { process.send({ ok: true, result: await decodeFtMedia(Buffer.from(buffer)) }, () => process.exit(0)); }
  catch { process.send({ ok: false }, () => process.exit(0)); }
});
