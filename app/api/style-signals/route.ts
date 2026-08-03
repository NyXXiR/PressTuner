import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { apiError } from "@/lib/utils/api";
import { SignalSource } from "@prisma/client";
import { createStyleSignalFromArticle } from "@/lib/services/styleSignalService";

/**
 * POST body:
 * {
 *   articleId: string;
 *   source: "GENERATION" | "MANUAL_EDIT" | "STATUS_TRANSITION" | "FEEDBACK";
 *   payload: Json;   // { diffs?: [...], ... }
 *   weight?: number; // default 1.0
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json(
        apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401).body,
        { status: 401 }
      );
    const userId = session.userId;

    const { articleId, source, payload, weight } = await req.json();

    if (!articleId || typeof articleId !== "string") {
      return NextResponse.json(
        apiError("MISSING_ARTICLE_ID", "articleId가 필요합니다.", 400).body,
        { status: 400 }
      );
    }

    const sourceValue = String(source);
    if (!Object.values(SignalSource).includes(sourceValue as SignalSource)) {
      return NextResponse.json(
        apiError("INVALID_SOURCE", "Invalid source", 400).body,
        { status: 400 }
      );
    }

    await createStyleSignalFromArticle({
      articleId,
      userId,
      source: sourceValue as SignalSource,
      payload,
      weight,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    const status = e?.status ?? 500;
    return NextResponse.json(
      apiError(e?.code ?? "INTERNAL_ERROR", e?.message ?? "서버 에러가 발생했습니다.", status).body,
      { status }
    );
  }
}
