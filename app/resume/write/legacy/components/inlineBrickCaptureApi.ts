import { z } from "zod";
import type { Brick } from "@/stores/useResumeWriteStore";
import type { InlineBrickCaptureItem } from "@/app/resume/write/legacy/components/InlineBrickCaptureReview";

export type InlineBrickCaptureRecentMessage = {
  readonly role: "user" | "assistant";
  readonly body: string;
};

export type InlineBrickCaptureMessage = {
  readonly role: "user" | "assistant";
  readonly text: string;
};

export type InlineBrickCapturePreviewResponse = {
  readonly ok: true;
  readonly previewCount: number;
  readonly summary: string;
  readonly items: readonly InlineBrickCaptureItem[];
  readonly questionBricks: Brick[];
};

export type InlineBrickCaptureApplyResponse = {
  readonly ok: true;
  readonly appliedCount: number;
  readonly summary: string;
  readonly questionBricks: Brick[];
};

export class InlineBrickCaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InlineBrickCaptureError";
  }
}

const CaptureItemSchema = z.object({
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

const QuestionBrickSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    content: z.string(),
    originalText: z.string().nullable().optional(),
    tags: z.array(z.string()).default([]),
    isAiSuggested: z.boolean().optional(),
    isSelected: z.boolean().optional(),
  })
  .transform(
    (brick): Brick => ({
      id: brick.id,
      title: brick.title,
      content: brick.content,
      originalText: brick.originalText ?? undefined,
      tags: brick.tags,
      isAiSuggested: brick.isAiSuggested,
      isSelected: brick.isSelected,
    }),
  );

const PreviewResponseSchema = z.object({
  ok: z.literal(true),
  previewCount: z.number(),
  summary: z.string(),
  items: z.array(CaptureItemSchema),
  questionBricks: z.array(QuestionBrickSchema),
});

const ApplyResponseSchema = z.object({
  ok: z.literal(true),
  appliedCount: z.number(),
  summary: z.string(),
  questionBricks: z.array(QuestionBrickSchema),
});

const ErrorResponseSchema = z.object({
  message: z.string().optional(),
  error: z.string().optional(),
});

function getErrorMessage(json: unknown, fallback: string) {
  const parsed = ErrorResponseSchema.safeParse(json);
  if (!parsed.success) return fallback;
  return parsed.data.message ?? parsed.data.error ?? fallback;
}

async function readResponseJson(response: Response) {
  return await response.json().catch(() => null);
}

export function toInlineBrickCaptureRecentMessages(
  messages: readonly InlineBrickCaptureMessage[],
): InlineBrickCaptureRecentMessage[] {
  return messages.slice(-8).map((message) => ({
    role: message.role,
    body: message.text,
  }));
}

export function buildInlineBrickCapturePrompt(input: {
  readonly answer: string;
  readonly sourcePrompt?: string;
  readonly messages: readonly InlineBrickCaptureMessage[];
}) {
  const answer = input.answer.trim();
  const sourcePrompt = input.sourcePrompt?.trim();
  const userChat = input.messages
    .filter((message) => message.role === "user" && message.text.trim())
    .slice(-4)
    .map((message, index) => `최근 사용자 대화 ${index + 1}\n${message.text.trim()}`)
    .join("\n\n");

  return [
    sourcePrompt ? `사용자 요청\n${sourcePrompt}` : null,
    answer ? `현재 답변\n${answer}` : null,
    userChat || null,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
}

export async function previewInlineBrickCapture(input: {
  readonly endpoint: string;
  readonly applicationId: string;
  readonly prompt: string;
  readonly recentMessages: readonly InlineBrickCaptureRecentMessage[];
}): Promise<InlineBrickCapturePreviewResponse> {
  const response = await fetch(input.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      applicationId: input.applicationId,
      mode: "preview",
      prompt: input.prompt,
      recentMessages: input.recentMessages,
    }),
  });
  const json = await readResponseJson(response);

  if (!response.ok) {
    throw new InlineBrickCaptureError(
      getErrorMessage(json, "경험 저장 후보를 찾지 못했습니다."),
    );
  }

  const parsed = PreviewResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new InlineBrickCaptureError("경험 저장 후보 응답을 해석하지 못했습니다.");
  }

  return parsed.data;
}

export async function applyInlineBrickCapture(input: {
  readonly endpoint: string;
  readonly applicationId: string;
  readonly items: readonly InlineBrickCaptureItem[];
}): Promise<InlineBrickCaptureApplyResponse> {
  const response = await fetch(input.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      applicationId: input.applicationId,
      mode: "apply",
      items: input.items,
    }),
  });
  const json = await readResponseJson(response);

  if (!response.ok) {
    throw new InlineBrickCaptureError(
      getErrorMessage(json, "경험 브릭 저장에 실패했습니다."),
    );
  }

  const parsed = ApplyResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new InlineBrickCaptureError("경험 브릭 저장 응답을 해석하지 못했습니다.");
  }

  return parsed.data;
}
