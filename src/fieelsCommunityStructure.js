const STAFF_ROLE_KEYS = Object.freeze([
  "helper",
  "junior_moderator",
  "moderator",
  "administrator",
  "owner"
]);

const VIDEO_TEAM_ROLE_KEYS = Object.freeze([
  "video_team",
  "video_editor",
  "thumbnail_designer"
]);

export const FIEELS_COMMUNITY_STRUCTURE_REVISION = "identity-naming-video-team-v2";

export const FIEELS_COMMUNITY_NAMING_STYLE = Object.freeze({
  categoryFrame: "╾━ {name} ━╼",
  importantMarker: "⫸",
  normalMarker: "⟢",
  privateMarker: "⫷",
  textSeparator: "・",
  voiceStyle: "⟢ {name}",
  roleSeparatorStyle: "╺╾ {name} ╼╸"
});

const CATEGORY_DEFINITIONS = Object.freeze([
  {
    key: "onboarding",
    names: { en: "START", tr: "BAŞLANGIÇ" },
    channels: [
      ["start_here", "important", "text", "start-here", "başlangıç"],
      ["rules", "important", "text", "rules", "kurallar"],
      ["announcements", "important", "text", "announcements", "duyurular"],
      ["choose_language", "normal", "text", "choose-language", "dil-seçimi"]
    ]
  },
  {
    key: "community",
    names: { en: "COMMUNITY", tr: "TOPLULUK" },
    channels: [
      ["general", "normal", "text", "general", "sohbet"],
      ["media", "normal", "text", "media", "medya"],
      ["events", "normal", "text", "events", "etkinlikler"],
      ["levels", "normal", "text", "levels", "seviyeler"]
    ]
  },
  {
    key: "fima",
    names: { en: "FIMA", tr: "FIMA" },
    channels: [
      ["fima_updates", "important", "text", "fima-updates", "fima-güncellemeleri"],
      ["fima_support", "important", "text", "fima-support", "fima-destek"],
      ["fima_guide", "normal", "text", "fima-guide", "fima-rehberi"]
    ]
  },
  {
    key: "fieel_style",
    names: { en: "FIEEL STYLE", tr: "FIEEL STİLİ" },
    channels: [
      ["style_showcase", "normal", "text", "style-showcase", "stil-vitrini"],
      ["creative_lab", "normal", "text", "creative-lab", "yaratıcı-atölye"]
    ]
  },
  {
    key: "turkish",
    names: { en: "TURKISH COMMUNITY", tr: "TÜRKÇE TOPLULUK" },
    access: "turkish_role",
    channels: [
      ["turkish_chat", "normal", "text", "turkish-chat", "türk-sohbet"],
      ["turkish_media", "normal", "text", "turkish-media", "türk-medya"],
      ["turkish_announcements", "important", "text", "turkish-announcements", "türk-duyurular"],
      ["turkish_voice", "normal", "voice", "Turkish Voice", "Türk Ses"]
    ]
  },
  {
    key: "support",
    names: { en: "SUPPORT", tr: "DESTEK" },
    channels: [
      ["support", "important", "text", "support", "destek"],
      ["support_faq", "normal", "text", "support-faq", "destek-sss"]
    ]
  },
  {
    key: "personnel",
    names: { en: "PERSONNEL", tr: "PERSONEL" },
    access: "staff",
    channels: [
      ["staff_hub", "private", "text", "staff-hub", "personel-merkezi"],
      ["staff_guides", "important", "text", "staff-guides", "personel-rehberleri"],
      ["reviews", "private", "text", "reviews", "incelemeler"],
      ["transcripts", "private", "text", "transcripts", "kayıt-dökümleri"],
      ["security_logs", "private", "text", "security-logs", "güvenlik-kayıtları"]
    ]
  },
  {
    key: "video_team",
    names: { en: "VIDEO TEAM", tr: "VIDEO EKIBI" },
    access: "video_team",
    channels: [
      ["video_hub", "private", "text", "video-hub", "video-merkezi"],
      ["video_ideas", "private", "text", "video-ideas", "video-fikirleri"],
      ["video_scripts", "private", "text", "video-scripts", "video-senaryolari"],
      ["video_assets", "private", "text", "video-assets", "video-dosyalari"],
      ["video_review", "private", "text", "video-review", "video-inceleme"],
      ["video_upload_schedule", "private", "text", "video-upload-schedule", "video-yayin-takvimi"],
      ["video_voice", "private", "voice", "Video Team Voice", "Video Ekibi Sesi"]
    ]
  },
  {
    key: "voice",
    names: { en: "VOICE", tr: "SES" },
    channels: [
      ["community_voice", "normal", "voice", "Community Lounge", "Topluluk Salonu"],
      ["focus_voice", "normal", "voice", "Focus Room", "Odak Odası"]
    ]
  }
]);

