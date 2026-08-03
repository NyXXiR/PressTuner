import { NextRequest, NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import {
  deleteAllExperienceBricks,
  listAllExperienceBricks,
} from "@/lib/services/resume/resumeBrickService";

export const runtime = "nodejs";

// 기존 GET 핸들러
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireTeamContext();

    const items = await listAllExperienceBricks(user.id);

    return NextResponse.json({
      ok: true,
      items,
      total: items.length,
    });
  } catch (e: any) {
    console.error("[GET_ALL_BRICKS_ERROR]", e);
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "BRICK_LIST_ALL_FAILED",
      e?.message || "Server Error",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}

// ✅ [NEW] 전체 삭제 핸들러 추가
export async function DELETE(req: NextRequest) {
  try {
    // 1. 권한 체크
    const { user } = await requireTeamContext();

    const count = await deleteAllExperienceBricks(user.id);

    return NextResponse.json({
      ok: true,
      message: "Deleted all bricks",
      count,
    });
  } catch (e: any) {
    console.error("[DELETE_ALL_BRICKS_ERROR]", e);
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "BRICK_DELETE_ALL_FAILED",
      e?.message || "Server Error",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
