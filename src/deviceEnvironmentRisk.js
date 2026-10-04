const keys = ["hypervisor", "vmMarker", "virtualHardware", "cloudPc"];

// Client positives can increase risk; client negatives never override trusted
// gateway evidence and cannot authorize a trial. Store only bounded booleans.
export function normalizeDeviceEnvironmentRisk(value) {
  return Object.fromEntries([[
    "collected", value?.collected === true,
  ], ...keys.map(key => [key, value?.[key] === true])]);
}

export function combineDeviceEnvironmentRisk(trusted = {}, advisory = {}) {
  return Object.fromEntries(keys.map(key => [key, trusted?.[key] === true || advisory?.[key] === true]));
}
