import { z } from "zod";

import { fetchWithLoading } from "@/lib/fetchWithLoading";

const OrganizedBrickDraftSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  originalText: z.string().min(1),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  isCurrent: z.boolean(),
  tags: z.array(z.string()),
});

const OrganizerResponseSchema = z.object({
  ok: z.literal(true),
  drafts: z.array(OrganizedBrickDraftSchema).min(1),
  draft: OrganizedBrickDraftSchema.optional(),
});

const ErrorResponseSchema = z.object({
  message: z.string().optional(),
  error: z.string().optional(),
});

export type OrganizedBrickDraft = z.infer<typeof OrganizedBrickDraftSchema>;

export class BrickOrganizerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrickOrganizerError";
  }
}

function getErrorMessage(json: unknown, fallback: string) {
  const parsed = ErrorResponseSchema.safeParse(json);
  if (!parsed.success) return fallback;
  return parsed.data.message ?? parsed.data.error ?? fallback;
}

async function readJson(response: Response) {
  return await response.json().catch(() => null);
}

export async function organizeExperienceBrickDraft(
  roughText: string,
): Promise<OrganizedBrickDraft> {
  const drafts = await organizeExperienceBrickDrafts(roughText);
  const firstDraft = drafts.at(0);
  if (!firstDraft) {
    throw new BrickOrganizerError("경험 정리 응답을 해석하지 못했습니다.");
  }

  return firstDraft;
}

export async function organizeExperienceBrickDrafts(
  roughText: string,
): Promise<OrganizedBrickDraft[]> {
  const text = roughText.trim();
  if (text.length < 10) {
    throw new BrickOrganizerError("경험 메모를 10자 이상 입력해주세요.");
  }

  const response = await fetchWithLoading("/api/resume/bricks/organize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roughText: text }),
  });
  const json = await readJson(response);

  if (!response.ok) {
    throw new BrickOrganizerError(
      getErrorMessage(json, "경험 메모를 정리하지 못했습니다."),
    );
  }

  const parsed = OrganizerResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new BrickOrganizerError("경험 정리 응답을 해석하지 못했습니다.");
  }

  return parsed.data.drafts;
}
