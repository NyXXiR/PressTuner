import { NextRequest, NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import {
  getCurrentCareerVerification,
  verifyCareerAnswer,
} from "@/lib/services/resume/careerVerificationService";
import { apiError } from "@/lib/utils/api";

function errorResponse(error: unknown) {
  const value = error as {
    status?: number;
    code?: string;
    message?: string;
    details?: unknown;
  };
  const result = apiError(
    value.code ?? "CAREER_VERIFICATION_FAILED",
    value.message ?? "Career verification failed",
    value.status ?? 500,
    { details: value.details },
  );
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireTeamContext();
    const { id } = await params;
    const result = await getCurrentCareerVerification({
      questionId: id,
      userId: user.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireTeamContext();
    const { id } = await params;
    const verification = await verifyCareerAnswer({
      questionId: id,
      userId: user.id,
    });
    return NextResponse.json({ ok: true, verification });
  } catch (error) {
    return errorResponse(error);
  }
}
