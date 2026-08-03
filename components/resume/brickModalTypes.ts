import { z } from "zod";

import type { OrganizedBrickDraft } from "@/components/resume/brickOrganizerApi";
import { validate, V } from "@/lib/utils/validate";

const BrickSchema = z.object({
  title: V.required("경험 제목").max(50, "제목은 최대 50자까지 가능합니다."),
  content: V.minLen("경험 내용", 10).max(
    1000,
    "내용은 최대 1000자까지 가능합니다.",
  ),
  originalText: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isCurrent: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export type BrickData = {
  readonly id?: string;
  readonly title: string;
  readonly content: string;
  readonly originalText?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly isCurrent?: boolean;
  readonly tags?: string[];
};

export type BrickDraftCandidate = BrickData & {
  readonly clientId: string;
  readonly selected: boolean;
};

export function fromOrganizedDraft(draft: OrganizedBrickDraft): BrickData {
  return {
    title: draft.title,
    content: draft.content,
    originalText: draft.originalText,
    startDate: draft.startDate ?? "",
    endDate: draft.endDate ?? "",
    isCurrent: draft.isCurrent,
    tags: draft.tags,
  };
}

export function toDraftCandidate(
  draft: OrganizedBrickDraft,
  index: number,
): BrickDraftCandidate {
  return {
    ...fromOrganizedDraft(draft),
    clientId: `draft-${index + 1}`,
    selected: true,
  };
}

export function validateBrickData(data: BrickData) {
  return validate(BrickSchema, data);
}
