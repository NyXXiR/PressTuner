import { NextRequest, NextResponse } from "next/server";
import {
  extractTextFromPdf,
  parseResumeToBricks,
} from "@/lib/services/resume/resumeParserService";
import { requireTeamContext } from "@/lib/auth";
import { redactPII } from "@/lib/utils/masking";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";
import { z } from "zod";
import { consumeAiQuota } from "@/domain/quota/aiQuota";

export const runtime = "nodejs";

// ✅ 운영(production)에서는 절대 로깅/preview 응답이 나오지 않게
const DEBUG_PDF_TEXT =
  process.env.DEBUG_PDF_TEXT === "true" &&
  process.env.NODE_ENV !== "production";

// 개발 중에도 로그/응답 폭주 방지
const LOG_MAX = Number(process.env.DEBUG_PDF_TEXT_LOG_MAX ?? 200_000);
const PREVIEW_MAX = Number(process.env.DEBUG_PDF_TEXT_PREVIEW_MAX ?? 20_000);

export async function POST(req: NextRequest) {
  try {
    const { user, team } = await requireTeamContext();

    const formData = await req.formData();
    const file = formData.get("file") as File;

    const parsed = validateBody(z.object({ file: z.any() }), { file });
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const rawText = await extractTextFromPdf(buffer);
    if (!rawText || rawText.length < 50) {
      const err = apiError(
        "PDF_TEXT_EMPTY",
        "PDF text is empty or unreadable",
        400
      );
      return NextResponse.json(err.body, { status: err.status });
    }

    // ✅ AI에게 보내기 전에 PII 마스킹(전화번호/이메일 등)
    const safeText = redactPII(rawText);

    // ✅ 디버그일 때만: 로깅 + preview 응답 포함
    // (주의) 디버그 로그에도 PII가 남지 않게 safeText를 사용
    if (DEBUG_PDF_TEXT) {
      const logText = safeText.slice(0, LOG_MAX);

      console.log("==== [PDF RAW TEXT (MASKED) START] ====");
      console.log(`length=${safeText.length} (logged=${logText.length})`);
      console.log(logText);
      console.log("==== [PDF RAW TEXT (MASKED) END] ====");
    }

    // ✅ 평소 흐름: PDF 파싱 직후 바로 AI에게 보냄(마스킹된 텍스트)
    await consumeAiQuota({
      teamId: team.id,
      userId: user.id,
      action: "resume_parse",
      meta: {
        route: "/api/resume/parse",
        textLength: safeText.length,
      },
    });
    const items = await parseResumeToBricks(safeText);

    return NextResponse.json({
      ok: true,
      items,
      ...(DEBUG_PDF_TEXT
        ? {
            debug: {
              rawTextLength: rawText.length,
              maskedTextLength: safeText.length,
              preview: safeText.slice(0, PREVIEW_MAX),
            },
          }
        : {}),
    });
  } catch (e: any) {
    console.error("Parse Error:", e);
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "PARSING_FAILED",
      e.message || "Parsing failed",
      status,
      { details: { quota: e?.details?.quota ?? undefined } },
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
