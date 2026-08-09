import { NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { RerunDebugCaseSchema, rerunDebugCase } from "@/lib/services/press-ai-debugger/caseService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; const headers = { "Cache-Control": "no-store" };
export async function POST(req: Request, context: { params: Promise<{ caseId: string }> }) { try { const { team, user } = await requireTeamContext(); const { caseId } = await context.params; const body = validateBody(RerunDebugCaseSchema, await req.json()); if (!body.ok) return NextResponse.json(body.body, { status: body.status, headers }); return NextResponse.json(await rerunDebugCase({ teamId: team.id, userId: user.id, caseId, input: body.data }), { status: 201, headers }); } catch (error: any) { const status = error?.status ?? 500; return NextResponse.json(apiError(error?.code ?? error?.message ?? "PRESS_AI_DEBUG_CASE_RERUN_FAILED", error?.message ?? "Failed", status).body, { status, headers }); } }
