"use client";

import { Check, ClipboardPaste, Copy, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";

import { RESUME_DOCUMENT_CSS_VARIABLES, ResumeEditorSection } from "@/components/resume/ResumeEditorDocument";
import {
  parseResumeAiEditResult,
  prepareResumeAiEdit,
  selectResumeAiEditSections,
  serializeResumeAiEditBundle,
  type PreparedResumeAiEdit,
  type ResumeAiEditChange,
  type ResumeAiEditContext,
  type ResumeAiEditResult,
} from "@/domain/resume-documents/aiEdit";
import type { ResumeDocumentState } from "@/domain/resume-documents/model";

const operationLabels: Record<ResumeAiEditChange["operationType"], string> = {
  UPDATE_SECTION_TITLE: "섹션 이름 수정",
  UPDATE_NARRATIVE: "본문 수정",
  UPDATE_IDENTITY: "인적사항 수정",
  UPDATE_ELIGIBILITY: "지원 자격 수정",
  UPDATE_ITEM: "기존 항목 수정",
  ADD_ITEM: "새 항목 추가",
  UPDATE_TAGS: "키워드 수정",
  RESET_SECTION_TO_PARENT: "상위 내용으로 되돌리기",
};

type SectionPreviewGroup = {
  sectionId: string;
  sectionTitle: string;
  changes: ResumeAiEditChange[];
  beforeSection: ResumeAiEditChange["beforeSection"];
  afterSection: ResumeAiEditChange["afterSection"];
  beforeRelatedWorkItems: ResumeAiEditChange["beforeRelatedWorkItems"];
  afterRelatedWorkItems: ResumeAiEditChange["afterRelatedWorkItems"];
};

type ResumeAiJsonEditDialogProps = {
  context: ResumeAiEditContext;
  contextLabel: string;
  state: ResumeDocumentState;
  onApply: (state: ResumeDocumentState) => void;
  onClose: () => void;
};

export function ResumeAiJsonEditDialog({
  context,
  contextLabel,
  state,
  onApply,
  onClose,
}: ResumeAiJsonEditDialogProps) {
  const exportJson = useMemo(
    () => serializeResumeAiEditBundle(state, context),
    [context, state],
  );
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [prepared, setPrepared] = useState<PreparedResumeAiEdit | null>(null);
  const [parsedResult, setParsedResult] = useState<ResumeAiEditResult | null>(null);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);

  const copyBundle = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(exportJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("클립보드에 복사하지 못했습니다. 아래 JSON을 직접 선택해 복사해 주세요.");
    }
  };

  const inspect = () => {
    setError("");
    setPrepared(null);
    setParsedResult(null);
    setSelectedSectionIds([]);
    try {
      const result = parseResumeAiEditResult(input);
      const nextPrepared = prepareResumeAiEdit(state, context, result);
      setPrepared(nextPrepared);
      setParsedResult(result);
      setSelectedSectionIds([...new Set(nextPrepared.changes.map((change) => change.sectionId))]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 편집 결과를 확인하지 못했습니다.");
    }
  };

  const applyResult = (result: ResumeAiEditResult) => {
    setError("");
    try {
      onApply(prepareResumeAiEdit(state, context, result).state);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "선택한 변경을 적용하지 못했습니다.");
    }
  };
  const apply = () => {
    if (!parsedResult) return;
    applyResult(selectResumeAiEditSections(parsedResult, selectedSectionIds));
  };
  const applyAll = () => {
    if (!parsedResult || !window.confirm(`검토한 ${sectionGroups.length}개 섹션의 변경을 모두 반영할까요?`)) return;
    applyResult(parsedResult);
  };

  const sectionGroups = prepared ? Array.from(
    prepared.changes.reduce((groups, change) => {
      const group = groups.get(change.sectionId);
      if (group) {
        group.changes.push(change);
        group.sectionTitle = change.sectionTitle;
        group.afterSection = change.afterSection;
        group.afterRelatedWorkItems = change.afterRelatedWorkItems;
      }
      else groups.set(change.sectionId, {
        sectionId: change.sectionId,
        sectionTitle: change.sectionTitle,
        changes: [change],
        beforeSection: change.beforeSection,
        afterSection: change.afterSection,
        beforeRelatedWorkItems: change.beforeRelatedWorkItems,
        afterRelatedWorkItems: change.afterRelatedWorkItems,
      });
      return groups;
    }, new Map<string, SectionPreviewGroup>()),
  ).map(([, group]) => group) : [];
  const selectedChangeCount = sectionGroups
    .filter((group) => selectedSectionIds.includes(group.sectionId))
    .reduce((total, group) => total + group.changes.length, 0);

  return (
    <div className="resume-editor-backdrop fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-black/60 p-4">
      <section
        aria-labelledby="resume-ai-json-title"
        aria-modal="true"
        className="my-auto flex max-h-[94vh] w-full max-w-5xl flex-col border border-border bg-background shadow-2xl"
        role="dialog"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-primary">
              <Sparkles className="h-4 w-4" /> JSON AI EDIT
            </p>
            <h2 className="mt-1 text-xl font-extrabold" id="resume-ai-json-title">AI로 이력서 다듬기</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              편집 범위: <strong className="text-foreground">{contextLabel}</strong>. 이 범위는 JSON을 가져올 때 다시 확인합니다.
            </p>
          </div>
          <button aria-label="AI JSON 편집 닫기" className="grid h-10 w-10 shrink-0 place-items-center border border-border" onClick={onClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-primary">STEP 1</p>
                  <h3 className="mt-1 font-extrabold">GPT에 전달할 JSON 복사</h3>
                </div>
                <button className="inline-flex h-10 shrink-0 items-center gap-2 border border-primary px-3 text-xs font-bold text-primary" onClick={() => { void copyBundle(); }} type="button">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "복사됨" : "JSON 복사"}
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                JSON을 GPT에 붙여넣고 원하는 수정 방향을 설명하세요. 제공되지 않은 경력·수치·자격은 만들지 말라고 함께 요청하는 것이 좋습니다.
              </p>
              <textarea
                aria-label="GPT에 전달할 이력서 JSON"
                className="mt-4 h-80 w-full resize-y border border-border bg-muted/20 p-3 font-mono text-[11px] leading-5 outline-none focus:border-primary"
                readOnly
                value={exportJson}
              />
            </section>

            <section className="border border-border bg-card p-4">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-primary">STEP 2</p>
                <h3 className="mt-1 font-extrabold">GPT의 결과 JSON 붙여넣기</h3>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                GPT가 반환한 JSON 전체를 한 번에 붙여넣으세요. Markdown의 <code>```json</code> 코드 블록도 인식합니다.
              </p>
              <textarea
                aria-label="GPT가 반환한 이력서 편집 JSON"
                className="mt-4 h-80 w-full resize-y border border-border bg-background p-3 font-mono text-[11px] leading-5 outline-none focus:border-primary"
                onChange={(event) => {
                  setInput(event.target.value);
                  setPrepared(null);
                  setParsedResult(null);
                  setSelectedSectionIds([]);
                  setError("");
                }}
                placeholder={'{"protocol":"briefflow.resume.edit-result", ...}'}
                value={input}
              />
              <button className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40" disabled={!input.trim()} onClick={inspect} type="button">
                <ClipboardPaste className="h-4 w-4" /> 변경 내용 확인
              </button>
            </section>
          </div>

          {error && <p aria-live="assertive" className="mt-5 border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}

          {prepared && (
            <section className="mt-6 border border-primary/30 bg-primary/5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-primary">PREVIEW</p>
                  <h3 className="mt-1 text-lg font-extrabold">섹션별 검토 · 변경 {prepared.changes.length}개</h3>
                  <p className="mt-1 text-xs text-muted-foreground">모든 섹션이 기본 선택됩니다. 반영하지 않을 섹션만 체크 해제하세요.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="inline-flex h-10 items-center gap-2 border border-primary bg-background px-4 text-sm font-bold text-primary" onClick={applyAll} type="button"><Check className="h-4 w-4" /> 전체 승인·반영</button>
                  <button className="inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40" disabled={selectedSectionIds.length === 0} onClick={apply} type="button"><Check className="h-4 w-4" /> 선택한 섹션 {selectedSectionIds.length}개 적용</button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-border bg-background px-3 py-2">
                <p className="text-xs font-bold">선택 {selectedSectionIds.length}/{sectionGroups.length}개 섹션 · 변경 {selectedChangeCount}개</p>
                <div className="flex gap-2">
                  <button className="h-8 border border-border px-3 text-[11px] font-bold" onClick={() => setSelectedSectionIds(sectionGroups.map((group) => group.sectionId))} type="button">전체 선택</button>
                  <button className="h-8 border border-border px-3 text-[11px] font-bold" onClick={() => setSelectedSectionIds([])} type="button">선택 해제</button>
                </div>
              </div>

              {(prepared.assumptions.length > 0 || prepared.warnings.length > 0) && (
                <div className="mt-4 grid gap-2 border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                  {prepared.assumptions.map((message, index) => <p key={`assumption-${index}`}><strong>가정:</strong> {message}</p>)}
                  {prepared.warnings.map((message, index) => <p key={`warning-${index}`}><strong>경고:</strong> {message}</p>)}
                </div>
              )}

              <div className="mt-4 grid gap-3">
                {sectionGroups.map((group, groupIndex) => {
                  const selected = selectedSectionIds.includes(group.sectionId);
                  return <section className={`border bg-background ${selected ? "border-primary" : "border-border"}`} key={group.sectionId}>
                    <label className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3">
                      <input checked={selected} onChange={(event) => setSelectedSectionIds((current) => event.target.checked ? [...current, group.sectionId] : current.filter((id) => id !== group.sectionId))} type="checkbox" />
                      <span className="font-extrabold">{group.sectionTitle}</span>
                      <span className="ml-auto text-[10px] font-bold text-muted-foreground">변경 {group.changes.length}개</span>
                    </label>
                    <div className={selected ? "" : "opacity-55"}>
                      <div className="grid gap-px bg-border md:grid-cols-2">
                        <SectionDocumentPreview label="수정 전" relatedWorkItems={group.beforeRelatedWorkItems} section={group.beforeSection} tone="before" />
                        <SectionDocumentPreview label="수정 후" relatedWorkItems={group.afterRelatedWorkItems} section={group.afterSection} tone="after" />
                      </div>
                      <details className="border-t border-border" open={groupIndex === 0}>
                        <summary className="cursor-pointer px-4 py-3 text-xs font-bold">수정 내역 {group.changes.length}개</summary>
                        <ul className="grid gap-1 border-t border-border px-4 py-3 text-xs text-muted-foreground">
                          {group.changes.map((change, index) => <li key={`${change.operationType}-${index}`}>{index + 1}. {operationLabels[change.operationType]}</li>)}
                        </ul>
                      </details>
                    </div>
                  </section>;
                })}
              </div>
            </section>
          )}
        </div>

        <footer className="flex shrink-0 justify-end border-t border-border bg-muted/30 p-4">
          <button className="h-10 border border-border bg-background px-4 text-sm font-bold" onClick={onClose} type="button">닫기</button>
        </footer>
      </section>
    </div>
  );
}

function SectionDocumentPreview({ label, relatedWorkItems, section, tone }: {
  label: string;
  relatedWorkItems: ResumeAiEditChange["beforeRelatedWorkItems"];
  section: ResumeAiEditChange["beforeSection"];
  tone: "before" | "after";
}) {
  return <div className="min-w-0 bg-muted/20 p-3">
    <p className={`mb-2 text-[10px] font-bold tracking-widest ${tone === "before" ? "text-red-600" : "text-primary"}`}>{label}</p>
    <div className="resume-paper overflow-auto bg-white p-4 text-slate-950 shadow-sm" style={RESUME_DOCUMENT_CSS_VARIABLES}>
      <ResumeEditorSection relatedWorkItems={relatedWorkItems} section={section} />
    </div>
  </div>;
}
