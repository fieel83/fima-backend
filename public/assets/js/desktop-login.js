(() => {
  "use strict";

  const apiBase = String(window.FIMA_API_BASE_URL || window.location.origin).replace(/\/+$/, "");
  const form = document.getElementById("code-form");
  const input = document.getElementById("user-code");
  const inspectButton = document.getElementById("inspect-button");
  const devicePanel = document.getElementById("device-panel");
  const approvalActions = document.getElementById("approval-actions");
  const approveButton = document.getElementById("approve-button");
  const differentCodeButton = document.getElementById("different-code");
  const status = document.getElementById("page-status");
  const requestId = new URLSearchParams(window.location.search).get("request") || "";
  const state = new URLSearchParams(window.location.search).get("state") || "";
  let accountName = "";
  let csrfToken = "";
  let approvedCode = "";
  let expiryTimer = null;

  const normalizedCode = (value) => {
    const compact = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
  };

  const setStatus = (title, message, kind = "info") => {
    status.dataset.kind = kind;
    status.querySelector("strong").textContent = title;
    status.querySelector("p").textContent = message;
  };

  const api = async (pathname, { method = "GET", body } = {}) => {
    const response = await fetch(`${apiBase}${pathname}`, {
      method,
      credentials: "include",
      redirect: "error",
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
        ...(method !== "GET" && csrfToken ? { "x-fima-csrf": csrfToken } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.message || "İstek doğrulanamadı.");
      error.code = payload?.error || "request_failed";
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  const redirectToLogin = () => {
    window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  };

  const ensureSession = async () => {
    try {
      if (!requestId || !state) { setStatus("Giriş isteği eksik", "Hub’dan giriş başlat.", "error"); return; }
      const account = await api("/api/auth/me");
      accountName = String(account.user?.username || account.user?.displayName || account.user?.name || "FIMA hesabın");
      const csrf = await api("/api/csrf-token");
      csrfToken = String(csrf?.csrfToken || "");
      if (!csrfToken) throw new Error("Güvenlik anahtarı alınamadı.");
      await inspectIntent();
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      setStatus("Hesap oturumu doğrulanamadı", "Sayfayı yenileyip tekrar deneyin.", "error");
    }
  };

  const updateExpiry = (expiresAt) => {
    if (expiryTimer) window.clearInterval(expiryTimer);
    const output = document.getElementById("request-expiry");
    const render = () => {
      const remaining = Math.max(0, Date.parse(expiresAt) - Date.now());
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      output.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      if (remaining <= 0) {
        window.clearInterval(expiryTimer);
        approveButton.disabled = true;
        setStatus("Giriş isteğinin süresi doldu", "Hub’dan girişi yeniden başlat.", "error");
      }
    };
    render();
    expiryTimer = window.setInterval(render, 1000);
  };

  const reset = () => {
    approvedCode = "";
    devicePanel.hidden = true;
    approvalActions.hidden = true;
    form.hidden = false;
    input.value = "";
    input.focus();
    setStatus("FIMA hesabınla devam et", "Kodu yalnız kendi açtığın FIMA uygulamasından aldıysan onayla.");
  };

  input.addEventListener("input", () => {
    input.value = normalizedCode(input.value);
  });

  const inspectIntent = async () => {
    form.hidden = true;
    approveButton.disabled = true;
    setStatus("Hesabın kontrol ediliyor", "Cihaz bilgileri hazırlanıyor.");
    try {
      const context = await api("/api/desktop-login/context", { method: "POST", body: { requestId, state } });
      approvedCode = requestId;
      document.getElementById("approval-title").textContent = `Sen ${accountName} misin?`;
      approveButton.querySelector("span").textContent = `${accountName} olarak devam et`;
      differentCodeButton.textContent = "Başka bir hesapla giriş yap";
      document.getElementById("device-name").textContent = context.device?.name || "Windows PC";
      document.getElementById("device-meta").textContent = `${context.device?.platform || "Windows"} · FIMA ${context.appVersion || "Desktop"}`;
      devicePanel.hidden = false; approvalActions.hidden = false;
      approveButton.disabled = context.canApprove !== true;
      updateExpiry(context.expiresAt);
      setStatus(context.canApprove ? "Hesabınla devam et" : "Onay Hub'a gönderildi", "Yalnız kendi başlattığın girişe izin ver.");
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      setStatus("Giriş isteği geçersiz", "Hub'dan yeniden başlat.", "error");
    }
  };

  approveButton.addEventListener("click", async () => {
    if (!approvedCode) { setStatus("Giriş isteği geçersiz", "Hub’dan yeniden başlat.", "error"); return; }
    approveButton.disabled = true;
    differentCodeButton.disabled = true;
    setStatus("Giriş onaylanıyor", "Tek kullanımlık yetki FIMA masaüstü istemcisine hazırlanıyor.");
    try {
      const approval = await api("/api/desktop-login/approve", { method: "POST", body: { requestId, state } });
      if (approval.callbackUri) {
        const target = new URL(approval.callbackUri);
        const valid = target.protocol === "http:" && target.hostname === "127.0.0.1" && Number(target.port) >= 1024 && target.pathname === "/auth/callback" && !target.username && !target.password && !target.hash && target.searchParams.get("state") === state && /^[A-Za-z0-9_-]{43}$/.test(target.searchParams.get("code") || "") && [...target.searchParams.keys()].length === 2;
        if (!valid) throw new Error("Geçersiz geri dönüş adresi");
        window.location.replace(target.href);
      }
      setStatus("Cihaz onaylandı", "FIMA uygulamasına dönebilirsin. Bu pencereyi güvenle kapatabilirsin.", "success");
      approveButton.querySelector("span").textContent = "Onaylandı";
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      approveButton.disabled = false;
      differentCodeButton.disabled = false;
      setStatus("Onay tamamlanamadı", "İstek sona ermiş olabilir. Hub’dan girişi yeniden başlat.", "error");
    }
  });

  differentCodeButton.addEventListener("click", async () => {
    differentCodeButton.disabled = true;
    approveButton.disabled = true;
    try { await api("/api/auth/logout", { method: "POST", body: {} }); redirectToLogin(); }
    catch { differentCodeButton.disabled = false; approveButton.disabled = false; setStatus("Hesap değiştirilemedi", "Tekrar dene.", "error"); }
  });
  document.getElementById("deny-button").addEventListener("click", async () => {
    approveButton.disabled = true; differentCodeButton.disabled = true;
    try {
      await api("/api/desktop-login/deny", { method: "POST", body: { requestId, state } });
      approvalActions.hidden = true;
      if (expiryTimer) clearInterval(expiryTimer);
      setStatus("Giriş iptal edildi", "Hub bu hesapla giriş yapmayacak.");
    } catch { setStatus("İstek kapatılamadı", "Hub'dan iptal et veya yeniden dene.", "error"); }
  });
  window.addEventListener("beforeunload", () => expiryTimer && window.clearInterval(expiryTimer));
  ensureSession();
})();
