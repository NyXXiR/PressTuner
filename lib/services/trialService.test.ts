import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { claimProTrialForTeam } from "@/lib/services/trialService";

async function createUserAndTeam(args?: {
  teamData?: Record<string, unknown>;
}) {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `trial-test-${suffix}`,
      label: `Trial Test ${suffix.slice(0, 8)}`,
      email: `trial-test-${suffix}@example.com`,
    },
  });

  const team = await prisma.team.create({
    data: {
      slug: `trial-test-${suffix}`,
      name: `Trial Test ${suffix.slice(0, 8)}`,
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
      ...args?.teamData,
    },
  });

  return { user, team };
}

async function cleanupRecords(args: { teamId: string; userId: string }) {
  await prisma.couponRedemption.deleteMany({
    where: {
      OR: [{ teamId: args.teamId }, { userId: args.userId }],
    },
  });
  await prisma.teamBillingHistory.deleteMany({
    where: { OR: [{ teamId: args.teamId }, { userId: args.userId }] },
  });
  await prisma.team.deleteMany({ where: { id: args.teamId } });
  await prisma.user.deleteMany({ where: { id: args.userId } });
}

test("claimProTrialForTeam grants a non-renewing Press Pro trial once", async () => {
  const { user, team } = await createUserAndTeam();

  try {
    const result = await claimProTrialForTeam({
      teamId: team.id,
      userId: user.id,
      surface: "PRESS",
    });

    assert.equal(result.trial.planId, "pro_monthly_v1");
    assert.equal(result.team.planId, "pro_monthly_v1");
    assert.equal(result.team.nextBillingAt, null);

    const reloaded = await prisma.team.findUniqueOrThrow({
      where: { id: team.id },
    });
    assert.equal(reloaded.planId, "pro_monthly_v1");
    assert.equal(reloaded.membershipStatus, "ACTIVE");
    assert.equal(reloaded.billingKey, null);
    assert.equal(reloaded.payProvider, null);
    assert.equal(reloaded.nextBillingAt, null);
    assert.equal(reloaded.nextPaymentAmount, 0);
    assert.ok(reloaded.planExpiresAt);

    const redemption = await prisma.couponRedemption.findFirstOrThrow({
      where: { teamId: team.id, userId: user.id },
      orderBy: { appliedAt: "desc" },
    });
    assert.equal(redemption.status, "REDEEMED");

    await assert.rejects(
      claimProTrialForTeam({
        teamId: team.id,
        userId: user.id,
        surface: "PRESS",
      }),
      (error: any) => error?.code === "TRIAL_ALREADY_CLAIMED",
    );

    await prisma.team.update({
      where: { id: team.id },
      data: {
        planId: "free_v1",
        plan: "FREE",
        planCategory: "STANDARD",
        planExpiresAt: null,
        membershipStatus: "ACTIVE",
      },
    });
    await prisma.couponRedemption.update({
      where: { id: redemption.id },
      data: { status: "CANCELED", canceledAt: new Date() },
    });

    await assert.rejects(
      claimProTrialForTeam({
        teamId: team.id,
        userId: user.id,
        surface: "PRESS",
      }),
      (error: any) => error?.code === "TRIAL_ALREADY_CLAIMED",
    );
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("claimProTrialForTeam blocks active paid teams", async () => {
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "career_basic_v1",
      plan: "BASIC",
      planCategory: "CAREER",
      membershipStatus: "ACTIVE",
      planExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  try {
    await assert.rejects(
      claimProTrialForTeam({
        teamId: team.id,
        userId: user.id,
        surface: "RESUME",
      }),
      /이미 활성화된 유료 플랜/,
    );
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});
