import { CareerExperienceType } from "@prisma/client";
import { z } from "zod";

/**
 * Public and internal candidate writes share these raw-payload limits. They are
 * deliberately above normal UI input sizes while bounding transaction work.
 */
export const CAREER_CANDIDATE_BATCH_LIMIT = 20;

export const CAREER_CANDIDATE_FIELD_LIMITS = {
  title: 200,
  content: 20_000,
  originalText: 20_000,
  scalar: 200,
  arrayItems: 50,
  arrayItem: 500,
  metricItem: 1_000,
} as const;

const limits = CAREER_CANDIDATE_FIELD_LIMITS;
const boundedScalar = z.string().max(limits.scalar).nullable().optional();
const boundedList = (itemLimit: number) =>
  z.array(z.string().max(itemLimit)).max(limits.arrayItems).optional();

export const careerCandidateCreateFieldsSchema = z
  .object({
    title: z.string().max(limits.title).trim().min(1),
    content: z.string().max(limits.content).trim().min(1),
    originalText: z.string().max(limits.originalText).nullable().optional(),
    organization: boundedScalar,
    roleTitle: boundedScalar,
    experienceType: z.nativeEnum(CareerExperienceType).optional(),
    period: boundedScalar,
    startDate: z.coerce.date().nullable().optional(),
    endDate: z.coerce.date().nullable().optional(),
    isCurrent: z.boolean().optional(),
    actions: boundedList(limits.arrayItem),
    outcomes: boundedList(limits.arrayItem),
    metrics: boundedList(limits.metricItem),
    tools: boundedList(limits.arrayItem),
    tags: boundedList(limits.arrayItem),
  })
  .strict();

export const careerCandidatePatchFieldsSchema = careerCandidateCreateFieldsSchema.partial();

export type CareerCandidateFieldValues = z.output<
  typeof careerCandidateCreateFieldsSchema
>;

export type CareerCandidateModeValue = "CREATE" | "LINK" | "AUGMENT";

export type CareerCandidateStructuredInput = {
  title: string;
  content: string;
  organization?: string | null;
  roleTitle?: string | null;
  tags?: readonly string[];
  actions?: readonly string[];
  outcomes?: readonly string[];
  metrics?: readonly string[];
  tools?: readonly string[];
};

function normalizeOptional(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function normalizeList(values: readonly string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function normalizeCareerCandidateInput(
  input: CareerCandidateStructuredInput,
) {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title) throw new Error("Career experience title is required");
  if (!content) throw new Error("Career experience content is required");

  return {
    title,
    content,
    organization: normalizeOptional(input.organization),
    roleTitle: normalizeOptional(input.roleTitle),
    tags: normalizeList(input.tags),
    actions: normalizeList(input.actions),
    outcomes: normalizeList(input.outcomes),
    metrics: normalizeList(input.metrics),
    tools: normalizeList(input.tools),
  };
}

export function validateCareerCandidateMode(input: {
  mode: CareerCandidateModeValue;
  targetExperienceId: string | null;
  targetOwnerId: string | null;
  userId: string;
}) {
  if (input.mode === "CREATE") {
    if (input.targetExperienceId) {
      throw new Error("CREATE candidate must not specify a target experience");
    }
    return;
  }
  if (!input.targetExperienceId || !input.targetOwnerId) {
    throw new Error(`${input.mode} candidate requires a target experience`);
  }
  if (input.targetOwnerId !== input.userId) {
    throw new Error("Candidate target must belong to the same owner");
  }
}
