import { NextRequest, NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import { getCareerGrounding } from "@/lib/services/resume/careerGroundingService";
import { apiError } from "@/lib/utils/api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireTeamContext();
    const { id } = await params;
    const grounding = await getCareerGrounding({ questionId: id, userId: user.id });
    return NextResponse.json({ ok: true, grounding });
  } catch (error) {
    const value = error as { status?: number; code?: string; message?: string };
    const result = apiError(
      value.code ?? "CAREER_GROUNDING_FAILED",
      value.message ?? "Career grounding request failed",
      value.status ?? 500,
    );
    return NextResponse.json(result.body, { status: result.status });
  }
}
