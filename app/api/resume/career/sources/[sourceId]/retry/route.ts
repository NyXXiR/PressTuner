import { NextRequest, NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import { retryCareerSource } from "@/lib/services/resume/careerSourceService";
import { apiError } from "@/lib/utils/api";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  try {
    const { user } = await requireTeamContext();
    const { sourceId } = await params;
    const source = await retryCareerSource({ sourceId, userId: user.id });
    return NextResponse.json({ ok: true, source }, { status: 202 });
  } catch (error) {
    const value = error as { status?: number; code?: string; message?: string };
    const result = apiError(
      value.code ?? "CAREER_SOURCE_RETRY_FAILED",
      value.message ?? "Career source retry failed",
      value.status ?? 500,
    );
    return NextResponse.json(result.body, { status: result.status });
  }
}
