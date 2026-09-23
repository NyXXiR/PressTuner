import { z } from "zod";
import type { DraftConfiguration } from "./configuration";

export const DRAFT_EVALUATOR_REVISION = "press-draft-checks/v1";

// Validate the raw model response before the legacy generator can normalize invalid output.
export const draftOutputSchema = z.object({
  title: z.string().trim().min(1),
  lead: z.string().trim().min(1),
  fact: z.string(),
  paragraphs: z.array(z.object({ text: z.string(), importance: z.number().int().min(1).max(5) })),
  closing: z.string(),
  usedFactIds: z.array(z.string().min(1)).optional(),
});

export type DraftCheck = {
  id: string;
  status: "PASS" | "WARN" | "BLOCK" | "NOT_EVALUABLE";
  reason: string;
  evidence: string[];
};

/** These are narrow syntactic checks, never a replacement for production factual verification. */
export function evaluateDraftGuardrails(
  output: z.infer<typeof draftOutputSchema>,
  acceptedFactIds: string[],
  config: DraftConfiguration,
): DraftCheck[] {
  const sections = [output.title, output.lead, output.fact, ...output.paragraphs.map((p) => p.text), output.closing];
  const allowed = new Set(acceptedFactIds);
  const unknown = [...new Set((output.usedFactIds ?? []).filter((id) => !allowed.has(id)))];
  return [
    {
      id: "accepted-fact-ids", status: unknown.length ? "BLOCK" : "PASS", evidence: unknown,
      reason: "Returned fact IDs must belong to the accepted input set; this does not prove claim support or citation completeness.",
    },
    ...config.requiredPhrases.map((phrase, index): DraftCheck => ({
      id: `required-phrase:${index}`, status: sections.some((s) => s.includes(phrase)) ? "PASS" : "WARN",
      reason: "Required literal phrase presence only; paraphrases and factual meaning are not evaluated.", evidence: [phrase],
    })),
    ...config.forbiddenPhrases.map((phrase, index): DraftCheck => ({
      id: `forbidden-phrase:${index}`, status: sections.some((s) => s.includes(phrase)) ? "WARN" : "PASS",
      reason: "Forbidden literal phrase match only; style preferences warn and do not authorize finalization.", evidence: [phrase],
    })),
    { id: "factual-support", status: "NOT_EVALUABLE", reason: "Requires claim-to-source verification, including style-example leakage; not implemented in this slice.", evidence: [] },
    { id: "requested-style", status: "NOT_EVALUABLE", reason: "Requires human review or a calibrated semantic evaluator; prompt inclusion is not style compliance.", evidence: [] },
  ];
}
