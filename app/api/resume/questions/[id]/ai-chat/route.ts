import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamContext } from "@/lib/auth";
import {
  createQuestionAiMessages,
  listQuestionAiMessages,
} from "@/lib/services/resume/resumeService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

const MessageSchema = z.object({
  role: z.enum(["USER", "ASSISTANT", "SYSTEM"]),
  kind: z.enum(["PROMPT", "STATUS", "SUGGESTION", "APPLY", "DISCARD"]),
  content: z.string().min(1),
  meta: z.unknown().optional(),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireTeamContext();
    const { id } = await params;

    if (!id) {
      const err = apiError("MISSING_ID", "ID is missing", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const items = await listQuestionAiMessages({
      userId: user.id,
      questionId: id,
    });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    console.error("List Question AI Messages Error:", e);
    const status = e.status || 500;
    const err = apiError("QUESTION_AI_MESSAGES_LIST_FAILED", e.message, status);
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireTeamContext();
    const { id } = await params;

    if (!id) {
      const err = apiError("MISSING_ID", "ID is missing", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const body = await req.json();
    const parsed = validateBody(BodySchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }

    const items = await createQuestionAiMessages({
      userId: user.id,
      questionId: id,
      messages: parsed.data.messages.map((message) => ({
        ...message,
        meta: message.meta as any,
      })),
    });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    console.error("Create Question AI Messages Error:", e);
    const status = e.status || 500;
    const err = apiError("QUESTION_AI_MESSAGES_CREATE_FAILED", e.message, status);
    return NextResponse.json(err.body, { status: err.status });
  }
}
