// src/domain/billing/teamMembership.ts
import { prisma } from "@/lib/prisma";
import type { PlanType, SubscriptionPayProvider, Prisma } from "@prisma/client";

const KST = "Asia/Seoul";
const DAY_MS = 24 * 60 * 60 * 1000;

function dbOf(tx?: Prisma.TransactionClient) {
  return tx ?? prisma;
}

export function planTier(p: PlanType): number {
  switch (p) {
    case "FREE":
      return 0;
    case "BASIC":
      return 1;
    case "PRO":
      return 2;
    case "ENTERPRISE":
      return 3;
    default:
      return 0;
  }
}

export function getKstYmd(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  return { y, m, d };
}

export function dateFromKst(
  y: number,
  m: number,
  d: number,
  hh = 0,
  mm = 0,
  ss = 0
) {
  // KST = UTC+9
  return new Date(Date.UTC(y, m - 1, d, hh - 9, mm, ss));
}

export function kstMidnight(date: Date) {
  const { y, m, d } = getKstYmd(date);
  return dateFromKst(y, m, d, 0, 0, 0);
}

export function addKstDays(date: Date, days: number) {
  const { y, m, d } = getKstYmd(date);
  return dateFromKst(y, m, d + days, 0, 0, 0);
}

export function addKstMonthsKeepingDay(date: Date, months: number) {
  const { y, m, d } = getKstYmd(date);

  const target = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  target.setUTCMonth(target.getUTCMonth() + months);

  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth() + 1;

  const lastDay = new Date(Date.UTC(ty, tm, 0, 0, 0, 0)).getUTCDate();
  const td = Math.min(d, lastDay);

  return dateFromKst(ty, tm, td, 0, 0, 0);
}

/**
 * expiresAtExclusive = (만료일 다음날 00:00 KST)
 * 접근 허용: now < expiresAtExclusive
 */
export function expiresAtExclusiveFromCycleEndDate(cycleEndDate: Date) {
  const { y, m, d } = getKstYmd(cycleEndDate);
  return dateFromKst(y, m, d + 1, 0, 0, 0);
}

/**
 * nextBillingAt: 만료일 하루 전 10:00 KST
 * (스케줄러가 이 시점에 결제 시도하는 정책)
 */
export function nextChargeAtFromExpiresAtExclusive(expiresAtExclusive: Date) {
  const expireDate = new Date(expiresAtExclusive.getTime() - 1);
  const { y, m, d } = getKstYmd(expireDate);
  return dateFromKst(y, m, d - 1, 10, 0, 0);
}

export function daysBetweenKstMidnights(start: Date, endExclusive: Date) {
  const s = kstMidnight(start).getTime();
  const e = kstMidnight(endExclusive).getTime();
  return Math.max(0, Math.round((e - s) / DAY_MS));
}

/**
 * (기존) 업그레이드 일할 계산
 * - 너가 말한 정책(가격차이만 결제)으로 바꾸면 quote/complete에서 이 함수를 안 쓰면 됨
 */
export function computeUpgradeProrationWon(opts: {
  now: Date;
  currentExpiresAtExclusive: Date;
  currentMonthlyWon: number;
  targetMonthlyWon: number;
}) {
  const {
    now,
    currentExpiresAtExclusive,
    currentMonthlyWon,
    targetMonthlyWon,
  } = opts;

  const diff = targetMonthlyWon - currentMonthlyWon;
  if (diff <= 0) return 0;

  const expireDate = new Date(currentExpiresAtExclusive.getTime() - 1);
  const cycleStart = addKstMonthsKeepingDay(expireDate, -1);
  const cycleEndExclusiveMidnight = kstMidnight(addKstDays(expireDate, +1));

  const totalDays = Math.max(
    1,
    daysBetweenKstMidnights(cycleStart, cycleEndExclusiveMidnight)
  );
  const remainingDays = Math.max(
    0,
    daysBetweenKstMidnights(now, cycleEndExclusiveMidnight)
  );

  const prorated = Math.floor((diff * remainingDays) / totalDays);
  return Math.max(0, prorated);
}

/**
 * ✅ 신규/연장 반영
 * - planExpiresAt/nextBillingAt을 항상 새로 계산해서 세팅
 * - ✅ tx 지원
 */
export async function applyNewOrRenewedSubscription(
  opts: {
    teamId: string;

    plan: PlanType;
    planId: string;

    payProvider: SubscriptionPayProvider;
    billingKey: string;

    cycleEndDate: Date;

    lastPaymentId?: string | null;
    lastPaidAt?: Date | null;
  },
  tx?: Prisma.TransactionClient
) {
  const db = dbOf(tx);

  const expiresAtExclusive = expiresAtExclusiveFromCycleEndDate(
    opts.cycleEndDate
  );
  const nextBillingAt = nextChargeAtFromExpiresAtExclusive(expiresAtExclusive);

  return db.team.update({
    where: { id: opts.teamId },
    data: {
      plan: opts.plan,
      planId: opts.planId,

      membershipStatus: "ACTIVE",
      payProvider: opts.payProvider,

      billingKey: opts.billingKey,
      planExpiresAt: expiresAtExclusive,
      nextBillingAt,

      pendingPlan: null,
      pendingPlanId: null,
      pendingPlanStartsAt: null,

      // ✅ 결제/재구독 성공이면 해지요청은 자동 취소(정기결제 재개)
      cancelRequestedAt: null,

      lastPaymentId: opts.lastPaymentId ?? undefined,
      lastPaidAt: opts.lastPaidAt ?? undefined,
    },
  });
}

