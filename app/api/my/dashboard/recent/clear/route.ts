import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { clearUserArticleActivity } from "@/lib/services/myActivityService";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    // 해당 사용자의 모든 활동 기록만 삭제 (원본 Article은 유지)
    await clearUserArticleActivity(user.id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Clear Recent Error:", e);
    return NextResponse.json(
      apiError("RECENT_CLEAR_FAILED", "이력을 비우지 못했습니다.", 500).body,
      { status: 500 }
    );
  }
}
