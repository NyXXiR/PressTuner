import { NextRequest, NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { getPressAiProcessDetail } from "@/lib/services/press-ai-debugger/processDetailService";
import { apiError } from "@/lib/utils/api";
const NO_STORE = { "Cache-Control": "no-store" };
export async function GET(req: NextRequest, context: { params: Promise<{ runId: string }> }) { try { const { team, user } = await requireTeamContext(); const { runId } = await context.params; const nodeId = req.nextUrl.searchParams.get("nodeId") ?? req.nextUrl.searchParams.get("stageId"); if (!nodeId) return NextResponse.json(apiError("PRESS_AI_PROCESS_NODE_INVALID", "nodeId is required", 400).body, { status: 400, headers: NO_STORE }); return NextResponse.json(await getPressAiProcessDetail({ teamId: team.id, userId: user.id, runId, nodeId }), { headers: NO_STORE }); } catch (error: any) { const status = error?.status ?? 500; return NextResponse.json(apiError(error?.code ?? "PRESS_AI_PROCESS_DETAIL_FAILED", error?.message ?? "Failed", status).body, { status, headers: NO_STORE }); } }

