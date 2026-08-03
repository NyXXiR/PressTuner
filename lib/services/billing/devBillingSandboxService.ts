import { randomUUID } from "node:crypto";

import {
  BILLING_PLANS,
  getEffectiveMonthlyAmountByPlanId,
  getPlanProduct,
  getPlan,
  isPlanAvailableForPurchase,
  isPlanId,
  type PlanId,
} from "@/config/billing/plans";
import type { PayProvider } from "@/config/billing/options";
import {
  buildCheckoutSubscriptionPatch,
  buildRecurringRenewalPatch,
} from "@/domain/billing/subscription/lifecycle";
import { getSubscriptionStatusForProduct } from "@/domain/billing/subscription/queries";
import { logTeamBillingHistory } from "@/domain/billing/history/log";
import { upsertProductSubscriptionFromLegacyTeam } from "@/domain/billing/productSubscription";
import { prisma } from "@/lib/prisma";
import { completeWithBillingKey } from "@/domain/billing/subscription/completeWithBillingKey";
import { recoverPastDueSubscription } from "@/domain/billing/subscription/pastDueRecovery";
import {
  cancelSubscriptionCommand,
  resetFreeCommand,
  scheduleDowngradeCommand,
  uncancelSubscriptionCommand,
  unscheduleDowngradeCommand,
} from "@/domain/billing/subscription/commands";
import type { PlanType, Prisma, ProductLine, SubscriptionPayProvider } from "@prisma/client";

export type DevBillingSandboxAction =
  | "mock-subscribe"
  | "mock-renewal-success"
  | "mock-renewal-failure"
  | "mock-past-due"
  | "mock-recover-past-due"
  | "mock-schedule-change"
  | "mock-unschedule-change"
  | "mock-cancel"
  | "mock-uncancel"
  | "reset-free";

export type DevBillingSandboxInput = {
  teamId: string;
  userId: string;
  action: DevBillingSandboxAction;
  planId?: string | null;
  amountWon?: number | null;
  payProvider?: string | null;
};

const TEAM_SELECT_FIELDS = {
  id: true,
  plan: true,
  planId: true,
  planExpiresAt: true,
  nextBillingAt: true,
  pendingPlanId: true,
  pendingPlanStartsAt: true,
  nextPaymentAmount: true,
  payProvider: true,
  billingKey: true,
} as const;

function err(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function normalizePayProvider(value?: string | null): PayProvider {
  const normalized = String(value ?? "").toLowerCase();
  return normalized === "kakaopay" ? "kakaopay" : "inicis";
}

function toProviderEnum(provider: PayProvider): SubscriptionPayProvider {
  return provider === "kakaopay" ? "KAKAOPAY" : "INICIS";
}

function devBillingKey(provider: PayProvider) {
  return `dev_billing_key_${provider}`;
}

function createMockPortOneDeps(action: DevBillingSandboxAction) {
  return {
    storeId: "dev-store",
    channelKey: "dev-channel",
    post: async <TResponse,>(
      path: string,
      body: unknown,
      opts?: { idempotencyKey?: string },
    ) => ({
      ok: true as const,
      data: {
        id: `dev_portone_${action}_${randomUUID()}`,
        status: "PAID",
        sandbox: true,
        path,
        idempotencyKey: opts?.idempotencyKey ?? null,
        request: body,
      } as TResponse,
    }),
  };
}

function resolvePlanId(value: string | null | undefined): PlanId {
  if (!isPlanId(value)) throw err(400, "INVALID_PLAN_ID");
  return value;
}

function resolvePaidPlanId(value: string | null | undefined): PlanId {
  const planId = resolvePlanId(value);
  const plan = getPlan(planId);
  if (plan.planType === "FREE") throw err(400, "FREE_PLAN_NOT_ALLOWED");
  return planId;
}

function resolveAmount(planId: PlanId, amountWon?: number | null) {
  if (typeof amountWon === "number" && Number.isFinite(amountWon)) {
    return Math.max(0, Math.floor(amountWon));
  }
  return getEffectiveMonthlyAmountByPlanId(planId);
}

function devPaymentId(action: DevBillingSandboxAction) {
  return `dev_${action}_${randomUUID()}`;
}

async function createDevBillingOrder(
  tx: Prisma.TransactionClient,
  args: {
    teamId: string;
    userId: string;
    amount: number;
    paymentId: string;
    action: DevBillingSandboxAction;
    planId?: string | null;
  },
) {
  return tx.billingOrder.create({
    data: {
      teamId: args.teamId,
      userId: args.userId,
      amount: args.amount,
      credits: 0,
      status: "CONFIRMED",
      orderId: `DEV-${Date.now()}-${randomUUID()}`,
      paymentKey: args.paymentId,
      meta: {
        kind: "DEV_BILLING_SANDBOX",
        action: args.action,
        planId: args.planId ?? null,
      },
    },
  });
}

async function logDevPayment(
  tx: Prisma.TransactionClient,
  args: {
    teamId: string;
    userId: string;
    status: "SUCCESS" | "FAILED";
    amount: number;
    provider: SubscriptionPayProvider | null;
    plan: PlanType | null;
    planId: string | null;
    paymentId: string;
    action: DevBillingSandboxAction;
    orderId?: string | null;
    product?: ProductLine | null;
    subscriptionId?: string | null;
  },
) {
  await logTeamBillingHistory(
    {
      teamId: args.teamId,
      userId: args.userId,
      type: "PAYMENT",
      status: args.status,
      provider: args.provider,
      plan: args.plan,
      planId: args.planId,
      product: args.product ?? null,
      subscriptionId: args.subscriptionId ?? null,
      amount: args.amount,
      currency: "KRW",
      externalId: args.paymentId,
      meta: {
        kind: "DEV_BILLING_SANDBOX",
        action: args.action,
        orderId: args.orderId ?? null,
      },
      occurredAt: new Date(),
      ignoreDuplicate: true,
    },
    tx,
  );
}

async function loadTeam(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: TEAM_SELECT_FIELDS,
  });
  if (!team) throw err(404, "TEAM_NOT_FOUND");
  return team;
}

