import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ApplicationIdSchema } from "@/domain/resume-writing/schemas";
import { requireTeamContext } from "@/lib/auth";
import { toResumeWritingApiError } from "@/lib/services/resume/resumeWritingApiError";
import { getResumeWritingWorkspace } from "@/lib/services/resume/resumeWritingWorkspaceService";
import { apiError } from "@/lib/utils/api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  try {
    const routeParams = await params;
    const applicationId = ApplicationIdSchema.safeParse(
      routeParams.applicationId,
    );
    if (!applicationId.success) {
      const error = apiError(
        "INVALID_APPLICATION_ID",
        "Application id is required",
        400,
      );
      return NextResponse.json(error.body, { status: error.status });
    }

    const { user, team } = await requireTeamContext();
    const workspace = await getResumeWritingWorkspace({
      applicationId: applicationId.data,
      userId: user.id,
      teamId: team.id,
    });
    return NextResponse.json({ ok: true, workspace });
  } catch (error: unknown) {
    const failure =
      error instanceof Error
        ? toResumeWritingApiError(error, "RESUME_WRITING_WORKSPACE_FAILED")
        : {
            status: 500,
            code: "RESUME_WRITING_WORKSPACE_FAILED",
            message: "RESUME_WRITING_WORKSPACE_FAILED",
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
