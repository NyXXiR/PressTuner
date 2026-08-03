import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { patchAgentRunFeedback } from "@/lib/services/press-agent/agentRunFeedbackService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

const Rating = z.enum(["POSITIVE", "NEGATIVE"]).nullable();
const BodySchema = z
  .object({
    usefulness: Rating.optional(),
    citationAccuracy: Rating.optional(),
  })
  .strict()
  .refine(
    (value) =>
      Object.prototype.hasOwnProperty.call(value, "usefulness") ||
      Object.prototype.hasOwnProperty.call(value, "citationAccuracy"),
    "At least one feedback dimension is required",
  );

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const { team, user } = await requireTeamContext();
    const parsed = validateBody(BodySchema, await req.json());
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    const { runId } = await context.params;
    const feedback = await patchAgentRunFeedback({
      runId,
      teamId: team.id,
      userId: user.id,
      patch: parsed.data,
    });
    return NextResponse.json({ ok: true, feedback });
  } catch (error: any) {
    const status =
      error?.message === "PRESS_AGENT_RUN_NOT_FOUND"
        ? 404
        : error?.message === "PRESS_AGENT_FEEDBACK_NOT_AVAILABLE" ||
            error?.message === "PRESS_AGENT_CITATION_FEEDBACK_NOT_AVAILABLE"
          ? 409
          : error?.status ?? 500;
    return NextResponse.json(
      apiError(
        error?.message ?? "PRESS_AGENT_FEEDBACK_FAILED",
        error?.message ?? "Failed to save feedback",
        status,
      ).body,
      { status },
    );
  }
}
