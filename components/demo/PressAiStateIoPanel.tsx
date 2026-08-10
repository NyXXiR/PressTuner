"use client";

import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import type { PressAiCheckpointAttempt } from "@/lib/pressAiProcessDebuggerClient";
import { PressAiCasePanel, type PressAiCaseActionPhase } from "./PressAiCasePanel";
import { GuardrailChip, NodeStateBadge, PendingGuardrailChip, VerdictBadge } from "./PressAiVerdictBadge";
import { nodeState } from "./pressAiRunProgress";
import {
  applicableCustomExpectations,
  projectSelectedTransition,
  resolveStateIoPayload,
  type PressAiWorkbenchSelection,
} from "./pressAiStateIo";

function JsonPanel(props: { title: string; description: string; value: unknown; empty: string }) {
  const empty = props.value === null || props.value === undefined;
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-background">
      <div className="border-b border-border px-4 py-3"><h4 className="font-black">{props.title}</h4><p className="mt-0.5 text-xs text-muted-foreground">{props.description}</p></div>
      {empty ? <div className="flex min-h-64 items-center justify-center p-6 text-center text-sm text-muted-foreground">{props.empty}</div> : <pre className="min-h-64 max-h-[34rem] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5">{JSON.stringify(props.value, null, 2)}</pre>}
    </section>
  );
}

type Observation = PressAiCheckpointAttempt["transitions"][number]["observations"][number];

