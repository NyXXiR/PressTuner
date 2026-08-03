import {
  BrickSource,
  CareerCandidateMode,
  CareerCandidateOrigin,
  CareerCandidateStatus,
  CareerEvidenceOrigin,
  CareerFactTrustStatus,
  CareerExperienceStatus,
  CareerExperienceType,
  type Prisma,
} from "@prisma/client";

import {
  CAREER_CANDIDATE_BATCH_LIMIT,
  careerCandidateCreateFieldsSchema,
  careerCandidatePatchFieldsSchema,
  type CareerCandidateFieldValues,
  normalizeCareerCandidateInput,
  validateCareerCandidateMode,
} from "@/domain/career-memory/candidatePolicy";
import {
  deriveCareerPeriod,
  normalizeCareerDates,
  parseLegacyCareerPeriod,
} from "@/domain/career-memory/careerPeriod";
import {
  fingerprintCareerValue,
  isCompatibleCareerFactKind,
} from "@/domain/career-memory/evidencePolicy";
import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";
import {
  lockOwnerCareerExperience,
  rebuildCareerFactsInTransaction,
  type CareerTransactionClient,
} from "./careerFactService";
import {
  invalidateCareerExperienceInTransaction,
  requestCareerExperienceIndex,
} from "./careerIndexService";
import { getCareerMemoryReadiness } from "./careerMemoryReadinessService";

export type CareerCandidateFields = CareerCandidateFieldValues;

const candidateInclude = {
  evidence: { orderBy: { fieldPath: "asc" as const } },
  targetExperience: {
    select: { id: true, title: true, organization: true, roleTitle: true },
  },
};

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function candidatePayloadError(error: unknown): never {
  const details =
    typeof error === "object" && error && "flatten" in error
      ? (error as { flatten: () => unknown }).flatten()
      : undefined;
  throw serviceError(
    400,
    "CAREER_CANDIDATE_PAYLOAD_INVALID",
    "Career candidate fields exceed the accepted limits or have invalid values",
    details,
  );
}

function parseCreateCandidateFields(fields: CareerCandidateFields) {
  const parsed = careerCandidateCreateFieldsSchema.safeParse(fields);
  if (!parsed.success) return candidatePayloadError(parsed.error);
  return parsed.data;
}

function parsePatchCandidateFields(fields: Partial<CareerCandidateFields>) {
  const parsed = careerCandidatePatchFieldsSchema.safeParse(fields);
  if (!parsed.success) return candidatePayloadError(parsed.error);
  return parsed.data;
}

function datePolicyError(error: unknown): never {
  throw serviceError(
    400,
    "CAREER_DATE_POLICY_INVALID",
    error instanceof Error ? error.message : "Invalid career dates",
  );
}

function resolveCandidateDates(
  fields: Partial<CareerCandidateFields>,
  current?: Pick<
    ReturnType<typeof normalizeCareerDates>,
    "startDate" | "endDate" | "isCurrent"
  >,
) {
  try {
    const hasStructuredInput =
      hasOwn(fields, "startDate") ||
      hasOwn(fields, "endDate") ||
      hasOwn(fields, "isCurrent");
    if (hasStructuredInput) {
      return normalizeCareerDates({
        startDate: hasOwn(fields, "startDate")
          ? fields.startDate ?? null
          : current?.startDate ?? null,
        endDate: hasOwn(fields, "endDate")
          ? fields.endDate ?? null
          : current?.endDate ?? null,
        isCurrent: hasOwn(fields, "isCurrent")
          ? Boolean(fields.isCurrent)
          : current?.isCurrent ?? false,
      });
    }
    if (hasOwn(fields, "period")) {
      const period = fields.period?.trim();
      return period
        ? parseLegacyCareerPeriod(period)
        : normalizeCareerDates({ startDate: null, endDate: null, isCurrent: false });
    }
    return normalizeCareerDates({
      startDate: current?.startDate ?? null,
      endDate: current?.endDate ?? null,
      isCurrent: current?.isCurrent ?? false,
    });
  } catch (error) {
    return datePolicyError(error);
  }
}

function candidateData(
  fields: CareerCandidateFields,
  currentDates?: Pick<
    ReturnType<typeof normalizeCareerDates>,
    "startDate" | "endDate" | "isCurrent"
  >,
) {
  const normalized = normalizeCareerCandidateInput(fields);
  const dates = resolveCandidateDates(fields, currentDates);
  return {
    ...normalized,
    originalText: hasOwn(fields, "originalText")
      ? fields.originalText?.trim() || null
      : normalized.content,
    experienceType: fields.experienceType ?? CareerExperienceType.OTHER,
    period: deriveCareerPeriod(dates),
    startDate: dates.startDate,
    endDate: dates.endDate,
    isCurrent: dates.isCurrent,
  };
}

