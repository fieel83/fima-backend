const STATUS_ORDER = Object.freeze({ healthy: 0, auto_repairable: 1, owner_review_required: 2, unsafe_blocking: 3 });
export const PARADISE_RECONCILIATION_MIN_INTERVAL_MS = 15 * 60_000;

function highestStatus(issues) {
  return issues.reduce((highest, issue) => STATUS_ORDER[issue.status] > STATUS_ORDER[highest] ? issue.status : highest, "healthy");
}

function safeIssue(status, code, details = {}) {
  return { status, code, ...details };
}

export function buildParadiseReconciliation({ state = {}, managedGuildIds = [], existingChannelIds = [], existingMessageIds = [] } = {}) {
  const issues = [];
  const managed = new Set(managedGuildIds.map(String));
  const channels = new Set(existingChannelIds.map(String));
  const messages = new Set(existingMessageIds.map(String));
  const configs = state.guildConfigs && typeof state.guildConfigs === "object" ? state.guildConfigs : {};

  for (const [guildId, config] of Object.entries(configs)) {
    if (managed.size && !managed.has(String(guildId))) {
      issues.push(safeIssue("owner_review_required", "orphaned_guild_config", { guildId: String(guildId) }));
      continue;
    }
    for (const [key, channelId] of Object.entries(config?.channelMappings || {})) {
      if (channels.size && !channels.has(String(channelId))) {
        issues.push(safeIssue("auto_repairable", "missing_mapped_channel", { guildId: String(guildId), mappingKey: key }));
      }
    }
    for (const [key, messageId] of Object.entries(config?.smokePanelMessageIds || {})) {
      if (messages.size && !messages.has(String(messageId))) {
        issues.push(safeIssue("auto_repairable", "missing_canonical_message", { guildId: String(guildId), panelKey: key }));
      }
    }
  }

  for (const [guildId, leaderboard] of Object.entries(state.leaderboards || {})) {
    const seenPositions = new Set();
    for (const entry of Object.values(leaderboard || {})) {
      const spot = Number(entry?.spot);
      if (!Number.isInteger(spot) || spot < 1) continue;
      if (seenPositions.has(spot)) {
        issues.push(safeIssue("unsafe_blocking", "duplicate_leaderboard_position", { guildId: String(guildId), spot }));
      }
      seenPositions.add(spot);
    }
  }

  for (const record of Object.values(state.supportTickets || {})) {
    if (record?.guildId && managed.size && !managed.has(String(record.guildId))) {
      issues.push(safeIssue("owner_review_required", "orphaned_ticket_record", { guildId: String(record.guildId) }));
    }
  }

  const status = highestStatus(issues);
  return {
    schemaVersion: 1,
    status,
    healthy: status === "healthy",
    autoRepairExecuted: false,
    issueCount: issues.length,
    issues,
    checked: {
      guildConfigs: Object.keys(configs).length,
      leaderboards: Object.keys(state.leaderboards || {}).length,
      supportTickets: Object.keys(state.supportTickets || {}).length
    }
  };
}

export function shouldRunParadiseReconciliation({ lastRunAt = null, now = Date.now(), minimumIntervalMs = PARADISE_RECONCILIATION_MIN_INTERVAL_MS } = {}) {
  const previous = Date.parse(String(lastRunAt || ""));
  return !Number.isFinite(previous) || Number(now) - previous >= Number(minimumIntervalMs);
}

export function summarizeParadiseReconciliation(result = {}, now = new Date().toISOString()) {
  const issues = Array.isArray(result.issues) ? result.issues : [];
  return Object.freeze({
    lastRunAt: now,
    status: result.status || "unsafe_blocking",
    healthy: result.healthy === true,
    issueCount: Number(result.issueCount || 0),
    issueCodes: [...new Set(issues.map(issue => String(issue?.code || "unknown")))].sort(),
    checked: {
      guildConfigs: Number(result.checked?.guildConfigs || 0),
      leaderboards: Number(result.checked?.leaderboards || 0),
      supportTickets: Number(result.checked?.supportTickets || 0)
    },
    autoRepairExecuted: false
  });
}
