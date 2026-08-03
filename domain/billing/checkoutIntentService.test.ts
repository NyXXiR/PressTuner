import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { hashCheckoutIntentToken } from "./checkoutIntent";
import {
  completeCheckoutIntentWithBillingKey,
  createCheckoutIntent,
  getCheckoutIntentStatus,
  markCheckoutIntentFailed,
  markCheckoutIntentOpened,
} from "./checkoutIntentService";

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

async function createUserAndTeam() {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `checkout-intent-${suffix}`,
      label: `Checkout Intent ${suffix.slice(0, 8)}`,
      email: `checkout-intent-${suffix}@example.com`,
    },
  });

  const team = await prisma.team.create({
    data: {
      slug: `checkout-intent-${suffix}`,
      name: `Checkout Intent ${suffix.slice(0, 8)}`,
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

const PORTONE_TEST_ENV = {
  PORTONE_API_SECRET: "secret-test",
  PORTONE_STORE_ID: "store-test",
  PORTONE_CHANNEL_KEY_INICIS: "channel-key-inicis",
};

test("checkout intent transitions from OPEN to OPENED when the mobile page is opened", async () => {
  const { user, team } = await createUserAndTeam();

  try {
    const created = await createCheckoutIntent({
      teamId: team.id,
      userId: user.id,
      planId: "career_basic_v1",
      payProvider: "inicis",
      appUrl: "https://presstuner.com",
    });

    assert.equal(created.intent.status, "OPEN");
    assert.match(created.mobileUrl, /\/checkout\/mobile\?intent=/);

    const opened = await markCheckoutIntentOpened(created.token);
    assert.equal(opened.status, "OPENED");
    assert.ok(opened.openedAt);
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("checkout intent completion locks the intent and finishes the subscription", async () => {
  const { user, team } = await createUserAndTeam();

  try {
    const created = await createCheckoutIntent({
      teamId: team.id,
      userId: user.id,
      planId: "career_basic_v1",
      payProvider: "inicis",
    });

    await markCheckoutIntentOpened(created.token);

    await withEnv(PORTONE_TEST_ENV, async () => {
      const completed = await withMockFetch(
        async () =>
          ({
            ok: true,
            json: async () => ({ id: "payment-10", status: "PAID" }),
          }) as Response,
        () =>
          completeCheckoutIntentWithBillingKey({
            token: created.token,
            billingKey: "billing-key-intent",
            customer: { fullName: "Intent User" },
          }),
      );

      assert.equal(completed.ok, true);
      assert.equal(completed.status, "COMPLETED");
      assert.ok("action" in completed);
      if ("action" in completed) {
        assert.equal(completed.action, "SUBSCRIBED");
      }
    });

    const status = await getCheckoutIntentStatus(created.token);
    assert.equal(status.status, "COMPLETED");
    assert.ok(status.completedAt);

    const reloadedTeam = await prisma.team.findUniqueOrThrow({
      where: { id: team.id },
    });
    assert.equal(reloadedTeam.planId, "career_basic_v1");
    assert.equal(reloadedTeam.membershipStatus, "ACTIVE");
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("checkout intent completion marks the intent as FAILED when payment confirmation fails", async () => {
  const { user, team } = await createUserAndTeam();

  try {
    const created = await createCheckoutIntent({
      teamId: team.id,
      userId: user.id,
      planId: "career_basic_v1",
      payProvider: "inicis",
    });

    await withEnv(PORTONE_TEST_ENV, async () => {
      await withMockFetch(
        async () =>
          ({
            ok: false,
            status: 400,
            statusText: "Bad Request",
            json: async () => ({ message: "BILLING_PAYMENT_FAILED" }),
          }) as Response,
        async () => {
          await assert.rejects(
            completeCheckoutIntentWithBillingKey({
              token: created.token,
              billingKey: "billing-key-intent-fail",
            }),
            /BILLING_PAYMENT_FAILED/,
          );
        },
      );
    });

    const status = await getCheckoutIntentStatus(created.token);
    assert.equal(status.status, "FAILED");
    assert.equal(status.lastError, "BILLING_PAYMENT_FAILED");
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("checkout intent status is promoted to EXPIRED once its ttl has passed", async () => {
  const { user, team } = await createUserAndTeam();

  try {
    const token = `expired_token_${randomUUID().replace(/-/g, "")}`;
    await prisma.checkoutIntent.create({
      data: {
        tokenHash: hashCheckoutIntentToken(token),
        teamId: team.id,
        userId: user.id,
        planId: "career_basic_v1",
        payProvider: "INICIS",
        attemptId: randomUUID(),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const status = await getCheckoutIntentStatus(token);
    assert.equal(status.status, "EXPIRED");
    assert.equal(status.lastError, "CHECKOUT_INTENT_EXPIRED");
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});

test("checkout intent can be explicitly marked as FAILED before a billing key is completed", async () => {
  const { user, team } = await createUserAndTeam();

  try {
    const created = await createCheckoutIntent({
      teamId: team.id,
      userId: user.id,
      planId: "career_basic_v1",
      payProvider: "inicis",
    });

    const failed = await markCheckoutIntentFailed({
      token: created.token,
      message: "USER_ABORTED",
    });

    assert.equal(failed.status, "FAILED");
    assert.equal(failed.lastError, "USER_ABORTED");
  } finally {
    await cleanupRecords({ teamId: team.id, userId: user.id });
  }
});
