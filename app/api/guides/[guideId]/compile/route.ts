//api/guides/[guideId]/compile/route.ts

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/utils/api";
import { requireSessionContext } from "@/lib/auth";
import { compileGuideByIdForMember } from "@/lib/services/styleGuideService";

type Ctx = { params: Promise<{ guideId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { guideId } = await ctx.params;
    if (!guideId)
      return NextResponse.json(
        apiError("MISSING_GUIDE_ID", "guideId 필요", 400).body,
        { status: 400 }
      );

    const { user } = await requireSessionContext();

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") === "SLOW" ? "SLOW" : "FAST";

    const result = await compileGuideByIdForMember({
      guideId,
      userId: user.id,
      mode,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    if (status === 401) {
      return NextResponse.json(
        apiError("UNAUTHORIZED", "UNAUTHORIZED", 401).body,
        { status: 401 }
      );
    }
    if (status === 403) {
      return NextResponse.json(
        apiError("FORBIDDEN", "FORBIDDEN", 403).body,
        { status: 403 }
      );
    }
    console.error(e);
    const err = apiError(
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? "서버 에러가 발생했습니다.",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
