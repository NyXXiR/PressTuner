export type CareerFactKindValue =
  | "ORGANIZATION"
  | "TITLE"
  | "TYPE"
  | "START_DATE"
  | "END_DATE"
  | "ACTION"
  | "OUTCOME"
  | "METRIC"
  | "TOOL"
  | "TAG"
  | "SUMMARY";

export type CareerExperienceProjectionInput = {
  title: string;
  content: string;
  organization?: string | null;
  roleTitle?: string | null;
  experienceType: string;
  startDate?: Date | null;
  endDate?: Date | null;
  isCurrent: boolean;
  actions: readonly string[];
  outcomes: readonly string[];
  metrics: readonly string[];
  tools: readonly string[];
  tags: readonly string[];
};

export type ProjectedCareerFact = {
  kind: CareerFactKindValue;
  value: string;
  normalizedValue: string;
  fieldPath: string;
};

export function normalizeCareerFactValue(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function toDateValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function projectCareerFacts(
  experience: CareerExperienceProjectionInput,
): ProjectedCareerFact[] {
  const facts: Array<Omit<ProjectedCareerFact, "normalizedValue">> = [];
  const push = (
    kind: CareerFactKindValue,
    value: string | null | undefined,
    fieldPath: string,
  ) => {
    const trimmed = value?.trim();
    if (trimmed) facts.push({ kind, value: trimmed, fieldPath });
  };
  push("ORGANIZATION", experience.organization, "organization");
  push("TITLE", experience.roleTitle, "roleTitle");
  push("TYPE", experience.experienceType, "experienceType");
  if (experience.startDate) {
    push("START_DATE", toDateValue(experience.startDate), "startDate");
  }
  if (experience.endDate) {
    push("END_DATE", toDateValue(experience.endDate), "endDate");
  }
  for (const [index, value] of experience.actions.entries()) {
    push("ACTION", value, `actions[${index}]`);
  }
  for (const [index, value] of experience.outcomes.entries()) {
    push("OUTCOME", value, `outcomes[${index}]`);
  }
  for (const [index, value] of experience.metrics.entries()) {
    push("METRIC", value, `metrics[${index}]`);
  }
  for (const [index, value] of experience.tools.entries()) {
    push("TOOL", value, `tools[${index}]`);
  }
  for (const [index, value] of experience.tags.entries()) {
    push("TAG", value, `tags[${index}]`);
  }
  push(
    "SUMMARY",
    [experience.title.trim(), experience.content.trim()].filter(Boolean).join("\n"),
    "summary",
  );
  return facts.map((fact) => ({
    ...fact,
    normalizedValue: normalizeCareerFactValue(fact.value),
  }));
}
