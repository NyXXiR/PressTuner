"use client";

import { Braces, Check, ClipboardPaste, Copy, X } from "lucide-react";
import { useMemo, useState } from "react";

import { RESUME_DOCUMENT_CSS_VARIABLES, ResumeEditorSection } from "@/components/resume/ResumeEditorDocument";
import {
  assertResumeAiEditTargets,
  diffResumeItemBodyLines,
  parseResumeAiEditResult,
  prepareTargetedResumeAiEdit,
  RESUME_AI_EDIT_RESULT_PROTOCOL,
  ResumeAiEditError,
  resumeAiEditTargetOptions,
  retargetResumeAiEditResult,
  reviewResumeAiEdit,
  reviewResumeAiEditSectionForCurrentVariant,
  selectResumeAiEditSections,
  serializeResumeAiEditBundle,
  type ResumeAiEditChange,
  type ResumeAiEditContext,
  type ResumeAiEditResult,
  type ResumeAiEditContext as ResumeAiEditTargetContext,
  type ReviewedResumeAiEdit,
} from "@/domain/resume-documents/aiEdit";
import type { ResumeDocumentState } from "@/domain/resume-documents/model";

const DEFAULT_AI_EDIT_PROMPT = "아래 BriefFlow 이력서 자료를 채용 담당자가 빠르게 이해할 수 있도록 다듬어줘. 사실·수치·기간·경력은 새로 만들지 말고 중복 표현을 줄여줘. 기존 항목의 body를 바꿀 때는 기존 내용과 병합하지 말고 최종 전체 본문을 보내줘. 각 경험은 행동과 결과가 드러나게 작성하고, 입력된 편집 범위와 규칙을 지켜 지정된 JSON 형식으로만 반환해줘.";

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
  sectionId?: string;
  sectionLabel?: string;
  state: ResumeDocumentState;
  onApply: (state: ResumeDocumentState, summary: ResumeAiEditApplySummary) => void;
  onClose: () => void;
  onEditAll?: () => void;
};

export type ResumeAiEditApplySummary = {
  sectionCount: number;
  changeCount: number;
};

type ResumeAiEditDialogError = {
  message: string;
  code?: string;
};

