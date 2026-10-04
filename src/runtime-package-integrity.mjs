import { createHash } from "node:crypto";
import * as nodeFileSystem from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export const runtimeTreeDigestFormat = "fima-canonical-runtime-tree-v1";
export const runtimePackageIdentityFormat = "fima-runtime-package-identity:v2";
export const runtimePackageIdentitySchemaVersion = 2;

const require = createRequire(import.meta.url);
export const resolveRuntimePackageFileSystem = ({
  electronVersion = process.versions.electron,
  fallbackFileSystem = nodeFileSystem,
  loadOriginalFileSystem = () => require("original-fs"),
} = {}) => (electronVersion ? loadOriginalFileSystem() : fallbackFileSystem);

const defaultFileSystem = resolveRuntimePackageFileSystem();
const sha256Pattern = /^[a-f0-9]{64}$/u;
const canonicalTokenPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const versionPattern = /^[^\u0000-\u001f\u007f]{1,80}$/u;
const maximumRuntimeEntries = 25_000;
const maximumRuntimeBytes = 2 * 1024 * 1024 * 1024;

const integrityError = (code) => Object.assign(new Error(code), { code });

const equivalentPath = (left, right, platform = process.platform) => {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
};

const isPathInside = (candidate, root, platform = process.platform) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (!relative || relative === ".") return true;
  if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) return false;
  if (platform !== "win32") return true;
  return path.resolve(candidate).toLowerCase().startsWith(`${path.resolve(root).toLowerCase()}${path.sep}`);
};

const toCanonicalRelativePath = (root, candidate) => {
  const relative = path.relative(root, candidate);
  if (!relative || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw integrityError("runtime-package-path-invalid");
  }
  const normalized = relative.split(path.sep).join("/").normalize("NFC");
  if (!normalized || normalized.includes("\0")) throw integrityError("runtime-package-path-invalid");
  return normalized;
};

const sameFileSnapshot = (before, after) => before.isFile()
  && after.isFile()
  && before.size === after.size
  && before.mtimeMs === after.mtimeMs
  && before.dev === after.dev
  && before.ino === after.ino;

const hashStableFile = (filePath, before, fileSystem) => new Promise((resolve, reject) => {
  const digest = createHash("sha256");
  const stream = fileSystem.createReadStream(filePath);
  stream.on("error", reject);
  stream.on("data", (chunk) => digest.update(chunk));
  stream.on("end", async () => {
    try {
      const after = await fileSystem.promises.lstat(filePath);
      if (!sameFileSnapshot(before, after)) {
        reject(integrityError("runtime-package-file-changed"));
        return;
      }
      resolve(digest.digest("hex"));
    } catch (error) {
      reject(error);
    }
  });
});

const compareCanonicalEntries = (left, right) => Buffer.compare(
  Buffer.from(`${left.path}\0${left.type}`, "utf8"),
  Buffer.from(`${right.path}\0${right.type}`, "utf8"),
);

const digestCanonicalEntries = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) throw integrityError("runtime-package-tree-empty");
  entries.sort(compareCanonicalEntries);
  const digest = createHash("sha256");
  digest.update(`${runtimeTreeDigestFormat}\n`, "utf8");
  for (const entry of entries) digest.update(`${JSON.stringify(entry)}\n`, "utf8");
  return digest.digest("hex");
};

const validateIdentityInput = ({
  schemaVersion,
  protocol,
  productId,
  executableName,
  executableSha256,
  appVersion,
  runtimeTreeSha256,
}) => {
  const executableIsCanonical = typeof executableName === "string"
    && executableName.length <= 160
    && executableName === path.basename(executableName)
    && !/[\u0000-\u001f\u007f]/u.test(executableName);
  if (schemaVersion !== runtimePackageIdentitySchemaVersion
    || !canonicalTokenPattern.test(protocol || "")
    || !canonicalTokenPattern.test(productId || "")
    || !executableIsCanonical
    || !sha256Pattern.test(executableSha256 || "")
    || !versionPattern.test(appVersion || "")
    || appVersion !== appVersion?.trim()
    || !sha256Pattern.test(runtimeTreeSha256 || "")) {
    throw integrityError("runtime-package-identity-input-invalid");
  }
};

