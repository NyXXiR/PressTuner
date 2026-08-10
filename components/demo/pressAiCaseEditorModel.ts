import type { CustomExpectation, MatcherOperator, MatcherSubject } from "@/domain/press-ai-debugger/caseExpectations";

const text: MatcherOperator[] = ["contains", "not_contains", "equals", "exists", "not_empty"];
const collection: MatcherOperator[] = ["equals", "exists", "not_empty", "count_gte", "count_lte"];
const number: MatcherOperator[] = ["equals", "exists", "number_eq", "number_gte", "number_lte"];
export function compatibleMatcherOperators(subject: MatcherSubject): MatcherOperator[] { return subject.includes("_count") ? number : subject.includes("notes") || subject.includes("note_ids") ? collection : text; }
export function matcherNeedsOperand(operator: MatcherOperator) { return !["exists", "not_empty"].includes(operator); }
export function matcherOperandIsNumber(operator: MatcherOperator, subject: MatcherSubject) { return subject.includes("_count") || ["count_gte", "count_lte"].includes(operator) || (operator === "equals" && (subject.includes("notes") || subject.includes("note_ids"))); }
export function createCaseExpectationRow(edgeId: string, idFactory = () => crypto.randomUUID()): CustomExpectation { return { id: idFactory(), edgeId, matcher: { version: 1, subject: "transition_text", operator: "contains", operand: "" }, verdict: "WARN" }; }
export function sameExpectationDefinition(left: CustomExpectation, right: CustomExpectation) {
  return left.edgeId === right.edgeId
    && left.verdict === right.verdict
    && left.matcher.version === right.matcher.version
    && left.matcher.subject === right.matcher.subject
    && left.matcher.operator === right.matcher.operator
    && left.matcher.operand === right.matcher.operand;
}
