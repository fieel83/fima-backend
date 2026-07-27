const form = document.querySelector("#owner-login");
const status = document.querySelector("#form-status");
const button = form.querySelector("button");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");
  if (!email || !password) {
    status.textContent = "E-posta ve şifre gerekli.";
    return;
  }

  button.disabled = true;
  status.textContent = "Doğrulanıyor…";
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) throw new Error("invalid_credentials");
    status.textContent = "Discord owner doğrulamasına yönlendiriliyorsunuz…";
    window.location.assign("/auth/discord/start");
  } catch {
    status.textContent = "Bu giriş için erişim doğrulanamadı.";
    button.disabled = false;
  }
});
