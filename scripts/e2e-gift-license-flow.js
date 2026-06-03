import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { generateUniqueLicenseKey, normalizeLicenseKey } from "../src/license.js";
import { getPlan, getPlanExpiry } from "../src/plans.js";

const prisma = new PrismaClient();

const apiBase = stripTrailingSlash(process.env.E2E_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:3000");
const adminApiKey = (process.env.ADMIN_API_KEY || process.env.FIMA_ADMIN_API_KEY || "").trim();
const runId = Date.now().toString(36);
const email = (process.env.E2E_USER_EMAIL || `fima-e2e-${runId}@gmail.com`).toLowerCase();
const password = process.env.E2E_USER_PASSWORD || `FimaE2e!${runId}`;
const hwidA = `E2E-HWID-${runId}-A`;
const hwidB = `E2E-HWID-${runId}-B`;

const report = {
  apiBase,
  userEmail: email,
  giftCodeFlow: {},
  directPackageFlow: {},
  validationMatrix: [],
  supplementalValidation: {},
  adminVisibility: {},
  failures: []
};

if (!process.env.DATABASE_URL) fail("DATABASE_URL is required for this E2E flow.");
if (!adminApiKey) fail("ADMIN_API_KEY or FIMA_ADMIN_API_KEY is required for admin gift/direct/package setup.");

try {
  const session = await registerOrLogin();
  await setLinkedState(session.user.id, { discord: false, roblox: false });

  await testGiftCodeFlow(session);
  await testDirectPackageFlow(session);
  await testLicenseValidationMatrix(session);

  report.ok = report.failures.length === 0;
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  report.failures.push({ step: "fatal", message: error.message });
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

async function testGiftCodeFlow(session) {
  const created = await adminPost("/admin/api/gift-codes/create", {
    plan: "1day",
    quantity: 1,
    maxUses: 1,
    requiresDiscord: true,
    requiresRoblox: true,
    notes: `e2e gift ${runId}`
  });
  const gift = created.json.giftCodes?.[0];
  assertStep("gift created", created.status === 201 && gift?.code);
  report.giftCodeFlow.created = { status: created.status, plaintextReturnedOnce: Boolean(gift?.code), maskedCode: gift?.maskedCode };

  const dbGift = await prisma.giftCode.findUnique({ where: { id: gift.id } });
  report.giftCodeFlow.hashStored = Boolean(dbGift?.codeHash);
  report.giftCodeFlow.plaintextNotStored = dbGift ? !Object.prototype.hasOwnProperty.call(dbGift, "code") : false;
  assertStep("gift stores hash", report.giftCodeFlow.hashStored && report.giftCodeFlow.plaintextNotStored);

  await setLinkedState(session.user.id, { discord: false, roblox: false });
  const noDiscord = await userPost(session, "/api/gifts/redeem", { code: gift.code, hwid: hwidA });
  report.giftCodeFlow.blockedWithoutDiscord = noDiscord.json.error || noDiscord.json.reason;
  assertStep("gift blocked without Discord", noDiscord.status === 403 && ["discord_required", "discord_not_connected"].includes(report.giftCodeFlow.blockedWithoutDiscord));

  await setLinkedState(session.user.id, { discord: true, roblox: false });
  const noRoblox = await userPost(session, "/api/gifts/redeem", { code: gift.code, hwid: hwidA });
  report.giftCodeFlow.blockedWithoutRoblox = noRoblox.json.error || noRoblox.json.reason;
  assertStep("gift blocked without Roblox", noRoblox.status === 403 && ["roblox_required", "roblox_not_connected"].includes(report.giftCodeFlow.blockedWithoutRoblox));

  await setLinkedState(session.user.id, { discord: true, roblox: true });
  const redeemed = await userPost(session, "/api/gifts/redeem", { code: gift.code, hwid: hwidA });
  report.giftCodeFlow.redeemed = summarizeResponse(redeemed);
  assertStep("gift redeemed", redeemed.status === 201 && redeemed.json.license?.licenseKey);
  report.giftCodeFlow.licenseKey = redeemed.json.license.licenseKey;

  const secondUse = await userPost(session, "/api/gifts/redeem", { code: gift.code, hwid: hwidA });
  report.giftCodeFlow.secondUseBlocked = secondUse.json.error || secondUse.json.reason;
  assertStep("gift second use blocked", secondUse.status === 409 && report.giftCodeFlow.secondUseBlocked === "already_redeemed");

  const [products, adminLicenses, freshGift, audit] = await Promise.all([
    userGet(session, "/api/me/products"),
    adminGet(`/admin/api/licenses?search=${encodeURIComponent(redeemed.json.license.licenseKey)}`),
    prisma.giftCode.findUnique({
      where: { id: gift.id },
      include: { redemptions: { include: { user: true, license: true } } }
    }),
    prisma.auditLog.findFirst({ where: { action: "gift_code_redeemed", targetId: gift.id }, orderBy: { createdAt: "desc" } })
  ]);

  report.giftCodeFlow.myProductsVisible = hasLicense(products.json, redeemed.json.license.licenseKey);
  report.giftCodeFlow.adminPanelVisible = hasAdminLicense(adminLicenses.json, redeemed.json.license.licenseKey);
  report.giftCodeFlow.status = freshGift?.status;
  report.giftCodeFlow.redeemedByEmail = freshGift?.redemptions?.[0]?.redeemedEmail || null;
  report.giftCodeFlow.redeemedDiscord = freshGift?.redemptions?.[0]?.discordUserId || null;
  report.giftCodeFlow.redeemedRoblox = freshGift?.redemptions?.[0]?.robloxUserId || null;
  report.giftCodeFlow.redeemedHwid = freshGift?.redemptions?.[0]?.hwid || null;
  report.giftCodeFlow.auditLogCreated = Boolean(audit);
  assertStep("gift visible in My Products", report.giftCodeFlow.myProductsVisible);
  assertStep("gift visible in Admin Panel", report.giftCodeFlow.adminPanelVisible);
  assertStep("gift status redeemed", report.giftCodeFlow.status === "redeemed");
  assertStep("gift audit log", report.giftCodeFlow.auditLogCreated);

  const valid = await validateLicense(redeemed.json.license.licenseKey, hwidA);
  const mismatch = await validateLicense(redeemed.json.license.licenseKey, hwidB);
  report.giftCodeFlow.appValidation = { sameHwid: valid.json.reason, otherHwid: mismatch.json.reason };
  assertStep("gift validation works", valid.json.valid === true && mismatch.json.reason === "hwid_mismatch");
}

async function testDirectPackageFlow(session) {
  const noAccount = await adminPost("/admin/api/direct-packages/send", {
    recipientEmail: `missing-${runId}@gmail.com`,
    plan: "1day",
    requiresDiscord: true,
    requiresRoblox: true,
    message: "Fieel'den bedava 1 günlük abonelik kazandınız."
  });
  report.directPackageFlow.noAccountError = noAccount.json.message || noAccount.json.error;
  assertStep("direct no account error", noAccount.status === 404 && noAccount.json.error === "recipient_account_not_found");

  const sent = await adminPost("/admin/api/direct-packages/send", {
    recipientEmail: session.user.email,
    plan: "1day",
    requiresDiscord: true,
    requiresRoblox: true,
    message: "Fieel'den bedava 1 günlük abonelik kazandınız.",
    notes: `e2e direct ${runId}`
  });
  const pkg = sent.json.package;
  report.directPackageFlow.sent = summarizeResponse(sent);
  assertStep("direct package pending", sent.status === 201 && pkg?.id && pkg.status === "pending");

  const pending = await userGet(session, "/api/gifts/pending");
  report.directPackageFlow.pendingVisible = (pending.json.packages || []).some((item) => item.id === pkg.id);
  assertStep("direct pending visible", report.directPackageFlow.pendingVisible);

  await setLinkedState(session.user.id, { discord: false, roblox: false });
  const noDiscord = await userPost(session, "/api/gifts/claim-direct", { packageId: pkg.id, hwid: hwidA });
  report.directPackageFlow.blockedWithoutDiscord = noDiscord.json.error || noDiscord.json.reason;
  assertStep("direct blocked without Discord", noDiscord.status === 403 && ["discord_required", "discord_not_connected"].includes(report.directPackageFlow.blockedWithoutDiscord));

  await setLinkedState(session.user.id, { discord: true, roblox: false });
  const noRoblox = await userPost(session, "/api/gifts/claim-direct", { packageId: pkg.id, hwid: hwidA });
  report.directPackageFlow.blockedWithoutRoblox = noRoblox.json.error || noRoblox.json.reason;
  assertStep("direct blocked without Roblox", noRoblox.status === 403 && ["roblox_required", "roblox_not_connected"].includes(report.directPackageFlow.blockedWithoutRoblox));

  await setLinkedState(session.user.id, { discord: true, roblox: true });
  const claimed = await userPost(session, "/api/gifts/claim-direct", { packageId: pkg.id, hwid: hwidA });
  report.directPackageFlow.claimed = summarizeResponse(claimed);
  assertStep("direct claimed", claimed.status === 201 && claimed.json.license?.licenseKey);
  report.directPackageFlow.licenseKey = claimed.json.license.licenseKey;

  const secondClaim = await userPost(session, "/api/gifts/claim-direct", { packageId: pkg.id, hwid: hwidA });
  report.directPackageFlow.secondClaimBlocked = secondClaim.json.error || secondClaim.json.reason;
  assertStep("direct second claim blocked", secondClaim.status === 409 && report.directPackageFlow.secondClaimBlocked === "direct_package_already_claimed");

  const [products, adminLicenses, freshPackage, audit] = await Promise.all([
    userGet(session, "/api/me/products"),
    adminGet(`/admin/api/licenses?search=${encodeURIComponent(claimed.json.license.licenseKey)}`),
    prisma.directGiftPackage.findUnique({ where: { id: pkg.id }, include: { recipientUser: true, license: true } }),
    prisma.auditLog.findFirst({ where: { action: "direct_gift_package_claimed", targetId: pkg.id }, orderBy: { createdAt: "desc" } })
  ]);

  report.directPackageFlow.myProductsVisible = hasLicense(products.json, claimed.json.license.licenseKey);
  report.directPackageFlow.adminPanelVisible = hasAdminLicense(adminLicenses.json, claimed.json.license.licenseKey);
  report.directPackageFlow.status = freshPackage?.status;
  report.directPackageFlow.claimedEmail = freshPackage?.claimedEmail || null;
  report.directPackageFlow.claimedDiscord = freshPackage?.claimedDiscordId || null;
  report.directPackageFlow.claimedRoblox = freshPackage?.claimedRobloxId || null;
  report.directPackageFlow.claimedHwid = freshPackage?.claimedHwid || null;
  report.directPackageFlow.auditLogCreated = Boolean(audit);
  assertStep("direct visible in My Products", report.directPackageFlow.myProductsVisible);
  assertStep("direct visible in Admin Panel", report.directPackageFlow.adminPanelVisible);
  assertStep("direct status claimed", report.directPackageFlow.status === "claimed");
  assertStep("direct audit log", report.directPackageFlow.auditLogCreated);

  const valid = await validateLicense(claimed.json.license.licenseKey, hwidA);
  const mismatch = await validateLicense(claimed.json.license.licenseKey, hwidB);
  report.directPackageFlow.appValidation = { sameHwid: valid.json.reason, otherHwid: mismatch.json.reason };
  assertStep("direct validation works", valid.json.valid === true && mismatch.json.reason === "hwid_mismatch");
}

async function testLicenseValidationMatrix(session) {
  await setLinkedState(session.user.id, { discord: true, roblox: true });
  const now = new Date();
  const matrixRows = [
    ["Manual", "1day", null, null],
    ["Stripe/Website", "1day", `cs_test_e2e_${runId}_stripe`, "stripe_checkout"],
    ["1 day trial", "1day", null, "monthly_trial"],
    ["Referral reward", "2weeks", null, "referral_reward"],
    ["Gift Code", "1day", null, "gift_code matrix"],
    ["Direct Package", "1day", null, "direct_gift_package matrix"],
    ["Old Buyer", "1day", null, "old_buyer_trial"],
    ["Robux", "1day", null, "robux_manual_order"],
    ["Legacy Import", "1day", null, "legacy_import"]
  ];

  for (const [label, planId, stripeSessionId, notes] of matrixRows) {
    const license = await createMatrixLicense(session.user.email, planId, notes, stripeSessionId);
    await prisma.license.update({ where: { id: license.id }, data: { hwid: null } });

    const missingBoth = await withLinked(session.user.id, { discord: false, roblox: false }, () => validateLicense(` ${license.licenseKey} `, hwidA));
    const missingRoblox = await withLinked(session.user.id, { discord: true, roblox: false }, () => validateLicense(license.licenseKey, hwidA));
    const firstBind = await withLinked(session.user.id, { discord: true, roblox: true }, () => validateLicense(license.licenseKey, hwidA));
    const sameHwid = await validateLicense(license.licenseKey, hwidA);
    const otherHwid = await validateLicense(license.licenseKey, hwidB);
    const afterBind = await prisma.license.findUnique({ where: { id: license.id } });

    report.validationMatrix.push({
      type: label,
      source: firstBind.json.source,
      status: afterBind?.status,
      canUseApp: firstBind.json.canUseApp,
      reason: firstBind.json.reason,
      missingDiscordReason: missingBoth.json.reason || missingBoth.json.error,
      missingRobloxReason: missingRoblox.json.reason || missingRoblox.json.error,
      hwidBound: afterBind?.hwid === hwidA,
      sameHwid: sameHwid.json.reason,
      differentHwid: otherHwid.json.reason,
      trimNormalized: firstBind.json.licenseKey === license.licenseKey,
      expiresAt: firstBind.json.expiresAt,
      timeLeft: firstBind.json.timeLeft
    });

    assertStep(`${label} source`, Boolean(firstBind.json.source));
    assertStep(`${label} validates`, firstBind.json.valid === true);
    assertStep(`${label} HWID bind`, afterBind?.hwid === hwidA);
    assertStep(`${label} HWID mismatch`, otherHwid.json.reason === "hwid_mismatch");
  }

  const disabled = await createMatrixLicense(session.user.email, "1day", "disabled_matrix", null, { status: "disabled" });
  const expired = await createMatrixLicense(session.user.email, "1day", "expired_matrix", null, { expiresAt: new Date(now.getTime() - 60000) });
  const paymentFailed = await createMatrixLicense(session.user.email, "1day", "payment_failed_matrix", null, { status: "payment_failed" });
  report.supplementalValidation.disabled = (await validateLicense(disabled.licenseKey, hwidA)).json.reason;
  report.supplementalValidation.expired = (await validateLicense(expired.licenseKey, hwidA)).json.reason;
  report.supplementalValidation.paymentFailed = (await validateLicense(paymentFailed.licenseKey, hwidA)).json.reason;
}

async function createMatrixLicense(customerEmail, planId, notes, stripeSessionId = null, overrides = {}) {
  const plan = getPlan(planId);
  const licenseKey = await generateUniqueLicenseKey(prisma);
  return prisma.license.create({
    data: {
      licenseKey,
      customerEmail,
      plan: plan.id,
      status: overrides.status || "active",
      hwid: overrides.hwid || null,
      expiresAt: Object.prototype.hasOwnProperty.call(overrides, "expiresAt") ? overrides.expiresAt : getPlanExpiry(plan),
      lifetime: plan.lifetime,
      stripeSessionId,
      stripePaymentIntentId: stripeSessionId ? `pi_e2e_${runId}_${crypto.randomBytes(3).toString("hex")}` : null,
      notes
    }
  });
}

async function registerOrLogin() {
  const register = await publicPost("/api/auth/register", { email, password });
  if (register.status === 201) {
    assertStep("registered test user", register.json.user?.id);
    return { user: register.json.user, cookie: register.cookie };
  }
  if (register.status !== 409) {
    throw new Error(`Register failed ${register.status}: ${JSON.stringify(register.json)}`);
  }
  const login = await publicPost("/api/auth/login", { email, password });
  if (login.status !== 200) {
    throw new Error(`Login failed ${login.status}: ${JSON.stringify(login.json)}. Use a fresh E2E_USER_EMAIL or the matching E2E_USER_PASSWORD.`);
  }
  return { user: login.json.user, cookie: login.cookie };
}

async function setLinkedState(userId, { discord, roblox }) {
  const updates = {};
  if (discord) {
    updates.discordUserId = `e2e-discord-${runId}`;
    updates.discordUsername = `e2e_discord_${runId}`;
    updates.discordEmail = `discord-${runId}@gmail.com`;
    updates.discordAvatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
  } else {
    updates.discordUserId = null;
    updates.discordUsername = null;
    updates.discordEmail = null;
    updates.discordAvatarUrl = null;
  }
  if (roblox) {
    updates.robloxUserId = `900${runId.replace(/[^0-9]/g, "").slice(0, 8) || "104"}`;
    updates.robloxUsername = `FimaE2E${runId}`;
    updates.robloxAvatarUrl = "https://tr.rbxcdn.com/30DAY-AvatarHeadshot.png";
  } else {
    updates.robloxUserId = null;
    updates.robloxUsername = null;
    updates.robloxAvatarUrl = null;
  }

  await prisma.oAuthLink.deleteMany({ where: { userId, provider: { in: ["discord", "roblox"] } } });
  await prisma.user.update({ where: { id: userId }, data: updates });
  if (discord) {
    await prisma.oAuthLink.create({
      data: {
        userId,
        provider: "discord",
        providerSubject: updates.discordUserId,
        providerUsername: updates.discordUsername,
        providerEmail: updates.discordEmail,
        metadata: { e2e: true }
      }
    });
  }
  if (roblox) {
    await prisma.oAuthLink.create({
      data: {
        userId,
        provider: "roblox",
        providerSubject: updates.robloxUserId,
        providerUsername: updates.robloxUsername,
        metadata: { e2e: true, displayName: updates.robloxUsername }
      }
    });
  }
}

async function withLinked(userId, state, callback) {
  await setLinkedState(userId, state);
  return callback();
}

async function validateLicense(licenseKey, hwid) {
  return publicPost("/api/license/validate", { licenseKey, hwid, appVersion: "e2e-1.0.104" });
}

async function publicPost(path, body) {
  return api(path, { method: "POST", body });
}

async function userPost(session, path, body) {
  return api(path, { method: "POST", body, cookie: session.cookie });
}

async function userGet(session, path) {
  return api(path, { method: "GET", cookie: session.cookie });
}

async function adminPost(path, body) {
  return api(path, { method: "POST", body, admin: true });
}

async function adminGet(path) {
  return api(path, { method: "GET", admin: true });
}

async function api(path, { method = "GET", body = null, cookie = "", admin = false } = {}) {
  const headers = { accept: "application/json" };
  if (body) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (admin) headers["x-admin-api-key"] = adminApiKey;
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const raw = await response.text();
  let json = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = { raw };
  }
  const setCookie = response.headers.get("set-cookie") || "";
  const nextCookie = setCookie ? setCookie.split(";")[0] : cookie;
  return { status: response.status, json, cookie: nextCookie };
}

function hasLicense(payload, key) {
  const normalized = normalizeLicenseKey(key);
  return (payload.licenses || payload.products || []).some((item) =>
    normalizeLicenseKey(item.licenseKey || item.license?.licenseKey || "") === normalized
  ) || (payload.products || []).some((item) => normalizeLicenseKey(item.licenseKey || "") === normalized);
}

function hasAdminLicense(payload, key) {
  const normalized = normalizeLicenseKey(key);
  return (payload.licenses || []).some((license) => normalizeLicenseKey(license.licenseKey) === normalized);
}

function summarizeResponse(response) {
  return {
    status: response.status,
    success: response.json.success,
    error: response.json.error || null,
    licenseKey: response.json.license?.licenseKey || null,
    source: response.json.license?.source || null
  };
}

function assertStep(step, ok) {
  if (!ok) report.failures.push({ step, ok: false });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}
