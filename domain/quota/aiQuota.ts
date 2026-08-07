import { MembershipStatus, PlanType, Prisma, UsageAction } from "@prisma/client";
import {
  BILLING_PLANS,
  getPlan,
  isPlanId,
  type AiQuotaSurface,
  type AiQuotaWindowPolicy,
  type BillingPlan,
  type PlanId,
} from "@/config/billing/plans";
import { prisma } from "@/lib/prisma";
import { AiPanelRateLimitError, QuotaLimitError } from "@/domain/quota/errors";
import {
  getEffectiveProductSubscription,
  productForSurface,
} from "@/domain/billing/productSubscription";
import { readQaAuthConfig } from "@/lib/services/qaAuthService";

export type AiQuotaAction =
  | "press_panel_chat"
  | "press_brief_normalize"
  | "press_review"
  | "press_rewrite"
  | "press_draft_generate"
  | "resume_chat"
  | "resume_polish"
  | "resume_brick_extract"
  | "resume_strategy"
  | "resume_repolish"
  | "resume_generate"
  | "resume_parse";

export function isAiPanelAction(action: AiQuotaAction): action is "press_panel_chat" | "resume_chat" {
  return action === "press_panel_chat" || action === "resume_chat";
}

type AiQuotaActionDefinition = {
  surface: AiQuotaSurface;
  units: number;
  usageAction: UsageAction;
  label: string;
};

type AiQuotaOverrideKind = "WINDOW_LIMIT" | "ACTION_UNITS";

export const AI_QUOTA_ACTIONS: Record<AiQuotaAction, AiQuotaActionDefinition> = {
  press_panel_chat: {
    surface: "PRESS",
    units: 1,
    usageAction: UsageAction.CHAT,
    label: "Press AI panel",
  },
  press_brief_normalize: {
    surface: "PRESS",
    units: 2,
    usageAction: UsageAction.GENERATE_ARTICLE,
    label: "Press brief",
  },
  press_review: {
    surface: "PRESS",
    units: 3,
    usageAction: UsageAction.REFINE_ARTICLE,
    label: "Press review",
  },
  press_rewrite: {
    surface: "PRESS",
    units: 4,
    usageAction: UsageAction.REFINE_ARTICLE,
    label: "Press rewrite",
  },
  press_draft_generate: {
    surface: "PRESS",
    units: 5,
    usageAction: UsageAction.GENERATE_ARTICLE,
    label: "Press draft",
  },
  resume_chat: {
    surface: "RESUME",
    units: 1,
    usageAction: UsageAction.CHAT,
    label: "Resume chat",
  },
  resume_polish: {
    surface: "RESUME",
    units: 2,
    usageAction: UsageAction.POLISH_COVER_LETTER,
    label: "Resume polish",
  },
  resume_brick_extract: {
    surface: "RESUME",
    units: 3,
    usageAction: UsageAction.PARSE_RESUME,
    label: "Resume brick extraction",
  },
  resume_strategy: {
    surface: "RESUME",
    units: 3,
    usageAction: UsageAction.CHAT,
    label: "Resume strategy",
  },
  resume_repolish: {
    surface: "RESUME",
    units: 3,
    usageAction: UsageAction.POLISH_COVER_LETTER,
    label: "Resume rewrite",
  },
  resume_generate: {
    surface: "RESUME",
    units: 4,
    usageAction: UsageAction.GENERATE_COVER_LETTER,
    label: "Resume draft",
  },
  resume_parse: {
    surface: "RESUME",
    units: 5,
    usageAction: UsageAction.PARSE_RESUME,
    label: "Resume parse",
  },
};

type TeamQuotaPlanSnapshot = {
  id: string;
  plan: PlanType;
  planId: string | null;
  membershipStatus: MembershipStatus;
  planExpiresAt: Date | null;
};

type UsageEvent = {
  cost: number;
  createdAt: Date;
};

type QuotaClient = Pick<
  Prisma.TransactionClient,
  "team" | "teamProductSubscription" | "usageLog" | "aiQuotaOverride" | "$queryRaw"
>;