/**
 * ✅ 업그레이드(즉시 반영)
 * - 기존 만료(planExpiresAt)는 유지
 * - cancel 상태였다면 "정기결제 재개" → nextBillingAt 복구/재계산
 * - ✅ tx 지원 (중요: 내부에서 $transaction을 돌리지 않게 구조 변경)
 */
export async function applyImmediateUpgrade(
  opts: {
    teamId: string;

    targetPlan: PlanType;
    targetPlanId: string;

    payProvider: SubscriptionPayProvider;
    billingKey: string;

    lastPaymentId?: string | null;
    lastPaidAt?: Date | null;
  },
  tx?: Prisma.TransactionClient
) {
  const db = dbOf(tx);

  const current = await db.team.findUnique({
    where: { id: opts.teamId },
    select: {
      planExpiresAt: true,
      nextBillingAt: true,
      cancelRequestedAt: true,
    },
  });

  const expiresAtExclusive = current?.planExpiresAt ?? null;

  const computedNextBillingAt = expiresAtExclusive
    ? nextChargeAtFromExpiresAtExclusive(expiresAtExclusive)
    : null;

  return db.team.update({
    where: { id: opts.teamId },
    data: {
      plan: opts.targetPlan,
      planId: opts.targetPlanId,

      membershipStatus: "ACTIVE",
      payProvider: opts.payProvider,
      billingKey: opts.billingKey,

      ...(computedNextBillingAt
        ? { nextBillingAt: computedNextBillingAt }
        : {}),

      pendingPlan: null,
      pendingPlanId: null,
      pendingPlanStartsAt: null,

      // ✅ 업그레이드 결제 성공이면 해지요청은 자동 취소(정기결제 재개)
      cancelRequestedAt: null,

      lastPaymentId: opts.lastPaymentId ?? undefined,
      lastPaidAt: opts.lastPaidAt ?? undefined,
    },
  });
}

export async function scheduleDowngrade(
  opts: {
    teamId: string;

    targetPlan: PlanType;
    targetPlanId: string;

    effectiveAt: Date;
  },
  tx?: Prisma.TransactionClient
) {
  const db = dbOf(tx);

  return db.team.update({
    where: { id: opts.teamId },
    data: {
      pendingPlan: opts.targetPlan,
      pendingPlanId: opts.targetPlanId,
      pendingPlanStartsAt: opts.effectiveAt,
    },
  });
}

/**
 * ✅ 정기결제 "해지 요청" (다음 결제부터 중지)
 * - nextBillingAt/planExpiresAt 일정 정보는 지우지 않는다.
 * - ✅ tx 지원
 */
export async function requestCancelAutoBilling(
  opts: {
    teamId: string;
    requestedAt?: Date;
  },
  tx?: Prisma.TransactionClient
) {
  const db = dbOf(tx);

  const requestedAt = opts.requestedAt ?? new Date();
  return db.team.update({
    where: { id: opts.teamId },
    data: {
      cancelRequestedAt: requestedAt,
    },
  });
}

/**
 * ✅ 해지요청 취소 + 정기결제 재개
 * - cancelRequestedAt만 null
 * - nextBillingAt이 비어있으면 planExpiresAt에서 복구
 * - ✅ tx 지원 (중요: 내부에서 $transaction을 돌리지 않게 구조 변경)
 */
export async function resumeAutoBilling(
  teamId: string,
  tx?: Prisma.TransactionClient
) {
  const db = dbOf(tx);

  const team = await db.team.findUnique({
    where: { id: teamId },
    select: {
      planExpiresAt: true,
      nextBillingAt: true,
      cancelRequestedAt: true,
    },
  });

  if (!team) throw new Error("TEAM_NOT_FOUND");

  const expiresAtExclusive = team.planExpiresAt ?? null;
  const shouldRestoreNextBillingAt =
    !team.nextBillingAt && !!expiresAtExclusive;

  const nextBillingAt =
    shouldRestoreNextBillingAt && expiresAtExclusive
      ? nextChargeAtFromExpiresAtExclusive(expiresAtExclusive)
      : null;

  return db.team.update({
    where: { id: teamId },
    data: {
      cancelRequestedAt: null,
      ...(nextBillingAt ? { nextBillingAt } : {}),
    },
  });
}
