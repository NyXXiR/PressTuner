// app/api/articles/init/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireTeamContextFlexible } from "@/lib/auth";
import { extractTeamIdFromRequest } from "@/lib/auth/team";
import { ArticleType } from "@prisma/client";
import { initArticleDraft } from "@/lib/services/press/pressService";
import { apiError } from "@/lib/utils/api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const headerOrQueryTeamId = extractTeamIdFromRequest(req);
    const bodyTeamId = body?.teamId;

    const { user, team } = await requireTeamContextFlexible({
      teamId: bodyTeamId ?? headerOrQueryTeamId,
    });

    const typeRaw = body?.type;
    const type: ArticleType =
      typeRaw === "PRESS_RELEASE" ||
      typeRaw === "BLOG_POST" ||
      typeRaw === "NEWSLETTER" ||
      typeRaw === "OTHER"
        ? typeRaw
        : "PRESS_RELEASE";

    const created = await initArticleDraft({
      teamId: team.id,
      userId: user.id,
      type,
    });

    // ✅ backward compatibility: id + articleId 같이 내려줌
    return NextResponse.json({
      ok: true,
      id: created.id,
      articleId: created.id,
      type,
    });
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

    console.error(e);
    return NextResponse.json(
      apiError("INTERNAL_ERROR", "서버 오류가 발생했습니다.", 500).body,
      { status: 500 }
    );
  }
}
