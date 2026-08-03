import { NextRequest, NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { QuotaLimitError } from "@/lib/services/usageService";
import { repolishResumeAnswer } from "@/lib/services/resume/resumeService";
import { z } from "zod";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";
import { prisma } from "@/lib/prisma";
import { CareerGroundingOperation } from "@prisma/client";
import { writeGroundedCareerAnswer } from "@/lib/services/resume/careerWritingService";

const BodySchema = z.object({
  questionId: z.string().optional(),
  originalText: z.string().min(1),
  question: z.string().optional(),
  bricks: z.array(z.object({ id: z.string().optional() }).passthrough()).optional(),
  briefContext: z.string().optional(),
  selectedNotes: z.array(z.object({}).passthrough()).optional(),
  userInstruction: z.string().optional(),
  charLimit: z.number().int().positive().optional(),
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
      originalText,
      question,
      bricks,
      briefContext,
      selectedNotes,
      userInstruction,
      charLimit,
    } =
      parsed.data;

    if (questionId) {
      const grounded = await writeGroundedCareerAnswer({
        questionId,
        userId: user.id,
        teamId: team.id,
        operation: CareerGroundingOperation.REVISE,
        instruction: userInstruction,
        currentAnswer: originalText,
        charLimit,
      });
      return NextResponse.json({
        ok: true,
        text: grounded.text,
        grounding: grounded.grounding,
      });
    }
    const brickIds = (bricks ?? [])
      .map((brick) => brick.id)
      .filter((id): id is string => Boolean(id));
    if (bricks && brickIds.length !== bricks.length) {
      const err = apiError("LEGACY_EXPERIENCE_ID_REQUIRED", "Legacy experiences require IDs", 400);
      return NextResponse.json(err.body, { status: err.status });
    }
    const ownedBricks = brickIds.length
      ? await prisma.experienceBrick.findMany({
          where: { id: { in: brickIds }, userId: user.id, memoryStatus: "CONFIRMED" },
        })
      : [];
    if (brickIds.length !== new Set(brickIds).size || ownedBricks.length !== new Set(brickIds).size) {
      const err = apiError("EXPERIENCE_NOT_FOUND", "One or more experiences were not found", 404);
      return NextResponse.json(err.body, { status: err.status });
    }
    const result = await repolishResumeAnswer({
      teamId: team.id,
      userId: user.id,
      questionId,
      originalText,
      question,
      bricks: ownedBricks,
      briefContext,
      selectedNotes,
      userInstruction,
      charLimit,
    });

    return NextResponse.json({ ok: true, text: result.text });
  } catch (e: any) {
    // ✅ [ERROR] 한도 초과 처리
    if (e instanceof QuotaLimitError) {
      const err = apiError("QUOTA_EXCEEDED", e.message, 403, {
        details: { quota: e.details?.quota ?? undefined },
      });
      return NextResponse.json(err.body, { status: err.status });
    }

    console.error("Repolish Error:", e);
    const status = e.status || 500;
    if (e?.code === "CAREER_MEMORY_NOT_INDEXED") {
      const err = apiError(e.code, e.message, status, {
        details: e.details,
      });
      return NextResponse.json(err.body, { status: err.status });
    }
    const err = apiError("REPOLISH_ERROR", e.message, status);
    return NextResponse.json(err.body, { status: err.status });
  }
}
