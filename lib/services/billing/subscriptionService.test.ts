import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { getPlan } from "@/config/billing/plans";
import {
  addKstMonthsKeepingDay,
  nextChargeAtFromExpiresAtExclusive,
} from "@/domain/billing/teamMembership";
import {
  attachPaymentMethodForTeam,
  getSubscriptionStatusForTeamByProduct,
  getSubscriptionSummaryForTeamByProduct,
  getSubscriptionQuoteForTeam,
} from "./subscriptionService";
import { recoverPastDueSubscription } from "@/domain/billing/subscription/pastDueRecovery";

type FetchMock = typeof fetch;

const PORTONE_TEST_ENV = {
  PORTONE_API_SECRET: "secret-test",
  PORTONE_STORE_ID: "store-test",
  PORTONE_CHANNEL_KEY_INICIS: "channel-key-inicis",
};

function withEnv<T>(
  values: Record<string, string>,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  const restore = () => {
    for (const [key, value] of previous.entries()) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  };

  try {
    const out = fn();
    if (out && typeof (out as Promise<T>).finally === "function") {
      return (out as Promise<T>).finally(restore);
    }
    restore();
    return out;
  } catch (error) {
    restore();
    throw error;
  }
}

async function withMockFetch<T>(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<T>,
) {
  const originalFetch = global.fetch;
  global.fetch = handler as FetchMock;
  try {
    return await fn();
  } finally {
    global.fetch = originalFetch;
  }
}

async function createUserAndTeam(args?: {
  teamData?: Record<string, unknown>;
}) {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `billing-service-${suffix}`,
      label: `Billing Service ${suffix.slice(0, 8)}`,
      email: `billing-service-${suffix}@example.com`,
    },
  });

  const team = await prisma.team.create({
    data: {
      slug: `billing-service-${suffix}`,
      name: `Billing Service ${suffix.slice(0, 8)}`,
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
      ...args?.teamData,
    },
  });

  return { user, team };
}

async function createProductSubscription(args: {
  teamId: string;
  product: "PRESS" | "CAREER";
  planId: string;
  membershipStatus: "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  payProvider?: "INICIS" | "KAKAOPAY" | null;
  billingKey?: string | null;
  nextPaymentAmount?: number;
  planExpiresAt?: Date | null;
  nextBillingAt?: Date | null;
  pendingPlanId?: string | null;
  pendingPlanStartsAt?: Date | null;
  pendingPlan?: "BASIC" | "PRO" | "ENTERPRISE" | null;
}) {
  const plan = getPlan(args.planId);
  const created = await prisma.teamProductSubscription.create({
    data: {
      teamId: args.teamId,
      product: args.product,
      planId: args.planId,
      plan: plan.planType,
      membershipStatus: args.membershipStatus,
      payProvider: args.payProvider ?? null,
      billingKey: args.billingKey ?? null,
      nextPaymentAmount: args.nextPaymentAmount ?? 0,
      nextBillingAt: args.nextBillingAt ?? null,
      planExpiresAt: args.planExpiresAt ?? null,
      pendingPlan: args.pendingPlan ?? null,
      pendingPlanId: args.pendingPlanId ?? null,
      pendingPlanStartsAt: args.pendingPlanStartsAt ?? null,
      cancelRequestedAt: null,
      lastPaymentId: null,
      lastPaidAt: null,
    },
  });
  return created;
}

async function cleanupRecords(args: { teamId?: string; userId?: string }) {
  if (args.teamId) {
    await prisma.team.deleteMany({ where: { id: args.teamId } });
  }
  if (args.userId) {
    await prisma.user.deleteMany({ where: { id: args.userId } });
  }
}

