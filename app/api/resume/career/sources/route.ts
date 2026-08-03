import { NextRequest, NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import {
  createCareerSource,
  listCareerSources,
} from "@/lib/services/resume/careerSourceService";
import { apiError } from "@/lib/utils/api";
import { getCareerMemoryReadiness } from "@/lib/services/resume/careerMemoryReadinessService";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const value = error as { status?: number; code?: string; message?: string; details?: unknown };
  const result = apiError(
    value.code ?? "CAREER_SOURCE_REQUEST_FAILED",
    value.message ?? "Career source request failed",
    value.status ?? 500,
    { details: value.details },
  );
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET() {
  try {
    const { user } = await requireTeamContext();
    const sources = await listCareerSources(user.id);
    const readiness = await getCareerMemoryReadiness(user.id);
    return NextResponse.json({ ok: true, sources, ...readiness });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, team } = await requireTeamContext();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      const result = apiError("CAREER_SOURCE_FILE_REQUIRED", "PDF file is required", 400);
      return NextResponse.json(result.body, { status: result.status });
    }
    const result = await createCareerSource({
      userId: user.id,
      teamId: team.id,
      originalName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    const readiness = await getCareerMemoryReadiness(user.id);
    return NextResponse.json(
      {
        ok: true,
        sourceId: result.source.id,
        technicalStatus: result.source.status,
        candidateCount: result.source.candidateCount,
        source: result.source,
        deduplicated: result.deduplicated,
        ...readiness,
      },
      { status: result.deduplicated ? 200 : 202 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
