import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { finalizeCareerAnswer } from "@/lib/services/resume/careerFinalizationService";
import { createCareerVerificationOverride } from "@/lib/services/resume/careerVerificationService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";
import { prisma } from "@/lib/prisma";

const BodySchema = z.object({
  verificationId: z.string().min(1),
  reason: z.string().trim().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireTeamContext();
    const { id } = await params;
    const parsed = validateBody(BodySchema, await request.json());
    if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status });
    const verification = await prisma.careerAnswerVerification.findFirst({
      where: {
        id: parsed.data.verificationId,
        questionId: id,
        userId: user.id,
      },
      select: { id: true },
    });
    if (!verification) {
      const result = apiError("CAREER_VERIFICATION_NOT_FOUND", "Verification not found", 404);
      return NextResponse.json(result.body, { status: result.status });
    }
    const override = await createCareerVerificationOverride({
      verificationId: verification.id,
      userId: user.id,
      reason: parsed.data.reason,
    });
    const question = await prisma.question.findFirst({
      where: { id, application: { userId: user.id } },
      select: { answer: true },
    });
    const result = await finalizeCareerAnswer({
      questionId: id,
      userId: user.id,
      answer: question?.answer ?? "",
    });
    return NextResponse.json({ ok: true, override, result });
  } catch (error) {
    const value = error as {
      status?: number;
      code?: string;
      message?: string;
      details?: unknown;
    };
    const result = apiError(
      value.code ?? "CAREER_OVERRIDE_FAILED",
      value.message ?? "Career override failed",
      value.status ?? 500,
      { details: value.details },
    );
    return NextResponse.json(result.body, { status: result.status });
  }
}
