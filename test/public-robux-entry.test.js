import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../public/assets/js/app.js", import.meta.url), "utf8");
const serverSource = await readFile(new URL("../src/server.js", import.meta.url), "utf8");

test("launcher Robux query opens the manual plan picker before any account checkout", () => {
  assert.match(source, /commerceParams\.get\("payment"\) === "robux"/u);
  assert.match(source, /if \(robuxRequested\) \{[\s\S]*openRobuxModal\(robuxPlan\)[\s\S]*\} else if \(checkoutParam/u);
  assert.match(source, /data-robux-select-plan/u);
});

test("manual Robux copy explicitly denies automatic Stripe delivery", () => {
  assert.match(source, /Creating this order never starts Stripe or transfers Robux automatically\./u);
  assert.match(source, /Sipari\\u015f olu\\u015fturmak Stripe ba\\u015flatmaz veya otomatik Robux aktarmaz\./u);
});

test("manual Robux UI wires quote, list, refresh, premium selection and authenticated submit", () => {
  assert.match(source, /payments\/robux\/manual\/quote\?\$\{query\}/u);
  assert.match(source, /fetchWithTimeout\(`\$\{apiBase\}\/payments\/robux\/manual`,/u);
  assert.match(source, /event\.target\.matches\("#robuxOrderForm"\)[\s\S]*submitRobuxOrder\(event\)/u);
  assert.match(source, /event\.target\.matches\("#robuxOrderForm input\[name=premiumPlus\]"\)/u);
  assert.match(source, /event\.target\.closest\("\[data-robux-refresh\]"\)/u);
});

test("manual Robux submit is CSRF protected, idempotent and never trusts a client price", () => {
  const submitStart = source.indexOf('fetchWithTimeout(`${apiBase}/payments/robux/manual/submit`');
  const submitEnd = source.indexOf("}, 15000);", submitStart);
  assert.ok(submitStart > 0 && submitEnd > submitStart, "submit request block must exist");
  const submitRequest = source.slice(submitStart, submitEnd);
  assert.match(submitRequest, /method:\s*"POST"/u);
  assert.match(submitRequest, /"Idempotency-Key": robuxIdempotencyKey/u);
  assert.match(submitRequest, /\.\.\.\(await csrfHeaders\(\)\)/u);
  assert.doesNotMatch(submitRequest, /robuxAmount\s*:/u);
});

test("manual Robux submit remains fail-closed until quote and order state are both verified", () => {
  assert.match(source, /!activeRobuxQuote \|\| !ordersReady \|\| modal\.dataset\.robuxPending === "1" \|\| loading/u);
  assert.match(source, /modal\.dataset\.robuxOrdersReady = "0";[\s\S]*fetchWithTimeout\(`\$\{apiBase\}\/payments\/robux\/manual`/u);
  assert.match(source, /modal\.dataset\.robuxOrdersReady = "1"/u);
  assert.match(source, /activeRobuxQuote\.plan !== selectedRobuxPlan/u);
  assert.match(source, /activeRobuxQuote\.premiumPlus !== selectedRobuxPremiumPlus/u);
});

test("manual Robux UI does not embed a production Discord destination", () => {
  const robuxStart = source.indexOf("const robuxPlanLabel");
  const robuxEnd = source.indexOf("const updatePricingCountdowns", robuxStart);
  assert.ok(robuxStart > 0 && robuxEnd > robuxStart, "Robux UI region must exist");
  assert.doesNotMatch(source.slice(robuxStart, robuxEnd), /(?:discord\.com|discord\.gg)\//iu);
});

test("manual Robux read routes are authenticated and separately rate limited", () => {
  assert.match(serverSource, /app\.get\("\/payments\/robux\/manual", manualPaymentReadLimiter, requireUser,/u);
  assert.match(serverSource, /app\.get\("\/payments\/robux\/manual\/quote", manualPaymentReadLimiter, requireUser,/u);
  assert.match(serverSource, /app\.get\("\/payments\/robux\/manual\/:id", manualPaymentReadLimiter, requireUser,/u);
  assert.match(serverSource, /app\.post\("\/payments\/robux\/manual\/submit", manualPaymentLimiter, requireUser,/u);
  assert.ok(
    serverSource.indexOf("requireCsrfForCookieMutations") < serverSource.indexOf('app.post("/payments/robux/manual/submit"'),
    "cookie mutation CSRF middleware must be registered before manual Robux submit"
  );
});

test("emergency admin lockdown classifies only Robux approve and reject as admin surfaces", () => {
  const functionStart = serverSource.indexOf("function isAdminSurfacePath");
  const functionEnd = serverSource.indexOf("function isAdminDebugPath", functionStart);
  assert.ok(functionStart > 0 && functionEnd > functionStart, "admin surface classifier must exist");
  const adminClassifier = serverSource.slice(functionStart, functionEnd);
  assert.match(adminClassifier, /approve\|reject/u);
  assert.doesNotMatch(adminClassifier, /routePath\.startsWith\("\/payments\/robux\/manual"\)/u);
  assert.doesNotMatch(adminClassifier, /routePath === "\/payments\/robux\/manual"/u);
});
