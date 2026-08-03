import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth"; // 제공해주신 auth.ts
import { apiError } from "@/lib/utils/api";
import { updateUserLabel } from "@/lib/services/meService";

export async function PATCH(req: Request) {
  try {
    // 1. 세션 사용자 확인
    const user = await requireUser();

    // 2. 입력값 검증
    const body = await req.json();
    const { label } = body;

    if (!label || typeof label !== "string" || label.trim().length === 0) {
      const err = apiError("INVALID_LABEL", "유효하지 않은 이름입니다.", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    if (label.length > 20) {
      const err = apiError(
        "LABEL_TOO_LONG",
        "이름은 20자 이내로 입력해주세요.",
        400
      );
      return NextResponse.json(err.body, { status: err.status });
    }

    // 3. DB 업데이트
    await updateUserLabel(user.id, label);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[API_ME_LABEL_UPDATE]", error);
    const status = error.status || 500;
    const err =
      status === 401
        ? apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401)
        : apiError("INTERNAL_ERROR", "서버 오류가 발생했습니다.", status);
    return NextResponse.json(err.body, { status: err.status });
  }
}
