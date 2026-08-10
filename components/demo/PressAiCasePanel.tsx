"use client";

import { useState } from "react";
import type { CustomExpectation, MatcherOperator, MatcherSubject } from "@/domain/press-ai-debugger/caseExpectations";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import type { PressAiDebugCase } from "@/lib/pressAiProcessDebuggerClient";
import {
  addCaseExpectation,
  compatibleMatcherOperators,
  deleteCaseExpectation,
  expectationValidationForDraft,
  isCaseEditorFormValid,
  matcherNeedsOperand,
  matcherOperandIsNumber,
  orderExpectationsForEdge,
  scopeLabel,
  updateCaseExpectation,
} from "./pressAiCaseEditorModel";

const MATCHER_SUBJECTS: MatcherSubject[] = ["transition_text", "source_input_text", "source_output_text", "target_payload_text", "source_output_review_notes", "target_payload_selected_note_ids", "source_output_review_note_count", "target_payload_selected_note_count"];
const subjectLabels: Record<MatcherSubject, string> = {
  transition_text: "전환 전체 텍스트", source_input_text: "출발 노드 입력 텍스트", source_output_text: "출발 노드 출력 텍스트", target_payload_text: "도착 페이로드 텍스트",
  source_output_review_notes: "리뷰 노트 목록", target_payload_selected_note_ids: "선택 노트 ID 목록", source_output_review_note_count: "리뷰 노트 수", target_payload_selected_note_count: "선택 노트 수",
};
const operatorLabels: Record<MatcherOperator, string> = { contains: "포함", not_contains: "미포함", equals: "같음", exists: "존재", not_empty: "비어 있지 않음", count_gte: "개수 이상", count_lte: "개수 이하", number_eq: "숫자 같음", number_gte: "숫자 이상", number_lte: "숫자 이하" };

export type PressAiCaseActionPhase = "IDLE" | "SAVING" | "SAVED" | "BRANCHING" | "BRANCHED" | "PARTIAL_FAILURE";

type PressAiCasePanelProps = {
  checkpoints: readonly { id: string; nodeId: string }[];
  attachedCase: PressAiDebugCase | null;
  loading: boolean;
  error: string | null;
  saved: boolean;
  busy: boolean;
  selectedEdgeId: string;
  preferredCheckpointId: string;
  retryNodeId: string;
  actionStatus: PressAiCaseActionPhase;
  onSave: (checkpointId: string, name: string, expectations: CustomExpectation[]) => void;
  onSaveAndBranch: (checkpointId: string, name: string, expectations: CustomExpectation[], retryNodeId: string) => void;
};

const phaseCopy: Record<PressAiCaseActionPhase, string | null> = {
  IDLE: null,
  SAVING: "사용자 정의 규칙을 저장하고 있습니다…",
  SAVED: "규칙 저장이 완료되었습니다.",
  BRANCHING: "저장된 리비전에서 자식 시도를 만들고 있습니다…",
  BRANCHED: "자식 시도가 열렸습니다. 상단 작업 버튼에서 소스 노드를 실행하세요.",
  PARTIAL_FAILURE: "규칙은 저장되었습니다. 저장을 반복하지 않고 분기만 다시 시도할 수 있습니다.",
};