type CanonicalCandidateData = ReturnType<typeof candidateData>;
type EvidenceValue = { fieldPath: string; value: unknown };
type CandidateEvidenceInput = {
  fieldPath: string;
  excerpt: string;
  sourceChunkId?: string | null;
  origin?: CareerEvidenceOrigin | null;
  valueHash?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
};

function assertionExcerpt(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === "string" ? value : String(value);
}

function canonicalEvidenceValues(data: CanonicalCandidateData): EvidenceValue[] {
  const values: EvidenceValue[] = [
    {
      fieldPath: "summary",
      value: [data.title, data.content].filter(Boolean).join("\n"),
    },
    ...(data.organization !== null
      ? [{ fieldPath: "organization", value: data.organization }]
      : []),
    ...(data.roleTitle !== null
      ? [{ fieldPath: "roleTitle", value: data.roleTitle }]
      : []),
    { fieldPath: "experienceType", value: data.experienceType },
    { fieldPath: "startDate", value: data.startDate },
    { fieldPath: "endDate", value: data.endDate },
    { fieldPath: "isCurrent", value: data.isCurrent },
  ];
  for (const field of ["actions", "outcomes", "metrics", "tools", "tags"] as const) {
    data[field].forEach((value, index) => {
      values.push({ fieldPath: `${field}[${index}]`, value });
    });
  }
  return values;
}

function directAssertionValues(
  fields: CareerCandidateFields,
  data: CanonicalCandidateData,
) {
  return canonicalEvidenceValues(data).filter(({ fieldPath }) => {
    if (fieldPath === "summary") return true;
    if (fieldPath === "organization") return hasOwn(fields, "organization");
    if (fieldPath === "roleTitle") return hasOwn(fields, "roleTitle");
    if (fieldPath === "experienceType") return hasOwn(fields, "experienceType");
    if (fieldPath === "startDate") {
      return hasOwn(fields, "startDate") || hasOwn(fields, "period");
    }
    if (fieldPath === "endDate") {
      return hasOwn(fields, "endDate") || hasOwn(fields, "period");
    }
    if (fieldPath === "isCurrent") {
      return hasOwn(fields, "isCurrent") || hasOwn(fields, "period");
    }
    return hasOwn(fields, fieldPath.slice(0, fieldPath.indexOf("[")));
  });
}

function toAssertionEvidence(values: EvidenceValue[]) {
  return values.map(({ fieldPath, value }) => ({
    fieldPath,
    excerpt: assertionExcerpt(value),
    sourceChunkId: null,
    origin: CareerEvidenceOrigin.USER_ASSERTION,
    valueHash: fingerprintCareerValue(value),
    pageStart: null,
    pageEnd: null,
  }));
}

function valuesEqual(left: unknown, right: unknown) {
  try {
    return fingerprintCareerValue(left) === fingerprintCareerValue(right);
  } catch {
    return Object.is(left, right);
  }
}

async function assertQuestionOwner(
  tx: CareerTransactionClient,
  questionId: string | null | undefined,
  userId: string,
) {
  if (!questionId) return;
  const question = await tx.question.findFirst({
    where: { id: questionId, application: { userId } },
    select: { id: true },
  });
  if (!question) {
    throw serviceError(404, "CAREER_QUESTION_NOT_FOUND", "Question not found");
  }
}

export type CreateCareerCandidateInput = {
  userId: string;
  origin: CareerCandidateOrigin;
  mode: CareerCandidateMode;
  sourceId?: string | null;
  questionId?: string | null;
  captureProposalId?: string | null;
  finalAnswerDedupeKey?: string | null;
  targetExperienceId?: string | null;
  replacementSnapshot?: boolean;
  fields: CareerCandidateFields;
  evidence?: CandidateEvidenceInput[];
};

type PreparedCareerCandidateInput = Omit<CreateCareerCandidateInput, "fields"> & {
  fields: CareerCandidateFields;
  data: CanonicalCandidateData;
  evidence: CandidateEvidenceInput[];
};

function prepareCareerCandidateInput(
  input: CreateCareerCandidateInput,
): PreparedCareerCandidateInput {
  const fields = parseCreateCandidateFields(input.fields);
  const data = candidateData(fields);
  const directAssertions = directAssertionValues(fields, data);
  const evidence: CandidateEvidenceInput[] =
    input.origin === CareerCandidateOrigin.DIRECT_INPUT
      ? [
          ...(input.evidence ?? []),
          ...toAssertionEvidence(
            input.replacementSnapshot
              ? directAssertions.filter(
                  ({ value }) => value !== null && value !== undefined,
                )
              : directAssertions,
          ),
        ]
      : input.evidence?.length
        ? input.evidence
        : [
            {
              fieldPath: "summary",
              excerpt: fields.originalText?.trim() || data.content,
            },
          ];
  return { ...input, fields, data, evidence };
}

