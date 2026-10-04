import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const PROCESS_STARTED_AT = new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString();
const DEFAULT_INSTANCE_ID = crypto.randomUUID();
const DEFAULT_ROOT = path.resolve(process.cwd(), "artifacts", "post-security-backlog", "mutation-leases");
const execFileAsync = promisify(execFile);
const PROCESS_START_TOLERANCE_MS = 5_000;

function positiveNumber(value, fallback, minimum = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function leaseError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, details);
  return error;
}

const SAFE_FAILURE_CODE_PREFIXES = Object.freeze([
  "automatic_", "backup_", "discord_", "fima_", "ft_", "guild_", "mutation_",
  "owner_", "paradise_", "production_", "rehearsal_", "restore_", "rollback_",
  "security_", "test_"
]);
const SAFE_FAILURE_OPERATIONS = new Set(["payload", "create", "edit", "delete"]);
const SAFE_FAILURE_RESOURCE_KINDS = new Set(["auto_mod_rule"]);

function stableFailureCode(value, fallbackCode) {
  const candidate = String(value || "").trim().toLowerCase();
  if (/^[a-z][a-z0-9_]{2,95}$/.test(candidate)
      && SAFE_FAILURE_CODE_PREFIXES.some(prefix => candidate.startsWith(prefix))) return candidate;
  const fallback = String(fallbackCode || "guild_mutation_failed").trim().toLowerCase();
  if (/^[a-z][a-z0-9_]{2,95}$/.test(fallback)
      && SAFE_FAILURE_CODE_PREFIXES.some(prefix => fallback.startsWith(prefix))) return fallback;
  return "guild_mutation_failed";
}

export function sanitizeParadiseMutationFailure(error, fallbackCode = "guild_mutation_failed") {
  const failure = { code: stableFailureCode(error?.code, fallbackCode) };
  const sourceContext = error?.context;
  if (!sourceContext || typeof sourceContext !== "object") return failure;
  const context = {};
  if (SAFE_FAILURE_OPERATIONS.has(sourceContext.operation)) context.operation = sourceContext.operation;
  if (SAFE_FAILURE_RESOURCE_KINDS.has(sourceContext.resourceKind)) context.resourceKind = sourceContext.resourceKind;
  if (Number.isSafeInteger(sourceContext.index) && sourceContext.index >= 0) context.index = sourceContext.index;
  if (Object.keys(context).length) failure.context = context;
  return failure;
}

function guildPathSegment(guildId) {
  const readable = String(guildId).replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 48) || "guild";
  const digest = crypto.createHash("sha256").update(String(guildId)).digest("hex").slice(0, 12);
  return `${readable}-${digest}`;
}

function leasePaths(root, guildId) {
  const segment = guildPathSegment(guildId);
  const leaseDir = path.join(root, `${segment}.lease`);
  return {
    root,
    segment,
    leaseDir,
    metadataPath: path.join(leaseDir, "metadata.json"),
    historyDir: path.join(root, "history", segment),
    recoveryDir: path.join(root, "recovered")
  };
}