const ROLE_GROUPS = Object.freeze([
  ["ownership", "OWNERSHIP", "SAHİPLİK", ["owner"]],
  ["administration", "ADMINISTRATION", "YÖNETİM", ["administrator"]],
  ["moderation", "MODERATION", "MODERASYON", ["moderator", "junior_moderator", "helper"]],
  ["video_team", "VIDEO TEAM", "VIDEO EKIBI", [...VIDEO_TEAM_ROLE_KEYS]],
  ["community", "COMMUNITY", "TOPLULUK", ["member"]],
  ["language", "LANGUAGE", "DİL", ["turkish", "english"]],
  ["ping", "PING ROLES", "BİLDİRİM ROLLERİ", []],
  ["product", "PRODUCTS", "ÜRÜNLER", []],
  ["trust", "TRUST & LEVEL", "GÜVEN & SEVİYE", []]
]);

function localized(value, language) {
  return value?.[language] || value?.en || "";
}

function cleanStyleValue(value, fallback, { maxLength = 64, requiresName = false } = {}) {
  const cleaned = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
  if (!cleaned || (requiresName && !cleaned.includes("{name}"))) return fallback;
  return cleaned;
}

export function normalizeFieelsCommunityNamingStyle(style = {}) {
  const value = style && typeof style === "object" && !Array.isArray(style) ? style : {};
  return {
    categoryFrame: cleanStyleValue(value.categoryFrame, FIEELS_COMMUNITY_NAMING_STYLE.categoryFrame, { requiresName: true }),
    importantMarker: cleanStyleValue(value.importantMarker, FIEELS_COMMUNITY_NAMING_STYLE.importantMarker, { maxLength: 8 }),
    normalMarker: cleanStyleValue(value.normalMarker, FIEELS_COMMUNITY_NAMING_STYLE.normalMarker, { maxLength: 8 }),
    privateMarker: cleanStyleValue(value.privateMarker, FIEELS_COMMUNITY_NAMING_STYLE.privateMarker, { maxLength: 8 }),
    textSeparator: cleanStyleValue(value.textSeparator, FIEELS_COMMUNITY_NAMING_STYLE.textSeparator, { maxLength: 8 }),
    voiceStyle: cleanStyleValue(value.voiceStyle, FIEELS_COMMUNITY_NAMING_STYLE.voiceStyle, { requiresName: true }),
    roleSeparatorStyle: cleanStyleValue(value.roleSeparatorStyle, FIEELS_COMMUNITY_NAMING_STYLE.roleSeparatorStyle, { requiresName: true })
  };
}

function markerFor(level, style) {
  if (level === "important") return style.importantMarker;
  if (level === "private") return style.privateMarker;
  return style.normalMarker;
}

