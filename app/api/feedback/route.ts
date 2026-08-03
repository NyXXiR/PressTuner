// app/api/feedback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserId } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import {
  createFeedback,
  listFeedback,
  updateFeedback,
} from "@/lib/services/feedbackService";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const articleId = url.searchParams.get("articleId");
    if (!articleId) {
      return NextResponse.json(
        apiError("MISSING_ARTICLE_ID", "articleId가 필요합니다.", 400).body,
        { status: 400 }
      );
    }

    const currentUserId = await requireCurrentUserId();

    // mineOnly / excludeMine / pagination
    const mineOnly = url.searchParams.get("mineOnly") === "1";
    const excludeMine = url.searchParams.get("excludeMine") === "1";
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "20", 10),
      50
    );
    const cursor = url.searchParams.get("cursor") || undefined;

    const whereBase: any = { articleId };
    if (mineOnly && currentUserId) whereBase.userId = currentUserId;
    if (excludeMine && currentUserId) whereBase.NOT = { userId: currentUserId };

    const { items, nextCursor } = await listFeedback({
      articleId,
      currentUserId,
      mineOnly,
      excludeMine,
      limit,
      cursor,
    });

    return NextResponse.json({
      ok: true,
      items,
      nextCursor,
    });
  } catch (e: any) {
    console.error(e);
    const status = e?.status ?? 500;
    return NextResponse.json(
      apiError(e?.code ?? "INTERNAL_ERROR", e?.message ?? "서버 오류", status).body,
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUserId = await requireCurrentUserId();
    if (!currentUserId)
      return NextResponse.json(
        apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401).body,
        { status: 401 }
      );

    const { articleId, vote, comment } = await req.json();

    const fb = await createFeedback({
      currentUserId,
      articleId,
      vote,
      comment,
    });

    return NextResponse.json({ ok: true, id: fb.id });
  } catch (e: any) {
    console.error(e);
    const status = e?.status ?? 500;
    return NextResponse.json(
      apiError(e?.code ?? "INTERNAL_ERROR", e?.message ?? "서버 오류", status).body,
      { status }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { articleId, vote, comment } = await req.json();
    const userId = await requireCurrentUserId();
    if (!userId)
      return NextResponse.json(
        apiError("UNAUTHORIZED", "로그인 필요", 401).body,
        { status: 401 }
      );

    const updated = await updateFeedback({
      currentUserId: userId,
      articleId,
      vote,
      comment,
    });

    return NextResponse.json({ ok: true, feedback: updated });
  } catch (e: any) {
    console.error(e);
    const status = e?.status ?? 500;
    return NextResponse.json(
      apiError(e?.code ?? "INTERNAL_ERROR", e?.message ?? "서버 오류", status).body,
      { status }
    );
  }
}
