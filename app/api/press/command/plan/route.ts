import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamContext } from "@/lib/auth";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";
import { trackOpsEvent } from "@/lib/ops";
import { assertAndLogAiPanelUsage } from "@/lib/services/aiPanelUsageService";
import { planPressCommand } from "@/lib/services/press/pressAiOrchestrator";

const BodySchema = z.object({
  command: z.string().min(1),
  context: z.object({
    title: z.string(),
    plainLength: z.number().int().nonnegative(),
    noteCount: z.number().int().nonnegative(),
    selectedNoteCount: z.number().int().nonnegative(),
    pendingResult: z.boolean(),
    saveState: z.string(),
  }),
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
      scope: "press:plan",
      meta: {
        messageLength: parsed.data.command.length,
        plainLength: parsed.data.context.plainLength,
      },
    });

    const plan = await planPressCommand(parsed.data);
    void trackOpsEvent({
      event: "command_executed",
      userId: user.id,
      properties: {
        workspaceId: team.id,
        scope: "press:plan",
        route: "/api/press/command/plan",
        actionCount: plan.actions.length,
        primaryAction: plan.actions[0]?.type ?? null,
        commandLength: parsed.data.command.length,
      },
    });
    return NextResponse.json({ ok: true, plan });
  } catch (error: any) {
    void trackOpsEvent({
      event: "command_failed",
      properties: {
        scope: "press:plan",
        route: "/api/press/command/plan",
        errorCode: error?.code ?? "PRESS_COMMAND_PLAN_FAILED",
        status: error?.status ?? 500,
      },
    });
    console.error("Press command plan error:", error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "PRESS_COMMAND_PLAN_FAILED",
      error?.message ?? "Failed to build press command plan",
      status,
      error?.details ? { details: error.details } : undefined,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