function channelPermissions(categoryKey, channelKey) {
  if (categoryKey === "turkish") {
    const announcement = channelKey === "turkish_announcements";
    return {
      everyone: { view: false, send: false, connect: false },
      turkish: { view: true, send: !announcement, connect: true },
      staff: { view: true, send: true, connect: true, moderate: true }
    };
  }
  if (categoryKey === "personnel") {
    return {
      everyone: { view: false, send: false, connect: false },
      staff: { view: true, send: true, connect: true, moderate: true }
    };
  }
  if (categoryKey === "video_team") {
    return {
      everyone: { view: false, send: false, connect: false },
      video_team: { view: true, send: true, connect: true, moderate: false },
      staff: { view: true, send: true, connect: true, moderate: true }
    };
  }
  return {
    everyone: { view: true, send: true, connect: true },
    staff: { view: true, send: true, connect: true, moderate: true }
  };
}

function proposedChannelName(channel, language, style) {
  const [, level, type, en, tr] = channel;
  const name = language === "tr" ? tr : en;
  if (type === "voice") return style.voiceStyle.replace("{name}", name);
  return `${markerFor(level, style)}${style.textSeparator}${name}`;
}

function currentChannelLookup(existingChannels = []) {
  const lookup = new Map();
  for (const channel of existingChannels) {
    if (!channel || !channel.id) continue;
    const key = String(channel.purposeKey || channel.key || "").trim();
    if (key && !lookup.has(key)) lookup.set(key, channel);
  }
  return lookup;
}

export function buildFieelsCommunityPersonaMatrix() {
  return [
    { key: "new_member", turkishVisible: false, videoTeamVisible: false, chatSend: false, mediaUpload: false, announcementsSend: false, voiceConnect: false, moderate: false },
    { key: "english_member", turkishVisible: false, videoTeamVisible: false, chatSend: false, mediaUpload: false, announcementsSend: false, voiceConnect: false, moderate: false },
    { key: "turkish_member", turkishVisible: true, videoTeamVisible: false, chatSend: true, mediaUpload: "policy", announcementsSend: false, voiceConnect: true, moderate: false },
    { key: "video_team", turkishVisible: false, videoTeamVisible: true, chatSend: true, mediaUpload: "policy", announcementsSend: false, voiceConnect: true, moderate: false },
    { key: "video_editor", turkishVisible: false, videoTeamVisible: true, chatSend: true, mediaUpload: "policy", announcementsSend: false, voiceConnect: true, moderate: false },
    { key: "thumbnail_designer", turkishVisible: false, videoTeamVisible: true, chatSend: true, mediaUpload: "policy", announcementsSend: false, voiceConnect: true, moderate: false },
    { key: "helper", turkishVisible: true, videoTeamVisible: true, chatSend: true, mediaUpload: "policy", announcementsSend: false, voiceConnect: true, moderate: "assist_only" },
    { key: "junior_moderator", turkishVisible: true, videoTeamVisible: true, chatSend: true, mediaUpload: "policy", announcementsSend: true, voiceConnect: true, moderate: true },
    { key: "moderator", turkishVisible: true, videoTeamVisible: true, chatSend: true, mediaUpload: "policy", announcementsSend: true, voiceConnect: true, moderate: true },
    { key: "administrator", turkishVisible: true, videoTeamVisible: true, chatSend: true, mediaUpload: "policy", announcementsSend: true, voiceConnect: true, moderate: true },
    { key: "owner", turkishVisible: true, videoTeamVisible: true, chatSend: true, mediaUpload: "policy", announcementsSend: true, voiceConnect: true, moderate: true }
  ];
}

export function reconcileFieelsCommunityRoles(existingRoles = []) {
  const byKey = new Map();
  const duplicates = [];
  for (const role of existingRoles) {
    if (!role || !role.id) continue;
    const key = String(role.purposeKey || role.key || "").trim();
    if (!key) continue;
    if (byKey.has(key)) duplicates.push({ key, ids: [byKey.get(key).id, role.id] });
    else byKey.set(key, role);
  }
  const managedKeys = new Set(["member", "turkish", "english", ...VIDEO_TEAM_ROLE_KEYS, ...STAFF_ROLE_KEYS]);
  const mapped = [...managedKeys].map((key) => {
    const existing = byKey.get(key);
    return {
      key,
      existingId: existing?.id || null,
      currentName: existing?.name || null,
      action: existing ? "preserve_and_update" : "create_if_approved"
    };
  });
  const unrelated = existingRoles
    .filter((role) => role?.id && !managedKeys.has(String(role.purposeKey || role.key || "").trim()))
    .map((role) => ({ id: role.id, name: role.name || "", action: "preserve_untouched" }));
  return { mapped, unrelated, duplicates, destructiveActions: [] };
}

