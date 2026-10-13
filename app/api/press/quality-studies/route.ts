import type { NextRequest } from "next/server";
import { studyActor, studyBody, studyFailure, studyJson } from "@/lib/services/press-workflow/evaluation/studyHttp.server";
import { createQualityStudy } from "@/lib/services/press-workflow/evaluation/studyService";
import { studyPorts } from "@/lib/services/press-workflow/evaluation/studyRuntime.server";
export const runtime = "nodejs";
export async function GET() { try { const actor = await studyActor(); return studyJson({ studies: await studyPorts().repository.list(actor.teamId) }); } catch (e) { return studyFailure(e); } }
export async function POST(request: NextRequest) { try { const actor = await studyActor(); return studyJson(await createQualityStudy(await studyBody(request), actor, studyPorts()), 201); } catch (e) { return studyFailure(e); } }
