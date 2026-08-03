import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamContext } from "@/lib/auth";
import { assertAndLogAiPanelUsage } from "@/lib/services/aiPanelUsageService";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";
import { trackOpsEvent } from "@/lib/ops";
import { buildResumeAiContext } from "@/lib/services/resume/resumeAiContextService";
import { planResumeAiMultiAction } from "@/lib/services/resume/resumeAiOrchestrator";

const BodySchema = z.object({
  applicationId: z.string().min(1),
  command: z.string().min(1),
  questionId: z.string().optional(),
  recentMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        body: z.string(),
      }),
    )
    .optional(),
  selectedFeedbackNotes: z
    .array(
      z.object({
        quote: z.string(),
        note: z.string(),
        type: z.string().optional(),
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
      scope: "resume:plan",
      meta: {
        applicationId: parsed.data.applicationId,
        messageLength: parsed.data.command.length,
      },
    });

    const context = await buildResumeAiContext({
      userId: user.id,
      teamId: team.id,
      applicationId: parsed.data.applicationId,
      questionId: parsed.data.questionId,
      selectedFeedbackNotes: parsed.data.selectedFeedbackNotes,
      recentMessages: parsed.data.recentMessages,
    });

    const plan = await planResumeAiMultiAction({
      command: parsed.data.command,
      context,
    });

    void trackOpsEvent({
      event: "command_executed",
      userId: user.id,
      properties: {
        workspaceId: team.id,
        scope: "resume:plan",
        route: "/api/resume/command/plan",
        applicationId: parsed.data.applicationId,
        primaryAction: plan.actions[0]?.type ?? null,
        actionCount: plan.actions.length,
        commandLength: parsed.data.command.length,
      },
    });

    return NextResponse.json({ ok: true, plan });
  } catch (error: any) {
    void trackOpsEvent({
      event: "command_failed",
      properties: {
        scope: "resume:plan",
        route: "/api/resume/command/plan",
        errorCode: error?.code ?? "RESUME_COMMAND_PLAN_FAILED",
        status: error?.status ?? 500,
      },
    });
    console.error("Resume command plan error:", error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "RESUME_COMMAND_PLAN_FAILED",
      error?.message ?? "Failed to build resume command plan",
      status,
      error?.details ? { details: error.details } : undefined,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
