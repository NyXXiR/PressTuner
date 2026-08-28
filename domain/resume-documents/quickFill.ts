import { z } from "zod";

import {
  isResumeDocumentApplyModeAllowed,
  ResumeDocumentCandidatePayloadSchema,
  resumeDocumentPayloadSectionKind,
  type ResumeDocumentApplyMode,
  type ResumeDocumentCandidateKind,
  type ResumeDocumentCandidatePayload,
} from "./importCandidate";
import type { SectionKind } from "./model";

export const QuickFillSectionSchema = z.object({
  id: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["identity", "eligibility", "narrative", "items", "tags"]),
});

export const ResumeDocumentQuickFillRequestSchema = z.object({
  text: z.string().trim().min(20).max(20_000),
  instruction: z.string().trim().max(1_000).optional().default(""),
  sections: z.array(QuickFillSectionSchema).min(1).max(12),
}).superRefine((value, context) => {
  const ids = new Set<string>();
  for (const [index, section] of value.sections.entries()) {
    if (ids.has(section.id)) {
      context.addIssue({ code: "custom", path: ["sections", index, "id"], message: "Duplicate section" });
    }
    ids.add(section.id);
  }
});

export type QuickFillSection = z.infer<typeof QuickFillSectionSchema>;

const RawCandidateSchema = z.object({
  targetSectionId: z.string().trim().min(1).max(200),
  confidence: z.number().finite().optional().default(0),
  warnings: z.array(z.string().trim().min(1).max(500)).max(20).optional().default([]),
  evidenceExcerpt: z.string().trim().min(1).max(2_000),
  fieldPath: z.string().trim().min(1).max(200).optional().default("payload"),
  payload: z.unknown(),
});

const RawExtractionSchema = z.object({
  candidates: z.array(RawCandidateSchema).max(50),
});

export type NormalizedQuickFillCandidate = {
  targetSectionId: string;
  targetSectionKind: SectionKind;
  recommendedSectionId: string;
  applyMode: ResumeDocumentApplyMode;
  kind: ResumeDocumentCandidateKind;
  confidence: number;
  warnings: string[];
  payload: ResumeDocumentCandidatePayload;
  evidenceExcerpt: string;
  fieldPath: string;
};

function compactEvidence(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function groundedExcerpt(sourceText: string, excerpt: string) {
  const normalizedExcerpt = compactEvidence(excerpt);
  return normalizedExcerpt.length >= 4 && compactEvidence(sourceText).includes(normalizedExcerpt);
}

function defaultApplyMode(payload: ResumeDocumentCandidatePayload): ResumeDocumentApplyMode {
  if (payload.type === "item") return "APPEND";
  if (payload.type === "tags" || payload.type === "narrative") return "MERGE";
  return "FILL_EMPTY";
}

function candidateKind(payload: ResumeDocumentCandidatePayload): ResumeDocumentCandidateKind {
  if (payload.type === "narrative") return "NARRATIVE";
  if (payload.type === "item") return "ITEM";
  if (payload.type === "tags") return "TAGS";
  if (payload.type === "eligibility-field") return "ELIGIBILITY_FIELD";
  return "IDENTITY_FIELD";
}

export function normalizeQuickFillExtraction(
  raw: unknown,
  sourceText: string,
  sections: readonly QuickFillSection[],
): NormalizedQuickFillCandidate[] {
  const parsed = RawExtractionSchema.safeParse(raw);
  if (!parsed.success) return [];
  const selected = new Map(sections.map((section) => [section.id, section]));
  const seen = new Set<string>();
  const result: NormalizedQuickFillCandidate[] = [];
  for (const candidate of parsed.data.candidates) {
    const section = selected.get(candidate.targetSectionId);
    if (!section || !groundedExcerpt(sourceText, candidate.evidenceExcerpt)) continue;
    const payloadResult = ResumeDocumentCandidatePayloadSchema.safeParse(candidate.payload);
    if (!payloadResult.success) continue;
    const payload = payloadResult.data;
    if (resumeDocumentPayloadSectionKind(payload) !== section.kind) continue;
    const applyMode = defaultApplyMode(payload);
    if (!isResumeDocumentApplyModeAllowed(payload, applyMode)) continue;
    const key = `${section.id}:${JSON.stringify(payload)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      targetSectionId: section.id,
      targetSectionKind: section.kind,
      recommendedSectionId: section.id,
      applyMode,
      kind: candidateKind(payload),
      confidence: Math.max(0, Math.min(1, candidate.confidence)),
      warnings: candidate.warnings,
      payload,
      evidenceExcerpt: candidate.evidenceExcerpt,
      fieldPath: candidate.fieldPath,
    });
  }
  return result;
}
