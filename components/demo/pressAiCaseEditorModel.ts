import type { CustomExpectation, MatcherOperator, MatcherSubject } from "@/domain/press-ai-debugger/caseExpectations";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import type { PressAiDebugCaseExpectation } from "@/lib/pressAiProcessDebuggerClient";

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

export function addCaseExpectation(
  expectations: readonly CustomExpectation[],
  selectedEdgeId: string,
  idFactory?: () => string,
) {
  return [...expectations, createCaseExpectationRow(selectedEdgeId, idFactory)];
}

export function updateCaseExpectation(
  expectations: readonly CustomExpectation[],
  id: string,
  next: CustomExpectation,
) {
  return expectations.map((item) => item.id === id ? { ...next, id } : item);
}

export function deleteCaseExpectation(
  expectations: readonly CustomExpectation[],
  id: string,
) {
  return expectations.filter((item) => item.id !== id);
}

export function orderExpectationsForEdge(
  expectations: readonly CustomExpectation[],
  selectedEdgeId: string,
) {
  const rank = (item: CustomExpectation) => item.edgeId === selectedEdgeId ? 0 : item.edgeId ? 2 : 1;
  return expectations.map((item, index) => ({ item, index })).sort((left, right) => rank(left.item) - rank(right.item) || left.index - right.index).map(({ item }) => item);
}

export function scopeLabel(edgeId?: string) {
  if (!edgeId) return "모든 전이에 적용 (레거시/전역 계약)";
  const edge = pressCreationProcess.edges.find((item) => item.id === edgeId);
  if (!edge) return `알 수 없는 전이 (${edgeId})`;
  const source = pressCreationProcess.nodes.find((item) => item.id === edge.source)?.label ?? edge.source;
  const target = pressCreationProcess.nodes.find((item) => item.id === edge.target)?.label ?? edge.target;
  return `${source} → ${target}`;
}

const UNTESTED_VALIDATION = {
  state: "UNTESTED" as const,
  lastVerdict: null,
  lastObservationAt: null,
};

export function expectationValidationForDraft(
  draft: CustomExpectation,
  stored?: PressAiDebugCaseExpectation,
) {
  return stored && sameExpectationDefinition(draft, stored)
    ? stored.validation
    : UNTESTED_VALIDATION;
}

export function isCaseEditorFormValid(args: {
  checkpointId: string;
  name: string;
  expectations: readonly CustomExpectation[];
}) {
  if (!args.checkpointId || !args.name.trim() || args.expectations.length > 50) return false;
  const ids = args.expectations.map((item) => item.id.trim());
  if (ids.some((id) => !id || id.length > 100) || new Set(ids).size !== ids.length) return false;
  return args.expectations.every((item) => {
    if (item.edgeId && !pressCreationProcess.edges.some((edge) => edge.id === item.edgeId)) return false;
    if (!compatibleMatcherOperators(item.matcher.subject).includes(item.matcher.operator)) return false;
    const needsOperand = matcherNeedsOperand(item.matcher.operator);
    if (!needsOperand) return item.matcher.operand === undefined;
    if (matcherOperandIsNumber(item.matcher.operator, item.matcher.subject)) {
      return typeof item.matcher.operand === "number" && Number.isFinite(item.matcher.operand);
    }
    return typeof item.matcher.operand === "string"
      && Boolean(item.matcher.operand.trim())
      && item.matcher.operand.length <= 1000;
  });
}
