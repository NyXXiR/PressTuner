// app/api/articles/[id]/reviewers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import {
  assignReviewers,
  listArticleReviewers,
  removeReviewer,
} from "@/lib/services/reviewAssignmentService";

// [FIX 4] params 타입을 Promise로 변경
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { team } = await requireTeamContext();
    // [FIX 4] params 비동기 대기
    const { id } = await ctx.params;

    const assignments = await listArticleReviewers({
      teamId: team.id,
      articleId: id,
    });

    return NextResponse.json({ ok: true, assignments });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    if (status === 401)
      return NextResponse.json(
        apiError("UNAUTHORIZED", "UNAUTHORIZED", 401).body,
        { status: 401 }
      );
    if (status === 403)
      return NextResponse.json(
        apiError("FORBIDDEN", "FORBIDDEN", 403).body,
        { status: 403 }
      );

    if (status >= 400 && status < 500) {
      const err = apiError(
        e?.code ?? "BAD_REQUEST",
        e?.message ?? "Bad request",
        status
      );
      return NextResponse.json(err.body, { status: err.status });
    }

    console.error(e);
    return NextResponse.json(
      apiError("INTERNAL_ERROR", "서버 오류가 발생했습니다.", 500).body,
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { user, team } = await requireTeamContext();
    // [FIX 4] params 비동기 대기
    const { id } = await ctx.params;

    const body = await req.json().catch(() => null);
    const reviewerIds: string[] = Array.isArray(body?.reviewerIds)
      ? body.reviewerIds.filter(Boolean)
      : [];

    const note: string | undefined =
      typeof body?.note === "string" ? body.note : undefined;

    await assignReviewers({
      teamId: team.id,
      articleId: id,
      requesterId: user.id,
      reviewerIds,
      note,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    if (status === 401)
      return NextResponse.json(
        apiError("UNAUTHORIZED", "UNAUTHORIZED", 401).body,
        { status: 401 }
      );
    if (status === 403)
      return NextResponse.json(
        apiError("FORBIDDEN", "FORBIDDEN", 403).body,
        { status: 403 }
      );

    if (status >= 400 && status < 500) {
      const err = apiError(
        e?.code ?? "BAD_REQUEST",
        e?.message ?? "Bad request",
        status
      );
      return NextResponse.json(err.body, { status: err.status });
    }

    console.error(e);
    return NextResponse.json(
      apiError("INTERNAL_ERROR", "서버 오류가 발생했습니다.", 500).body,
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { team } = await requireTeamContext();
    // [FIX 4] params 비동기 대기
    const { id } = await ctx.params;

    const body = await req.json().catch(() => null);
    const reviewerId =
      typeof body?.reviewerId === "string" ? body.reviewerId : null;

    await removeReviewer({
      teamId: team.id,
      articleId: id,
      reviewerId,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    if (status === 401)
      return NextResponse.json(
        apiError("UNAUTHORIZED", "UNAUTHORIZED", 401).body,
        { status: 401 }
      );
    if (status === 403)
      return NextResponse.json(
        apiError("FORBIDDEN", "FORBIDDEN", 403).body,
        { status: 403 }
      );

    if (status >= 400 && status < 500) {
      const err = apiError(
        e?.code ?? "BAD_REQUEST",
        e?.message ?? "Bad request",
        status
      );
      return NextResponse.json(err.body, { status: err.status });
    }

    console.error(e);
    return NextResponse.json(
      apiError("INTERNAL_ERROR", "서버 오류가 발생했습니다.", 500).body,
      { status: 500 }
    );
  }
}
