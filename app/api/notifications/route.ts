import { NextResponse } from "next/server";
import { requireSessionContext } from "@/lib/auth";
import { getNotifications } from "@/lib/services/notificationService";
import { apiError } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { session } = await requireSessionContext();
    const url = new URL(req.url);

    // 파라미터 파싱
    const scope =
      (url.searchParams.get("scope") as "popover" | "all" | null) ?? "popover";
    const cursor = url.searchParams.get("cursor");
    const takeRaw = Number(url.searchParams.get("take") ?? "");

    // 페이지 크기 정책 적용
    const takeDefault = scope === "popover" ? 12 : 30;
    const takeMax = scope === "popover" ? 20 : 50;
    const take =
      Number.isFinite(takeRaw) && takeRaw > 0
        ? Math.min(takeRaw, takeMax)
        : takeDefault;

    // 서비스 호출
    const { items, nextCursor } = await getNotifications({
      userId: session.userId,
      teamId: session.currentTeamId ?? null,
      scope,
      take,
      cursor: cursor || null,
    });

    return NextResponse.json({ ok: true, notifications: items, nextCursor });
  } catch (error) {
    console.error("[Notification API Error]", error);
    const err = apiError(
      "INTERNAL_ERROR",
      "알림을 불러오는 중 오류가 발생했습니다.",
      500
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
