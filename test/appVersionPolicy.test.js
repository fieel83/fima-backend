import test from "node:test";
import assert from "node:assert/strict";
import { compareAppVersions, minimumAppVersionStatus, parseAppVersion } from "../src/appVersionPolicy.js";

test("app version parsing accepts release versions and build metadata", () => {
  assert.deepEqual(parseAppVersion("1.0.127"), [1, 0, 127, 0]);
  assert.deepEqual(parseAppVersion("v1.0.127+abc123"), [1, 0, 127, 0]);
  assert.equal(parseAppVersion("dev-build"), null);
});

test("app version comparison orders semantic releases", () => {
  assert.equal(compareAppVersions("1.0.126", "1.0.127"), -1);
  assert.equal(compareAppVersions("1.0.127", "1.0.127"), 0);
  assert.equal(compareAppVersions("1.0.128", "1.0.127"), 1);
});

test("minimum app version policy is default-off and blocks old or missing versions when enabled", () => {
  assert.equal(minimumAppVersionStatus("1.0.1", "").updateRequired, false);
  assert.equal(minimumAppVersionStatus("1.0.126", "1.0.127").updateRequired, true);
  assert.equal(minimumAppVersionStatus("1.0.127+build", "1.0.127").updateRequired, false);
  assert.equal(minimumAppVersionStatus("", "1.0.127").reason, "missing_or_invalid_app_version");
  assert.equal(minimumAppVersionStatus("1.0.126", "bad-config").updateRequired, false);
});
