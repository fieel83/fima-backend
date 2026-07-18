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
    window.location.replace("/login?next=%2Fdesktop-login");
  };

  const ensureSession = async () => {
    try {
      await api("/api/auth/me");
      const csrf = await api("/api/csrf-token");
      csrfToken = String(csrf?.csrfToken || "");
      if (!csrfToken) throw new Error("Güvenlik anahtarı alınamadı.");
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
        setStatus("Kodun süresi doldu", "FIMA uygulamasından yeni bir kod oluştur.", "error");
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const userCode = normalizedCode(input.value);
    if (userCode.length !== 9) {
      setStatus("Kod eksik", "FIMA uygulamasında görünen 8 karakterli kodu gir.", "error");
      input.focus();
      return;
    }
    inspectButton.disabled = true;
    setStatus("Cihaz doğrulanıyor", "Bekleyen giriş isteği güvenli şekilde aranıyor.");
    try {
      const context = await api("/api/desktop-login/context", { method: "POST", body: { userCode } });
      approvedCode = userCode;
      document.getElementById("device-name").textContent = context.device?.name || "Windows PC";
      document.getElementById("device-meta").textContent = `${context.device?.platform || "Windows"} · FIMA ${context.appVersion || "Desktop"}`;
      devicePanel.hidden = false;
      approvalActions.hidden = false;
      form.hidden = true;
      approveButton.disabled = context.canApprove !== true;
      updateExpiry(context.expiresAt);
      setStatus(
        context.status === "approved" ? "Bu istek zaten onaylandı" : "Cihazı dikkatle kontrol et",
        context.status === "approved" ? "Masaüstü uygulamasına dönerek girişin tamamlanmasını bekle." : "Yalnız cihaz adı ve sürüm sana aitse devam et.",
        context.status === "approved" ? "success" : "info"
      );
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      setStatus("Kod bulunamadı", "Kod yanlış, süresi dolmuş veya daha önce kullanılmış olabilir.", "error");
    } finally {
      inspectButton.disabled = false;
    }
  });

  approveButton.addEventListener("click", async () => {
    if (!approvedCode) return reset();
    approveButton.disabled = true;
    differentCodeButton.disabled = true;
    setStatus("Giriş onaylanıyor", "Tek kullanımlık yetki FIMA masaüstü istemcisine hazırlanıyor.");
    try {
      await api("/api/desktop-login/approve", { method: "POST", body: { userCode: approvedCode } });
      setStatus("Cihaz onaylandı", "FIMA uygulamasına dönebilirsin. Bu pencereyi güvenle kapatabilirsin.", "success");
      approveButton.querySelector("span").textContent = "Onaylandı";
    } catch (error) {
      if (error.status === 401) return redirectToLogin();
      approveButton.disabled = false;
      differentCodeButton.disabled = false;
      setStatus("Onay tamamlanamadı", "İstek sona ermiş olabilir. FIMA uygulamasından yeni kod oluştur.", "error");
    }
  });

  differentCodeButton.addEventListener("click", reset);
  window.addEventListener("beforeunload", () => expiryTimer && window.clearInterval(expiryTimer));
  ensureSession();
})();
