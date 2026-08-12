import { pressCreationProcess } from "./processRegistry";
import { extractPressDomainFacts, pressDomainContentText } from "./domainFacts";
import { hashTelemetryValue } from "@/domain/ai-telemetry/privacy";
import { customExpectationFingerprint, normalizeCustomExpectation, type CustomExpectation } from "./caseExpectations";
import type { EvidenceFactConsistencyEvaluation } from "@/domain/article/evidenceFactConsistency";

export type GuardrailVerdict = "PASS" | "WARN" | "BLOCK";
export type GuardrailObservation = Readonly<{ guardrailId: string; origin: "MANDATORY" | "CASE_EXPECTATION"; expected: string; observed: string; reason: string; evidence: unknown; verdict: GuardrailVerdict; displayOrder: number }>;
export type CaseExpectation = CustomExpectation | Readonly<{ id: string; edgeId?: string; field: "contains" | "notContains"; value: string; verdict?: "WARN" | "BLOCK" }>;

function observation(id: string, verdict: GuardrailVerdict, expected: string, observed: string, reason: string, evidence: unknown, displayOrder: number, origin: GuardrailObservation["origin"] = "MANDATORY"): GuardrailObservation { return { guardrailId: id, origin, expected, observed, reason, evidence, verdict, displayOrder }; }

export function rollUpGuardrailVerdict(items: readonly Pick<GuardrailObservation, "verdict">[]): GuardrailVerdict { return items.some((item) => item.verdict === "BLOCK") ? "BLOCK" : items.some((item) => item.verdict === "WARN") ? "WARN" : "PASS"; }

