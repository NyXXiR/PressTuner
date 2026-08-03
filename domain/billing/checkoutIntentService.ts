import type { CheckoutIntentStatus, Prisma } from "@prisma/client";

import type { PayProvider } from "@/config/billing/options";
import { getAppUrl } from "@/config/billing/portone.server";
import { getPlan, type PlanId } from "@/config/billing/plans";
import {
  buildCheckoutIntentMobileUrl,
  createCheckoutIntentExpiry,
  createCheckoutIntentToken,
  dbProviderToPayProvider,
  hashCheckoutIntentToken,
  isCheckoutIntentExpired,
  isCheckoutIntentTerminal,
  normalizeCheckoutIntentToken,
} from "@/domain/billing/checkoutIntent";
import { prepareBillingKeyIssue } from "@/domain/billing/portone/prepareBillingKeyIssue";
import { normalizeProvider } from "@/domain/billing/subscription/portone";
import { completeWithBillingKey } from "@/domain/billing/subscription/completeWithBillingKey";
import { prisma } from "@/lib/prisma";

function err(status: number, message: string) {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  return e;
}

const checkoutIntentStatusSelect = {
  id: true,
  planId: true,
  payProvider: true,
  couponCode: true,
  status: true,
  lastError: true,
  openedAt: true,
  billingKeyIssuedAt: true,
  completedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  team: {
    select: {
      id: true,
      name: true,
    },
  },
  user: {
    select: {
      id: true,
      loginId: true,
      label: true,
      email: true,
    },
  },
} satisfies Prisma.CheckoutIntentSelect;

const checkoutIntentAccessSelect = {
  ...checkoutIntentStatusSelect,
  userId: true,
  teamId: true,
  attemptId: true,
  tokenHash: true,
} satisfies Prisma.CheckoutIntentSelect;

type CheckoutIntentStatusRecord = Prisma.CheckoutIntentGetPayload<{
  select: typeof checkoutIntentStatusSelect;
}>;

type CheckoutIntentAccessRecord = Prisma.CheckoutIntentGetPayload<{
  select: typeof checkoutIntentAccessSelect;
}>;

function serializeCheckoutIntent(intent: CheckoutIntentStatusRecord) {
  const plan = getPlan(intent.planId as PlanId);
  return {
    id: intent.id,
    teamId: intent.team.id,
    teamName: intent.team.name,
    planId: intent.planId,
    product: plan.product,
    planName: plan.name,
    planMonthlyAmountWon: plan.monthlyAmountWon,
    payProvider: dbProviderToPayProvider(intent.payProvider),
    couponCode: intent.couponCode,
    status: intent.status,
    lastError: intent.lastError,
    openedAt: intent.openedAt?.toISOString() ?? null,
    billingKeyIssuedAt: intent.billingKeyIssuedAt?.toISOString() ?? null,
    completedAt: intent.completedAt?.toISOString() ?? null,
    expiresAt: intent.expiresAt.toISOString(),
    createdAt: intent.createdAt.toISOString(),
    updatedAt: intent.updatedAt.toISOString(),
  };
}

async function markExpiredIfNeeded(intent: CheckoutIntentAccessRecord) {
  if (!isCheckoutIntentExpired(intent.expiresAt) || isCheckoutIntentTerminal(intent.status)) {
    return intent;
  }

  return prisma.checkoutIntent.update({
    where: { id: intent.id },
    data: {
      status: "EXPIRED",
      lastError: intent.lastError ?? "CHECKOUT_INTENT_EXPIRED",
    },
    select: checkoutIntentAccessSelect,
  });
}

async function requireCheckoutIntentByToken(token: string) {
  const normalized = normalizeCheckoutIntentToken(token);
  if (!normalized) throw err(400, "INVALID_CHECKOUT_INTENT");

  const intent = await prisma.checkoutIntent.findUnique({
    where: { tokenHash: hashCheckoutIntentToken(normalized) },
    select: checkoutIntentAccessSelect,
  });

  if (!intent) throw err(404, "CHECKOUT_INTENT_NOT_FOUND");
  return markExpiredIfNeeded(intent);
}

export async function createCheckoutIntent(args: {
  teamId: string;
  userId: string;
  planId: PlanId;
  payProvider: PayProvider;
  couponCode?: string | null;
  appUrl?: string;
}) {
  const token = createCheckoutIntentToken();
  const created = await prisma.checkoutIntent.create({
    data: {
      tokenHash: hashCheckoutIntentToken(token),
      teamId: args.teamId,
      userId: args.userId,
      planId: args.planId,
      payProvider: normalizeProvider(args.payProvider),
      couponCode: args.couponCode?.trim() || null,
      attemptId: crypto.randomUUID(),
      expiresAt: createCheckoutIntentExpiry(),
    },
    select: checkoutIntentStatusSelect,
  });

  return {
    token,
    mobileUrl: buildCheckoutIntentMobileUrl(args.appUrl ?? getAppUrl(), token),
    intent: serializeCheckoutIntent(created),
  };
}

