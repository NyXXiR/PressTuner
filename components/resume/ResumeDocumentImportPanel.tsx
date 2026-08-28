"use client";

import {
  AlertTriangle,
  Check,
  FileSearch,
  FileUp,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DateInput } from "@/components/ui/DateInput";
import { ResumeItemDateFields, type ResumeItemDatePatch } from "@/components/resume/ResumeItemDateFields";
import {
  inspectResumeImportOverlap,
  importedResumeItemId,
  ResumeDocumentCandidatePayloadSchema,
  type ResumeImportOverlap,
  type ResumeDocumentApplyMode,
  type ResumeDocumentCandidatePayload,
  type ResumeDocumentImportCommand,
} from "@/domain/resume-documents/importCandidate";
import type {
  ItemContent,
  ResumeSection,
  SectionKind,
} from "@/domain/resume-documents/model";
import { formatItemPeriod, normalizeEmployerTitle } from "@/domain/resume-documents/model";
import { normalizeResumeItemDateValues } from "@/domain/resume-documents/itemDatePolicy";
import {
  INITIAL_IMPORT_POLL_DELAY_MS,
  canLoadImportCandidates,
  nextImportPollDelay,
  shouldPollImport,
  type ImportStatus,
} from "@/domain/resume-documents/importPollingPolicy";

type ResumeImport = {
  id: string;
  status: ImportStatus;
  candidateCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  source: {
    id: string;
    originalName: string;
    mimeType: string;
    status: string;
    pageCount: number | null;
    errorCode: string | null;
    errorMessage: string | null;
  };
};
type Evidence = {
  id: string;
  excerpt: string;
  pageStart: number | null;
  pageEnd: number | null;
  fieldPath: string;
};
type Candidate = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  kind: string;
  targetSectionId: string;
  targetSectionKind: SectionKind;
  applyMode: ResumeDocumentApplyMode;
  payload: ResumeDocumentCandidatePayload;
  payloadHash: string;
  confidence: number;
  warnings: string[];
  updatedAt: string;
  decidedAt: string | null;
  appliedAt: string | null;
  evidence: Evidence[];
};

const statusLabel: Record<ImportStatus, string> = {
  WAITING_SOURCE: "PDF 원문 분석 대기",
  QUEUED: "AI 분석 대기",
  EXTRACTING: "섹션별 후보 만드는 중",
  REVIEW_REQUIRED: "검토 필요",
  COMPLETE: "반영 완료",
  FAILED: "분석 실패",
};

function errorMessage(value: unknown) {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = (value as { error?: { message?: unknown; code?: unknown } })
      .error;
    if (typeof error?.message === "string") return error.message;
    if (typeof error?.code === "string") return error.code;
  }
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function isAbortError(value: unknown) {
  return value instanceof DOMException && value.name === "AbortError";
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(payload));
  return payload as T;
}

function validateCandidates(value: unknown): Candidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (typeof raw !== "object" || raw === null) return [];
    const candidate = raw as Candidate;
    const parsed = ResumeDocumentCandidatePayloadSchema.safeParse(
      candidate.payload,
    );
    return parsed.success ? [{ ...candidate, payload: parsed.data }] : [];
  });
}