function text(value: unknown) { return (["raw", "brief", "draft"] as const).map((mode) => pressDomainContentText(value, mode)).filter(Boolean).join("\n"); }
function stringIds(value: unknown, key: "notes" | "selectedNoteIds") {
  const candidate = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
  if (!Array.isArray(candidate)) return undefined;
  return candidate.flatMap((item) => typeof item === "string" ? [item] : item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" ? [(item as { id: string }).id] : []);
}
function subjectValue(expectation: CustomExpectation, args: { sourceInput: unknown; sourceOutput: unknown; targetPayload: unknown }) {
  switch (expectation.matcher.subject) {
    case "transition_text": return [text(args.sourceOutput), text(args.targetPayload)].filter(Boolean).join("\n");
    case "source_input_text": return text(args.sourceInput);
    case "source_output_text": return text(args.sourceOutput);
    case "target_payload_text": return text(args.targetPayload);
    case "source_output_review_notes": return stringIds(args.sourceOutput, "notes");
    case "target_payload_selected_note_ids": return stringIds(args.targetPayload, "selectedNoteIds");
    case "source_output_review_note_count": return stringIds(args.sourceOutput, "notes")?.length;
    case "target_payload_selected_note_count": return stringIds(args.targetPayload, "selectedNoteIds")?.length;
  }
}
function matches(expectation: CustomExpectation, value: string | string[] | number | undefined) {
  const { operator, operand } = expectation.matcher;
  if (operator === "exists") return value !== undefined;
  if (operator === "not_empty") return typeof value === "string" ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : false;
  if (operator === "contains") return typeof value === "string" && value.includes(String(operand));
  if (operator === "not_contains") return typeof value === "string" && !value.includes(String(operand));
  if (operator === "equals") return typeof value === "string" ? value === operand : Array.isArray(value) ? value.length === operand : value === operand;
  const numeric = Array.isArray(value) ? value.length : value;
  if (typeof numeric !== "number" || typeof operand !== "number") return false;
  if (operator === "count_gte" || operator === "number_gte") return numeric >= operand;
  if (operator === "count_lte" || operator === "number_lte") return numeric <= operand;
  return operator === "number_eq" && numeric === operand;
}

export function evaluatePressTransitionGuardrails(args: { edgeId: string; sourceInput: unknown; sourceOutput: unknown; targetPayload: unknown; attempt: { teamId: string; articleId: string }; article?: { id: string; teamId: string | null; type: string; createdAt?: Date }; expectations?: readonly CaseExpectation[]; evidenceFactConsistency?: EvidenceFactConsistencyEvaluation }): { verdict: GuardrailVerdict; observations: GuardrailObservation[] } {
  const edge = pressCreationProcess.edges.find((item) => item.id === args.edgeId);
  if (!edge) throw new Error("PRESS_AI_PROCESS_EDGE_INVALID");
  const target = typeof args.targetPayload === "string" ? args.targetPayload : JSON.stringify(args.targetPayload ?? "");
  const observations: GuardrailObservation[] = [];
  edge.mandatoryGuardrailIds.forEach((id, index) => {
    let verdict: GuardrailVerdict = "PASS"; let reason = "필수 조건을 충족했습니다."; let expected = id; let observed = "satisfied"; let evidence: unknown = { edgeId: edge.id };
    if (id === "article-team-ownership" || id === "fresh-press-release") {
      const valid = args.article?.id === args.attempt.articleId && args.article.teamId === args.attempt.teamId && args.article.type === "PRESS_RELEASE";
      verdict = valid ? "PASS" : "BLOCK"; expected = "attempt team 소유의 새 PRESS_RELEASE Article"; observed = args.article ? `${args.article.teamId}/${args.article.type}` : "missing"; reason = valid ? reason : "Article 소유권 또는 유형이 시도와 일치하지 않습니다."; evidence = args.article ?? null;
    } else if (id.includes("grounding") || id.includes("preservation")) {
      const sourceMode = edge.id === "brief-draft" ? "raw" : "brief"; const outputMode = edge.id === "brief-draft" ? "brief" : "draft";
      const extracted = extractPressDomainFacts(args.sourceInput, sourceMode); const outputText = pressDomainContentText(args.sourceOutput, outputMode);
      const checked = extracted.facts; const missing = checked.filter((fact) => !outputText.includes(fact.normalizedValue));
      verdict = missing.length ? (id.includes("critical") && checked.length > 0 && missing.length === checked.length ? "BLOCK" : "WARN") : "PASS";
      expected = `입력의 수치·날짜·인용·제한 보존 (${checked.length} facts${extracted.overflow ? `, +${extracted.overflow} overflow` : ""})`;
      observed = missing.length ? `누락 ${missing.length}개: ${missing.slice(0, 8).map((fact) => fact.normalizedValue.slice(0, 80)).join(", ")}${missing.length > 8 ? ` 외 ${missing.length - 8}개` : ""}` : "critical facts preserved";
      reason = missing.length ? "입력의 중요 사실 일부가 출력에서 확인되지 않습니다." : reason;
      evidence = { checked: checked.slice(0, 32).map((fact) => ({ sourceField: fact.sourceField, factKind: fact.kind, factValue: fact.normalizedValue, factHash: fact.hash, matchStatus: missing.includes(fact) ? "MISSING" : "MATCHED", reasonCode: missing.includes(fact) ? "FACT_MISSING" : "FACT_PRESERVED" })), evidenceOverflow: Math.max(0, checked.length - 32), missingCount: missing.length };
    } else if (id === "press-structure") {
      const value = args.sourceOutput as Record<string, unknown>; const valid = Boolean(value && typeof value.title === "string" && value.title.trim() && target.includes("plain") && /\S/.test(target));
      verdict = valid ? "PASS" : "WARN"; expected = "비어 있지 않은 제목과 본문 구조"; observed = valid ? "title/plain present" : "title 또는 plain 부족"; reason = valid ? reason : "복구 가능한 보도자료 구조 결함입니다."; evidence = { title: value?.title ?? null };
    } else if (id === "evidence-fact-consistency") {
      const assessment = args.evidenceFactConsistency;
      verdict = assessment?.verdict === "BLOCK" ? "BLOCK" : "PASS";
      expected = "현재 사실 근거와 비교 가능한 원고 주장";
      observed = assessment ? assessment.verdict.toLocaleLowerCase("en-US") : "not_evaluable";
      reason = assessment?.verdict === "BLOCK"
        ? "현재 사실 근거와 원고 주장 또는 근거 권위 사이에 충돌이 있습니다."
        : assessment?.verdict === "PASS"
          ? reason
          : "안전하게 평가할 수 있는 비교 근거가 없습니다.";
      evidence = assessment?.verdict === "PASS" || assessment?.verdict === "BLOCK"
        ? assessment.details
        : null;
    } else if (id === "review-note-selection") {
      const selected = (args.targetPayload as Record<string, unknown>)?.selectedNoteIds; const ids = Array.isArray(selected) ? selected.filter((item): item is string => typeof item === "string") : []; const notes = (args.sourceOutput as Record<string, unknown>)?.notes; const available = new Set(Array.isArray(notes) ? notes.map((item) => (item as { id?: unknown })?.id).filter((item): item is string => typeof item === "string") : []); const valid = ids.length > 0 && ids.length === new Set(ids).size && ids.every((item) => available.has(item));
      verdict = valid ? "PASS" : "BLOCK"; expected = "저장된 리뷰 출력에 존재하는 고유 노트 ID"; observed = ids.join(", ") || "none"; reason = valid ? reason : "선택이 비었거나 오래되었거나 중복되었습니다."; evidence = { selected: ids, available: [...available] };
    } else if (id === "rewrite-instruction-bounds") {
      const instruction = (args.targetPayload as Record<string, unknown>)?.userInstruction; const valid = typeof instruction === "string" && instruction.trim().length > 0 && instruction.length <= 1000; verdict = valid ? "PASS" : "BLOCK"; expected = "1..1000자 수정 지침"; observed = typeof instruction === "string" ? `${instruction.length} chars` : "missing"; reason = valid ? reason : "수정 지침 범위를 벗어났습니다."; evidence = { length: typeof instruction === "string" ? instruction.length : null };
    } else if (id === "review-checkpoint-lineage") {
      const valid = edge.source === "draft-review"; verdict = valid ? "PASS" : "BLOCK"; expected = "동일 리뷰 체크포인트에서 파생"; observed = edge.source; reason = valid ? reason : "리뷰 체크포인트 계보가 일치하지 않습니다.";
    }
    observations.push(observation(id, verdict, expected, observed, reason, evidence, index));
  });
  const custom = (args.expectations ?? []).flatMap((stored) => { try { return [normalizeCustomExpectation(stored)]; } catch { return []; } }).filter((item) => !item.edgeId || item.edgeId === edge.id).sort((a, b) => a.id.localeCompare(b.id));
  custom.forEach((item, index) => {
    const value = subjectValue(item, args); const pass = matches(item, value); const operand = item.matcher.operand;
    observations.push(observation(item.id, pass ? "PASS" : item.verdict, `${item.matcher.subject} ${item.matcher.operator}${operand === undefined ? "" : ` ${String(operand).slice(0, 240)}`}`, pass ? "matched" : "not matched", pass ? "케이스 기대값을 충족했습니다." : "케이스 기대값을 충족하지 못했습니다.", { ruleFingerprint: customExpectationFingerprint(item), ...(operand === undefined ? {} : { operandHash: hashTelemetryValue(String(operand)) }) }, edge.mandatoryGuardrailIds.length + index, "CASE_EXPECTATION"));
  });
  return { verdict: rollUpGuardrailVerdict(observations), observations };
}
