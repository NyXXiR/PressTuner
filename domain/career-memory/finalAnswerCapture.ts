import { createHash } from "node:crypto";

import type { CareerCandidateMode } from "@prisma/client";

import { canonicalizeCareerAnswer } from "./answerHash";

export type FinalAnswerCaptureItem = {
  mode: CareerCandidateMode;
  targetExperienceId?: string | null;
  title: string;
  content: string;
  originalText?: string | null;
  organization?: string | null;
  roleTitle?: string | null;
  period?: string | null;
  actions?: string[];
  outcomes?: string[];
  metrics?: string[];
  tools?: string[];
  tags?: string[];
  evidence: Array<{ fieldPath: string; excerpt: string }>;
};

function normalizeList(values: readonly string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function normalizeFinalAnswerCaptureItems(
  answer: string,
  items: readonly FinalAnswerCaptureItem[],
) {
  const canonicalAnswer = canonicalizeCareerAnswer(answer);
  const byKey = new Map<
    string,
    FinalAnswerCaptureItem & { finalAnswerDedupeKey: string }
  >();
  for (const item of items) {
    const normalized = {
      ...item,
      targetExperienceId: item.targetExperienceId ?? null,
      title: item.title.trim(),
      content: item.content.trim(),
      originalText: item.originalText?.trim() || item.content.trim(),
      organization: item.organization?.trim() || null,
      roleTitle: item.roleTitle?.trim() || null,
      period: item.period?.trim() || null,
      actions: normalizeList(item.actions),
      outcomes: normalizeList(item.outcomes),
      metrics: normalizeList(item.metrics),
      tools: normalizeList(item.tools),
      tags: normalizeList(item.tags),
      evidence: item.evidence
        .map((evidence) => ({
          fieldPath: evidence.fieldPath.trim(),
          excerpt: evidence.excerpt.trim(),
        }))
        .filter(
          (evidence) =>
            evidence.fieldPath &&
            evidence.excerpt &&
            canonicalAnswer.includes(
              canonicalizeCareerAnswer(evidence.excerpt),
            ),
        ),
    };
    if (!normalized.title || !normalized.content || normalized.evidence.length === 0) {
      continue;
    }
    if (
      normalized.mode === "CREATE" &&
      normalized.targetExperienceId
    ) {
      continue;
    }
    if (
      normalized.mode !== "CREATE" &&
      !normalized.targetExperienceId
    ) {
      continue;
    }
    const finalAnswerDedupeKey = createHash("sha256")
      .update(
        JSON.stringify({
          mode: normalized.mode,
          targetExperienceId: normalized.targetExperienceId,
          title: normalized.title.toLocaleLowerCase("en-US"),
          content: normalized.content.toLocaleLowerCase("en-US"),
          organization: normalized.organization?.toLocaleLowerCase("en-US"),
          roleTitle: normalized.roleTitle?.toLocaleLowerCase("en-US"),
          actions: normalized.actions,
          outcomes: normalized.outcomes,
          metrics: normalized.metrics,
          tools: normalized.tools,
          tags: normalized.tags,
        }),
      )
      .digest("hex");
    if (!byKey.has(finalAnswerDedupeKey)) {
      byKey.set(finalAnswerDedupeKey, {
        ...normalized,
        finalAnswerDedupeKey,
      });
    }
  }
  return [...byKey.values()];
}