export async function getCheckoutIntentStatus(token: string) {
  const intent = await requireCheckoutIntentByToken(token);
  return serializeCheckoutIntent(intent);
}

export async function markCheckoutIntentOpened(token: string) {
  const intent = await requireCheckoutIntentByToken(token);

  if (intent.status === "EXPIRED" || intent.status === "COMPLETED") {
    return serializeCheckoutIntent(intent);
  }

  if (intent.status === "OPEN") {
    const updated = await prisma.checkoutIntent.update({
      where: { id: intent.id },
      data: {
        status: "OPENED",
        openedAt: intent.openedAt ?? new Date(),
        lastError: null,
      },
      select: checkoutIntentStatusSelect,
    });
    return serializeCheckoutIntent(updated);
  }

  return serializeCheckoutIntent(intent);
}

export async function markCheckoutIntentFailed(args: {
  token: string;
  message: string;
}) {
  const intent = await requireCheckoutIntentByToken(args.token);
  if (intent.status === "COMPLETED" || intent.status === "EXPIRED") {
    return serializeCheckoutIntent(intent);
  }

  const updated = await prisma.checkoutIntent.update({
    where: { id: intent.id },
    data: {
      status: "FAILED",
      lastError: args.message.trim() || "CHECKOUT_INTENT_FAILED",
    },
    select: checkoutIntentStatusSelect,
  });

  return serializeCheckoutIntent(updated);
}

export async function prepareCheckoutIntentBillingKeyIssue(args: {
  token: string;
  appUrl?: string;
}) {
  const normalized = normalizeCheckoutIntentToken(args.token);
  if (!normalized) throw err(400, "INVALID_CHECKOUT_INTENT");

  const intent = await requireCheckoutIntentByToken(normalized);
  if (intent.status === "EXPIRED") throw err(410, "CHECKOUT_INTENT_EXPIRED");
  if (intent.status === "COMPLETED") throw err(409, "CHECKOUT_INTENT_COMPLETED");
  if (intent.status === "BILLING_KEY_ISSUED") {
    throw err(409, "CHECKOUT_INTENT_ALREADY_PROCESSING");
  }

  return prepareBillingKeyIssue({
    planId: intent.planId as PlanId,
    payProvider: dbProviderToPayProvider(intent.payProvider),
    couponCode: intent.couponCode,
    mobile: true,
    appUrl: args.appUrl,
    customer: {
      customerId: intent.user.id,
      fullName: intent.user.label || intent.user.loginId,
      email: intent.user.email,
    },
    redirectUrlOverride: buildCheckoutIntentMobileUrl(
      args.appUrl ?? getAppUrl(),
      normalized,
    ),
  });
}

export async function completeCheckoutIntentWithBillingKey(args: {
  token: string;
  billingKey: string;
  customer?: any;
}) {
  const normalized = normalizeCheckoutIntentToken(args.token);
  if (!normalized) throw err(400, "INVALID_CHECKOUT_INTENT");

  const intent = await requireCheckoutIntentByToken(normalized);
  if (intent.status === "EXPIRED") throw err(410, "CHECKOUT_INTENT_EXPIRED");

  if (intent.status === "COMPLETED") {
    return {
      ok: true as const,
      status: intent.status,
      note: "ALREADY_COMPLETED",
    };
  }

  if (intent.status === "BILLING_KEY_ISSUED") {
    throw err(409, "CHECKOUT_INTENT_ALREADY_PROCESSING");
  }

  const locked = await prisma.checkoutIntent.updateMany({
    where: {
      id: intent.id,
      status: {
        in: ["OPEN", "OPENED", "FAILED"] satisfies CheckoutIntentStatus[],
      },
    },
    data: {
      status: "BILLING_KEY_ISSUED",
      billingKeyIssuedAt: new Date(),
      lastError: null,
    },
  });

  if (locked.count !== 1) {
    const fresh = await prisma.checkoutIntent.findUnique({
      where: { id: intent.id },
      select: checkoutIntentStatusSelect,
    });
    if (!fresh) throw err(404, "CHECKOUT_INTENT_NOT_FOUND");
    if (fresh.status === "COMPLETED") {
      return { ok: true as const, status: fresh.status, note: "ALREADY_COMPLETED" };
    }
    throw err(409, "CHECKOUT_INTENT_ALREADY_PROCESSING");
  }

  try {
    const done = await completeWithBillingKey({
      teamId: intent.teamId,
      userId: intent.userId,
      planId: intent.planId as PlanId,
      payProvider: dbProviderToPayProvider(intent.payProvider),
      billingKey: args.billingKey,
      customer: args.customer,
      attemptId: intent.attemptId,
      couponCode: intent.couponCode,
    });

    await prisma.checkoutIntent.update({
      where: { id: intent.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        lastError: null,
      },
    });

    return {
      ok: true as const,
      status: "COMPLETED" as const,
      ...done,
    };
  } catch (error: any) {
    await prisma.checkoutIntent.update({
      where: { id: intent.id },
      data: {
        status: "FAILED",
        lastError: error?.message ?? "CHECKOUT_INTENT_COMPLETE_FAILED",
      },
    });
    throw error;
  }
}