export function buildFieelsCommunityStructureDraft({
  language = "en",
  style = {},
  existingChannels = [],
  existingRoles = []
} = {}) {
  const selectedLanguage = language === "tr" ? "tr" : "en";
  const naming = normalizeFieelsCommunityNamingStyle(style);
  const currentLookup = currentChannelLookup(existingChannels);
  const categories = CATEGORY_DEFINITIONS.map((category) => {
    const categoryName = localized(category.names, selectedLanguage);
    return {
      key: category.key,
      names: { ...category.names },
      proposedName: naming.categoryFrame.replace("{name}", categoryName),
      access: category.access || "global",
      channels: category.channels.map((channel) => {
        const [key, importance, type, en, tr] = channel;
        const current = currentLookup.get(key);
        return {
          key,
          names: { en, tr },
          importance,
          type,
          proposedName: proposedChannelName(channel, selectedLanguage, naming),
          existingId: current?.id || null,
          currentName: current?.name || null,
          action: current ? "rename_preserve_id" : "create_if_approved",
          permissions: channelPermissions(category.key, key)
        };
      })
    };
  });
  const roleTree = ROLE_GROUPS.map(([key, en, tr, roles]) => ({
    key,
    names: { en, tr },
    separatorName: naming.roleSeparatorStyle.replace("{name}", selectedLanguage === "tr" ? tr : en),
    permissions: [],
    mentionable: false,
    hoisted: false,
    members: [],
    roles
  }));
  return {
    revision: FIEELS_COMMUNITY_STRUCTURE_REVISION,
    scope: "fieels_community",
    mode: "draft_only",
    language: selectedLanguage,
    naming,
    categories,
    roleTree,
    roleReconciliation: reconcileFieelsCommunityRoles(existingRoles),
    personaMatrix: buildFieelsCommunityPersonaMatrix(),
    safety: {
      productionMutationAllowed: false,
      applyTarget: "test_guild_only",
      preserveExistingIds: true,
      deleteExistingRoles: false,
      deleteExistingChannels: false,
      finalOwnerConfirmationRequired: true
    }
  };
}

