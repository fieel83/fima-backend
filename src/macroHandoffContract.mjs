import { createHash } from "node:crypto";
import {
  deriveRuntimePackageIdentityFromTreeDigest,
  runtimePackageIdentitySchemaVersion,
} from "./runtime-package-integrity.mjs";

const productIdPattern = /^[a-z][a-z0-9-]{1,63}$/u;
const executableNamePattern = /^[^\\/\u0000-\u001f\u007f]{1,120}\.exe$/iu;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const identityPattern = /^[^\u0000-\u0020\u007f]{1,160}$/u;
const versionPattern = /^[^\u0000-\u001f\u007f]{1,80}$/u;

export const runtimeHandoffProtocol = "fima-runtime-handoff-v1";
export const runtimeHandoffLifetimeMs = 75_000;
export const runtimeHandoffGrantPattern = /^[A-Za-z0-9_-]{43}$/u;

const contractError = (code) => Object.assign(new Error(code), { code });

const normalizeRequired = (value, pattern, code) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!pattern.test(normalized)) throw contractError(code);
  return normalized;
};

const normalizeSha256 = (value, code) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!sha256Pattern.test(normalized)) throw contractError(code);
  return normalized;
};

export const deriveRuntimeHandoffPackageIdentity = ({ productId, executableName } = {}) => {
  const canonical = [
    "fima-runtime-package-identity:v1",
    `product=${normalizeRequired(productId, productIdPattern, "runtime-handoff-product-invalid")}`,
    `executable=${normalizeRequired(executableName, executableNamePattern, "runtime-handoff-executable-name-invalid")}`,
  ].join("\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
};

export const createRuntimeHandoffContract = ({
  schemaVersion = 1,
  productId,
  executableName,
  executableSha256,
  appVersion,
  runtimeTreeSha256,
  packageIdentity,
  feature,
  ownerOnly = false,
  protocol = runtimeHandoffProtocol,
  aliases = [],
} = {}) => {
  const normalizedProductId = normalizeRequired(
    productId,
    productIdPattern,
    "runtime-handoff-product-invalid",
  );
  const normalizedExecutableName = normalizeRequired(
    executableName,
    executableNamePattern,
    "runtime-handoff-executable-name-invalid",
  );
  const normalizedProtocol = normalizeRequired(
    protocol,
    /^[a-z][a-z0-9-]{1,79}$/u,
    "runtime-handoff-protocol-invalid",
  );
  const normalizedFeature = normalizeRequired(
    feature,
    /^[a-z][a-z0-9_]{1,63}$/u,
    "runtime-handoff-feature-invalid",
  );
  const normalizedAliases = [...new Set(aliases.map((alias) => normalizeRequired(
    alias,
    productIdPattern,
    "runtime-handoff-product-invalid",
  )))];
  if (normalizedAliases.includes(normalizedProductId)) {
    throw contractError("runtime-handoff-product-invalid");
  }
  if (schemaVersion !== 1 && schemaVersion !== runtimePackageIdentitySchemaVersion) {
    throw contractError("runtime-handoff-schema-invalid");
  }
  const normalizedExecutableSha256 = normalizeSha256(
    executableSha256,
    "runtime-handoff-executable-invalid",
  );
  let normalizedAppVersion = null;
  let normalizedRuntimeTreeSha256 = null;
  let normalizedPackageIdentity;
  if (schemaVersion === runtimePackageIdentitySchemaVersion) {
    normalizedAppVersion = normalizeRequired(
      appVersion,
      versionPattern,
      "runtime-handoff-app-version-invalid",
    );
    normalizedRuntimeTreeSha256 = normalizeSha256(
      runtimeTreeSha256,
      "runtime-handoff-runtime-tree-invalid",
    );
    normalizedPackageIdentity = deriveRuntimePackageIdentityFromTreeDigest({
      schemaVersion,
      protocol: normalizedProtocol,
      productId: normalizedProductId,
      executableName: normalizedExecutableName,
      executableSha256: normalizedExecutableSha256,
      appVersion: normalizedAppVersion,
      runtimeTreeSha256: normalizedRuntimeTreeSha256,
    });
    if (normalizeSha256(packageIdentity, "runtime-handoff-package-invalid")
      !== normalizedPackageIdentity) {
      throw contractError("runtime-handoff-package-invalid");
    }
  } else {
    normalizedPackageIdentity = deriveRuntimeHandoffPackageIdentity({
      productId: normalizedProductId,
      executableName: normalizedExecutableName,
    });
  }
  return Object.freeze({
    schemaVersion,
    protocol: normalizedProtocol,
    productId: normalizedProductId,
    executableName: normalizedExecutableName,
    executableSha256: normalizedExecutableSha256,
    appVersion: normalizedAppVersion,
    runtimeTreeSha256: normalizedRuntimeTreeSha256,
    packageIdentity: normalizedPackageIdentity,
    feature: normalizedFeature,
    ownerOnly: ownerOnly === true,
    aliases: Object.freeze(normalizedAliases),
  });
};

export const runtimeHandoffDefaultContract = createRuntimeHandoffContract({
  productId: "fima-macro",
  executableName: "FimaMacroStudio.exe",
  executableSha256: "b47bb0472b045f52bad640fdb0b463ab1ccc57d043499574b1a33840755d3560",
  feature: "macro_runtime",
  aliases: ["fima-macro-owner"],
});

export const runtimeHandoffProductId = runtimeHandoffDefaultContract.productId;
export const runtimeHandoffExecutableName = runtimeHandoffDefaultContract.executableName;
export const runtimeHandoffExecutableSha256 = runtimeHandoffDefaultContract.executableSha256;
export const runtimeHandoffPackageIdentity = runtimeHandoffDefaultContract.packageIdentity;

export const createRuntimeHandoffRegistry = (contracts = [
  runtimeHandoffDefaultContract,
]) => {
  const registry = new Map();
  for (const contract of contracts) {
    if (!contract || typeof contract !== "object") throw contractError("runtime-handoff-contract-invalid");
    for (const productId of [contract.productId, ...(contract.aliases || [])]) {
      if (registry.has(productId)) throw contractError("runtime-handoff-product-duplicate");
      registry.set(productId, contract);
    }
  }
  return registry;
};

export const runtimeHandoffContractRegistry = createRuntimeHandoffRegistry();

export const resolveRuntimeHandoffContract = (
  productOrId,
  registry = runtimeHandoffContractRegistry,
) => {
  const productId = typeof productOrId === "string" ? productOrId : productOrId?.id;
  const contract = registry instanceof Map
    ? registry.get(productId)
    : registry?.[productId];
  if (!contract) throw contractError("runtime-handoff-product-invalid");
  return contract;
};

export const normalizeRuntimeHandoffIdentity = (
  value,
  { allowMissingLicense = false } = {},
) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw contractError("runtime-handoff-identity-invalid");
  }
  const licenseId = value.licenseId === null && allowMissingLicense === true
    ? null
    : normalizeRequired(value.licenseId, identityPattern, "runtime-handoff-license-id-invalid");
  const identity = Object.freeze({
    licenseId,
    userId: normalizeRequired(value.userId, identityPattern, "runtime-handoff-user-id-invalid"),
    accountId: normalizeRequired(value.accountId, identityPattern, "runtime-handoff-account-id-invalid"),
  });
  if (identity.accountId !== identity.userId) throw contractError("runtime-handoff-account-mismatch");
  return identity;
};

