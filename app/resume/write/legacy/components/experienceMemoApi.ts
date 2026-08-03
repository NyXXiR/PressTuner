import { z } from "zod";

import { fetchWithLoading } from "@/lib/fetchWithLoading";

const ExperienceMemoResponseSchema = z
  .object({
    ok: z.boolean(),
    message: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();

export class ExperienceMemoSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExperienceMemoSaveError";
  }
}

export type ExperienceMemoInput = {
  readonly title: string;
  readonly content: string;
};

function titleFromMemo(content: string) {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return (firstLine ?? "새 경험 메모").slice(0, 50);
}

export async function saveExperienceMemoBrick(
  input: ExperienceMemoInput,
): Promise<void> {
  const content = input.content.trim();
  if (content.length < 10) {
    throw new ExperienceMemoSaveError("경험 메모를 10자 이상 입력해주세요.");
  }

  const title = input.title.trim() || titleFromMemo(content);
  const res = await fetchWithLoading("/api/resume/bricks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      content,
      originalText: content,
      period: null,
      tags: [],
      source: "MANUAL",
    }),
  });

  const parsed = ExperienceMemoResponseSchema.safeParse(
    await res.json().catch(() => null),
  );
  if (!res.ok || !parsed.success || !parsed.data.ok) {
    const message = parsed.success
      ? parsed.data.message ?? parsed.data.error
      : undefined;
    throw new ExperienceMemoSaveError(
      message ?? "경험 메모 저장에 실패했습니다.",
    );
  }
}
