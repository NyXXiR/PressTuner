import type {
  MembershipStatus,
  PlanType,
  Prisma,
  ProductLine,
  SubscriptionPayProvider,
} from "@prisma/client";

import {
  getPlan,
  getPlanProduct,
  isPlanId,
  type AiQuotaSurface,
  type PlanId,
} from "@/config/billing/plans";
import { prisma } from "@/lib/prisma";

export type ProductSubscriptionSnapshot = {
  teamId: string;
  product: ProductLine;
  planId: string | null;
  plan: PlanType;
  membershipStatus: MembershipStatus;
  payProvider: SubscriptionPayProvider | null;
  billingKey: string | null;
  nextPaymentAmount: number;
  nextBillingAt: Date | null;
  planExpiresAt: Date | null;
  pendingPlanId: string | null;
  pendingPlan: PlanType | null;
  pendingPlanStartsAt: Date | null;
  cancelRequestedAt: Date | null;
  lastPaymentId: string | null;
  lastPaidAt: Date | null;
};

type ProductSubscriptionClient = Pick<
  Prisma.TransactionClient,
  "$queryRaw" | "team" | "teamProductSubscription"
>;

const PRODUCT_BY_SURFACE: Record<AiQuotaSurface, ProductLine> = {
  PRESS: "PRESS",
  RESUME: "CAREER",
};

export function productForSurface(surface: AiQuotaSurface): ProductLine {
  return PRODUCT_BY_SURFACE[surface];
}

export function requireProductForPlan(planId: PlanId): ProductLine {
  const product = getPlanProduct(planId);
  if (!product) throw new Error("PLAN_PRODUCT_NOT_DEFINED");
  return product;
}

function freeSnapshot(teamId: string, product: ProductLine): ProductSubscriptionSnapshot {
  return {
    teamId,
    product,
    planId: "free_v1",
    plan: "FREE",
    membershipStatus: "ACTIVE",
    payProvider: null,
    billingKey: null,
    nextPaymentAmount: 0,
    nextBillingAt: null,
    planExpiresAt: null,
    pendingPlanId: null,
    pendingPlan: null,
    pendingPlanStartsAt: null,
    cancelRequestedAt: null,
    lastPaymentId: null,
    lastPaidAt: null,
  };
}

async function lockProductSubscriptionForWrite(
  client: ProductSubscriptionClient,
  teamId: string,
  product: ProductLine,
) {
  const locked = await client.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "team_product_subscription" WHERE "team_id" = ${teamId} AND "product" = CAST(${product} AS "ProductLine") FOR UPDATE`;

  if (locked.length > 0) return;

  await client.$queryRaw<{ id: string }[]>`SELECT id FROM "team" WHERE id = ${teamId} FOR UPDATE`;
}

export async function getLockedProductSubscriptionSnapshot(
  teamId: string,
  product: ProductLine,
  client: ProductSubscriptionClient = prisma,
): Promise<ProductSubscriptionSnapshot> {
  await lockProductSubscriptionForWrite(client, teamId, product);

  const row = await client.teamProductSubscription.findUnique({
    where: { teamId_product: { teamId, product } },
  });
  if (row) return row;

  const team = await client.team.findUnique({
    where: { id: teamId },
    select: { id: true },
  });
  if (!team) throw new Error("TEAM_NOT_FOUND");
  return freeSnapshot(teamId, product);
}

export async function getEffectiveProductSubscription(
  teamId: string,
  product: ProductLine,
  client: ProductSubscriptionClient = prisma,
): Promise<ProductSubscriptionSnapshot> {
  const stored = await client.teamProductSubscription.findUnique({
    where: { teamId_product: { teamId, product } },
  });
  if (stored) return stored;

  const team = await client.team.findUnique({
    where: { id: teamId },
    select: { id: true },
  });
  if (!team) throw new Error("TEAM_NOT_FOUND");
  return freeSnapshot(teamId, product);
}

export async function persistLegacyProductSubscription(
  teamId: string,
  client: ProductSubscriptionClient = prisma,
) {
  const team = await client.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      planId: true,
      plan: true,
      membershipStatus: true,
      payProvider: true,
      billingKey: true,
      nextPaymentAmount: true,
      nextBillingAt: true,
      planExpiresAt: true,
      pendingPlanId: true,
      pendingPlan: true,
      pendingPlanStartsAt: true,
      cancelRequestedAt: true,
      lastPaymentId: true,
      lastPaidAt: true,
    },
  });
  if (!team?.planId || !isPlanId(team.planId)) return null;
  const product = getPlan(team.planId as PlanId).product;
  if (!product) return null;

  const { id: teamIdValue, nextPaymentAmount, ...snapshot } = team;
  return client.teamProductSubscription.upsert({
    where: { teamId_product: { teamId: teamIdValue, product } },
    create: {
      teamId: teamIdValue,
      product,
      ...snapshot,
      nextPaymentAmount: nextPaymentAmount ?? 0,
    },
    update: {},
  });
}

export async function upsertProductSubscriptionSnapshot(
  snapshot: ProductSubscriptionSnapshot,
  client: ProductSubscriptionClient = prisma,
) {
  const { teamId, product, ...data } = snapshot;
  return client.teamProductSubscription.upsert({
    where: { teamId_product: { teamId, product } },
    create: { teamId, product, ...data },
    update: data,
  });
}

export async function upsertProductSubscriptionFromLegacyTeam(
  team: {
    id: string;
    planId: string | null;
    plan: PlanType;
    membershipStatus: MembershipStatus;
    payProvider: SubscriptionPayProvider | null;
    billingKey: string | null;
    nextPaymentAmount?: number | null;
    nextBillingAt: Date | null;
    planExpiresAt: Date | null;
    pendingPlanId: string | null;
    pendingPlan: PlanType | null;
    pendingPlanStartsAt: Date | null;
    cancelRequestedAt: Date | null;
    lastPaymentId: string | null;
    lastPaidAt: Date | null;
  },
  product: ProductLine,
  client: ProductSubscriptionClient = prisma,
) {
  return upsertProductSubscriptionSnapshot(
    {
      teamId: team.id,
      product,
      planId: team.planId,
      plan: team.plan,
      membershipStatus: team.membershipStatus,
      payProvider: team.payProvider,
      billingKey: team.billingKey,
      nextPaymentAmount: team.nextPaymentAmount ?? 0,
      nextBillingAt: team.nextBillingAt,
      planExpiresAt: team.planExpiresAt,
      pendingPlanId: team.pendingPlanId,
      pendingPlan: team.pendingPlan,
      pendingPlanStartsAt: team.pendingPlanStartsAt,
      cancelRequestedAt: team.cancelRequestedAt,
      lastPaymentId: team.lastPaymentId,
      lastPaidAt: team.lastPaidAt,
    },
    client,
  );
}
