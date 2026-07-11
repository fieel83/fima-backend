export const LEGACY_PARADISE_STATE_BUCKETS = Object.freeze({
  profiles: "guild_profiles/global_verified_identities",
  verificationChallenges: "profile_verification_challenges",
  pendingTryouts: "tryout_results",
  pendingChallenges: "challenge_tickets",
  trainings: "training_sessions",
  tournaments: "tournaments",
  leaderboard: "leaderboard_entries",
  leaderboards: "leaderboard_entries",
  staffActivity: "staff_activity",
  activityChecks: "activity_checks",
  whitelists: "security_whitelists",
  giveaways: "giveaways",
  rsvps: "event_rsvps",
  relations: "guild_relations",
  loa: "availability_loa",
  config: "guild_configurations",
  guildConfigs: "guild_configurations",
  ticketOptOuts: "ticket_preferences",
  transcripts: "ticket_transcripts",
  rosters: "roster_entries",
  lineups: "lineup_entries",
  blacklists: "blacklist_cases",
  appeals: "appeal_cases",
  bails: "bail_reviews",
  serverBackups: "guild_backups",
  realAudits: "guild_audits",
  setupPreviews: "setup_previews",
  temporaryVoices: "temporary_voice_rooms",
  memberLevels: "guild_member_xp",
  questionOfDay: "daily_questions",
  applications: "applications",
  applicationDrafts: "application_drafts",
  moderationCases: "moderation_cases",
  securityState: "guild_security_state",
  supportTickets: "support_tickets"
});

export function buildParadiseLegacyStateInventory(state = {}) {
  const buckets = Object.entries(LEGACY_PARADISE_STATE_BUCKETS).map(([legacyBucket, target]) => {
    const source = state?.[legacyBucket];
    return {
      legacyBucket,
      target,
      present: Boolean(source && typeof source === "object"),
      count: source && typeof source === "object" ? Object.keys(source).length : 0,
      migrationRule: legacyBucket === "config" || legacyBucket === "guildConfigs"
        ? "migrate after schema and guild-scope validation"
        : "migrate only after duplicate and referential-integrity validation"
    };
  });
  return {
    schemaVersion: 1,
    totalBuckets: buckets.length,
    presentBuckets: buckets.filter(item => item.present).length,
    totalRecords: buckets.reduce((sum, item) => sum + item.count, 0),
    buckets
  };
}
