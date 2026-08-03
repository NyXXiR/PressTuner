import {
  Prisma,
  type ProductLine,
  type SubscriptionPayProvider,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  createSubscriptionChangeState,
  transitionSubscriptionChange,
  type SubscriptionChangeEvent,
} from "./subscriptionChange";

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function prepareSubscriptionChange(args: {
  teamId: string;
  product: ProductLine;
  subscriptionId?: string | null;
  changeType: string;
  targetPlanId: string;
  idempotencyKey: string;
  externalPaymentId?: string | null;
  requesterUserId?: string | null;
  payProvider?: SubscriptionPayProvider | null;
  paymentMethodRef?: string | null;
  paymentRequired: boolean;
  priceSnapshot: Prisma.InputJsonValue;
}) {
  const state = createSubscriptionChangeState({
    paymentRequired: args.paymentRequired,
  });
  try {
    const created = await prisma.subscriptionChange.create({
      data: {
        teamId: args.teamId,
        product: args.product,
        subscriptionId: args.subscriptionId ?? null,
        changeType: args.changeType,
        targetPlanId: args.targetPlanId,
        idempotencyKey: args.idempotencyKey,
        externalPaymentId: args.externalPaymentId ?? null,
        requesterUserId: args.requesterUserId ?? null,
        payProvider: args.payProvider ?? null,
        paymentMethodRef: args.paymentMethodRef ?? null,
        paymentStatus: state.paymentStatus,
        applyStatus: state.applyStatus,
        priceSnapshot: args.priceSnapshot,
      },
    });
    return { ...created, wasCreated: true as const };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const existing = await prisma.subscriptionChange.findUnique({
      where: { idempotencyKey: args.idempotencyKey },
    });
    if (existing) {
      if (
        existing.teamId !== args.teamId ||
        existing.product !== args.product ||
        existing.targetPlanId !== args.targetPlanId ||
        existing.externalPaymentId !== (args.externalPaymentId ?? null) ||
        existing.requesterUserId !== (args.requesterUserId ?? null) ||
        existing.payProvider !== (args.payProvider ?? null) ||
        existing.paymentMethodRef !== (args.paymentMethodRef ?? null)
      ) {
        throw new Error("SUBSCRIPTION_CHANGE_IDEMPOTENCY_CONFLICT");
      }
      return { ...existing, wasCreated: false as const };
    }

    if (args.externalPaymentId) {
      const externalPaymentOwner = await prisma.subscriptionChange.findUnique({
        where: { externalPaymentId: args.externalPaymentId },
        select: { id: true },
      });
      if (externalPaymentOwner) {
        throw new Error("SUBSCRIPTION_CHANGE_EXTERNAL_PAYMENT_CONFLICT");
      }
    }

    throw error;
  }
}

export async function prepareSubscriptionChangeWithPaymentMethod(
  args: Parameters<typeof prepareSubscriptionChange>[0] & {
    subscriptionId: string;
    payProvider: SubscriptionPayProvider;
    billingKey: string;
  },
) {
  const createAtomically = () =>
    prisma.$transaction(async (tx) => {
      const state = createSubscriptionChangeState({
        paymentRequired: args.paymentRequired,
      });
      const created = await tx.subscriptionChange.create({
        data: {
          teamId: args.teamId,
          product: args.product,
          subscriptionId: args.subscriptionId,
          changeType: args.changeType,
          targetPlanId: args.targetPlanId,
          idempotencyKey: args.idempotencyKey,
          externalPaymentId: args.externalPaymentId ?? null,
          requesterUserId: args.requesterUserId ?? null,
          payProvider: args.payProvider,
          paymentMethodRef: args.paymentMethodRef ?? null,
          paymentStatus: state.paymentStatus,
          applyStatus: state.applyStatus,
          priceSnapshot: args.priceSnapshot,
        },
      });
      const preparedPaymentMethod = await tx.teamProductSubscription.updateMany({
        where: {
          id: args.subscriptionId,
          teamId: args.teamId,
          product: args.product,
        },
        data: {
          payProvider: args.payProvider,
          billingKey: args.billingKey,
        },
      });
      if (preparedPaymentMethod.count !== 1) {
        throw new Error("SUBSCRIPTION_PAYMENT_METHOD_REFERENCE_INVALID");
      }
      return { ...created, wasCreated: true as const };
    });

  try {
    return await createAtomically();
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const existing = await prepareSubscriptionChange(args);
    const preparedPaymentMethod = await prisma.teamProductSubscription.updateMany({
      where: {
        id: args.subscriptionId,
        teamId: args.teamId,
        product: args.product,
      },
      data: {
        payProvider: args.payProvider,
        billingKey: args.billingKey,
      },
    });
    if (preparedPaymentMethod.count !== 1) {
      throw new Error("SUBSCRIPTION_PAYMENT_METHOD_REFERENCE_INVALID");
    }
    return existing;
  }
}

type SubscriptionChangeClient = Pick<
  Prisma.TransactionClient,
  "$queryRaw" | "subscriptionChange"
>;