export type AiQuotaWindowState = {
  key: string;
  label: string;
  durationMs: number;
  limitUnits: number;
  usedUnits: number;
  remainingUnits: number;
  resetAt: string;
  resetInMs: number;
  limited: boolean;
};

export type AiQuotaState = {
  mode: "rolling_ai";
  surface: AiQuotaSurface;
  unlimited: boolean;
  status: "available" | "near_limit" | "limited";
  planId: string | null;
  planName: string;
  requestedUnits: number;
  limitUnits: number;
  usedUnits: number;
  remainingUnits: number;
  periodEnd: string;
  resetInMs: number;
  resetLabel: string;
  upgradeHref: string;
  message: string | null;
  windows: AiQuotaWindowState[];
};

const FREE_FALLBACK = BILLING_PLANS.free_v1;

function resolvePlan(team: Pick<TeamQuotaPlanSnapshot, "plan" | "planId">): BillingPlan {
  if (team.planId && isPlanId(team.planId)) {
    return getPlan(team.planId as PlanId);
  }
  return (
    Object.values(BILLING_PLANS).find((plan) => plan.planType === team.plan) ??
    FREE_FALLBACK
  );
}

export function getAiPanelPolicyForPlan(
  plan: Pick<BillingPlan, "aiPanel">,
): BillingPlan["aiPanel"] {
  return { ...plan.aiPanel };
}

function isSubscriptionUsable(team: TeamQuotaPlanSnapshot, now: Date) {
  if (team.plan === "FREE") return true;
  if (team.membershipStatus === "EXPIRED") return false;
  if (team.planExpiresAt && now.getTime() >= team.planExpiresAt.getTime()) {
    return false;
  }
  return true;
}