export const deriveRuntimePackageIdentityFromTreeDigest = (input = {}) => {
  validateIdentityInput(input);
  return createHash("sha256").update([
    runtimePackageIdentityFormat,
    `schemaVersion=${input.schemaVersion}`,
    `protocol=${input.protocol}`,
    `productId=${input.productId}`,
    `executableName=${input.executableName}`,
    `executableSha256=${input.executableSha256}`,
    `appVersion=${input.appVersion}`,
    `runtimeTreeSha256=${input.runtimeTreeSha256}`,
  ].join("\n"), "utf8").digest("hex");
};

export const hashCanonicalRuntimeTree = async ({
  runtimeRoot,
  platform = process.platform,
  fileSystem = defaultFileSystem,
} = {}) => {
  if (typeof runtimeRoot !== "string" || !path.isAbsolute(runtimeRoot)) {
    throw integrityError("runtime-package-root-invalid");
  }
  const resolvedRoot = path.resolve(runtimeRoot);
  let rootDetails;
  let canonicalRoot;
  try {
    [rootDetails, canonicalRoot] = await Promise.all([
      fileSystem.promises.lstat(resolvedRoot),
      fileSystem.promises.realpath(resolvedRoot),
    ]);
  } catch {
    throw integrityError("runtime-package-root-unavailable");
  }
  if (!rootDetails.isDirectory() || rootDetails.isSymbolicLink()
    || !equivalentPath(canonicalRoot, resolvedRoot, platform)) {
    throw integrityError("runtime-package-root-unsafe");
  }

  const entries = [];
  let totalBytes = 0;
  const visit = async (directory) => {
    let children;
    try {
      children = await fileSystem.promises.readdir(directory, { withFileTypes: true });
    } catch {
      throw integrityError("runtime-package-tree-unavailable");
    }
    children.sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
    for (const child of children) {
      const childPath = path.join(directory, child.name);
      const relativePath = toCanonicalRelativePath(resolvedRoot, childPath);
      let details;
      let canonicalPath;
      try {
        [details, canonicalPath] = await Promise.all([
          fileSystem.promises.lstat(childPath),
          fileSystem.promises.realpath(childPath),
        ]);
      } catch {
        throw integrityError("runtime-package-tree-unavailable");
      }
      if (details.isSymbolicLink() || !isPathInside(canonicalPath, canonicalRoot, platform)) {
        throw integrityError("runtime-package-entry-unsafe");
      }
      if (details.isDirectory()) {
        entries.push({ type: "directory", path: relativePath });
        await visit(childPath);
      } else if (details.isFile()) {
        if (!Number.isSafeInteger(details.size) || details.size < 0) {
          throw integrityError("runtime-package-entry-invalid");
        }
        totalBytes += details.size;
        if (totalBytes > maximumRuntimeBytes) throw integrityError("runtime-package-tree-too-large");
        let sha256;
        try {
          sha256 = await hashStableFile(childPath, details, fileSystem);
        } catch (error) {
          if (error?.code?.startsWith("runtime-package-")) throw error;
          throw integrityError("runtime-package-tree-unavailable");
        }
        entries.push({ type: "file", path: relativePath, size: details.size, sha256 });
      } else {
        throw integrityError("runtime-package-entry-unsafe");
      }
      if (entries.length > maximumRuntimeEntries) throw integrityError("runtime-package-tree-too-large");
    }
  };
  await visit(resolvedRoot);
  return digestCanonicalEntries(entries);
};