export const createRuntimeHandoffBinding = (value, {
  contract = runtimeHandoffDefaultContract,
} = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw contractError("runtime-handoff-binding-invalid");
  }
  const hwid = normalizeRequired(
    value.hwid ?? value.hardwareId,
    /^FIMA-DEVICE-[A-F0-9]{64}$/u,
    "runtime-handoff-hwid-invalid",
  );
  const appVersion = normalizeRequired(
    value.appVersion,
    versionPattern,
    "runtime-handoff-app-version-invalid",
  );
  const executableSha256 = normalizeSha256(
    value.executableSha256,
    "runtime-handoff-executable-invalid",
  );
  if (executableSha256 !== contract.executableSha256) {
    throw contractError("runtime-handoff-executable-invalid");
  }
  if (contract.schemaVersion === runtimePackageIdentitySchemaVersion) {
    if (appVersion !== contract.appVersion) {
      throw contractError("runtime-handoff-app-version-invalid");
    }
    if (normalizeSha256(value.runtimeTreeSha256, "runtime-handoff-runtime-tree-invalid")
      !== contract.runtimeTreeSha256) {
      throw contractError("runtime-handoff-runtime-tree-invalid");
    }
    if (normalizeSha256(value.packageIdentity, "runtime-handoff-package-invalid")
      !== contract.packageIdentity) {
      throw contractError("runtime-handoff-package-invalid");
    }
  }
  const binding = {
    protocol: contract.protocol,
    productId: contract.productId,
    hwid,
    executableSha256,
    packageIdentity: contract.schemaVersion === runtimePackageIdentitySchemaVersion
      ? normalizeSha256(value.packageIdentity, "runtime-handoff-package-invalid")
      : contract.packageIdentity,
    appVersion,
  };
  if (contract.schemaVersion === runtimePackageIdentitySchemaVersion) {
    binding.schemaVersion = contract.schemaVersion;
    binding.runtimeTreeSha256 = contract.runtimeTreeSha256;
  }
  return Object.freeze(binding);
};

