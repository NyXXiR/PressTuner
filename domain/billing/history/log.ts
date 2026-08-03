// src/domain/billing/history/log.ts
import { prisma } from "@/lib/prisma";
import {
  Prisma,
  MembershipStatus,
  PlanType,
  ProductLine,
  SubscriptionPayProvider,
  TeamBillingHistoryStatus,
  TeamBillingHistoryType,
} from "@prisma/client";

export type LogTeamBillingHistoryArgs = {
  teamId: string;
  userId?: string | null;

  type: TeamBillingHistoryType;
  status?: TeamBillingHistoryStatus;

  provider?: SubscriptionPayProvider | null;
  plan?: PlanType | null;
  planId?: string | null;
  product?: ProductLine | null;
  subscriptionId?: string | null;
  beforePlanId?: string | null;
  afterPlanId?: string | null;
  beforeStatus?: MembershipStatus | null;
  afterStatus?: MembershipStatus | null;

  amount?: number | null;
  currency?: string;

  externalId?: string | null;
  receiptUrl?: string | null;

  meta?: any;
  occurredAt?: Date | null;

  /**
   * ✅ 멱등 처리 옵션
   * - true면 unique 충돌(P2002) 시 throw하지 않고 "기존 레코드"를 반환(가능한 경우)
   * - externalId가 없으면 기존 레코드 조회가 어렵기 때문에 null 반환
   */
  ignoreDuplicate?: boolean;
};

function asMetaRecord(meta: unknown): Record<string, unknown> {
  return meta && typeof meta === "object" && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeProduct(value: unknown): ProductLine | null {
  return value === ProductLine.PRESS || value === ProductLine.CAREER
    ? value
    : null;
}

function normalizeMembershipStatus(value: unknown): MembershipStatus | null {
  return Object.values(MembershipStatus).includes(value as MembershipStatus)
    ? (value as MembershipStatus)
    : null;
}

/**
 * 결제/해지/환불 이력을 남깁니다.
 * - tx를 넘기면 같은 트랜잭션에 포함됩니다.
 * - unique 충돌(멱등) 시:
 *   - ignoreDuplicate=false: 그대로 throw
 *   - ignoreDuplicate=true : 기존 레코드를 찾아 반환(없으면 null)
 */
export async function logTeamBillingHistory(
  args: LogTeamBillingHistoryArgs,
  tx?: Prisma.TransactionClient
) {
  const db = tx ?? prisma;
  const meta = asMetaRecord(args.meta);
  let product = args.product ?? normalizeProduct(meta.product);
  let subscriptionId = optionalString(args.subscriptionId ?? meta.subscriptionId);

  if (subscriptionId) {
    const subscription = await db.teamProductSubscription.findUnique({
      where: { id: subscriptionId },
      select: { teamId: true, product: true },
    });
    if (!subscription || subscription.teamId !== args.teamId) {
      throw new Error("BILLING_HISTORY_SUBSCRIPTION_TEAM_MISMATCH");
    }
    if (product && product !== subscription.product) {
      throw new Error("BILLING_HISTORY_SUBSCRIPTION_PRODUCT_MISMATCH");
    }
    product = subscription.product;
  } else if (product) {
    const subscription = await db.teamProductSubscription.findUnique({
      where: { teamId_product: { teamId: args.teamId, product } },
      select: { id: true },
    });
    subscriptionId = subscription?.id ?? null;
  }

  const beforePlanId =
    optionalString(args.beforePlanId) ??
    optionalString(meta.beforePlanId) ??
    optionalString(meta.previousPlanId);
  const afterPlanId =
    optionalString(args.afterPlanId) ??
    optionalString(meta.afterPlanId) ??
    optionalString(meta.targetPlanId) ??
    optionalString(meta.grantedPlanId) ??
    optionalString(args.planId);
  const beforeStatus =
    args.beforeStatus ?? normalizeMembershipStatus(meta.beforeStatus);
  const afterStatus =
    args.afterStatus ?? normalizeMembershipStatus(meta.afterStatus);

  try {
    return await db.teamBillingHistory.create({
      data: {
        teamId: args.teamId,
        userId: args.userId ?? null,

        type: args.type,
        status: args.status ?? "SUCCESS",

        provider: args.provider ?? null,
        plan: args.plan ?? null,
        planId: args.planId ?? null,
        product,
        subscriptionId,
        beforePlanId,
        afterPlanId,
        beforeStatus,
        afterStatus,

        amount: args.amount ?? null,
        currency: args.currency ?? "KRW",

        externalId: args.externalId ?? null,
        receiptUrl: args.receiptUrl ?? null,

        meta: args.meta ?? undefined,
        occurredAt: args.occurredAt ?? undefined,
      },
    });
  } catch (e: any) {
    // ✅ unique constraint violation
    // PrismaClientKnownRequestError(code="P2002")
    const isP2002 =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

    if (!args.ignoreDuplicate || !isP2002) throw e;

    // ignoreDuplicate=true 인데 externalId 없으면 "기존 레코드"를 특정할 수 없음
    const ext =
      typeof args.externalId === "string" ? args.externalId.trim() : "";
    if (!ext) return null;

    // 유니크가 (teamId, externalId)일 가능성이 높으니 우선 그 조합으로 찾고,
    // 아니면 externalId 단독 유니크일 수도 있어서 fallback도 둠.
    const existed =
      (await db.teamBillingHistory.findFirst({
        where: { teamId: args.teamId, externalId: ext },
        orderBy: { occurredAt: "desc" },
      })) ??
      (await db.teamBillingHistory.findFirst({
        where: { externalId: ext },
        orderBy: { occurredAt: "desc" },
      }));

    return existed ?? null;
  }
}
