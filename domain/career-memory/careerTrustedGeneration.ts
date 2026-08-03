export type CareerGenerationFactInput = {
  readonly id: string;
  readonly userId: string;
  readonly experienceId: string;
  readonly experienceStatus: string;
  readonly kind: string;
  readonly fieldPath: string;
  readonly value: unknown;
  readonly active: boolean;
  readonly trustStatus: string;
};

export type CareerRankingMetadata = {
  readonly id: string;
  readonly score?: number;
  readonly [key: string]: unknown;
};

export type TrustedCareerFact = {
  readonly id: string;
  readonly experienceId: string;
  readonly kind: string;
  readonly fieldPath: string;
  readonly value: unknown;
};

export type TrustedCareerExperience = {
  readonly id: string;
  readonly score?: number;
  readonly facts: readonly TrustedCareerFact[];
};

/**
 * Converts database rows into the only experience DTO allowed at generation
 * boundaries. The projection is intentionally constructive: ranking rows may
 * carry legacy/raw columns, but only id/score and exact trusted facts survive.
 */
export function projectTrustedCareerExperiences(input: {
  readonly userId: string;
  readonly facts: readonly CareerGenerationFactInput[];
  readonly rankings?: readonly CareerRankingMetadata[];
}): TrustedCareerExperience[] {
  const factsByExperience = new Map<string, TrustedCareerFact[]>();
  for (const fact of input.facts) {
    if (
      fact.userId !== input.userId ||
      !fact.active ||
      fact.trustStatus !== "TRUSTED" ||
      fact.experienceStatus !== "CONFIRMED"
    ) {
      continue;
    }
    const trustedFact: TrustedCareerFact = {
      id: fact.id,
      experienceId: fact.experienceId,
      kind: fact.kind,
      fieldPath: fact.fieldPath,
      value: fact.value,
    };
    const existing = factsByExperience.get(fact.experienceId) ?? [];
    existing.push(trustedFact);
    factsByExperience.set(fact.experienceId, existing);
  }

  const rankings: readonly CareerRankingMetadata[] =
    input.rankings ??
    Array.from(factsByExperience.keys(), (id) => ({ id }));
  const emitted = new Set<string>();
  const projected: TrustedCareerExperience[] = [];
  for (const ranking of rankings) {
    if (emitted.has(ranking.id)) continue;
    emitted.add(ranking.id);
    const facts = factsByExperience.get(ranking.id);
    if (!facts?.length) continue;
    projected.push({
      id: ranking.id,
      ...(typeof ranking.score === "number" && Number.isFinite(ranking.score)
        ? { score: ranking.score }
        : {}),
      facts,
    });
  }
  return projected;
}

export function serializeTrustedCareerExperiences(
  experiences: readonly TrustedCareerExperience[],
) {
  return JSON.stringify(
    experiences.map((experience) => ({
      experienceId: experience.id,
      ...(typeof experience.score === "number" ? { score: experience.score } : {}),
      trustedFacts: experience.facts.map((fact) => ({
        factId: fact.id,
        kind: fact.kind,
        fieldPath: fact.fieldPath,
        value: fact.value,
      })),
    })),
    null,
    2,
  );
}

export function buildTrustedCareerGenerationContext(input: {
  readonly experiences: readonly TrustedCareerExperience[];
}) {
  return serializeTrustedCareerExperiences(input.experiences);
}

export function buildResumeStrategyPrompt(input: {
  readonly questionsText: string;
  readonly experiences: readonly TrustedCareerExperience[];
}) {
  return `다음 자기소개서 문항들에 대한 작성 전략을 세워주세요.

문항 목록:
${input.questionsText}

검증된 경력 사실 (experienceId와 TRUSTED fact만 제공됨):
${serializeTrustedCareerExperiences(input.experiences)}

각 문항마다 가장 적합한 experienceId를 1~2개 연결하고, 작성 가이드라인을 제공해주세요.`;
}

export function buildResumeSuggestionPrompt(input: {
  readonly companyName: string;
  readonly jobTitle: string;
  readonly questionText: string;
  readonly currentSelectedExperienceIds: readonly string[];
  readonly instruction: string;
  readonly experiences: readonly TrustedCareerExperience[];
}) {
  return `지원 회사: ${input.companyName}
지원 직무: ${input.jobTitle}
문항: ${input.questionText}
현재 선택된 experienceId: ${input.currentSelectedExperienceIds.join(", ") || "없음"}
사용자 지시: ${input.instruction}

검증된 경력 사실 (experienceId와 TRUSTED fact만 제공됨):
${serializeTrustedCareerExperiences(input.experiences)}`;
}