function ObservationCard(props: { observation?: Observation; guardrailId: string; origin: "MANDATORY" | "CASE_EXPECTATION"; readOnly?: boolean }) {
  const item = props.observation;
  return (
    <li className="rounded-lg border border-border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {item ? <GuardrailChip guardrailId={props.guardrailId} verdict={item.verdict} origin={props.origin} /> : <PendingGuardrailChip guardrailId={props.guardrailId} />}
        {props.readOnly ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">읽기 전용</span> : null}
      </div>
      {item ? <>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="font-bold text-muted-foreground">기대</dt><dd className="min-w-0 break-words">{item.expected}</dd>
          <dt className="font-bold text-muted-foreground">관찰</dt><dd className="min-w-0 break-words">{item.observed}</dd>
          <dt className="font-bold text-muted-foreground">이유</dt><dd className="min-w-0 break-words">{item.reason}</dd>
        </dl>
        <details className="mt-2"><summary className="cursor-pointer text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">근거 펼치기</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{JSON.stringify(item.evidence ?? null, null, 2)}</pre></details>
      </> : <p className="mt-2 text-xs text-muted-foreground">PENDING · 소스 노드를 실행하면 이 규칙이 평가됩니다.</p>}
    </li>
  );
}

export function PressAiStateIoPanel(props: {
  attempt: PressAiCheckpointAttempt;
  busy: boolean;
  selection: PressAiWorkbenchSelection | null;
  onSelectionChange: (selection: PressAiWorkbenchSelection) => void;
  attachedCase: Parameters<typeof PressAiCasePanel>[0]["attachedCase"];
  caseLoading: boolean;
  caseError: string | null;
  caseSaved: boolean;
  caseActionStatus: PressAiCaseActionPhase;
  onSaveCase: Parameters<typeof PressAiCasePanel>[0]["onSave"];
  onSaveAndBranch: Parameters<typeof PressAiCasePanel>[0]["onSaveAndBranch"];
}) {
  if (!props.selection) return null;
  if (props.selection.kind === "node") {
    const nodeId = props.selection.nodeId;
    const node = pressCreationProcess.nodes.find((item) => item.id === nodeId);
    if (!node) return null;
    const payload = resolveStateIoPayload(props.attempt, node.id);
    return (
      <section id="press-ai-state-io" tabIndex={-1} className="mb-4 min-w-0 scroll-mt-24 rounded-xl border-2 border-primary/35 bg-card p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-labelledby="press-ai-state-io-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[0.14em] text-primary">상태 호출 데이터</p><h3 id="press-ai-state-io-heading" className="mt-1 text-lg font-black">Input JSON / Output JSON</h3><p className="mt-1 text-sm text-muted-foreground">그래프에서 상태를 선택하면 실제 호출 입력과 실행 결과를 바로 비교할 수 있습니다.</p></div>
          <label className="min-w-0 text-xs font-bold text-muted-foreground">확인할 상태<span className="mt-1 flex items-center gap-2"><select value={node.id} onChange={(event) => props.onSelectionChange({ kind: "node", nodeId: event.target.value })} className="pt-input min-h-11 min-w-56 px-3 text-sm font-bold text-foreground">{pressCreationProcess.nodes.map((item) => <option key={item.id} value={item.id}>{item.sequence + 1}. {item.label}</option>)}</select><NodeStateBadge state={nodeState(props.attempt, node, props.busy)} /></span></label>
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <JsonPanel title="Input JSON" description={payload.inputSource} value={payload.input} empty="아직 이 상태로 전달된 입력이 없습니다. 이전 상태를 실행하고 전이를 완료하면 여기에 호출 입력이 표시됩니다." />
          <JsonPanel title="Output JSON" description={payload.outputSource} value={payload.output} empty="아직 이 상태를 실행하지 않았습니다. 상단 실행 버튼을 누르면 결과 JSON이 여기에 표시됩니다." />
        </div>
      </section>
    );
  }

  const projected = projectSelectedTransition(props.attempt, props.selection.edgeId);
  if (!projected) return null;
  const { edge, transition, sourceCheckpoint } = projected;
  const source = pressCreationProcess.nodes.find((item) => item.id === edge.source);
  const target = pressCreationProcess.nodes.find((item) => item.id === edge.target);
  const mandatory = edge.mandatoryGuardrailIds.map((guardrailId) => ({ guardrailId, observation: transition?.observations.find((item) => item.origin === "MANDATORY" && item.guardrailId === guardrailId) }));
  const applicable = applicableCustomExpectations(props.attachedCase?.expectations ?? [], edge.id);
  const customObservations = transition?.observations.filter((item) => item.origin === "CASE_EXPECTATION") ?? [];
  const custom = [
    ...customObservations.map((observation) => ({ guardrailId: observation.guardrailId, observation })),
    ...applicable.filter((rule) => !customObservations.some((item) => item.guardrailId === rule.id)).map((rule) => ({ guardrailId: rule.id, observation: undefined })),
  ];

  return (
    <section id="press-ai-state-io" tabIndex={-1} className="mb-4 min-w-0 scroll-mt-24 rounded-xl border-2 border-primary/35 bg-card p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-labelledby="press-ai-state-io-heading">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[0.14em] text-primary">전이 워크벤치</p><h3 id="press-ai-state-io-heading" className="mt-1 text-lg font-black">{source?.label ?? edge.source} → {target?.label ?? edge.target}</h3><p className="mt-1 text-sm text-muted-foreground">{edge.id} · 소스 체크포인트 {sourceCheckpoint?.id ?? "대기 중"}</p></div>
        <div className="flex flex-wrap items-center gap-2"><VerdictBadge verdict={transition?.verdict ?? "PENDING"} advanced={Boolean(transition?.advancedAt)} /><span className="text-xs font-bold text-muted-foreground">{transition?.advancedAt ? "다음 노드 활성화됨" : "아직 이동하지 않음"}</span></div>
      </div>
      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <JsonPanel title="Source Input JSON" description="소스 체크포인트의 정확한 저장 입력" value={sourceCheckpoint?.input ?? null} empty="소스 체크포인트 입력이 아직 없습니다." />
        <JsonPanel title="Source Output JSON" description="소스 체크포인트의 정확한 저장 출력" value={sourceCheckpoint?.output ?? null} empty="소스 노드를 실행하면 출력이 저장됩니다." />
        <JsonPanel title="Target Payload JSON" description="이 전이가 대상 노드로 전달한 정확한 페이로드" value={transition?.targetPayload ?? null} empty="소스 노드를 실행하면 전이 페이로드가 생성됩니다." />
      </div>
      <section className="mt-5" aria-labelledby="press-ai-mandatory-guardrails-heading">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 id="press-ai-mandatory-guardrails-heading" className="font-black">필수 가드레일 · 변경 불가</h4><span className="text-xs text-muted-foreground">레지스트리 계약 · 읽기 전용</span></div>
        <ol className="mt-2 grid gap-2 lg:grid-cols-2">{mandatory.map((item) => <ObservationCard key={`MANDATORY:${item.guardrailId}`} origin="MANDATORY" guardrailId={item.guardrailId} observation={item.observation} readOnly />)}</ol>
      </section>
      <section className="mt-5" aria-labelledby="press-ai-custom-evidence-heading">
        <h4 id="press-ai-custom-evidence-heading" className="font-black">적용 가능한 사용자 정의 규칙</h4>
        {custom.length ? <ol className="mt-2 grid gap-2 lg:grid-cols-2">{custom.map((item) => <ObservationCard key={`CASE_EXPECTATION:${item.observation?.id ?? item.guardrailId}`} origin="CASE_EXPECTATION" guardrailId={item.guardrailId} observation={item.observation} />)}</ol> : <p className="mt-2 text-sm text-muted-foreground">이 전이에 적용되는 사용자 정의 규칙이 없습니다.</p>}
      </section>
      <div className="mt-5 border-t border-border pt-5">
        <PressAiCasePanel checkpoints={props.attempt.checkpoints} attachedCase={props.attachedCase} loading={props.caseLoading} error={props.caseError} saved={props.caseSaved} busy={props.busy} selectedEdgeId={edge.id} preferredCheckpointId={sourceCheckpoint?.id ?? ""} retryNodeId={edge.source} actionStatus={props.caseActionStatus} onSave={props.onSaveCase} onSaveAndBranch={props.onSaveAndBranch} />
      </div>
    </section>
  );
}
