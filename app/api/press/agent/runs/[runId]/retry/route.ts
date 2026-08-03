import { NextRequest, NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import { retryPressAgentRun } from "@/lib/services/press-agent/pressAgentRuntime";
import { apiError } from "@/lib/utils/api";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const { team, user } = await requireTeamContext();
    const { runId } = await context.params;
    const runRecord = await retryPressAgentRun({
      runId,
      teamId: team.id,
      userId: user.id,
    });
    return NextResponse.json({ ok: true, run: runRecord });
  } catch (error: any) {
    const status =
      error?.message === "PRESS_AGENT_RUN_NOT_RETRYABLE" ||
      error?.message === "PRESS_AGENT_RUN_RETRY_CONFLICT" ||
      error?.message === "PRESS_AGENT_CHECKPOINT_MISSING" ||
      error?.message === "PRESS_AGENT_CHECKPOINT_INVALID"
        ? 409
        : error?.message === "PRESS_AGENT_RUN_NOT_FOUND"
          ? 404
          : error?.status ?? 500;
    return NextResponse.json(
      apiError(
        error?.code ?? "PRESS_AGENT_RETRY_FAILED",
        error?.message ?? "Failed to retry Press Agent run",
        status,
      ).body,
      { status },
    );
  }
}
