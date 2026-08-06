"use client";

import {
  PRESS_RAG_SANDBOX_TOOL_NAMES,
  type PressRagSandboxProjection,
  type PressRagSandboxValidationError,
  type PressRagStageDraft,
} from "@/domain/evaluation/pressRagWorkflowSandbox";
import type { PressRagWorkflowNodeId } from "@/domain/evaluation/pressRagWorkflowView";

function Field({ label, error, hideLabel, children }: { label: string; error?: string; hideLabel?: boolean; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 text-[11px] font-bold text-foreground">
      <span className={hideLabel ? "sr-only" : undefined}>{label}</span>
      {children}
      {error ? <span role="alert" className="font-normal text-destructive">{error}</span> : null}
    </label>
  );
}

/** One editable collection row: dense on wide panels, stacked when the panel is narrow. */
function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid min-w-0 items-end gap-2 rounded-lg border border-border bg-background p-2">{children}</div>;
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="min-h-9 w-9 shrink-0 self-end rounded-lg border border-border text-sm font-black text-muted-foreground transition-colors hover:border-rose-500/60 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span aria-hidden="true">×</span>
    </button>
  );
}

const control = "min-h-9 min-w-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const addButton = "min-h-10 rounded-lg border border-dashed border-primary text-xs font-black text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function PressRagWorkflowSandboxPanel({
  stageLabel, editableFields, draft, errors, runErrors, editedStages, recorded, tested, onChange, onRun, onReset,
}: {
  stageLabel: string;
  editableFields: readonly string[];
  draft: PressRagStageDraft;
  errors: readonly PressRagSandboxValidationError[];
  runErrors: readonly PressRagSandboxValidationError[];
  editedStages: readonly PressRagWorkflowNodeId[];
  recorded: PressRagSandboxProjection;
  tested: PressRagSandboxProjection | null;
  onChange: (draft: PressRagStageDraft) => void;
  onRun: () => void;
  onReset: () => void;
}) {
  const error = (field: string) => errors.find((entry) => entry.field === field)?.message;
  const set = (values: object) => onChange({ ...draft, ...values } as PressRagStageDraft);
  const json = tested ?? recorded;
  const blocking = [...errors, ...runErrors];

  return (
    <section className="min-w-0 rounded-xl border border-primary/30 bg-primary/5" aria-labelledby="sandbox-form-heading">
      <div className="grid gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-wider text-primary">선택 단계 편집</p>
          <h3 id="sandbox-form-heading" className="text-sm font-black">{stageLabel} 변경값</h3>
          <p className="mt-1 text-[11px] font-bold text-foreground">편집 가능 · {editableFields.join(" · ")}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">파생 rank·expected·checks·traversal·gate verdict는 읽기 전용입니다.</p>
          {editedStages.length ? <p className="mt-1 text-[11px] font-bold text-primary">직접 편집한 단계 {editedStages.length}개는 다른 단계를 봐도 유지됩니다.</p> : null}
        </div>

        {draft.stageId === "request-intake" ? (
          <Field label="프롬프트" error={error("prompt")}>
            <textarea value={draft.prompt} maxLength={4000} onChange={(event) => set({ prompt: event.target.value })} className={`${control} min-h-24 resize-y`} />
          </Field>
        ) : null}

        {draft.stageId === "retrieval-execution" ? (
          <>
            <fieldset className="grid min-w-0 gap-2">
              <legend className="text-xs font-black">검색 hits <span className="font-normal text-muted-foreground">{draft.hits.length}건</span></legend>
              {draft.hits.map((hit, index) => (
                <Row key={`hit-${index}`}>
                  <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <Field label={`문서 ID ${index + 1}`} error={error(`hits.${index}.logicalDocumentId`)}>
                      <input value={hit.logicalDocumentId} onChange={(event) => set({ hits: draft.hits.map((row, i) => i === index ? { ...row, logicalDocumentId: event.target.value } : row) })} className={control} />
                    </Field>
                    <Field label="파일명" error={error(`hits.${index}.filename`)}>
                      <input value={hit.filename} onChange={(event) => set({ hits: draft.hits.map((row, i) => i === index ? { ...row, filename: event.target.value } : row) })} className={control} />
                    </Field>
                    <RemoveButton label={`검색 hit ${index + 1} 제거`} onClick={() => set({ hits: draft.hits.filter((_, i) => i !== index) })} />
                  </div>
                  <div className="grid min-w-0 grid-cols-3 gap-2">
                    <Field label="시작 p." error={error(`hits.${index}.pageStart`)}>
                      <input type="number" value={hit.pageStart} onChange={(event) => set({ hits: draft.hits.map((row, i) => i === index ? { ...row, pageStart: Number(event.target.value) } : row) })} className={control} />
                    </Field>
                    <Field label="끝 p." error={error(`hits.${index}.pageEnd`)}>
                      <input type="number" value={hit.pageEnd} onChange={(event) => set({ hits: draft.hits.map((row, i) => i === index ? { ...row, pageEnd: Number(event.target.value) } : row) })} className={control} />
                    </Field>
                    <Field label="점수 0~1" error={error(`hits.${index}.score`)}>
                      <input type="number" min="0" max="1" step="0.01" value={hit.score ?? ""} onChange={(event) => set({ hits: draft.hits.map((row, i) => i === index ? { ...row, score: event.target.value === "" ? null : Number(event.target.value) } : row) })} className={control} />
                    </Field>
                  </div>
                </Row>
              ))}
              <button type="button" onClick={() => set({ hits: [...draft.hits, { logicalDocumentId: "sandbox-document", filename: "sandbox.pdf", pageStart: 1, pageEnd: 1, score: null }] })} className={addButton}>hit 추가</button>
            </fieldset>

            <fieldset className="grid min-w-0 gap-2">
              <legend className="text-xs font-black">도구 실행 <span className="font-normal text-muted-foreground">{draft.tools.length}건</span></legend>
              {draft.tools.map((tool, index) => (
                <Row key={`tool-${index}`}>
                  <div className="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)_auto] gap-2">
                    <Field label="순서" error={error(`tools.${index}.sequence`)}>
                      <input type="number" value={tool.sequence} onChange={(event) => set({ tools: draft.tools.map((row, i) => i === index ? { ...row, sequence: Number(event.target.value) } : row) })} className={control} />
                    </Field>
                    <Field label="도구">
                      <select value={tool.toolName} onChange={(event) => set({ tools: draft.tools.map((row, i) => i === index ? { ...row, toolName: event.target.value as typeof row.toolName } : row) })} className={control}>
                        {PRESS_RAG_SANDBOX_TOOL_NAMES.map((name) => <option key={name}>{name}</option>)}
                      </select>
                    </Field>
                    <RemoveButton label={`도구 ${index + 1} 제거`} onClick={() => set({ tools: draft.tools.filter((_, i) => i !== index) })} />
                  </div>
                  <div className="grid min-w-0 grid-cols-2 gap-2">
                    <Field label="상태">
                      <select value={tool.status} onChange={(event) => set({ tools: draft.tools.map((row, i) => i === index ? { ...row, status: event.target.value as typeof row.status } : row) })} className={control}><option>COMPLETED</option><option>FAILED</option></select>
                    </Field>
                    <Field label="지연 ms" error={error(`tools.${index}.latencyMs`)}>
                      <input type="number" value={tool.latencyMs} onChange={(event) => set({ tools: draft.tools.map((row, i) => i === index ? { ...row, latencyMs: Number(event.target.value) } : row) })} className={control} />
                    </Field>
                  </div>
                </Row>
              ))}
              <button type="button" onClick={() => set({ tools: [...draft.tools, { sequence: (draft.tools.at(-1)?.sequence ?? 0) + 1, toolName: "search_knowledge", status: "COMPLETED", latencyMs: 0 }] })} className={addButton}>도구 추가</button>
            </fieldset>
          </>
        ) : null}

        {draft.stageId === "evidence-decision" ? (
          <Field label="응답 분기" error={error("responseBranch")}>
            <select value={draft.responseBranch} onChange={(event) => set({ responseBranch: event.target.value })} className={control}><option>ANSWER</option><option>ABSTENTION</option><option>CONFLICT_COMPARISON</option></select>
          </Field>
        ) : null}

        {draft.stageId === "response-behavior" ? (
          <>
            <Field label="답변" error={error("finalAnswer")}>
              <textarea value={draft.finalAnswer ?? ""} onChange={(event) => set({ finalAnswer: event.target.value || null })} className={`${control} min-h-24 resize-y`} />
            </Field>
            <Field label="요약" error={error("summary")}>
              <textarea value={draft.summary ?? ""} onChange={(event) => set({ summary: event.target.value || null })} className={`${control} min-h-20 resize-y`} />
            </Field>
            <fieldset className="grid min-w-0 gap-2">
              <legend className="text-xs font-black">인용 <span className="font-normal text-muted-foreground">{draft.citations.length}건</span></legend>
              {draft.citations.map((citation, index) => (
                <Row key={`citation-${index}`}>
                  <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <Field label={`출처 라벨 ${index + 1}`} error={error(`citations.${index}.sourceLabel`)}>
                      <input value={citation.sourceLabel} onChange={(event) => set({ citations: draft.citations.map((row, i) => i === index ? { ...row, sourceLabel: event.target.value } : row) })} className={control} />
                    </Field>
                    <Field label="논리 문서 ID" error={error(`citations.${index}.logicalDocumentId`)}>
                      <input value={citation.logicalDocumentId} onChange={(event) => set({ citations: draft.citations.map((row, i) => i === index ? { ...row, logicalDocumentId: event.target.value } : row) })} className={control} />
                    </Field>
                    <RemoveButton label={`인용 ${index + 1} 제거`} onClick={() => set({ citations: draft.citations.filter((_, i) => i !== index) })} />
                  </div>
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_4rem_4rem] gap-2">
                    <Field label="파일명" error={error(`citations.${index}.filename`)}>
                      <input value={citation.filename} onChange={(event) => set({ citations: draft.citations.map((row, i) => i === index ? { ...row, filename: event.target.value } : row) })} className={control} />
                    </Field>
                    <Field label="시작 p." error={error(`citations.${index}.pageStart`)}>
                      <input type="number" value={citation.pageStart} onChange={(event) => set({ citations: draft.citations.map((row, i) => i === index ? { ...row, pageStart: Number(event.target.value) } : row) })} className={control} />
                    </Field>
                    <Field label="끝 p." error={error(`citations.${index}.pageEnd`)}>
                      <input type="number" value={citation.pageEnd} onChange={(event) => set({ citations: draft.citations.map((row, i) => i === index ? { ...row, pageEnd: Number(event.target.value) } : row) })} className={control} />
                    </Field>
                  </div>
                </Row>
              ))}
              <button type="button" onClick={() => set({ citations: [...draft.citations, { sourceLabel: "sandbox-source", logicalDocumentId: "sandbox-document", filename: "sandbox.pdf", pageStart: 1, pageEnd: 1 }] })} className={addButton}>인용 추가</button>
            </fieldset>
          </>
        ) : null}

        {draft.stageId === "verification" ? (
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <Field label="모드" error={error("verification")}>
              <select value={draft.mode ?? "NONE"} onChange={(event) => set({ mode: event.target.value === "NONE" ? null : event.target.value, status: event.target.value === "NONE" ? null : draft.status ?? "PASS" })} className={control}><option value="NONE">기록 없음</option><option>ANSWER</option><option>ABSTENTION</option></select>
            </Field>
            <Field label="상태">
              <select value={draft.status ?? "NONE"} onChange={(event) => set({ status: event.target.value === "NONE" ? null : event.target.value, mode: event.target.value === "NONE" ? null : draft.mode ?? "ANSWER" })} className={control}><option value="NONE">기록 없음</option><option>PASS</option><option>FAIL</option></select>
            </Field>
            <Field label="지원 주장" error={error("supportedClaims")}>
              <input type="number" value={draft.supportedClaims} onChange={(event) => set({ supportedClaims: Number(event.target.value) })} className={control} />
            </Field>
            <Field label="전체 주장" error={error("totalClaims")}>
              <input type="number" value={draft.totalClaims} onChange={(event) => set({ totalClaims: Number(event.target.value) })} className={control} />
            </Field>
          </div>
        ) : null}

        {draft.stageId === "fallback" ? (
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <Field label="대체 모드">
              <select value={draft.mode ?? "NONE"} onChange={(event) => set({ mode: event.target.value === "NONE" ? null : event.target.value, reason: event.target.value === "NONE" ? null : draft.reason ?? "MANUAL_TEST" })} className={control}><option value="NONE">사용 안 함</option><option>EXTRACTIVE</option><option>ABSTENTION</option></select>
            </Field>
            <Field label="안전 사유 코드" error={error("reason")}>
              <input value={draft.reason ?? ""} onChange={(event) => set({ reason: event.target.value || null })} className={control} />
            </Field>
          </div>
        ) : null}

        {draft.stageId === "terminal-evaluation" ? (
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <Field label="실행 상태">
              <select value={draft.status} onChange={(event) => set({ status: event.target.value, errorCode: event.target.value === "FAILED" ? draft.errorCode ?? "SANDBOX_FAILURE" : null })} className={control}><option>COMPLETED</option><option>FAILED</option></select>
            </Field>
            <Field label="오류 코드" error={error("errorCode")}>
              <input value={draft.errorCode ?? ""} onChange={(event) => set({ errorCode: event.target.value || null })} className={control} />
            </Field>
            <Field label="지연 ms" error={error("latencyMs")}>
              <input type="number" value={draft.latencyMs} onChange={(event) => set({ latencyMs: Number(event.target.value) })} className={control} />
            </Field>
            <Field label="비용 micro-USD" error={error("costMicros")}>
              <input type="number" value={draft.costMicros} onChange={(event) => set({ costMicros: Number(event.target.value) })} className={control} />
            </Field>
          </div>
        ) : null}

        <details className="min-w-0 rounded-lg border border-border bg-background p-3">
          <summary className="cursor-pointer text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">고급 JSON (읽기 전용)</summary>
          <pre tabIndex={0} className="mt-2 max-h-80 min-w-0 overflow-auto whitespace-pre-wrap break-all text-[10px]">{JSON.stringify({ outcome: json.outcome, workflow: json.workflow, guardrails: json.guardrails }, null, 2)}</pre>
        </details>
      </div>

      <div className="grid gap-2 border-t border-primary/30 bg-card/95 p-3 sm:px-4">
        {blocking.length ? (
          <p role="alert" className="text-xs font-bold text-destructive">
            입력 오류 {blocking.length}건 · {blocking[0]!.field}: {blocking[0]!.message}
          </p>
        ) : null}
        <p className="text-xs font-bold text-muted-foreground">기록된 값만 다시 계산합니다. 새 검색, 답변 생성, 모델/API 호출은 없습니다.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={errors.length > 0} onClick={onRun} className="min-h-11 flex-1 rounded-lg bg-primary px-4 text-sm font-black text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40">
            변경값으로 로컬 판정 계산
          </button>
          <button type="button" onClick={onReset} className="min-h-11 rounded-lg border border-border bg-background px-4 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            테스트 초기화
          </button>
        </div>
      </div>
    </section>
  );
}
