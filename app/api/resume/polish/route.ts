import { NextRequest, NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { QuotaLimitError } from "@/lib/services/usageService";
import { polishResumeAnswer } from "@/lib/services/resume/resumeService";
import { z } from "zod";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";

const BodySchema = z.object({
  questionId: z.string().optional(),
  text: z.string().min(1),
  question: z.string().optional(),
  briefContext: z.string().optional(),
  bricks: z.array(z.object({}).passthrough()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user, team } = await requireTeamContext();
    const body = await req.json();
    const parsed = validateBody(BodySchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    const { questionId, text, question, briefContext, bricks } = parsed.data;

    const result = await polishResumeAnswer({
      teamId: team.id,
      userId: user.id,
      questionId,
      text,
      question,
      briefContext,
      bricks,
    });

    return NextResponse.json({
      ok: true,
      spans: result.spans,
      notes: result.notes,
    });
  } catch (e: any) {
    // ✅ [ERROR] 한도 초과 처리
    if (e instanceof QuotaLimitError) {
      const err = apiError("QUOTA_EXCEEDED", e.message, 403, {
        details: { quota: e.details?.quota ?? undefined },
      });
      return NextResponse.json(err.body, { status: err.status });
    }

    console.error(e);
    const status = e.status || 500;
    const err = apiError("POLISH_ERROR", e.message, status);
    return NextResponse.json(err.body, { status: err.status });
  }
}
