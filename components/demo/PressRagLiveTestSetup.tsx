"use client";

import { PRESS_AGENT_RAG_DEBUGGER_PROMPT_PRESETS, PRESS_AGENT_RAG_DEBUGGER_RETRIEVAL_PRESETS, type PressAgentRagDebuggerDocument, type PressAgentRagDebuggerPromptPresetId, type PressAgentRagDebuggerRetrievalConfigurationId } from "@/domain/evaluation/pressAgentRagDebugger";

export function PressRagLiveTestSetup(props: {
  documents: PressAgentRagDebuggerDocument[];
  documentsLoading: boolean;
  documentsError: string | null;
  selectedDocumentIds: string[];
  onSelectedDocumentIdsChange: (ids: string[]) => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  promptPresetId: PressAgentRagDebuggerPromptPresetId | null;
  onPromptPresetChange: (id: PressAgentRagDebuggerPromptPresetId | null) => void;
  retrievalConfigurationId: PressAgentRagDebuggerRetrievalConfigurationId;
  onRetrievalConfigurationChange: (id: PressAgentRagDebuggerRetrievalConfigurationId) => void;
  disabled: boolean;
  onRetryDocuments: () => void;
}) {
  const ready = props.documents.filter((document) => document.selectable);
  function toggle(id: string) { props.onSelectedDocumentIdsChange(props.selectedDocumentIds.includes(id) ? props.selectedDocumentIds.filter((value) => value !== id) : [...props.selectedDocumentIds, id]); }
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
      <fieldset disabled={props.disabled} className="min-w-0 rounded-xl border border-border p-4">
        <legend className="px-2 text-sm font-black">1. 검색 문서 선택</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => props.onSelectedDocumentIdsChange(ready.map((document) => document.id))} disabled={ready.length === 0} className="rounded-lg border border-border px-3 py-2 text-xs font-bold disabled:opacity-50">준비된 문서 모두 선택</button>
          <button type="button" onClick={() => props.onSelectedDocumentIdsChange([])} disabled={props.selectedDocumentIds.length === 0} className="rounded-lg border border-border px-3 py-2 text-xs font-bold disabled:opacity-50">선택 해제</button>
        </div>
        {props.documentsLoading ? <p className="mt-3 text-sm text-muted-foreground">팀 문서를 불러오는 중입니다.</p> : null}
        {props.documentsError ? <p className="mt-3 text-sm text-rose-600">문서를 불러오지 못했습니다. <button type="button" onClick={props.onRetryDocuments} className="font-bold underline">다시 시도</button></p> : null}
        {!props.documentsLoading && !props.documentsError && props.documents.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">현재 팀에 등록된 문서가 없습니다.</p> : null}
        <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {props.documents.map((document) => <li key={document.id} className={`rounded-lg border p-3 ${document.selectable ? "border-border" : "border-border bg-muted/50"}`}>
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={props.selectedDocumentIds.includes(document.id)} onChange={() => toggle(document.id)} disabled={!document.selectable || props.disabled} className="mt-1" />
              <span className="min-w-0 text-sm"><strong className="block truncate">{document.name}</strong><span className="text-xs text-muted-foreground">{document.status} · {document.pageCount ?? "?"}쪽 · {document.chunkCount}개 청크</span>{document.readinessReason ? <span className="mt-1 block text-xs text-amber-700">선택 불가: {document.readinessReason}</span> : null}</span>
            </label>
          </li>)}
        </ul>
      </fieldset>
      <div className="space-y-4">
        <fieldset disabled={props.disabled} className="rounded-xl border border-border p-4">
          <legend className="px-2 text-sm font-black">2. 검색 구성</legend>
          <div className="space-y-2">{Object.values(PRESS_AGENT_RAG_DEBUGGER_RETRIEVAL_PRESETS).map((preset) => <label key={preset.id} className="flex gap-3 rounded-lg border border-border p-3 text-sm"><input type="radio" name="retrieval-preset" checked={props.retrievalConfigurationId === preset.id} onChange={() => props.onRetrievalConfigurationChange(preset.id)} /><span><strong>{preset.label}</strong><span className="mt-1 block text-xs text-muted-foreground">{preset.description}</span></span></label>)}</div>
        </fieldset>
        <fieldset disabled={props.disabled} className="rounded-xl border border-border p-4">
          <legend className="px-2 text-sm font-black">3. 프롬프트</legend>
          <div className="flex flex-wrap gap-2">{Object.values(PRESS_AGENT_RAG_DEBUGGER_PROMPT_PRESETS).map((preset) => <button key={preset.id} type="button" onClick={() => { props.onPromptPresetChange(preset.id); props.onPromptChange(preset.prompt); }} className={`rounded-lg border px-3 py-2 text-xs font-bold ${props.promptPresetId === preset.id ? "border-primary bg-primary/10" : "border-border"}`}>{preset.label}</button>)}</div>
          <label htmlFor="rag-debug-prompt" className="mt-4 block text-sm font-black">테스트 프롬프트</label>
          <textarea id="rag-debug-prompt" value={props.prompt} onChange={(event) => { props.onPromptPresetChange(null); props.onPromptChange(event.target.value); }} maxLength={12000} rows={5} placeholder="선택한 문서에서 확인하려는 질문을 입력하세요." className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm disabled:cursor-not-allowed disabled:opacity-60" />
        </fieldset>
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm"><strong>실행 전 확인</strong><p className="mt-1 text-muted-foreground">문서 {props.selectedDocumentIds.length}개 · {PRESS_AGENT_RAG_DEBUGGER_RETRIEVAL_PRESETS[props.retrievalConfigurationId].label} · {props.prompt.length.toLocaleString()}자</p></div>
      </div>
    </div>
  );
}