function formatResetLabel(resetInMs: number) {
  if (resetInMs <= 0) return "곧 초기화됩니다";

  const totalMinutes = Math.ceil(resetInMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`;
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  return `${Math.max(minutes, 1)}분`;
}

function modelPrefix(surface: AiQuotaSurface) {
  return `quota:${surface}:`;
}

function modelForAction(action: AiQuotaAction) {
  const def = AI_QUOTA_ACTIONS[action];
  return `quota:${def.surface}:${action}`;
}

async function readPanelEvents(args: {
  client: QuotaClient;
  teamId: string;
  userId: string;
  action: "press_panel_chat" | "resume_chat";
  now: Date;
  policy: BillingPlan["aiPanel"];
}) {
  const since = new Date(
    args.now.getTime() -
      Math.max(args.policy.burstDurationMs, args.policy.dailyDurationMs),
  );
  return args.client.usageLog.findMany({
    where: {
      teamId: args.teamId,
      userId: args.userId,
      action: UsageAction.CHAT,
      createdAt: { gte: since },
      OR: [
        {
          model:
            args.action === "press_panel_chat"
              ? "quota:PRESS:press_panel_chat"
              : "quota:RESUME:resume_chat",
        },
        {
          model: {
            startsWith:
              args.action === "press_panel_chat" ? "panel:press:" : "panel:resume:",
          },
        },
      ],
    },
    select: { createdAt: true },
  });
}

async function assertAiPanelAvailable(args: {
  client: QuotaClient;
  teamId: string;
  userId: string | null | undefined;
  action: AiQuotaAction;
  now: Date;
  policy: BillingPlan["aiPanel"];
}) {
  if (!isAiPanelAction(args.action) || !args.userId) return;

  const events = await readPanelEvents({
    client: args.client,
    teamId: args.teamId,
    userId: args.userId,
    action: args.action,
    now: args.now,
    policy: args.policy,
  });
  const burstSince = args.now.getTime() - args.policy.burstDurationMs;
  const dailySince = args.now.getTime() - args.policy.dailyDurationMs;
  const burstCount = events.filter(
    (event) => event.createdAt.getTime() >= burstSince,
  ).length;
  const dailyCount = events.filter(
    (event) => event.createdAt.getTime() >= dailySince,
  ).length;

  if (
    burstCount >= args.policy.burstLimit ||
    dailyCount >= args.policy.dailyLimit
  ) {
    throw new AiPanelRateLimitError();
  }
}

async function isPinnedQaQuotaExemptTeam(
  client: QuotaClient,
  teamId: string,
) {
  const config = readQaAuthConfig();
  if (!config) return false;

  const team = await client.team.findFirst({
    where: {
      id: teamId,
      slug: config.teamSlug,
      membershipStatus: "ACTIVE",
      members: {
        some: {
          role: { in: ["OWNER", "ADMIN"] },
          user: {
            loginId: config.loginId,
            isActive: true,
            deleteScheduledAt: null,
          },
        },
      },
    },
    select: { id: true },
  });
  return Boolean(team);
}

type AiQuotaOverrideClient = Pick<Prisma.TransactionClient, "aiQuotaOverride">;

const AI_QUOTA_SURFACES: AiQuotaSurface[] = ["PRESS", "RESUME"];
const WINDOW_OVERRIDE_KIND: AiQuotaOverrideKind = "WINDOW_LIMIT";
const ACTION_OVERRIDE_KIND: AiQuotaOverrideKind = "ACTION_UNITS";

function isMissingOverrideTableError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

function windowOverrideKey(args: {
  planId: string;
  surface: AiQuotaSurface;
  windowKey: string;
}) {
  return `window:${args.planId}:${args.surface}:${args.windowKey}`;
}

function actionOverrideKey(action: AiQuotaAction) {
  return `action:${action}`;
}

function isAiQuotaSurface(value: unknown): value is AiQuotaSurface {
  return value === "PRESS" || value === "RESUME";
}

function isAiQuotaAction(value: unknown): value is AiQuotaAction {
  return typeof value === "string" && value in AI_QUOTA_ACTIONS;
}

function cloneAiQuotaPolicy(policy: BillingPlan["aiQuota"]): BillingPlan["aiQuota"] {
  return {
    PRESS: {
      windows: policy.PRESS.windows.map((window) => ({ ...window })),
      unlimited: policy.PRESS.unlimited,
    },
    RESUME: {
      windows: policy.RESUME.windows.map((window) => ({ ...window })),
      unlimited: policy.RESUME.unlimited,
    },
  };
}

async function readQuotaOverrides(
  client: AiQuotaOverrideClient,
  where: Prisma.AiQuotaOverrideWhereInput,
) {
  try {
    return await client.aiQuotaOverride.findMany({ where });
  } catch (error) {
    if (isMissingOverrideTableError(error)) return [];
    throw error;
  }
}

async function readQuotaOverrideByKey(
  client: AiQuotaOverrideClient,
  key: string,
) {
  try {
    return await client.aiQuotaOverride.findUnique({ where: { key } });
  } catch (error) {
    if (isMissingOverrideTableError(error)) return null;
    throw error;
  }
}

async function resolveAiQuotaPolicyForPlan(
  plan: BillingPlan,
  client: AiQuotaOverrideClient = prisma,
): Promise<BillingPlan["aiQuota"]> {
  const policy = cloneAiQuotaPolicy(plan.aiQuota);
  const overrides = await readQuotaOverrides(client, {
    kind: WINDOW_OVERRIDE_KIND,
    planId: plan.id,
    enabled: true,
  });

  for (const override of overrides) {
    if (!isAiQuotaSurface(override.surface)) continue;
    if (!override.windowKey || typeof override.limitUnits !== "number") continue;
    const window = policy[override.surface].windows.find(
      (item) => item.key === override.windowKey,
    );
    if (!window || override.limitUnits < 0) continue;
    window.limitUnits = override.limitUnits;
    policy[override.surface].unlimited = false;
  }

  return policy;
}

async function resolveAiQuotaActionDefinition(
  action: AiQuotaAction,
  client: AiQuotaOverrideClient = prisma,
): Promise<AiQuotaActionDefinition> {
  const def = AI_QUOTA_ACTIONS[action];
  const override = await readQuotaOverrideByKey(client, actionOverrideKey(action));
  if (
    override?.enabled === true &&
    override.kind === ACTION_OVERRIDE_KIND &&
    typeof override.actionUnits === "number" &&
    override.actionUnits > 0
  ) {
    return { ...def, units: override.actionUnits };
  }
  return def;
}

export type AiQuotaAdminWindowRow = {
  planId: string;
  planName: string;
  planCategory: BillingPlan["category"];
  surface: AiQuotaSurface;
  windowKey: string;
  label: string;
  durationMs: number;
  defaultLimitUnits: number;
  limitUnits: number;
  overrideLimitUnits: number | null;
  updatedAt: string | null;
};

export type AiQuotaAdminActionRow = {
  action: AiQuotaAction;
  label: string;
  surface: AiQuotaSurface;
  defaultUnits: number;
  units: number;
  overrideUnits: number | null;
  updatedAt: string | null;
};

export type AiQuotaAdminConfig = {
  windows: AiQuotaAdminWindowRow[];
  actions: AiQuotaAdminActionRow[];
};

export async function getAiQuotaAdminConfig(
  client: AiQuotaOverrideClient = prisma,
): Promise<AiQuotaAdminConfig> {
  const overrides = await readQuotaOverrides(client, { enabled: true });
  const byKey = new Map(overrides.map((override) => [override.key, override]));

  const windows: AiQuotaAdminWindowRow[] = [];
  for (const plan of Object.values(BILLING_PLANS)) {
    for (const surface of AI_QUOTA_SURFACES) {
      for (const window of plan.aiQuota[surface].windows) {
        const override = byKey.get(
          windowOverrideKey({ planId: plan.id, surface, windowKey: window.key }),
        );
        const overrideLimitUnits =
          override?.kind === WINDOW_OVERRIDE_KIND &&
          typeof override.limitUnits === "number"
            ? override.limitUnits
            : null;
        windows.push({
          planId: plan.id,
          planName: plan.name,
          planCategory: plan.category,
          surface,
          windowKey: window.key,
          label: window.label,
          durationMs: window.durationMs,
          defaultLimitUnits: window.limitUnits,
          limitUnits: overrideLimitUnits ?? window.limitUnits,
          overrideLimitUnits,
          updatedAt: override?.updatedAt?.toISOString() ?? null,
        });
      }
    }
  }

  const actions: AiQuotaAdminActionRow[] = Object.entries(AI_QUOTA_ACTIONS).map(
    ([action, def]) => {
      const key = actionOverrideKey(action as AiQuotaAction);
      const override = byKey.get(key);
      const overrideUnits =
        override?.kind === ACTION_OVERRIDE_KIND &&
        typeof override.actionUnits === "number"
          ? override.actionUnits
          : null;
      return {
        action: action as AiQuotaAction,
        label: def.label,
        surface: def.surface,
        defaultUnits: def.units,
        units: overrideUnits ?? def.units,
        overrideUnits,
        updatedAt: override?.updatedAt?.toISOString() ?? null,
      };
    },
  );

  return { windows, actions };
}

function positiveIntegerOrNull(value: unknown) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    const error = new Error("INVALID_QUOTA_UNITS") as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  return n;
}

export async function updateAiQuotaAdminConfig(input: {
  windows?: Array<{
    planId: string;
    surface: AiQuotaSurface;
    windowKey: string;
    limitUnits: number | null;
  }>;
  actions?: Array<{
    action: AiQuotaAction;
    units: number | null;
  }>;
  updatedByUserId?: string | null;
}): Promise<AiQuotaAdminConfig> {
  return prisma.$transaction(async (tx) => {
    for (const item of input.windows ?? []) {
      if (!isPlanId(item.planId) || !isAiQuotaSurface(item.surface)) {
        const error = new Error("INVALID_QUOTA_WINDOW") as Error & { status?: number };
        error.status = 400;
        throw error;
      }
      const plan = getPlan(item.planId as PlanId);
      const window = plan.aiQuota[item.surface].windows.find(
        (candidate) => candidate.key === item.windowKey,
      );
      if (!window) {
        const error = new Error("INVALID_QUOTA_WINDOW") as Error & { status?: number };
        error.status = 400;
        throw error;
      }

      const limitUnits = positiveIntegerOrNull(item.limitUnits);
      const key = windowOverrideKey({
        planId: plan.id,
        surface: item.surface,
        windowKey: window.key,
      });

      if (limitUnits === null) {
        await tx.aiQuotaOverride.deleteMany({ where: { key } });
        continue;
      }

      await tx.aiQuotaOverride.upsert({
        where: { key },
        create: {
          key,
          kind: WINDOW_OVERRIDE_KIND,
          planId: plan.id,
          surface: item.surface,
          windowKey: window.key,
          limitUnits,
          updatedByUserId: input.updatedByUserId ?? null,
        },
        update: {
          enabled: true,
          limitUnits,
          updatedByUserId: input.updatedByUserId ?? null,
        },
      });
    }

    for (const item of input.actions ?? []) {
      if (!isAiQuotaAction(item.action)) {
        const error = new Error("INVALID_QUOTA_ACTION") as Error & { status?: number };
        error.status = 400;
        throw error;
      }
      const units = positiveIntegerOrNull(item.units);
      const def = AI_QUOTA_ACTIONS[item.action];
      const key = actionOverrideKey(item.action);

      if (units === null) {
        await tx.aiQuotaOverride.deleteMany({ where: { key } });
        continue;
      }
      if (units <= 0) {
        const error = new Error("INVALID_QUOTA_ACTION_UNITS") as Error & {
          status?: number;
        };
        error.status = 400;
        throw error;
      }

      await tx.aiQuotaOverride.upsert({
        where: { key },
        create: {
          key,
          kind: ACTION_OVERRIDE_KIND,
          surface: def.surface,
          action: item.action,
          actionUnits: units,
          updatedByUserId: input.updatedByUserId ?? null,
        },
        update: {
          enabled: true,
          actionUnits: units,
          updatedByUserId: input.updatedByUserId ?? null,
        },
      });
    }

    return getAiQuotaAdminConfig(tx);
  });
}

async function lockTeamQuotaRow(client: QuotaClient, teamId: string) {
  await client.$queryRaw`SELECT id FROM "team" WHERE id = ${teamId} FOR UPDATE`;
}

function upgradeHref(surface: AiQuotaSurface) {
  return surface === "RESUME" ? "/resume/pricing?tab=CAREER" : "/press/pricing";
}

function findRefillAt(args: {
  events: UsageEvent[];
  window: AiQuotaWindowPolicy;
  now: Date;
  requiredFreeUnits: number;
}) {
  const startMs = args.now.getTime() - args.window.durationMs;
  const included = args.events.filter((event) => event.createdAt.getTime() >= startMs);
  if (included.length === 0) {
    return new Date(args.now.getTime() + args.window.durationMs);
  }

  let remainingRequired = Math.max(args.requiredFreeUnits, 1);
  for (const event of included) {
    remainingRequired -= Math.max(event.cost, 0);
    if (remainingRequired <= 0) {
      return new Date(event.createdAt.getTime() + args.window.durationMs);
    }
  }

  return new Date(included[0].createdAt.getTime() + args.window.durationMs);
}

function buildWindowState(args: {
  events: UsageEvent[];
  window: AiQuotaWindowPolicy;
  now: Date;
  requestedUnits: number;
}): AiQuotaWindowState {
  const startMs = args.now.getTime() - args.window.durationMs;
  const usedUnits = args.events
    .filter((event) => event.createdAt.getTime() >= startMs)
    .reduce((sum, event) => sum + Math.max(event.cost, 0), 0);
  const remainingUnits = Math.max(args.window.limitUnits - usedUnits, 0);
  const requiredFreeUnits = Math.max(usedUnits + args.requestedUnits - args.window.limitUnits, 1);
  const resetAt = findRefillAt({
    events: args.events,
    window: args.window,
    now: args.now,
    requiredFreeUnits,
  });
  const resetInMs = Math.max(resetAt.getTime() - args.now.getTime(), 0);

  return {
    key: args.window.key,
    label: args.window.label,
    durationMs: args.window.durationMs,
    limitUnits: args.window.limitUnits,
    usedUnits,
    remainingUnits,
    resetAt: resetAt.toISOString(),
    resetInMs,
    limited: usedUnits + args.requestedUnits > args.window.limitUnits,
  };
}

function buildQuotaState(args: {
  team: TeamQuotaPlanSnapshot;
  plan: BillingPlan;
  aiQuota: BillingPlan["aiQuota"];
  events: UsageEvent[];
  surface: AiQuotaSurface;
  requestedUnits: number;
  now: Date;
  forceUnlimited?: boolean;
}): AiQuotaState {
  const surfacePolicy = args.aiQuota[args.surface];
  const unlimited =
    args.forceUnlimited === true || surfacePolicy.unlimited === true;
  const windows = surfacePolicy.windows.map((window) =>
    buildWindowState({
      events: args.events,
      window,
      now: args.now,
      requestedUnits: args.requestedUnits,
    }),
  );
  if (unlimited) {
    for (const window of windows) window.limited = false;
  }
  const limitedWindows = windows.filter((window) => window.limited);
  const effectiveWindow = windows.reduce((best, window) => {
    if (!best) return window;
    const bestRatio = best.limitUnits > 0 ? best.remainingUnits / best.limitUnits : 0;
    const nextRatio = window.limitUnits > 0 ? window.remainingUnits / window.limitUnits : 0;
    return nextRatio < bestRatio ? window : best;
  }, windows[0] as AiQuotaWindowState | undefined);
  const refillWindow = [...(limitedWindows.length > 0 ? limitedWindows : windows)].sort(
    (a, b) => a.resetInMs - b.resetInMs,
  )[0];
  const remainingUnits = Math.min(...windows.map((window) => window.remainingUnits));
  const limitUnits = effectiveWindow?.limitUnits ?? 0;
  const usedUnits = effectiveWindow?.usedUnits ?? 0;
  const nearThreshold = Math.max(args.requestedUnits, Math.ceil(limitUnits * 0.1));
  const status =
    unlimited
      ? "available"
      : limitedWindows.length > 0
      ? "limited"
      : remainingUnits <= nearThreshold
        ? "near_limit"
        : "available";
  const resetLabel = formatResetLabel(refillWindow?.resetInMs ?? 0);
  const message =
    status === "limited"
      ? `AI 사용 한도에 도달했습니다. ${resetLabel} 후 다시 사용할 수 있습니다.`
      : status === "near_limit"
        ? "AI 사용량이 얼마 남지 않았습니다. 계속 사용하려면 업그레이드를 검토하세요."
        : null;

  return {
    mode: "rolling_ai",
    surface: args.surface,
    unlimited,
    status,
    planId: args.team.planId,
    planName: args.plan.name,
    requestedUnits: args.requestedUnits,
    limitUnits,
    usedUnits,
    remainingUnits,
    periodEnd: refillWindow?.resetAt ?? new Date(args.now.getTime()).toISOString(),
    resetInMs: refillWindow?.resetInMs ?? 0,
    resetLabel,
    upgradeHref: upgradeHref(args.surface),
    message,
    windows,
  };
}

export function getAiQuotaActionDefinition(action: AiQuotaAction) {
  return AI_QUOTA_ACTIONS[action];
}

export async function getAiQuotaStateForSurface(params: {
  teamId: string;
  surface: AiQuotaSurface;
  requestedUnits?: number;
  now?: Date;
  client?: QuotaClient;
}): Promise<AiQuotaState> {
  const client = params.client ?? prisma;
  const now = params.now ?? new Date();
  const requestedUnits = Math.max(params.requestedUnits ?? 1, 1);
  const subscription = await getEffectiveProductSubscription(
    params.teamId,
    productForSurface(params.surface),
    client,
  );
  const team: TeamQuotaPlanSnapshot = {
    id: subscription.teamId,
    plan: subscription.plan,
    planId: subscription.planId,
    membershipStatus: subscription.membershipStatus,
    planExpiresAt: subscription.planExpiresAt,
  };

  const active = isSubscriptionUsable(team, now);
  const plan = active ? resolvePlan(team) : FREE_FALLBACK;
  const [aiQuota, qaQuotaExempt] = await Promise.all([
    resolveAiQuotaPolicyForPlan(plan, client),
    isPinnedQaQuotaExemptTeam(client, params.teamId),
  ]);
  const windows = aiQuota[params.surface].windows;
  const maxDurationMs = Math.max(...windows.map((window) => window.durationMs));
  const events = await client.usageLog.findMany({
    where: {
      teamId: params.teamId,
      model: { startsWith: modelPrefix(params.surface) },
      createdAt: { gte: new Date(now.getTime() - maxDurationMs) },
    },
    orderBy: { createdAt: "asc" },
    select: { cost: true, createdAt: true },
  });

  return buildQuotaState({
    team,
    plan,
    aiQuota,
    events,
    surface: params.surface,
    requestedUnits,
    now,
    forceUnlimited: qaQuotaExempt,
  });
}

export async function assertAiQuotaAvailable(params: {
  teamId: string;
  action: AiQuotaAction;
  units?: number;
  now?: Date;
  client?: QuotaClient;
}) {
  const def = await resolveAiQuotaActionDefinition(
    params.action,
    params.client ?? prisma,
  );
  const requestedUnits = Math.max(params.units ?? def.units, 1);
  const quota = await getAiQuotaStateForSurface({
    teamId: params.teamId,
    surface: def.surface,
    requestedUnits,
    now: params.now,
    client: params.client,
  });

  if (quota.status === "limited") {
    throw new QuotaLimitError(
      quota.message ??
        `AI 사용 한도에 도달했습니다. ${quota.resetLabel} 후 다시 사용할 수 있습니다.`,
      { quota },
    );
  }

  return quota;
}

export async function consumeAiQuota(params: {
  teamId: string;
  userId?: string | null;
  action: AiQuotaAction;
  units?: number;
  targetId?: string | null;
  model?: string | null;
  meta?: Record<string, unknown>;
  now?: Date;
  client?: QuotaClient;
}): Promise<AiQuotaState> {
  if (!params.client) {
    return prisma.$transaction((tx) =>
      consumeAiQuota({
        ...params,
        client: tx,
      }),
    );
  }

  const client = params.client ?? prisma;
  const def = await resolveAiQuotaActionDefinition(params.action, client);
  const units = Math.max(params.units ?? def.units, 1);
  const now = params.now ?? new Date();
  await lockTeamQuotaRow(client, params.teamId);

  const before = await assertAiQuotaAvailable({
    teamId: params.teamId,
    action: params.action,
    units,
    now,
    client,
  });

  if (isAiPanelAction(params.action)) {
    const subscription = await getEffectiveProductSubscription(
      params.teamId,
      productForSurface(def.surface),
      client,
    );
    const team: TeamQuotaPlanSnapshot = {
      id: subscription.teamId,
      plan: subscription.plan,
      planId: subscription.planId,
      membershipStatus: subscription.membershipStatus,
      planExpiresAt: subscription.planExpiresAt,
    };
    const plan = isSubscriptionUsable(team, now) ? resolvePlan(team) : FREE_FALLBACK;
    const qaQuotaExempt = await isPinnedQaQuotaExemptTeam(client, params.teamId);
    if (!qaQuotaExempt) {
      await assertAiPanelAvailable({
        client,
        teamId: params.teamId,
        userId: params.userId,
        action: params.action,
        now,
        policy: getAiPanelPolicyForPlan(plan),
      });
    }
  }

  await client.usageLog.create({
    data: {
      teamId: params.teamId,
      userId: params.userId ?? undefined,
      action: def.usageAction,
      model: params.model?.trim() || modelForAction(params.action),
      cost: units,
      targetId: params.targetId ?? undefined,
      meta: {
        ...(params.meta ?? {}),
        quota: {
          version: 1,
          mode: "rolling_ai",
          surface: def.surface,
          action: params.action,
          units,
        },
      } as Prisma.InputJsonValue,
    },
  });

  return getAiQuotaStateForSurface({
    teamId: params.teamId,
    surface: def.surface,
    requestedUnits: units,
    now,
    client,
  }).catch(() => before);
}
