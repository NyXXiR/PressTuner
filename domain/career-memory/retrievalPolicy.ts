export function buildCareerRetrievalQuery(input: {
  questionText: string;
  companyName?: string | null;
  jobTitle?: string | null;
  jdText?: string | null;
  instruction?: string | null;
}) {
  return [
    ["Question", input.questionText],
    ["Company", input.companyName],
    ["Role", input.jobTitle],
    ["Job description", input.jdText],
    ["Instruction", input.instruction],
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([label, value]) => `${label}: ${value.trim()}`)
    .join("\n");
}

export function isRetrievableCareerExperience(
  experience: {
    userId: string;
    memoryStatus: string;
    embeddingContentHash: string | null;
    currentContentHash: string;
    embeddingModel: string | null;
    expectedEmbeddingModel: string;
  },
  userId: string,
) {
  return (
    experience.userId === userId &&
    experience.memoryStatus === "CONFIRMED" &&
    Boolean(experience.embeddingContentHash) &&
    experience.embeddingContentHash === experience.currentContentHash &&
    experience.embeddingModel === experience.expectedEmbeddingModel
  );
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

export function collectGroundableCareerFactIds(input: {
  facts: readonly { id: string }[];
  experiences: readonly {
    facts: readonly { id: string }[];
  }[];
}) {
  return unique([
    ...input.facts.map((fact) => fact.id),
    ...input.experiences.flatMap((experience) =>
      experience.facts.map((fact) => fact.id),
    ),
  ]);
}

export function validateGroundingSelection(input: {
  usedExperienceIds: readonly string[];
  usedFactIds: readonly string[];
  retrievedExperienceIds: readonly string[];
  retrievedFactIds: readonly string[];
}) {
  const allowedExperiences = new Set(input.retrievedExperienceIds);
  const allowedFacts = new Set(input.retrievedFactIds);
  const experienceIds = unique(input.usedExperienceIds);
  const factIds = unique(input.usedFactIds);
  const unknown = [
    ...experienceIds.filter((id) => !allowedExperiences.has(id)),
    ...factIds.filter((id) => !allowedFacts.has(id)),
  ];
  if (unknown.length > 0) {
    throw new Error(`Unknown grounding ID: ${unknown.join(", ")}`);
  }
  return { experienceIds, factIds };
}

export const SELECTED_EXPERIENCE_RRF_BOOST = 0.02;

export function applySelectedExperienceBoost<
  T extends { readonly id: string; readonly score: number },
>(rows: readonly T[], selectedExperienceIds: readonly string[]) {
  const selected = new Set(selectedExperienceIds);
  return rows
    .map((row) => ({
      ...row,
      score:
        Number(row.score) +
        (selected.has(row.id) ? SELECTED_EXPERIENCE_RRF_BOOST : 0),
      isPreferred: selected.has(row.id),
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.id.localeCompare(right.id),
    );
}
