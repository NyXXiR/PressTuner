"use client";

import { useEffect, useState } from "react";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import { createPressAiDebugCaseGuardrail, deletePressAiDebugCaseGuardrail, fetchPressAiDebugCase, fetchPressAiDebugCases, rerunPressAiDebugCase, updatePressAiDebugCaseGuardrail, updatePressAiDebugCaseTopology, type PressAiDebugCase } from "@/lib/pressAiProcessDebuggerClient";

type Expectation = {
  id: string;
  field: "contains" | "notContains";
  value: string;
  verdict: "WARN" | "BLOCK";
};

export function PressAiCasePanel(props: {
  checkpoints: readonly { id: string; nodeId: string }[];
  busy: boolean;
  onSave: (
    checkpointId: string,
    name: string,
    expectations: Expectation[],
  ) => void;
  onOpenAttempt: (attemptId: string) => void;
}) {
  const [checkpointId, setCheckpointId] = useState("");
  const [name, setName] = useState("");
  const [expectations, setExpectations] = useState<Expectation[]>([]);
  const [cases, setCases] = useState<Array<{ id: string; name: string | null; revision: number }>>([]);
  const [selectedCase, setSelectedCase] = useState<PressAiDebugCase | null>(null);
  const [caseBusy, setCaseBusy] = useState(false);
  const [caseError, setCaseError] = useState<string | null>(null);
  const [newGuardrail, setNewGuardrail] = useState({ guardrailId: "", edgeId: pressCreationProcess.edges[0].id, instruction: "", severity: "WARN" as "WARN" | "BLOCK" });
  const reloadCases = async (caseId?: string) => {
    const listed = await fetchPressAiDebugCases(); setCases(listed);
    const id = caseId ?? selectedCase?.id ?? listed[0]?.id;
    setSelectedCase(id ? await fetchPressAiDebugCase(id) : null);
  };
  useEffect(() => { void fetchPressAiDebugCases().then(async (listed) => { setCases(listed); setSelectedCase(listed[0]?.id ? await fetchPressAiDebugCase(listed[0].id) : null); }).catch((error) => setCaseError(error instanceof Error ? error.message : "PRESS_AI_DEBUG_CASE_LOAD_FAILED")); }, []);
  const mutateCase = async (task: (current: PressAiDebugCase) => Promise<unknown>) => {
    if (!selectedCase) return; setCaseBusy(true); setCaseError(null);
    try { await task(selectedCase); await reloadCases(selectedCase.id); }
    catch (error) { setCaseError(error instanceof Error ? error.message : "PRESS_AI_DEBUG_CASE_UPDATE_FAILED"); }
    finally { setCaseBusy(false); }
  };
  const update = (index: number, patch: Partial<Expectation>) =>
    setExpectations((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  const valid = expectations.every(
    (item) => item.id.trim() && item.value.trim(),
  );
  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="font-black">수동 테스트 케이스</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        필수 가드레일은 그대로 두고 이 케이스에서만 확인할 기대값을 추가합니다.
      </p>
      <select
        aria-label="완료 체크포인트"
        value={checkpointId}
        onChange={(event) => setCheckpointId(event.target.value)}
        className="mt-3 min-h-11 w-full rounded border bg-background px-3"
      >
        <option value="">체크포인트 선택</option>
        {props.checkpoints.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nodeId}
          </option>
        ))}
      </select>
      <input
        aria-label="케이스 이름"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="mt-2 min-h-11 w-full rounded border bg-background px-3"
        placeholder="케이스 이름"
      />
      <div className="mt-3 space-y-2">
        {expectations.map((item, index) => (
          <fieldset key={index} className="rounded-lg border p-3">
            <legend className="px-1 text-xs font-bold">
              추가 기대값 {index + 1}
            </legend>
            <input
              aria-label={`기대값 ${index + 1} 이름`}
              value={item.id}
              onChange={(event) => update(index, { id: event.target.value })}
              className="min-h-11 w-full rounded border bg-background px-3"
              placeholder="예: caution-preserved"
            />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <select
                aria-label={`기대값 ${index + 1} 규칙`}
                value={item.field}
                onChange={(event) =>
                  update(index, {
                    field: event.target.value as Expectation["field"],
                  })
                }
                className="min-h-11 rounded border bg-background px-3"
              >
                <option value="contains">포함해야 함</option>
                <option value="notContains">포함하면 안 됨</option>
              </select>
              <select
                aria-label={`기대값 ${index + 1} 실패 판정`}
                value={item.verdict}
                onChange={(event) =>
                  update(index, {
                    verdict: event.target.value as Expectation["verdict"],
                  })
                }
                className="min-h-11 rounded border bg-background px-3"
              >
                <option value="WARN">실패 시 WARN</option>
                <option value="BLOCK">실패 시 BLOCK</option>
              </select>
            </div>
            <input
              aria-label={`기대값 ${index + 1} 내용`}
              value={item.value}
              onChange={(event) => update(index, { value: event.target.value })}
              className="mt-2 min-h-11 w-full rounded border bg-background px-3"
              placeholder="확인할 문구"
            />
            <button
              type="button"
              onClick={() =>
                setExpectations((items) =>
                  items.filter((_, itemIndex) => itemIndex !== index),
                )
              }
              className="mt-2 min-h-11 rounded border px-3 text-xs font-bold"
            >
              기대값 삭제
            </button>
          </fieldset>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          setExpectations((items) => [
            ...items,
            { id: "", field: "contains", value: "", verdict: "WARN" },
          ])
        }
        className="mt-2 min-h-11 rounded border px-3 text-xs font-bold"
      >
        기대값 추가
      </button>
      <button
        type="button"
        disabled={props.busy || !checkpointId || !name.trim() || !valid}
        onClick={() => props.onSave(checkpointId, name, expectations)}
        className="mt-2 min-h-11 w-full rounded border px-4 font-bold disabled:opacity-50"
      >
        이 체크포인트 저장
      </button>
      <hr className="my-5 border-border" />
      <h3 className="font-black">저장 케이스 구성</h3>
      <p className="mt-1 text-xs text-muted-foreground">등록된 호환 엣지만 켜고 끌 수 있으며, 수정은 다음 시도부터 적용됩니다.</p>
      {caseError ? <p role="alert" className="mt-2 text-xs font-bold text-rose-700 dark:text-rose-300">{caseError}</p> : null}
      <select aria-label="저장 케이스" value={selectedCase?.id ?? ""} onChange={(event) => void fetchPressAiDebugCase(event.target.value).then(setSelectedCase)} className="mt-3 min-h-11 w-full rounded border bg-background px-3">
        <option value="">저장 케이스 선택</option>
        {cases.map((item) => <option key={item.id} value={item.id}>{item.name ?? "이름 없는 케이스"} · r{item.revision}</option>)}
      </select>
      {selectedCase ? <div className="mt-3 space-y-4">
        <fieldset className="rounded-lg border p-3"><legend className="px-1 text-xs font-bold">토폴로지</legend>
          {pressCreationProcess.edges.map((edge) => <label key={edge.id} className="mt-1 flex min-h-9 items-center gap-2 text-xs"><input type="checkbox" checked={selectedCase.topologyConfig.enabledEdgeIds.includes(edge.id)} onChange={(event) => { const enabledEdgeIds = event.target.checked ? [...selectedCase.topologyConfig.enabledEdgeIds, edge.id] : selectedCase.topologyConfig.enabledEdgeIds.filter((id) => id !== edge.id); void mutateCase((current) => updatePressAiDebugCaseTopology(current.id, { commandId: crypto.randomUUID(), expectedRevision: current.revision, topology: { ...current.topologyConfig, enabledEdgeIds } })); }} />{edge.source} → {edge.target}</label>)}
          <label className="mt-2 block text-xs font-bold">최대 반복
            <select value={selectedCase.topologyConfig.maxIterations} onChange={(event) => void mutateCase((current) => updatePressAiDebugCaseTopology(current.id, { commandId: crypto.randomUUID(), expectedRevision: current.revision, topology: { ...current.topologyConfig, maxIterations: Number(event.target.value) } }))} className="ml-2 min-h-9 rounded border bg-background px-2">{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}</select>
          </label>
        </fieldset>
        <fieldset className="rounded-lg border p-3"><legend className="px-1 text-xs font-bold">엣지 의미 가드레일</legend>
          <ul className="space-y-2">{selectedCase.guardrails.map((guardrail) => <li key={guardrail.guardrailId} className="rounded border p-2 text-xs"><strong>{guardrail.guardrailId}</strong><p className="mt-1">{guardrail.edgeId} · {guardrail.severity}</p><p className="mt-1">{guardrail.instruction}</p><div className="mt-2 flex gap-2"><button type="button" disabled={caseBusy} onClick={() => { const instruction = window.prompt("가드레일 지침", guardrail.instruction); if (!instruction) return; void mutateCase((current) => updatePressAiDebugCaseGuardrail(current.id, guardrail.guardrailId, { commandId: crypto.randomUUID(), expectedRevision: current.revision, edgeId: guardrail.edgeId, instruction, severity: guardrail.severity })); }} className="min-h-9 rounded border px-2 font-bold">수정</button><button type="button" disabled={caseBusy} onClick={() => void mutateCase((current) => deletePressAiDebugCaseGuardrail(current.id, guardrail.guardrailId, { commandId: crypto.randomUUID(), expectedRevision: current.revision }))} className="min-h-9 rounded border px-2 font-bold">삭제</button></div></li>)}</ul>
          <div className="mt-3 grid gap-2"><input aria-label="새 가드레일 ID" value={newGuardrail.guardrailId} onChange={(event) => setNewGuardrail({ ...newGuardrail, guardrailId: event.target.value })} placeholder="custom-guardrail-id" className="min-h-10 rounded border bg-background px-2" /><select aria-label="새 가드레일 엣지" value={newGuardrail.edgeId} onChange={(event) => setNewGuardrail({ ...newGuardrail, edgeId: event.target.value })} className="min-h-10 rounded border bg-background px-2">{pressCreationProcess.edges.filter((edge) => selectedCase.topologyConfig.enabledEdgeIds.includes(edge.id)).map((edge) => <option key={edge.id} value={edge.id}>{edge.id}</option>)}</select><textarea aria-label="새 가드레일 지침" value={newGuardrail.instruction} onChange={(event) => setNewGuardrail({ ...newGuardrail, instruction: event.target.value })} className="rounded border bg-background p-2" /><select value={newGuardrail.severity} onChange={(event) => setNewGuardrail({ ...newGuardrail, severity: event.target.value as "WARN" | "BLOCK" })} className="min-h-10 rounded border bg-background px-2"><option value="WARN">WARN</option><option value="BLOCK">BLOCK</option></select><button type="button" disabled={caseBusy || !newGuardrail.guardrailId.trim() || !newGuardrail.instruction.trim()} onClick={() => void mutateCase((current) => createPressAiDebugCaseGuardrail(current.id, { ...newGuardrail, commandId: crypto.randomUUID(), expectedRevision: current.revision }).then(() => setNewGuardrail({ ...newGuardrail, guardrailId: "", instruction: "" })))} className="min-h-10 rounded border px-3 font-bold">가드레일 추가</button></div>
        </fieldset>
        <button type="button" disabled={caseBusy} onClick={() => void mutateCase(async (current) => { const result = await rerunPressAiDebugCase(current.id, { commandId: crypto.randomUUID(), expectedRevision: current.revision }) as { response?: { attemptId?: string } }; if (result.response?.attemptId) props.onOpenAttempt(result.response.attemptId); return result; })} className="min-h-11 w-full rounded border border-primary px-4 font-black text-primary">캡처 지점에서 새 Article로 다시 실행</button>
      </div> : null}
    </section>
  );
}
