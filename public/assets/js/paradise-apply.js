(() => {
  "use strict";

  const loopbackHost = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(window.location.hostname);
  const defaultApiBase = loopbackHost ? window.location.origin : "https://api.fimamacro.com";
  const apiBase = String(window.FIMA_API_BASE_URL || defaultApiBase).replace(/\/+$/, "");
  const workflow = "staff";
  const preferredType = "helper";
  const allowedEvidenceExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
  const defaultEvidencePolicy = Object.freeze({
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
    maxPerQuestion: 2,
    maxFiles: 4,
    maxFileBytes: 160 * 1024,
    maxTotalBytes: 480 * 1024,
    scannerUnavailableAction: "quarantine"
  });

  const byId = id => document.getElementById(id);
  const form = byId("applicationForm");
  const guildSelect = byId("guildSelect");
  const typeSelect = byId("typeSelect");
  const fields = byId("questionFields");
  const submitButton = byId("submitButton");
  const notice = byId("notice");
  const draftState = byId("draftState");
  const evidencePolicyText = byId("evidencePolicyText");
  let contexts = [];
  let csrfToken = "";
  let evidencePolicy = { ...defaultEvidencePolicy };
  let draftTimer = null;

  const applicationPath = `/paradise-apply?workflow=${encodeURIComponent(workflow)}&type=${encodeURIComponent(preferredType)}`;
  byId("loginLink").href = `/login?returnTo=${encodeURIComponent(applicationPath)}`;
  byId("discordLink").href = `${apiBase}/auth/discord/start?returnTo=${encodeURIComponent(applicationPath)}`;
  byId("staffWorkflow").classList.add("active");
  byId("formTitle").textContent = "Helper başvurunu hazırla";
  typeSelect.closest(".field").querySelector("label").textContent = "Personel giriş rolü";

  function setStatus(id, text, state = "") {
    const node = byId(id);
    node.textContent = text;
    node.className = `status-chip ${state}`;
  }

  function showNotice(text, kind = "") {
    notice.textContent = text;
    notice.className = `notice ${kind}`;
  }

  function hideNotice() {
    notice.textContent = "";
    notice.className = "notice hidden";
  }

  async function jsonFetch(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      credentials: "include",
      cache: "no-store",
      ...options
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(body.error || "request_failed"), {
        status: response.status,
        body
      });
    }
    return body;
  }

  async function getCsrf() {
    if (csrfToken) return csrfToken;
    const data = await jsonFetch("/api/csrf-token");
    csrfToken = data.csrfToken || data.token || "";
    return csrfToken;
  }

  function selectedContext() {
    return contexts.find(item => item.guildId === guildSelect.value) || null;
  }

  function selectedType() {
    return selectedContext()?.types.find(item => item.type === typeSelect.value) || null;
  }

  function draftKey() {
    if (!guildSelect.value || !typeSelect.value) return "";
    return `fima.paradise.application.v2:${workflow}:${guildSelect.value}:${typeSelect.value}`;
  }

  function readDraft() {
    const key = draftKey();
    if (!key) return null;
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value && typeof value === "object" && value.answers && typeof value.answers === "object"
        ? value
        : null;
    } catch {
      return null;
    }
  }

  function currentAnswers() {
    return Object.fromEntries(
      [...fields.querySelectorAll("[data-answer-key]")]
        .map(input => [input.dataset.answerKey, input.value])
    );
  }

  function saveDraft() {
    const key = draftKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({
        workflow,
        guildId: guildSelect.value,
        type: typeSelect.value,
        answers: currentAnswers(),
        updatedAt: new Date().toISOString()
      }));
      draftState.textContent = `Taslak kaydedildi · ${new Date().toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit"
      })}. Kanıt dosyalarını gönderirken yeniden seçmelisin.`;
    } catch {
      draftState.textContent = "Tarayıcı taslak alanına erişilemedi; cevaplarını göndermeden önce ayrıca yedekle.";
    }
  }

  function scheduleDraftSave() {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(saveDraft, 250);
  }

  function clearDraft() {
    const key = draftKey();
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Private browsing can deny storage access. Submission has already succeeded.
    }
  }

  function updateCounter(input, counter) {
    counter.textContent = `${input.value.length}/${input.maxLength}`;
  }

  function extensionOf(name) {
    const normalized = String(name || "").normalize("NFKC").toLowerCase();
    const index = normalized.lastIndexOf(".");
    return index >= 0 ? normalized.slice(index) : "";
  }

  function evidenceInputs() {
    return [...fields.querySelectorAll('input[type="file"][data-question-key]')];
  }

  function selectedEvidenceFiles() {
    return evidenceInputs().flatMap(input => [...input.files].map(file => ({
      input,
      questionKey: input.dataset.questionKey,
      file
    })));
  }

  function validateEvidenceSelection({ quiet = false } = {}) {
    let totalBytes = 0;
    let totalFiles = 0;
    const allowedMimeTypes = new Set(evidencePolicy.allowedMimeTypes || defaultEvidencePolicy.allowedMimeTypes);
    for (const input of evidenceInputs()) {
      const files = [...input.files];
      if (input.dataset.evidenceRequired === "true" && files.length < 1) {
        if (!quiet) showNotice("Zorunlu görsel kanıt alanlarından en az biri boş.", "error");
        input.focus();
        return false;
      }
      if (files.length > evidencePolicy.maxPerQuestion) {
        if (!quiet) showNotice(`Her soru için en fazla ${evidencePolicy.maxPerQuestion} kanıt dosyası seçebilirsin.`, "error");
        input.value = "";
        return false;
      }
      for (const file of files) {
        totalFiles += 1;
        totalBytes += file.size;
        if (!allowedMimeTypes.has(file.type) || !allowedEvidenceExtensions.has(extensionOf(file.name))) {
          if (!quiet) showNotice("Kanıt dosyası yalnızca PNG, JPG/JPEG veya WebP olabilir.", "error");
          input.value = "";
          return false;
        }
        if (file.size < 1 || file.size > evidencePolicy.maxFileBytes) {
          if (!quiet) showNotice(`Her kanıt dosyası en fazla ${Math.floor(evidencePolicy.maxFileBytes / 1024)} KiB olabilir.`, "error");
          input.value = "";
          return false;
        }
      }
    }
    if (totalFiles > evidencePolicy.maxFiles) {
      if (!quiet) showNotice(`Toplam en fazla ${evidencePolicy.maxFiles} kanıt dosyası seçebilirsin.`, "error");
      return false;
    }
    if (totalBytes > evidencePolicy.maxTotalBytes) {
      if (!quiet) showNotice(`Kanıt dosyalarının toplamı en fazla ${Math.floor(evidencePolicy.maxTotalBytes / 1024)} KiB olabilir.`, "error");
      return false;
    }
    if (!quiet) hideNotice();
    return true;
  }

  function updateEvidenceList(input) {
    const list = input.parentElement.querySelector(".evidence-list");
    list.replaceChildren();
    for (const file of input.files) {
      const item = document.createElement("span");
      item.textContent = `${file.name} · ${Math.ceil(file.size / 1024)} KiB`;
      list.append(item);
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("evidence_read_failed"));
      reader.readAsDataURL(file);
    });
  }

  async function collectEvidence() {
    if (!validateEvidenceSelection()) throw new Error("invalid_evidence_selection");
    const entries = selectedEvidenceFiles();
    return Promise.all(entries.map(async ({ questionKey, file }) => ({
      questionKey,
      name: file.name,
      mimeType: file.type,
      data: await readFileAsDataUrl(file)
    })));
  }

  function disabledContextReason(context) {
    if (!context.applicationsOpen) return "başvurular kapalı";
    if (context.blacklisted) return "aktif blacklist kaydı";
    if (context.activeApplication) return `aktif ${context.activeApplication.label} başvurusu`;
    if (context.cooldownUntil) return `bekleme süresi ${new Date(context.cooldownUntil).toLocaleString("tr-TR")}`;
    return "";
  }

  function renderTypes() {
    const context = selectedContext();
    typeSelect.replaceChildren(new Option("Helper seç", ""));
    fields.replaceChildren();
    submitButton.disabled = true;
    if (!context) return;

    evidencePolicy = { ...defaultEvidencePolicy, ...(context.evidencePolicy || {}) };
    evidencePolicyText.textContent =
      `Sorulara göre isteğe bağlı veya zorunlu PNG, JPEG ya da WebP: soru başına ${evidencePolicy.maxPerQuestion}, toplam ${evidencePolicy.maxFiles} dosya; `
      + `dosya başına ${Math.floor(evidencePolicy.maxFileBytes / 1024)} KiB. `
      + "Tarama yapılamayan dosyalar güvenli kabul edilmez, incelemeye eklenmez ve karantinaya alınır.";

    for (const item of context.types || []) {
      typeSelect.append(new Option(item.label, item.type));
    }
    if (context.types?.some(item => item.type === preferredType)) {
      typeSelect.value = preferredType;
    } else if (context.types?.length === 1) {
      typeSelect.value = context.types[0].type;
    }
    if (typeSelect.value) renderQuestions();
  }

  function renderQuestions() {
    const type = selectedType();
    fields.replaceChildren();
    submitButton.disabled = true;
    if (!type) return;

    const draft = readDraft();
    for (const question of type.questions) {
      const wrap = document.createElement("div");
      wrap.className = "field";

      const label = document.createElement("label");
      label.htmlFor = `answer_${question.key}`;
      label.textContent = question.label;

      const input = document.createElement(question.multiline ? "textarea" : "input");
      input.id = `answer_${question.key}`;
      input.name = question.key;
      input.dataset.answerKey = question.key;
      input.placeholder = question.placeholder || "";
      input.minLength = question.min;
      input.maxLength = question.max;
      input.required = true;
      input.value = String(draft?.answers?.[question.key] || "");

      const help = document.createElement("small");
      help.textContent = `${question.min}–${question.max} karakter · `;
      const counter = document.createElement("span");
      counter.className = "question-counter";
      help.append(counter);
      updateCounter(input, counter);
      input.addEventListener("input", () => {
        updateCounter(input, counter);
        scheduleDraftSave();
      });

      const evidenceLabel = document.createElement("label");
      evidenceLabel.htmlFor = `evidence_${question.key}`;
      const evidenceRequired = question.evidenceRequirement === "required";
      evidenceLabel.textContent = evidenceRequired ? "Zorunlu görsel kanıt" : "İsteğe bağlı görsel kanıt";
      evidenceLabel.style.marginTop = "5px";

      const evidenceInput = document.createElement("input");
      evidenceInput.id = `evidence_${question.key}`;
      evidenceInput.type = "file";
      evidenceInput.className = "evidence-input";
      evidenceInput.accept = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";
      evidenceInput.multiple = true;
      evidenceInput.required = evidenceRequired;
      evidenceInput.dataset.questionKey = question.key;
      evidenceInput.dataset.evidenceRequired = String(evidenceRequired);

      const evidenceHelp = document.createElement("small");
      evidenceHelp.textContent = "Dosyalar taslağa kaydedilmez. Şifre, token, cookie, lisans anahtarı veya özel hesap verisi yükleme.";
      const evidenceList = document.createElement("div");
      evidenceList.className = "evidence-list";
      evidenceInput.addEventListener("change", () => {
        if (validateEvidenceSelection()) updateEvidenceList(evidenceInput);
        else evidenceList.replaceChildren();
      });

      wrap.append(label, input, help, evidenceLabel, evidenceInput, evidenceHelp, evidenceList);
      fields.append(wrap);
    }

    submitButton.disabled = false;
    if (draft) {
      const savedAt = draft.updatedAt ? new Date(draft.updatedAt).toLocaleString("tr-TR") : "önceki oturum";
      draftState.textContent = `Taslak geri yüklendi · ${savedAt}. Kanıt dosyalarını yeniden seçmelisin.`;
    } else {
      draftState.textContent = "Cevapların bu cihazda otomatik taslak olarak saklanır; kanıt dosyaları saklanmaz.";
    }
  }

  async function load() {
    try {
      const data = await jsonFetch(`/api/paradise/applications/context?workflow=${encodeURIComponent(workflow)}`);
      contexts = data.contexts || [];
      setStatus("loginStatus", "Fima hesabı bağlı", "good");
      setStatus("discordStatus", "Discord hesabı bağlı", "good");

      if (!contexts.length) {
        setStatus("memberStatus", "Paradise kurulu uygun bir sunucuda üyelik bulunamadı", "bad");
        guildSelect.replaceChildren(new Option("Önce Discord sunucusuna katıl", ""));
        const settings = await fetch(`${apiBase}/api/public/site-settings`, { cache: "no-store" })
          .then(response => response.json())
          .catch(() => null);
        const invite = settings?.settings?.discordInviteUrl;
        if (invite) {
          byId("joinServer").href = invite;
          byId("joinServer").classList.remove("hidden");
        }
        return;
      }

      setStatus("memberStatus", `${contexts.length} uygun sunucuda üyelik doğrulandı`, "good");
      guildSelect.replaceChildren(new Option("Sunucu seç", ""));
      for (const context of contexts) {
        const reason = disabledContextReason(context);
        const option = new Option(
          `${context.guildName} · ${context.activeSetupMode}${reason ? ` · ${reason}` : ""}`,
          context.guildId
        );
        option.disabled = Boolean(reason);
        guildSelect.append(option);
      }

      const available = contexts.filter(context => !disabledContextReason(context));
      if (available.length === 1) {
        guildSelect.value = available[0].guildId;
        renderTypes();
      }
    } catch (error) {
      if (error.status === 401) {
        setStatus("loginStatus", "Fima hesabına giriş gerekli", "bad");
        setStatus("discordStatus", "Girişten sonra Discord bağlantısı kontrol edilir", "warn");
        setStatus("memberStatus", "Bekleniyor", "warn");
        showNotice("Önce Fima hesabına giriş yap. Ardından Discord hesabını bağlayıp sunucu üyeliğini doğrulayacağız.", "error");
      } else if (error.body?.error === "discord_link_required") {
        setStatus("loginStatus", "Fima hesabı bağlı", "good");
        setStatus("discordStatus", "Discord hesabını bağlamalısın", "bad");
        setStatus("memberStatus", "Discord bağlantısı bekleniyor", "warn");
        showNotice("Başvuru göndermek için Discord hesabını Fima hesabına bağla.", "error");
      } else {
        showNotice("Başvuru servisi şu anda yüklenemedi. Biraz sonra tekrar dene.", "error");
      }
    }
  }

  guildSelect.addEventListener("change", renderTypes);
  typeSelect.addEventListener("change", renderQuestions);

  form.addEventListener("submit", async event => {
    event.preventDefault();
    submitButton.disabled = true;
    showNotice("Başvurun ve kanıt dosyaların doğrulanıyor…");
    try {
      const evidence = await collectEvidence();
      const token = await getCsrf();
      const result = await jsonFetch("/api/paradise/applications/submit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-fima-csrf": token
        },
        body: JSON.stringify({
          guildId: guildSelect.value,
          type: typeSelect.value,
          workflow,
          answers: currentAnswers(),
          evidence
        })
      });
      if (result?.success !== true || result?.application?.reviewQueued !== true || result?.application?.status !== "pending") {
        const error = new Error("application_private_review_unavailable");
        error.body = { error: "application_private_review_unavailable" };
        throw error;
      }
      clearDraft();
      const evidenceResult = result.application.evidence || { total: 0, accepted: 0, quarantined: 0 };
      const evidenceSummary = evidenceResult.total
        ? ` Kanıt: ${evidenceResult.accepted} taranıp kabul edildi, ${evidenceResult.quarantined} karantinaya alındı.`
        : "";
      const queueSummary = "Özel Discord inceleme kuyruğuna gönderildi.";
      showNotice(
        `Başvurun alındı: ${result.application.label} · #${result.application.id}. ${queueSummary}${evidenceSummary}`,
        "success"
      );
      form.querySelectorAll("input,textarea,select,button").forEach(node => {
        node.disabled = true;
      });
      draftState.textContent = "Taslak temizlendi; başvuru kaydı sunucuda tutuluyor.";
    } catch (error) {
      const code = error.body?.error || error.message;
      const messages = {
        active_application_exists: "Bu akışta zaten incelemede olan bir başvurun var.",
        application_cooldown_active: "Başvuru bekleme süren henüz bitmedi.",
        discord_membership_required: "Seçilen Discord sunucusunda üye olmalısın.",
        application_private_review_unavailable: "Özel Discord inceleme bileti şu anda açılamıyor. Başvurun kaydedilmedi; lütfen daha sonra tekrar dene.",
        applications_closed: "Bu sunucuda başvurular şu anda kapalı.",
        blacklisted_users_cannot_apply: "Aktif blacklist kaydı olan kullanıcılar başvuramaz.",
        invalid_application_answer: "Bir cevabın istenen uzunluğa uymuyor.",
        application_type_unavailable: "Bu başvuru türü seçilen akışta kullanılamıyor.",
        invalid_evidence_count: "Toplam kanıt dosyası sınırı aşıldı.",
        invalid_evidence_file: "Kanıt dosyalarından biri geçersiz.",
        invalid_evidence_question: "Bir kanıt dosyası geçersiz bir soruya bağlandı.",
        unsupported_evidence_type: "Yalnızca PNG, JPEG ve WebP kanıt dosyaları kabul edilir.",
        invalid_evidence_encoding: "Bir kanıt dosyası güvenli biçimde okunamadı.",
        invalid_evidence_size: "Bir kanıt dosyası boyut sınırını aşıyor veya boş.",
        evidence_signature_mismatch: "Bir kanıt dosyasının uzantısı, MIME türü ve gerçek imzası eşleşmiyor.",
        too_many_evidence_files_for_question: "Bir soru için en fazla iki kanıt dosyası yüklenebilir.",
        evidence_total_size_exceeded: "Kanıt dosyalarının toplam boyutu sınırı aşıyor.",
        required_evidence_missing: "Zorunlu görsel kanıt alanlarından en az biri boş.",
        evidence_read_failed: "Bir kanıt dosyası tarayıcı tarafından okunamadı.",
        invalid_evidence_selection: "Kanıt dosyalarını belirtilen sınırlara göre yeniden seç."
      };
      showNotice(messages[code] || "Başvuru gönderilemedi. Alanları kontrol edip tekrar dene.", "error");
      submitButton.disabled = false;
    }
  });

  load();
})();
