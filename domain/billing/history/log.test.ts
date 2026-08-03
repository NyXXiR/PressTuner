import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { getPlan } from "@/config/billing/plans";
import { logTeamBillingHistory } from "@/domain/billing/history/log";
import { listTeamBillingHistory } from "@/domain/billing/history/query";
import { prisma } from "@/lib/prisma";

test("billing history stores first-class product, subscription, and before/after state", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `billing-history-${suffix}`,
      label: `Billing History ${suffix.slice(0, 8)}`,
      email: `billing-history-${suffix}@example.com`,
    },
  });
  const team = await prisma.team.create({
    data: {
      slug: `billing-history-${suffix}`,
      name: `Billing History ${suffix.slice(0, 8)}`,
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });
  const plan = getPlan("basic_monthly_v1");
  const subscription = await prisma.teamProductSubscription.create({
    data: {
      teamId: team.id,
      product: "PRESS",
      planId: "basic_monthly_v1",
      plan: plan.planType,
      membershipStatus: "ACTIVE",
      nextPaymentAmount: 0,
    },
  });

  try {
    const history = await logTeamBillingHistory({
      teamId: team.id,
      userId: user.id,
      type: "PAYMENT",
      status: "SUCCESS",
      product: "PRESS",
      beforePlanId: "free_v1",
      afterPlanId: "basic_monthly_v1",
      beforeStatus: "EXPIRED",
      afterStatus: "ACTIVE",
      externalId: `history-${suffix}`,
      meta: { product: "PRESS" },
    });

    assert.equal(history?.product, "PRESS");
    assert.equal(history?.subscriptionId, subscription.id);
    assert.equal(history?.beforePlanId, "free_v1");
    assert.equal(history?.afterPlanId, "basic_monthly_v1");
    assert.equal(history?.beforeStatus, "EXPIRED");
    assert.equal(history?.afterStatus, "ACTIVE");

    const careerPlan = getPlan("career_basic_v1");
    await prisma.teamProductSubscription.create({
      data: {
        teamId: team.id,
        product: "CAREER",
        planId: "career_basic_v1",
        plan: careerPlan.planType,
        membershipStatus: "ACTIVE",
        nextPaymentAmount: 0,
      },
    });
    await logTeamBillingHistory({
      teamId: team.id,
      type: "PAYMENT",
      product: "CAREER",
      planId: "career_basic_v1",
      externalId: `career-history-${suffix}`,
    });

    const pressOnly = await listTeamBillingHistory({
      teamId: team.id,
      product: "PRESS",
      from: new Date(0),
      toExclusive: new Date(Date.now() + 60_000),
    });
    assert.equal(pressOnly.length, 1);
    assert.equal(pressOnly[0]?.product, "PRESS");
    assert.equal(pressOnly[0]?.subscriptionId, subscription.id);
    assert.equal(pressOnly[0]?.beforePlanId, "free_v1");
    assert.equal(pressOnly[0]?.afterPlanId, "basic_monthly_v1");
  } finally {
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
