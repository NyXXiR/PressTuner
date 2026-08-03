// src/domain/billing/subscription/queries.ts
import type { ProductLine } from "@prisma/client";

import {
  getEffectiveProductSubscription,
  type ProductSubscriptionSnapshot,
} from "@/domain/billing/productSubscription";
import { iso, ymdhm } from "@/domain/billing/subscription/serialize";
import { prisma } from "@/lib/prisma";

async function getTeamMetadata(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, slug: true, name: true },
  });

  if (!team) {
    const error = new Error("TEAM_NOT_FOUND") as Error & { status?: number };
    error.status = 404;
    throw error;
  }

  return team;
}

async function getProductSnapshot(teamId: string, product: ProductLine) {
  const [snapshot, stored] = await Promise.all([
    getEffectiveProductSubscription(teamId, product),
    prisma.teamProductSubscription.findUnique({
      where: { teamId_product: { teamId, product } },
      select: { id: true },
    }),
  ]);

  // Whitelist the canonical contract. Prisma rows contain id/createdAt/updatedAt
  // at runtime even though the compatibility snapshot type intentionally omits
  // them; spreading the row would leak those fields and could overwrite team id.
  return {
    subscriptionId: stored?.id ?? null,
    teamId: snapshot.teamId,
    product: snapshot.product,
    planId: snapshot.planId,
    plan: snapshot.plan,
    membershipStatus: snapshot.membershipStatus,
    payProvider: snapshot.payProvider,
    hasBillingKey: Boolean(snapshot.billingKey),
    nextPaymentAmount: snapshot.nextPaymentAmount,
    nextBillingAt: snapshot.nextBillingAt,
    planExpiresAt: snapshot.planExpiresAt,
    pendingPlanId: snapshot.pendingPlanId,
    pendingPlan: snapshot.pendingPlan,
    pendingPlanStartsAt: snapshot.pendingPlanStartsAt,
    cancelRequestedAt: snapshot.cancelRequestedAt,
    lastPaymentId: snapshot.lastPaymentId,
    lastPaidAt: snapshot.lastPaidAt,
  } satisfies Omit<ProductSubscriptionSnapshot, "billingKey"> & {
    subscriptionId: string | null;
    hasBillingKey: boolean;
  };
}

function serializeDates(snapshot: Awaited<ReturnType<typeof getProductSnapshot>>) {
  return {
    planExpiresAt: iso(snapshot.planExpiresAt),
    nextBillingAt: iso(snapshot.nextBillingAt),
    pendingPlanStartsAt: iso(snapshot.pendingPlanStartsAt),
    cancelRequestedAt: iso(snapshot.cancelRequestedAt),
    lastPaidAt: iso(snapshot.lastPaidAt),
  };
}

function serializeDisplayDates(
  snapshot: Awaited<ReturnType<typeof getProductSnapshot>>,
) {
  return {
    planExpiresAtYmdhm: ymdhm(snapshot.planExpiresAt),
    nextBillingAtYmdhm: ymdhm(snapshot.nextBillingAt),
    pendingPlanStartsAtYmdhm: ymdhm(snapshot.pendingPlanStartsAt),
    cancelRequestedAtYmdhm: ymdhm(snapshot.cancelRequestedAt),
    lastPaidAtYmdhm: ymdhm(snapshot.lastPaidAt),
  };
}

export async function getSubscriptionStatusForProduct(
  teamId: string,
  product: ProductLine,
) {
  const [team, snapshot] = await Promise.all([
    getTeamMetadata(teamId),
    getProductSnapshot(teamId, product),
  ]);

  return {
    ...team,
    ...snapshot,
    ...serializeDates(snapshot),
    ...serializeDisplayDates(snapshot),
  };
}

export async function getSubscriptionSummaryForProduct(
  teamId: string,
  product: ProductLine,
) {
  const [team, snapshot] = await Promise.all([
    getTeamMetadata(teamId),
    getProductSnapshot(teamId, product),
  ]);

  return {
    team: {
      ...team,
      ...snapshot,
      ...serializeDates(snapshot),
      ...serializeDisplayDates(snapshot),
    },
  };
}

export async function getSubscriptionContextForProduct(
  teamId: string,
  product: ProductLine,
) {
  const [team, snapshot] = await Promise.all([
    getTeamMetadata(teamId),
    getProductSnapshot(teamId, product),
  ]);

  return {
    ...team,
    ...snapshot,
    ...serializeDates(snapshot),
  };
}
