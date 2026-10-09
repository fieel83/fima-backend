import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { evaluateFtMessageSafety } from "./ftCommunityMessageSafety.js";

const MAX_BYTES = 4 * 1024 * 1024;
const MEDIA_CHANNELS = new Set(["1557531544258740248", "1557011370413916190"]);
const metrics = { scanned: 0, notScanned: 0, busy: 0, active: 0, queued: 0 };
export const ftMediaSafetyMetrics = () => ({ ...metrics });

export function ftMediaAttachmentUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && ["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname) && /^\/attachments\/\d+\/\d+\/[^/]+$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export async function downloadFtMedia(file, fetcher = fetch) {
  const url = ftMediaAttachmentUrl(file.url);
  if (!url || !(file.size > 0 && file.size <= MAX_BYTES) || !/^image\/(?:png|jpeg|webp|gif)$/.test(file.contentType || "")) throw new Error("media_not_eligible");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  let reader;
  try {
    const response = await fetcher(url, { redirect: "error", signal: controller.signal });
    if (!response.ok || !/^image\/(?:png|jpeg|webp|gif)(?:;|$)/.test(response.headers.get("content-type") || "") || Number(response.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("invalid_media_response");
    reader = response.body.getReader();
    const chunks = []; let bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error("media_too_large");
      chunks.push(Buffer.from(value));
    }
    if (!bytes) throw new Error("empty_media");
    return Buffer.concat(chunks, bytes);
  } finally { clearTimeout(timer); await reader?.cancel().catch(() => null); }
}

export function scanFtMediaBuffer(buffer, { timeoutMs = 15000 } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_BYTES) return Promise.reject(new Error("invalid_media_buffer"));
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(new URL("./ftCommunityMediaWorker.js", import.meta.url)), [], { execArgv: ["--max-old-space-size=256"], serialization: "advanced", stdio: ["ignore", "ignore", "ignore", "ipc"] });
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); child.kill();
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("media_timeout")), timeoutMs);
    child.once("error", () => finish(new Error("media_worker_failed")));
    child.once("exit", () => finish(new Error("media_worker_exited")));
    child.once("message", result => result.ok ? finish(null, result.result) : finish(new Error("media_decode_failed")));
    child.send({ buffer }, error => { if (error) finish(new Error("media_worker_failed")); });
  });
}

/** One local decoder at a time, eight waiting jobs; cached values contain only safe verdicts. */
export function createFtMediaSafety({ download = downloadFtMedia, scan = scanFtMediaBuffer, now = Date.now } = {}) {
  let active = 0;
  const queue = [], cache = new Map(), pending = new Map();
  const run = async job => {
    active++; metrics.active++; 
    try { return await job(); }
    finally {
      active--; metrics.active--;
      const next = queue.shift();
      metrics.queued = queue.length;
      if (next) { clearTimeout(next.timer); run(next.job).then(next.resolve, next.reject); }
    }
  };
  const schedule = job => {
    if (!active) return run(job);
    if (queue.length >= 8) { metrics.busy++; return Promise.reject(new Error("media_queue_full")); }
    return new Promise((resolve, reject) => {
      const item = { job, resolve, reject };
      item.timer = setTimeout(() => {
        const index = queue.indexOf(item);
        if (index !== -1) queue.splice(index, 1);
        metrics.queued = queue.length; metrics.busy++;
        reject(new Error("media_queue_expired"));
      }, 15000);
      queue.push(item); metrics.queued = queue.length;
    });
  };
  return async function evaluate(input, { channelId, messageId } = {}) {
    const base = evaluateFtMessageSafety(input);
    if (!input.attachments?.length || input.privateTicket || input.config?.mediaSafety === false || base.blocked || !(MEDIA_CHANNELS.has(channelId) || base.risk !== "LOW")) return base;
    for (const [key, value] of cache) if (now() - value.at > 60000) cache.delete(key);
    const policyHash = createHash("sha256").update(JSON.stringify([input.isOwner, input.roleKeys, input.config])).digest("hex");
    const key = `${messageId}:${base.fingerprint}:${policyHash}`;
    if (cache.has(key)) return cache.get(key).value;
    if (pending.has(key)) return pending.get(key);
    // Do not retain unbounded message closures when a flood saturates the queue.
    if (pending.size >= 9) { metrics.busy++; return base; }
    const operation = schedule(async () => {
      const texts = [], destinations = [], scans = [], attachmentHashes = [];
      for (const file of input.attachments.slice(0, 2)) {
        try {
          const buffer = await download(file);
          attachmentHashes.push(createHash("sha256").update(buffer).digest("hex"));
          const result = await scan(buffer);
          texts.push(result.text); destinations.push(...(Array.isArray(result.qrs) ? result.qrs.slice(0, 3) : [result.qr])); scans.push(result.scan);
          metrics.scanned++;
        } catch { scans.push("not_scanned"); metrics.notScanned++; }
      }
      const mediaScan = scans.every(scan => scan === "scanned") && input.attachments.length <= 2 ? "scanned" : scans.some(scan => scan !== "not_scanned") ? "partially_scanned" : "not_scanned";
      return evaluateFtMessageSafety({ ...input, extractedText: texts.join("\n"), qrDestinations: destinations.filter(Boolean), mediaScan, attachmentHashes });
    }).catch(() => base).then(value => {
      cache.set(key, { at: now(), value });
      while (cache.size > 200) cache.delete(cache.keys().next().value);
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, operation);
    return operation;
  };
}
