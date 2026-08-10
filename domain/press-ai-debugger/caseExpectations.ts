import { createHash } from "node:crypto";
import { z } from "zod";
import { pressCreationProcess } from "./processRegistry";

export const MATCHER_SUBJECTS = ["transition_text", "source_input_text", "source_output_text", "target_payload_text", "source_output_review_notes", "target_payload_selected_note_ids", "source_output_review_note_count", "target_payload_selected_note_count"] as const;
export type MatcherSubject = (typeof MATCHER_SUBJECTS)[number];
export const MATCHER_OPERATORS = ["contains", "not_contains", "equals", "exists", "not_empty", "count_gte", "count_lte", "number_eq", "number_gte", "number_lte"] as const;
export type MatcherOperator = (typeof MATCHER_OPERATORS)[number];
export type CustomExpectation = Readonly<{ id: string; edgeId?: string; matcher: Readonly<{ version: 1; subject: MatcherSubject; operator: MatcherOperator; operand?: string | number }>; verdict: "WARN" | "BLOCK" }>;
export type ExpectationValidationState = "UNTESTED" | "UNPROVEN" | "DETECTED" | "VERIFIED";

const textSubjects = new Set<MatcherSubject>(["transition_text", "source_input_text", "source_output_text", "target_payload_text"]);
const collectionSubjects = new Set<MatcherSubject>(["source_output_review_notes", "target_payload_selected_note_ids"]);
const numberSubjects = new Set<MatcherSubject>(["source_output_review_note_count", "target_payload_selected_note_count"]);
const textOperators = new Set<MatcherOperator>(["contains", "not_contains", "equals", "exists", "not_empty"]);
const collectionOperators = new Set<MatcherOperator>(["equals", "exists", "not_empty", "count_gte", "count_lte"]);
const numberOperators = new Set<MatcherOperator>(["equals", "exists", "number_eq", "number_gte", "number_lte"]);
const operandOperators = new Set<MatcherOperator>(["contains", "not_contains", "equals", "count_gte", "count_lte", "number_eq", "number_gte", "number_lte"]);

const matcherSchema = z.object({ version: z.literal(1), subject: z.enum(MATCHER_SUBJECTS), operator: z.enum(MATCHER_OPERATORS), operand: z.union([z.string().max(1000), z.number().finite()]).optional() }).strict();
const typedSchema = z.object({ id: z.string().trim().min(1).max(100), edgeId: z.string().trim().min(1).max(100).optional(), matcher: matcherSchema, verdict: z.enum(["WARN", "BLOCK"]).default("WARN") }).strict();
const legacySchema = z.object({ id: z.string().trim().min(1).max(100), edgeId: z.string().trim().min(1).max(100).optional(), field: z.enum(["contains", "notContains"]), value: z.string().min(1).max(1000), verdict: z.enum(["WARN", "BLOCK"]).default("WARN") }).strict();

function validateCompatibility(value: CustomExpectation): CustomExpectation {
  const { subject, operator, operand } = value.matcher;
  if (value.edgeId && !pressCreationProcess.edges.some((edge) => edge.id === value.edgeId)) throw new Error("PRESS_AI_DEBUG_EXPECTATION_EDGE_INVALID");
  const compatible = textSubjects.has(subject) ? textOperators.has(operator) : collectionSubjects.has(subject) ? collectionOperators.has(operator) : numberSubjects.has(subject) && numberOperators.has(operator);
  if (!compatible) throw new Error("PRESS_AI_DEBUG_EXPECTATION_OPERATOR_INVALID");
  if (operandOperators.has(operator) !== (operand !== undefined)) throw new Error("PRESS_AI_DEBUG_EXPECTATION_OPERAND_INVALID");
  if (["contains", "not_contains"].includes(operator) && typeof operand !== "string") throw new Error("PRESS_AI_DEBUG_EXPECTATION_OPERAND_INVALID");
  if (["count_gte", "count_lte", "number_eq", "number_gte", "number_lte"].includes(operator) && typeof operand !== "number") throw new Error("PRESS_AI_DEBUG_EXPECTATION_OPERAND_INVALID");
  if (operator === "equals" && textSubjects.has(subject) && typeof operand !== "string") throw new Error("PRESS_AI_DEBUG_EXPECTATION_OPERAND_INVALID");
  if (operator === "equals" && !textSubjects.has(subject) && typeof operand !== "number") throw new Error("PRESS_AI_DEBUG_EXPECTATION_OPERAND_INVALID");
  return value;
}

