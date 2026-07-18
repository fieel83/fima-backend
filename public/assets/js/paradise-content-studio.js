(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const testPhrase = "PUBLISH TEST CONTENT";
  const snowflakePattern = /^\d{16,22}$/;
  const studio = byId("studio");
  const notice = byId("notice");
  const documentList = byId("documentList");
  const versionList = byId("versionList");
  const embedsList = byId("embedsList");
  const previewShell = byId("previewShell");
  let csrfToken = "";
  let studioState = { documents: {}, updatedAt: null };
  let selectedDocumentId = null;
  let currentSource = "new";
  let currentImportStatus = "not_applicable";
  let currentMetadata = {};
  let currentOriginalSnapshot = null;
  let currentCanonical = { guildId: null, channelId: null, messageId: null };
  let testGuildId = "";
  let previewMode = "desktop";
  let dirty = true;

  function make(tag, options = {}, children = []) {
    const element = document.createElement(tag);
    if (options.className) element.className = options.className;
    if (options.text !== undefined) element.textContent = String(options.text);
    if (options.type) element.type = options.type;
    if (options.value !== undefined) element.value = String(options.value ?? "");
    if (options.placeholder) element.placeholder = options.placeholder;
    if (options.maxLength) element.maxLength = options.maxLength;
    if (options.dataset) Object.assign(element.dataset, options.dataset);
    if (options.title) element.title = options.title;
    for (const child of children) if (child) element.append(child);
    return element;
  }

  function showNotice(message, kind = "") {
    notice.textContent = message;
    notice.className = `notice ${kind}`.trim();
  }

  function errorMessage(code) {
    const messages = {
      login_required: "Sign in with the FIMA owner account.",
      discord_link_required: "Connect the authorized Discord owner identity.",
      paradise_owner_required: "This Discord account is not authorized as the Paradise owner.",
      owner_action_header_required: "The owner action safety header was rejected.",
      origin_mismatch: "The request origin did not pass the owner safety policy.",
      state_changed: "The library changed in another session. It has been reloaded; review your draft before saving again.",
      state_revision_required: "A library revision is required. Reload the studio.",
      overwrite_confirmation_required: "Confirm overwrite before creating a new version of this document.",
      content_required: "Add message content or at least one embed.",
      embed_character_limit: "All embeds together may contain at most 6,000 characters.",
      invalid_guild_id: "Choose a valid managed Discord server.",
      invalid_document_id: "The document identifier is invalid.",
      document_not_found: "The saved document no longer exists.",
      version_not_found: "That saved version no longer exists.",
      content_channel_not_found: "The target text channel was not found.",
      content_message_not_found: "The target message was not found.",
      test_guild_only: "Publishing is allowed only in the isolated test guild.",
      production_guild_mutation_blocked: "Production Discord mutation is blocked.",
      non_test_guild_mutation_blocked: "Only the isolated test guild can be changed.",
      content_message_not_owned_by_bot: "Paradise can edit only a message it owns.",
      content_message_not_owned_by_managed_webhook: "The message is not owned by the Paradise-managed webhook.",
      content_stage_transition_invalid: "Use the workflow order: Imported or Starter Draft, then Improved Draft, then Production Version.",
      content_stage_not_publishable: "Only an Improved Draft or Production Version can be published to the isolated test guild.",
      content_source_export_required: "Capture the real Discord source before publishing this pending starter or legacy import.",
      original_snapshot_required: "A Discord import must retain its immutable Original snapshot.",
      imported_stage_requires_original_payload: "Edited imported content must be marked as an Improved Draft; the Original stays unchanged.",
      arbitrary_webhook_forbidden: "Arbitrary webhook URLs and tokens are forbidden.",
      publish_confirmation_required: `Type ${testPhrase} exactly.`,
      discord_not_ready: "Paradise is not connected to Discord right now.",
      managed_webhook_channel_unsupported: "This channel cannot host a managed webhook.",
      request_failed: "The request failed. Check the server connection and try again."
    };
    return messages[code] || `Content Studio request failed (${code || "unknown_error"}).`;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "include",
      cache: "no-store",
      ...options
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(body.error || "request_failed"), {
        code: body.error || "request_failed",
        status: response.status,
        body
      });
    }
    return body;
  }

  async function csrf() {
    if (csrfToken) return csrfToken;
    const data = await api("/api/csrf-token");
    csrfToken = data.csrfToken || data.token || "";
    if (!csrfToken) throw Object.assign(new Error("csrf_unavailable"), { code: "csrf_unavailable" });
    return csrfToken;
  }

  async function mutate(path, body) {
    return api(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-fima-csrf": await csrf(),
        "x-paradise-owner-action": "1"
      },
      body: JSON.stringify(body)
    });
  }

  function field(labelText, input) {
    const label = make("label", { text: labelText });
    const wrap = make("div", { className: "field" }, [label, input]);
    return wrap;
  }

  function textInput(className, value, placeholder, maxLength) {
    const input = make("input", { type: "text", className, value: value || "", placeholder, maxLength });
    return input;
  }

  function textarea(className, value, placeholder, maxLength) {
    return make("textarea", { className, value: value || "", placeholder, maxLength });
  }

  function formatEmbedColor(rawColor) {
    if (typeof rawColor === "number" && Number.isInteger(rawColor) && rawColor >= 0 && rawColor <= 0xffffff) {
      return `#${rawColor.toString(16).padStart(6, "0")}`;
    }
    if (typeof rawColor === "string" && /^#?[0-9a-f]{6}$/i.test(rawColor.trim())) {
      return `#${rawColor.trim().replace(/^#/, "").toLowerCase()}`;
    }
    return "#9b5cff";
  }

  function addEmbedFieldRow(card, raw = {}) {
    const row = make("div", { className: "field-row" });
    const name = textInput("embed-field-name", raw.name, "Field name", 256);
    const value = textarea("embed-field-value", raw.value, "Field value", 1024);
    const inlineLabel = make("label", { className: "checkbox" });
    const inline = make("input", { type: "checkbox", className: "embed-field-inline" });
    inline.checked = raw.inline === true;
    inlineLabel.append(inline, document.createTextNode(" Inline"));
    const remove = make("button", { className: "button fit", type: "button", text: "Remove" });
    remove.addEventListener("click", () => {
      row.remove();
      markDirty();
    });
    row.append(field("Name", name), field("Value", value), inlineLabel, remove);
    card.querySelector(".embed-fields").append(row);
  }

  function addEmbedCard(raw = {}) {
    if (embedsList.children.length >= 10) {
      showNotice("Discord permits at most 10 embeds in one message.", "warn");
      return;
    }
    const card = make("article", { className: "embed-card" });
    const heading = make("strong", { text: `Embed ${embedsList.children.length + 1}` });
    const remove = make("button", { className: "button fit", type: "button", text: "Remove embed" });
    remove.addEventListener("click", () => {
      card.remove();
      renumberEmbeds();
      markDirty();
    });
    const head = make("div", { className: "embed-head" }, [heading, remove]);
    const grid = make("div", { className: "embed-grid" });
    grid.append(
      field("Author", textInput("embed-author-name", raw.author?.name, "Optional author", 256)),
      field("Author URL (HTTPS)", textInput("embed-author-url", raw.author?.url, "https://…", 2048)),
      field("Author icon (HTTPS)", textInput("embed-author-icon", raw.author?.icon_url, "https://…", 2048)),
      field("Accent color", textInput("embed-color", formatEmbedColor(raw.color), "#9b5cff", 7)),
      field("Title", textInput("embed-title", raw.title, "Embed title", 256)),
      field("Title URL (HTTPS)", textInput("embed-url", raw.url, "https://…", 2048))
    );
    const description = field("Description", textarea("embed-description", raw.description, "Embed description", 4096));
    description.classList.add("wide");
    grid.append(description,
      field("Image URL (HTTPS)", textInput("embed-image", raw.image?.url, "https://…", 2048)),
      field("Thumbnail URL (HTTPS)", textInput("embed-thumbnail", raw.thumbnail?.url, "https://…", 2048)),
      field("Footer", textInput("embed-footer-text", raw.footer?.text, "Optional footer", 2048)),
      field("Footer icon (HTTPS)", textInput("embed-footer-icon", raw.footer?.icon_url, "https://…", 2048)),
      field("Timestamp", textInput("embed-timestamp", raw.timestamp, "ISO date/time", 64))
    );
    const fieldsHead = make("div", { className: "inline" });
    fieldsHead.append(
      make("span", { className: "subheading", text: "Fields" }),
      make("button", { className: "button fit add-embed-field", type: "button", text: "Add field" })
    );
    const rows = make("div", { className: "embed-fields stack" });
    card.append(head, grid, fieldsHead, rows);
    fieldsHead.querySelector("button").addEventListener("click", () => {
      if (rows.children.length >= 25) {
        showNotice("An embed can contain at most 25 fields.", "warn");
        return;
      }
      addEmbedFieldRow(card);
      markDirty();
    });
    embedsList.append(card);
    for (const embedField of raw.fields || []) addEmbedFieldRow(card, embedField);
    renumberEmbeds();
  }

  function renumberEmbeds() {
    [...embedsList.children].forEach((card, index) => {
      card.querySelector(".embed-head strong").textContent = `Embed ${index + 1}`;
    });
    byId("embedCount").textContent = `${embedsList.children.length}/10`;
    byId("addEmbed").disabled = embedsList.children.length >= 10;
  }

  function value(card, selector) {
    return card.querySelector(selector)?.value.trim() || "";
  }

  function collectEmbed(card) {
    const color = value(card, ".embed-color");
    const embed = {
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#9b5cff",
      title: value(card, ".embed-title"),
      description: value(card, ".embed-description"),
      fields: [...card.querySelectorAll(".field-row")].map(row => ({
        name: value(row, ".embed-field-name"),
        value: value(row, ".embed-field-value"),
        inline: row.querySelector(".embed-field-inline")?.checked === true
      })).filter(item => item.name && item.value)
    };
    const mappings = [
      ["url", ".embed-url"],
      ["imageUrl", ".embed-image"],
      ["thumbnailUrl", ".embed-thumbnail"],
      ["authorName", ".embed-author-name"],
      ["authorUrl", ".embed-author-url"],
      ["authorIconUrl", ".embed-author-icon"],
      ["footerText", ".embed-footer-text"],
      ["footerIconUrl", ".embed-footer-icon"],
      ["timestamp", ".embed-timestamp"]
    ];
    for (const [key, selector] of mappings) {
      const item = value(card, selector);
      if (item) embed[key] = item;
    }
    return embed;
  }

  function currentPayload() {
    return {
      content: byId("messageContent").value,
      embeds: [...embedsList.children].map(collectEmbed)
    };
  }

  function currentDocumentInput() {
    return {
      ...(selectedDocumentId ? { id: selectedDocumentId } : {}),
      overwrite: selectedDocumentId ? byId("overwriteConfirmation").checked : false,
      name: byId("documentName").value,
      payload: currentPayload(),
      deliveryMode: byId("deliveryMode").value,
      targetChannelId: byId("targetChannelId").value,
      targetMessageId: byId("targetMessageId").value,
      source: currentSource,
      stage: byId("contentStage").value,
      importStatus: currentImportStatus,
      metadata: currentMetadata,
      originalSnapshot: currentOriginalSnapshot,
      canonicalGuildId: currentCanonical.guildId,
      canonicalChannelId: currentCanonical.channelId,
      canonicalMessageId: currentCanonical.messageId
    };
  }

  function setDirty(value = true) {
    dirty = value;
    byId("dirtyState").textContent = dirty ? "Unsaved changes" : "Saved version";
    byId("dirtyState").style.color = dirty ? "var(--warn)" : "var(--good)";
    updatePublishState();
  }

  function markDirty() {
    if (byId("contentStage").value === "imported" && currentOriginalSnapshot) {
      byId("contentStage").value = "improved_draft";
    }
    setDirty(true);
    renderLineageStatus();
    renderPreview(currentPayload());
  }

  function renderLineageStatus() {
    const stageLabels = {
      starter_draft: "Starter Draft",
      imported: "Imported",
      improved_draft: "Improved Draft",
      production_version: "Production Version"
    };
    const parts = [`Current: ${stageLabels[byId("contentStage").value] || "Improved Draft"}`];
    if (currentOriginalSnapshot) {
      const source = currentMetadata.sourceMessageId || "captured source";
      parts.unshift(`Original: immutable snapshot of ${source}`);
    } else if (currentImportStatus === "pending_source_export") {
      parts.unshift("Original: source export unavailable; this document is not a verified import");
    } else {
      parts.unshift("Original: not applicable");
    }
    byId("lineageStatus").textContent = parts.join(" · ");
  }

  function clearEditor() {
    selectedDocumentId = null;
    currentSource = "new";
    currentImportStatus = "not_applicable";
    currentMetadata = {};
    currentOriginalSnapshot = null;
    currentCanonical = { guildId: null, channelId: null, messageId: null };
    byId("documentName").value = "Untitled message";
    byId("deliveryMode").value = "bot";
    byId("contentStage").value = "improved_draft";
    byId("targetChannelId").value = "";
    byId("targetMessageId").value = "";
    byId("messageContent").value = "";
    byId("overwriteConfirmation").checked = false;
    byId("publishConfirmation").value = "";
    embedsList.replaceChildren();
    renumberEmbeds();
    renderDocumentList();
    renderVersions();
    updateContentCounter();
    renderLineageStatus();
    setDirty(true);
    renderPreview(currentPayload());
  }

  function applyDocument(document, { saved = false } = {}) {
    selectedDocumentId = saved ? document.id : null;
    currentSource = document.source || "new";
    currentImportStatus = document.importStatus || "not_applicable";
    currentMetadata = JSON.parse(JSON.stringify(document.metadata || {}));
    currentOriginalSnapshot = document.originalSnapshot ? JSON.parse(JSON.stringify(document.originalSnapshot)) : null;
    currentCanonical = {
      guildId: document.canonicalGuildId || null,
      channelId: document.canonicalChannelId || null,
      messageId: document.canonicalMessageId || null
    };
    byId("documentName").value = document.name || "Untitled message";
    byId("deliveryMode").value = document.deliveryMode || "bot";
    byId("contentStage").value = document.stage || (document.source === "discord_import" ? "imported" : "improved_draft");
    byId("targetChannelId").value = document.targetChannelId || "";
    byId("targetMessageId").value = document.targetMessageId || "";
    byId("messageContent").value = document.current?.content ?? document.payload?.content ?? "";
    byId("overwriteConfirmation").checked = false;
    byId("publishConfirmation").value = "";
    embedsList.replaceChildren();
    const payload = document.current || document.payload || {};
    for (const embed of payload.embeds || []) addEmbedCard(embed);
    renumberEmbeds();
    renderDocumentList();
    renderVersions();
    updateContentCounter();
    renderLineageStatus();
    setDirty(!saved);
    renderPreview(payload);
  }

  function updateContentCounter() {
    byId("contentCounter").textContent = `${byId("messageContent").value.length}/2000`;
  }

  function renderDocumentList() {
    documentList.replaceChildren();
    const documents = Object.values(studioState.documents || {}).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    if (!documents.length) {
      documentList.append(make("div", { className: "empty", text: "No saved messages yet." }));
      return;
    }
    for (const document of documents) {
      const row = make("div", { className: `document-row${document.id === selectedDocumentId ? " active" : ""}` });
      const button = make("button", { type: "button", text: document.name });
      button.addEventListener("click", () => loadDocument(document.id));
      row.append(button, make("span", {
        className: "meta",
        text: `${document.source} · ${document.stage || "improved_draft"} · ${document.importStatus || "not_applicable"} · ${document.versions?.length || 0} versions`
      }));
      documentList.append(row);
    }
  }

  function renderVersions() {
    versionList.replaceChildren();
    const document = selectedDocumentId ? studioState.documents?.[selectedDocumentId] : null;
    const versions = [...(document?.versions || [])].reverse();
    if (!versions.length) {
      versionList.append(make("div", { className: "empty", text: "Save a document to create version history." }));
      return;
    }
    for (const version of versions) {
      const row = make("div", { className: "version-row" });
      const date = version.savedAt ? new Date(version.savedAt).toLocaleString() : "Unknown time";
      const button = make("button", { className: "button", type: "button", text: "Roll back" });
      button.addEventListener("click", () => rollback(version.id));
      row.append(make("strong", { text: date }), make("span", { className: "meta", text: `${version.stage || "improved_draft"} · ${version.id}` }), button);
      versionList.append(row);
    }
  }

  function safeImage(url, className) {
    if (!/^https:\/\//i.test(String(url || ""))) return null;
    const image = make("img", { className });
    image.src = url;
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.remove());
    return image;
  }

  function renderPreview(payload) {
    previewShell.replaceChildren();
    previewShell.classList.toggle("mobile", previewMode === "mobile");
    const message = make("div", { className: "discord-message" });
    const body = make("div");
    const head = make("div", { className: "message-head" }, [
      make("strong", { text: byId("deliveryMode").value === "managed_webhook" ? "Paradise Content" : "Paradise" }),
      document.createTextNode(" "),
      make("span", { className: "message-time", text: "Today at 12:00" })
    ]);
    body.append(head);
    if (payload.content) body.append(make("div", { className: "message-content", text: payload.content }));
    const embedWrap = make("div", { className: "preview-embeds" });
    for (const embed of payload.embeds || []) {
      const color = typeof embed.color === "number" ? `#${embed.color.toString(16).padStart(6, "0")}` : embed.color;
      const card = make("div", { className: "preview-embed" });
      card.style.setProperty("--embed-color", /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#9b5cff");
      const thumb = safeImage(embed.thumbnail?.url || embed.thumbnailUrl, "preview-thumb");
      if (thumb) card.append(thumb);
      const author = embed.author?.name || embed.authorName;
      if (author) card.append(make("div", { className: "preview-author", text: author }));
      if (embed.title) card.append(make("div", { className: "preview-title", text: embed.title }));
      if (embed.description) card.append(make("div", { className: "preview-description", text: embed.description }));
      if (embed.fields?.length) {
        const fields = make("div", { className: "preview-fields" });
        for (const item of embed.fields) {
          const fieldNode = make("div", { className: `preview-field${item.inline ? "" : " wide"}` });
          fieldNode.append(make("strong", { text: item.name }), make("span", { text: item.value }));
          fields.append(fieldNode);
        }
        card.append(fields);
      }
      const image = safeImage(embed.image?.url || embed.imageUrl, "preview-image");
      if (image) card.append(image);
      const footer = embed.footer?.text || embed.footerText;
      if (footer) card.append(make("div", { className: "preview-footer", text: footer }));
      embedWrap.append(card);
    }
    body.append(embedWrap);
    if (!payload.content && !(payload.embeds || []).length) body.append(make("div", { className: "empty", text: "Start typing or add an embed." }));
    message.append(make("div", { className: "avatar", text: "P" }), body);
    previewShell.append(message);
  }

  function updateGuildPolicy() {
    const isTest = byId("guildSelect").value === testGuildId;
    byId("guildPolicy").textContent = isTest
      ? `Isolated test guild ${testGuildId}. Publishing may be enabled after saving.`
      : "Read, draft and preview only. Publishing to this server is blocked.";
    byId("publishPolicy").textContent = isTest
      ? "The saved document can be created or edited in the isolated test guild."
      : "Production and non-test Discord mutation is blocked.";
    updatePublishState();
  }

  function updatePublishState() {
    const isTest = byId("guildSelect").value === testGuildId;
    const exact = byId("publishConfirmation").value === testPhrase;
    const channelValid = snowflakePattern.test(byId("targetChannelId").value.trim());
    const stagePublishable = ["improved_draft", "production_version"].includes(byId("contentStage").value);
    const lineagePublishable = currentImportStatus !== "pending_source_export";
    byId("publishMessage").disabled = !isTest || dirty || !selectedDocumentId || !exact || !channelValid || !stagePublishable || !lineagePublishable;
  }

  async function loadDocument(id) {
    try {
      showNotice("Loading saved document…");
      const guildId = byId("guildSelect").value;
      const data = await api(`/api/paradise/content-studio/document/${encodeURIComponent(id)}?guildId=${encodeURIComponent(guildId)}`);
      studioState.documents[id] = data.document;
      applyDocument(data.document, { saved: true });
      showNotice(`Loaded ${data.document.name}.`, "good");
    } catch (error) {
      showNotice(errorMessage(error.code), "bad");
    }
  }

  async function loadLibrary(guildId = "") {
    const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
    const data = await api(`/api/paradise/content-studio${query}`);
    testGuildId = data.testGuildId || "";
    studioState = data.state || { documents: {}, updatedAt: null };
    byId("guildSelect").replaceChildren();
    for (const server of data.servers || []) {
      const option = new Option(`${server.name || "Discord server"} · ${server.id}`, server.id);
      option.selected = server.id === data.selectedGuildId;
      byId("guildSelect").append(option);
    }
    if (![...byId("guildSelect").options].some(option => option.value === data.selectedGuildId)) {
      byId("guildSelect").append(new Option(data.selectedGuildId, data.selectedGuildId));
    }
    byId("guildSelect").value = data.selectedGuildId;
    clearEditor();
    updateGuildPolicy();
    showNotice(`Content library loaded for ${data.selectedGuildId}.`, "good");
  }

  async function save() {
    try {
      byId("saveDocument").disabled = true;
      showNotice("Validating and saving a new version…");
      const data = await mutate("/api/paradise/content-studio/save", {
        guildId: byId("guildSelect").value,
        expectedStateUpdatedAt: studioState.updatedAt,
        document: currentDocumentInput()
      });
      studioState.updatedAt = data.stateUpdatedAt;
      studioState.documents[data.document.id] = data.document;
      applyDocument(data.document, { saved: true });
      showNotice(`Saved ${data.document.name} as version ${data.version.id}.`, "good");
    } catch (error) {
      if (error.code === "state_changed") await reloadAfterConflict();
      showNotice(errorMessage(error.code), "bad");
    } finally {
      byId("saveDocument").disabled = false;
    }
  }

  async function rollback(versionId) {
    if (!selectedDocumentId) return;
    try {
      showNotice("Creating a rollback version…");
      const data = await mutate("/api/paradise/content-studio/rollback", {
        guildId: byId("guildSelect").value,
        expectedStateUpdatedAt: studioState.updatedAt,
        documentId: selectedDocumentId,
        versionId
      });
      studioState.updatedAt = data.stateUpdatedAt;
      studioState.documents[data.document.id] = data.document;
      applyDocument(data.document, { saved: true });
      showNotice(`Rolled back and created version ${data.version.id}.`, "good");
    } catch (error) {
      if (error.code === "state_changed") await reloadAfterConflict();
      showNotice(errorMessage(error.code), "bad");
    }
  }

  async function reloadAfterConflict() {
    const guildId = byId("guildSelect").value;
    await loadLibrary(guildId).catch(() => {});
  }

  async function loadPreset(name) {
    try {
      const data = await api(`/api/paradise/content-studio/preset/${encodeURIComponent(name)}`);
      applyDocument({
        name: data.preset.name,
        current: data.preset.payload,
        source: data.preset.source,
        stage: data.preset.stage,
        importStatus: data.preset.importStatus,
        metadata: data.preset.metadata,
        originalSnapshot: data.preset.originalSnapshot,
        deliveryMode: data.preset.deliveryMode
      });
      showNotice(`${data.preset.name} verified Discord source loaded. The Original snapshot will remain immutable.`, "good");
    } catch (error) {
      showNotice(errorMessage(error.code), "bad");
    }
  }

  async function importMessage() {
    const channelId = byId("importChannelId").value.trim();
    const messageId = byId("importMessageId").value.trim();
    if (!snowflakePattern.test(channelId) || !snowflakePattern.test(messageId)) {
      showNotice("Enter valid Discord channel and message IDs.", "bad");
      return;
    }
    try {
      showNotice("Importing a read-only copy from Discord…");
      const data = await mutate("/api/paradise/content-studio/import", {
        guildId: byId("guildSelect").value,
        channelId,
        messageId
      });
      applyDocument({ ...data.imported, current: data.imported.payload });
      showNotice("Discord message imported as an unsaved draft. No live message was changed.", "good");
    } catch (error) {
      showNotice(errorMessage(error.code), "bad");
    }
  }

  async function validatePreview() {
    try {
      const data = await mutate("/api/paradise/content-studio/preview", {
        payload: currentPayload(),
        mode: previewMode
      });
      renderPreview(data.preview.payload);
      showNotice(`Server validation passed for ${data.preview.mode} preview.`, "good");
    } catch (error) {
      showNotice(errorMessage(error.code), "bad");
    }
  }

  async function publish() {
    if (byId("publishMessage").disabled) return;
    try {
      byId("publishMessage").disabled = true;
      showNotice("Publishing the saved version to the isolated test guild…", "warn");
      const data = await mutate("/api/paradise/content-studio/publish", {
        guildId: byId("guildSelect").value,
        expectedStateUpdatedAt: studioState.updatedAt,
        documentId: selectedDocumentId,
        channelId: byId("targetChannelId").value.trim(),
        messageId: byId("targetMessageId").value.trim() || null,
        confirmation: byId("publishConfirmation").value
      });
      if (data.document) {
        studioState.updatedAt = data.stateUpdatedAt;
        studioState.documents[data.document.id] = data.document;
        applyDocument(data.document, { saved: true });
      }
      const operation = data.published?.operation || "published";
      const messageId = data.published?.messageId || data.recovery?.messageId || "unknown";
      const warning = data.persistenceWarning ? " Discord changed, but local state persistence needs recovery." : "";
      showNotice(`Test-guild message ${operation}: ${messageId}.${warning}`, data.persistenceWarning ? "warn" : "good");
    } catch (error) {
      if (error.code === "state_changed") await reloadAfterConflict();
      showNotice(errorMessage(error.code), "bad");
    } finally {
      updatePublishState();
    }
  }

  function bindEvents() {
    byId("newDocument").addEventListener("click", clearEditor);
    byId("addEmbed").addEventListener("click", () => {
      addEmbedCard();
      markDirty();
    });
    byId("saveDocument").addEventListener("click", save);
    byId("importMessage").addEventListener("click", importMessage);
    byId("validatePreview").addEventListener("click", validatePreview);
    byId("publishMessage").addEventListener("click", publish);
    byId("guildSelect").addEventListener("change", () => loadLibrary(byId("guildSelect").value).catch(error => showNotice(errorMessage(error.code), "bad")));
    byId("messageContent").addEventListener("input", updateContentCounter);
    byId("publishConfirmation").addEventListener("input", updatePublishState);
    byId("targetChannelId").addEventListener("input", updatePublishState);
    byId("contentStage").addEventListener("change", () => {
      setDirty(true);
      renderLineageStatus();
    });
    for (const button of document.querySelectorAll("[data-preset]")) button.addEventListener("click", () => loadPreset(button.dataset.preset));
    for (const button of document.querySelectorAll("[data-preview-mode]")) {
      button.addEventListener("click", () => {
        previewMode = button.dataset.previewMode === "mobile" ? "mobile" : "desktop";
        renderPreview(currentPayload());
      });
    }
    studio.addEventListener("input", event => {
      const editorTarget = event.target.closest("#documentName,#deliveryMode,#contentStage,#targetChannelId,#targetMessageId,#messageContent,#embedsList");
      if (editorTarget) markDirty();
    });
    studio.addEventListener("change", event => {
      if (event.target.closest("#deliveryMode,#embedsList")) markDirty();
      if (event.target.id === "overwriteConfirmation") updatePublishState();
    });
  }

  async function start() {
    bindEvents();
    renderPreview(currentPayload());
    try {
      const session = await api("/api/paradise/session-status");
      if (!session.ownerAuthorized) {
        byId("accessGate").classList.remove("hidden");
        byId("gateReason").textContent = errorMessage(session.reasonCode);
        byId("loginLink").classList.toggle("hidden", session.authenticated);
        byId("discordLink").classList.toggle("hidden", !session.authenticated || session.discordLinked);
        showNotice("Content Studio is locked until owner identity verification succeeds.", "warn");
        return;
      }
      studio.classList.remove("hidden");
      await csrf();
      await loadLibrary();
    } catch (error) {
      byId("accessGate").classList.remove("hidden");
      byId("gateReason").textContent = errorMessage(error.code);
      showNotice(errorMessage(error.code), "bad");
    }
  }

  start();
})();
