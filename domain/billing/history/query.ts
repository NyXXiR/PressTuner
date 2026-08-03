// src/domain/billing/history/query.ts
import type {
  MembershipStatus,
  PlanType,
  ProductLine,
  SubscriptionPayProvider,
  TeamBillingHistoryStatus,
  TeamBillingHistoryType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type TeamBillingHistoryItem = {
  id: string;
  occurredAt: string;
  type: TeamBillingHistoryType;
  status: TeamBillingHistoryStatus;
  plan: PlanType | null;
  planId: string | null;
  product: ProductLine | null;
  subscriptionId: string | null;
  beforePlanId: string | null;
  afterPlanId: string | null;
  beforeStatus: MembershipStatus | null;
  afterStatus: MembershipStatus | null;
  amount: number | null;
  currency: string;
  provider: SubscriptionPayProvider | null;
  receiptUrl: string | null;
  externalId: string | null;
};

export async function listTeamBillingHistory(args: {
  teamId: string;
  product?: ProductLine | null;
  from: Date;
  toExclusive: Date;
  take?: number;
}): Promise<TeamBillingHistoryItem[]> {
  const take =
    typeof args.take === "number" && args.take > 0
      ? Math.min(500, Math.floor(args.take))
      : 500;

  const items = await prisma.teamBillingHistory.findMany({
    where: {
      teamId: args.teamId,
      ...(args.product ? { product: args.product } : {}),
      occurredAt: { gte: args.from, lt: args.toExclusive },
    },
    orderBy: { occurredAt: "desc" },
    take,
    select: {
      id: true,
      occurredAt: true,
      type: true,
      status: true,
      plan: true,
      planId: true,
      product: true,
      subscriptionId: true,
      beforePlanId: true,
      afterPlanId: true,
      beforeStatus: true,
      afterStatus: true,
      amount: true,
      currency: true,
      provider: true,
      receiptUrl: true,
      externalId: true,
    },
  });

  return items.map((x) => ({
    ...x,
    occurredAt: x.occurredAt.toISOString(),
  }));
}
