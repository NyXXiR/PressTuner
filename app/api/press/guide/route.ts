import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamContext } from "@/lib/auth";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";
import { assertAndLogAiPanelUsage } from "@/lib/services/aiPanelUsageService";
import { guidePressWorkspace } from "@/lib/services/press/pressAiOrchestrator";

const BodySchema = z.object({
  message: z.string().min(1),
  pathname: z.string().min(1),
  recentMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        body: z.string(),
      }),
    )
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user, team } = await requireTeamContext();

    const body = await req.json();
    const parsed = validateBody(BodySchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }

    await assertAndLogAiPanelUsage({
      teamId: team.id,
      userId: user.id,
      scope: "press:guide",
      meta: {
        pathname: parsed.data.pathname,
        messageLength: parsed.data.message.length,
      },
    });

    const data = await guidePressWorkspace(parsed.data);
    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error("Press guide error:", error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "PRESS_GUIDE_FAILED",
      error?.message ?? "Failed to build press guide response",
      status,
      error?.details ? { details: error.details } : undefined,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
