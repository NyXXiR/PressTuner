import { PlanType, UsageAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BILLING_PLANS, getPlan, isPlanId } from "@/config/billing/plans";
import { logUsage } from "@/lib/services/usageService";
import { consumeAiQuota } from "@/domain/quota/aiQuota";
import { PRESS_PRODUCT } from "@/domain/products/press/policy";
import { CAREER_PRODUCT } from "@/domain/products/career/policy";
import { getEffectiveProductSubscription } from "@/domain/billing/productSubscription";

const PANEL_MODEL_PREFIX = "panel:";
const PANEL_BURST_WINDOW_MS = 10 * 60 * 1000;
const PANEL_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

type PanelScope =
  | "press:guide"
  | "press:plan"
  | "resume:guide"
  | "resume:plan"
  | "resume:command"
  | "resume:ingest-bricks";

function resolvePanelLimits(team: { plan: PlanType; planId: string | null }) {
  const fallback = BILLING_PLANS["free_v1"];
  const plan =
    team.planId && isPlanId(team.planId) ? getPlan(team.planId) : fallback;

  switch (plan.planType) {
    case "ENTERPRISE":
      return { burstLimit: 100, dailyLimit: 2000 };
    case "PRO":
      return { burstLimit: 50, dailyLimit: 800 };
    case "BASIC":
      return { burstLimit: 25, dailyLimit: 250 };
    case "FREE":
    default:
      return { burstLimit: 10, dailyLimit: 80 };
  }
}

export async function assertAndLogAiPanelUsage(params: {
  teamId: string;
  userId: string;
  scope: PanelScope;
  meta?: Record<string, unknown>;
}) {
  const now = Date.now();
  const burstSince = new Date(now - PANEL_BURST_WINDOW_MS);
  const dailySince = new Date(now - PANEL_DAILY_WINDOW_MS);
  const product = params.scope.startsWith("press:") ? PRESS_PRODUCT : CAREER_PRODUCT;

  const [subscription, burstCount, dailyCount] = await Promise.all([
    getEffectiveProductSubscription(params.teamId, product),
    prisma.usageLog.count({
      where: {
        teamId: params.teamId,
        userId: params.userId,
        action: UsageAction.CHAT,
        model: {
          startsWith: PANEL_MODEL_PREFIX,
        },
        createdAt: {
          gte: burstSince,
        },
      },
    }),
    prisma.usageLog.count({
      where: {
        teamId: params.teamId,
        userId: params.userId,
        action: UsageAction.CHAT,
        model: {
          startsWith: PANEL_MODEL_PREFIX,
        },
        createdAt: {
          gte: dailySince,
        },
      },
    }),
  ]);

  const limits = resolvePanelLimits(subscription);

  if (burstCount >= limits.burstLimit || dailyCount >= limits.dailyLimit) {
    const error = new Error(
      "AI 패널이 잠시 제한되었습니다. 사용량이 많아 잠깐 쉬어가야 합니다. 잠시 후 다시 시도해 주세요.",
    ) as Error & { status?: number; code?: string };
    error.status = 429;
    error.code = "AI_PANEL_RATE_LIMITED";
    throw error;
  }

  await consumeAiQuota({
    teamId: params.teamId,
    userId: params.userId,
    action: params.scope.startsWith("press:") ? "press_panel_chat" : "resume_chat",
    meta: {
      scope: params.scope,
      ...(params.meta ?? {}),
    },
  });

  await logUsage({
    teamId: params.teamId,
    userId: params.userId,
    action: UsageAction.CHAT,
    model: `${PANEL_MODEL_PREFIX}${params.scope}`,
    cost: 0,
    meta: params.meta ?? {},
  });
}