export function validateFieelsCommunityStructureDraft(draft) {
  const errors = [];
  if (!draft || draft.scope !== "fieels_community") errors.push("invalid_scope");
  if (draft?.mode !== "draft_only") errors.push("draft_mode_required");
  if (draft?.safety?.productionMutationAllowed !== false) errors.push("production_mutation_must_be_disabled");
  if (draft?.safety?.preserveExistingIds !== true) errors.push("existing_ids_must_be_preserved");

  const categories = Array.isArray(draft?.categories) ? draft.categories : [];
  const turkishCategories = categories.filter((category) => category.key === "turkish");
  if (turkishCategories.length !== 1) errors.push("exactly_one_turkish_category_required");
  const turkishChannels = turkishCategories[0]?.channels || [];
  const required = new Map([
    ["turkish_chat", "text"],
    ["turkish_media", "text"],
    ["turkish_announcements", "text"],
    ["turkish_voice", "voice"]
  ]);
  for (const [key, type] of required) {
    const channel = turkishChannels.find((item) => item.key === key);
    if (!channel) errors.push(`missing_${key}`);
    else if (channel.type !== type) errors.push(`invalid_${key}_type`);
  }
  for (const channel of turkishChannels) {
    if (channel.permissions?.everyone?.view !== false) errors.push(`${channel.key}_everyone_must_be_hidden`);
    if (channel.permissions?.turkish?.view !== true) errors.push(`${channel.key}_turkish_role_must_view`);
  }
  const announcements = turkishChannels.find((channel) => channel.key === "turkish_announcements");
  if (announcements?.permissions?.turkish?.send !== false) errors.push("turkish_announcements_must_be_read_only");
  if (announcements?.permissions?.staff?.send !== true) errors.push("staff_must_post_turkish_announcements");

  const videoTeamCategories = categories.filter((category) => category.key === "video_team");
  if (videoTeamCategories.length !== 1) errors.push("exactly_one_video_team_category_required");
  const videoTeamCategory = videoTeamCategories[0];
  if (videoTeamCategory?.access !== "video_team") errors.push("video_team_category_access");
  const videoTeamChannels = videoTeamCategory?.channels || [];
  const requiredVideoTeamChannels = new Map([
    ["video_hub", "text"],
    ["video_ideas", "text"],
    ["video_scripts", "text"],
    ["video_assets", "text"],
    ["video_review", "text"],
    ["video_upload_schedule", "text"],
    ["video_voice", "voice"]
  ]);
  for (const [key, type] of requiredVideoTeamChannels) {
    const channel = videoTeamChannels.find((item) => item.key === key);
    if (!channel) errors.push(`missing_${key}`);
    else if (channel.type !== type) errors.push(`invalid_${key}_type`);
  }
  for (const channel of videoTeamChannels) {
    if (channel.permissions?.everyone?.view !== false) errors.push(`${channel.key}_everyone_must_be_hidden`);
    if (channel.permissions?.video_team?.view !== true) errors.push(`${channel.key}_video_team_must_view`);
    if (channel.permissions?.staff?.view !== true) errors.push(`${channel.key}_staff_must_view`);
  }

  const categoryNames = categories.map((category) => category.proposedName);
  if (new Set(categoryNames).size !== categoryNames.length) errors.push("duplicate_category_name");
  const channelNames = categories.flatMap((category) => category.channels || []).map((channel) => channel.proposedName);
  if (new Set(channelNames).size !== channelNames.length) errors.push("duplicate_channel_name");

  const roleTree = Array.isArray(draft?.roleTree) ? draft.roleTree : [];
  for (const separator of roleTree) {
    if (separator.mentionable || separator.hoisted || separator.permissions?.length || separator.members?.length) {
      errors.push(`unsafe_role_separator_${separator.key}`);
    }
  }
  const videoTeamRoles = roleTree
    .filter((separator) => separator.key === "video_team")
    .flatMap((separator) => separator.roles || []);
  for (const roleKey of VIDEO_TEAM_ROLE_KEYS) {
    if (videoTeamRoles.filter((key) => key === roleKey).length !== 1) errors.push(`invalid_video_team_role_${roleKey}`);
  }
  if (draft?.roleReconciliation?.destructiveActions?.length) errors.push("destructive_role_action");
  if (draft?.roleReconciliation?.duplicates?.length) errors.push("duplicate_existing_role_key");

  const personas = new Map((draft?.personaMatrix || []).map((persona) => [persona.key, persona]));
  for (const key of ["new_member", "english_member", "turkish_member", ...VIDEO_TEAM_ROLE_KEYS, "helper", "junior_moderator", "moderator", "administrator", "owner"]) {
    if (!personas.has(key)) errors.push(`missing_persona_${key}`);
  }
  if (personas.get("new_member")?.turkishVisible !== false) errors.push("new_member_visibility");
  if (personas.get("english_member")?.turkishVisible !== false) errors.push("english_member_visibility");
  if (personas.get("turkish_member")?.announcementsSend !== false) errors.push("turkish_member_announcement_write");
  if (personas.get("new_member")?.videoTeamVisible !== false) errors.push("new_member_video_team_visibility");
  if (personas.get("turkish_member")?.videoTeamVisible !== false) errors.push("turkish_member_video_team_visibility");
  for (const roleKey of VIDEO_TEAM_ROLE_KEYS) {
    if (personas.get(roleKey)?.videoTeamVisible !== true) errors.push(`${roleKey}_video_team_visibility`);
    if (personas.get(roleKey)?.moderate !== false) errors.push(`${roleKey}_moderation_bypass`);
  }
  if (personas.get("helper")?.moderate !== "assist_only") errors.push("helper_security_bypass");
  if (personas.get("helper")?.videoTeamVisible !== true) errors.push("staff_video_team_visibility");

  return { ok: errors.length === 0, errors };
}

