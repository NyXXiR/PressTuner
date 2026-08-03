import { ArticleUsageType, Prisma } from "@prisma/client";

import {
  consumeAiQuota,
  getAiQuotaActionDefinition,
  getAiQuotaStateForSurface,
  type AiQuotaAction,
  type AiQuotaState,
} from "@/domain/quota/aiQuota";
import { QuotaLimitError } from "@/domain/quota/errors";

export type SimplifiedPressQuotaAction =
  | "brief_normalize"
  | "draft_generate"
  | "review"
  | "rewrite";

export type SimplifiedPressQuotaState = {
  mode: "simplified_press";
  unlimited: boolean;
  status: "available" | "near_limit" | "limited";
  planName: string;
  remaining: number;
  limit: number;
  used: number;
  periodEnd: string;
  resetInMs: number;
  resetLabel: string;
  upgradeHref: string;
  message: string | null;
};

export class SimplifiedPressQuotaLimitError extends Error {
  status = 403;
  code = "SIMPLIFIED_PRESS_QUOTA_LIMIT" as const;
  quota: SimplifiedPressQuotaState;

  constructor(quota: SimplifiedPressQuotaState) {
    super(
      quota.message ??
        `사용 한도에 도달했습니다. ${quota.resetLabel} 후 다시 사용할 수 있습니다.`,
    );
    this.name = "SimplifiedPressQuotaLimitError";
    this.quota = quota;
  }
}

const ACTION_MAP: Record<SimplifiedPressQuotaAction, AiQuotaAction> = {
  brief_normalize: "press_brief_normalize",
  draft_generate: "press_draft_generate",
  review: "press_review",
  rewrite: "press_rewrite",
};

function toSimplifiedState(quota: AiQuotaState): SimplifiedPressQuotaState {
  return {
    mode: "simplified_press",
    unlimited: quota.unlimited,
    status: quota.status,
    planName: quota.planName,
    remaining: quota.remainingUnits,
    limit: quota.limitUnits,
    used: quota.usedUnits,
    periodEnd: quota.periodEnd,
    resetInMs: quota.resetInMs,
    resetLabel: quota.resetLabel,
    upgradeHref: quota.upgradeHref,
    message: quota.message,
  };
}

export async function getSimplifiedPressQuotaState(
  teamId: string,
): Promise<SimplifiedPressQuotaState> {
  const quota = await getAiQuotaStateForSurface({
    teamId,
    surface: "PRESS",
  });
  return toSimplifiedState(quota);
}

export async function consumeSimplifiedPressQuota(
  tx: Prisma.TransactionClient,
  params: {
    teamId: string;
    userId: string;
    articleId: string;
    action: SimplifiedPressQuotaAction;
    amount?: number;
    eventType?: ArticleUsageType;
    meta?: Record<string, unknown>;
  },
): Promise<SimplifiedPressQuotaState> {
  const action = ACTION_MAP[params.action];
  const multiplier = Math.max(params.amount ?? 1, 1);
  const units = getAiQuotaActionDefinition(action).units * multiplier;

  try {
    const quota = await consumeAiQuota({
      client: tx,
      teamId: params.teamId,
      userId: params.userId,
      targetId: params.articleId,
      action,
      units,
      meta: {
        ...(params.meta ?? {}),
        quotaMode: "simplified_press",
        simplifiedAction: params.action,
        multiplier,
      },
    });

    await tx.articleUsageEvent.create({
      data: {
        articleId: params.articleId,
        teamId: params.teamId,
        userId: params.userId,
        type: params.eventType ?? ArticleUsageType.POLISH,
        meta: {
          ...(params.meta ?? {}),
          quotaMode: "simplified_press",
          action: params.action,
          units,
          periodEnd: quota.periodEnd,
        } as Prisma.InputJsonValue,
      },
    });

    return toSimplifiedState(quota);
  } catch (error) {
    if (error instanceof QuotaLimitError) {
      const quota = (error.details as { quota?: AiQuotaState } | undefined)?.quota;
      if (quota) {
        throw new SimplifiedPressQuotaLimitError(toSimplifiedState(quota));
      }
    }
    throw error;
  }
}
