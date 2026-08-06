import { NextRequest, NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import { isPressAgentWorkflowStageId } from "@/lib/services/press-agent/pressAgentRagDebuggerDetailService";
import { getPressAiProcessDetail } from "@/lib/services/press-ai-debugger/processDetailService";
import { apiError } from "@/lib/utils/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const { team, user } = await requireTeamContext();
    const stageId = req.nextUrl.searchParams.get("stageId");
    if (!stageId || !isPressAgentWorkflowStageId(stageId)) {
      return NextResponse.json(apiError("PRESS_AGENT_DEBUG_STAGE_INVALID", "Invalid stageId", 400).body, { status: 400, headers: NO_STORE });
    }
    const { runId } = await context.params;
    const detail = await getPressAiProcessDetail({ teamId: team.id, userId: user.id, runId, nodeId: stageId });
    return NextResponse.json(detail, { headers: NO_STORE });
  } catch (error: any) {
    const status = error?.status ?? 500;
    return NextResponse.json(apiError(error?.code ?? "PRESS_AGENT_DEBUG_DETAIL_FAILED", error?.message ?? "Failed to load debugger detail", status).body, { status, headers: NO_STORE });
  }
}