async function readJson(filePath, fileApi = fs) {
  try {
    return JSON.parse(await fileApi.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return null;
  }
}

const WINDOWS_REPLACE_ERRORS = new Set(["EACCES", "EBUSY", "EEXIST", "ENOTEMPTY", "EPERM"]);

async function pathExists(fileApi, filePath) {
  try {
    await fileApi.stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function restoreReplaceBackup(fileApi, backupPath, filePath) {
  if (!await pathExists(fileApi, backupPath)) return;
  if (await pathExists(fileApi, filePath)) return;
  await fileApi.rename(backupPath, filePath);
}

async function replaceFileAtomic(fileApi, temporaryPath, filePath, { replaceRetries, replaceRetryMs }) {
  let lastError;
  for (let attempt = 0; attempt <= replaceRetries; attempt += 1) {
    try {
      await fileApi.rename(temporaryPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      if (!WINDOWS_REPLACE_ERRORS.has(error?.code)) throw error;
    }

    const backupPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.replace-backup`;
    let backupCreated = false;
    try {
      try {
        await fileApi.rename(filePath, backupPath);
        backupCreated = true;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      await fileApi.rename(temporaryPath, filePath);
      if (backupCreated) await fileApi.rm(backupPath, { force: true });
      return;
    } catch (error) {
      lastError = error;
      await restoreReplaceBackup(fileApi, backupPath, filePath).catch(restoreError => {
        error.restoreError = restoreError;
      });
      if (!WINDOWS_REPLACE_ERRORS.has(error?.code) || attempt >= replaceRetries) throw error;
      await wait(replaceRetryMs * (attempt + 1));
    }
  }
  throw lastError;
}

async function writeJsonAtomic(filePath, value, options = {}) {
  const fileApi = options.fileApi || fs;
  const replaceRetries = positiveNumber(options.replaceRetries, 4, 0);
  const replaceRetryMs = positiveNumber(options.replaceRetryMs, 12, 1);
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fileApi.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await replaceFileAtomic(fileApi, temporaryPath, filePath, { replaceRetries, replaceRetryMs });
  } catch (error) {
    await fileApi.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function appendHistory(paths, metadata, event, options = {}) {
  const fileApi = options.fileApi || fs;
  await fileApi.mkdir(paths.historyDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const historyPath = path.join(
    paths.historyDir,
    `${timestamp}-${String(metadata.correlationId || crypto.randomUUID())}-${event}.json`
  );
  await writeJsonAtomic(historyPath, { ...metadata, ownerToken: undefined, historyEvent: event }, options);
  return historyPath;
}

function isProcessAlive(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return false;
  try {
    process.kill(numericPid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function readProcessStartedAt(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return null;
  if (numericPid === process.pid) return PROCESS_STARTED_AT;
  try {
    if (process.platform === "win32") {
      const command = [
        `$target = Get-Process -Id ${numericPid} -ErrorAction SilentlyContinue`,
        "if ($null -ne $target) { $target.StartTime.ToUniversalTime().ToString('o') }"
      ].join("; ");
      const { stdout } = await execFileAsync(
        "powershell.exe",
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
        { timeout: 5_000, windowsHide: true, maxBuffer: 4_096 }
      );
      return String(stdout || "").trim() || null;
    }
    const { stdout } = await execFileAsync(
      "ps",
      ["-o", "lstart=", "-p", String(numericPid)],
      { timeout: 5_000, windowsHide: true, maxBuffer: 4_096 }
    );
    return String(stdout || "").trim() || null;
  } catch {
    return null;
  }
}

async function matchesLeaseOwnerProcess(metadata, resolveStartedAt = readProcessStartedAt) {
  const expectedStartedAt = Date.parse(metadata?.processStartedAt || "");
  if (!Number.isFinite(expectedStartedAt)) return null;
  const observedStartedAt = Date.parse(await resolveStartedAt(metadata?.pid) || "");
  if (!Number.isFinite(observedStartedAt)) return null;
  return Math.abs(observedStartedAt - expectedStartedAt) <= PROCESS_START_TOLERANCE_MS;
}

function heartbeatAge(metadata, now = Date.now()) {
  const heartbeat = Date.parse(metadata?.heartbeatAt || metadata?.acquiredAt || "");
  return Number.isFinite(heartbeat) ? Math.max(0, now - heartbeat) : Number.POSITIVE_INFINITY;
}

async function recoveryState(metadata, {
  hostname,
  leaseTtlMs,
  processAlive = isProcessAlive,
  processIdentityMatches = matchesLeaseOwnerProcess,
  now = Date.now()
}) {
  if (!metadata || typeof metadata !== "object") {
    return { stale: true, recoverable: false, reason: "metadata_missing_or_corrupt" };
  }
  const stale = heartbeatAge(metadata, now) > leaseTtlMs;
  if (!stale) return { stale: false, recoverable: false, reason: "heartbeat_current" };
  if (!metadata.hostname || metadata.hostname !== hostname) {
    return { stale: true, recoverable: false, reason: "different_or_unknown_host" };
  }
  if (!await processAlive(metadata.pid)) {
    return { stale: true, recoverable: true, reason: "same_host_owner_process_dead" };
  }
  const identityMatches = await processIdentityMatches(metadata);
  if (identityMatches === false) {
    return { stale: true, recoverable: true, reason: "same_host_owner_pid_reused" };
  }
  if (identityMatches === null) {
    return { stale: true, recoverable: false, reason: "owner_process_identity_unverified" };
  }
  return { stale: true, recoverable: false, reason: "owner_process_alive" };
}

function publicLeaseMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  return {
    guildId: metadata.guildId || null,
    operation: metadata.operation || null,
    purposeKey: metadata.purposeKey || null,
    idempotencyKey: metadata.idempotencyKey || null,
    correlationId: metadata.correlationId || null,
    acquiredAt: metadata.acquiredAt || null,
    heartbeatAt: metadata.heartbeatAt || null,
    phase: metadata.phase || null,
    status: metadata.status || null,
    rollback: metadata.rollback ?? null,
    reconciliation: metadata.reconciliation ?? null
  };
}

function wait(delayMs) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, delayMs);
    timer.unref?.();
  });
}

function waitForPromise(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs)) return promise;
  if (timeoutMs <= 0) return Promise.reject(leaseError("guild_mutation_wait_timeout"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(leaseError("guild_mutation_wait_timeout")), timeoutMs);
    timer.unref?.();
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}

export function createParadiseMutationLeaseManager(options = {}) {
  const root = path.resolve(options.root || process.env.PARADISE_MUTATION_LEASE_ROOT || DEFAULT_ROOT);
  const fileApi = options.fileApi || fs;
  const hostname = String(options.hostname || os.hostname());
  const instanceId = String(options.instanceId || DEFAULT_INSTANCE_ID);
  const processStartedAt = String(options.processStartedAt || PROCESS_STARTED_AT);
  const processAlive = typeof options.processAlive === "function" ? options.processAlive : isProcessAlive;
  const processIdentityMatches = typeof options.processIdentityMatches === "function"
    ? options.processIdentityMatches
    : metadata => matchesLeaseOwnerProcess(metadata, options.resolveProcessStartedAt || readProcessStartedAt);
  const jsonWriteOptions = {
    fileApi,
    replaceRetries: positiveNumber(options.replaceRetries, 4, 0),
    replaceRetryMs: positiveNumber(options.replaceRetryMs, 12, 1)
  };
  const leaseTtlMs = positiveNumber(
    options.leaseTtlMs ?? process.env.PARADISE_MUTATION_LEASE_TTL_MS,
    90_000,
    50
  );
  const heartbeatMs = Math.min(
    positiveNumber(options.heartbeatMs ?? process.env.PARADISE_MUTATION_HEARTBEAT_MS, 10_000, 10),
    Math.max(10, Math.floor(leaseTtlMs / 3))
  );
  const defaultWaitTimeoutMs = positiveNumber(
    options.waitTimeoutMs ?? process.env.PARADISE_MUTATION_WAIT_TIMEOUT_MS,
    120_000,
    0
  );
  const pollIntervalMs = positiveNumber(
    options.pollIntervalMs ?? process.env.PARADISE_MUTATION_POLL_INTERVAL_MS,
    250,
    5
  );
  const context = new AsyncLocalStorage();
  const queues = new Map();

  function lockStatus(guildId) {
    const id = String(guildId || "").trim();
    const queue = queues.get(id);
    if (!queue) return { guildId: id, locked: false, acquiring: false, waiting: 0, active: null };
    return {
      guildId: id,
      locked: Boolean(queue.active || queue.acquiring),
      acquiring: Boolean(queue.acquiring),
      waiting: Number(queue.waiting || 0),
      active: queue.active ? { ...queue.active } : queue.acquiring ? { ...queue.acquiring } : null
    };
  }

  function currentLease() {
    const current = context.getStore();
    if (!current?.guildId || !current?.correlationId) return null;
    return {
      guildId: String(current.guildId),
      operation: String(current.operation || "guild_mutation"),
      correlationId: String(current.correlationId),
      acquiredAt: current.acquiredAt || null,
      depth: Number(current.depth || 1)
    };
  }

  async function persistentStatus(guildId) {
    const id = String(guildId || "").trim();
    const local = lockStatus(id);
    if (!id) {
      return {
        guildId: id, locked: false, waiting: local.waiting, recoverable: false,
        operation: null, phase: null, correlationId: null, acquiredAt: null, heartbeatAt: null
      };
    }
    const paths = leasePaths(root, id);
    let directoryExists = true;
    try {
      await fileApi.stat(paths.leaseDir);
    } catch (error) {
      if (error?.code === "ENOENT") directoryExists = false;
      else throw error;
    }
    if (!directoryExists) {
      return {
        guildId: id, locked: local.locked, waiting: local.waiting, recoverable: false,
        operation: local.active?.operation || null,
        phase: local.acquiring ? "acquiring" : local.active?.phase || null,
        correlationId: local.active?.correlationId || null,
        acquiredAt: local.active?.acquiredAt || null,
        heartbeatAt: null,
        purposeKey: null,
        idempotencyKey: null,
        status: local.acquiring ? "acquiring" : local.active?.status || null,
        rollback: null,
        reconciliation: null
      };
    }
    const metadata = await readJson(paths.metadataPath, fileApi);
    const recovery = await recoveryState(metadata, {
      hostname,
      leaseTtlMs,
      processAlive,
      processIdentityMatches
    });
    const visible = publicLeaseMetadata(metadata) || {};
    return {
      guildId: id,
      locked: true,
      waiting: local.waiting,
      recoverable: recovery.recoverable,
      recoveryReason: recovery.reason,
      ...visible
    };
  }

  async function recoverStaleLease(paths, observedMetadata) {
    const latestMetadata = await readJson(paths.metadataPath, fileApi);
    if (!latestMetadata || latestMetadata.ownerToken !== observedMetadata?.ownerToken) return false;
    const recovery = await recoveryState(latestMetadata, {
      hostname,
      leaseTtlMs,
      processAlive,
      processIdentityMatches
    });
    if (!recovery.recoverable) return false;
    await fileApi.mkdir(paths.recoveryDir, { recursive: true });
    const recoveredPath = path.join(
      paths.recoveryDir,
      `${paths.segment}-${Date.now()}-${crypto.randomUUID()}.lease`
    );
    try {
      await fileApi.rename(paths.leaseDir, recoveredPath);
    } catch (error) {
      if (["ENOENT", "EEXIST", "EPERM"].includes(error?.code)) return false;
      throw error;
    }
    const recoveredMetadata = {
      ...latestMetadata,
      status: "recovered",
      phase: "stale_lease_recovered",
      recoveredAt: new Date().toISOString(),
      recoveryReason: recovery.reason,
      recoveredBy: { pid: process.pid, hostname, instanceId }
    };
    await appendHistory(paths, recoveredMetadata, "recovered", jsonWriteOptions);
    await fileApi.rm(recoveredPath, { recursive: true, force: true });
    return true;
  }

  async function acquirePersistent(guildId, operation, leaseOptions, deadline) {
    const paths = leasePaths(root, guildId);
    await fileApi.mkdir(root, { recursive: true });
    while (true) {
      try {
        await fileApi.mkdir(paths.leaseDir);
        const now = new Date().toISOString();
        const metadata = {
          schemaVersion: 1,
          ownerToken: crypto.randomUUID(),
          guildId,
          operation,
          purposeKey: String(leaseOptions.purposeKey || operation),
          idempotencyKey: String(leaseOptions.idempotencyKey || `${guildId}:${operation}:${leaseOptions.correlationId}`),
          correlationId: leaseOptions.correlationId,
          pid: process.pid,
          hostname,
          instanceId,
          processStartedAt,
          acquiredAt: now,
          heartbeatAt: now,
          phase: String(leaseOptions.phase || "acquired"),
          status: "active",
          rollback: leaseOptions.rollback ?? null,
          reconciliation: leaseOptions.reconciliation ?? null
        };
        try {
          await writeJsonAtomic(paths.metadataPath, metadata, jsonWriteOptions);
        } catch (error) {
          await fileApi.rm(paths.leaseDir, { recursive: true, force: true }).catch(() => {});
          throw error;
        }
        return { paths, metadata, writeTail: Promise.resolve(), releaseState: "active", releasePromise: null };
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const observedMetadata = await readJson(paths.metadataPath, fileApi);
        if (observedMetadata && await recoverStaleLease(paths, observedMetadata)) continue;
        if (leaseOptions.failIfLocked) {
          throw leaseError("guild_mutation_locked", { guildId, lock: publicLeaseMetadata(observedMetadata) });
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          throw leaseError("guild_mutation_wait_timeout", { guildId, lock: publicLeaseMetadata(observedMetadata) });
        }
        await wait(Math.min(pollIntervalMs, remaining));
      }
    }
  }

  async function writeOwnedMetadata(lease, changes) {
    const predecessor = lease.writeTail?.catch(() => {}) || Promise.resolve();
    const writePromise = predecessor.then(async () => {
      if (lease.releaseState !== "active") {
        throw leaseError("guild_mutation_already_finalizing", { guildId: lease.metadata.guildId });
      }
      const currentMetadata = await readJson(lease.paths.metadataPath, fileApi);
      if (!currentMetadata || currentMetadata.ownerToken !== lease.metadata.ownerToken) {
        throw leaseError("guild_mutation_owner_mismatch", { guildId: lease.metadata.guildId });
      }
      const updated = { ...currentMetadata, ...changes };
      await writeJsonAtomic(lease.paths.metadataPath, updated, jsonWriteOptions);
      lease.metadata = updated;
      return updated;
    });
    lease.writeTail = writePromise;
    return writePromise;
  }

  async function heartbeat(lease) {
    await writeOwnedMetadata(lease, { heartbeatAt: new Date().toISOString() });
  }

  async function updateCurrent(changes = {}) {
    const current = context.getStore();
    if (!current?.lease) throw leaseError("guild_mutation_context_missing");
    const allowed = Object.fromEntries(
      ["phase", "status", "rollback", "reconciliation"].filter(key => key in changes).map(key => [key, changes[key]])
    );
    if (!Object.keys(allowed).length) return publicLeaseMetadata(current.lease.metadata);
    return publicLeaseMetadata(await writeOwnedMetadata(current.lease, allowed));
  }

  async function releasePersistent(lease, finalChanges = {}) {
    if (lease.releasePromise) return lease.releasePromise;
    lease.releaseState = "finalizing";
    lease.releasePromise = (async () => {
      await lease.writeTail?.catch(error => { throw error; });
      const currentMetadata = await readJson(lease.paths.metadataPath, fileApi);
      if (!currentMetadata || currentMetadata.ownerToken !== lease.metadata.ownerToken) {
        throw leaseError("guild_mutation_owner_mismatch", { guildId: lease.metadata.guildId });
      }
      const finished = {
        ...currentMetadata,
        ...finalChanges,
        heartbeatAt: new Date().toISOString(),
        releasedAt: new Date().toISOString()
      };
      await writeJsonAtomic(lease.paths.metadataPath, finished, jsonWriteOptions);
      await appendHistory(
        lease.paths,
        finished,
        finished.status === "failed" ? "failed" : "completed",
        jsonWriteOptions
      );
      const ownershipCheck = await readJson(lease.paths.metadataPath, fileApi);
      if (!ownershipCheck || ownershipCheck.ownerToken !== lease.metadata.ownerToken) {
        throw leaseError("guild_mutation_owner_mismatch", { guildId: lease.metadata.guildId });
      }
      await fileApi.rm(lease.paths.leaseDir, { recursive: true, force: false });
      lease.metadata = finished;
      lease.releaseState = "released";
      return publicLeaseMetadata(finished);
    })();
    return lease.releasePromise;
  }

  async function withLease(guildOrId, operation, callback, leaseOptions = {}) {
    const guildId = String(guildOrId?.id || guildOrId || "").trim();
    const normalizedOperation = String(operation || "guild_mutation");
    if (!guildId || typeof callback !== "function") throw leaseError("invalid_guild_mutation_lock_request");
    if (leaseOptions.expectedGuildId && guildId !== String(leaseOptions.expectedGuildId)) {
      throw leaseError("wrong_guild_mutation_request", { guildId });
    }
    const current = context.getStore();
    if (current?.guildId === guildId) {
      return context.run({
        ...current,
        operation: normalizedOperation || current.operation || "nested_mutation",
        depth: Number(current.depth || 1) + 1
      }, callback);
    }

    let queue = queues.get(guildId);
    if (leaseOptions.failIfLocked && queue && (queue.active || queue.acquiring || queue.waiting > 0)) {
      throw leaseError("guild_mutation_locked", {
        guildId,
        lock: queue.active ? { ...queue.active } : queue.acquiring ? { ...queue.acquiring } : null
      });
    }
    if (!queue) {
      queue = { tail: Promise.resolve(), waiting: 0, acquiring: null, active: null };
      queues.set(guildId, queue);
    }
    const waitTimeoutMs = positiveNumber(leaseOptions.waitTimeoutMs, defaultWaitTimeoutMs, 0);
    const deadline = Date.now() + waitTimeoutMs;
    const correlationId = String(leaseOptions.correlationId || crypto.randomUUID());
    const predecessor = queue.tail.catch(() => {});
    let releaseSlot;
    const slot = new Promise(resolve => { releaseSlot = resolve; });
    const ownTail = predecessor.then(() => slot);
    queue.tail = ownTail;
    queue.waiting += 1;
    const cleanupQueue = () => {
      if (
        queue.waiting === 0 && queue.acquiring === null && queue.active === null
        && queue.tail === ownTail && queues.get(guildId) === queue
      ) queues.delete(guildId);
    };
    try {
      await waitForPromise(predecessor, deadline - Date.now());
    } catch (error) {
      queue.waiting -= 1;
      predecessor.finally(releaseSlot);
      void ownTail.then(cleanupQueue, cleanupQueue);
      if (error?.code === "guild_mutation_wait_timeout") error.guildId = guildId;
      throw error;
    }

    queue.waiting -= 1;
    queue.acquiring = {
      guildId,
      operation: normalizedOperation,
      correlationId,
      acquiredAt: null,
      phase: "acquiring",
      status: "acquiring",
      depth: 1
    };
    let lease;
    try {
      lease = await acquirePersistent(guildId, normalizedOperation, {
        ...leaseOptions,
        correlationId
      }, deadline);
    } catch (error) {
      queue.acquiring = null;
      releaseSlot();
      queueMicrotask(cleanupQueue);
      throw error;
    }

    const lock = {
      guildId,
      operation: normalizedOperation,
      correlationId,
      acquiredAt: lease.metadata.acquiredAt,
      depth: 1
    };
    queue.acquiring = null;
    queue.active = lock;
    let heartbeatFailure = null;
    let heartbeatStopped = false;
    let heartbeatInFlight = Promise.resolve();
    const scheduleHeartbeat = () => {
      if (heartbeatStopped || heartbeatFailure) return;
      heartbeatInFlight = heartbeatInFlight
        .then(() => heartbeat(lease))
        .catch(error => { heartbeatFailure ||= error; });
    };
    const heartbeatTimer = setInterval(scheduleHeartbeat, heartbeatMs);
    heartbeatTimer.unref?.();
    let callbackError = null;
    let result;
    try {
      result = await context.run({ ...lock, lease }, callback);
    } catch (error) {
      callbackError = error;
    }
    heartbeatStopped = true;
    clearInterval(heartbeatTimer);
    await heartbeatInFlight;
    if (!callbackError && heartbeatFailure) callbackError = heartbeatFailure;
    try {
      await releasePersistent(lease, callbackError ? {
        status: "failed",
        phase: "failed",
        failure: sanitizeParadiseMutationFailure(callbackError)
      } : {
        status: "completed",
        phase: "completed",
        rollback: result?.rollback ?? lease.metadata.rollback ?? null,
        reconciliation: result?.reconciliation ?? lease.metadata.reconciliation ?? null
      });
    } catch (releaseError) {
      if (callbackError) callbackError.releaseError = releaseError;
      else callbackError = releaseError;
    } finally {
      queue.active = null;
      releaseSlot();
      queueMicrotask(cleanupQueue);
    }
    if (callbackError) {
      throw callbackError;
    }
    return result;
  }

  return {
    root,
    withLease,
    lockStatus,
    currentLease,
    persistentStatus,
    updateCurrent,
    acquirePersistent,
    releasePersistent,
    diagnostics: () => ({ queueCount: queues.size }),
    pathsForGuild: guildId => leasePaths(root, String(guildId || "").trim())
  };
}

const defaultManager = createParadiseMutationLeaseManager();

export const withParadiseGuildMutationLease = defaultManager.withLease;
export const paradiseGuildMutationLockStatus = defaultManager.lockStatus;
export const paradisePersistentMutationLockStatus = defaultManager.persistentStatus;
export const paradiseCurrentMutationLease = defaultManager.currentLease;
export const updateParadiseMutationLease = defaultManager.updateCurrent;
