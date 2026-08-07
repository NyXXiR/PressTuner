import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeAiQuota } from "@/domain/quota/aiQuota";
import { startPressAgentRun } from "@/lib/services/press-agent/pressAgentRuntime";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

export const runtime = "nodejs";

const BodySchema = z.object({
  prompt: z.string().min(1).max(12_000),
  articleId: z.string().min(1).nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { team, user } = await requireTeamContext();
    const parsed = validateBody(BodySchema, await req.json());
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    await prisma.$transaction((tx) =>
      consumeAiQuota({
        teamId: team.id,
        userId: user.id,
        targetId: parsed.data.articleId ?? null,
        action: "press_panel_chat",
        client: tx,
      }),
    );
    const runRecord = await startPressAgentRun({
      teamId: team.id,
      userId: user.id,
      articleId: parsed.data.articleId,
      prompt: parsed.data.prompt,
    });
    return NextResponse.json({ ok: true, run: runRecord }, { status: 201 });
  } catch (error: any) {
    const status =
      error?.message === "PRESS_AGENT_ARTICLE_SCOPE_MISMATCH"
        ? 403
        : error?.status ?? 500;
    return NextResponse.json(
      apiError(
        error?.code ?? "PRESS_AGENT_RUN_FAILED",
        error?.message ?? "Failed to run Press Agent",
        status,
      ).body,
      { status },
    );
  }
}
