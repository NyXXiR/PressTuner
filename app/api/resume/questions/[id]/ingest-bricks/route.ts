import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamContext } from "@/lib/auth";
import { assertAndLogAiPanelUsage } from "@/lib/services/aiPanelUsageService";
import { QuotaLimitError } from "@/lib/services/usageService";
import {
  applyResumeQuestionBrickPreview,
  previewResumeQuestionBricksFromChat,
} from "@/lib/services/resume/resumeChatBrickService";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";

const PreviewItemSchema = z.object({
  previewId: z.string().min(1),
  mode: z.enum(["create", "link", "augment"]),
  title: z.string().min(1),
  content: z.string().min(1),
  originalText: z.string().min(1),
  period: z.string().nullable(),
  tags: z.array(z.string()),
  matchedBrickId: z.string().nullable(),
  matchedBrickTitle: z.string().nullable(),
  reason: z.string().nullable(),
  existingContent: z.string().nullable(),
  existingOriginalText: z.string().nullable(),
});

const BodySchema = z.object({
  applicationId: z.string().min(1),
  mode: z.enum(["preview", "apply"]).default("preview"),
  prompt: z.string().min(1).optional(),
  recentMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        body: z.string(),
      }),
    )
    .optional(),
  items: z.array(PreviewItemSchema).optional(),
}).superRefine((value, ctx) => {
  if (value.mode === "preview" && !value.prompt?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["prompt"],
      message: "prompt is required in preview mode",
    });
  }

  if (value.mode === "apply" && !Array.isArray(value.items)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["items"],
      message: "items are required in apply mode",
    });
  }
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, team } = await requireTeamContext();
    const { id } = await params;

    const body = await req.json();
    const parsed = validateBody(BodySchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }

    await assertAndLogAiPanelUsage({
      teamId: team.id,
      userId: user.id,
      scope: "resume:ingest-bricks",
      meta: {
        applicationId: parsed.data.applicationId,
        questionId: id,
        mode: parsed.data.mode,
        messageLength: parsed.data.prompt?.length ?? 0,
        itemCount: parsed.data.items?.length ?? 0,
      },
    });

    const result =
      parsed.data.mode === "apply"
        ? await applyResumeQuestionBrickPreview({
            applicationId: parsed.data.applicationId,
            questionId: id,
            userId: user.id,
            teamId: team.id,
            items: parsed.data.items ?? [],
          })
        : await previewResumeQuestionBricksFromChat({
            applicationId: parsed.data.applicationId,
            questionId: id,
            userId: user.id,
            teamId: team.id,
            prompt: parsed.data.prompt ?? "",
            recentMessages: parsed.data.recentMessages,
          });

    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof QuotaLimitError) {
      const err = apiError("QUOTA_EXCEEDED", error.message, 403, {
        details: { quota: error.details?.quota ?? undefined },
      });
      return NextResponse.json(err.body, { status: err.status });
    }

    console.error("Resume brick ingestion error:", error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "RESUME_BRICK_INGEST_FAILED",
      error?.message ?? "Failed to ingest resume bricks",
      status,
      error?.details ? { details: error.details } : undefined,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