export function ResumeDocumentImportPanel({
  sections,
  commonSections,
  workItems,
  onApply,
  onClose,
}: {
  sections: ResumeSection[];
  commonSections: ResumeSection[];
  workItems: ItemContent[];
  onApply: (command: ResumeDocumentImportCommand) => void;
  onClose: () => void;
}) {
  const [imports, setImports] = useState<ResumeImport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [inputMode, setInputMode] = useState<"text" | "pdf">("text");
  const [sourceText, setSourceText] = useState("");
  const [instruction, setInstruction] = useState("");
  const [generating, setGenerating] = useState(false);
  const [targetSectionIds, setTargetSectionIds] = useState<string[]>(() => {
    const preferred = commonSections.find((section) => section.id === "projects");
    return preferred ? [preferred.id] : commonSections[0] ? [commonSections[0].id] : [];
  });
  const [error, setError] = useState("");
  const selected = imports.find((item) => item.id === selectedId) ?? null;
  const detailControllerRef = useRef<AbortController | null>(null);
  const candidateControllerRef = useRef<AbortController | null>(null);
  const automaticallyLoadedImportRef = useRef<string | null>(null);
  const selectedStatusRef = useRef<ImportStatus | null>(selected?.status ?? null);
  const selectedSourceStatusRef = useRef<string | null>(selected?.source.status ?? null);
  selectedStatusRef.current = selected?.status ?? null;
  selectedSourceStatusRef.current = selected?.source.status ?? null;

  const upsertImport = useCallback((nextImport: ResumeImport) => {
    setImports((current) => {
      const index = current.findIndex((item) => item.id === nextImport.id);
      if (index < 0) return [nextImport, ...current];
      return current.map((item) => item.id === nextImport.id ? nextImport : item);
    });
  }, []);

  const loadCandidates = useCallback(async (importId: string) => {
    candidateControllerRef.current?.abort();
    const controller = new AbortController();
    candidateControllerRef.current = controller;
    try {
      const payload = await jsonRequest<{ candidates: unknown }>(
        `/api/resume/documents/candidates?importId=${encodeURIComponent(importId)}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setCandidates(validateCandidates(payload.candidates));
    } finally {
      if (candidateControllerRef.current === controller) candidateControllerRef.current = null;
    }
  }, []);

  const loadImportDetail = useCallback(async (importId: string) => {
    detailControllerRef.current?.abort();
    const controller = new AbortController();
    detailControllerRef.current = controller;
    try {
      const payload = await jsonRequest<{ import: ResumeImport }>(
        `/api/resume/documents/imports/${importId}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        selectedStatusRef.current = payload.import.status;
        selectedSourceStatusRef.current = payload.import.source.status;
        upsertImport(payload.import);
      }
      return payload.import;
    } finally {
      if (detailControllerRef.current === controller) detailControllerRef.current = null;
    }
  }, [upsertImport]);

  useEffect(() => {
    const controller = new AbortController();
    void jsonRequest<{ imports: ResumeImport[] }>("/api/resume/documents/imports", { signal: controller.signal })
      .then((payload) => {
        setImports(payload.imports);
        setSelectedId((current) => current ?? payload.imports[0]?.id ?? null);
      })
      .catch((cause) => {
        if (!isAbortError(cause)) setError(cause instanceof Error ? cause.message : "가져오기 목록을 불러오지 못했습니다.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    candidateControllerRef.current?.abort();
    automaticallyLoadedImportRef.current = null;
    setCandidates([]);
    return () => candidateControllerRef.current?.abort();
  }, [selectedId]);

  useEffect(() => {
    const selectedStatus = selected?.status;
    if (!selectedId || !selectedStatus || !canLoadImportCandidates(selectedStatus) || automaticallyLoadedImportRef.current === selectedId) return;
    void loadCandidates(selectedId)
      .then(() => { automaticallyLoadedImportRef.current = selectedId; })
      .catch((cause) => {
        if (!isAbortError(cause)) setError(cause instanceof Error ? cause.message : "후보를 불러오지 못했습니다.");
      });
  }, [loadCandidates, selected?.status, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    let stopped = false;
    let timer: number | null = null;
    let delay = INITIAL_IMPORT_POLL_DELAY_MS;
    let previousStatus = selectedStatusRef.current;
    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const schedule = (wait: number) => {
      clearTimer();
      if (!stopped && document.visibilityState === "visible") {
        timer = window.setTimeout(() => { void poll(); }, wait);
      }
    };
    const poll = async () => {
      clearTimer();
      const currentStatus = selectedStatusRef.current;
      const sourceStatus = selectedSourceStatusRef.current;
      if (stopped || document.visibilityState !== "visible" || !currentStatus || !sourceStatus || !shouldPollImport(currentStatus, sourceStatus)) return;
      detailControllerRef.current?.abort();
      const controller = new AbortController();
      detailControllerRef.current = controller;
      try {
        const payload = await jsonRequest<{ import: ResumeImport }>(
          `/api/resume/documents/imports/${selectedId}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted || stopped) return;
        const nextImport = payload.import;
        delay = nextImportPollDelay(delay, previousStatus ?? currentStatus, nextImport.status);
        previousStatus = nextImport.status;
        selectedStatusRef.current = nextImport.status;
        selectedSourceStatusRef.current = nextImport.source.status;
        upsertImport(nextImport);
        if (shouldPollImport(nextImport.status, nextImport.source.status)) schedule(delay);
      } catch (cause) {
        if (isAbortError(cause)) {
          const status = selectedStatusRef.current;
          const sourceStatus = selectedSourceStatusRef.current;
          if (!stopped && document.visibilityState === "visible" && status && sourceStatus && shouldPollImport(status, sourceStatus)) schedule(delay);
          return;
        }
        setError(cause instanceof Error ? cause.message : "가져오기 상태를 확인하지 못했습니다.");
        delay = nextImportPollDelay(delay, currentStatus, currentStatus);
        schedule(delay);
      } finally {
        if (detailControllerRef.current === controller) detailControllerRef.current = null;
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearTimer();
        detailControllerRef.current?.abort();
        return;
      }
      void poll();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const status = selectedStatusRef.current;
    const sourceStatus = selectedSourceStatusRef.current;
    if (status && sourceStatus && shouldPollImport(status, sourceStatus)) schedule(delay);
    return () => {
      stopped = true;
      clearTimer();
      detailControllerRef.current?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [selected?.source.status, selected?.status, selectedId, upsertImport]);

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const payload = await jsonRequest<{ import: ResumeImport }>(
        "/api/resume/documents/imports",
        { method: "POST", body: formData },
      );
      upsertImport(payload.import);
      setSelectedId(payload.import.id);
      setCandidates([]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "PDF를 업로드하지 못했습니다.",
      );
    } finally {
      setUploading(false);
    }
  };

  const createFromText = async () => {
    const targets = commonSections.filter((section) => targetSectionIds.includes(section.id));
    if (sourceText.trim().length < 20) {
      setError("정리할 내용을 20자 이상 붙여넣어 주세요.");
      return;
    }
    if (!targets.length) {
      setError("채울 공통 정보 섹션을 하나 이상 선택해 주세요.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const payload = await jsonRequest<{ import: ResumeImport }>(
        "/api/resume/documents/imports/text",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: sourceText,
            instruction,
            sections: targets.map(({ id, title, kind }) => ({ id, title, kind })),
          }),
        },
      );
      upsertImport(payload.import);
      setSelectedId(payload.import.id);
      setCandidates([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 제안을 만들지 못했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  const retry = async () => {
    if (!selected) return;
    setError("");
    try {
      if (selected.source.status === "FAILED") {
        await jsonRequest(
          `/api/resume/career/sources/${selected.source.id}/retry`,
          { method: "POST" },
        );
      } else {
        await jsonRequest(
          `/api/resume/documents/imports/${selected.id}/retry`,
          { method: "POST" },
        );
      }
      await loadImportDetail(selected.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "다시 시도하지 못했습니다.",
      );
    }
  };

  const refresh = async () => {
    if (!selectedId) return;
    try {
      await Promise.all([loadImportDetail(selectedId), loadCandidates(selectedId)]);
    } catch (cause) {
      if (!isAbortError(cause)) setError(cause instanceof Error ? cause.message : "가져오기 내용을 새로 고치지 못했습니다.");
    }
  };

  const failed =
    selected?.status === "FAILED" || selected?.source.status === "FAILED";
  return (
    <div className="resume-editor-backdrop fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-black/60 p-4">
      <section
        aria-labelledby="resume-import-title"
        aria-modal="true"
        className="my-auto flex max-h-[92vh] w-full max-w-5xl flex-col border border-border bg-background shadow-2xl"
        role="dialog"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-primary">
              REVIEW-FIRST IMPORT
            </p>
            <h2
              className="mt-1 text-xl font-extrabold"
              id="resume-import-title"
            >
              자료를 검토하고 공통 정보 채우기
            </h2>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
              줄글을 붙여넣거나 PDF를 가져오면 AI가 섹션별 후보만 만듭니다.
              승인한 항목만 문서에 반영되며, 승인 전에는 내용과 대상 섹션을 바꿀 수 있습니다.
            </p>
          </div>
          <button
            aria-label="PDF 가져오기 닫기"
            className="grid h-10 w-10 shrink-0 place-items-center border border-border"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="overflow-y-auto border-b border-border bg-muted/20 p-4 lg:border-b-0 lg:border-r">
            <div aria-label="자료 입력 방식" className="mb-3 grid grid-cols-2 border border-border bg-background p-1" role="tablist"><button aria-selected={inputMode === "text"} className={`h-9 text-xs font-extrabold ${inputMode === "text" ? "bg-foreground text-background" : "text-muted-foreground"}`} onClick={() => setInputMode("text")} role="tab" type="button">줄글 입력</button><button aria-selected={inputMode === "pdf"} className={`h-9 text-xs font-extrabold ${inputMode === "pdf" ? "bg-foreground text-background" : "text-muted-foreground"}`} onClick={() => setInputMode("pdf")} role="tab" type="button">PDF</button></div>
            {inputMode === "text" ? <div className="grid gap-3 border border-primary/30 bg-background p-3">
              <label className="grid gap-1.5 text-xs font-extrabold">정리할 줄글<textarea className="wg-field min-h-36 resize-y p-3 text-xs font-normal leading-5" maxLength={20_000} placeholder="기존 이력서나 메모에서 내용을 대충 붙여넣으세요. AI는 여기에 명시된 사실만 제안으로 만듭니다." value={sourceText} onChange={(event) => setSourceText(event.target.value)} /></label>
              <label className="grid gap-1.5 text-xs font-extrabold">AI에게 추가로 요청 <span className="font-normal text-muted-foreground">(선택)</span><textarea className="wg-field min-h-20 resize-y p-3 text-xs font-normal leading-5" maxLength={1_000} placeholder="예: 프로젝트별 문제·행동·성과가 드러나게 경력 상세로 나눠줘" value={instruction} onChange={(event) => setInstruction(event.target.value)} /></label>
              <fieldset><legend className="text-xs font-extrabold">채울 공통 정보 섹션</legend><div className="mt-2 grid gap-1.5">{commonSections.map((section) => <label className="flex cursor-pointer items-center gap-2 border border-border px-2.5 py-2 text-xs font-bold" key={section.id}><input checked={targetSectionIds.includes(section.id)} type="checkbox" onChange={(event) => setTargetSectionIds((current) => event.target.checked ? [...current, section.id] : current.filter((id) => id !== section.id))} /><span className="min-w-0 truncate">{section.title}</span><span className="ml-auto text-[9px] font-normal text-muted-foreground">{section.kind}</span></label>)}</div></fieldset>
              <button className="inline-flex h-10 items-center justify-center gap-2 bg-primary px-3 text-xs font-extrabold text-primary-foreground disabled:opacity-40" disabled={generating || sourceText.trim().length < 20 || targetSectionIds.length === 0} onClick={() => void createFromText()} type="button">{generating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{generating ? "제안 만드는 중…" : "검토할 제안 만들기"}</button>
              <p className="text-[10px] leading-4 text-muted-foreground">AI가 바로 문서를 수정하지 않습니다. 생성된 각 제안을 승인하거나 거부해 주세요.</p>
            </div> : <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center border border-dashed border-primary/50 bg-background p-4 text-center">
              <input
                accept="application/pdf,.pdf"
                className="sr-only"
                disabled={uploading}
                type="file"
                onChange={(event) => {
                  void upload(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <FileUp className="h-6 w-6 text-primary" />
              <span className="mt-2 text-sm font-extrabold">
                {uploading ? "업로드 중…" : "잡코리아 PDF 선택"}
              </span>
              <span className="mt-1 text-[10px] text-muted-foreground">
                텍스트 PDF · 최대 20MB
              </span>
            </label>}
            <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-950">
              <ShieldCheck className="mb-2 h-4 w-4" />
              입력 자료는 AI 제안 생성에 사용됩니다. 민감한 내용은 필요한 부분만 넣고,
              인적사항·병역·보훈 제안은 특히 확인한 뒤 승인해 주세요.
            </div>
            <p className="mt-5 text-xs font-extrabold">가져오기 기록</p>
            <div className="mt-2 grid gap-2">
              {loading && (
                <p className="text-xs text-muted-foreground">불러오는 중…</p>
              )}
              {imports.map((item) => (
                <button
                  className={`border p-3 text-left ${selectedId === item.id ? "border-primary bg-primary/5" : "border-border bg-background"}`}
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="block truncate text-xs font-extrabold">
                    {item.source.mimeType === "text/plain" ? "줄글로 공통 정보 채우기" : item.source.originalName}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {item.source.status === "FAILED"
                      ? "원문 분석 실패"
                      : statusLabel[item.status]}{" "}
                    · 후보 {item.candidateCount}개
                  </span>
                </button>
              ))}
            </div>
          </aside>
          <main className="min-h-0 overflow-y-auto p-5">
            {error && (
              <div className="mb-4 flex items-start gap-2 border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {!selected ? (
              <div className="grid min-h-64 place-items-center border border-dashed border-border text-center">
                <div>
                  <FileSearch className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-extrabold">
                    왼쪽에서 줄글을 입력하거나 PDF를 선택해 시작하세요.
                  </p>
                </div>
              </div>
            ) : failed ? (
              <div className="border border-red-200 bg-red-50 p-5 text-red-800">
                <p className="font-extrabold">자료 분석에 실패했습니다.</p>
                <p className="mt-2 text-xs leading-5">
                  {selected.errorCode ||
                    selected.source.errorCode ||
                    "RESUME_DOCUMENT_IMPORT_FAILED"}
                </p>
                <p className="mt-1 text-xs leading-5">
                  {selected.errorMessage || selected.source.errorMessage}
                </p>
                <button
                  className="mt-4 inline-flex h-10 items-center gap-2 border border-red-300 bg-white px-4 text-xs font-bold"
                  onClick={() => void retry()}
                >
                  <RotateCcw className="h-4 w-4" /> 다시 시도
                </button>
              </div>
            ) : shouldPollImport(selected.status, selected.source.status) ? (
              <div className="grid min-h-64 place-items-center border border-primary/25 bg-primary/5 text-center">
                <div>
                  <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-primary" />
                  <p className="mt-3 font-extrabold">
                    {statusLabel[selected.status]}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    분석이 끝나도 자동으로 문서를 바꾸지 않습니다.
                  </p>
                </div>
              </div>
            ) : (
              <ReviewList
                candidates={candidates}
                sections={sections}
                workItems={workItems}
                onApply={onApply}
                onRefresh={() => void refresh()}
              />
            )}
          </main>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">
            경력·프로젝트는 이 화면에서 문서 섹션에 반영할 수 있고, 장기 경력
            기억 후보는 별도로{" "}
            <Link
              className="font-bold text-primary underline"
              href="/resume/bricks"
            >
              경력 보관함
            </Link>
            에서 승인할 수 있습니다.
          </p>
          <button
            className="h-10 bg-primary px-5 text-sm font-bold text-primary-foreground"
            onClick={onClose}
          >
            닫기
          </button>
        </footer>
      </section>
    </div>
  );
}

type CandidateDraft = {
  payload: ResumeDocumentCandidatePayload;
  targetSectionId: string;
  applyMode: ResumeDocumentApplyMode;
};

const candidateDraft = (candidate: Candidate): CandidateDraft => ({
  payload: candidate.payload,
  targetSectionId: candidate.targetSectionId,
  applyMode: candidate.applyMode,
});

function isUnresolvedCareerDetail(payload: ResumeDocumentCandidatePayload, workItems: readonly ItemContent[] = []) {
  return payload.type === "item"
    && payload.itemKind === "career-detail"
    && Boolean(payload.relatedWorkTitle?.trim())
    && (!payload.relatedWorkItemId || !workItems.some((item) => item.id === payload.relatedWorkItemId));
}

function suggestCareerDetailRelationship(draft: CandidateDraft, workItems: readonly ItemContent[]): CandidateDraft {
  const payload = draft.payload;
  if (payload.type !== "item" || payload.itemKind !== "career-detail" || payload.relatedWorkItemId || !payload.relatedWorkTitle?.trim()) return draft;
  const key = normalizeEmployerTitle(payload.relatedWorkTitle);
  const matches = workItems.filter((item) => normalizeEmployerTitle(item.title) === key);
  return matches.length === 1
    ? { ...draft, payload: { ...payload, relatedWorkItemId: matches[0].id, relatedWorkTitle: matches[0].title } }
    : draft;
}

async function applyAndAcknowledgeCandidate(
  candidate: Candidate,
  command: ResumeDocumentImportCommand,
  onApply: (command: ResumeDocumentImportCommand) => void,
) {
  onApply(command);
  await jsonRequest(`/api/resume/documents/candidates/${candidate.id}/applied`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payloadHash: command.payloadHash, documentVersion: 5 }),
  });
}

async function approveCandidate(
  candidate: Candidate,
  draft: CandidateDraft,
  onApply: (command: ResumeDocumentImportCommand) => void,
) {
  if (candidate.status === "APPROVED" && !candidate.appliedAt) {
    return applyAndAcknowledgeCandidate(candidate, {
      candidateKey: `document:${candidate.id}`,
      payloadHash: candidate.payloadHash,
      targetSectionId: candidate.targetSectionId,
      applyMode: candidate.applyMode,
      payload: candidate.payload,
      appliedAt: candidate.decidedAt ?? new Date().toISOString(),
    }, onApply);
  }
  await jsonRequest(`/api/resume/documents/candidates/${candidate.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...draft,
      expectedUpdatedAt: candidate.updatedAt,
    }),
  });
  const decision = await jsonRequest<{ command: ResumeDocumentImportCommand }>(
    `/api/resume/documents/candidates/${candidate.id}/decision`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "APPROVE" }),
    },
  );
  if (!decision.command) throw new Error("승인 명령을 받지 못했습니다.");
  await applyAndAcknowledgeCandidate(candidate, decision.command, onApply);
}

async function rejectCandidate(candidate: Candidate) {
  await jsonRequest(`/api/resume/documents/candidates/${candidate.id}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      decision: "REJECT",
      rejectionReason: "사용자가 검토 후 제외함",
    }),
  });
}

function ReviewList({
  candidates,
  sections,
  workItems: currentWorkItems,
  onApply,
  onRefresh,
}: {
  candidates: Candidate[];
  sections: ResumeSection[];
  workItems: ItemContent[];
  onApply: (command: ResumeDocumentImportCommand) => void;
  onRefresh: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, CandidateDraft>>({});
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState("");
  const visible = candidates.filter(
    (candidate) =>
      candidate.status === "PENDING" ||
      (candidate.status === "APPROVED" && !candidate.appliedAt),
  );
  const pending = visible.filter((candidate) => candidate.status === "PENDING");
  const existingWorkItems = currentWorkItems.filter((item) => item.itemKind === "work");
  const pendingWorkItems = visible.flatMap((candidate) => {
    const draft = drafts[candidate.id] ?? candidateDraft(candidate);
    const payload = draft.payload;
    if (payload.type !== "item" || payload.itemKind !== "work") return [];
    return [{
      id: importedResumeItemId(`document:${candidate.id}`),
      itemKind: "work" as const,
      meta: "",
      startMonth: payload.startMonth,
      endMonth: payload.endMonth,
      isCurrent: payload.isCurrent,
      title: payload.title,
      subtitle: payload.subtitle,
      body: payload.body,
    } satisfies ItemContent];
  });
  const workItems = [...existingWorkItems, ...pendingWorkItems];
  const reviewItems = visible.map((candidate) => {
    const draft = suggestCareerDetailRelationship(drafts[candidate.id] ?? candidateDraft(candidate), workItems);
    const section = sections.find((item) => item.id === draft.targetSectionId);
    return {
      candidate,
      draft,
      section,
      overlap: section ? inspectResumeImportOverlap(section, draft.payload, sections) : { level: "none" } as ResumeImportOverlap,
      relationshipUnresolved: isUnresolvedCareerDetail(draft.payload, workItems),
    };
  });
  const groups = [...reviewItems.reduce((result, item) => {
    const key = item.draft.targetSectionId;
    const group = result.get(key) ?? [];
    group.push(item);
    result.set(key, group);
    return result;
  }, new Map<string, typeof reviewItems>()).entries()];
  const baseSafeToBulkApprove = reviewItems.filter((item) => item.overlap.level !== "possible" && !item.relationshipUnresolved);
  const existingWorkIds = new Set(existingWorkItems.map((item) => item.id));
  const safeFutureWorkIds = new Set(baseSafeToBulkApprove.flatMap(({ candidate, draft, overlap }) => draft.payload.type === "item" && draft.payload.itemKind === "work" && overlap.level === "none"
    ? [importedResumeItemId(`document:${candidate.id}`)]
    : []));
  const safeToBulkApprove = baseSafeToBulkApprove
    .filter(({ draft }) => draft.payload.type !== "item" || draft.payload.itemKind !== "career-detail" || !draft.payload.relatedWorkItemId || existingWorkIds.has(draft.payload.relatedWorkItemId) || safeFutureWorkIds.has(draft.payload.relatedWorkItemId))
    .sort((left, right) => Number(right.draft.payload.type === "item" && right.draft.payload.itemKind === "work") - Number(left.draft.payload.type === "item" && left.draft.payload.itemKind === "work"));
  const possibleDuplicateCount = reviewItems.length - safeToBulkApprove.length;
  const runReview = async (
    decision: "approve" | "reject",
    targets: typeof reviewItems,
    busyKey: string,
    confirmation: string,
  ) => {
    if (!targets.length || !window.confirm(confirmation)) return;
    setBulkBusy(busyKey);
    setBulkError("");
    let failed = 0;
    for (const { candidate, draft } of targets) {
      try {
        if (decision === "approve") {
          await approveCandidate(candidate, draft, onApply);
        } else {
          await rejectCandidate(candidate);
        }
      } catch {
        failed += 1;
      }
    }
    setBulkBusy(null);
    if (failed > 0) setBulkError(`${failed}개 항목을 처리하지 못했습니다. 남은 항목을 확인한 뒤 다시 시도해 주세요.`);
    onRefresh();
  };
  const bulkReview = async (decision: "approve" | "reject") => {
    const targets = decision === "approve"
      ? safeToBulkApprove
      : reviewItems.filter(({ candidate }) => candidate.status === "PENDING");
    await runReview(
      decision,
      targets,
      `all-${decision}`,
      decision === "approve"
        ? `중복 가능성을 제외한 후보 ${targets.length}개를 모두 승인하고 문서에 반영할까요?`
        : `대기 중인 후보 ${targets.length}개를 모두 제외할까요?`,
    );
  };
  if (!visible.length)
    return (
      <div className="border border-primary/30 bg-primary/5 p-6 text-center">
        <Check className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-3 font-extrabold">검토할 문서 후보가 없습니다.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          모든 후보를 처리했거나 문서에서 근거가 있는 항목을 찾지 못했습니다.
        </p>
      </div>
    );
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h3 className="text-lg font-extrabold">섹션별 검토 · 승인 대기 {visible.length}개</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          추천 섹션과 현재 내용을 비교하고, 필요하면 반영할 섹션을 바꾼 뒤 항목별로 결정하세요.
        </p></div>
        <div className="flex flex-wrap gap-2">
          <button className="h-10 border border-border px-4 text-xs font-bold disabled:opacity-50" disabled={bulkBusy !== null || pending.length === 0} onClick={() => void bulkReview("reject")}>전체 제외{pending.length > 0 ? ` (${pending.length})` : ""}</button>
          <button className="h-10 bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50" disabled={bulkBusy !== null || safeToBulkApprove.length === 0} onClick={() => void bulkReview("approve")}>{bulkBusy === "all-approve" ? "전체 반영 중…" : `전체 승인·반영 (${safeToBulkApprove.length})`}</button>
        </div>
      </div>
      {possibleDuplicateCount > 0 && <p className="mb-4 border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">중복 가능성 후보 {possibleDuplicateCount}개는 전체 승인에서 제외했습니다. 기존 내용과 비교해 개별 확인해 주세요.</p>}
      {bulkError && <p className="mb-4 border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{bulkError}</p>}
      <div className="grid gap-4">
        {groups.map(([sectionId, items]) => {
          const sectionTitle = items[0]?.section?.title ?? "알 수 없는 섹션";
          const safeItems = items.filter((item) => item.overlap.level !== "possible" && !item.relationshipUnresolved && (item.draft.payload.type !== "item" || item.draft.payload.itemKind !== "career-detail" || !item.draft.payload.relatedWorkItemId || existingWorkIds.has(item.draft.payload.relatedWorkItemId)));
          const pendingItems = items.filter(({ candidate }) => candidate.status === "PENDING");
          return <section className="border-2 border-border bg-muted/10 p-3 sm:p-4" key={sectionId}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-[10px] font-extrabold tracking-widest text-primary">한 섹션으로 모은 제안</p><h4 className="mt-1 font-extrabold">{sectionTitle} · {items.length}개</h4></div>
              <div className="flex gap-2">
                <button className="h-9 border border-border px-3 text-[11px] font-bold disabled:opacity-50" disabled={bulkBusy !== null || pendingItems.length === 0} onClick={() => void runReview("reject", pendingItems, `${sectionId}-reject`, `${sectionTitle} 후보 ${pendingItems.length}개를 모두 제외할까요?`)}>섹션 전체 제외</button>
                <button className="h-9 bg-foreground px-3 text-[11px] font-bold text-background disabled:opacity-50" disabled={bulkBusy !== null || safeItems.length === 0} onClick={() => void runReview("approve", safeItems, `${sectionId}-approve`, `${sectionTitle} 후보 ${safeItems.length}개를 승인하고 반영할까요?`)}>{bulkBusy === `${sectionId}-approve` ? "반영 중…" : `섹션 승인 (${safeItems.length})`}</button>
              </div>
            </div>
            <div className="grid gap-3">
              {items.map(({ candidate, draft, overlap }) => <CandidateCard
                candidate={candidate}
                draft={draft}
                key={candidate.id}
                onApply={onApply}
                onDraftChange={(nextDraft) => setDrafts((current) => ({ ...current, [candidate.id]: nextDraft }))}
                onRefresh={onRefresh}
                overlap={overlap}
                sections={sections}
                workItems={workItems}
              />)}
            </div>
          </section>;
        })}
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  draft,
  sections,
  workItems,
  onApply,
  onDraftChange,
  onRefresh,
  overlap,
}: {
  candidate: Candidate;
  draft: CandidateDraft;
  sections: ResumeSection[];
  workItems: ItemContent[];
  onApply: (command: ResumeDocumentImportCommand) => void;
  onDraftChange: (draft: CandidateDraft) => void;
  onRefresh: () => void;
  overlap: ResumeImportOverlap;
}) {
  const { payload, targetSectionId, applyMode } = draft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const compatible = useMemo(
    () =>
      sections.filter(
        (section) => section.kind === candidate.targetSectionKind,
      ),
    [candidate.targetSectionKind, sections],
  );
  const currentSection = sections.find(
    (section) => section.id === targetSectionId,
  );
  const approvedUnapplied =
    candidate.status === "APPROVED" && !candidate.appliedAt;
  const relationshipUnresolved = isUnresolvedCareerDetail(payload, workItems);

  const approve = async () => {
    setBusy(true);
    setError("");
    try {
      await approveCandidate(candidate, draft, onApply);
      onRefresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "승인 결과를 반영하지 못했습니다.",
      );
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    setBusy(true);
    setError("");
    try {
      await rejectCandidate(candidate);
      onRefresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "후보를 제외하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold tracking-widest text-primary">
            {payloadLabel(payload)}
          </p>
          <h4 className="mt-1 font-extrabold">{payloadTitle(payload)}</h4>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {overlap.level !== "none" && <span className={`px-2 py-1 text-[10px] font-extrabold ${overlap.level === "exact" ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-900"}`}>{overlap.level === "exact" ? "이미 있음 · 중복 추가 안 함" : "중복 가능성 · 개별 확인"}</span>}
          <span className={`px-2 py-1 text-[10px] font-extrabold ${candidate.confidence >= 0.8 ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-800"}`}>{candidate.confidence >= 0.8 ? "근거 명확" : "확인 필요"}</span>
        </div>
      </div>
      {overlap.message && <p className={`mt-3 border p-3 text-[11px] font-bold leading-5 ${overlap.level === "possible" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>{overlap.message}</p>}
      {relationshipUnresolved && <p className="mt-3 border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold text-amber-900">연결 확인 필요 · 연결 경력을 선택하거나 독립 프로젝트로 변경해 주세요.</p>}
      {candidate.warnings.length > 0 && (
        <ul className="mt-3 border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">
          {candidate.warnings.map((warning) => (
            <li key={warning}>• {warning}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
          반영할 섹션
          <select
            className="h-10 border border-border bg-background px-3 text-sm font-normal text-foreground"
            disabled={approvedUnapplied}
            value={targetSectionId}
            onChange={(event) => onDraftChange({ ...draft, targetSectionId: event.target.value })}
          >
            {compatible.map((section) => (
              <option key={section.id} value={section.id}>
                {section.title}
              </option>
            ))}
          </select>
          <span className="font-normal leading-5 text-muted-foreground">
            추천일 뿐이며 승인 전에 바꿀 수 있습니다. 같은 형식의 섹션만 표시됩니다.
          </span>
        </label>
        <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
          반영 방식
          <select
            className="h-10 border border-border bg-background px-3 text-sm font-normal text-foreground"
            disabled={approvedUnapplied}
            value={applyMode}
            onChange={(event) =>
              onDraftChange({ ...draft, applyMode: event.target.value as ResumeDocumentApplyMode })
            }
          >
            {applyModeOptions(payload).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {currentSection && (
        <div className="mt-3 border border-border bg-muted/20 p-3">
          <p className="text-[10px] font-extrabold text-muted-foreground">
            선택한 섹션의 현재 내용
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-foreground">
            {sectionPreview(currentSection)}
          </p>
        </div>
      )}
      <div className="mt-4">
        <PayloadEditor
          disabled={approvedUnapplied}
          payload={payload}
          workItems={workItems}
          onChange={(payload) => onDraftChange({ ...draft, payload })}
        />
      </div>
      <details className="mt-4 border border-border bg-muted/20 p-3">
        <summary className="cursor-pointer text-xs font-extrabold">
          입력 원문 근거 {candidate.evidence.length}개
        </summary>
        <div className="mt-3 grid gap-2">
          {candidate.evidence.map((evidence) => (
            <blockquote
              className="border-l-2 border-primary pl-3 text-[11px] leading-5 text-muted-foreground"
              key={evidence.id}
            >
              <span className="mb-1 block font-bold text-foreground">
                {evidence.pageStart
                  ? `${evidence.pageStart}페이지`
                  : "페이지 정보 없음"}
              </span>
              {evidence.excerpt}
            </blockquote>
          ))}
        </div>
      </details>
      {error && <p className="mt-3 text-xs font-bold text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        {!approvedUnapplied && (
          <button
            className="h-10 border border-border px-4 text-xs font-bold"
            disabled={busy}
            onClick={() => void reject()}
          >
            제외
          </button>
        )}
        <button
          className="h-10 bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50"
          disabled={busy || relationshipUnresolved}
          onClick={() => void approve()}
        >
          {busy
            ? "처리 중…"
            : approvedUnapplied
              ? "문서 반영 다시 시도"
              : "확인하고 반영"}
        </button>
      </div>
    </article>
  );
}

function sectionPreview(section: ResumeSection) {
  if (section.kind === "identity") {
    const content = section.content as {
      name: string;
      email: string;
      phone?: string;
      location?: string;
    };
    return (
      [content.name, content.email, content.phone, content.location]
        .filter(Boolean)
        .join(" · ") || "비어 있음"
    );
  }
  if (section.kind === "eligibility")
    return (
      Object.values(section.content).filter(Boolean).join(" · ") || "비어 있음"
    );
  if (section.kind === "narrative")
    return (section.content as { body: string }).body || "비어 있음";
  if (section.kind === "tags")
    return (
      (section.content as { items: string[] }).items.join(" · ") || "비어 있음"
    );
  return (
    (
      section.content as { items: Array<{ title: string; subtitle: string }> }
    ).items
      .map((item) => [item.title, item.subtitle].filter(Boolean).join(" · "))
      .join("\n") || "비어 있음"
  );
}

function payloadLabel(payload: ResumeDocumentCandidatePayload) {
  if (payload.type === "identity-field" || payload.type === "identity") return "인적사항";
  if (payload.type === "eligibility-field") return "민감 정보 · 개별 승인";
  if (payload.type === "narrative") return "소개";
  if (payload.type === "tags") return "핵심 역량";
  const labels = {
    work: "경력",
    "career-detail": "경력 상세",
    project: "프로젝트",
    "career-description": "경력기술서",
    education: "학력",
    credential: "자격",
    award: "수상",
    activity: "대외활동 · 인턴",
    language: "어학",
    training: "교육",
  } as const;
  return labels[payload.itemKind];
}

function payloadTitle(payload: ResumeDocumentCandidatePayload) {
  if (payload.type === "identity") return Object.values(payload.fields).filter(Boolean).slice(0, 3).join(" · ");
  if (payload.type === "identity-field" || payload.type === "eligibility-field")
    return payload.value;
  if (payload.type === "narrative") return payload.body.slice(0, 80);
  if (payload.type === "tags") return payload.values.join(" · ");
  return payload.title;
}

function applyModeOptions(
  payload: ResumeDocumentCandidatePayload,
): Array<{ value: ResumeDocumentApplyMode; label: string }> {
  if (payload.type === "item")
    return [{ value: "APPEND", label: "새 항목으로 추가" }];
  if (payload.type === "tags")
    return [
      { value: "MERGE", label: "기존 태그와 병합" },
      { value: "REPLACE", label: "기존 태그 교체" },
    ];
  if (payload.type === "narrative")
    return [
      { value: "FILL_EMPTY", label: "비어 있을 때만 채우기" },
      { value: "MERGE", label: "기존 글 뒤에 추가" },
      { value: "REPLACE", label: "기존 글 교체" },
    ];
  return [
    { value: "FILL_EMPTY", label: "비어 있을 때만 채우기" },
    { value: "REPLACE", label: "기존 값 교체" },
  ];
}

function PayloadEditor({
  payload,
  disabled,
  workItems,
  onChange,
}: {
  payload: ResumeDocumentCandidatePayload;
  disabled: boolean;
  workItems: ItemContent[];
  onChange: (payload: ResumeDocumentCandidatePayload) => void;
}) {
  const inputClass =
    "h-10 w-full border border-border bg-background px-3 text-sm font-normal text-foreground disabled:bg-muted";
  if (payload.type === "identity") {
    const labels = {
      name: "이름",
      email: "이메일",
      phone: "전화번호",
      location: "주소·지역",
      birthDate: "생년월일",
      gender: "성별",
      link: "링크",
    } as const;
    const entries = Object.entries(payload.fields) as Array<[keyof typeof labels, string]>;
    return <div className="grid gap-3 sm:grid-cols-2">
      {entries.map(([field, value]) => field === "birthDate"
        ? <DateInput
            disabled={disabled}
            key={field}
            label={labels[field]}
            value={value}
            min="1900-01-01"
            max={new Date().toISOString().slice(0, 10)}
            reverseYears
            quickActions={[]}
            onChange={(nextValue) => onChange({ ...payload, fields: { ...payload.fields, [field]: nextValue } })}
          />
        : <label className="grid gap-1.5 text-xs font-bold text-muted-foreground" key={field}>
            {labels[field]}
            <input className={inputClass} disabled={disabled} value={value} onChange={(event) => onChange({ ...payload, fields: { ...payload.fields, [field]: event.target.value } })} />
          </label>)}
    </div>;
  }
  if (payload.type === "identity-field") {
    if (payload.field === "birthDate")
      return (
        <DateInput
          disabled={disabled}
          label="제안 값"
          value={payload.value}
          min="1900-01-01"
          max={new Date().toISOString().slice(0, 10)}
          reverseYears
          quickActions={[]}
          onChange={(value) => onChange({ ...payload, value })}
        />
      );
    return (
      <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
        제안 값
        <input
          className={inputClass}
          disabled={disabled}
          value={payload.value}
          onChange={(event) =>
            onChange({ ...payload, value: event.target.value })
          }
        />
      </label>
    );
  }
  if (payload.type === "eligibility-field")
    return (
      <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
        제안 값
        <input
          className={inputClass}
          disabled={disabled}
          value={payload.value}
          onChange={(event) =>
            onChange({ ...payload, value: event.target.value })
          }
        />
      </label>
    );
  if (payload.type === "narrative")
    return (
      <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
        제안 내용
        <textarea
          className="min-h-32 border border-border bg-background p-3 text-sm leading-6 disabled:bg-muted"
          disabled={disabled}
          value={payload.body}
          onChange={(event) =>
            onChange({ ...payload, body: event.target.value })
          }
        />
      </label>
    );
  if (payload.type === "tags")
    return (
      <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
        태그 · 쉼표로 구분
        <input
          className={inputClass}
          disabled={disabled}
          value={payload.values.join(", ")}
          onChange={(event) =>
            onChange({
              ...payload,
              values: event.target.value
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
    );
  const updateDates = (patch: Partial<ResumeItemDatePatch>) => {
    const { endMonthEnabled, ...candidatePatch } = patch;
    onChange({
      ...payload,
      ...candidatePatch,
      ...(endMonthEnabled === false ? { endMonth: "" } : {}),
      ...(patch.isCurrent ? { endMonth: "" } : {}),
    });
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
        항목 유형
        <select
          className={inputClass}
          disabled={disabled}
          value={payload.itemKind}
          onChange={(event) => {
            const itemKind = event.target.value as typeof payload.itemKind;
            const normalized = normalizeResumeItemDateValues({ ...payload, itemKind, ...(itemKind === "career-detail" ? { detailType: payload.detailType ?? "project" } : { detailType: undefined, relatedWorkItemId: undefined, relatedWorkTitle: undefined }) });
            const nextPayload = { ...normalized };
            delete nextPayload.endMonthEnabled;
            onChange(nextPayload);
          }}
        >
          <option value="work">직장 경력</option>
          <option value="career-detail">경력 상세</option>
          <option value="education">학력</option>
          <option value="credential">자격</option>
          <option value="award">수상</option>
          <option value="language">어학</option>
          <option value="training">교육</option>
        </select>
      </label>
      <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
        {payload.itemKind === "work" ? "회사명" : payload.itemKind === "career-detail" ? "상세 제목" : "제목"}
        <input
          className={inputClass}
          disabled={disabled}
          value={payload.title}
          onChange={(event) =>
            onChange({ ...payload, title: event.target.value })
          }
        />
      </label>
      <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
        {payload.itemKind === "work" ? "부서·직책" : payload.itemKind === "career-detail" ? "역할·기술" : "기관·전공"}
        <input
          className={inputClass}
          disabled={disabled}
          value={payload.subtitle}
          onChange={(event) =>
            onChange({ ...payload, subtitle: event.target.value })
          }
        />
      </label>
      <ResumeItemDateFields disabled={disabled} value={{ ...payload, endMonthEnabled: Boolean(payload.endMonth) }} onChange={updateDates} />
      {payload.itemKind === "career-detail" && <>
        <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">상세 유형<select className={inputClass} disabled={disabled} value={payload.detailType} onChange={(event) => onChange({ ...payload, detailType: event.target.value as typeof payload.detailType })}><option value="project">프로젝트</option><option value="responsibility">상시 책임</option><option value="improvement">개선</option><option value="troubleshooting">문제 해결</option></select></label>
        <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">연결 경력<select className={inputClass} disabled={disabled} value={payload.relatedWorkItemId && workItems.some((item) => item.id === payload.relatedWorkItemId) ? payload.relatedWorkItemId : payload.relatedWorkTitle ? "__unresolved" : ""} onChange={(event) => {
          const work = workItems.find((item) => item.id === event.target.value);
          onChange(work ? { ...payload, relatedWorkItemId: work.id, relatedWorkTitle: work.title } : { ...payload, relatedWorkItemId: undefined, relatedWorkTitle: undefined });
        }}><option value="">독립 프로젝트</option>{payload.relatedWorkTitle && !workItems.some((item) => item.id === payload.relatedWorkItemId) && <option disabled value="__unresolved">연결 확인 필요 · {payload.relatedWorkTitle}</option>}{workItems.map((work) => <option key={work.id} value={work.id}>{work.title} · {work.subtitle} · {formatItemPeriod(work)}</option>)}</select></label>
      </>}
      <label className="grid gap-1.5 text-xs font-bold text-muted-foreground sm:col-span-2">
        설명
        <textarea
          className="min-h-24 border border-border bg-background p-3 text-sm disabled:bg-muted"
          disabled={disabled}
          value={payload.body}
          onChange={(event) =>
            onChange({ ...payload, body: event.target.value })
          }
        />
      </label>
    </div>
  );
}
