import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  ApplicationIdSchema,
  CompleteQuestionBodySchema,
  QuestionIdSchema,
} from "@/domain/resume-writing/schemas";
import { requireTeamContext } from "@/lib/auth";
import { toResumeWritingApiError } from "@/lib/services/resume/resumeWritingApiError";
import { completeResumeWritingQuestionWithServices } from "@/lib/services/resume/resumeWritingCompletionService";
import { apiError } from "@/lib/utils/api";

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ applicationId: string; questionId: string }>;
  },
) {
  try {
    const routeParams = await params;
    const applicationId = ApplicationIdSchema.safeParse(
      routeParams.applicationId,
    );
    const questionId = QuestionIdSchema.safeParse(routeParams.questionId);
    const body: unknown = await request.json().catch(() => null);
    const parsedBody = CompleteQuestionBodySchema.safeParse(body);
    if (!applicationId.success || !questionId.success || !parsedBody.success) {
      const error = apiError(
        "INVALID_REQUEST",
        "Application, question, and answer are required",
        400,
      );
      return NextResponse.json(error.body, { status: error.status });
    }

    const { user, team } = await requireTeamContext();
    const result = await completeResumeWritingQuestionWithServices({
      applicationId: applicationId.data,
      questionId: questionId.data,
      userId: user.id,
      teamId: team.id,
      answer: parsedBody.data.answer,
      expectedAnswerRevision: parsedBody.data.expectedAnswerRevision,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error: unknown) {
    const failure =
      error instanceof Error
        ? toResumeWritingApiError(error, "RESUME_WRITING_COMPLETION_FAILED")
        : {
            status: 500,
            code: "RESUME_WRITING_COMPLETION_FAILED",
            message: "RESUME_WRITING_COMPLETION_FAILED",
          };
    const response = apiError(
      failure.code,
      failure.message,
      failure.status,
      failure.details === undefined
        ? undefined
        : { details: failure.details },
    );
    return NextResponse.json(response.body, { status: response.status });
  }
}
