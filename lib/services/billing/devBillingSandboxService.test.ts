import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { isDevBillingSandboxEnabled } from "@/lib/devBillingSandbox";
import { prisma } from "@/lib/prisma";
import { applyDevBillingSandboxAction } from "./devBillingSandboxService";

type FetchMock = typeof fetch;

async function withBlockedFetch<T>(fn: () => Promise<T>) {
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    throw new Error("REAL_PORTONE_FETCH_USED");
  }) as FetchMock;
  try {
    return await fn();
  } finally {
    global.fetch = originalFetch;
  }
}

async function createUserAndTeam() {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `dev-billing-sandbox-${suffix}`,
      label: `Dev Billing Sandbox ${suffix.slice(0, 8)}`,
      email: `dev-billing-sandbox-${suffix}@example.com`,
    },
  });

  const team = await prisma.team.create({
    data: {
      slug: `dev-billing-sandbox-${suffix}`,
      name: `Dev Billing Sandbox ${suffix.slice(0, 8)}`,
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });

  return { user, team };
}

async function cleanupRecords(args: { teamId?: string; userId?: string }) {
  if (args.teamId) {
    await prisma.team.deleteMany({ where: { id: args.teamId } });
  }
  if (args.userId) {
    await prisma.user.deleteMany({ where: { id: args.userId } });
  }
}

test("dev billing sandbox is closed in production unless explicitly enabled", () => {
  assert.equal(isDevBillingSandboxEnabled({ NODE_ENV: "production" }), false);
  assert.equal(
    isDevBillingSandboxEnabled({
      NODE_ENV: "production",
      ENABLE_DEV_BILLING_SANDBOX: "true",
    }),
    true,
  );
  assert.equal(isDevBillingSandboxEnabled({ NODE_ENV: "development" }), true);
});

test("mock-subscribe uses the real checkout completion domain with a mock gateway", async () => {
  const { user, team } = await createUserAndTeam();

  try {
    const result = await withBlockedFetch(() =>
      applyDevBillingSandboxAction({
        teamId: team.id,
        userId: user.id,
        action: "mock-subscribe",
        planId: "career_basic_v1",
        amountWon: 1000,
        payProvider: "INICIS",
      }),
    );

    assert.equal(result.team.membershipStatus, "ACTIVE");
    assert.equal(result.team.planId, "career_basic_v1");
    assert.equal(result.team.hasBillingKey, true);

    const reloaded = await prisma.team.findUniqueOrThrow({
      where: { id: team.id },
    });
    assert.equal(reloaded.nextPaymentAmount, 5900);
    assert.equal(reloaded.payProvider, "INICIS");
    assert.match(reloaded.lastPaymentId ?? "", /^bs_/);

    const orderCount = await prisma.billingOrder.count({
      where: { teamId: team.id },
    });
    assert.equal(orderCount, 0);

    const history = await prisma.teamBillingHistory.findFirstOrThrow({
      where: { teamId: team.id, status: "SUCCESS", amount: 5900 },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(history.planId, "career_basic_v1");
    assert.equal((history.meta as any)?.kind, "SUBSCRIPTION_PAYMENT");
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("mock-past-due and mock-recover-past-due use the real recovery domain with a mock gateway", async () => {
  const { user, team } = await createUserAndTeam();

  try {
    await applyDevBillingSandboxAction({
      teamId: team.id,
      userId: user.id,
      action: "mock-past-due",
      planId: "pro_monthly_v1",
      amountWon: 2000,
      payProvider: "KAKAOPAY",
    });

    const pastDue = await prisma.team.findUniqueOrThrow({
      where: { id: team.id },
    });
    assert.equal(pastDue.membershipStatus, "PAST_DUE");
    assert.equal(pastDue.nextPaymentAmount, 2000);

    const recovered = await withBlockedFetch(() =>
      applyDevBillingSandboxAction({
        teamId: team.id,
        userId: user.id,
        action: "mock-recover-past-due",
        payProvider: "KAKAOPAY",
      }),
    );

    assert.equal(recovered.team.membershipStatus, "ACTIVE");
    assert.equal(recovered.team.planId, "pro_monthly_v1");

    const successCount = await prisma.teamBillingHistory.count({
      where: {
        teamId: team.id,
        status: "SUCCESS",
        externalId: { startsWith: "br_" },
        amount: 2000,
      },
    });
    assert.equal(successCount, 1);

    const history = await prisma.teamBillingHistory.findFirstOrThrow({
      where: {
        teamId: team.id,
        status: "SUCCESS",
        externalId: { startsWith: "br_" },
      },
      orderBy: { createdAt: "desc" },
    });
    assert.equal((history.meta as any)?.kind, "SUBSCRIPTION_PAST_DUE_RECOVERY");
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});
