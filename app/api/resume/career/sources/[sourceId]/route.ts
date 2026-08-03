import { NextRequest, NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import {
  deleteCareerSource,
  getCareerSource,
} from "@/lib/services/resume/careerSourceService";
import { apiError } from "@/lib/utils/api";
import { getCareerMemoryReadiness } from "@/lib/services/resume/careerMemoryReadinessService";

type Context = { params: Promise<{ sourceId: string }> };

function errorResponse(error: unknown) {
  const value = error as { status?: number; code?: string; message?: string };
  const result = apiError(
    value.code ?? "CAREER_SOURCE_REQUEST_FAILED",
    value.message ?? "Career source request failed",
    value.status ?? 500,
  );
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { user } = await requireTeamContext();
    const { sourceId } = await context.params;
    const source = await getCareerSource({ sourceId, userId: user.id });
    const readiness = await getCareerMemoryReadiness(user.id);
    return NextResponse.json({ ok: true, source, ...readiness });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  try {
    const { user } = await requireTeamContext();
    const { sourceId } = await context.params;
    const result = await deleteCareerSource({ sourceId, userId: user.id });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