export function normalizeCustomExpectation(input: unknown): CustomExpectation {
  const legacy = legacySchema.safeParse(input);
  if (legacy.success) return validateCompatibility({ id: legacy.data.id, ...(legacy.data.edgeId ? { edgeId: legacy.data.edgeId } : {}), matcher: { version: 1, subject: "transition_text", operator: legacy.data.field === "contains" ? "contains" : "not_contains", operand: legacy.data.value }, verdict: legacy.data.verdict });
  const typed = typedSchema.parse(input);
  return validateCompatibility({ id: typed.id, ...(typed.edgeId ? { edgeId: typed.edgeId } : {}), matcher: { version: 1, subject: typed.matcher.subject, operator: typed.matcher.operator, ...(typed.matcher.operand !== undefined ? { operand: typed.matcher.operand } : {}) }, verdict: typed.verdict });
}

export function normalizeCustomExpectations(input: unknown): CustomExpectation[] {
  if (!Array.isArray(input) || input.length > 50) throw new Error("PRESS_AI_DEBUG_EXPECTATIONS_INVALID");
  const result = input.map(normalizeCustomExpectation);
  if (new Set(result.map((item) => item.id)).size !== result.length) throw new Error("PRESS_AI_DEBUG_EXPECTATION_ID_DUPLICATE");
  return result;
}

export const CustomExpectationSchema = z.unknown().transform((input, context) => {
  try { return normalizeCustomExpectation(input); } catch (error) { context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "PRESS_AI_DEBUG_EXPECTATION_INVALID" }); return z.NEVER; }
});
export const CustomExpectationsSchema = z.array(CustomExpectationSchema).max(50).superRefine((items, context) => {
  if (new Set(items.map((item) => item.id)).size !== items.length) context.addIssue({ code: "custom", message: "PRESS_AI_DEBUG_EXPECTATION_ID_DUPLICATE" });
});

export function customExpectationFingerprint(value: CustomExpectation): string {
  const canonical = JSON.stringify({ edgeId: value.edgeId ?? null, matcher: { version: 1, subject: value.matcher.subject, operator: value.matcher.operator, operand: value.matcher.operand ?? null }, verdict: value.verdict });
  return createHash("sha256").update(canonical).digest("hex");
}

type ValidationObservation = Readonly<{ origin: "MANDATORY" | "CASE_EXPECTATION"; verdict: "PASS" | "WARN" | "BLOCK"; evidence: unknown; createdAt: Date | string }>;
export function deriveExpectationValidation(fingerprint: string, observations: readonly ValidationObservation[]) {
  const matching = observations.filter((item) => item.origin === "CASE_EXPECTATION" && typeof item.evidence === "object" && item.evidence !== null && (item.evidence as { ruleFingerprint?: unknown }).ruleFingerprint === fingerprint).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const last = matching.at(-1);
  if (!last) return { state: "UNTESTED" as const, lastVerdict: null, lastObservationAt: null };
  const detectedBeforeLastPass = last.verdict === "PASS" && matching.slice(0, -1).some((item) => item.verdict === "WARN" || item.verdict === "BLOCK");
  const state: ExpectationValidationState = last.verdict === "WARN" || last.verdict === "BLOCK" ? "DETECTED" : detectedBeforeLastPass ? "VERIFIED" : "UNPROVEN";
  return { state, lastVerdict: last.verdict, lastObservationAt: new Date(last.createdAt).toISOString() };
}
