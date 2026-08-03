import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";
import { consumeAiQuota } from "@/domain/quota/aiQuota";
import { QuotaLimitError } from "@/domain/quota/errors";
import { organizeResumeBrickDrafts } from "@/lib/services/resume/resumeBrickOrganizerService";

const BodySchema = z.object({
  roughText: z.string().trim().min(10).max(6000),
});

function messageFromError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(req: NextRequest) {
  try {
    const { user, team } = await requireTeamContext();
    const body = await req.json();
    const parsed = validateBody(BodySchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }

    await consumeAiQuota({
      teamId: team.id,
      userId: user.id,
      action: "resume_brick_extract",
      meta: {
        route: "/api/resume/bricks/organize",
        textLength: parsed.data.roughText.length,
      },
    });

    const drafts = await organizeResumeBrickDrafts(parsed.data.roughText);
    const firstDraft = drafts.at(0);
    if (!firstDraft) {
      const err = apiError(
        "RESUME_BRICK_ORGANIZE_EMPTY",
        "정리할 경험 후보를 찾지 못했습니다.",
        422,
      );
      return NextResponse.json(err.body, { status: err.status });
    }

    return NextResponse.json({
      ok: true,
      drafts,
      draft: firstDraft,
    });
  } catch (error) {
    if (error instanceof QuotaLimitError) {
      const err = apiError(error.code, error.message, error.status, {
        details: error.details,
      });
      return NextResponse.json(err.body, { status: err.status });
    }

    const err = apiError(
      "RESUME_BRICK_ORGANIZE_FAILED",
      messageFromError(error, "경험 메모를 정리하지 못했습니다."),
      500,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