test("product read wrappers select product rows independent of Team compatibility projection", async () => {
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "career_basic_v1",
      plan: "BASIC",
      planCategory: "CAREER",
      membershipStatus: "PAST_DUE",
      payProvider: "INICIS",
      nextPaymentAmount: 5800,
      planExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      nextBillingAt: new Date(),
      billingKey: "team-compat-billing-key",
    },
  });

  const pressSubscription = await createProductSubscription({
    teamId: team.id,
    product: "PRESS",
    planId: "pro_monthly_v1",
    membershipStatus: "ACTIVE",
    payProvider: "INICIS",
    billingKey: "press-billing-key",
    nextPaymentAmount: 9900,
    planExpiresAt: addKstMonthsKeepingDay(new Date(), 1),
    nextBillingAt: nextChargeAtFromExpiresAtExclusive(
      addKstMonthsKeepingDay(new Date(), 1),
    ),
  });

  const careerSubscription = await createProductSubscription({
    teamId: team.id,
    product: "CAREER",
    planId: "career_basic_v1",
    membershipStatus: "CANCELED",
    payProvider: "KAKAOPAY",
    billingKey: null,
    nextPaymentAmount: 3900,
    planExpiresAt: addKstMonthsKeepingDay(new Date(), 1),
    nextBillingAt: nextChargeAtFromExpiresAtExclusive(
      addKstMonthsKeepingDay(new Date(), 1),
    ),
  });

  try {
    const pressSummary = await getSubscriptionSummaryForTeamByProduct(
      team.id,
      "PRESS",
    );
    const careerSummary = await getSubscriptionSummaryForTeamByProduct(
      team.id,
      "CAREER",
    );

    assert.equal(pressSummary.team.id, team.id);
    assert.equal(careerSummary.team.id, team.id);
    assert.equal(pressSummary.team.teamId, team.id);
    assert.equal(careerSummary.team.teamId, team.id);
    assert.equal(
      pressSummary.team.subscriptionId,
      pressSubscription.id,
    );
    assert.equal(
      careerSummary.team.subscriptionId,
      careerSubscription.id,
    );
    assert.notEqual(
      pressSummary.team.subscriptionId,
      careerSummary.team.subscriptionId,
    );
    assert.equal(pressSummary.team.plan, "PRO");
    assert.equal(careerSummary.team.plan, "BASIC");
    assert.equal(pressSummary.team.membershipStatus, "ACTIVE");
    assert.equal(careerSummary.team.membershipStatus, "CANCELED");
    assert.equal(pressSummary.team.slug, team.slug);
    assert.equal(careerSummary.team.slug, team.slug);
    assert.equal(pressSummary.team.hasBillingKey, true);
    assert.equal(careerSummary.team.hasBillingKey, false);
    assert.equal(Object.hasOwn(pressSummary.team as any, "billingKey"), false);
    assert.equal(Object.hasOwn(careerSummary.team as any, "billingKey"), false);

    const pressStatus = await getSubscriptionStatusForTeamByProduct(
      team.id,
      "PRESS",
    );
    const careerStatus = await getSubscriptionStatusForTeamByProduct(
      team.id,
      "CAREER",
    );

    assert.equal(pressStatus.plan, "PRO");
    assert.equal(careerStatus.plan, "BASIC");
    assert.equal(pressStatus.membershipStatus, "ACTIVE");
    assert.equal(careerStatus.membershipStatus, "CANCELED");
    assert.equal(Object.hasOwn(pressStatus as any, "billingKey"), false);
    assert.equal(Object.hasOwn(careerStatus as any, "billingKey"), false);
    assert.equal(pressStatus.id, team.id);
    assert.equal(careerStatus.id, team.id);
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("getSubscriptionQuoteForTeam blocks checkout while CAREER is past due", async () => {
  const { user, team } = await createUserAndTeam();

  await createProductSubscription({
    teamId: team.id,
    product: "CAREER",
    planId: "career_pro_v1",
    membershipStatus: "PAST_DUE",
    payProvider: "INICIS",
    billingKey: "career-billing-key",
    nextPaymentAmount: 12900,
    planExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    nextBillingAt: nextChargeAtFromExpiresAtExclusive(
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    ),
  });

  try {
    await assert.rejects(
      getSubscriptionQuoteForTeam({
        teamId: team.id,
        userId: user.id,
        targetPlanId: "career_basic_v1",
      }),
      /PAST_DUE_RECOVERY_REQUIRED/,
    );
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("attachPaymentMethodForTeam recovers CAREER while PRESS row is untouched", async () => {
  const currentPlanExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const currentNextBillingAt =
    nextChargeAtFromExpiresAtExclusive(currentPlanExpiresAt);
  const expectedPlanExpiresAt = addKstMonthsKeepingDay(currentPlanExpiresAt, 1);
  const expectedNextBillingAt =
    nextChargeAtFromExpiresAtExclusive(expectedPlanExpiresAt);

  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "career_basic_v1",
      plan: "BASIC",
      planCategory: "CAREER",
      membershipStatus: "PAST_DUE",
      billingKey: "career-billing-key-old",
      nextPaymentAmount: 5900,
      planExpiresAt: currentPlanExpiresAt,
      nextBillingAt: currentNextBillingAt,
      pendingPlan: "BASIC",
      pendingPlanId: "career_basic_v1",
      pendingPlanStartsAt: currentPlanExpiresAt,
    },
  });

  await createProductSubscription({
    teamId: team.id,
    product: "PRESS",
    planId: "basic_monthly_v1",
    membershipStatus: "ACTIVE",
    payProvider: "KAKAOPAY",
    billingKey: "press-billing-key",
    nextPaymentAmount: 9900,
    planExpiresAt: addKstMonthsKeepingDay(
      new Date(),
      1,
    ),
    nextBillingAt: nextChargeAtFromExpiresAtExclusive(
      addKstMonthsKeepingDay(new Date(), 1),
    ),
  });

  await createProductSubscription({
    teamId: team.id,
    product: "CAREER",
    planId: "career_pro_v1",
    membershipStatus: "PAST_DUE",
    payProvider: "INICIS",
    billingKey: "career-billing-key-old",
    nextPaymentAmount: 5900,
    planExpiresAt: currentPlanExpiresAt,
    nextBillingAt: currentNextBillingAt,
    pendingPlan: "BASIC",
    pendingPlanId: "career_basic_v1",
    pendingPlanStartsAt: currentPlanExpiresAt,
  });

  try {
    await withEnv(PORTONE_TEST_ENV, async () => {
      const result = await withMockFetch(
        async () =>
          ({
            ok: true,
            json: async () => ({ id: "payment-recover-1", status: "PAID" }),
          }) as Response,
        () =>
          attachPaymentMethodForTeam({
            teamId: team.id,
            userId: user.id,
            product: "CAREER",
            provider: "inicis",
            billingKey: "career-billing-key-new",
            recoverPastDue: true,
          }),
      );

      assert.equal(result.recovered, true);
      assert.equal(result.team.planId, "career_basic_v1");
      assert.equal(result.team.planCategory, "CAREER");
      assert.equal(result.team.membershipStatus, "ACTIVE");
      assert.equal(result.team.pendingPlanId, null);
      assert.equal(result.team.payProvider, "INICIS");
      assert.equal(result.team.hasBillingKey, true);
      assert.equal(
        result.team.planExpiresAt,
        expectedPlanExpiresAt.toISOString(),
      );
      assert.equal(
        result.team.nextBillingAt,
        expectedNextBillingAt.toISOString(),
      );

      const careerSub = await prisma.teamProductSubscription.findUnique({
        where: { teamId_product: { teamId: team.id, product: "CAREER" } },
      });
      const pressSub = await prisma.teamProductSubscription.findUnique({
        where: { teamId_product: { teamId: team.id, product: "PRESS" } },
      });
      assert.equal(careerSub?.planId, "career_basic_v1");
      assert.equal(careerSub?.membershipStatus, "ACTIVE");
      assert.equal(pressSub?.billingKey, "press-billing-key");

      const history = await prisma.teamBillingHistory.findFirstOrThrow({
        where: {
          teamId: team.id,
          status: "SUCCESS",
          planId: "career_basic_v1",
        },
        orderBy: { createdAt: "desc" },
      });

      assert.equal(history.amount, 5900);
      assert.equal(history.provider, "INICIS");
      assert.equal(
        (history.meta as any)?.product,
        "CAREER",
      );
      assert.equal(
        (history.meta as any)?.subscriptionId?.length > 0,
        true,
      );
    });
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("recoverPastDueSubscription charges the scheduled next payment amount for the target product", async () => {
  const currentPlanExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "career_basic_v1",
      plan: "BASIC",
      planCategory: "CAREER",
    },
  });

  const pressSub = await createProductSubscription({
    teamId: team.id,
    product: "PRESS",
    planId: "basic_monthly_v1",
    membershipStatus: "ACTIVE",
    payProvider: "KAKAOPAY",
    billingKey: "press-billing-key",
    nextPaymentAmount: 9900,
    planExpiresAt: addKstMonthsKeepingDay(new Date(), 1),
    nextBillingAt: nextChargeAtFromExpiresAtExclusive(addKstMonthsKeepingDay(new Date(), 1)),
  });

  const careerSub = await createProductSubscription({
    teamId: team.id,
    product: "CAREER",
    planId: "career_basic_v1",
    membershipStatus: "PAST_DUE",
    payProvider: "INICIS",
    billingKey: "career-billing-key-old",
    planExpiresAt: currentPlanExpiresAt,
    nextBillingAt: nextChargeAtFromExpiresAtExclusive(currentPlanExpiresAt),
    nextPaymentAmount: 1000,
  });

  let chargedAmount: number | null = null;
  let customData: { product?: string; subscriptionId?: string } = {};

  try {
    await withEnv(PORTONE_TEST_ENV, async () => {
      const result = await withMockFetch(
        async (_input, init) => {
          const body = JSON.parse(String(init?.body ?? "{}"));
          chargedAmount = body.amount?.total ?? null;
          customData = JSON.parse(body.customData ?? "{}");
          return {
            ok: true,
            json: async () => ({ id: "payment-recover-scheduled", status: "PAID" }),
          } as Response;
        },
        () =>
          recoverPastDueSubscription({
            teamId: team.id,
            userId: user.id,
            product: "CAREER",
            payProvider: "inicis",
            billingKey: "career-billing-key-new",
            customer: { fullName: "Tester" },
          }),
      );

      assert.equal(result.action, "PAST_DUE_RECOVERED");
      assert.equal(result.payNowAmountWon, 1000);
      assert.equal(chargedAmount, 1000);
      assert.equal(customData.product, "CAREER");
      assert.equal(customData.subscriptionId, careerSub.id);

      const reloadedCareer = await prisma.teamProductSubscription.findUnique({
        where: { teamId_product: { teamId: team.id, product: "CAREER" } },
      });
      const reloadedPress = await prisma.teamProductSubscription.findUnique({
        where: { teamId_product: { teamId: team.id, product: "PRESS" } },
      });
      assert.equal(reloadedCareer?.planId, "career_basic_v1");
      assert.equal(reloadedCareer?.membershipStatus, "ACTIVE");
      assert.equal(reloadedPress?.billingKey, "press-billing-key");
    });
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("recoverPastDueSubscription blocks concurrent duplicate recovery charge", async () => {
  const currentPlanExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "career_basic_v1",
      plan: "BASIC",
      planCategory: "CAREER",
    },
  });

  await createProductSubscription({
    teamId: team.id,
    product: "CAREER",
    planId: "career_basic_v1",
    membershipStatus: "PAST_DUE",
    payProvider: "INICIS",
    billingKey: "career-billing-key-old",
    planExpiresAt: currentPlanExpiresAt,
    nextBillingAt: nextChargeAtFromExpiresAtExclusive(currentPlanExpiresAt),
    nextPaymentAmount: 5900,
  });

  let portoneCalls = 0;
  let releasePayment!: () => void;
  let paymentStarted!: () => void;
  const paymentStartedPromise = new Promise<void>((resolve) => {
    paymentStarted = resolve;
  });
  const releasePaymentPromise = new Promise<void>((resolve) => {
    releasePayment = resolve;
  });

  try {
    await withEnv(PORTONE_TEST_ENV, async () => {
      await withMockFetch(
        async () => {
          portoneCalls += 1;
          paymentStarted();
          await releasePaymentPromise;
          return {
            ok: true,
            json: async () => ({ id: "payment-recover-concurrent", status: "PAID" }),
          } as Response;
        },
        async () => {
          const first = recoverPastDueSubscription({
            teamId: team.id,
            userId: user.id,
            product: "CAREER",
            payProvider: "inicis",
            billingKey: "career-billing-key-new",
            customer: { fullName: "Tester" },
          });

          await paymentStartedPromise;

          await assert.rejects(
            recoverPastDueSubscription({
              teamId: team.id,
              userId: user.id,
              product: "CAREER",
              payProvider: "inicis",
              billingKey: "career-billing-key-new",
              customer: { fullName: "Tester" },
            }),
            /PAST_DUE_RECOVERY_IN_PROGRESS/,
          );

          releasePayment();
          const completed = await first;
          assert.equal(completed.action, "PAST_DUE_RECOVERED");
        },
      );
    });

    assert.equal(portoneCalls, 1);

    const reloadedSub = await prisma.teamProductSubscription.findUnique({
      where: { teamId_product: { teamId: team.id, product: "CAREER" } },
    });
    assert.equal(reloadedSub?.membershipStatus, "ACTIVE");
    assert.equal(reloadedSub?.billingKey, "career-billing-key-new");

    const historyCount = await prisma.teamBillingHistory.count({
      where: {
        teamId: team.id,
        status: "SUCCESS",
        amount: 5900,
        planId: "career_basic_v1",
      },
    });
    assert.equal(historyCount, 1);
  } finally {
    releasePayment?.();
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("attachPaymentMethodForTeam preserves the new billing method when past-due recovery payment fails", async () => {
  const currentPlanExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "career_basic_v1",
      plan: "BASIC",
      planCategory: "CAREER",
    },
  });

  await createProductSubscription({
    teamId: team.id,
    product: "CAREER",
    planId: "career_basic_v1",
    membershipStatus: "PAST_DUE",
    payProvider: "INICIS",
    billingKey: "career-billing-key-old",
    planExpiresAt: currentPlanExpiresAt,
    nextBillingAt: nextChargeAtFromExpiresAtExclusive(currentPlanExpiresAt),
    nextPaymentAmount: 5900,
  });

  try {
    await withEnv(PORTONE_TEST_ENV, async () => {
      await assert.rejects(
        withMockFetch(
          async () =>
            ({
              ok: false,
              json: async () => ({ message: "CARD_DECLINED" }),
            }) as Response,
          () =>
            attachPaymentMethodForTeam({
              teamId: team.id,
              userId: user.id,
              product: "CAREER",
              provider: "inicis",
              billingKey: "career-billing-key-new",
              recoverPastDue: true,
            }),
        ),
        /결제수단은 변경되었지만 복구 결제에 실패했습니다./,
      );
    });

    const reloadedSub = await prisma.teamProductSubscription.findUnique({
      where: { teamId_product: { teamId: team.id, product: "CAREER" } },
    });
    assert.equal(reloadedSub?.membershipStatus, "PAST_DUE");
    assert.equal(reloadedSub?.billingKey, "career-billing-key-new");
    assert.equal(reloadedSub?.payProvider, "INICIS");
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("recoverPastDueSubscription leaves a requested attempt when local DB update fails", async () => {
  const currentPlanExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "career_basic_v1",
      plan: "BASIC",
      planCategory: "CAREER",
    },
  });

  const careerSub = await createProductSubscription({
    teamId: team.id,
    product: "CAREER",
    planId: "career_basic_v1",
    membershipStatus: "PAST_DUE",
    payProvider: "INICIS",
    billingKey: "career-billing-key-old",
    planExpiresAt: currentPlanExpiresAt,
    nextBillingAt: nextChargeAtFromExpiresAtExclusive(currentPlanExpiresAt),
    nextPaymentAmount: 1200,
  });

  try {
    await withEnv(PORTONE_TEST_ENV, async () => {
      await assert.rejects(
        withMockFetch(
          async () => {
            await prisma.teamProductSubscription.delete({
              where: { id: careerSub.id },
            });
            return {
              ok: true,
              json: async () => ({ id: "payment-for-db-failure", status: "PAID" }),
            } as Response;
          },
          () =>
            recoverPastDueSubscription({
              teamId: team.id,
              userId: user.id,
              product: "CAREER",
              payProvider: "inicis",
              billingKey: "career-billing-key-new",
              customer: { fullName: "Tester" },
            }),
        ),
        /not found|P2025|PAST_DUE_RECOVERY_PAYMENT_FAILED|TEAM_PRODUCT_SUBSCRIPTION_NOT_FOUND/,
      );
    });

    const history = await prisma.teamBillingHistory.findFirstOrThrow({
      where: {
        teamId: team.id,
        status: "REQUESTED",
        planId: "career_basic_v1",
      },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(history.status, "REQUESTED");
    assert.equal(history.provider, "INICIS");
    assert.match(history.externalId ?? "", /^br_[a-f0-9]{32}$/);
    assert.equal(
      (history.meta as any)?.kind,
      "SUBSCRIPTION_PAST_DUE_RECOVERY_ATTEMPT",
    );
    assert.equal((history.meta as any)?.paymentId, history.externalId);
    assert.equal((history.meta as any)?.product, "CAREER");
    assert.equal((history.meta as any)?.subscriptionId, careerSub.id);
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("recoverPastDueSubscription rejects missing product", async () => {
  const { user, team } = await createUserAndTeam();

  await createProductSubscription({
    teamId: team.id,
    product: "CAREER",
    planId: "career_basic_v1",
    membershipStatus: "PAST_DUE",
    payProvider: "INICIS",
    billingKey: "career-billing-key",
    planExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    nextPaymentAmount: 1200,
  });

  try {
    await assert.rejects(
      recoverPastDueSubscription({
        teamId: team.id,
        userId: user.id,
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        product: undefined as unknown as "PRESS",
        payProvider: "inicis",
        billingKey: "career-billing-key-new",
      } as any),
      /PRODUCT_REQUIRED/,
    );
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});