export const normalizeRuntimeHandoffBinding = (value, {
  contract = runtimeHandoffDefaultContract,
} = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw contractError("runtime-handoff-binding-invalid");
  }
  if (value.protocol !== contract.protocol) throw contractError("runtime-handoff-protocol-invalid");
  if (value.productId !== contract.productId) throw contractError("runtime-handoff-product-invalid");
  const binding = createRuntimeHandoffBinding({
    hardwareId: value.hwid,
    executableSha256: value.executableSha256,
    appVersion: value.appVersion,
    runtimeTreeSha256: value.runtimeTreeSha256,
    packageIdentity: value.packageIdentity,
  }, { contract });
  if (normalizeSha256(value.packageIdentity, "runtime-handoff-package-invalid")
    !== contract.packageIdentity) {
    throw contractError("runtime-handoff-package-invalid");
  }
  return binding;
};

export const normalizeRuntimeHandoffGrant = (value, {
  identity,
  verifiedAt,
  contract = runtimeHandoffDefaultContract,
} = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.valid !== true
    || value.canUseApp !== true
    || value.protocol !== contract.protocol
    || value.productId !== contract.productId
    || !runtimeHandoffGrantPattern.test(value.grant || "")) {
    throw contractError("runtime-handoff-response-invalid");
  }
  const expectedIdentity = normalizeRuntimeHandoffIdentity(identity);
  const responseIdentity = normalizeRuntimeHandoffIdentity(value);
  if (responseIdentity.licenseId !== expectedIdentity.licenseId
    || responseIdentity.userId !== expectedIdentity.userId
    || responseIdentity.accountId !== expectedIdentity.accountId) {
    throw contractError("runtime-handoff-response-identity-mismatch");
  }
  const verifiedTime = verifiedAt instanceof Date ? verifiedAt.getTime() : Date.parse(verifiedAt || "");
  const expiresTime = Date.parse(value.grantExpiresAt || "");
  if (!Number.isFinite(verifiedTime)
    || !Number.isFinite(expiresTime)
    || expiresTime <= verifiedTime
    || expiresTime > verifiedTime + runtimeHandoffLifetimeMs + 5_000) {
    throw contractError("runtime-handoff-expiry-invalid");
  }
  return Object.freeze({
    protocol: contract.protocol,
    productId: contract.productId,
    grant: value.grant,
    grantExpiresAt: new Date(expiresTime).toISOString(),
    ...responseIdentity,
  });
};
