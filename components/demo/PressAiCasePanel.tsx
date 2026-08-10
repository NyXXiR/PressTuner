"use client";

import { useState } from "react";
import type { CustomExpectation, MatcherOperator, MatcherSubject } from "@/domain/press-ai-debugger/caseExpectations";
import { guardrailLabelKo } from "@/domain/press-ai-debugger/guardrailLabels";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import type { PressAiDebugCase } from "@/lib/pressAiProcessDebuggerClient";
import { compatibleMatcherOperators, createCaseExpectationRow, matcherNeedsOperand, matcherOperandIsNumber, sameExpectationDefinition } from "./pressAiCaseEditorModel";

const MATCHER_SUBJECTS: MatcherSubject[] = ["transition_text", "source_input_text", "source_output_text", "target_payload_text", "source_output_review_notes", "target_payload_selected_note_ids", "source_output_review_note_count", "target_payload_selected_note_count"];

const subjectLabels: Record<MatcherSubject, string> = {
  transition_text: "전환 전체 텍스트", source_input_text: "출발 노드 입력 텍스트", source_output_text: "출발 노드 출력 텍스트", target_payload_text: "도착 페이로드 텍스트",
  source_output_review_notes: "리뷰 노트 목록", target_payload_selected_note_ids: "선택 노트 ID 목록", source_output_review_note_count: "리뷰 노트 수", target_payload_selected_note_count: "선택 노트 수",
};
const operatorLabels: Record<MatcherOperator, string> = { contains: "포함", not_contains: "미포함", equals: "같음", exists: "존재", not_empty: "비어 있지 않음", count_gte: "개수 이상", count_lte: "개수 이하", number_eq: "숫자 같음", number_gte: "숫자 이상", number_lte: "숫자 이하" };
const edgeLabel = (edgeId: string) => { const edge = pressCreationProcess.edges.find((item) => item.id === edgeId); if (!edge) return edgeId; const source = pressCreationProcess.nodes.find((item) => item.id === edge.source)?.label ?? edge.source; const target = pressCreationProcess.nodes.find((item) => item.id === edge.target)?.label ?? edge.target; return `${source} → ${target}`; };

type PressAiCasePanelProps = {
  checkpoints: readonly { id: string; nodeId: string }[];
  attachedCase: PressAiDebugCase | null;
  loading: boolean;
  error: string | null;
  saved: boolean;
  busy: boolean;
  onSave: (checkpointId: string, name: string, expectations: CustomExpectation[]) => void;
};

