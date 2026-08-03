import { NextResponse } from "next/server";

import { assertDevBillingSandboxEnabled } from "@/lib/devBillingSandbox";
import { isAdmin, requireTeamContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import {
  applyDevBillingSandboxAction,
  listDevBillingSandboxPlans,
  type DevBillingSandboxAction,
} from "@/lib/services/billing/devBillingSandboxService";
import { getSubscriptionStatusForTeamByProduct } from "@/lib/services/billing/subscriptionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set<DevBillingSandboxAction>([
  "mock-subscribe",
  "mock-renewal-success",
  "mock-renewal-failure",
  "mock-past-due",
  "mock-recover-past-due",
  "mock-schedule-change",
  "mock-unschedule-change",
  "mock-cancel",
  "mock-uncancel",
  "reset-free",
]);

function toAmountWon(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.max(0, Math.floor(numberValue));
}

function toStatus(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number"
    ? ((error as { status: number }).status)
    : 500;
}

export async function GET() {
  try {
    assertDevBillingSandboxEnabled();
    const { team, role } = await requireTeamContext();
    if (!team?.id || !isAdmin(role)) {
      const err = apiError("FORBIDDEN", "FORBIDDEN", 403);
      return NextResponse.json(err.body, { status: err.status });
    }

    const current = await getSubscriptionStatusForTeamByProduct(
      team.id,
      "PRESS",
    );
    return NextResponse.json({
      ok: true,
      team: current,
      plans: listDevBillingSandboxPlans(),
    });
  } catch (error: any) {
    const status = toStatus(error);
    if (status === 404) {
      const err = apiError("NOT_FOUND", "Not found", 404);
      return NextResponse.json(err.body, { status: err.status });
    }
    if (status === 401) {
      const err = apiError("UNAUTHORIZED", "UNAUTHORIZED", 401);
      return NextResponse.json(err.body, { status: err.status });
    }
    const err = apiError(
      error?.code ?? "DEV_BILLING_SANDBOX_ERROR",
      error?.message ?? "DEV_BILLING_SANDBOX_ERROR",
      status,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function POST(req: Request) {
  try {
    assertDevBillingSandboxEnabled();
    const { team, role, user } = await requireTeamContext();
    if (!team?.id || !isAdmin(role)) {
      const err = apiError("FORBIDDEN", "FORBIDDEN", 403);
      return NextResponse.json(err.body, { status: err.status });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      planId?: unknown;
      amountWon?: unknown;
      payProvider?: unknown;
    };
    const action =
      typeof body.action === "string" && ACTIONS.has(body.action as any)
        ? (body.action as DevBillingSandboxAction)
        : null;

    if (!action) {
      const err = apiError("INVALID_SANDBOX_ACTION", "INVALID_SANDBOX_ACTION", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const result = await applyDevBillingSandboxAction({
      teamId: team.id,
      userId: user.id,
      action,
      planId: typeof body.planId === "string" ? body.planId : null,
      amountWon: toAmountWon(body.amountWon),
      payProvider:
        typeof body.payProvider === "string" ? body.payProvider : null,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    const status = toStatus(error);
    if (status === 404) {
      const err = apiError("NOT_FOUND", "Not found", 404);
      return NextResponse.json(err.body, { status: err.status });
    }
    if (status === 401) {
      const err = apiError("UNAUTHORIZED", "UNAUTHORIZED", 401);
      return NextResponse.json(err.body, { status: err.status });
    }
    const err = apiError(
      error?.code ?? "DEV_BILLING_SANDBOX_ERROR",
      error?.message ?? "DEV_BILLING_SANDBOX_ERROR",
      status,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