export function ResumeAiJsonEditDialog({
  context,
  contextLabel,
  sectionId,
  sectionLabel,
  state,
  onApply,
  onClose,
  onEditAll,
}: ResumeAiJsonEditDialogProps) {
  const exportJson = useMemo(
    () => serializeResumeAiEditBundle(state, context, sectionId ? { sectionIds: [sectionId] } : {}),
    [context, sectionId, state],
  );
  const [input, setInput] = useState("");
  const [error, setError] = useState<ResumeAiEditDialogError | null>(null);
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [prepared, setPrepared] = useState<ReviewedResumeAiEdit | null>(null);
  const [parsedResult, setParsedResult] = useState<ResumeAiEditResult | null>(null);
  const [sourceResult, setSourceResult] = useState<ResumeAiEditResult | null>(null);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [sectionTargetScopes, setSectionTargetScopes] = useState<Record<string, ResumeAiEditContext["scope"]>>({});

  const copyBundle = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(exportJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError({ message: "클립보드에 복사하지 못했습니다. 아래 편집 자료를 직접 선택해 복사해 주세요." });
    }
  };

  const copyPrompt = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(DEFAULT_AI_EDIT_PROMPT);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2_000);
    } catch {
      setError({ message: "프롬프트를 복사하지 못했습니다. 예시 문장을 직접 선택해 복사해 주세요." });
    }
  };

  const editAll = () => {
    setInput("");
    setError(null);
    setPrepared(null);
    setParsedResult(null);
    setSourceResult(null);
    setSelectedSectionIds([]);
    setSectionTargetScopes({});
    onEditAll?.();
  };

  const inspect = () => {
    setError(null);
    setPrepared(null);
    setParsedResult(null);
    setSourceResult(null);
    setSelectedSectionIds([]);
    setSectionTargetScopes({});
    try {
      const parsed = parseResumeAiEditResult(input);
      const result = sectionId ? assertResumeAiEditTargets(parsed, [sectionId]) : parsed;
      const nextPrepared = reviewResumeAiEdit(state, context, result);
      setPrepared(nextPrepared);
      setSourceResult(result);
      setParsedResult({
        protocol: RESUME_AI_EDIT_RESULT_PROTOCOL,
        version: 1,
        baseFingerprint: nextPrepared.reviewedAgainstFingerprint,
        editContext: result.editContext,
        operations: nextPrepared.acceptedOperations,
        assumptions: result.assumptions,
        warnings: result.warnings,
      });
      setSelectedSectionIds([...new Set(nextPrepared.changes.map((change) => change.sectionId))]);
      setSectionTargetScopes(Object.fromEntries(nextPrepared.changes.map((change) => [change.sectionId, context.scope])));
    } catch (cause) {
      setError({
        message: cause instanceof Error ? cause.message : "섹션 편집 결과를 확인하지 못했습니다.",
        ...(cause instanceof ResumeAiEditError ? { code: cause.code } : {}),
      });
    }
  };
  const includeConflictedSectionInCurrentVariant = (conflictedSectionId: string) => {
    if (!sourceResult || context.scope !== "variant") return;
    setError(null);
    try {
      const overrideReview = reviewResumeAiEditSectionForCurrentVariant(state, context, sourceResult, conflictedSectionId);
      if (!overrideReview.changes.length) {
        throw new ResumeAiEditError("RESUME_AI_EDIT_NO_CHANGES", "현재 이력서에 새로 반영할 변경이 없습니다.");
      }
      setPrepared((current) => current ? {
        ...current,
        changes: [
          ...current.changes.filter((change) => change.sectionId !== conflictedSectionId),
          ...overrideReview.changes,
        ],
        acceptedOperations: [
          ...current.acceptedOperations.filter((operation) => operation.sectionId !== conflictedSectionId),
          ...overrideReview.acceptedOperations,
        ],
        issues: [
          ...current.issues.filter((issue) => !(issue.sectionId === conflictedSectionId && issue.code === "RESUME_AI_EDIT_SECTION_CHANGED")),
          ...overrideReview.issues,
        ],
        conflictedSectionIds: current.conflictedSectionIds.filter((id) => id !== conflictedSectionId),
      } : current);
      setParsedResult((current) => current ? {
        ...current,
        operations: [
          ...current.operations.filter((operation) => operation.sectionId !== conflictedSectionId),
          ...overrideReview.acceptedOperations,
        ],
      } : current);
      setSelectedSectionIds((current) => [...new Set([...current, conflictedSectionId])]);
      setSectionTargetScopes((current) => ({ ...current, [conflictedSectionId]: "variant" }));
    } catch (cause) {
      setError({
        message: cause instanceof Error ? cause.message : "현재 이력서에 적용할 변경을 검토하지 못했습니다.",
        ...(cause instanceof ResumeAiEditError ? { code: cause.code } : {}),
      });
    }
  };

  const targetContextFor = (sectionId: string): ResumeAiEditTargetContext => {
    const options = resumeAiEditTargetOptions(state, context, sectionId);
    return options.find((option) => option.id === sectionTargetScopes[sectionId])?.context ?? context;
  };
  const changeSectionTarget = (sectionId: string, targetContext: ResumeAiEditTargetContext) => {
    if (!parsedResult) return;
    setError(null);
    try {
      const operations = parsedResult.operations.filter((operation) => operation.sectionId === sectionId);
      const targeted = retargetResumeAiEditResult(state, parsedResult, targetContext, operations);
      const targetReview = reviewResumeAiEdit(state, targetContext, targeted);
      if (!targetReview.changes.length) {
        throw new ResumeAiEditError("RESUME_AI_EDIT_NO_CHANGES", "선택한 적용 위치에는 새로 반영할 변경이 없습니다.");
      }
      setPrepared((current) => current ? {
        ...current,
        changes: [
          ...current.changes.filter((change) => change.sectionId !== sectionId),
          ...targetReview.changes,
        ],
      } : current);
      setSectionTargetScopes((current) => ({ ...current, [sectionId]: targetContext.scope }));
    } catch (cause) {
      setError({
        message: cause instanceof Error ? cause.message : "선택한 적용 위치에서 변경 내용을 검토하지 못했습니다.",
        ...(cause instanceof ResumeAiEditError ? { code: cause.code } : {}),
      });
    }
  };
  const applyResult = (result: ResumeAiEditResult, groups: SectionPreviewGroup[]) => {
    setError(null);
    try {
      const applied = prepareTargetedResumeAiEdit(state, result, groups.map((group) => ({
        sectionId: group.sectionId,
        context: targetContextFor(group.sectionId),
      })));
      const appliedSectionCount = new Set(applied.changes.map((change) => change.sectionId)).size;
      onApply(applied.state, { sectionCount: appliedSectionCount, changeCount: applied.changes.length });
      onClose();
    } catch (cause) {
      setError({
        message: cause instanceof Error ? cause.message : "선택한 변경을 적용하지 못했습니다.",
        ...(cause instanceof ResumeAiEditError ? { code: cause.code } : {}),
      });
    }
  };
  const apply = () => {
    if (!parsedResult) return;
    const selectedGroups = sectionGroups.filter((group) => selectedSectionIds.includes(group.sectionId));
    const bodyReplacementCount = selectedGroups.flatMap((group) => group.changes)
      .filter((change) => change.itemEdit?.bodyReplaced).length;
    const propagationCount = selectedGroups.filter((group) => targetContextFor(group.sectionId).scope !== context.scope).length;
    const propagationNotice = propagationCount > 0 ? `\n${propagationCount}개 섹션은 현재 이력서보다 상위 범위에 저장되어 다른 이력서에도 반영될 수 있습니다.` : "";
    const message = bodyReplacementCount > 0
      ? `선택한 ${selectedGroups.length}개 섹션에서 기존 항목 본문 ${bodyReplacementCount}개를 전체 교체합니다.\n기존 본문은 유지하거나 병합하지 않습니다.${propagationNotice}\n적용할까요?`
      : `선택한 ${selectedGroups.length}개 섹션의 변경을 적용할까요?${propagationNotice}`;
    if (!window.confirm(message)) return;
    applyResult(selectResumeAiEditSections(parsedResult, selectedSectionIds), selectedGroups);
  };
  const applyAll = () => {
    if (!parsedResult) return;
    const bodyReplacementCount = sectionGroups.flatMap((group) => group.changes)
      .filter((change) => change.itemEdit?.bodyReplaced).length;
    const propagationCount = sectionGroups.filter((group) => targetContextFor(group.sectionId).scope !== context.scope).length;
    const propagationNotice = propagationCount > 0 ? `\n${propagationCount}개 섹션은 현재 이력서보다 상위 범위에 저장되어 다른 이력서에도 반영될 수 있습니다.` : "";
    const message = bodyReplacementCount > 0
      ? `검토한 ${sectionGroups.length}개 섹션에서 기존 항목 본문 ${bodyReplacementCount}개를 전체 교체합니다.\n기존 본문은 유지하거나 병합하지 않습니다.${propagationNotice}\n모두 반영할까요?`
      : `검토한 ${sectionGroups.length}개 섹션의 변경을 모두 반영할까요?${propagationNotice}`;
    if (!window.confirm(message)) return;
    applyResult(parsedResult, sectionGroups);
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
        aria-labelledby="resume-external-ai-title"
        aria-modal="true"
        className="my-auto flex max-h-[94vh] w-full max-w-5xl flex-col border border-border bg-background shadow-2xl"
        role="dialog"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-primary">
              <Braces className="h-4 w-4" /> JSON EDIT WORKFLOW
            </p>
            <h2 className="mt-1 text-xl font-extrabold" id="resume-external-ai-title">외부 AI {sectionId ? "개별 섹션" : "전체 이력서"} 편집</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              편집 범위: <strong className="text-foreground">{contextLabel}</strong>. 섹션 자료를 ChatGPT·Claude 등에 전달하거나 JSON을 직접 수정한 뒤 결과를 검토해 반영할 수 있습니다.
            </p>
            {sectionId ? <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold text-primary">개별 섹션만 포함: {sectionLabel ?? sectionId}</p>
              {onEditAll && <button className="h-8 border border-primary px-2.5 text-[11px] font-extrabold text-primary" onClick={editAll} type="button">전체 이력서 편집으로 전환</button>}
            </div> : <p className="mt-1 text-xs font-bold text-primary">현재 자료에는 편집 가능한 전체 섹션이 포함됩니다.</p>}
          </div>
          <button aria-label="외부 AI 편집 닫기" className="grid h-10 w-10 shrink-0 place-items-center border border-border" onClick={onClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-primary">STEP 1</p>
                  <h3 className="mt-1 font-extrabold">AI용 섹션 자료 복사</h3>
                </div>
                <button className="inline-flex h-10 shrink-0 items-center gap-2 border border-primary px-3 text-xs font-bold text-primary" onClick={() => { void copyBundle(); }} type="button">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "복사됨" : "편집 자료 복사"}
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                복사한 JSON을 외부 AI에 붙여넣고 원하는 수정 방향을 설명하세요. JSON을 이해한다면 아래 내용을 직접 수정해도 됩니다.
              </p>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">섹션 내용은 수정할 수 있지만 섹션 추가·삭제·순서 변경은 지원하지 않습니다. 선택 정보는 빈 문자열, 링크 전체는 빈 배열로 제거할 수 있습니다.</p>
              <details className="mt-3 border border-border bg-background text-xs">
                <summary className="cursor-pointer px-3 py-2 font-bold text-primary">프롬프트 예시 보기</summary>
                <div className="border-t border-border p-3">
                  <p className="leading-5 text-muted-foreground">{DEFAULT_AI_EDIT_PROMPT}</p>
                  <button aria-label="기본 프롬프트 복사" className="mt-2 inline-flex h-8 items-center gap-1.5 border border-primary/40 px-2.5 text-[11px] font-bold text-primary" onClick={() => { void copyPrompt(); }} type="button">
                    {promptCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {promptCopied ? "복사됨" : "프롬프트 복사"}
                  </button>
                </div>
              </details>
              <textarea
                aria-label="외부 AI에 전달할 이력서 편집 자료"
                className="mt-4 h-80 w-full resize-y border border-border bg-muted/20 p-3 font-mono text-[11px] leading-5 outline-none focus:border-primary"
                readOnly
                value={exportJson}
              />
            </section>

            <section className="border border-border bg-card p-4">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-primary">STEP 2</p>
                <h3 className="mt-1 font-extrabold">작성·수정 결과 붙여넣기</h3>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                외부 AI가 반환했거나 직접 수정한 결과 전체를 붙여넣으세요. JSON이나 Markdown 코드 블록 형식을 모두 인식합니다.
              </p>
              <textarea
                aria-label="이력서 섹션 작성 및 수정 결과"
                className="mt-4 h-80 w-full resize-y border border-border bg-background p-3 font-mono text-[11px] leading-5 outline-none focus:border-primary"
                onChange={(event) => {
                  setInput(event.target.value);
                  setPrepared(null);
                  setParsedResult(null);
                  setSourceResult(null);
                  setSelectedSectionIds([]);
                  setSectionTargetScopes({});
                  setError(null);
                }}
                placeholder={'{"protocol":"briefflow.resume.edit-result", ...}'}
                value={input}
              />
              <button className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40" disabled={!input.trim()} onClick={inspect} type="button">
                <ClipboardPaste className="h-4 w-4" /> 변경 내용 확인
              </button>
            </section>
          </div>

          {error && <div aria-live="assertive" className="mt-5 border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-bold">{error.message}</p>
            {(error.code === "RESUME_AI_EDIT_DOCUMENT_CHANGED" || error.code === "RESUME_AI_EDIT_CONTEXT_CHANGED") && <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-xs leading-5">현재 편집 범위의 최신 자료로 다시 요청하면 기존 작업을 안전하게 이어갈 수 있습니다.</p>
              <button className="h-8 border border-red-300 bg-white px-3 text-[11px] font-extrabold text-red-800" onClick={() => { void copyBundle(); }} type="button">
                최신 편집 자료 복사
              </button>
            </div>}
          </div>}

          {prepared && (
            <section className="mt-6 border border-primary/30 bg-primary/5 p-5">
              <div>
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-primary">PREVIEW</p>
                  <h3 className="mt-1 text-lg font-extrabold">섹션별 검토 · 적용 가능 {prepared.changes.length}개</h3>
                  <p className="mt-1 text-xs text-muted-foreground">적용 가능한 섹션은 기본 선택되고 현재 편집 위치에 저장됩니다. 필요한 섹션만 적용 위치를 바꿀 수 있습니다.</p>
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

              {prepared.rebased && <div className="mt-4 border border-sky-300 bg-sky-50 p-3 text-xs leading-5 text-sky-950">
                <p className="font-extrabold">최신 이력서 기준으로 변경 내용을 다시 비교했습니다.</p>
                <p className="mt-1">AI 요청 이후 달라진 내용이 있어 현재 문서를 기준으로 미리보기를 만들었습니다. 수정 전·후 내용을 확인한 뒤 적용해 주세요.</p>
              </div>}

              {prepared.issues.length > 0 && <div className="mt-4 border border-amber-300 bg-amber-50 p-4 text-amber-950">
                <p className="text-sm font-extrabold">확인이 필요한 작업 {prepared.issues.length}개</p>
                <p className="mt-1 text-xs leading-5">아래 작업은 우선 거부 상태입니다. 나머지 변경은 선택해 그대로 적용할 수 있습니다.</p>
                <ul className="mt-3 grid gap-3">
                  {prepared.issues.map((issue) => <li className="border border-amber-200 bg-white/70 p-3 text-xs leading-5" key={`${issue.operationIndex}-${issue.code}`}>
                    <p className="font-extrabold">{issue.operationIndex + 1}번 작업 · {operationLabels[issue.operationType]}</p>
                    <p className="mt-1">{issue.message}</p>
                    <p className="mt-1 text-amber-800">해결 방법: {issue.recovery}</p>
                    {issue.code === "RESUME_AI_EDIT_SECTION_CHANGED" && context.scope === "variant" && <button
                      className="mt-2 h-8 border border-amber-500 bg-white px-3 text-[11px] font-extrabold text-amber-950"
                      onClick={() => includeConflictedSectionInCurrentVariant(issue.sectionId)}
                      type="button"
                    >
                      이 이력서에만 적용
                    </button>}
                  </li>)}
                </ul>
                {prepared.issues.some((issue) => issue.code === "RESUME_AI_EDIT_ITEM_NOT_FOUND" || issue.code === "RESUME_AI_EDIT_SECTION_NOT_FOUND" || issue.code === "RESUME_AI_EDIT_SECTION_CHANGED") && <button className="mt-3 h-8 border border-amber-400 bg-white px-3 text-[11px] font-extrabold" onClick={() => { void copyBundle(); }} type="button">
                  최신 편집 자료 복사
                </button>}
              </div>}

              {prepared.changes.length === 0 && <p className="mt-4 border border-border bg-background p-4 text-sm font-bold">새로 적용할 변경은 없습니다. 위 안내를 확인하거나 최신 편집 자료로 다시 요청해 주세요.</p>}

              <div className="mt-4 grid gap-3">
                {sectionGroups.map((group, groupIndex) => {
                  const selected = selectedSectionIds.includes(group.sectionId);
                  return <section className={`border bg-background ${selected ? "border-primary" : "border-border"}`} key={group.sectionId}>
                    <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input checked={selected} onChange={(event) => setSelectedSectionIds((current) => event.target.checked ? [...current, group.sectionId] : current.filter((id) => id !== group.sectionId))} type="checkbox" />
                      <span className="font-extrabold">{group.sectionTitle}</span>
                      <span className={`px-1.5 py-0.5 text-[9px] font-extrabold ${selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{selected ? "반영" : "제외"}</span>
                      <span className="ml-auto text-[10px] font-bold text-muted-foreground">변경 {group.changes.length}개</span>
                      </label>
                      {(() => {
                        const options = resumeAiEditTargetOptions(state, context, group.sectionId);
                        const selectedScope = sectionTargetScopes[group.sectionId] ?? context.scope;
                        const selectedTarget = options.find((option) => option.id === selectedScope) ?? options[0];
                        return <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-muted-foreground">적용 위치</span>
                          {options.length > 1 ? <select
                            aria-label={`${group.sectionTitle} 적용 위치`}
                            className="h-8 max-w-56 border border-border bg-background px-2 text-[11px] font-extrabold text-primary"
                            onChange={(event) => {
                              const target = options.find((option) => option.id === event.target.value);
                              if (target) changeSectionTarget(group.sectionId, target.context);
                            }}
                            value={selectedTarget?.id ?? context.scope}
                          >
                            {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                          </select> : <span className="border border-border bg-muted/20 px-2 py-1 text-[10px] font-extrabold text-muted-foreground">{selectedTarget?.label}</span>}
                        </div>;
                      })()}
                    </div>
                    {(() => {
                      const options = resumeAiEditTargetOptions(state, context, group.sectionId);
                      const selectedScope = sectionTargetScopes[group.sectionId] ?? context.scope;
                      const selectedTarget = options.find((option) => option.id === selectedScope);
                      return selectedTarget && selectedTarget.id !== context.scope
                        ? <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-bold leading-5 text-amber-900">상위 범위 적용: {selectedTarget.propagation}</p>
                        : null;
                    })()}
                    <div className={selected ? "" : "opacity-55"}>
                      <div className="grid gap-px bg-border md:grid-cols-2">
                        <SectionDocumentPreview label="수정 전" relatedWorkItems={group.beforeRelatedWorkItems} section={group.beforeSection} tone="before" />
                        <SectionDocumentPreview label="수정 후" relatedWorkItems={group.afterRelatedWorkItems} section={group.afterSection} tone="after" />
                      </div>
                      <details className="border-t border-border" open={groupIndex === 0}>
                        <summary className="cursor-pointer px-4 py-3 text-xs font-bold">수정 내역 {group.changes.length}개</summary>
                        <ul className="grid gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
                          {group.changes.map((change, index) => <li key={`${change.operationType}-${change.itemEdit?.itemId ?? index}`}>
                            <p>{index + 1}. {operationLabels[change.operationType]}{change.itemEdit ? ` · ${change.itemEdit.itemTitle}` : ""}{change.itemEdit?.bodyReplaced ? " · 본문 전체 교체" : ""}</p>
                            {change.itemEdit?.bodyReplaced && <BodyReplacementDiff change={change} />}
                          </li>)}
                        </ul>
                      </details>
                    </div>
                  </section>;
                })}
              </div>
            </section>
          )}
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t border-border bg-background p-4 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center sm:justify-between" data-ai-review-actions>
          {prepared ? <p className="text-xs font-bold">선택 {selectedSectionIds.length}/{sectionGroups.length}개 섹션 · 변경 {selectedChangeCount}개</p> : <span />}
          <div className="flex flex-wrap justify-end gap-2">
            <button className="h-10 border border-border bg-background px-4 text-sm font-bold" onClick={onClose} type="button">닫기</button>
            {prepared && prepared.changes.length > 0 && <>
              <button className="inline-flex h-10 items-center gap-2 border border-primary bg-background px-4 text-sm font-bold text-primary" onClick={applyAll} type="button"><Check className="h-4 w-4" /> 전체 승인·반영</button>
              <button className="inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40" disabled={selectedSectionIds.length === 0} onClick={apply} type="button"><Check className="h-4 w-4" /> 선택한 섹션 {selectedSectionIds.length}개 적용</button>
            </>}
          </div>
        </footer>
      </section>
    </div>
  );
}

function BodyReplacementDiff({ change }: { change: ResumeAiEditChange }) {
  if (!change.itemEdit?.bodyReplaced) return null;
  const diff = diffResumeItemBodyLines(change.itemEdit.beforeBody, change.itemEdit.afterBody);
  if (!diff.removed.length && !diff.added.length) return <p className="mt-2 text-[11px]">본문의 줄 순서 또는 서식이 변경됩니다.</p>;
  return <div className="mt-2 grid gap-2 md:grid-cols-2">
    <div className="border border-red-200 bg-red-50 p-2 text-red-800">
      <p className="mb-1 font-extrabold">삭제 {diff.removed.length}줄</p>
      {diff.removed.length ? <ul className="grid gap-1">{diff.removed.map((line, index) => <li className="break-words" key={`removed-${index}`}>− {line}</li>)}</ul> : <p className="text-red-700/70">삭제되는 문장 없음</p>}
    </div>
    <div className="border border-emerald-200 bg-emerald-50 p-2 text-emerald-800">
      <p className="mb-1 font-extrabold">추가 {diff.added.length}줄</p>
      {diff.added.length ? <ul className="grid gap-1">{diff.added.map((line, index) => <li className="break-words" key={`added-${index}`}>+ {line}</li>)}</ul> : <p className="text-emerald-700/70">추가되는 문장 없음</p>}
    </div>
  </div>;
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
