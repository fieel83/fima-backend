import "dotenv/config";
import { prisma } from "../src/db.js";

const CAMPAIGN = "beta_7_day_promo";
const RESET_REASON = "Beta trial/HWID/download issue compensation";
const confirm = process.argv.includes("--confirm");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number.parseInt(limitArg.split("=")[1], 10) || 100) : 100;

const where = {
  OR: [
    { trialUsedAt: { not: null } },
    { trialExpiresAt: { not: null } },
    { nextTrialAvailableAt: { not: null } },
    { trialStatus: { not: null } },
    { monthlyTrialClaimCount: { gt: 0 } }
  ]
};

const users = await prisma.user.findMany({
  where,
  take: limit,
  orderBy: { createdAt: "asc" },
  select: {
    id: true,
    email: true,
    trialUsedAt: true,
    trialExpiresAt: true,
    nextTrialAvailableAt: true,
    trialStatus: true,
    monthlyTrialClaimCount: true
  }
});

const summary = {
  campaign: CAMPAIGN,
  resetReason: RESET_REASON,
  dryRun: !confirm,
  candidates: users.length,
  updated: 0,
  paidLicensesTouched: 0,
  giftLicensesTouched: 0,
  userIds: users.map((user) => user.id)
};

if (!confirm) {
  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

for (const user of users) {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        trialUsedAt: null,
        trialExpiresAt: null,
        nextTrialAvailableAt: null,
        trialStatus: "reset_for_promo"
      }
    }),
    prisma.auditLog.create({
      data: {
        action: "trial_promo_eligibility_reset",
        targetType: "user",
        targetId: user.id,
        metadata: {
          campaign: CAMPAIGN,
          resetAt: new Date().toISOString(),
          resetReason: RESET_REASON,
          previousTrialUsedAt: user.trialUsedAt?.toISOString?.() || null,
          previousTrialExpiresAt: user.trialExpiresAt?.toISOString?.() || null,
          previousNextTrialAvailableAt: user.nextTrialAvailableAt?.toISOString?.() || null,
          previousTrialStatus: user.trialStatus || null,
          previousMonthlyTrialClaimCount: user.monthlyTrialClaimCount || 0
        }
      }
    })
  ]);
  summary.updated += 1;
}

console.log(JSON.stringify(summary, null, 2));
await prisma.$disconnect();
