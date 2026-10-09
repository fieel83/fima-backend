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
  const image = sharp(buffer, { limitInputPixels: 4000000, animated: false, failOn: "warning" });
  const meta = await image.metadata();
  if (!["png", "jpeg", "webp", "gif"].includes(meta.format)) throw new Error("unsupported_format");
  const { data, info } = await image.resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).flatten({ background: "white" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const qr = jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: "attemptBoth" });
  let text = "";
  if (ocr) {
    const langPath = await mkdtemp(join(tmpdir(), "ft-ocr-languages-"));
    let worker;
    try {
      await Promise.all([eng, tur].map(language => copyFile(join(language.langPath, `${language.code}.traineddata.gz`), join(langPath, `${language.code}.traineddata.gz`))));
      worker = await createWorker("eng+tur", 1, { langPath, gzip: true, cacheMethod: "none", errorHandler: () => {} });
      const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
      const result = await worker.recognize(png);
      text = String(result.data.text || "").slice(0, 12000);
    } finally { await worker?.terminate(); await rm(langPath, { recursive: true, force: true }); }
  }
  return { text, qr: qr?.data ? String(qr.data).slice(0, 2000) : "", scan: meta.pages > 1 ? "first_frame_scanned" : "scanned" };
}

if (process.send) process.once("message", async ({ buffer }) => {
  try { process.send({ ok: true, result: await decodeFtMedia(Buffer.from(buffer)) }, () => process.exit(0)); }
  catch { process.send({ ok: false }, () => process.exit(0)); }
});
