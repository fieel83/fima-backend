export const DESKTOP_CHECKOUT_PLAN_IDS = Object.freeze(["3days", "monthly", "lifetime"]);
export const DESKTOP_ROBUX_PAYMENT_URL = "/pricing?payment=robux";

const desktopCheckoutPlans = new Set(DESKTOP_CHECKOUT_PLAN_IDS);

export function desktopCheckoutLocation(rawPlan) {
  const plan = String(rawPlan || "").trim().toLowerCase();
  if (!desktopCheckoutPlans.has(plan)) return null;
  return `/pricing?checkout=${encodeURIComponent(plan)}`;
}

export function registerDesktopCommerceRoutes(app, { robuxPaymentUrl = DESKTOP_ROBUX_PAYMENT_URL } = {}) {
  // Keep older desktop builds and bookmarked launcher links working while the
  // canonical signed target remains /dashboard/redeem.
  app.get("/redeem", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, "/dashboard/redeem");
  });

  app.get("/pricing/:desktopPlan", (req, res, next) => {
    const location = desktopCheckoutLocation(req.params.desktopPlan);
    if (!location) return next();
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, location);
  });

  app.get("/payments/robux", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, robuxPaymentUrl);
  });
}