async function transitionWithClient(
  client: SubscriptionChangeClient,
  args: {
    id: string;
    event: SubscriptionChangeEvent;
    externalPaymentId?: string;
    paymentConfirmedAt?: Date;
    error?: string;
  },
) {
  await client.$queryRaw`SELECT id FROM "subscription_change" WHERE id = ${args.id} FOR UPDATE`;
  const current = await client.subscriptionChange.findUnique({
    where: { id: args.id },
  });
  if (!current) throw new Error("SUBSCRIPTION_CHANGE_NOT_FOUND");

  const next = transitionSubscriptionChange(
    {
      paymentStatus: current.paymentStatus,
      applyStatus: current.applyStatus,
    },
    args.event,
  );
  return client.subscriptionChange.update({
    where: { id: current.id },
    data: {
      paymentStatus: next.paymentStatus,
      applyStatus: next.applyStatus,
      ...(args.externalPaymentId
        ? { externalPaymentId: args.externalPaymentId }
        : {}),
      ...(args.paymentConfirmedAt
        ? { paymentConfirmedAt: args.paymentConfirmedAt }
        : {}),
      ...(args.error
        ? { lastError: args.error.slice(0, 1000), retryCount: { increment: 1 } }
        : args.event.type === "APPLY_SUCCEEDED"
          ? { lastError: null, nextRetryAt: null }
          : {}),
      },
  });
}

async function transitionPersistedSubscriptionChange(args: {
  id: string;
  event: SubscriptionChangeEvent;
  externalPaymentId?: string;
  paymentConfirmedAt?: Date;
  error?: string;
  client?: SubscriptionChangeClient;
}) {
  if (args.client) return transitionWithClient(args.client, args);
  return prisma.$transaction((tx) => transitionWithClient(tx, args));
}

export function markSubscriptionChangePaymentConfirmed(args: {
  id: string;
  externalPaymentId: string;
  paymentConfirmedAt?: Date;
  client?: SubscriptionChangeClient;
}) {
  return transitionPersistedSubscriptionChange({
    ...args,
    event: { type: "PAYMENT_CONFIRMED" },
  });
}

export function markSubscriptionChangePaymentFailed(args: {
  id: string;
  error: string;
  client?: SubscriptionChangeClient;
}) {
  return transitionPersistedSubscriptionChange({
    ...args,
    event: { type: "PAYMENT_FAILED" },
  });
}

export function recordSubscriptionChangePaymentUncertain(args: {
  id: string;
  error: string;
}) {
  return prisma.subscriptionChange.updateMany({
    where: { id: args.id, paymentStatus: "PENDING", applyStatus: "PENDING" },
    data: { lastError: args.error.slice(0, 1000) },
  });
}

export function markSubscriptionChangeCancelled(args: {
  id: string;
  error: string;
  client?: SubscriptionChangeClient;
}) {
  return transitionPersistedSubscriptionChange({
    ...args,
    event: { type: "CANCELLED" },
  });
}

export const SUBSCRIPTION_CHANGE_MANUAL_REVIEW_RETRY_COUNT = 3;
const SUBSCRIPTION_CHANGE_RETRY_BASE_DELAY_MS = 60_000;
const SUBSCRIPTION_CHANGE_RETRY_MAX_DELAY_MS = 60 * 60_000;

function subscriptionChangeRetryAt(now: Date, retryCount: number) {
  const delayMs = Math.min(
    SUBSCRIPTION_CHANGE_RETRY_BASE_DELAY_MS * 2 ** (retryCount - 1),
    SUBSCRIPTION_CHANGE_RETRY_MAX_DELAY_MS,
  );
  return new Date(now.getTime() + delayMs);
}

export function markSubscriptionChangeApplyFailed(args: {
  id: string;
  error: string;
  now?: Date;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "subscription_change" WHERE id = ${args.id} FOR UPDATE`;
    const current = await tx.subscriptionChange.findUnique({
      where: { id: args.id },
    });
    if (!current) throw new Error("SUBSCRIPTION_CHANGE_NOT_FOUND");

    const retryCount = current.retryCount + 1;
    const manualReview =
      retryCount >= SUBSCRIPTION_CHANGE_MANUAL_REVIEW_RETRY_COUNT;
    const next = transitionSubscriptionChange(
      {
        paymentStatus: current.paymentStatus,
        applyStatus: current.applyStatus,
      },
      manualReview
        ? { type: "REQUIRE_MANUAL_REVIEW" }
        : { type: "APPLY_FAILED" },
    );
    const now = args.now ?? new Date();

    return tx.subscriptionChange.update({
      where: { id: current.id },
      data: {
        paymentStatus: next.paymentStatus,
        applyStatus: next.applyStatus,
        retryCount,
        lastError: args.error.slice(0, 1000),
        nextRetryAt: manualReview
          ? null
          : subscriptionChangeRetryAt(now, retryCount),
      },
    });
  });
}

export function markSubscriptionChangeApplied(args: {
  id: string;
  client?: SubscriptionChangeClient;
}) {
  return transitionPersistedSubscriptionChange({
    ...args,
    event: { type: "APPLY_SUCCEEDED" },
  });
}
