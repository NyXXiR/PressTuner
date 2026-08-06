"use client";

import { useState } from "react";

import {
  PRESS_AGENT_WORKFLOW_EDGES,
  PRESS_AGENT_WORKFLOW_FINDING_COPY,
  PRESS_AGENT_WORKFLOW_STAGE_IDS,
  type PressAgentWorkflowFindingCode,
  type PressAgentWorkflowStageId,
  type projectPressAgentWorkflow,
} from "@/domain/evaluation/pressAgentWorkflowEvents";

const STAGE_COPY: Record<PressAgentWorkflowStageId, string> = {
  "request-intake": "요청 접수", "retrieval-execution": "근거 검색", "evidence-decision": "근거 판단",
  "response-behavior": "응답 생성", verification: "최종 검증", fallback: "안전 대체", "terminal-evaluation": "종료 판정",
};
const STATE_COPY = { waiting: "대기", running: "실행 중", succeeded: "성공", warning: "경고", failed: "실패", blocked: "차단", skipped: "건너뜀" } as const;
const EDGE_STATE_COPY = { pending: "아직 이동 안 함", moving: "이동 중", taken: "정상 통과", "taken-with-violation": "경고와 함께 통과", blocked: "이동 차단", "not-taken": "선택되지 않음" } as const;
const METRIC_COPY: Record<string, string> = {
  selectedSources: "선택한 근거",
  eligibleSources: "사용 가능한 근거",
  conflicts: "충돌한 근거",
  claims: "검증한 주장",
  supportedClaims: "근거가 확인된 주장",
  citations: "최종 인용",
  failedTools: "실패한 도구",
};
const ACTION_COPY: Partial<Record<PressAgentWorkflowFindingCode, string>> = {
  "retrieval-empty": "검색 범위와 등록된 자료를 확인하세요.",
  "retrieval-tool-failed": "검색 도구 연결과 권한을 확인하세요.",
  "evidence-conflict": "서로 다른 근거 중 어떤 자료를 우선할지 확인하세요.",
  "insufficient-evidence": "답변에 필요한 자료를 추가하거나 질문 범위를 좁혀 보세요.",
  "claim-verification-failed": "경고가 난 주장과 인용 근거가 실제로 일치하는지 확인하세요.",
  "fallback-extractive": "원래 답변 대신 근거 문장만 사용해도 되는지 확인하세요.",
  "fallback-abstention": "자료가 부족해 답변을 멈춘 상태입니다. 근거를 추가하세요.",
  "approval-required": "승인이 필요한 동작인지 확인한 뒤 별도 실행 화면에서 승인하세요.",
  "runtime-failed": "마지막 정상 단계 다음의 서버·모델 로그를 확인하세요.",
  "guardrail-warning": "경고가 표시된 앞 단계를 열어 원인을 먼저 확인하세요.",
};

export function PressRagLiveWorkflowViewer({ projection }: { projection: ReturnType<typeof projectPressAgentWorkflow> }) {
  const [selected, setSelected] = useState<PressAgentWorkflowStageId>("request-intake");
  const stage = projection.stages[selected];
  return (
    <div className="mt-5 min-w-0">
      <div className="max-w-full overflow-x-auto pb-3" aria-label="실시간 워크플로 7단계">
        <div className="flex min-w-[900px] items-center">
          {PRESS_AGENT_WORKFLOW_STAGE_IDS.map((id, index) => (
            <div key={id} className="contents">
              {index > 0 ? (() => {
                const previous = PRESS_AGENT_WORKFLOW_STAGE_IDS[index - 1];
                const direct = PRESS_AGENT_WORKFLOW_EDGES.find((edge) => edge.source === previous && edge.target === id);
                const edge = direct ? projection.edges[direct.id] : null;
                return <span aria-label={edge ? `${STAGE_COPY[direct!.source]}에서 ${STAGE_COPY[direct!.target]}: ${EDGE_STATE_COPY[edge.state]}` : "분기 연결"} className={`mx-1 h-1 w-4 shrink-0 rounded ${edge?.state === "moving" ? "animate-pulse bg-blue-500" : edge?.state === "taken-with-violation" ? "bg-amber-500" : edge?.state === "taken" ? "bg-emerald-500" : edge?.state === "blocked" ? "bg-rose-500" : "bg-border"}`} />;
              })() : null}
              <button type="button" onClick={() => setSelected(id)} aria-pressed={selected === id} className={`min-h-24 w-28 shrink-0 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected === id ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                <span className="block text-xs font-black">{STAGE_COPY[id]}</span>
                <span className="mt-2 block text-xs text-muted-foreground">{STATE_COPY[projection.stages[id].state]}</span>
                {projection.stages[id].state === "running" ? <span className="mt-2 flex items-center gap-1.5 text-xs font-bold text-blue-600"><span aria-hidden="true" className="size-3 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />AI 처리 중</span> : null}
              </button>
            </div>
          ))}
        </div>
      </div>
      <ol className="mb-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4" aria-label="워크플로 방향 전이 7개">
        {PRESS_AGENT_WORKFLOW_EDGES.map((topology) => {
          const edge = projection.edges[topology.id];
          return <li key={edge.id} className={`rounded-lg border px-3 py-2 ${edge.state === "moving" ? "animate-pulse border-blue-500" : edge.state === "taken-with-violation" ? "border-amber-500" : edge.state === "blocked" ? "border-rose-500" : "border-border"}`}><strong>{STAGE_COPY[edge.source]} → {STAGE_COPY[edge.target]}</strong><span className="mt-1 block text-muted-foreground">{EDGE_STATE_COPY[edge.state]}</span>{edge.findingCode ? <span className="mt-1 block text-amber-700">{PRESS_AGENT_WORKFLOW_FINDING_COPY[edge.findingCode]}</span> : null}</li>;
        })}
      </ol>
      <aside className="rounded-xl border border-border bg-muted/35 p-4" aria-live="polite">
        <h4 className="font-black">{STAGE_COPY[selected]} · {STATE_COPY[stage.state]}</h4>
        <p className="mt-2 text-sm text-muted-foreground">{stage.findingCode ? PRESS_AGENT_WORKFLOW_FINDING_COPY[stage.findingCode as PressAgentWorkflowFindingCode] : "기록된 경고가 없습니다."}</p>
        {stage.findingCode && ACTION_COPY[stage.findingCode] ? <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><strong>다음 확인:</strong> {ACTION_COPY[stage.findingCode]}</p> : null}
        {stage.metrics ? <dl className="mt-3 flex flex-wrap gap-2">{Object.entries(stage.metrics).map(([key, value]) => <div key={key} className="rounded-lg bg-background px-3 py-2 text-xs"><dt className="text-muted-foreground">{METRIC_COPY[key] ?? key}</dt><dd className="font-black">{value}개</dd></div>)}</dl> : null}
        {selected === "verification" ? <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">{["verification-terminal", "verification-fallback"].map((id) => { const edge = projection.edges[id as keyof typeof projection.edges]; return <p key={id} className="rounded-lg border border-border bg-background p-2"><strong>{STAGE_COPY[edge.target]}</strong>: {EDGE_STATE_COPY[edge.state]}{edge.findingCode ? ` · ${PRESS_AGENT_WORKFLOW_FINDING_COPY[edge.findingCode]}` : ""}</p>; })}</div> : null}
      </aside>
    </div>
  );
}