export const hashCanonicalRuntimeFile = async ({
  runtimeFile,
  platform = process.platform,
  fileSystem = defaultFileSystem,
} = {}) => {
  if (typeof runtimeFile !== "string" || !path.isAbsolute(runtimeFile)) {
    throw integrityError("runtime-package-root-invalid");
  }
  const resolvedFile = path.resolve(runtimeFile);
  let details;
  let canonicalFile;
  try {
    [details, canonicalFile] = await Promise.all([
      fileSystem.promises.lstat(resolvedFile),
      fileSystem.promises.realpath(resolvedFile),
    ]);
  } catch {
    throw integrityError("runtime-package-root-unavailable");
  }
  if (!details.isFile() || details.isSymbolicLink()
    || !equivalentPath(canonicalFile, resolvedFile, platform)
    || !Number.isSafeInteger(details.size) || details.size < 1) {
    throw integrityError("runtime-package-root-unsafe");
  }
  if (details.size > maximumRuntimeBytes) throw integrityError("runtime-package-tree-too-large");
  let sha256;
  try {
    sha256 = await hashStableFile(resolvedFile, details, fileSystem);
  } catch (error) {
    if (error?.code?.startsWith("runtime-package-")) throw error;
    throw integrityError("runtime-package-tree-unavailable");
  }
  return digestCanonicalEntries([{ type: "file", path: "app.asar", size: details.size, sha256 }]);
};

export const resolveRuntimePayload = async ({
  currentExecutable,
  platform = process.platform,
  fileSystem = defaultFileSystem,
} = {}) => {
  if (typeof currentExecutable !== "string" || !path.isAbsolute(currentExecutable)) {
    throw integrityError("runtime-package-executable-invalid");
  }
  const resourcesRoot = path.join(path.dirname(path.resolve(currentExecutable)), "resources");
  const appDirectory = path.join(resourcesRoot, "app");
  try {
    const details = await fileSystem.promises.lstat(appDirectory);
    if (!details.isDirectory() || details.isSymbolicLink()) throw integrityError("runtime-package-root-unsafe");
    return Object.freeze({ kind: "directory", path: appDirectory });
  } catch (error) {
    if (error?.code?.startsWith("runtime-package-")) throw error;
    if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") {
      throw integrityError("runtime-package-root-unavailable");
    }
  }
  const asarPath = path.join(resourcesRoot, "app.asar");
  const asarDetails = await fileSystem.promises.lstat(asarPath).catch(() => null);
  if (!asarDetails?.isFile() || asarDetails.isSymbolicLink()) {
    throw integrityError("runtime-package-root-unavailable");
  }
  return Object.freeze({ kind: "asar", path: asarPath, platform });
};

export const readRuntimePackageVersion = async ({
  currentExecutable,
  expectedVersion,
  fileSystem = defaultFileSystem,
} = {}) => {
  const payload = await resolveRuntimePayload({ currentExecutable, fileSystem });
  if (payload.kind !== "directory") throw integrityError("runtime-package-version-unavailable");
  let raw;
  try {
    raw = await fileSystem.promises.readFile(path.join(payload.path, "package.json"), "utf8");
  } catch {
    throw integrityError("runtime-package-version-unavailable");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw integrityError("runtime-package-version-invalid");
  }
  if (!parsed || typeof parsed !== "object" || !versionPattern.test(parsed.version || "")
    || parsed.version !== parsed.version.trim()) {
    throw integrityError("runtime-package-version-invalid");
  }
  if (typeof expectedVersion === "string" && parsed.version !== expectedVersion) {
    throw integrityError("runtime-package-version-mismatch");
  }
  return parsed.version;
};

export const deriveRuntimePackageIdentity = async ({
  currentExecutable,
  schemaVersion,
  protocol,
  productId,
  executableName,
  executableSha256,
  appVersion,
  platform = process.platform,
  fileSystem = defaultFileSystem,
} = {}) => {
  const payload = await resolveRuntimePayload({ currentExecutable, platform, fileSystem });
  const runtimeTreeSha256 = payload.kind === "directory"
    ? await hashCanonicalRuntimeTree({ runtimeRoot: payload.path, platform, fileSystem })
    : await hashCanonicalRuntimeFile({ runtimeFile: payload.path, platform, fileSystem });
  const packageIdentity = deriveRuntimePackageIdentityFromTreeDigest({
    schemaVersion,
    protocol,
    productId,
    executableName,
    executableSha256,
    appVersion,
    runtimeTreeSha256,
  });
  return Object.freeze({ runtimeTreeSha256, packageIdentity });
};