function resolveRenewalTargetPlanId(team: Awaited<ReturnType<typeof loadTeam>>) {
  const boundary = team.planExpiresAt ?? new Date();
  if (
    isPlanId(team.pendingPlanId) &&
    (!team.pendingPlanStartsAt ||
      team.pendingPlanStartsAt.getTime() <= boundary.getTime())
  ) {
    return team.pendingPlanId;
  }
  return resolvePaidPlanId(team.planId);
}

async function mockSubscribe(input: DevBillingSandboxInput) {
  const planId = resolvePaidPlanId(input.planId);
  const payProvider = normalizePayProvider(input.payProvider);

  await completeWithBillingKey({
    teamId: input.teamId,
    userId: input.userId,
    planId,
    payProvider,
    billingKey: devBillingKey(payProvider),
    customer: { fullName: "Dev Billing Sandbox" },
    attemptId: randomUUID(),
    portone: createMockPortOneDeps(input.action),
  });
}

async function mockPastDue(input: DevBillingSandboxInput) {
  const planId = resolvePaidPlanId(input.planId);
  const plan = getPlan(planId);
  const payProvider = normalizePayProvider(input.payProvider);
  const providerEnum = toProviderEnum(payProvider);
  const amount = resolveAmount(planId, input.amountWon);
  const product = getPlanProduct(planId);
  if (!product) throw err(400, "PLAN_PRODUCT_NOT_DEFINED");
  const paymentId = devPaymentId(input.action);
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    const updatedTeam = await tx.team.update({
      where: { id: input.teamId },
      data: {
        ...buildCheckoutSubscriptionPatch({
          targetPlanId: planId,
          currentPlanExpiresAt: null,
          renewFromCurrentCycle: false,
          now,
          payProvider: providerEnum,
          billingKey: devBillingKey(payProvider),
        }),
        membershipStatus: "PAST_DUE",
        nextBillingAt: yesterday,
        nextPaymentAmount: amount,
      },
    });
    const subscription = await upsertProductSubscriptionFromLegacyTeam(
      updatedTeam,
      product,
      tx,
    );

    await logDevPayment(tx, {
      teamId: input.teamId,
      userId: input.userId,
      status: "FAILED",
      amount,
      provider: providerEnum,
      plan: plan.planType as PlanType,
      planId,
      paymentId,
      action: input.action,
      product,
      subscriptionId: subscription.id,
    });
  });
}

async function mockRenewalFailure(input: DevBillingSandboxInput) {
  const team = await loadTeam(input.teamId);
  const planId = resolveRenewalTargetPlanId(team);
  const plan = getPlan(planId);
  const amount = resolveAmount(planId, input.amountWon ?? team.nextPaymentAmount);
  const providerEnum =
    team.payProvider ?? toProviderEnum(normalizePayProvider(input.payProvider));
  const paymentId = devPaymentId(input.action);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.team.update({
      where: { id: input.teamId },
      data: {
        membershipStatus: "PAST_DUE",
        payProvider: providerEnum,
        billingKey:
          team.billingKey ?? `dev_billing_key_${providerEnum.toLowerCase()}`,
        nextBillingAt: team.nextBillingAt ?? yesterday,
        nextPaymentAmount: amount,
      },
    });

    await logDevPayment(tx, {
      teamId: input.teamId,
      userId: input.userId,
      status: "FAILED",
      amount,
      provider: providerEnum,
      plan: plan.planType as PlanType,
      planId,
      paymentId,
      action: input.action,
    });
  });
}

