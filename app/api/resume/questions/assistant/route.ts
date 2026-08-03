import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamContext } from "@/lib/auth";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";
import { assistResumeQuestionSearch } from "@/lib/services/resume/resumeQuestionAssistantService";
import { consumeAiQuota } from "@/domain/quota/aiQuota";

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .min(1),
  filter: z.enum(["ALL", "COMPLETED", "PENDING"]).optional(),
});

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
      action: "resume_chat",
      meta: {
        route: "/api/resume/questions/assistant",
        messageCount: parsed.data.messages.length,
      },
    });

    const result = await assistResumeQuestionSearch({
      userId: user.id,
      teamId: team.id,
      messages: parsed.data.messages,
      filter: parsed.data.filter,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Resume question assistant error:", error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "RESUME_QUESTION_ASSISTANT_FAILED",
      error?.message ?? "Failed to assist resume question search",
      status,
      error?.details ? { details: error.details } : undefined,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
