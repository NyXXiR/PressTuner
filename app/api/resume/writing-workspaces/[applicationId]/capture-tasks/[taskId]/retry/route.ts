import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  ApplicationIdSchema,
  CaptureTaskIdSchema,
  RetryCaptureTaskBodySchema,
} from "@/domain/resume-writing/schemas";
import { requireTeamContext } from "@/lib/auth";
import {
  projectDeferredCareerCaptureTask,
  projectSuccessfulCareerCaptureProposal,
  retryCareerFinalAnswerCaptureTask,
  skipCareerFinalAnswerCaptureTask,
} from "@/lib/services/resume/careerFinalAnswerCaptureTaskService";
import { toResumeWritingApiError } from "@/lib/services/resume/resumeWritingApiError";
import { apiError } from "@/lib/utils/api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ applicationId: string; taskId: string }> },
) {
  try {
    const routeParams = await params;
    const applicationId = ApplicationIdSchema.safeParse(routeParams.applicationId);
    const taskId = CaptureTaskIdSchema.safeParse(routeParams.taskId);
    const body = RetryCaptureTaskBodySchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (!applicationId.success || !taskId.success || !body.success) {
      const error = apiError("INVALID_REQUEST", "Invalid capture retry request", 400);
      return NextResponse.json(error.body, { status: error.status });
    }
    const { user } = await requireTeamContext();
    if (body.data.action === "SKIP") {
      const skipped = await skipCareerFinalAnswerCaptureTask({
        taskId: taskId.data,
        applicationId: applicationId.data,
        userId: user.id,
        reason: body.data.skipReason!,
      });
      return NextResponse.json({
        ok: true,
        capture: {
          kind: "skipped",
          taskId: skipped.task.id,
          idempotent: skipped.idempotent,
        },
      });
    }
    const result = await retryCareerFinalAnswerCaptureTask({
      taskId: taskId.data,
      applicationId: applicationId.data,
      userId: user.id,
      reopenApplication: body.data.reopenApplication,
    });
    if (result.kind === "claimed") {
      return NextResponse.json({
        ok: true,
        capture: projectSuccessfulCareerCaptureProposal(result.proposal),
      });
    }
    const capture = projectDeferredCareerCaptureTask(result.task);
    return NextResponse.json(
      { ok: true, capture },
      { status: result.kind === "deferred" ? 202 : 200 },
    );
  } catch (error) {
    const failure = toResumeWritingApiError(error, "CAPTURE_TASK_RETRY_FAILED");
    const response = apiError(failure.code, failure.message, failure.status, {
      details: failure.details,
    });
    return NextResponse.json(response.body, { status: response.status });
  }
}
