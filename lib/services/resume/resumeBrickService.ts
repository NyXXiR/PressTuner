// lib/services/resume/resumeBrickService.ts

import {
  Prisma,
  BrickSource,
  CareerCandidateMode,
  CareerCandidateOrigin,
  CareerExperienceStatus,
  CareerExperienceType,
} from "@prisma/client";
import {
  CAREER_CANDIDATE_BATCH_LIMIT,
  careerCandidateCreateFieldsSchema,
} from "@/domain/career-memory/candidatePolicy";
import {
  normalizeCareerDates,
  parseLegacyCareerPeriod,
} from "@/domain/career-memory/careerPeriod";
import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";
import {
  createCareerCandidate,
  createCareerCandidatesAtomic,
  type CareerCandidateFields,
} from "./careerCandidateService";

export type CreateBrickParams = {
  teamId: string;
  userId: string;
  title: string;
  content: string;
  originalText?: string | null;
  period?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  isCurrent?: boolean;
  organization?: string | null;
  roleTitle?: string | null;
  experienceType?: CareerExperienceType;
  actions?: string[];
  outcomes?: string[];
  metrics?: string[];
  tools?: string[];
  tags: string[];
  source?: BrickSource;
};

export type UpdateBrickParams = {
  title?: string;
  content?: string;
  originalText?: string | null;
  period?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  isCurrent?: boolean;
  organization?: string | null;
  roleTitle?: string | null;
  experienceType?: CareerExperienceType;
  actions?: string[];
  outcomes?: string[];
  metrics?: string[];
  tools?: string[];
  tags?: string[];
};

type LegacyCandidateInput = Omit<
  Partial<CareerCandidateFields>,
  "startDate" | "endDate"
> & {
  title: string;
  content: string;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
};

function coerceLegacyDate(value: string | Date | null, field: string) {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw serviceError(
      400,
      "CAREER_DATE_POLICY_INVALID",
      `Invalid ${field}`,
    );
  }
  return date;
}

function toCandidateFields(input: LegacyCandidateInput): CareerCandidateFields {
  const fields: CareerCandidateFields = {
    title: input.title,
    content: input.content,
  };
  for (const field of [
    "originalText",
    "organization",
    "roleTitle",
    "experienceType",
    "period",
    "isCurrent",
    "actions",
    "outcomes",
    "metrics",
    "tools",
    "tags",
  ] as const) {
    if (input[field] !== undefined) {
      Object.assign(fields, { [field]: input[field] });
    }
  }
  if (input.startDate !== undefined) {
    fields.startDate = coerceLegacyDate(input.startDate, "startDate");
  }
  if (input.endDate !== undefined) {
    fields.endDate = coerceLegacyDate(input.endDate, "endDate");
  }
  return fields;
}

// 1. 목록 조회
export async function getExperienceBricks(params: {
  userId: string;
  q?: string;
  page: number;
  pageSize: number;
}) {
  const { userId, q, page, pageSize } = params;

  const where: Prisma.ExperienceBrickWhereInput = {
    userId,
    memoryStatus: { not: CareerExperienceStatus.ARCHIVED },
    ...(q && {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
        { tags: { has: q } },
      ],
    }),
  };

  const [items, total, confirmedTotal] = await prisma.$transaction([
    prisma.experienceBrick.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        content: true,
        originalText: true,
        period: true,
        startDate: true,
        endDate: true,
        isCurrent: true,
        tags: true,
        source: true,
        organization: true,
        roleTitle: true,
        experienceType: true,
        actions: true,
        outcomes: true,
        metrics: true,
        tools: true,
        memoryStatus: true,
        createdAt: true,
      },
    }),
    prisma.experienceBrick.count({ where }),
    prisma.experienceBrick.count({
      where: {
        userId,
        memoryStatus: CareerExperienceStatus.CONFIRMED,
      },
    }),
  ]);

  return { items, total, confirmedTotal };
}

// 2. 생성
export async function createExperienceBrick(params: CreateBrickParams) {
  if (!params.teamId) {
    throw serviceError(400, "NO_TEAM", "NO_TEAM");
  }
  return createCareerCandidate({
    userId: params.userId,
    origin: CareerCandidateOrigin.DIRECT_INPUT,
    mode: CareerCandidateMode.CREATE,
    fields: toCandidateFields(params),
  });
}

