import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserId } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { processReviewAction } from "@/lib/services/reviewService";

type Action = "APPROVE" | "CHANGES_REQUESTED" | "DISMISS" | "CANCEL";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ assignmentId: string }> }
) {
  try {
    const userId = await requireCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401).body,
        { status: 401 }
      );
    }

    const { assignmentId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const action = body?.action as Action | undefined;

    if (!assignmentId || !action) {
      return NextResponse.json(
        apiError("BAD_REQUEST", "assignmentId/action이 필요합니다.", 400).body,
        { status: 400 }
      );
    }

    const result = await processReviewAction({
      assignmentId,
      userId,
      action,
    });

    return NextResponse.json({ ok: true, assignment: result });
  } catch (e: any) {
    console.error(e);
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "REVIEW_ACTION_FAILED",
      e?.message ?? "검토 처리 중 오류가 발생했습니다.",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
