export function parseAppVersion(value) {
  const text = String(value || "").trim().replace(/^v/i, "").split("+")[0];
  const match = text.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match) return null;
  return [match[1], match[2], match[3], match[4]].map((part) => Number(part || 0));
}

export function compareAppVersions(left, right) {
  const leftParts = parseAppVersion(left);
  const rightParts = parseAppVersion(right);
  if (!leftParts || !rightParts) return null;
  for (let index = 0; index < 4; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }
  return 0;
}

export function minimumAppVersionStatus(appVersion, minimumVersion) {
  const configuredMinimum = String(minimumVersion || "").trim();
  if (!configuredMinimum) {
    return { configured: false, updateRequired: false, reason: "not_configured" };
  }

  if (!parseAppVersion(configuredMinimum)) {
    return {
      configured: true,
      updateRequired: false,
      reason: "invalid_minimum_config",
      minimumVersion: configuredMinimum
    };
  }

  const normalizedAppVersion = String(appVersion || "").trim();
  if (!parseAppVersion(normalizedAppVersion)) {
    return {
      configured: true,
      updateRequired: true,
      reason: "missing_or_invalid_app_version",
      minimumVersion: configuredMinimum,
      appVersion: normalizedAppVersion || null
    };
  }

  const comparison = compareAppVersions(normalizedAppVersion, configuredMinimum);
  return {
    configured: true,
    updateRequired: comparison !== null && comparison < 0,
    reason: comparison !== null && comparison < 0 ? "below_minimum" : "meets_minimum",
    minimumVersion: configuredMinimum,
    appVersion: normalizedAppVersion
  };
}
