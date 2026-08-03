import { ApplicationStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import {
  deleteApplication,
  getApplicationById,
  updateApplicationDraft,
  updateApplicationStatus,
} from "@/lib/services/resume/resumeApplicationService";

export async function GET(
  req: NextRequest,
  // ✅ 수정됨: params를 Promise로 타입 정의
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { user, team } = await requireTeamContext(); // 권한 체크

    // ✅ 수정됨: params를 await 하여 값을 추출
    const params = await props.params;
    const applicationId = params.id;

    if (!applicationId) {
      const err = apiError("MISSING_APP_ID", "Application ID is missing", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const app = await getApplicationById({
      userId: user.id,
      teamId: team.id,
      applicationId,
    });

    return NextResponse.json({ ok: true, data: app });
  } catch (error: any) {
    console.error(error); // 에러 로그 확인용
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "APPLICATION_FETCH_FAILED",
      error?.message ?? "Failed to fetch application",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { user, team } = await requireTeamContext(); // 권한 체크
    const params = await props.params;
    const applicationId = params.id;

    const body = await req.json();
    const { status, companyName, jobTitle, jdText, deadline, questions } = body;

    if (!applicationId) {
      const err = apiError(
        "MISSING_FIELDS",
        "Missing application id",
        400
      );
      return NextResponse.json(err.body, { status: err.status });
    }

    if (status !== undefined) {
      const statusValue = String(status);
      if (!Object.values(ApplicationStatus).includes(statusValue as ApplicationStatus)) {
        const err = apiError("INVALID_STATUS", "Invalid status", 400);
        return NextResponse.json(err.body, { status: err.status });
      }

      const updatedApp = await updateApplicationStatus({
        userId: user.id,
        teamId: team.id,
        applicationId,
        status: statusValue as ApplicationStatus,
      });

      return NextResponse.json({ ok: true, data: updatedApp });
    }

    if (questions !== undefined && !Array.isArray(questions)) {
      const err = apiError("INVALID_QUESTIONS", "questions must be an array", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const updatedApp = await updateApplicationDraft({
      userId: user.id,
      teamId: team.id,
      applicationId,
      companyName: typeof companyName === "string" ? companyName : undefined,
      jobTitle: typeof jobTitle === "string" ? jobTitle : undefined,
      jdText: typeof jdText === "string" || jdText === null ? jdText : undefined,
      deadline: typeof deadline === "string" || deadline === null ? deadline : undefined,
      questions: Array.isArray(questions)
        ? questions.map((question: any) => ({
            id: typeof question?.id === "string" ? question.id : undefined,
            questionText: String(question?.questionText ?? ""),
            charLimit:
              typeof question?.charLimit === "number" ? question.charLimit : undefined,
          }))
        : undefined,
    });

    return NextResponse.json({ ok: true, data: updatedApp });
  } catch (error: any) {
    console.error("Update Application Error:", error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "APPLICATION_UPDATE_FAILED",
      error?.message ?? "Failed to update application",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
export async function DELETE(
  req: NextRequest,
  // ✅ Next.js 15+ 스타일: params를 Promise로 정의
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { user, team } = await requireTeamContext(); // 권한 체크
    const params = await props.params;
    const applicationId = params.id;

    if (!applicationId) {
      const err = apiError("MISSING_APP_ID", "Application ID is missing", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    // ✅ 소유권 확인 및 삭제
    // Prisma delete는 Unique 컬럼만 where에 넣을 수 있어, userId 체크를 위해 deleteMany 사용
    const count = await deleteApplication({
      userId: user.id,
      teamId: team.id,
      applicationId,
    });

    return NextResponse.json({ ok: true, count });
  } catch (error: any) {
    console.error("Delete Application Error:", error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "APPLICATION_DELETE_FAILED",
      error?.message ?? "Failed to delete application",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
