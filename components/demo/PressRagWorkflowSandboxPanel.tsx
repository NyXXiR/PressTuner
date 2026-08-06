"use client";

import {
  PRESS_RAG_SANDBOX_TOOL_NAMES,
  type PressRagSandboxProjection,
  type PressRagSandboxValidationError,
  type PressRagStageDraft,
} from "@/domain/evaluation/pressRagWorkflowSandbox";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="grid min-w-0 gap-1 text-xs font-bold text-foreground"><span>{label}</span>{children}{error ? <span role="alert" className="font-normal text-rose-700 dark:text-rose-300">{error}</span> : null}</label>;
}

const control = "min-h-10 min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function PressRagWorkflowSandboxPanel({
  draft, errors, recorded, tested, onChange, onRun, onReset,
}: {
  draft: PressRagStageDraft;
  errors: readonly PressRagSandboxValidationError[];
  recorded: PressRagSandboxProjection;
  tested: PressRagSandboxProjection | null;
  onChange: (draft: PressRagStageDraft) => void;
  onRun: () => void;
  onReset: () => void;
}) {
  const error = (field: string) => errors.find((entry) => entry.field === field)?.message;
  const set = (values: object) => onChange({ ...draft, ...values } as PressRagStageDraft);
  const json = tested ?? recorded;

  return (
    <section className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4" aria-labelledby="sandbox-form-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-mono text-[10px] uppercase tracking-wider text-primary">structured stage form</p><h3 id="sandbox-form-heading" className="text-sm font-black">선택 단계 테스트 입력</h3></div>
        <p className="text-xs text-muted-foreground">파생 rank·expected·checks·traversal·gate verdict는 읽기 전용입니다.</p>
      </div>
      <div className="mt-3 grid min-w-0 gap-3">
        {draft.stageId === "request-intake" ? <Field label="프롬프트" error={error("prompt")}><textarea value={draft.prompt} maxLength={4000} onChange={(event) => set({ prompt: event.target.value })} className={`${control} min-h-24 resize-y`} /></Field> : null}

        {draft.stageId === "retrieval-execution" ? <>
          <fieldset className="grid gap-2"><legend className="text-xs font-black">검색 hits</legend>{draft.hits.map((hit, index) => <div key={`${hit.logicalDocumentId}-${index}`} className="grid min-w-0 gap-2 rounded-lg border border-border bg-background p-2 sm:grid-cols-2">
            <Field label={`문서 ID ${index + 1}`} error={error(`hits.${index}.logicalDocumentId`)}><input value={hit.logicalDocumentId} onChange={(event) => set({ hits: draft.hits.map((row, i) => i === index ? { ...row, logicalDocumentId: event.target.value } : row) })} className={control} /></Field>
            <Field label="파일명" error={error(`hits.${index}.filename`)}><input value={hit.filename} onChange={(event) => set({ hits: draft.hits.map((row, i) => i === index ? { ...row, filename: event.target.value } : row) })} className={control} /></Field>
            <Field label="시작 페이지" error={error(`hits.${index}.pageStart`)}><input type="number" value={hit.pageStart} onChange={(event) => set({ hits: draft.hits.map((row, i) => i === index ? { ...row, pageStart: Number(event.target.value) } : row) })} className={control} /></Field>
            <Field label="끝 페이지" error={error(`hits.${index}.pageEnd`)}><input type="number" value={hit.pageEnd} onChange={(event) => set({ hits: draft.hits.map((row, i) => i === index ? { ...row, pageEnd: Number(event.target.value) } : row) })} className={control} /></Field>
            <Field label="검색 점수 (0~1, 선택)" error={error(`hits.${index}.score`)}><input type="number" min="0" max="1" step="0.01" value={hit.score ?? ""} onChange={(event) => set({ hits: draft.hits.map((row, i) => i === index ? { ...row, score: event.target.value === "" ? null : Number(event.target.value) } : row) })} className={control} /></Field>
            <button type="button" onClick={() => set({ hits: draft.hits.filter((_, i) => i !== index) })} className="min-h-10 rounded-lg border border-border text-xs font-black">hit 제거</button>
          </div>)}<button type="button" onClick={() => set({ hits: [...draft.hits, { logicalDocumentId: "sandbox-document", filename: "sandbox.pdf", pageStart: 1, pageEnd: 1, score: null }] })} className="min-h-10 rounded-lg border border-dashed border-primary text-xs font-black text-primary">hit 추가</button></fieldset>
          <fieldset className="grid gap-2"><legend className="text-xs font-black">도구 실행</legend>{draft.tools.map((tool, index) => <div key={`${tool.sequence}-${index}`} className="grid gap-2 rounded-lg border border-border bg-background p-2 sm:grid-cols-4">
            <Field label="순서" error={error(`tools.${index}.sequence`)}><input type="number" value={tool.sequence} onChange={(event) => set({ tools: draft.tools.map((row, i) => i === index ? { ...row, sequence: Number(event.target.value) } : row) })} className={control} /></Field>
            <Field label="도구"><select value={tool.toolName} onChange={(event) => set({ tools: draft.tools.map((row, i) => i === index ? { ...row, toolName: event.target.value as typeof row.toolName } : row) })} className={control}>{PRESS_RAG_SANDBOX_TOOL_NAMES.map((name) => <option key={name}>{name}</option>)}</select></Field>
            <Field label="상태"><select value={tool.status} onChange={(event) => set({ tools: draft.tools.map((row, i) => i === index ? { ...row, status: event.target.value as typeof row.status } : row) })} className={control}><option>COMPLETED</option><option>FAILED</option></select></Field>
            <Field label="지연 ms" error={error(`tools.${index}.latencyMs`)}><input type="number" value={tool.latencyMs} onChange={(event) => set({ tools: draft.tools.map((row, i) => i === index ? { ...row, latencyMs: Number(event.target.value) } : row) })} className={control} /></Field>
            <button type="button" onClick={() => set({ tools: draft.tools.filter((_, i) => i !== index) })} className="min-h-10 rounded-lg border border-border text-xs font-black sm:col-span-4">도구 제거</button>
          </div>)}<button type="button" onClick={() => set({ tools: [...draft.tools, { sequence: (draft.tools.at(-1)?.sequence ?? 0) + 1, toolName: "search_knowledge", status: "COMPLETED", latencyMs: 0 }] })} className="min-h-10 rounded-lg border border-dashed border-primary text-xs font-black text-primary">도구 추가</button></fieldset>
        </> : null}

        {draft.stageId === "evidence-decision" ? <Field label="응답 분기" error={error("responseBranch")}><select value={draft.responseBranch} onChange={(event) => set({ responseBranch: event.target.value })} className={control}><option>ANSWER</option><option>ABSTENTION</option><option>CONFLICT_COMPARISON</option></select></Field> : null}

        {draft.stageId === "response-behavior" ? <>
          <Field label="답변" error={error("finalAnswer")}><textarea value={draft.finalAnswer ?? ""} onChange={(event) => set({ finalAnswer: event.target.value || null })} className={`${control} min-h-24 resize-y`} /></Field>
          <Field label="요약" error={error("summary")}><textarea value={draft.summary ?? ""} onChange={(event) => set({ summary: event.target.value || null })} className={`${control} min-h-20 resize-y`} /></Field>
          <fieldset className="grid gap-2"><legend className="text-xs font-black">인용</legend>{draft.citations.map((citation, index) => <div key={`${citation.sourceLabel}-${index}`} className="grid gap-2 rounded-lg border border-border bg-background p-2 sm:grid-cols-2">
            <Field label="출처 라벨" error={error(`citations.${index}.sourceLabel`)}><input value={citation.sourceLabel} onChange={(event) => set({ citations: draft.citations.map((row, i) => i === index ? { ...row, sourceLabel: event.target.value } : row) })} className={control} /></Field>
            <Field label="논리 문서 ID" error={error(`citations.${index}.logicalDocumentId`)}><input value={citation.logicalDocumentId} onChange={(event) => set({ citations: draft.citations.map((row, i) => i === index ? { ...row, logicalDocumentId: event.target.value } : row) })} className={control} /></Field>
            <Field label="파일명" error={error(`citations.${index}.filename`)}><input value={citation.filename} onChange={(event) => set({ citations: draft.citations.map((row, i) => i === index ? { ...row, filename: event.target.value } : row) })} className={control} /></Field>
            <div className="grid grid-cols-2 gap-2"><Field label="시작 p." error={error(`citations.${index}.pageStart`)}><input type="number" value={citation.pageStart} onChange={(event) => set({ citations: draft.citations.map((row, i) => i === index ? { ...row, pageStart: Number(event.target.value) } : row) })} className={control} /></Field><Field label="끝 p." error={error(`citations.${index}.pageEnd`)}><input type="number" value={citation.pageEnd} onChange={(event) => set({ citations: draft.citations.map((row, i) => i === index ? { ...row, pageEnd: Number(event.target.value) } : row) })} className={control} /></Field></div>
            <button type="button" onClick={() => set({ citations: draft.citations.filter((_, i) => i !== index) })} className="min-h-10 rounded-lg border border-border text-xs font-black">인용 제거</button>
          </div>)}<button type="button" onClick={() => set({ citations: [...draft.citations, { sourceLabel: "sandbox-source", logicalDocumentId: "sandbox-document", filename: "sandbox.pdf", pageStart: 1, pageEnd: 1 }] })} className="min-h-10 rounded-lg border border-dashed border-primary text-xs font-black text-primary">인용 추가</button></fieldset>
        </> : null}

        {draft.stageId === "verification" ? <div className="grid gap-2 sm:grid-cols-2">
          <Field label="모드" error={error("verification")}><select value={draft.mode ?? "NONE"} onChange={(event) => set({ mode: event.target.value === "NONE" ? null : event.target.value, status: event.target.value === "NONE" ? null : draft.status ?? "PASS" })} className={control}><option value="NONE">기록 없음</option><option>ANSWER</option><option>ABSTENTION</option></select></Field>
          <Field label="상태"><select value={draft.status ?? "NONE"} onChange={(event) => set({ status: event.target.value === "NONE" ? null : event.target.value, mode: event.target.value === "NONE" ? null : draft.mode ?? "ANSWER" })} className={control}><option value="NONE">기록 없음</option><option>PASS</option><option>FAIL</option></select></Field>
          <Field label="지원 주장" error={error("supportedClaims")}><input type="number" value={draft.supportedClaims} onChange={(event) => set({ supportedClaims: Number(event.target.value) })} className={control} /></Field>
          <Field label="전체 주장" error={error("totalClaims")}><input type="number" value={draft.totalClaims} onChange={(event) => set({ totalClaims: Number(event.target.value) })} className={control} /></Field>
        </div> : null}

        {draft.stageId === "fallback" ? <div className="grid gap-2 sm:grid-cols-2"><Field label="대체 모드"><select value={draft.mode ?? "NONE"} onChange={(event) => set({ mode: event.target.value === "NONE" ? null : event.target.value, reason: event.target.value === "NONE" ? null : draft.reason ?? "MANUAL_TEST" })} className={control}><option value="NONE">사용 안 함</option><option>EXTRACTIVE</option><option>ABSTENTION</option></select></Field><Field label="안전 사유 코드" error={error("reason")}><input value={draft.reason ?? ""} onChange={(event) => set({ reason: event.target.value || null })} className={control} /></Field></div> : null}

        {draft.stageId === "terminal-evaluation" ? <div className="grid gap-2 sm:grid-cols-2"><Field label="실행 상태"><select value={draft.status} onChange={(event) => set({ status: event.target.value, errorCode: event.target.value === "FAILED" ? draft.errorCode ?? "SANDBOX_FAILURE" : null })} className={control}><option>COMPLETED</option><option>FAILED</option></select></Field><Field label="오류 코드" error={error("errorCode")}><input value={draft.errorCode ?? ""} onChange={(event) => set({ errorCode: event.target.value || null })} className={control} /></Field><Field label="지연 ms" error={error("latencyMs")}><input type="number" value={draft.latencyMs} onChange={(event) => set({ latencyMs: Number(event.target.value) })} className={control} /></Field><Field label="비용 micro-USD" error={error("costMicros")}><input type="number" value={draft.costMicros} onChange={(event) => set({ costMicros: Number(event.target.value) })} className={control} /></Field></div> : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={errors.length > 0} onClick={onRun} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-black text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">이 단계부터 실행</button><button type="button" onClick={onReset} className="min-h-11 rounded-lg border border-border bg-background px-4 text-sm font-black">테스트 초기화</button></div>

      <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2"><details className="min-w-0 rounded-lg border border-border bg-background p-3"><summary className="cursor-pointer text-xs font-black">기록/테스트 비교</summary><dl className="mt-2 grid gap-2 text-xs"><div><dt className="text-muted-foreground">기록 판정</dt><dd>{recorded.workflow.nodes.at(-1)?.status}</dd></div><div><dt className="text-muted-foreground">마지막 성공 테스트</dt><dd>{tested?.workflow.nodes.at(-1)?.status ?? "아직 없음"}</dd></div></dl></details><details className="min-w-0 rounded-lg border border-border bg-background p-3"><summary className="cursor-pointer text-xs font-black">고급 JSON (읽기 전용)</summary><pre tabIndex={0} className="mt-2 max-h-80 min-w-0 overflow-auto whitespace-pre-wrap break-all text-[10px]">{JSON.stringify({ outcome: json.outcome, workflow: json.workflow, guardrails: json.guardrails }, null, 2)}</pre></details></div>
    </section>
  );
}