// 3. 수정: 공개 레거시 PATCH도 승인 전 AUGMENT 후보만 만든다.
export async function updateExperienceBrick(
  brickId: string,
  userId: string,
  data: UpdateBrickParams
) {
  const owned = await prisma.experienceBrick.findFirst({
    where: { id: brickId, userId },
  });
  if (!owned) {
    throw serviceError(
      404,
      "CAREER_EXPERIENCE_NOT_FOUND",
      "Unauthorized or Brick not found",
    );
  }

  const hasStructuredTimelineInput = ["startDate", "endDate", "isCurrent"].some(
    (field) => Object.prototype.hasOwnProperty.call(data, field),
  );
  let timeline: ReturnType<typeof normalizeCareerDates>;
  try {
    timeline =
      data.period !== undefined && !hasStructuredTimelineInput
        ? data.period?.trim()
          ? parseLegacyCareerPeriod(data.period)
          : normalizeCareerDates({ startDate: null, endDate: null, isCurrent: false })
        : normalizeCareerDates({
            startDate:
              data.startDate !== undefined
                ? coerceLegacyDate(data.startDate, "startDate")
                : owned.startDate,
            endDate:
              data.endDate !== undefined
                ? coerceLegacyDate(data.endDate, "endDate")
                : owned.endDate,
            isCurrent: data.isCurrent ?? owned.isCurrent,
          });
  } catch (error) {
    throw serviceError(
      400,
      "CAREER_DATE_POLICY_INVALID",
      error instanceof Error ? error.message : "Invalid career dates",
    );
  }

  const candidateInput: LegacyCandidateInput = {
    title: data.title ?? owned.title,
    content: data.content ?? owned.content,
    originalText: data.originalText !== undefined ? data.originalText : owned.originalText,
    organization: data.organization !== undefined ? data.organization : owned.organization,
    roleTitle: data.roleTitle !== undefined ? data.roleTitle : owned.roleTitle,
    experienceType: data.experienceType ?? owned.experienceType,
    startDate: timeline.startDate,
    endDate: timeline.endDate,
    isCurrent: timeline.isCurrent,
    actions: data.actions ?? owned.actions,
    outcomes: data.outcomes ?? owned.outcomes,
    metrics: data.metrics ?? owned.metrics,
    tools: data.tools ?? owned.tools,
    tags: data.tags ?? owned.tags,
  };

  return createCareerCandidate({
    userId,
    origin: CareerCandidateOrigin.DIRECT_INPUT,
    mode: CareerCandidateMode.AUGMENT,
    targetExperienceId: owned.id,
    replacementSnapshot: true,
    fields: toCandidateFields(candidateInput),
  });
}

// 4. 삭제
export async function deleteExperienceBrick(brickId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.experienceBrick.findFirst({
      where: { id: brickId, userId },
      select: { id: true },
    });
    if (!owned) throw new Error("Unauthorized or Experience not found");
    const deleted = await tx.experienceBrick.delete({ where: { id: brickId } });
    await tx.user.update({
      where: { id: userId },
      data: { careerMemoryVersion: { increment: 1 } },
    });
    return deleted;
  });
}

// 5. 전체 목록
export async function listAllExperienceBricks(userId: string) {
  if (!userId) {
    throw serviceError(401, "NO_USER", "NO_USER");
  }

  const items = await prisma.experienceBrick.findMany({
    where: { userId, memoryStatus: { not: CareerExperienceStatus.ARCHIVED } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      content: true,
      period: true,
      startDate: true,
      endDate: true,
      isCurrent: true,
      tags: true,
      source: true,
      createdAt: true,
      originalText: true,
    },
  });

  return items;
}

// 6. 전체 삭제
export async function deleteAllExperienceBricks(userId: string) {
  if (!userId) {
    throw serviceError(401, "NO_USER", "NO_USER");
  }

  return prisma.$transaction(async (tx) => {
    const result = await tx.experienceBrick.deleteMany({ where: { userId } });
    if (result.count > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { careerMemoryVersion: { increment: 1 } },
      });
    }
    return result.count;
  });
}

// 7. 배치 생성
export async function batchCreateExperienceBricks(input: {
  teamId: string;
  userId: string;
  items: Array<{
    title: string;
    content: string;
    originalText?: string | null;
    period?: string | null;
    organization?: string | null;
    roleTitle?: string | null;
    experienceType?: CareerExperienceType;
    tags?: string[];
    actions?: string[];
    outcomes?: string[];
    metrics?: string[];
    tools?: string[];
    source?: BrickSource | string;
    startDate?: string | Date | null;
    endDate?: string | Date | null;
    isCurrent?: boolean;
  }>;
}) {
  if (!input.teamId) {
    throw serviceError(400, "NO_TEAM", "NO_TEAM");
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw serviceError(400, "MISSING_ITEMS", "No items to save");
  }
  if (input.items.length > CAREER_CANDIDATE_BATCH_LIMIT) {
    throw serviceError(
      400,
      "CAREER_CANDIDATE_BATCH_LIMIT_EXCEEDED",
      `Career candidate batches are limited to ${CAREER_CANDIDATE_BATCH_LIMIT} items`,
    );
  }

  const candidateItems = input.items.map((item) => {
    const parsed = careerCandidateCreateFieldsSchema.safeParse(toCandidateFields(item));
    if (!parsed.success) {
      throw serviceError(
        400,
        "CAREER_CANDIDATE_PAYLOAD_INVALID",
        "Career candidate fields exceed the accepted limits or have invalid values",
        parsed.error.flatten(),
      );
    }
    return {
      userId: input.userId,
      origin: CareerCandidateOrigin.DIRECT_INPUT,
      mode: CareerCandidateMode.CREATE,
      fields: parsed.data,
    };
  });
  return createCareerCandidatesAtomic(candidateItems);
}

export { serviceError };
