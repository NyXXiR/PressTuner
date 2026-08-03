// app/api/me/withdrawal/route.ts
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth"; // ✅ 변경된 import
import { apiError } from "@/lib/utils/api";
import { setUserWithdrawalSchedule } from "@/lib/services/meService";

export async function POST(req: Request) {
  try {
    // ✅ getSessionUser(req) 대신 getSessionContext() 사용
    // 인자로 req를 넘기지 않습니다 (내부적으로 cookies() 사용)
    const ctx = await getSessionContext();

    if (!ctx?.user) {
      const err = apiError("UNAUTHORIZED", "Unauthorized", 401);
      return NextResponse.json(err.body, { status: err.status });
    }

    const user = ctx.user;

    // 탈퇴 예약 처리 (현재 시간 기록)
    await setUserWithdrawalSchedule(user.id, new Date());

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    const err = apiError("INTERNAL_ERROR", "Internal Server Error", 500);
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function DELETE(req: Request) {
  try {
    // ✅ 동일하게 변경
    const ctx = await getSessionContext();

    if (!ctx?.user) {
      const err = apiError("UNAUTHORIZED", "Unauthorized", 401);
      return NextResponse.json(err.body, { status: err.status });
    }

    const user = ctx.user;

    // 탈퇴 예약 취소 (null 처리)
    await setUserWithdrawalSchedule(user.id, null);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    const err = apiError("INTERNAL_ERROR", "Internal Server Error", 500);
    return NextResponse.json(err.body, { status: err.status });
  }
}
