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
  let licenseRequiresSecureReveal = false;
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

  const copyWithFallback = async (value) => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch (error) {
        // Continue to the legacy in-page fallback. Some browser privacy modes
        // reject Clipboard API calls even after a user clicked the button.
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand?.("copy");
    textarea.remove();
    if (!copied) throw new Error("Copy is unavailable in this browser.");
  };

  const maskEmail = (value) => {
    const text = String(value || "").trim();
    const [name, domain] = text.split("@");
    if (!name || !domain) return text ? "masked" : "-";
    return `${name.slice(0, 1)}***@${domain}`;
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
    activeLicenseKey = String(license.licenseKey || "").trim();
    activeGiftCode = "";
    licenseRequiresSecureReveal = !activeLicenseKey;
    title.textContent = "Your license is ready.";
    message.textContent = licenseRequiresSecureReveal
      ? "Your payment is linked to your account. Open My Products to securely reveal and copy your license key."
      : "Copy this key and keep it safe. Your download is unlocked from this page.";
    licenseKeyNode.textContent = activeLicenseKey || license.licenseKeyMasked || "Securely available in My Products";
    licenseBox.hidden = false;
    if (copyButton) copyButton.textContent = licenseRequiresSecureReveal ? "Open My Products" : "Copy License Key";
    meta.innerHTML = `
      <div><span>Plan</span><strong>${formatPlan(license.plan)}</strong></div>
      <div><span>Expires</span><strong>${license.lifetime ? "Never expires" : new Date(license.expiresAt).toLocaleString()}</strong></div>
      <div><span>Email</span><strong>${license.customerEmailMasked || maskEmail(license.customerEmail)}</strong></div>
    `;
    setDisabled(downloadButton, false, "Download Fima Macro");
    if (downloadButton) downloadButton.href = "#download";
  };

  const showGiftCode = (data) => {
    const gift = data.giftCode || {};
    activeLicenseKey = "";
    activeGiftCode = gift.giftCode || "";
    licenseRequiresSecureReveal = false;
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
    licenseRequiresSecureReveal = false;
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

      if (attempt < 90) {
        title.textContent = "Processing your payment...";
        message.textContent = "Stripe confirmed the checkout. Fima is checking your account and creating the license record automatically.";
        window.setTimeout(() => pollResult(attempt + 1), 2000);
        return;
      }

      title.textContent = "Payment received. Your key is still syncing.";
      message.textContent = "Open My Products; Fima keeps checking your account there. If it is still missing after a few minutes, contact support with masked order details only.";
      setDisabled(downloadButton, false, "Open My Products");
      if (downloadButton) downloadButton.href = "/dashboard/products";
    } catch (error) {
      if (attempt < 90) {
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
    if (licenseRequiresSecureReveal) {
      window.location.assign("/dashboard/products");
      return;
    }
    const value = activeGiftCode || activeLicenseKey;
    if (!value) {
      showToast("Open My Products to securely copy your license key.");
      return;
    }
    try {
      await copyWithFallback(value);
      showToast(activeGiftCode ? "Gift code copied." : "License key copied.");
    } catch (error) {
      showToast(error.message || "Could not copy the key. Please try My Products.");
    }
  });

  downloadButton?.addEventListener("click", async (event) => {
    const href = downloadButton.getAttribute("href") || "";
    if (href && href !== "#download") return;
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
