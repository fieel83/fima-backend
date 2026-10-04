function normalizedHostname(value) {
  return String(value || "").trim().replace(/\.$/, "").toLowerCase();
}

function normalizedHost(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  try {
    return new URL(`http://${source}`).host.toLowerCase();
  } catch {
    return source.toLowerCase();
  }
}

export function paradiseFrontendRedirectUrl({
  requestHostname = "",
  requestHost = "",
  frontendBaseUrl = "",
  apiBaseUrl = "",
  dashboardPath = "/fima-bot/dashboard"
} = {}) {
  try {
    const api = new URL(apiBaseUrl);
    const requestApiHostname = normalizedHostname(requestHostname);
    if (!requestApiHostname || requestApiHostname !== normalizedHostname(api.hostname)) return null;

    const path = String(dashboardPath || "");
    const safePath = /^\/fima-bot\/(?:dashboard(?:\/(?:servers\/)?\d{16,22}(?:\/[a-z][a-z0-9-]{0,39})?)?|owner(?:\/dashboard)?)$/.test(path)
      ? path
      : "/fima-bot/dashboard";
    const target = new URL(safePath, `${String(frontendBaseUrl).replace(/\/+$/, "")}/`);
    const currentHost = normalizedHost(requestHost);
    if (currentHost && currentHost === target.host.toLowerCase()) return null;
    if (!currentHost && requestApiHostname === normalizedHostname(target.hostname)) return null;
    return target.toString();
  } catch {
    return null;
  }
}

/**
 * Build the public application URL used by legacy FIMA Bot aliases.
 *
 * Only the two supported workflow families and a conservative application
 * type slug are copied.  This keeps old links useful without reflecting
 * arbitrary query data (or unsafe redirect parameters) into the destination.
 */
export function paradiseApplicationRedirectPath({ workflow = "", type = "" } = {}) {
  const params = new URLSearchParams();
  const normalizedWorkflow = String(workflow || "").trim().toLowerCase();
  const normalizedType = String(type || "").trim().toLowerCase();
  if (["staff", "business"].includes(normalizedWorkflow)) params.set("workflow", normalizedWorkflow);
  if (/^[a-z][a-z0-9_]{0,47}$/.test(normalizedType)) params.set("type", normalizedType);
  const suffix = params.toString();
  return `/fima-bot/apply${suffix ? `?${suffix}` : ""}`;
}