function PressAiCasePanelForm(props: PressAiCasePanelProps) {
  const [checkpointId, setCheckpointId] = useState(props.preferredCheckpointId || props.attachedCase?.sourceCheckpoint.id || props.checkpoints.at(-1)?.id || "");
  const [name, setName] = useState(props.attachedCase?.name ?? "새 전이 검증 케이스");
  const [expectations, setExpectations] = useState<CustomExpectation[]>(() => props.attachedCase?.expectations.map((item) => ({ id: item.id, ...(item.edgeId ? { edgeId: item.edgeId } : {}), matcher: item.matcher, verdict: item.verdict })) ?? []);
  const ordered = orderExpectationsForEdge(expectations, props.selectedEdgeId);
  const valid = isCaseEditorFormValid({ checkpointId, name, expectations });
  const sourceNode = pressCreationProcess.nodes.find((node) => node.id === props.retryNodeId);
  const update = (id: string, next: CustomExpectation) => setExpectations((items) => updateCaseExpectation(items, id, next));

  return (
    <section className="rounded-xl border border-primary/25 bg-background p-4" aria-labelledby="press-ai-custom-rules-heading">
      <h3 id="press-ai-custom-rules-heading" className="font-black">사용자 정의 규칙 편집</h3>
      <p className="mt-1 text-xs text-muted-foreground">matcher-v1 규칙만 편집합니다. 필수 가드레일은 위의 읽기 전용 근거에 유지됩니다.</p>
      <p className="mt-1 text-[11px] text-muted-foreground">검증 상태: UNTESTED · UNPROVEN · DETECTED · VERIFIED</p>
      {props.loading ? <p role="status" className="mt-2 text-xs">연결된 케이스를 불러오는 중입니다…</p> : null}
      {props.error ? <p role="alert" className="mt-2 text-xs text-rose-600">{props.error}</p> : null}
      {props.saved ? <p role="status" className="mt-2 text-xs text-emerald-700">규칙이 현재 케이스에 저장되었습니다. 변경된 정의는 새 관찰 전까지 UNTESTED입니다.</p> : null}
      {phaseCopy[props.actionStatus] ? <p role="status" className={`mt-2 text-xs font-bold ${props.actionStatus === "PARTIAL_FAILURE" ? "text-amber-700 dark:text-amber-300" : "text-primary"}`}>{phaseCopy[props.actionStatus]}</p> : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-bold text-muted-foreground">케이스 이름
          <input aria-label="케이스 이름" value={name} onChange={(event) => setName(event.target.value)} className="pt-input mt-1 min-h-11 px-3 text-foreground" placeholder="케이스 이름" />
        </label>
        <label className="text-xs font-bold text-muted-foreground">소스 체크포인트
          <select aria-label="소스 체크포인트" value={checkpointId} onChange={(event) => setCheckpointId(event.target.value)} className="pt-input mt-1 min-h-11 px-3 text-foreground">
            <option value="">체크포인트 선택</option>
            {props.checkpoints.map((item) => <option key={item.id} value={item.id}>{pressCreationProcess.nodes.find((node) => node.id === item.nodeId)?.label ?? item.nodeId}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 space-y-3">
        {ordered.map((item, index) => {
          const stored = props.attachedCase?.expectations.find((candidate) => candidate.id === item.id);
          const validation = expectationValidationForDraft(item, stored);
          const unrelated = Boolean(item.edgeId && item.edgeId !== props.selectedEdgeId);
          return <fieldset key={item.id} className={`rounded-lg border p-3 ${unrelated ? "border-dashed border-border opacity-75" : "border-border"}`}>
            <legend className="px-1 text-xs font-bold">규칙 {index + 1} · {validation.state}{unrelated ? " · 다른 전이" : ""}</legend>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <code title="규칙 ID는 저장 후에도 변경되지 않습니다.">{item.id}</code>
              <span>{scopeLabel(item.edgeId)}</span>
            </div>
            {validation.lastVerdict ? <p className="mb-2 text-xs text-muted-foreground">마지막 관찰: {validation.lastVerdict} · {validation.lastObservationAt ?? "시각 없음"}</p> : null}
            <select aria-label={`규칙 ${index + 1} 범위`} value={item.edgeId ?? ""} onChange={(event) => update(item.id, { ...item, ...(event.target.value ? { edgeId: event.target.value } : { edgeId: undefined }) })} className="pt-input min-h-11 px-3">
              <option value="">모든 전이에 적용 (레거시/전역 계약)</option>
              {pressCreationProcess.edges.map((edge) => <option key={edge.id} value={edge.id}>{scopeLabel(edge.id)}</option>)}
            </select>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <select aria-label={`규칙 ${index + 1} 대상`} value={item.matcher.subject} onChange={(event) => { const subject = event.target.value as MatcherSubject; const operator = compatibleMatcherOperators(subject)[0]; update(item.id, { ...item, matcher: { version: 1, subject, operator, ...(matcherNeedsOperand(operator) ? { operand: matcherOperandIsNumber(operator, subject) ? 0 : "" } : {}) } }); }} className="pt-input min-h-11 px-3">
                {MATCHER_SUBJECTS.map((subject) => <option key={subject} value={subject}>{subjectLabels[subject]}</option>)}
              </select>
              <select aria-label={`규칙 ${index + 1} 연산자`} value={item.matcher.operator} onChange={(event) => { const operator = event.target.value as MatcherOperator; update(item.id, { ...item, matcher: { ...item.matcher, operator, ...(matcherNeedsOperand(operator) ? { operand: matcherOperandIsNumber(operator, item.matcher.subject) ? 0 : "" } : { operand: undefined }) } }); }} className="pt-input min-h-11 px-3">
                {compatibleMatcherOperators(item.matcher.subject).map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}
              </select>
            </div>
            {matcherNeedsOperand(item.matcher.operator) ? <input aria-label={`규칙 ${index + 1} 비교값`} type={matcherOperandIsNumber(item.matcher.operator, item.matcher.subject) ? "number" : "text"} value={item.matcher.operand ?? ""} onChange={(event) => update(item.id, { ...item, matcher: { ...item.matcher, operand: matcherOperandIsNumber(item.matcher.operator, item.matcher.subject) ? Number(event.target.value) : event.target.value } })} className="pt-input mt-2 min-h-11 px-3" placeholder="비교값" /> : null}
            <select aria-label={`규칙 ${index + 1} 실패 판정`} value={item.verdict} onChange={(event) => update(item.id, { ...item, verdict: event.target.value as "WARN" | "BLOCK" })} className="pt-input mt-2 min-h-11 px-3"><option value="WARN">실패 시 WARN</option><option value="BLOCK">실패 시 BLOCK</option></select>
            <button type="button" onClick={() => setExpectations((items) => deleteCaseExpectation(items, item.id))} className="mt-2 min-h-11 rounded border border-border px-3 text-xs font-bold">사용자 정의 규칙 삭제</button>
          </fieldset>;
        })}
      </div>
      <button type="button" disabled={expectations.length >= 50} onClick={() => setExpectations((items) => addCaseExpectation(items, props.selectedEdgeId))} className="mt-3 min-h-11 rounded border border-border px-3 text-xs font-bold disabled:opacity-50">사용자 정의 규칙 추가</button>
      {!valid ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">케이스 이름, 체크포인트, 고유 ID, 범위, 연산자와 비교값을 확인하세요. 규칙은 최대 50개입니다.</p> : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={props.busy || props.loading || !valid} onClick={() => props.onSave(checkpointId, name.trim(), expectations)} className="min-h-11 rounded border border-border px-4 font-bold disabled:opacity-50">사용자 정의 규칙 저장</button>
        <button type="button" disabled={props.busy || props.loading || !valid || !props.retryNodeId} onClick={() => props.onSaveAndBranch(checkpointId, name.trim(), expectations, props.retryNodeId)} className="min-h-11 rounded bg-primary px-4 font-black text-primary-foreground disabled:opacity-50">{props.actionStatus === "PARTIAL_FAILURE" ? "저장 없이 분기 다시 시도" : `${sourceNode?.label ?? props.retryNodeId}에서 저장 후 분기`}</button>
      </div>
    </section>
  );
}

export function PressAiCasePanel(props: PressAiCasePanelProps) {
  const formIdentity = props.attachedCase
    ? `${props.selectedEdgeId}:${props.preferredCheckpointId}:${props.attachedCase.caseId}:${props.attachedCase.expectations.map((item) => `${item.fingerprint}:${item.validation.state}`).join(",")}`
    : `${props.selectedEdgeId}:new:${props.preferredCheckpointId || props.checkpoints.at(-1)?.id || "empty"}`;
  return <PressAiCasePanelForm key={formIdentity} {...props} />;
}
