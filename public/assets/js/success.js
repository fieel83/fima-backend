(() => {
  const apiBase = String(window.FIMA_API_BASE_URL || "https://api.fimamacro.com").replace(/\/+$/, "");
  const publicSetupUrl = "https://github.com/fieel83/fima-macro-releases/releases/download/v1.0.130/FIMA.MACRO.Setup.exe";
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");

  const title = document.getElementById("successTitle");
  const message = document.getElementById("successMessage");
  const licenseBox = document.getElementById("licenseBox");
  const licenseKeyNode = document.getElementById("licenseKey");
  const meta = document.getElementById("successMeta");
  const copyButton = document.getElementById("copyLicense");
  const downloadButton = document.getElementById("successDownloadButton");
  const discordButton = document.getElementById("successDiscordButton");
  const toast = document.getElementById("checkoutToast");

  let activeLicenseKey = "";
  let activeGiftCode = "";
  let siteSettings = {};

  const formatPlan = (plan) => ({
    "1day": "Free Trial",
    "3days": "3 Days Access",
    monthly: "Monthly Subscription",
    "2weeks": "Legacy Product - 15 Days",
    "1month": "Legacy Product - 1 Month",
    "3months": "Legacy Product - 3 Months",
    lifetime: "Lifetime"
  })[plan] || plan || "-";

  const setDisabled = (button, disabled, label) => {
    if (!button) return;
    button.classList.toggle("is-disabled", disabled);
    button.setAttribute("aria-disabled", String(disabled));
    if (disabled) {
      button.removeAttribute("href");
      button.removeAttribute("target");
      button.removeAttribute("rel");
    }
    if (label) button.textContent = label;
  };

  const showToast = (text) => {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("is-visible");
    window.setTimeout(() => toast.classList.remove("is-visible"), 3000);
  };

  const loadSiteSettings = async () => {
    try {
      const response = await fetch(`${apiBase}/api/public/site-settings`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      siteSettings = data.settings || {};
    } catch (error) {
      siteSettings = {};
    }
  };

  const hydrateDiscord = () => {
    const invite = String(siteSettings.discordInviteUrl || window.FIMA_DISCORD_INVITE_URL || "").trim();
    if (!discordButton) return;
    if (!invite) {
      setDisabled(discordButton, true, "Discord link not configured");
      return;
    }
    discordButton.href = invite;
    discordButton.target = "_blank";
    discordButton.rel = "noopener";
    discordButton.textContent = "Join Discord";
    setDisabled(discordButton, false);
  };

  const showLicense = (data) => {
    const license = data.license || data;
    activeLicenseKey = license.licenseKey || "";
    activeGiftCode = "";
    title.textContent = "Your license is ready.";
    message.textContent = "Copy this key and keep it safe. Your download is unlocked from this page.";
    licenseKeyNode.textContent = activeLicenseKey;
    licenseBox.hidden = false;
    if (copyButton) copyButton.textContent = "Copy License Key";
    meta.innerHTML = `
      <div><span>Plan</span><strong>${formatPlan(license.plan)}</strong></div>
      <div><span>Expires</span><strong>${license.lifetime ? "Never expires" : new Date(license.expiresAt).toLocaleString()}</strong></div>
      <div><span>Email</span><strong>${license.customerEmail || "-"}</strong></div>
    `;
    setDisabled(downloadButton, false, "Download Fima Macro");
    if (downloadButton) downloadButton.href = "#download";
  };

  const showGiftCode = (data) => {
    const gift = data.giftCode || {};
    activeLicenseKey = "";
    activeGiftCode = gift.giftCode || "";
    title.textContent = "Gift Code Created";
    message.textContent = activeGiftCode
      ? "Your gift code is ready. Give this code to the person you want. The license time starts only when the code is redeemed."
      : "Your gift code was created, but this checkout can only show the masked code because encrypted code storage is not configured.";
    licenseKeyNode.textContent = activeGiftCode || gift.maskedCode || "Gift code unavailable";
    licenseBox.hidden = false;
    if (copyButton) copyButton.textContent = "Copy Gift Code";
    meta.innerHTML = `
      <div><span>Product</span><strong>${gift.productName || "Fima Macro"}</strong></div>
      <div><span>Duration</span><strong>${formatPlan(gift.plan)}</strong></div>
      <div><span>Status</span><strong>${gift.status || "unused"}</strong></div>
      <div><span>Starts</span><strong>When redeemed</strong></div>
    `;
    setDisabled(downloadButton, true, "Download unlocks after redeem");
    showToast(activeGiftCode ? "Gift code created." : "Gift code created. Contact support if you need the full code again.");
  };

  const showProductPurchase = (data) => {
    const purchase = data.purchase || {};
    activeLicenseKey = "";
    activeGiftCode = "";
    title.textContent = "Your purchase is ready.";
    message.textContent = "This order was added to your account. Open My Products to view it and download from the official GitHub release.";
    licenseBox.hidden = true;
    meta.innerHTML = `
      <div><span>Product</span><strong>${purchase.product?.name || "Fima Macro product"}</strong></div>
      <div><span>Status</span><strong>${purchase.status || "ready"}</strong></div>
      <div><span>Account</span><strong>Open My Products</strong></div>
    `;
    setDisabled(downloadButton, false, "Open My Products");
    if (downloadButton) downloadButton.href = "/dashboard/products";
  };

  const pollResult = async (attempt = 0) => {
    if (!sessionId) {
      title.textContent = "Missing checkout session.";
      message.textContent = "Open this page from Stripe Checkout after a successful payment.";
      return;
    }

    try {
      const response = await fetch(`${apiBase}/api/checkout/result?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        if (data.giftCodePurchase || data.status === "gift_code_created") {
          showGiftCode(data);
          return;
        }
        if (data.productPurchase || data.status === "product_purchase_ready") {
          showProductPurchase(data);
          return;
        }
        showLicense(data);
        return;
      }

      if (attempt < 30) {
        title.textContent = "Processing your payment...";
        message.textContent = "Stripe confirmed the checkout. Fima is checking your account and creating the license record automatically.";
        window.setTimeout(() => pollResult(attempt + 1), 2000);
        return;
      }

      title.textContent = "Payment received. We are still syncing the license.";
      message.textContent = "Open My Products in a minute. If it is still missing, contact support and mention that checkout sync is delayed.";
      setDisabled(downloadButton, false, "Open My Products");
      if (downloadButton) downloadButton.href = "/dashboard/products";
    } catch (error) {
      if (attempt < 30) {
        title.textContent = "Processing your payment...";
        message.textContent = "The license server did not answer yet. Retrying automatically.";
        window.setTimeout(() => pollResult(attempt + 1), 2000);
        return;
      }
      title.textContent = "Could not reach the license server.";
      message.textContent = "Please try again in a moment or contact support.";
    }
  };

  copyButton?.addEventListener("click", async () => {
    const value = activeGiftCode || activeLicenseKey;
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    showToast(activeGiftCode ? "Gift code copied." : "License key copied.");
  });

  downloadButton?.addEventListener("click", async (event) => {
    event.preventDefault();
    if (!activeLicenseKey) {
      showToast("Your license is not ready yet.");
      return;
    }

    setDisabled(downloadButton, true, "Preparing download...");
    try {
      const response = await fetch(`${apiBase}/api/download?licenseKey=${encodeURIComponent(activeLicenseKey)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.downloadUrl) {
        throw new Error(data.message || "Download is not available for this license.");
      }
      window.location.href = data.downloadUrl;
    } catch (error) {
      showToast(error.message || "Download could not be prepared. Opening the public setup download.");
      setDisabled(downloadButton, false, "Download Fima Macro");
      downloadButton.href = publicSetupUrl;
      downloadButton.target = "_blank";
      downloadButton.rel = "noopener";
      window.location.href = publicSetupUrl;
    }
  });

  setDisabled(downloadButton, true, "Download unlocks after license");
  loadSiteSettings().then(() => {
    hydrateDiscord();
    pollResult();
  });
})();
