import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  computeFtCommunityReleaseDigest,
  createVerifiedFtCommunityReleaseBinding,
  FT_COMMUNITY_CRITICAL_RELEASE_FILES,
  inspectFtCommunityReleaseAttestation
} from "../src/ftCommunityReleaseAttestation.js";

const COMMIT = "a".repeat(40);
const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const PRODUCTION_MUTATION_ENTRYPOINTS = Object.freeze([
  "scripts/ft-community-production.js",
  "scripts/paradise-test-guild.js",
  "src/server.js"
]);

function relativeRepositoryPath(absolutePath) {
  return path.relative(REPOSITORY_ROOT, absolutePath).replaceAll("\\", "/");
}

function localImportClosure(entrypoints) {
  const pending = [...entrypoints];
  const visited = new Set();
  const localImport = /(?:\b(?:import|export)\s+(?:[^;"']*?\s+from\s+)?|\bimport\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/gu;

  while (pending.length > 0) {
    const relativePath = pending.pop();
    if (visited.has(relativePath)) continue;
    visited.add(relativePath);
    const absolutePath = path.join(REPOSITORY_ROOT, ...relativePath.split("/"));
    const source = fs.readFileSync(absolutePath, "utf8");
    for (const match of source.matchAll(localImport)) {
      const dependency = path.resolve(path.dirname(absolutePath), match[1]);
      let dependencyPath = relativeRepositoryPath(dependency);
      if (!path.extname(dependencyPath)) dependencyPath += ".js";
      pending.push(dependencyPath);
    }
  }

  return [...visited].sort();
}

function regularFilesRecursively(relativeDirectory) {
  const absoluteDirectory = path.join(REPOSITORY_ROOT, ...relativeDirectory.split("/"));
  const pending = [absoluteDirectory];
  const files = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(absolutePath);
      else if (entry.isFile()) files.push(relativeRepositoryPath(absolutePath));
    }
  }
  return files.sort();
}

function readyEnvironment(overrides = {}) {
  return {
    RENDER_GIT_COMMIT: COMMIT,
    FT_COMMUNITY_APPROVED_RENDER_COMMIT: COMMIT,
    FT_COMMUNITY_APPROVED_RELEASE_SHA256: computeFtCommunityReleaseDigest(),
    ...overrides
  };
}

test("critical FT release digest is deterministic and covers the mutation surface", () => {
  const first = computeFtCommunityReleaseDigest();
  const second = computeFtCommunityReleaseDigest();
  assert.match(first, /^[a-f0-9]{64}$/u);
  assert.equal(first, second);
  for (const required of [
    "scripts/ft-community-production.js",
    "scripts/paradise-test-guild.js",
    "src/communityActivity.js",
    "src/communityGuildPolicy.js",
    "src/db.js",
    "src/discordBot.js",
    "src/ftCommunityProductionOrchestrator.js",
    "src/paradiseCommandRegistry.js",
    "src/paradiseComponentProtocol.js",
    "src/paradiseFeatureFlags.js",
    "src/paradise3a59.js",
    "src/paradiseRbac.js",
    "src/paradiseReconciliation.js",
    "src/runtimeEnvironment.js",
    "src/server.js",
    "prisma/schema.prisma",
    "public/assets/images/discord/extended-v2/discord-extended-asset-manifest-v2.json",
    "public/assets/images/discord/v5/discord-asset-manifest-v5.json"
  ]) {
    assert.ok(FT_COMMUNITY_CRITICAL_RELEASE_FILES.includes(required), required);
  }
});

test("critical release manifest is closed over every local production mutation import", () => {
  const closure = localImportClosure(PRODUCTION_MUTATION_ENTRYPOINTS);
  const unattested = closure.filter(relativePath => !FT_COMMUNITY_CRITICAL_RELEASE_FILES.includes(relativePath));
  assert.deepEqual(unattested, [], `unattested local production dependencies:\n${unattested.join("\n")}`);
});

test("critical release manifest covers every Prisma migration file", () => {
  const migrationFiles = regularFilesRecursively("prisma/migrations");
  assert.ok(migrationFiles.some(relativePath => relativePath.endsWith("/migration.sql")));
  const unattested = migrationFiles.filter(relativePath => !FT_COMMUNITY_CRITICAL_RELEASE_FILES.includes(relativePath));
  assert.deepEqual(unattested, [], `unattested Prisma migration files:\n${unattested.join("\n")}`);
});

test("digest framing detects file names, lengths and byte changes", () => {
  const bytes = new Map([["a.txt", Buffer.from("ab")], ["b.txt", Buffer.from("c")]]);
  const digest = () => computeFtCommunityReleaseDigest({
    repositoryRoot: "fixture",
    files: ["b.txt", "a.txt"],
    readFileSync(filePath) {
      return bytes.get(String(filePath).replaceAll("\\", "/").split("/").at(-1));
    }
  });
  const initial = digest();
  bytes.set("a.txt", Buffer.from("a"));
  bytes.set("b.txt", Buffer.from("bc"));
  assert.notEqual(digest(), initial);
  assert.throws(() => computeFtCommunityReleaseDigest({
    files: ["../outside"],
    readFileSync: () => Buffer.alloc(0)
  }), error => error?.code === "ft_community_release_manifest_invalid");
});

test("release attestation verifies exact Render commit and reviewed digest", () => {
  const environment = readyEnvironment();
  const status = inspectFtCommunityReleaseAttestation(environment);
  assert.equal(status.ready, true);
  assert.equal(status.code, "ft_community_release_attestation_verified");
  assert.equal(status.criticalFileCount, FT_COMMUNITY_CRITICAL_RELEASE_FILES.length);
  assert.equal(Object.hasOwn(status, "revision"), false);
  assert.equal(Object.hasOwn(status, "criticalDigest"), false);
  assert.equal(JSON.stringify(status).includes(environment.RENDER_GIT_COMMIT), false);
  assert.equal(JSON.stringify(status).includes(environment.FT_COMMUNITY_APPROVED_RELEASE_SHA256), false);
});

test("verified server-side release binding contains the exact attested revision and digest", () => {
  const environment = readyEnvironment();
  const binding = createVerifiedFtCommunityReleaseBinding(environment);
  assert.deepEqual(binding, {
    revision: COMMIT,
    criticalDigest: environment.FT_COMMUNITY_APPROVED_RELEASE_SHA256
  });
  assert.equal(Object.isFrozen(binding), true);

  assert.throws(
    () => createVerifiedFtCommunityReleaseBinding({
      ...environment,
      FT_COMMUNITY_APPROVED_RENDER_COMMIT: "b".repeat(40)
    }),
    error => error?.code === "ft_community_release_attestation_mismatch"
  );
});

test("missing, drifted and unreadable release evidence fails closed without values", () => {
  const cases = [
    [
      { ...readyEnvironment(), FT_COMMUNITY_APPROVED_RENDER_COMMIT: "b".repeat(40) },
      {},
      "FT_COMMUNITY_APPROVED_RENDER_COMMIT"
    ],
    [
      { ...readyEnvironment(), FT_COMMUNITY_APPROVED_RELEASE_SHA256: "c".repeat(64) },
      {},
      "FT_COMMUNITY_APPROVED_RELEASE_SHA256"
    ],
    [
      readyEnvironment(),
      { readFileSync: () => { throw new Error("unreadable"); } },
      "FT_COMMUNITY_APPROVED_RELEASE_SHA256"
    ]
  ];
  for (const [environment, options, expectedInvalid] of cases) {
    const status = inspectFtCommunityReleaseAttestation(environment, options);
    assert.equal(status.ready, false);
    assert.ok(status.invalid.includes(expectedInvalid));
    const serialized = JSON.stringify(status);
    assert.equal(serialized.includes(environment.RENDER_GIT_COMMIT), false);
    assert.equal(serialized.includes(environment.FT_COMMUNITY_APPROVED_RELEASE_SHA256), false);
  }

  const missingEnvironment = readyEnvironment();
  delete missingEnvironment.RENDER_GIT_COMMIT;
  const missing = inspectFtCommunityReleaseAttestation(missingEnvironment);
  assert.equal(missing.ready, false);
  assert.ok(missing.missing.includes("RENDER_GIT_COMMIT"));
});
