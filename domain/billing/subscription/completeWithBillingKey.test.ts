import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { completeWithBillingKey } from "./completeWithBillingKey";
import { recoverConfirmedSubscriptionChange } from "./subscriptionChangeRecovery";
import { completeOrRecoverSubscriptionChange } from "./completeOrRecoverSubscriptionChange";
import { createSubscriptionPaymentId } from "./paymentConfirmation";
import { createProductSubscriptionPaymentMethodRef } from "./paymentMethodReference";
import { lockSubscriptionChangeApply } from "./subscriptionChangeApplyLock";
import { getSubscriptionQuoteForTeam } from "@/lib/services/billing/subscriptionService";
import {
  addKstMonthsKeepingDay,
  dateFromKst,
  getKstYmd,
  nextChargeAtFromExpiresAtExclusive,
} from "@/domain/billing/teamMembership";

type FetchMock = typeof fetch;

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
      loginId: `billing-test-${suffix}`,
      label: `Billing Test ${suffix.slice(0, 8)}`,
      email: `billing-test-${suffix}@example.com`,
    },
  });

  const team = await prisma.team.create({
    data: {
      slug: `billing-test-${suffix}`,
      name: `Billing Test ${suffix.slice(0, 8)}`,
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
      ...args?.teamData,
    },
  });

  return { user, team };
}

async function cleanupRecords(args: {
  teamId?: string;
  userId?: string;
  couponIds?: string[];
}) {
  if (args.teamId) {
    await prisma.team.deleteMany({ where: { id: args.teamId } });
  }
  if (args.userId) {
    await prisma.user.deleteMany({ where: { id: args.userId } });
  }
  if (args.couponIds?.length) {
    await prisma.coupon.deleteMany({ where: { id: { in: args.couponIds } } });
  }
}

const PORTONE_TEST_ENV = {
  PORTONE_API_SECRET: "secret-test",
  PORTONE_STORE_ID: "store-test",
  PORTONE_CHANNEL_KEY_INICIS: "channel-key-inicis",
};

function futureKstMidnight(daysAhead: number) {
  const now = new Date();
  const { y, m, d } = getKstYmd(now);
  return dateFromKst(y, m, d + daysAhead, 0, 0, 0);
}

