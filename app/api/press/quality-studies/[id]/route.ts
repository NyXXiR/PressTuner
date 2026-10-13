import type { NextRequest } from "next/server";
import { studyActor, studyBody, studyFailure, studyJson } from "@/lib/services/press-workflow/evaluation/studyHttp.server";
import { commandQualityStudy, readQualityStudy } from "@/lib/services/press-workflow/evaluation/studyService";
import { studyPorts, verifyStudyActor } from "@/lib/services/press-workflow/evaluation/studyRuntime.server";
export const runtime = "nodejs";
export const maxDuration = 360;
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try { const actor = await studyActor(), { id } = await context.params, view = request.nextUrl.searchParams.get("view"); return studyJson(await readQualityStudy(id, actor, studyPorts(), view === "dataset" ? "dataset" : view === "report")); } catch (e) { return studyFailure(e); }
}
export async function POST(request: NextRequest, context: Context) {
  try { const actor = await studyActor(), { id } = await context.params; const result = await commandQualityStudy(id, await studyBody(request), actor, studyPorts()); await verifyStudyActor(actor); return studyJson(result); } catch (e) { return studyFailure(e); }
}
