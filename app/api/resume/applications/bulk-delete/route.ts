import { NextRequest, NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { bulkDeleteApplications } from "@/lib/services/resume/resumeApplicationService";

export async function POST(req: NextRequest) {
  try {
    const { user, team } = await requireTeamContext(); // 권한 체크
    const body = await req.json();
    const { ids } = body;

    const count = await bulkDeleteApplications({
      userId: user.id,
      teamId: team.id,
      ids,
    });

    return NextResponse.json({
      ok: true,
      count,
    });
  } catch (error: any) {
    console.error("Bulk Delete Error:", error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "APPLICATION_BULK_DELETE_FAILED",
      error?.message ?? "Failed to delete applications",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
