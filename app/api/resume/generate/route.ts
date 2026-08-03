import { NextRequest, NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { QuotaLimitError } from "@/lib/services/usageService";
import { generateResumeAnswer } from "@/lib/services/resume/resumeService";
import { z } from "zod";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";
import { prisma } from "@/lib/prisma";
import { CareerGroundingOperation } from "@prisma/client";
import { writeGroundedCareerAnswer } from "@/lib/services/resume/careerWritingService";

const BodySchema = z.object({
  questionId: z.string().min(1).optional(),
  question: z.string().min(1).optional(),
  bricks: z.array(z.object({ id: z.string().optional() }).passthrough()).optional(),
  instruction: z.string().optional(),
  charLimit: z.number().int().positive().optional(),
  briefContext: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user, team } = await requireTeamContext();
    const body = await req.json();
    const parsed = validateBody(BodySchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }

    const {
      questionId,
      question,
      bricks = [],
      instruction,
      charLimit,
      briefContext,
    } = parsed.data;
    if (questionId) {
      const result = await writeGroundedCareerAnswer({
        questionId,
        userId: user.id,
        teamId: team.id,
        operation: CareerGroundingOperation.GENERATE,
        instruction,
        charLimit,
      });
      return NextResponse.json({
        ok: true,
        text: result.text,
        grounding: result.grounding,
      });
    }
    if (!question || bricks.length === 0) {
      const err = apiError("BAD_REQUEST", "questionId or legacy question and experience IDs are required", 400);
      return NextResponse.json(err.body, { status: err.status });
    }
    const brickIds = bricks.map((brick) => brick.id).filter((id): id is string => Boolean(id));
    if (brickIds.length !== bricks.length) {
      const err = apiError("LEGACY_EXPERIENCE_ID_REQUIRED", "Legacy experiences require IDs", 400);
      return NextResponse.json(err.body, { status: err.status });
    }
    const ownedBricks = await prisma.experienceBrick.findMany({
      where: { id: { in: brickIds }, userId: user.id, memoryStatus: "CONFIRMED" },
    });
    if (ownedBricks.length !== new Set(brickIds).size) {
      const err = apiError("EXPERIENCE_NOT_FOUND", "One or more experiences were not found", 404);
      return NextResponse.json(err.body, { status: err.status });
    }
    const result = await generateResumeAnswer({
      teamId: team.id,
      userId: user.id,
      question,
      bricks: ownedBricks,
      instruction,
      charLimit,
      briefContext,
    });

    return NextResponse.json({ ok: true, text: result.text });
  } catch (e: any) {
    // ✅ [ERROR] 한도 초과 처리
    if (e instanceof QuotaLimitError) {
      console.warn(`[Quota Limit] Team ${e.message}`);
      const err = apiError("QUOTA_EXCEEDED", e.message, 403, {
        details: { quota: e.details?.quota ?? undefined },
      });
      return NextResponse.json(err.body, { status: err.status });
    }

    console.error("Generate Error:", e);
    const status = e.status || 500;
    if (e?.code === "CAREER_MEMORY_NOT_INDEXED") {
      const err = apiError(e.code, e.message, status, {
        details: e.details,
      });
      return NextResponse.json(err.body, { status: err.status });
    }
    const err = apiError("GENERATE_ERROR", e.message, status);
    return NextResponse.json(err.body, { status: err.status });
  }
}
