(() => {
  "use strict";

  const ctx = window.__PARADISE_OWNER_CONSOLE__;
  if (!ctx) return;

  const byId = (id) => document.getElementById(id);
  const controls = {
    language: "communityNamingLanguage",
    categoryFrame: "communityCategoryFrame",
    importantMarker: "communityImportantMarker",
    normalMarker: "communityNormalMarker",
    privateMarker: "communityPrivateMarker",
    textSeparator: "communityTextSeparator",
    voiceStyle: "communityVoiceStyle",
    roleSeparatorStyle: "communityRoleSeparatorStyle"
  };
  const state = { payload: null, loadingGuildId: "" };

  function selectedGuildId() {
    return String(ctx.getSelectedGuildId?.() || "");
  }

  function value(id) {
    return String(byId(id)?.value || "");
  }

  function inputDraft() {
    return {
      language: value(controls.language) === "tr" ? "tr" : "en",
      naming: {
        categoryFrame: value(controls.categoryFrame),
        importantMarker: value(controls.importantMarker),
        normalMarker: value(controls.normalMarker),
        privateMarker: value(controls.privateMarker),
        textSeparator: value(controls.textSeparator),
        voiceStyle: value(controls.voiceStyle),
        roleSeparatorStyle: value(controls.roleSeparatorStyle)
      }
    };
  }

  function localized(names, language) {
    return names?.[language] || names?.en || "";
  }

  function normalizedTemplate(template, fallback) {
    const clean = String(template || "").trim();
    return clean.includes("{name}") ? clean : fallback;
  }

  function localPreviewDraft() {
    if (!state.payload?.draft) return null;
    const source = structuredClone(state.payload.draft);
    const input = inputDraft();
    const naming = {
      categoryFrame: normalizedTemplate(input.naming.categoryFrame, source.naming.categoryFrame),
      importantMarker: input.naming.importantMarker.trim() || source.naming.importantMarker,
      normalMarker: input.naming.normalMarker.trim() || source.naming.normalMarker,
      privateMarker: input.naming.privateMarker.trim() || source.naming.privateMarker,
      textSeparator: input.naming.textSeparator.trim() || source.naming.textSeparator,
      voiceStyle: normalizedTemplate(input.naming.voiceStyle, source.naming.voiceStyle),
      roleSeparatorStyle: normalizedTemplate(input.naming.roleSeparatorStyle, source.naming.roleSeparatorStyle)
    };
    source.language = input.language;
    source.naming = naming;
    for (const category of source.categories || []) {
      category.proposedName = naming.categoryFrame.replace("{name}", localized(category.names, input.language));
      for (const channel of category.channels || []) {
        const name = localized(channel.names, input.language);
        const marker = channel.importance === "important"
          ? naming.importantMarker
          : channel.importance === "private"
            ? naming.privateMarker
            : naming.normalMarker;
        channel.proposedName = channel.type === "voice"
          ? naming.voiceStyle.replace("{name}", name)
          : marker + naming.textSeparator + name;
      }
    }
    for (const group of source.roleTree || []) {
      group.separatorName = naming.roleSeparatorStyle.replace("{name}", localized(group.names, input.language));
    }
    return source;
  }

  function setText(id, text) {
    const element = byId(id);
    if (element) element.textContent = text;
  }

  function renderTree(targetId, draft, compact = false) {
    const target = byId(targetId);
    if (!target) return;
    target.replaceChildren();
    const tree = document.createElement("div");
    tree.className = "community-tree";
    for (const category of draft?.categories || []) {
      const card = document.createElement("section");
      card.className = "community-category";
      const title = document.createElement("b");
      title.textContent = category.proposedName;
      card.append(title);
      const channels = compact ? (category.channels || []).slice(0, 4) : (category.channels || []);
      for (const channel of channels) {
        const row = document.createElement("span");
        row.className = "community-channel " + channel.importance;
        row.textContent = channel.proposedName;
        card.append(row);
      }
      tree.append(card);
    }
    target.append(tree);
  }

  function renderSafety(payload) {
    const target = byId("communityStructureSafety");
    if (!target) return;
    target.replaceChildren();
    const policy = payload?.mutationPolicy || {};
    const draftSafety = payload?.draft?.safety || {};
    const labels = [
      draftSafety.preserveExistingIds ? "IDs preserved" : "ID safety missing",
      draftSafety.deleteExistingChannels === false ? "No channel deletion" : "Channel deletion risk",
      draftSafety.deleteExistingRoles === false ? "No role deletion" : "Role deletion risk",
      policy.productionApplyAvailable === false ? "Production apply disabled" : "Production apply available",
      payload?.isTestGuild ? "Selected: test guild" : "Selected: non-test guild",
      payload?.validation?.ok ? "Validation passed" : "Validation needs attention"
    ];
    for (const label of labels) {
      const chip = document.createElement("span");
      chip.textContent = label;
      target.append(chip);
    }
  }

  function mappingLines(draft) {
    return (draft?.categories || []).flatMap((category) =>
      (category.channels || []).map((channel) => {
        const current = channel.currentName
          ? channel.currentName + " · ID …" + String(channel.existingId || "").slice(-6)
          : "(new if approved)";
        return category.key + " / " + channel.key + "\n  " + current + " → " + channel.proposedName;
      })
    ).join("\n\n");
  }

  function roleLines(draft) {
    const reconciliation = new Map((draft?.roleReconciliation?.mapped || []).map((role) => [role.key, role]));
    return (draft?.roleTree || []).map((group) => {
      const roles = (group.roles || []).map((key) => {
        const role = reconciliation.get(key);
        return "  " + key + " — " + (role?.currentName || "create if approved") + (role?.existingId ? " · ID preserved" : "");
      });
      return [group.separatorName, ...(roles.length ? roles : ["  permissionless separator"])].join("\n");
    }).join("\n\n");
  }

  function personaLines(draft) {
    return (draft?.personaMatrix || []).map((persona) => {
      const access = persona.turkishVisible ? "TR visible" : "TR hidden";
      const announcements = persona.announcementsSend ? "announcement write" : "announcement read-only";
      const moderation = persona.moderate === true ? "moderate" : persona.moderate === "assist_only" ? "assist only" : "no moderation";
      return persona.key + ": " + access + " · " + announcements + " · " + moderation;
    }).join("\n");
  }

  function render(payload = state.payload) {
    if (!payload?.draft) return;
    const preview = localPreviewDraft() || payload.draft;
    renderSafety({ ...payload, draft: preview });
    renderTree("communityDesktopPreview", preview, false);
    renderTree("communityMobilePreview", preview, true);
    setText("communityMappingPreview", mappingLines(preview) || "No mapped channels.");
    setText("communityRolePreview", roleLines(preview) || "No role groups.");
    setText("communityPersonaPreview", personaLines(preview) || "No persona checks.");
  }

  function populateControls(draft) {
    if (!draft) return;
    byId(controls.language).value = draft.language === "tr" ? "tr" : "en";
    for (const [key, id] of Object.entries(controls)) {
      if (key === "language") continue;
      byId(id).value = draft.naming?.[key] || "";
    }
  }

  async function refresh(guildId = selectedGuildId()) {
    if (!guildId || state.loadingGuildId === guildId) return;
    state.loadingGuildId = guildId;
    setText("communityOperationStatus", "Loading the safe Community draft…");
    try {
      const response = await fetch(ctx.apiBase + "/api/paradise/community-structure?guildId=" + encodeURIComponent(guildId), {
        credentials: "include",
        headers: { accept: "application/json" },
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({ error: "invalid_response" }));
      if (!response.ok) throw new Error(payload.error || "community_structure_load_failed");
      if (guildId !== selectedGuildId()) return;
      state.payload = payload;
      populateControls(payload.draft);
      render(payload);
      setText("communityOperationStatus", payload.isTestGuild
        ? "Test guild selected. Draft and plan operations are available; Discord mutation remains stopped."
        : "Production/non-test guild selected. Draft and comparison are available; test apply is blocked.");
    } catch (error) {
      setText("communityOperationStatus", "Community structure could not be loaded safely: " + error.message);
    } finally {
      state.loadingGuildId = "";
    }
  }

  async function saveDraft({ quiet = false } = {}) {
    const guildId = selectedGuildId();
    if (!guildId) throw new Error("select_a_managed_guild");
    const { response, result } = await ctx.mutate("/api/paradise/community-structure/draft", {
      guildId,
      value: inputDraft()
    }, "PATCH");
    if (!response.ok) throw new Error(result.error || "community_draft_save_failed");
    state.payload = { ...state.payload, ...result };
    populateControls(result.draft);
    render(state.payload);
    if (!quiet) {
      setText("communityOperationStatus", "Draft saved. No Discord roles or channels were changed.");
      ctx.show?.("Fieel's Community draft saved without live Discord mutation.");
    }
    return result;
  }

  async function plan(operation) {
    await saveDraft({ quiet: true });
    const guildId = selectedGuildId();
    const { response, result } = await ctx.mutate("/api/paradise/community-structure/plan", { guildId, operation });
    if (!response.ok) {
      const reason = result.error === "test_guild_required"
        ? "Apply Test Guild is blocked because the selected server is not the fixed test guild."
        : result.error || "community_plan_failed";
      throw new Error(reason);
    }
    state.payload = { ...state.payload, draft: result.draft, validation: result.validation };
    render(state.payload);
    setText("communityOperationStatus", JSON.stringify({
      operation: result.plan.operation,
      status: result.plan.status,
      mutationExecuted: result.plan.mutationExecuted,
      summary: result.plan.summary,
      safeguards: result.plan.safeguards
    }, null, 2));
    return result;
  }

  function run(button, task) {
    return async () => {
      button.disabled = true;
      try {
        await task();
      } catch (error) {
        setText("communityOperationStatus", error.message);
        ctx.show?.(error.message, false);
      } finally {
        button.disabled = false;
      }
    };
  }

  for (const id of Object.values(controls)) {
    byId(id)?.addEventListener("input", () => {
      render();
      ctx.markDirty?.();
    });
  }

  const preview = byId("previewCommunityStructure");
  const save = byId("saveCommunityStructureDraft");
  const applyTest = byId("applyCommunityTestGuild");
  const compare = byId("compareCommunityStructure");
  const rename = byId("renameExistingCommunity");
  const rollback = byId("rollbackCommunityStructure");

  if (preview) preview.onclick = () => {
    render();
    setText("communityOperationStatus", "Local preview refreshed. Save Draft to persist these naming choices.");
  };
  if (save) save.onclick = run(save, () => saveDraft());
  if (applyTest) applyTest.onclick = run(applyTest, async () => {
    await plan("apply_test_guild");
    ctx.show?.("Test-guild plan is ready. Discord mutation was not executed; screenshots and final confirmation remain required.");
  });
  if (compare) compare.onclick = run(compare, () => plan("compare"));
  if (rename) rename.onclick = run(rename, () => plan("rename_existing"));
  if (rollback) rollback.onclick = run(rollback, () => plan("rollback"));

  window.addEventListener("paradise:config-loaded", (event) => {
    const guildId = String(event.detail?.guildId || "");
    if (guildId) refresh(guildId);
  });
  if (selectedGuildId()) refresh();
})();