function PressAiCasePanelForm(props: PressAiCasePanelProps) {
  const [checkpointId, setCheckpointId] = useState(props.attachedCase?.sourceCheckpoint.id ?? props.checkpoints.at(-1)?.id ?? "");
  const [name, setName] = useState(props.attachedCase?.name ?? "");
  const [expectations, setExpectations] = useState<CustomExpectation[]>(() => props.attachedCase?.expectations.map((item) => ({ id: item.id, ...(item.edgeId ? { edgeId: item.edgeId } : {}), matcher: item.matcher, verdict: item.verdict })) ?? []);
  const update = (index: number, next: CustomExpectation) => setExpectations((items) => items.map((item, itemIndex) => itemIndex === index ? next : item));
  const valid = expectations.every((item) => !matcherNeedsOperand(item.matcher.operator) || (typeof item.matcher.operand === "number" ? Number.isFinite(item.matcher.operand) : Boolean(item.matcher.operand?.trim())));
  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="font-black">수동 테스트 케이스</h3>
      <p className="mt-1 text-xs text-muted-foreground">필수 가드레일은 그대로 두고 이 케이스의 사용자 정의 규칙만 편집합니다.</p>
      <p className="mt-1 text-[11px] text-muted-foreground">검증 상태: UNTESTED · UNPROVEN · DETECTED · VERIFIED</p>
      {props.loading ? <p role="status" className="mt-2 text-xs">연결된 케이스를 불러오는 중입니다…</p> : null}
      {props.error ? <p role="alert" className="mt-2 text-xs text-rose-600">{props.error}</p> : null}
      {props.saved ? <p role="status" className="mt-2 text-xs text-emerald-700">케이스가 현재 시도에 연결되었습니다. 현재 PASS만으로는 검증된 규칙이 아닙니다.</p> : null}
      <select aria-label="완료 체크포인트" value={checkpointId} onChange={(event) => setCheckpointId(event.target.value)} className="pt-input mt-3 min-h-11 px-3">
        <option value="">체크포인트 선택</option>
        {props.checkpoints.map((item) => <option key={item.id} value={item.id}>{pressCreationProcess.nodes.find((node) => node.id === item.nodeId)?.label ?? item.nodeId}</option>)}
      </select>
      <input aria-label="케이스 이름" value={name} onChange={(event) => setName(event.target.value)} className="pt-input mt-2 min-h-11 px-3" placeholder="케이스 이름" />
      <div className="mt-3 space-y-2">
        {expectations.map((item, index) => {
          const stored = props.attachedCase?.expectations.find((candidate) => candidate.id === item.id);
          const summary = stored && sameExpectationDefinition(item, stored) ? stored.validation : undefined;
          return <fieldset key={item.id} className="rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-bold">사용자 정의 규칙 {index + 1} · {summary?.state ?? "UNTESTED"}</legend>
            <select aria-label={`규칙 ${index + 1} 엣지`} value={item.edgeId ?? ""} onChange={(event) => update(index, { ...item, ...(event.target.value ? { edgeId: event.target.value } : { edgeId: undefined }) })} className="pt-input min-h-11 px-3">
              <option value="">모든 엣지 (레거시/전역)</option>
              {pressCreationProcess.edges.map((edge) => <option key={edge.id} value={edge.id}>{edgeLabel(edge.id)}</option>)}
            </select>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <select aria-label={`규칙 ${index + 1} 대상`} value={item.matcher.subject} onChange={(event) => { const subject = event.target.value as MatcherSubject; const operator = compatibleMatcherOperators(subject)[0]; update(index, { ...item, matcher: { version: 1, subject, operator, operand: matcherOperandIsNumber(operator, subject) ? 0 : "" } }); }} className="pt-input min-h-11 px-3">
                {MATCHER_SUBJECTS.map((subject) => <option key={subject} value={subject}>{subjectLabels[subject]}</option>)}
              </select>
              <select aria-label={`규칙 ${index + 1} 연산자`} value={item.matcher.operator} onChange={(event) => { const operator = event.target.value as MatcherOperator; update(index, { ...item, matcher: { ...item.matcher, operator, ...(matcherNeedsOperand(operator) ? { operand: matcherOperandIsNumber(operator, item.matcher.subject) ? 0 : "" } : { operand: undefined }) } }); }} className="pt-input min-h-11 px-3">
                {compatibleMatcherOperators(item.matcher.subject).map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}
              </select>
            </div>
            {matcherNeedsOperand(item.matcher.operator) ? <input aria-label={`규칙 ${index + 1} 비교값`} type={matcherOperandIsNumber(item.matcher.operator, item.matcher.subject) ? "number" : "text"} value={item.matcher.operand ?? ""} onChange={(event) => update(index, { ...item, matcher: { ...item.matcher, operand: matcherOperandIsNumber(item.matcher.operator, item.matcher.subject) ? Number(event.target.value) : event.target.value } })} className="pt-input mt-2 min-h-11 px-3" placeholder="비교값" /> : null}
            <select aria-label={`규칙 ${index + 1} 실패 판정`} value={item.verdict} onChange={(event) => update(index, { ...item, verdict: event.target.value as "WARN" | "BLOCK" })} className="pt-input mt-2 min-h-11 px-3"><option value="WARN">실패 시 WARN</option><option value="BLOCK">실패 시 BLOCK</option></select>
            <button type="button" onClick={() => setExpectations((items) => items.filter((candidate) => candidate.id !== item.id))} className="mt-2 min-h-11 rounded border border-border px-3 text-xs font-bold">사용자 정의 규칙 삭제</button>
          </fieldset>;
        })}
      </div>
      <button type="button" onClick={() => {
        const nodeId = props.checkpoints.find((checkpoint) => checkpoint.id === checkpointId)?.nodeId;
        const edgeId = pressCreationProcess.edges.find((edge) => edge.source === nodeId)?.id ?? pressCreationProcess.edges[0].id;
        setExpectations((items) => [...items, createCaseExpectationRow(edgeId)]);
      }} className="mt-2 min-h-11 rounded border border-border px-3 text-xs font-bold">사용자 정의 기대값 추가</button>
      <button type="button" disabled={props.busy || props.loading || !checkpointId || !name.trim() || !valid} onClick={() => props.onSave(checkpointId, name, expectations)} className="mt-2 min-h-11 w-full rounded border border-border px-4 font-bold disabled:opacity-50">이 체크포인트 저장</button>
      <a href="#press-ai-branch-checkpoint" className="mt-3 inline-block text-xs font-bold underline">저장 후 기존 체크포인트 분기 선택기로 이동</a>
      <section className="mt-4 border-t border-border pt-3" aria-label="필수 가드레일 (읽기 전용)">
        <h4 className="text-xs font-black">필수 가드레일 · 읽기 전용</h4>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{pressCreationProcess.edges.flatMap((edge) => edge.mandatoryGuardrailIds.map((id) => <li key={`${edge.id}:${id}`}>{edgeLabel(edge.id)} · {guardrailLabelKo(id)}</li>))}</ul>
      </section>
    </section>
  );
}

export function PressAiCasePanel(props: PressAiCasePanelProps) {
  const formIdentity = props.attachedCase
    ? `${props.attachedCase.caseId}:${props.attachedCase.expectations.map((item) => `${item.fingerprint}:${item.validation.state}`).join(",")}`
    : `new:${props.checkpoints.at(-1)?.id ?? "empty"}`;
  return <PressAiCasePanelForm key={formIdentity} {...props} />;
}
