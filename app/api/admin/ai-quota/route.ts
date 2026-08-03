import { NextResponse } from "next/server";

import {
  getAiQuotaAdminConfig,
  updateAiQuotaAdminConfig,
} from "@/domain/quota/aiQuota";
import { requireAdmin } from "@/lib/auth";
import { trackOpsEvent } from "@/lib/ops";
import { apiError } from "@/lib/utils/api";

export const runtime = "nodejs";

function nullableNumberInput(value: unknown) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  return Number(value);
}

export async function GET() {
  try {
    await requireAdmin();
    const config = await getAiQuotaAdminConfig();
    return NextResponse.json({ ok: true, ...config });
  } catch (error: any) {
    const status = typeof error?.status === "number" ? error.status : 500;
    const err = apiError(
      error?.code ?? "AI_QUOTA_CONFIG_FAILED",
      error?.message ?? "AI_QUOTA_CONFIG_FAILED",
      status,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function PATCH(req: Request) {
  try {
    const { user } = await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      windows?: unknown;
      actions?: unknown;
    };

    const windows = Array.isArray(body.windows) ? body.windows : [];
    const actions = Array.isArray(body.actions) ? body.actions : [];

    const config = await updateAiQuotaAdminConfig({
      windows: windows.map((item: any) => ({
        planId: String(item?.planId ?? ""),
        surface: item?.surface,
        windowKey: String(item?.windowKey ?? ""),
        limitUnits: nullableNumberInput(item?.limitUnits),
      })),
      actions: actions.map((item: any) => ({
        action: item?.action,
        units: nullableNumberInput(item?.units),
      })),
      updatedByUserId: user.id,
    });
    await trackOpsEvent({
      event: "security.admin_ai_quota_updated",
      userId: user.id,
      properties: { windowCount: windows.length, actionCount: actions.length },
    });

    return NextResponse.json({ ok: true, ...config });
  } catch (error: any) {
    const status = typeof error?.status === "number" ? error.status : 500;
    const err = apiError(
      error?.code ?? "AI_QUOTA_UPDATE_FAILED",
      error?.message ?? "AI_QUOTA_UPDATE_FAILED",
      status,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
