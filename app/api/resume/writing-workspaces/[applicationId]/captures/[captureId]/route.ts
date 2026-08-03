import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  ApplicationIdSchema,
  CaptureActionBodySchema,
  CaptureIdSchema,
} from "@/domain/resume-writing/schemas";
import { requireTeamContext } from "@/lib/auth";
import { toResumeWritingApiError } from "@/lib/services/resume/resumeWritingApiError";
import { resolveResumeWritingCapture } from "@/lib/services/resume/resumeWritingCaptureService";
import { apiError } from "@/lib/utils/api";

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ applicationId: string; captureId: string }>;
  },
) {
  try {
    const routeParams = await params;
    const applicationId = ApplicationIdSchema.safeParse(
      routeParams.applicationId,
    );
    const captureId = CaptureIdSchema.safeParse(routeParams.captureId);
    const body: unknown = await request.json().catch(() => null);
    const parsedBody = CaptureActionBodySchema.safeParse(body);
    if (!applicationId.success || !captureId.success || !parsedBody.success) {
      const error = apiError(
        "INVALID_REQUEST",
        "Application, capture, and action are required",
        400,
      );
      return NextResponse.json(error.body, { status: error.status });
    }

    const { user, team } = await requireTeamContext();
    const result = await resolveResumeWritingCapture({
      applicationId: applicationId.data,
      captureId: captureId.data,
      userId: user.id,
      teamId: team.id,
      action: parsedBody.data,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error: unknown) {
    const failure =
      error instanceof Error
        ? toResumeWritingApiError(error, "RESUME_WRITING_CAPTURE_FAILED")
        : {
            status: 500,
            code: "RESUME_WRITING_CAPTURE_FAILED",
            message: "RESUME_WRITING_CAPTURE_FAILED",
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
