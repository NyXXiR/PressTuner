import { NextRequest, NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import {
  CAREER_CANDIDATE_BATCH_LIMIT,
  CAREER_CANDIDATE_FIELD_LIMITS,
  careerCandidateCreateFieldsSchema,
} from "@/domain/career-memory/candidatePolicy";
import { apiError } from "@/lib/utils/api";
import { batchCreateExperienceBricks } from "@/lib/services/resume/resumeBrickService";
import { z } from "zod";
import { validateBody } from "@/lib/utils/validate";

export const runtime = "nodejs";

const LegacyBatchItem = careerCandidateCreateFieldsSchema.extend({
  source: z.string().max(CAREER_CANDIDATE_FIELD_LIMITS.scalar).optional(),
});

const BatchBody = z.object({
  items: z
    .array(LegacyBatchItem)
    .min(1)
    .max(CAREER_CANDIDATE_BATCH_LIMIT),
});

export async function POST(req: NextRequest) {
  try {
    // 1. 권한 및 컨텍스트 확보
    const { team, user } = await requireTeamContext();
    const parsed = validateBody(BatchBody, await req.json());
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }

    const items = await batchCreateExperienceBricks({
      teamId: team.id,
      userId: user.id,
      items: parsed.data.items,
    });

    return NextResponse.json({
      ok: true,
      count: items.length,
      items,
      pendingReview: true,
    });
  } catch (e: any) {
    console.error("[BATCH_CREATE_BRICKS_ERROR]", e);
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "BRICK_BATCH_CREATE_FAILED",
      e?.message || "Server Error",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