async function createCareerCandidateInTransaction(
  tx: CareerTransactionClient,
  input: PreparedCareerCandidateInput,
) {
  await assertQuestionOwner(tx, input.questionId, input.userId);
  const [source, target, proposal] = await Promise.all([
    input.sourceId
      ? tx.careerSource.findFirst({
          where: { id: input.sourceId, userId: input.userId, deletedAt: null },
          select: { id: true },
        })
      : null,
    input.targetExperienceId
      ? tx.experienceBrick.findFirst({
          where: { id: input.targetExperienceId, userId: input.userId },
          select: { id: true, userId: true },
        })
      : null,
    input.captureProposalId
      ? tx.careerCaptureProposal.findFirst({
          where: {
            id: input.captureProposalId,
            userId: input.userId,
            ...(input.questionId ? { questionId: input.questionId } : {}),
          },
          select: { id: true },
        })
      : null,
  ]);
  if (input.sourceId && !source) {
    throw serviceError(404, "CAREER_SOURCE_NOT_FOUND", "Career source not found");
  }
  if (input.captureProposalId && !proposal) {
    throw serviceError(
      404,
      "CAREER_CAPTURE_PROPOSAL_NOT_FOUND",
      "Career capture proposal not found",
    );
  }
  if (input.targetExperienceId && !target) {
    throw serviceError(
      404,
      "CAREER_TARGET_NOT_FOUND",
      "Career target experience not found",
    );
  }
  validateCareerCandidateMode({
    mode: input.mode,
    targetExperienceId: input.targetExperienceId ?? null,
    targetOwnerId: target?.userId ?? null,
    userId: input.userId,
  });
  const sourceChunkIds = [
    ...new Set(
      input.evidence
        .map((item) => item.sourceChunkId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (sourceChunkIds.length > 0) {
    const ownedChunkCount = await tx.careerSourceChunk.count({
      where: {
        id: { in: sourceChunkIds },
        userId: input.userId,
        ...(input.sourceId ? { sourceId: input.sourceId } : {}),
        source: { deletedAt: null },
      },
    });
    if (ownedChunkCount !== sourceChunkIds.length) {
      throw serviceError(
        403,
        "CAREER_EVIDENCE_FORBIDDEN",
        "Candidate evidence does not belong to the owner",
      );
    }
  }
  return tx.careerExperienceCandidate.create({
    data: {
      userId: input.userId,
      origin: input.origin,
      mode: input.mode,
      sourceId: input.sourceId ?? null,
      questionId: input.questionId ?? null,
      captureProposalId: input.captureProposalId ?? null,
      finalAnswerDedupeKey: input.finalAnswerDedupeKey ?? null,
      targetExperienceId: input.targetExperienceId ?? null,
      replacementSnapshot: input.replacementSnapshot ?? false,
      ...input.data,
      evidence: {
        create: input.evidence.map((item) => ({
          fieldPath: item.fieldPath,
          excerpt: item.excerpt.trim(),
          sourceChunkId: item.sourceChunkId ?? null,
          origin:
            item.origin ??
            (item.sourceChunkId ? CareerEvidenceOrigin.SOURCE_EXCERPT : null),
          valueHash: item.valueHash ?? null,
          pageStart: item.pageStart ?? null,
          pageEnd: item.pageEnd ?? null,
        })),
      },
    },
    include: candidateInclude,
  });
}

export async function createCareerCandidate(input: CreateCareerCandidateInput) {
  const prepared = prepareCareerCandidateInput(input);
  return prisma.$transaction((tx) => createCareerCandidateInTransaction(tx, prepared));
}

/**
 * Pre-validates every shared candidate field before opening one bounded transaction.
 * The internal helper accepts the transaction client, so batch writes cannot nest
 * transactions and a failure in any later candidate rolls back the whole batch.
 */
export async function createCareerCandidatesAtomic(
  inputs: readonly CreateCareerCandidateInput[],
) {
  if (inputs.length > CAREER_CANDIDATE_BATCH_LIMIT) {
    throw serviceError(
      400,
      "CAREER_CANDIDATE_BATCH_LIMIT_EXCEEDED",
      `Career candidate batches are limited to ${CAREER_CANDIDATE_BATCH_LIMIT} items`,
    );
  }
  const prepared = inputs.map(prepareCareerCandidateInput);
  return prisma.$transaction(async (tx) => {
    const candidates = [];
    for (const candidate of prepared) {
      candidates.push(await createCareerCandidateInTransaction(tx, candidate));
    }
    return candidates;
  });
}

export async function createCareerCandidatesInTransaction(
  tx: CareerTransactionClient,
  inputs: readonly CreateCareerCandidateInput[],
) {
  if (inputs.length > CAREER_CANDIDATE_BATCH_LIMIT) {
    throw serviceError(
      400,
      "CAREER_CANDIDATE_BATCH_LIMIT_EXCEEDED",
      `Career candidate batches are limited to ${CAREER_CANDIDATE_BATCH_LIMIT} items`,
    );
  }
  const prepared = inputs.map(prepareCareerCandidateInput);
  const candidates = [];
  for (const candidate of prepared) {
    candidates.push(await createCareerCandidateInTransaction(tx, candidate));
  }
  return candidates;
}

export async function listCareerCandidates(input: {
  userId: string;
  status?: CareerCandidateStatus;
  sourceId?: string;
}) {
  return prisma.careerExperienceCandidate.findMany({
    where: {
      userId: input.userId,
      status: input.status,
      sourceId: input.sourceId,
    },
    include: candidateInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function getCareerCandidate(input: {
  candidateId: string;
  userId: string;
}) {
  const candidate = await prisma.careerExperienceCandidate.findFirst({
    where: { id: input.candidateId, userId: input.userId },
    include: candidateInclude,
  });
  if (!candidate) {
    throw serviceError(404, "CAREER_CANDIDATE_NOT_FOUND", "Career candidate not found");
  }
  return candidate;
}

export async function updateCareerCandidate(input: {
  candidateId: string;
  userId: string;
  mode?: CareerCandidateMode;
  targetExperienceId?: string | null;
  fields: Partial<CareerCandidateFields>;
}) {
  const fields = parsePatchCandidateFields(input.fields);
  return prisma.$transaction(async (tx) => {
    const current = await tx.careerExperienceCandidate.findFirst({
      where: { id: input.candidateId, userId: input.userId },
      include: candidateInclude,
    });
    if (!current) {
      throw serviceError(
        404,
        "CAREER_CANDIDATE_NOT_FOUND",
        "Career candidate not found",
      );
    }
    if (current.status !== CareerCandidateStatus.PENDING) {
      throw serviceError(
        409,
        "CAREER_CANDIDATE_DECIDED",
        "Decided candidate cannot be edited",
      );
    }

    const mode = input.mode ?? current.mode;
    const targetId =
      input.targetExperienceId === undefined
        ? current.targetExperienceId
        : input.targetExperienceId;

    const dates = resolveCandidateDates(fields, {
      startDate: current.startDate,
      endDate: current.endDate,
      isCurrent: current.isCurrent,
    });
    const merged = candidateData({
      title: fields.title ?? current.title,
      content: fields.content ?? current.content,
      originalText:
        fields.originalText === undefined ? current.originalText : fields.originalText,
      organization:
        fields.organization === undefined ? current.organization : fields.organization,
      roleTitle: fields.roleTitle === undefined ? current.roleTitle : fields.roleTitle,
      experienceType: fields.experienceType ?? current.experienceType,
      startDate: dates.startDate,
      endDate: dates.endDate,
      isCurrent: dates.isCurrent,
      actions: fields.actions ?? current.actions,
      outcomes: fields.outcomes ?? current.outcomes,
      metrics: fields.metrics ?? current.metrics,
      tools: fields.tools ?? current.tools,
      tags: fields.tags ?? current.tags,
    });

    const before = new Map(
      canonicalEvidenceValues({
        title: current.title,
        content: current.content,
        originalText: current.originalText ?? current.content,
        organization: current.organization,
        roleTitle: current.roleTitle,
        experienceType: current.experienceType,
        period: current.period,
        startDate: current.startDate,
        endDate: current.endDate,
        isCurrent: current.isCurrent,
        actions: current.actions,
        outcomes: current.outcomes,
        metrics: current.metrics,
        tools: current.tools,
        tags: current.tags,
      }).map((item) => [item.fieldPath, item.value]),
    );
    const afterValues = canonicalEvidenceValues(merged);
    const after = new Map(afterValues.map((item) => [item.fieldPath, item.value]));
    const changedScalars = [
      "summary",
      "organization",
      "roleTitle",
      "experienceType",
      "startDate",
      "endDate",
      "isCurrent",
    ].filter((fieldPath) => !valuesEqual(before.get(fieldPath), after.get(fieldPath)));
    const changedLists = (
      ["actions", "outcomes", "metrics", "tools", "tags"] as const
    ).filter((field) => !valuesEqual(current[field], merged[field]));

    const claim = await tx.careerExperienceCandidate.updateMany({
      where: {
        id: current.id,
        userId: input.userId,
        status: CareerCandidateStatus.PENDING,
        updatedAt: current.updatedAt,
      },
      data: { ...merged, mode, targetExperienceId: targetId },
    });
    if (claim.count !== 1) {
      const latest = await tx.careerExperienceCandidate.findFirst({
        where: { id: current.id, userId: input.userId },
        select: { status: true },
      });
      if (!latest) {
        throw serviceError(
          404,
          "CAREER_CANDIDATE_NOT_FOUND",
          "Career candidate not found",
        );
      }
      if (latest.status !== CareerCandidateStatus.PENDING) {
        throw serviceError(
          409,
          "CAREER_CANDIDATE_DECIDED",
          "Decided candidate cannot be edited",
        );
      }
      throw serviceError(
        409,
        "CAREER_CANDIDATE_UPDATE_CONFLICT",
        "Career candidate changed while it was being edited",
      );
    }

    const claimed = await tx.careerExperienceCandidate.findUniqueOrThrow({
      where: { id: current.id },
      include: candidateInclude,
    });
    const target = claimed.targetExperienceId
      ? await tx.experienceBrick.findFirst({
          where: { id: claimed.targetExperienceId, userId: input.userId },
          select: { userId: true },
        })
      : null;
    validateCareerCandidateMode({
      mode: claimed.mode,
      targetExperienceId: claimed.targetExperienceId,
      targetOwnerId: target?.userId ?? null,
      userId: input.userId,
    });

    if (changedScalars.length > 0 || changedLists.length > 0) {
      await tx.careerCandidateEvidence.deleteMany({
        where: {
          candidateId: current.id,
          OR: [
            ...(changedScalars.length > 0
              ? [{ fieldPath: { in: changedScalars } }]
              : []),
            ...changedLists.map((field) => ({
              fieldPath: { startsWith: `${field}[` },
            })),
          ],
        },
      });
      const explicitlyAssertedScalars = changedScalars.filter(
        (fieldPath) =>
          !["startDate", "endDate", "isCurrent"].includes(fieldPath) ||
          hasOwn(fields, fieldPath) ||
          hasOwn(fields, "period"),
      );
      const replacements = afterValues.filter(
        ({ fieldPath }) =>
          explicitlyAssertedScalars.includes(fieldPath) ||
          changedLists.some((field) => fieldPath.startsWith(`${field}[`)),
      );
      const evidenceReplacements = current.replacementSnapshot
        ? replacements.filter(({ value }) => value !== null && value !== undefined)
        : replacements;
      if (evidenceReplacements.length > 0) {
        await tx.careerCandidateEvidence.createMany({
          data: toAssertionEvidence(evidenceReplacements).map((item) => ({
            candidateId: current.id,
            ...item,
          })),
        });
      }
    }

    return tx.careerExperienceCandidate.findUniqueOrThrow({
      where: { id: current.id },
      include: candidateInclude,
    });
  });
}

function mergeUnique(left: readonly string[], right: readonly string[]) {
  return [...new Set([...left, ...right].map((item) => item.trim()).filter(Boolean))];
}

type CandidateWithEvidence = Prisma.CareerExperienceCandidateGetPayload<{
  include: { evidence: true };
}>;

function hasExactTimelineEvidence(
  candidate: CandidateWithEvidence,
  fieldPath: "startDate" | "endDate" | "isCurrent",
  value: Date | boolean | null,
) {
  const valueHash = fingerprintCareerValue(value);
  return candidate.evidence.some(
    (evidence) => evidence.fieldPath === fieldPath && evidence.valueHash === valueHash,
  );
}

function remapAugmentEvidence(input: {
  candidate: CandidateWithEvidence;
  target: Prisma.ExperienceBrickGetPayload<Record<string, never>>;
  finalExperience: Prisma.ExperienceBrickGetPayload<Record<string, never>>;
}) {
  const listFields = new Set(["actions", "outcomes", "metrics", "tools", "tags"]);
  return input.candidate.evidence.flatMap((evidence) => {
    const match = evidence.fieldPath.match(/^(actions|outcomes|metrics|tools|tags)\[(\d+)\]$/);
    if (!match || !listFields.has(match[1])) return [evidence];
    const field = match[1] as "actions" | "outcomes" | "metrics" | "tools" | "tags";
    const candidateValue = input.candidate[field][Number(match[2])];
    if (
      !candidateValue ||
      fingerprintCareerValue(candidateValue) !== evidence.valueHash
    ) {
      return [];
    }
    const finalIndices = input.finalExperience[field].flatMap((value, index) =>
      fingerprintCareerValue(value) === evidence.valueHash ? [index] : [],
    );
    return finalIndices.length === 1
      ? [{ ...evidence, fieldPath: `${field}[${finalIndices[0]}]` }]
      : [];
  });
}

async function idempotentDecisionOutcome(input: {
  tx: CareerTransactionClient;
  candidate: CandidateWithEvidence;
  decision: "APPROVE" | "REJECT";
}) {
  const expected =
    input.decision === "APPROVE"
      ? CareerCandidateStatus.APPROVED
      : CareerCandidateStatus.REJECTED;
  if (input.candidate.status !== expected) {
    throw serviceError(
      409,
      "CAREER_CANDIDATE_DECIDED",
      "Candidate was already decided differently",
    );
  }
  const existingFact = await input.tx.careerFactEvidence.findFirst({
    where: { candidateId: input.candidate.id },
    select: { fact: { select: { experienceId: true } } },
  });
  return {
    candidate: input.candidate,
    experienceId:
      existingFact?.fact.experienceId ?? input.candidate.targetExperienceId,
    idempotent: true,
    memoryChanged: false,
  };
}

export async function decideCareerCandidate(input: {
  candidateId: string;
  userId: string;
  decision: "APPROVE" | "REJECT";
  rejectionReason?: string;
}) {
  const outcome = await prisma.$transaction(async (tx) => {
    const initial = await tx.careerExperienceCandidate.findFirst({
      where: { id: input.candidateId, userId: input.userId },
      include: { evidence: true },
    });
    if (!initial) {
      throw serviceError(
        404,
        "CAREER_CANDIDATE_NOT_FOUND",
        "Career candidate not found",
      );
    }
    if (initial.status !== CareerCandidateStatus.PENDING) {
      return idempotentDecisionOutcome({
        tx,
        candidate: initial,
        decision: input.decision,
      });
    }

    const reason = input.rejectionReason?.trim();
    if (input.decision === "REJECT" && !reason) {
      throw serviceError(
        400,
        "CAREER_REJECTION_REASON_REQUIRED",
        "Rejection reason is required",
      );
    }

    const claimedStatus =
      input.decision === "APPROVE"
        ? CareerCandidateStatus.APPROVED
        : CareerCandidateStatus.REJECTED;
    const claim = await tx.careerExperienceCandidate.updateMany({
      where: {
        id: initial.id,
        userId: input.userId,
        status: CareerCandidateStatus.PENDING,
      },
      data: {
        status: claimedStatus,
        reviewedByUserId: input.userId,
        decidedAt: new Date(),
        rejectionReason: input.decision === "REJECT" ? reason : null,
      },
    });
    if (claim.count === 0) {
      const decided = await tx.careerExperienceCandidate.findFirstOrThrow({
        where: { id: initial.id, userId: input.userId },
        include: { evidence: true },
      });
      return idempotentDecisionOutcome({
        tx,
        candidate: decided,
        decision: input.decision,
      });
    }

    let candidate = await tx.careerExperienceCandidate.findUniqueOrThrow({
      where: { id: initial.id },
      include: { evidence: true },
    });
    if (input.decision === "REJECT") {
      return {
        candidate,
        experienceId: candidate.targetExperienceId,
        idempotent: false,
        memoryChanged: false,
      };
    }

    let target: Prisma.ExperienceBrickGetPayload<Record<string, never>> | null = null;
    if (candidate.targetExperienceId) {
      const targetLocked = await lockOwnerCareerExperience({
        tx,
        userId: input.userId,
        experienceId: candidate.targetExperienceId,
      });
      if (targetLocked) {
        target = await tx.experienceBrick.findFirst({
          where: { id: candidate.targetExperienceId, userId: input.userId },
        });
      }
    }
    validateCareerCandidateMode({
      mode: candidate.mode,
      targetExperienceId: candidate.targetExperienceId,
      targetOwnerId: target?.userId ?? null,
      userId: input.userId,
    });

    let experienceId: string;
    let memoryChanged = false;
    let supportChanged = false;
    let rebuildEvidence = candidate.evidence;

    if (candidate.mode === CareerCandidateMode.CREATE) {
      const source = candidate.sourceId
        ? await tx.careerSource.findFirst({
            where: { id: candidate.sourceId, userId: input.userId },
            select: { teamId: true },
          })
        : null;
      const experience = await tx.experienceBrick.create({
        data: {
          userId: input.userId,
          teamId: source?.teamId ?? null,
          title: candidate.title,
          content: candidate.content,
          originalText: candidate.originalText ?? candidate.content,
          organization: candidate.organization,
          roleTitle: candidate.roleTitle,
          experienceType: candidate.experienceType,
          period: deriveCareerPeriod(
            normalizeCareerDates({
              startDate: candidate.startDate,
              endDate: candidate.endDate,
              isCurrent: candidate.isCurrent,
            }),
          ),
          startDate: candidate.startDate,
          endDate: candidate.endDate,
          isCurrent: candidate.isCurrent,
          actions: candidate.actions,
          outcomes: candidate.outcomes,
          metrics: candidate.metrics,
          tools: candidate.tools,
          tags: candidate.tags,
          source:
            candidate.origin === CareerCandidateOrigin.PDF
              ? BrickSource.FILE_PARSE
              : candidate.origin === CareerCandidateOrigin.FINAL_ANSWER
                ? BrickSource.AI_EXTRACT
                : BrickSource.MANUAL,
          memoryStatus: CareerExperienceStatus.CONFIRMED,
          confirmedAt: new Date(),
          confirmedByUserId: input.userId,
        },
      });
      experienceId = experience.id;
      candidate = await tx.careerExperienceCandidate.update({
        where: { id: candidate.id },
        data: { targetExperienceId: experience.id },
        include: { evidence: true },
      });
      memoryChanged = true;
    } else if (candidate.mode === CareerCandidateMode.AUGMENT && target) {
      let finalExperience: Prisma.ExperienceBrickGetPayload<Record<string, never>>;
      if (candidate.replacementSnapshot) {
        const dates = normalizeCareerDates({
          startDate: candidate.startDate,
          endDate: candidate.endDate,
          isCurrent: candidate.isCurrent,
        });
        finalExperience = await tx.experienceBrick.update({
          where: { id: target.id, userId: input.userId },
          data: {
            title: candidate.title,
            content: candidate.content,
            originalText: candidate.originalText,
            organization: candidate.organization,
            roleTitle: candidate.roleTitle,
            experienceType: candidate.experienceType,
            period: deriveCareerPeriod(dates),
            startDate: dates.startDate,
            endDate: dates.endDate,
            isCurrent: dates.isCurrent,
            actions: candidate.actions,
            outcomes: candidate.outcomes,
            metrics: candidate.metrics,
            tools: candidate.tools,
            tags: candidate.tags,
            memoryStatus: CareerExperienceStatus.CONFIRMED,
            confirmedAt: new Date(),
            confirmedByUserId: input.userId,
            embeddingContentHash: null,
            embeddingModel: null,
            embeddedAt: null,
          },
        });
      } else {
        const content = target.content.includes(candidate.content)
          ? target.content
          : `${target.content}\n${candidate.content}`.trim();
        const dates = normalizeCareerDates({
          startDate: hasExactTimelineEvidence(candidate, "startDate", candidate.startDate)
            ? candidate.startDate
            : target.startDate,
          endDate: hasExactTimelineEvidence(candidate, "endDate", candidate.endDate)
            ? candidate.endDate
            : target.endDate,
          isCurrent: hasExactTimelineEvidence(candidate, "isCurrent", candidate.isCurrent)
            ? candidate.isCurrent
            : target.isCurrent,
        });
        finalExperience = await tx.experienceBrick.update({
          where: { id: target.id, userId: input.userId },
          data: {
            title: candidate.title || target.title,
            content,
            originalText: candidate.originalText ?? target.originalText,
            organization: candidate.organization ?? target.organization,
            roleTitle: candidate.roleTitle ?? target.roleTitle,
            experienceType:
              candidate.experienceType === CareerExperienceType.OTHER
                ? target.experienceType
                : candidate.experienceType,
            period: deriveCareerPeriod(dates),
            startDate: dates.startDate,
            endDate: dates.endDate,
            isCurrent: dates.isCurrent,
            actions: mergeUnique(target.actions, candidate.actions),
            outcomes: mergeUnique(target.outcomes, candidate.outcomes),
            metrics: mergeUnique(target.metrics, candidate.metrics),
            tools: mergeUnique(target.tools, candidate.tools),
            tags: mergeUnique(target.tags, candidate.tags),
            memoryStatus: CareerExperienceStatus.CONFIRMED,
            confirmedAt: new Date(),
            confirmedByUserId: input.userId,
            embeddingContentHash: null,
            embeddingModel: null,
            embeddedAt: null,
          },
        });
      }
      rebuildEvidence = remapAugmentEvidence({
        candidate,
        target,
        finalExperience,
      });
      experienceId = target.id;
      memoryChanged = true;
    } else if (target) {
      experienceId = target.id;
    } else {
      throw serviceError(
        404,
        "CAREER_TARGET_NOT_FOUND",
        "Target experience not found",
      );
    }

    if (memoryChanged) {
      await rebuildCareerFactsInTransaction({
        tx,
        userId: input.userId,
        experienceId,
        candidateId: candidate.id,
        evidence: rebuildEvidence,
      });
    } else {
      const facts = await tx.careerFact.findMany({
        where: {
          userId: input.userId,
          experienceId,
          active: true,
        },
      });
      const chunkIds = candidate.evidence
        .map((evidence) => evidence.sourceChunkId)
        .filter((id): id is string => Boolean(id));
      const ownedChunks = chunkIds.length
        ? await tx.careerSourceChunk.findMany({
            where: {
              id: { in: chunkIds },
              userId: input.userId,
              source: { deletedAt: null },
            },
            select: { id: true },
          })
        : [];
      const ownedChunkIds = new Set(ownedChunks.map((chunk) => chunk.id));

      for (const evidence of candidate.evidence) {
        if (!evidence.valueHash) continue;
        const fact = facts.find(
          (item) =>
            item.fieldPath === evidence.fieldPath &&
            isCompatibleCareerFactKind(item.kind, evidence.fieldPath) &&
            fingerprintCareerValue(item.value) === evidence.valueHash,
        );
        if (!fact) continue;
        await tx.careerFactEvidence.create({
          data: {
            factId: fact.id,
            candidateId: candidate.id,
            sourceChunkId: evidence.sourceChunkId,
            fieldPath: evidence.fieldPath,
            origin: evidence.origin,
            valueHash: evidence.valueHash,
            excerpt: evidence.excerpt,
            pageStart: evidence.pageStart,
            pageEnd: evidence.pageEnd,
          },
        });
        const trustedProvenance =
          evidence.origin === CareerEvidenceOrigin.USER_ASSERTION ||
          (evidence.origin === CareerEvidenceOrigin.SOURCE_EXCERPT &&
            Boolean(evidence.sourceChunkId) &&
            ownedChunkIds.has(evidence.sourceChunkId!));
        if (
          trustedProvenance &&
          fact.trustStatus !== CareerFactTrustStatus.TRUSTED
        ) {
          await tx.careerFact.update({
            where: { id: fact.id },
            data: { trustStatus: CareerFactTrustStatus.TRUSTED },
          });
        }
        supportChanged = true;
      }
    }

    let indexTarget = null;
    if (memoryChanged || supportChanged) {
      await tx.user.update({
        where: { id: input.userId },
        data: { careerMemoryVersion: { increment: 1 } },
      });
      indexTarget = await invalidateCareerExperienceInTransaction({
        tx,
        userId: input.userId,
        experienceId,
      });
    }
    return {
      candidate,
      experienceId,
      idempotent: false,
      memoryChanged,
      indexTarget,
    };
  });

  await requestCareerExperienceIndex(
    "indexTarget" in outcome ? outcome.indexTarget : null,
  );
  const [readiness, remainingCandidateCount, memory, experience] =
    await Promise.all([
      getCareerMemoryReadiness(input.userId),
      prisma.careerExperienceCandidate.count({
        where: {
          userId: input.userId,
          status: CareerCandidateStatus.PENDING,
          ...(outcome.candidate.sourceId
            ? { sourceId: outcome.candidate.sourceId }
            : {}),
        },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: { careerMemoryVersion: true },
      }),
      outcome.experienceId
        ? prisma.experienceBrick.findFirst({
            where: { id: outcome.experienceId, userId: input.userId },
            select: {
              id: true,
              embeddingRevision: true,
              embeddedRevision: true,
              embeddingContentHash: true,
            },
          })
        : null,
    ]);
  return {
    ...outcome,
    remainingCandidateCount,
    registrationStatus: readiness.registrationStatus,
    nextAction: readiness.nextAction,
    memoryVersion: memory.careerMemoryVersion,
    memoryDelta:
      outcome.memoryChanged || ("supportChanged" in outcome && outcome.supportChanged)
        ? { changed: true, experienceId: outcome.experienceId }
        : { changed: false, experienceId: outcome.experienceId },
    indexStatus: !experience
      ? null
      : experience.embeddingContentHash &&
          experience.embeddedRevision === experience.embeddingRevision
        ? "READY"
        : "STALE",
  };
}