async function mockRenewalSuccess(input: DevBillingSandboxInput) {
  const team = await loadTeam(input.teamId);
  const planId = resolveRenewalTargetPlanId(team);
  const plan = getPlan(planId);
  const amount = resolveAmount(planId, input.amountWon ?? team.nextPaymentAmount);
  const providerEnum =
    team.payProvider ?? toProviderEnum(normalizePayProvider(input.payProvider));
  const paymentId = devPaymentId(input.action);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const order = await createDevBillingOrder(tx, {
      teamId: input.teamId,
      userId: input.userId,
      amount,
      paymentId,
      action: input.action,
      planId,
    });

    await tx.team.update({
      where: { id: input.teamId },
      data: {
        ...buildRecurringRenewalPatch({
          targetPlanId: planId,
          currentPlanExpiresAt: team.planExpiresAt,
          now,
        }),
        payProvider: providerEnum,
        billingKey:
          team.billingKey ?? `dev_billing_key_${providerEnum.toLowerCase()}`,
        lastPaymentId: paymentId,
        lastPaidAt: now,
        nextPaymentAmount: getEffectiveMonthlyAmountByPlanId(planId),
      },
    });

    await logDevPayment(tx, {
      teamId: input.teamId,
      userId: input.userId,
      status: "SUCCESS",
      amount,
      provider: providerEnum,
      plan: plan.planType as PlanType,
      planId,
      paymentId,
      action: input.action,
      orderId: order.id,
    });
  });
}

async function resetFree(input: DevBillingSandboxInput) {
  await resetFreeCommand({
    teamId: input.teamId,
    userId: input.userId,
    confirm: "RESET_FREE",
  });
}

async function mockRecoverPastDue(input: DevBillingSandboxInput) {
  const payProvider = normalizePayProvider(input.payProvider);
  const currentTeam = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: { planId: true },
  });
  if (!currentTeam?.planId) {
    throw err(404, "TEAM_PLAN_NOT_FOUND");
  }

  const product = getPlanProduct(currentTeam.planId);
  if (!product) {
    throw err(409, "INVALID_PLAN_PRODUCT");
  }

  await recoverPastDueSubscription({
    teamId: input.teamId,
    userId: input.userId,
    product,
    payProvider,
    billingKey: devBillingKey(payProvider),
    customer: { fullName: "Dev Billing Sandbox" },
    portone: createMockPortOneDeps("mock-recover-past-due"),
  });
  return product;
}

export async function applyDevBillingSandboxAction(
  input: DevBillingSandboxInput,
) {
  const selectedPlanId = input.action === "mock-recover-past-due"
    ? null
    : resolvePlanId(input.planId);
  let product: ProductLine | null = selectedPlanId
    ? getPlanProduct(selectedPlanId)
    : null;

  switch (input.action) {
    case "mock-subscribe":
      await mockSubscribe(input);
      break;
    case "mock-past-due":
      await mockPastDue(input);
      break;
    case "mock-renewal-failure":
      await mockRenewalFailure(input);
      break;
    case "mock-renewal-success":
      await mockRenewalSuccess(input);
      break;
    case "mock-recover-past-due":
      product = await mockRecoverPastDue(input);
      break;
    case "mock-schedule-change":
      if (!selectedPlanId) throw err(400, "INVALID_PLAN_ID");
      await scheduleDowngradeCommand({
        teamId: input.teamId,
        targetPlanId: selectedPlanId,
      });
      break;
    case "mock-unschedule-change":
      if (!product) throw err(400, "PLAN_PRODUCT_NOT_DEFINED");
      await unscheduleDowngradeCommand({ teamId: input.teamId, product });
      break;
    case "mock-cancel":
      if (!product) throw err(400, "PLAN_PRODUCT_NOT_DEFINED");
      await cancelSubscriptionCommand({
        teamId: input.teamId,
        userId: input.userId,
        product,
      });
      break;
    case "mock-uncancel":
      if (!product) throw err(400, "PLAN_PRODUCT_NOT_DEFINED");
      await uncancelSubscriptionCommand({ teamId: input.teamId, product });
      break;
    case "reset-free":
      await resetFree(input);
      break;
    default:
      throw err(400, "UNKNOWN_SANDBOX_ACTION");
  }

  if (!product) throw err(400, "PLAN_PRODUCT_NOT_DEFINED");

  return {
    action: input.action,
    team: await getSubscriptionStatusForProduct(input.teamId, product),
  };
}

export function listDevBillingSandboxPlans() {
  return Object.values(BILLING_PLANS)
    .filter((plan) => isPlanAvailableForPurchase(plan.id))
    .map((plan) => ({
      id: plan.id,
      name: plan.name,
      category: plan.category,
      planType: plan.planType,
      monthlyAmountWon: plan.monthlyAmountWon,
    }));
}
