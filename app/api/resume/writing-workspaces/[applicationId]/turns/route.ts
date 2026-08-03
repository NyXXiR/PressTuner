import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  ApplicationIdSchema,
  WritingTurnBodySchema,
} from "@/domain/resume-writing/schemas";
import { requireTeamContext } from "@/lib/auth";
import { toResumeWritingApiError } from "@/lib/services/resume/resumeWritingApiError";
import { planResumeWritingTurn } from "@/lib/services/resume/resumeWritingTurnService";
import { apiError } from "@/lib/utils/api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  try {
    const routeParams = await params;
    const applicationId = ApplicationIdSchema.safeParse(
      routeParams.applicationId,
    );
    const body: unknown = await request.json().catch(() => null);
    const parsedBody = WritingTurnBodySchema.safeParse(body);
    if (!applicationId.success || !parsedBody.success) {
      const error = apiError(
        "INVALID_REQUEST",
        "Application, question, and message are required",
        400,
        {
          fields: {
            applicationId: applicationId.success
              ? undefined
              : applicationId.error.format(),
            body: parsedBody.success ? undefined : parsedBody.error.format(),
          },
        },
      );
      return NextResponse.json(error.body, { status: error.status });
    }

    const { user, team } = await requireTeamContext();
    const turn = await planResumeWritingTurn({
      applicationId: applicationId.data,
      questionId: parsedBody.data.questionId,
      userId: user.id,
      teamId: team.id,
      message: parsedBody.data.message,
      recentMessages: parsedBody.data.recentMessages,
      selectedFeedbackNotes: parsedBody.data.selectedFeedbackNotes,
    });
    return NextResponse.json({ ok: true, turn });
  } catch (error: unknown) {
    const failure =
      error instanceof Error
        ? toResumeWritingApiError(error, "RESUME_WRITING_TURN_FAILED")
        : {
            status: 500,
            code: "RESUME_WRITING_TURN_FAILED",
            message: "RESUME_WRITING_TURN_FAILED",
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
