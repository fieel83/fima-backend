import assert from "node:assert/strict";
import test from "node:test";

import {
  DESKTOP_CHECKOUT_PLAN_IDS,
  DESKTOP_ROBUX_PAYMENT_URL,
  desktopCheckoutLocation,
  registerDesktopCommerceRoutes
} from "../src/desktopCommerceRoutes.js";

function routeFixture() {
  const routes = new Map();
  const app = {
    get(path, handler) {
      routes.set(path, handler);
    }
  };
  registerDesktopCommerceRoutes(app);
  return routes;
}

function response() {
  return {
    headers: {},
    redirectStatus: null,
    redirectLocation: null,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    redirect(status, location) {
      this.redirectStatus = status;
      this.redirectLocation = location;
      return this;
    }
  };
}

test("desktop checkout maps exactly the three public plans to the website", () => {
  assert.deepEqual(DESKTOP_CHECKOUT_PLAN_IDS, ["3days", "monthly", "lifetime"]);
  assert.equal(desktopCheckoutLocation("3days"), "/pricing?checkout=3days");
  assert.equal(desktopCheckoutLocation("monthly"), "/pricing?checkout=monthly");
  assert.equal(desktopCheckoutLocation("lifetime"), "/pricing?checkout=lifetime");
});

test("desktop checkout rejects unknown plan names instead of forwarding arbitrary input", () => {
  assert.equal(desktopCheckoutLocation("1day"), null);
  assert.equal(desktopCheckoutLocation("owner"), null);
  assert.equal(desktopCheckoutLocation("monthly?next=https://attacker.invalid"), null);

  const handler = routeFixture().get("/pricing/:desktopPlan");
  const res = response();
  let nextCalls = 0;
  handler({ params: { desktopPlan: "unknown" } }, res, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(res.redirectStatus, null);
  assert.deepEqual(res.headers, {});
});

test("desktop commerce redirects are temporary and never cached", () => {
  const routes = routeFixture();

  const redeem = response();
  routes.get("/redeem")({}, redeem);
  assert.equal(redeem.redirectStatus, 302);
  assert.equal(redeem.redirectLocation, "/dashboard/redeem");
  assert.equal(redeem.headers["cache-control"], "no-store");

  const checkout = response();
  routes.get("/pricing/:desktopPlan")({ params: { desktopPlan: "monthly" } }, checkout, () => {});
  assert.equal(checkout.redirectStatus, 302);
  assert.equal(checkout.redirectLocation, "/pricing?checkout=monthly");
  assert.equal(checkout.headers["cache-control"], "no-store");

  const robux = response();
  routes.get("/payments/robux")({}, robux);
  assert.equal(robux.redirectStatus, 302);
  assert.equal(robux.redirectLocation, DESKTOP_ROBUX_PAYMENT_URL);
  assert.equal(robux.headers["cache-control"], "no-store");
});

test("desktop Robux entry stays on the owned pricing flow and never starts Stripe checkout", () => {
  assert.equal(DESKTOP_ROBUX_PAYMENT_URL, "/pricing?payment=robux");
  assert.doesNotMatch(DESKTOP_ROBUX_PAYMENT_URL, /checkout=/u);
  assert.doesNotMatch(DESKTOP_ROBUX_PAYMENT_URL, /discord\.com/u);
});