export function validateFieelsCommunityOperationalParity(draft, operational) {
  const errors = [];
  const draftValidation = validateFieelsCommunityStructureDraft(draft);
  if (!draftValidation.ok) errors.push(...draftValidation.errors.map((code) => `draft:${code}`));
  if (operational?.identity !== "FT Community") errors.push("operational_identity_must_be_ft_community");
  if (operational?.publicLanguage !== "en") errors.push("public_structure_must_be_english_first");

  const categories = Array.isArray(operational?.privateCategories) ? operational.privateCategories : [];
  const categoryByPurpose = new Map();
  for (const category of categories) {
    const purpose = String(category?.purpose || "");
    if (!categoryByPurpose.has(purpose)) categoryByPurpose.set(purpose, []);
    categoryByPurpose.get(purpose).push(category);
  }

  const requirements = {
    turkish: {
      access: ["turkish", "staff"],
      channels: {
        turkish_chat: "text",
        turkish_media: "text",
        turkish_announcements: "text",
        turkish_voice: "voice"
      }
    },
    video_team: {
      access: ["video_team", "staff"],
      channels: {
        video_hub: "text",
        video_ideas: "text",
        video_scripts: "text",
        video_assets: "text",
        video_review: "text",
        video_upload_schedule: "text",
        video_voice: "voice"
      }
    },
    staff: {
      access: ["staff"],
      channels: {
        staff_hub: "text",
        staff_guides: "text",
        application_reviews: "text",
        staff_logs: "text",
        security_logs: "text",
        transcripts: "text"
      }
    }
  };

  for (const [purpose, requirement] of Object.entries(requirements)) {
    const matches = categoryByPurpose.get(purpose) || [];
    if (matches.length !== 1) {
      errors.push(`exactly_one_operational_${purpose}_category_required`);
      continue;
    }
    const category = matches[0];
    if (category.private !== true) errors.push(`operational_${purpose}_category_must_be_private`);
    const access = new Set(Array.isArray(category.accessClasses) ? category.accessClasses : []);
    for (const accessClass of requirement.access) {
      if (!access.has(accessClass)) errors.push(`operational_${purpose}_missing_${accessClass}_access`);
    }
    const channels = new Map((category.channels || []).map((channel) => [channel.purpose, channel]));
    for (const [channelPurpose, type] of Object.entries(requirement.channels)) {
      const channel = channels.get(channelPurpose);
      if (!channel) errors.push(`operational_missing_${channelPurpose}`);
      else if (channel.type !== type) errors.push(`operational_invalid_${channelPurpose}_type`);
    }
  }

  const knownChannels = new Set(Array.isArray(operational?.channelNames) ? operational.channelNames : []);
  const mappings = operational?.mappings && typeof operational.mappings === "object" ? operational.mappings : {};
  for (const key of ["welcome", "leave", "rules", "support", "applications"]) {
    if (!knownChannels.has(mappings[key])) errors.push(`operational_invalid_${key}_mapping`);
  }

  const roleClasses = operational?.roleClasses || {};
  for (const role of ["Owner", "Administrator", "Moderator", "Junior Moderator", "Helper"]) {
    if (!roleClasses.staff?.includes(role)) errors.push(`operational_staff_role_missing:${role}`);
  }
  if (!roleClasses.turkish?.includes("Turkish")) errors.push("operational_turkish_role_missing");
  if (!roleClasses.video_team?.includes("Video Team")) errors.push("operational_video_team_role_missing");

  return { ok: errors.length === 0, errors };
}