test("completeWithBillingKey activates a new paid subscription and logs a successful payment", async () => {
  const { user, team } = await createUserAndTeam();

  try {
    await withEnv(PORTONE_TEST_ENV, async () => {
      const result = await withMockFetch(
        async () =>
          ({
            ok: true,
            json: async () => ({ id: "payment-1", status: "PAID" }),
          }) as Response,
        () =>
          completeWithBillingKey({
            teamId: team.id,
            userId: user.id,
            planId: "career_basic_v1",
            payProvider: "inicis",
            billingKey: "billing-key-1",
            customer: { fullName: "Tester", email: "tester@example.com" },
            attemptId: randomUUID(),
          }),
      );

      assert.equal(result.action, "SUBSCRIBED");
      assert.equal(result.payNowAmountWon, 5900);
      assert.equal(result.team.planId, "career_basic_v1");
      assert.equal(result.team.planCategory, "CAREER");
      assert.equal(result.team.membershipStatus, "ACTIVE");
      assert.equal(result.team.limitResumeMonthly, 150);
      assert.equal(result.team.usageResumeMonthly, 0);
      const legacyTeamProjection = await prisma.team.findUniqueOrThrow({
        where: { id: team.id },
        select: { billingKey: true },
      });
      assert.equal(legacyTeamProjection.billingKey, null);
      const authoritativeSubscription =
        await prisma.teamProductSubscription.findUniqueOrThrow({
          where: {
            teamId_product: { teamId: team.id, product: "CAREER" },
          },
        });
      assert.equal(authoritativeSubscription.billingKey, "billing-key-1");
      assert.equal(result.team.hasBillingKey, true);
      assert.ok(result.team.planExpiresAt);
      assert.ok(result.team.nextBillingAt);

      const reloadedTeam = await prisma.team.findUniqueOrThrow({
        where: { id: team.id },
      });
      assert.equal(reloadedTeam.nextPaymentAmount, 5900);

      const history = await prisma.teamBillingHistory.findFirstOrThrow({
        where: { teamId: team.id, status: "SUCCESS" },
        orderBy: { createdAt: "desc" },
      });

      assert.equal(history.planId, "career_basic_v1");
      assert.equal(history.amount, 5900);
      assert.equal(history.provider, "INICIS");
    });
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("completeWithBillingKey ignores repeated completion for the same paid attempt", async () => {
  const { user, team } = await createUserAndTeam();
  const attemptId = randomUUID();
  let portoneCalls = 0;

  try {
    await withEnv(PORTONE_TEST_ENV, async () => {
      await withMockFetch(
        async () => {
          portoneCalls += 1;
          return {
            ok: true,
            json: async () => ({ id: "payment-repeat", status: "PAID" }),
          } as Response;
        },
        async () => {
          const first = await completeWithBillingKey({
            teamId: team.id,
            userId: user.id,
            planId: "career_basic_v1",
            payProvider: "inicis",
            billingKey: "billing-key-repeat",
            customer: { fullName: "Tester" },
            attemptId,
          });

          const second = await completeWithBillingKey({
            teamId: team.id,
            userId: user.id,
            planId: "career_basic_v1",
            payProvider: "inicis",
            billingKey: "billing-key-repeat",
            customer: { fullName: "Tester" },
            attemptId,
          });

          assert.equal(first.action, "SUBSCRIBED");
          assert.equal(second.action, "NO_CHANGE");
          assert.equal(second.note, "IDEMPOTENT_PAYMENT_ALREADY_COMPLETED");
          assert.equal(second.team.planExpiresAt, first.team.planExpiresAt);
        },
      );

      assert.equal(portoneCalls, 1);
      const historyCount = await prisma.teamBillingHistory.count({
        where: { teamId: team.id, status: "SUCCESS", amount: 5900 },
      });
      assert.equal(historyCount, 1);
    });
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("completeOrRecoverSubscriptionChange resumes a durable pending payment with the same provider identity", async () => {
  const { user, team } = await createUserAndTeam();
  const attemptId = randomUUID();
  const billingKey = "billing-key-pending-replay";
  const paymentId = createSubscriptionPaymentId("CAREER_BASIC", attemptId);
  let portoneCalls = 0;

  try {
    const subscription = await prisma.teamProductSubscription.create({
      data: {
        teamId: team.id,
        product: "CAREER",
        planId: "free_v1",
        plan: "FREE",
        membershipStatus: "ACTIVE",
        payProvider: "INICIS",
        billingKey,
      },
    });
    await prisma.subscriptionChange.create({
      data: {
        teamId: team.id,
        product: "CAREER",
        subscriptionId: subscription.id,
        changeType: "SUBSCRIBE",
        targetPlanId: "career_basic_v1",
        idempotencyKey: `subscription-change:${team.id}:CAREER:${attemptId}`,
        externalPaymentId: paymentId,
        requesterUserId: user.id,
        payProvider: "INICIS",
        paymentMethodRef: createProductSubscriptionPaymentMethodRef({
          subscriptionId: subscription.id,
          billingKey,
        }),
        paymentStatus: "PENDING",
        applyStatus: "PENDING",
        priceSnapshot: {
          version: 1,
          finalAmount: 5_900,
          currency: "KRW",
          targetPlanId: "career_basic_v1",
          couponCode: null,
          calculatedAt: new Date().toISOString(),
        },
        createdAt: new Date(Date.now() - 6 * 60_000),
      },
    });

    const result = await withEnv(PORTONE_TEST_ENV, () =>
      withMockFetch(
        async () => {
          portoneCalls += 1;
          return {
            ok: true,
            json: async () => ({ id: paymentId, status: "PAID" }),
          } as Response;
        },
        () =>
          completeOrRecoverSubscriptionChange({
            teamId: team.id,
            userId: user.id,
            planId: "career_basic_v1",
            payProvider: "inicis",
            billingKey,
            attemptId,
          }),
      ),
    );

    assert.equal(result.action, "SUBSCRIBED");
    assert.equal(portoneCalls, 1);
    const change = await prisma.subscriptionChange.findUniqueOrThrow({
      where: { externalPaymentId: paymentId },
    });
    assert.equal(change.paymentStatus, "CONFIRMED");
    assert.equal(change.applyStatus, "APPLIED");
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("completeWithBillingKey blocks a concurrent duplicate paid attempt before mutating subscription state", async () => {
  const { user, team } = await createUserAndTeam();
  const attemptId = randomUUID();
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
            json: async () => ({ id: "payment-concurrent", status: "PAID" }),
          } as Response;
        },
        async () => {
          const first = completeWithBillingKey({
            teamId: team.id,
            userId: user.id,
            planId: "career_basic_v1",
            payProvider: "inicis",
            billingKey: "billing-key-concurrent",
            customer: { fullName: "Tester" },
            attemptId,
          });

          await paymentStartedPromise;

          await assert.rejects(
            completeWithBillingKey({
              teamId: team.id,
              userId: user.id,
              planId: "career_basic_v1",
              payProvider: "inicis",
              billingKey: "billing-key-concurrent",
              customer: { fullName: "Tester" },
              attemptId,
            }),
            /PAYMENT_ATTEMPT_IN_PROGRESS/,
          );

          releasePayment();
          const completed = await first;
          assert.equal(completed.action, "SUBSCRIBED");
        },
      );

      assert.equal(portoneCalls, 1);
      const historyCount = await prisma.teamBillingHistory.count({
        where: { teamId: team.id, status: "SUCCESS", amount: 5900 },
      });
      assert.equal(historyCount, 1);
    });
  } finally {
    releasePayment?.();
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("initial paid checkout and recovery share one exact-once apply gate", async () => {
  const { user, team } = await createUserAndTeam();
  const attemptId = randomUUID();
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
          paymentStarted();
          await releasePaymentPromise;
          return {
            ok: true,
            json: async () => ({ id: "payment-shared-lock", status: "PAID" }),
          } as Response;
        },
        async () => {
          const initial = completeWithBillingKey({
            teamId: team.id,
            userId: user.id,
            planId: "career_basic_v1",
            payProvider: "inicis",
            billingKey: "billing-key-shared-lock",
            customer: { fullName: "Tester" },
            attemptId,
          });
          await paymentStartedPromise;
          const change = await prisma.subscriptionChange.findUniqueOrThrow({
            where: {
              idempotencyKey: `subscription-change:${team.id}:CAREER:${attemptId}`,
            },
          });

          let releaseDatabaseLock!: () => void;
          let databaseLockHeld!: () => void;
          const databaseLockHeldPromise = new Promise<void>((resolve) => {
            databaseLockHeld = resolve;
          });
          const releaseDatabaseLockPromise = new Promise<void>((resolve) => {
            releaseDatabaseLock = resolve;
          });
          const blocker = prisma.$transaction(async (tx) => {
            await lockSubscriptionChangeApply(tx, change.id);
            databaseLockHeld();
            await releaseDatabaseLockPromise;
          });
          await databaseLockHeldPromise;
          releasePayment();

          for (let i = 0; i < 100; i += 1) {
            const confirmed = await prisma.subscriptionChange.findUnique({
              where: { id: change.id },
              select: { paymentStatus: true },
            });
            if (confirmed?.paymentStatus === "CONFIRMED") break;
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
          assert.equal(
            (await prisma.subscriptionChange.findUniqueOrThrow({
              where: { id: change.id },
            })).paymentStatus,
            "CONFIRMED",
          );
          const recovery = recoverConfirmedSubscriptionChange({ changeId: change.id });
          assert.equal(
            (await prisma.teamProductSubscription.findUniqueOrThrow({
              where: { teamId_product: { teamId: team.id, product: "CAREER" } },
            })).planId,
            "free_v1",
          );

          releaseDatabaseLock();
          await blocker;
          const results = await Promise.all([initial, recovery]);
          assert.deepEqual(
            results.map((result) => result.action).sort(),
            ["NO_CHANGE", "SUBSCRIBED"],
          );
          assert.equal(
            (await prisma.subscriptionChange.findUniqueOrThrow({
              where: { id: change.id },
            })).applyStatus,
            "APPLIED",
          );
          assert.equal(
            await prisma.teamBillingHistory.count({
              where: { teamId: team.id, status: "SUCCESS", amount: 5900 },
            }),
            1,
          );
        },
      );
    });
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("completeWithBillingKey renews an active cycle from the current expiry boundary", async () => {
  const currentPlanExpiresAt = futureKstMidnight(1);
  const currentNextBillingAt = nextChargeAtFromExpiresAtExclusive(
    currentPlanExpiresAt,
  );
  const expectedPlanExpiresAt = addKstMonthsKeepingDay(currentPlanExpiresAt, 1);
  const expectedNextBillingAt =
    nextChargeAtFromExpiresAtExclusive(expectedPlanExpiresAt);
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "career_basic_v1",
      plan: "BASIC",
      planCategory: "CAREER",
      membershipStatus: "ACTIVE",
      payProvider: "INICIS",
      billingKey: "billing-key-existing",
      planExpiresAt: currentPlanExpiresAt,
      nextBillingAt: currentNextBillingAt,
      nextPaymentAmount: 5900,
      limitResumeMonthly: 150,
      usageResumeMonthly: 12,
    },
  });

  try {
    await withEnv(PORTONE_TEST_ENV, async () => {
      const result = await withMockFetch(
        async () =>
          ({
            ok: true,
            json: async () => ({ id: "payment-2", status: "PAID" }),
          }) as Response,
        () =>
          completeWithBillingKey({
            teamId: team.id,
            userId: user.id,
            planId: "career_basic_v1",
            payProvider: "inicis",
            billingKey: "billing-key-existing",
            customer: { fullName: "Tester" },
            attemptId: randomUUID(),
          }),
      );

      assert.equal(result.action, "RENEWED");
      assert.equal(result.payNowAmountWon, 5900);
      assert.equal(
        result.team.planExpiresAt,
        expectedPlanExpiresAt.toISOString(),
      );
      assert.equal(
        result.team.nextBillingAt,
        expectedNextBillingAt.toISOString(),
      );
      assert.equal(result.team.usageResumeMonthly, 0);

      const reloadedTeam = await prisma.team.findUniqueOrThrow({
        where: { id: team.id },
      });
      assert.equal(reloadedTeam.nextPaymentAmount, 5900);
    });
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("completeWithBillingKey upgrades in-place without resetting the current cycle boundary", async () => {
  const currentPlanExpiresAt = futureKstMidnight(31);
  const currentNextBillingAt = nextChargeAtFromExpiresAtExclusive(
    currentPlanExpiresAt,
  );
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "basic_monthly_v1",
      plan: "BASIC",
      planCategory: "PRESS",
      membershipStatus: "ACTIVE",
      payProvider: "INICIS",
      billingKey: "billing-key-basic",
      planExpiresAt: currentPlanExpiresAt,
      nextBillingAt: currentNextBillingAt,
      nextPaymentAmount: 9900,
      limitArticleMonthly: 30,
      usageArticleMonthly: 17,
    },
  });

  try {
    await withEnv(PORTONE_TEST_ENV, async () => {
      const result = await withMockFetch(
        async () =>
          ({
            ok: true,
            json: async () => ({ id: "payment-3", status: "PAID" }),
          }) as Response,
        () =>
          completeWithBillingKey({
            teamId: team.id,
            userId: user.id,
            planId: "pro_monthly_v1",
            payProvider: "inicis",
            billingKey: "billing-key-basic",
            customer: { fullName: "Tester" },
            attemptId: randomUUID(),
          }),
      );

      assert.equal(result.action, "UPGRADED");
      assert.equal(result.prorationWon, 19100);
      assert.equal(result.team.planId, "pro_monthly_v1");
      assert.equal(result.team.planCategory, "PRESS");
      assert.equal(result.team.planExpiresAt, currentPlanExpiresAt.toISOString());
      assert.equal(result.team.nextBillingAt, currentNextBillingAt.toISOString());
      assert.equal(result.team.usageArticleMonthly, 17);
      assert.equal(result.team.limitArticleMonthly, 120);

      const reloadedTeam = await prisma.team.findUniqueOrThrow({
        where: { id: team.id },
      });
      assert.equal(reloadedTeam.nextPaymentAmount, 29000);
    });
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("completeWithBillingKey schedules a downgrade for the next cycle without charging immediately", async () => {
  const currentPlanExpiresAt = futureKstMidnight(31);
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "career_pro_v1",
      plan: "PRO",
      planCategory: "CAREER",
      membershipStatus: "ACTIVE",
      payProvider: "INICIS",
      billingKey: "billing-key-pro",
      planExpiresAt: currentPlanExpiresAt,
      nextBillingAt: nextChargeAtFromExpiresAtExclusive(currentPlanExpiresAt),
      nextPaymentAmount: 12900,
    },
  });
  const attemptId = randomUUID();

  try {
    const result = await completeWithBillingKey({
      teamId: team.id,
      userId: user.id,
      planId: "career_basic_v1",
      payProvider: "inicis",
      billingKey: "billing-key-pro",
      attemptId,
    });

    assert.equal(result.action, "DOWNGRADE_SCHEDULED");
    assert.equal(result.payNowAmountWon, 0);
    assert.equal(result.team.pendingPlanId, "career_basic_v1");
    assert.equal(result.team.pendingPlanStartsAt, currentPlanExpiresAt.toISOString());

    const reloadedTeam = await prisma.team.findUniqueOrThrow({
      where: { id: team.id },
    });
    assert.equal(reloadedTeam.nextPaymentAmount, 5900);

    const paymentCount = await prisma.teamBillingHistory.count({
      where: { teamId: team.id, type: "PAYMENT" },
    });
    assert.equal(paymentCount, 0);

    const change = await prisma.subscriptionChange.findUniqueOrThrow({
      where: {
        idempotencyKey: `subscription-change:${team.id}:CAREER:${attemptId}`,
      },
    });
    assert.equal(change.changeType, "SCHEDULE_DOWNGRADE");
    assert.equal(change.paymentStatus, "NOT_REQUIRED");
    assert.equal(change.applyStatus, "APPLIED");
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("completeWithBillingKey treats a same-tier cross-product plan as a separate subscription", async () => {
  const currentPlanExpiresAt = futureKstMidnight(31);
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "basic_monthly_v1",
      plan: "BASIC",
      planCategory: "PRESS",
      membershipStatus: "ACTIVE",
      payProvider: "INICIS",
      billingKey: "billing-key-basic-change",
      planExpiresAt: currentPlanExpiresAt,
      nextBillingAt: nextChargeAtFromExpiresAtExclusive(currentPlanExpiresAt),
      nextPaymentAmount: 9900,
    },
  });

  try {
    const result = await withEnv(PORTONE_TEST_ENV, () =>
      withMockFetch(
        async () =>
          ({
            ok: true,
            json: async () => ({ id: "payment-cross-product", status: "PAID" }),
          }) as Response,
        () =>
          completeWithBillingKey({
            teamId: team.id,
            userId: user.id,
            planId: "career_basic_v1",
            payProvider: "inicis",
            billingKey: "billing-key-basic-change",
            attemptId: randomUUID(),
          }),
      ),
    );

    assert.equal(result.action, "SUBSCRIBED");
    assert.equal(result.payNowAmountWon, 5900);
    assert.equal(result.team.planId, "career_basic_v1");
    assert.equal(result.team.pendingPlanId, null);

    const reloadedTeam = await prisma.team.findUniqueOrThrow({
      where: { id: team.id },
    });
    assert.equal(reloadedTeam.planId, "career_basic_v1");
    assert.equal(reloadedTeam.pendingPlanId, null);
    assert.equal(reloadedTeam.nextPaymentAmount, 5900);

    const subscriptions = await prisma.teamProductSubscription.findMany({
      where: { teamId: team.id },
      orderBy: { product: "asc" },
    });
    assert.equal(subscriptions.length, 2);
    assert.deepEqual(
      subscriptions.map((subscription) => [subscription.product, subscription.planId]),
      [
        ["PRESS", "basic_monthly_v1"],
        ["CAREER", "career_basic_v1"],
      ],
    );

    const paymentCount = await prisma.teamBillingHistory.count({
      where: { teamId: team.id, type: "PAYMENT" },
    });
    assert.equal(paymentCount, 1);
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("subscription quote and completion use the same coupon-discounted amount", async () => {
  const { user, team } = await createUserAndTeam();
  const coupon = await prisma.coupon.create({
    data: {
      code: `SYNC-${randomUUID().slice(0, 8)}`.toUpperCase(),
      name: "Quote Complete Sync",
      status: "ACTIVE",
      benefitType: "PERCENT",
      discountPercent: 50,
      discountDuration: "ONCE",
      applicablePlanIds: ["career_basic_v1"],
    },
  });
  let paidAmount: number | null = null;

  try {
    const quote = await getSubscriptionQuoteForTeam({
      teamId: team.id,
      userId: user.id,
      targetPlanId: "career_basic_v1",
      couponCode: coupon.code,
    });

    assert.equal(quote.basePayNowAmountWon, 5900);
    assert.equal(quote.payNowAmountWon, 2950);
    assert.equal(quote.coupon?.discountAmountWon, 2950);

    await withEnv(PORTONE_TEST_ENV, async () => {
      const result = await withMockFetch(
        async (_input, init) => {
          const body = JSON.parse(String(init?.body ?? "{}"));
          paidAmount = body.amount?.total ?? null;
          return {
            ok: true,
            json: async () => ({ id: "payment-sync", status: "PAID" }),
          } as Response;
        },
        () =>
          completeWithBillingKey({
            teamId: team.id,
            userId: user.id,
            planId: "career_basic_v1",
            payProvider: "inicis",
            billingKey: "billing-key-sync",
            attemptId: randomUUID(),
            couponCode: coupon.code,
          }),
      );

      assert.equal(result.action, "SUBSCRIBED");
      assert.equal(result.payNowAmountWon, quote.payNowAmountWon);
      assert.equal(paidAmount, quote.payNowAmountWon);
    });
  } finally {
    await cleanupRecords({
      teamId: team.id,
      userId: user.id,
      couponIds: [coupon.id],
    });
  }
});

test("completeWithBillingKey serializes global discount coupon limits before charging", async () => {
  const first = await createUserAndTeam();
  const second = await createUserAndTeam();
  const coupon = await prisma.coupon.create({
    data: {
      code: `LIMIT-${randomUUID().slice(0, 8)}`.toUpperCase(),
      name: "Single Discount",
      status: "ACTIVE",
      benefitType: "PERCENT",
      discountPercent: 50,
      discountDuration: "ONCE",
      applicablePlanIds: ["career_basic_v1"],
      maxRedemptions: 1,
    },
  });
  let portoneCalls = 0;

  try {
    await withEnv(PORTONE_TEST_ENV, async () => {
      const results = await withMockFetch(
        async () => {
          portoneCalls += 1;
          return {
            ok: true,
            json: async () => ({ id: `payment-limit-${portoneCalls}`, status: "PAID" }),
          } as Response;
        },
        () =>
          Promise.allSettled([
            completeWithBillingKey({
              teamId: first.team.id,
              userId: first.user.id,
              planId: "career_basic_v1",
              payProvider: "inicis",
              billingKey: "billing-key-limit-a",
              attemptId: randomUUID(),
              couponCode: coupon.code,
            }),
            completeWithBillingKey({
              teamId: second.team.id,
              userId: second.user.id,
              planId: "career_basic_v1",
              payProvider: "inicis",
              billingKey: "billing-key-limit-b",
              attemptId: randomUUID(),
              couponCode: coupon.code,
            }),
          ]),
      );

      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        results.filter((result) => result.status === "rejected").length,
        1,
      );
      assert.equal(portoneCalls, 1);

      const redeemed = await prisma.couponRedemption.count({
        where: { couponId: coupon.id, status: "REDEEMED" },
      });
      assert.equal(redeemed, 1);
    });
  } finally {
    await cleanupRecords({
      teamId: first.team.id,
      userId: first.user.id,
      couponIds: [coupon.id],
    });
    await cleanupRecords({
      teamId: second.team.id,
      userId: second.user.id,
    });
  }
});

test("completeWithBillingKey redeems a zero-amount coupon and marks the redemption as REDEEMED", async () => {
  const { user, team } = await createUserAndTeam();
  const coupon = await prisma.coupon.create({
    data: {
      code: `FREE-${randomUUID().slice(0, 8)}`.toUpperCase(),
      name: "Free First Month",
      status: "ACTIVE",
      benefitType: "PERCENT",
      discountPercent: 100,
      discountDuration: "ONCE",
      applicablePlanIds: ["career_basic_v1"],
    },
  });

  try {
    const result = await completeWithBillingKey({
      teamId: team.id,
      userId: user.id,
      planId: "career_basic_v1",
      payProvider: "inicis",
      billingKey: "billing-key-free",
      attemptId: randomUUID(),
      couponCode: coupon.code,
    });

    assert.equal(result.action, "SUBSCRIBED_NO_CHARGE");
    assert.equal(result.payNowAmountWon, 0);

    const redemption = await prisma.couponRedemption.findFirstOrThrow({
      where: { couponId: coupon.id, userId: user.id },
    });
    assert.equal(redemption.status, "REDEEMED");
    assert.equal(redemption.discountAmount, 5900);
  } finally {
    await cleanupRecords({
      teamId: team.id,
      userId: user.id,
      couponIds: [coupon.id],
    });
  }
});

test("completeWithBillingKey cancels an applied coupon redemption when the PortOne payment fails", async () => {
  const { user, team } = await createUserAndTeam();
  const attemptId = randomUUID();
  const coupon = await prisma.coupon.create({
    data: {
      code: `HALF-${randomUUID().slice(0, 8)}`.toUpperCase(),
      name: "Half Off",
      status: "ACTIVE",
      benefitType: "PERCENT",
      discountPercent: 50,
      discountDuration: "ONCE",
      applicablePlanIds: ["career_basic_v1"],
    },
  });

  try {
    await withEnv(PORTONE_TEST_ENV, async () => {
      await withMockFetch(
        async () =>
          ({
            ok: false,
            status: 400,
            statusText: "Bad Request",
            json: async () => ({ message: "CARD_DECLINED" }),
          }) as Response,
        async () => {
          await assert.rejects(
            completeWithBillingKey({
              teamId: team.id,
              userId: user.id,
              planId: "career_basic_v1",
              payProvider: "inicis",
              billingKey: "billing-key-fail",
              attemptId,
              couponCode: coupon.code,
            }),
            /CARD_DECLINED/,
          );
        },
      );
    });

    const redemption = await prisma.couponRedemption.findFirstOrThrow({
      where: { couponId: coupon.id, userId: user.id },
    });
    assert.equal(redemption.status, "CANCELED");

    const reloadedTeam = await prisma.team.findUniqueOrThrow({
      where: { id: team.id },
    });
    assert.equal(reloadedTeam.planId, "free_v1");
    assert.equal(reloadedTeam.membershipStatus, "ACTIVE");

    const change = await prisma.subscriptionChange.findUniqueOrThrow({
      where: {
        idempotencyKey: `subscription-change:${team.id}:CAREER:${attemptId}`,
      },
    });
    assert.equal(change.paymentStatus, "FAILED");
    assert.equal(change.applyStatus, "PENDING");
  } finally {
    await cleanupRecords({
      teamId: team.id,
      userId: user.id,
      couponIds: [coupon.id],
    });
  }
});

test("completeWithBillingKey preserves provider-paid evidence when local apply fails", async () => {
  const { user, team } = await createUserAndTeam();
  const attemptId = randomUUID();
  const coupon = await prisma.coupon.create({
    data: {
      code: `APPLY-FAIL-${randomUUID().slice(0, 8)}`.toUpperCase(),
      name: "Apply failure fixture",
      status: "ACTIVE",
      benefitType: "PERCENT",
      discountPercent: 50,
      discountDuration: "ONCE",
      applicablePlanIds: ["career_basic_v1"],
    },
  });

  try {
    await withEnv(PORTONE_TEST_ENV, async () => {
      await assert.rejects(
        withMockFetch(
          async () => {
            await prisma.couponRedemption.deleteMany({
              where: { couponId: coupon.id, userId: user.id },
            });
            return {
              ok: true,
              json: async () => ({ id: "provider-paid-local-apply-failed", status: "PAID" }),
            } as Response;
          },
          () =>
            completeWithBillingKey({
              teamId: team.id,
              userId: user.id,
              planId: "career_basic_v1",
              payProvider: "inicis",
              billingKey: "billing-key-apply-failure",
              attemptId,
              couponCode: coupon.code,
            }),
        ),
      );
    });

    const paymentAttempt = await prisma.teamBillingHistory.findFirstOrThrow({
      where: { teamId: team.id, type: "PAYMENT" },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(paymentAttempt.status, "REQUESTED");
    assert.equal((paymentAttempt.meta as { attemptId?: string })?.attemptId, attemptId);

    const change = await prisma.subscriptionChange.findUniqueOrThrow({
      where: {
        idempotencyKey: `subscription-change:${team.id}:CAREER:${attemptId}`,
      },
    });
    assert.equal(change.paymentStatus, "CONFIRMED");
    assert.equal(change.applyStatus, "FAILED");
    assert.equal(change.requesterUserId, user.id);
    assert.equal(change.payProvider, "INICIS");
    const paymentMethodFingerprint = createHash("sha256")
      .update("billing-key-apply-failure")
      .digest("hex");
    assert.equal(
      change.paymentMethodRef,
      `team-product-subscription:${change.subscriptionId}:sha256:${paymentMethodFingerprint}`,
    );
    assert.ok(change.paymentConfirmedAt instanceof Date);
    assert.equal(
      JSON.stringify(change).includes("billing-key-apply-failure"),
      false,
    );

    const preparedSubscription =
      await prisma.teamProductSubscription.findUniqueOrThrow({
        where: { teamId_product: { teamId: team.id, product: "CAREER" } },
      });
    assert.equal(preparedSubscription.id, change.subscriptionId);
    assert.equal(preparedSubscription.payProvider, "INICIS");
    assert.equal(preparedSubscription.billingKey, "billing-key-apply-failure");

    let recoveryProviderCalls = 0;
    await withEnv(PORTONE_TEST_ENV, async () => {
      await withMockFetch(
        async () => {
          recoveryProviderCalls += 1;
          throw new Error("PROVIDER_MUST_NOT_BE_CALLED_AGAIN");
        },
        async () => {
          const recovered = await Promise.all([
            completeOrRecoverSubscriptionChange({
              teamId: team.id,
              userId: user.id,
              planId: "career_basic_v1",
              payProvider: "inicis",
              billingKey: "billing-key-apply-failure",
              attemptId,
              couponCode: coupon.code,
            }),
            recoverConfirmedSubscriptionChange({ changeId: change.id }),
          ]);
          assert.deepEqual(
            recovered.map((result) => result.action).sort(),
            ["NO_CHANGE", "SUBSCRIBED"],
          );
        },
      );
    });
    assert.equal(recoveryProviderCalls, 0);

    const recoveredChange = await prisma.subscriptionChange.findUniqueOrThrow({
      where: { id: change.id },
    });
    assert.equal(recoveredChange.paymentStatus, "CONFIRMED");
    assert.equal(recoveredChange.applyStatus, "APPLIED");

    const subscription = await prisma.teamProductSubscription.findUnique({
      where: { teamId_product: { teamId: team.id, product: "CAREER" } },
    });
    assert.equal(subscription?.plan, "BASIC");
    assert.equal(subscription?.membershipStatus, "ACTIVE");
  } finally {
    await cleanupRecords({
      teamId: team.id,
      userId: user.id,
      couponIds: [coupon.id],
    });
  }
});

test("unknown provider outcome keeps the operation pending for reconciliation", async () => {
  const { user, team } = await createUserAndTeam();
  const attemptId = randomUUID();

  try {
    await withEnv(PORTONE_TEST_ENV, () =>
      withMockFetch(
        async () => {
          throw new Error("PORTONE_NETWORK_RESET");
        },
        () =>
          assert.rejects(
            completeWithBillingKey({
              teamId: team.id,
              userId: user.id,
              planId: "career_basic_v1",
              payProvider: "inicis",
              billingKey: "billing-key-network-unknown",
              attemptId,
            }),
            /PORTONE_NETWORK_RESET/,
          ),
      ),
    );

    const change = await prisma.subscriptionChange.findUniqueOrThrow({
      where: {
        idempotencyKey: `subscription-change:${team.id}:CAREER:${attemptId}`,
      },
    });
    assert.equal(change.paymentStatus, "PENDING");
    assert.equal(change.applyStatus, "PENDING");
    assert.match(change.lastError ?? "", /PORTONE_NETWORK_RESET/);
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("provider success followed by confirmation persistence failure stays pending", async () => {
  const { user, team } = await createUserAndTeam();
  const attemptId = randomUUID();

  try {
    await assert.rejects(
      completeWithBillingKey({
        teamId: team.id,
        userId: user.id,
        planId: "career_basic_v1",
        payProvider: "inicis",
        billingKey: "billing-key-confirmation-persistence",
        attemptId,
        portone: {
          storeId: "store-test",
          channelKey: "channel-test",
          post: (async () => ({ ok: true, data: { status: "PAID" } })) as any,
          persistConfirmation: async () => {
            throw new Error("CONFIRMATION_PERSISTENCE_FAILED");
          },
        },
      }),
      /CONFIRMATION_PERSISTENCE_FAILED/,
    );

    const change = await prisma.subscriptionChange.findUniqueOrThrow({
      where: {
        idempotencyKey: `subscription-change:${team.id}:CAREER:${attemptId}`,
      },
    });
    assert.equal(change.paymentStatus, "PENDING");
    assert.equal(change.applyStatus, "PENDING");
    assert.match(change.lastError ?? "", /CONFIRMATION_PERSISTENCE_FAILED/);
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("audit projection status cannot short-circuit a new paid operation", async () => {
  const { user, team } = await createUserAndTeam();
  const attemptId = randomUUID();
  const externalPaymentId = createSubscriptionPaymentId("CAREER_BASIC", attemptId);
  let providerCalls = 0;

  try {
    await prisma.teamBillingHistory.create({
      data: {
        teamId: team.id,
        userId: user.id,
        type: "PAYMENT",
        status: "SUCCESS",
        provider: "INICIS",
        plan: "BASIC",
        planId: "career_basic_v1",
        product: "CAREER",
        amount: 5900,
        currency: "KRW",
        externalId: externalPaymentId,
      },
    });

    const result = await withEnv(PORTONE_TEST_ENV, () =>
      withMockFetch(
        async () => {
          providerCalls += 1;
          return {
            ok: true,
            json: async () => ({ id: externalPaymentId, status: "PAID" }),
          } as Response;
        },
        () =>
          completeWithBillingKey({
            teamId: team.id,
            userId: user.id,
            planId: "career_basic_v1",
            payProvider: "inicis",
            billingKey: "billing-key-audit-projection",
            customer: { fullName: "Tester", email: "tester@example.com" },
            attemptId,
          }),
      ),
    );

    assert.equal(providerCalls, 1);
    assert.equal(result.action, "SUBSCRIBED");
    assert.equal(
      (await prisma.subscriptionChange.findUniqueOrThrow({
        where: {
          idempotencyKey: `subscription-change:${team.id}:CAREER:${attemptId}`,
        },
      })).applyStatus,
      "APPLIED",
    );
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});
