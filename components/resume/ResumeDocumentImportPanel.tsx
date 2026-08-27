"use client";

import {
  AlertTriangle,
  Check,
  FileSearch,
  FileUp,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DateInput } from "@/components/ui/DateInput";
import {
  ResumeDocumentCandidatePayloadSchema,
  type ResumeDocumentApplyMode,
  type ResumeDocumentCandidatePayload,
  type ResumeDocumentImportCommand,
} from "@/domain/resume-documents/importCandidate";
import type {
  ResumeSection,
  SectionKind,
} from "@/domain/resume-documents/model";
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

function currentLocalMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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
  onApply,
  onClose,
}: {
  sections: ResumeSection[];
  onApply: (command: ResumeDocumentImportCommand) => void;
  onClose: () => void;
}) {
  const [imports, setImports] = useState<ResumeImport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
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
              AI PDF IMPORT
            </p>
            <h2
              className="mt-1 text-xl font-extrabold"
              id="resume-import-title"
            >
              PDF 내용 검토 후 채우기
            </h2>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
              AI는 섹션별 후보만 만듭니다. 내용을 확인하고 승인한 항목만 선택한
              섹션에 반영됩니다. 추천 섹션은 추천일 뿐이며 승인 전에 바꿀 수 있습니다.
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
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center border border-dashed border-primary/50 bg-background p-4 text-center">
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
            </label>
            <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-950">
              <ShieldCheck className="mb-2 h-4 w-4" />
              문서 섹션 배분 단계에서는 이메일·전화·생년월일을 토큰화합니다.
              병역·보훈 등 민감 정보는 각각 별도 승인이 필요합니다.
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
                    {item.source.originalName}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {item.source.status === "FAILED"
                      ? "PDF 원문 분석 실패"
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
                    PDF를 선택해 시작하세요.
                  </p>
                </div>
              </div>
            ) : failed ? (
              <div className="border border-red-200 bg-red-50 p-5 text-red-800">
                <p className="font-extrabold">PDF 분석에 실패했습니다.</p>
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

function ReviewList({
  candidates,
  sections,
  onApply,
  onRefresh,
}: {
  candidates: Candidate[];
  sections: ResumeSection[];
  onApply: (command: ResumeDocumentImportCommand) => void;
  onRefresh: () => void;
}) {
  const visible = candidates.filter(
    (candidate) =>
      candidate.status === "PENDING" ||
      (candidate.status === "APPROVED" && !candidate.appliedAt),
  );
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
      <div className="mb-4">
        <h3 className="text-lg font-extrabold">승인 대기 {visible.length}개</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          추천 섹션과 현재 내용을 비교하고, 필요하면 반영할 섹션을 바꾼 뒤 항목별로 결정하세요.
        </p>
      </div>
      <div className="grid gap-4">
        {visible.map((candidate) => (
          <CandidateCard
            candidate={candidate}
            key={candidate.id}
            onApply={onApply}
            onRefresh={onRefresh}
            sections={sections}
          />
        ))}
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  sections,
  onApply,
  onRefresh,
}: {
  candidate: Candidate;
  sections: ResumeSection[];
  onApply: (command: ResumeDocumentImportCommand) => void;
  onRefresh: () => void;
}) {
  const [payload, setPayload] = useState(candidate.payload);
  const [targetSectionId, setTargetSectionId] = useState(
    candidate.targetSectionId,
  );
  const [applyMode, setApplyMode] = useState(candidate.applyMode);
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

  const applyAndAcknowledge = async (command: ResumeDocumentImportCommand) => {
    onApply(command);
    await jsonRequest(
      `/api/resume/documents/candidates/${candidate.id}/applied`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          payloadHash: command.payloadHash,
          documentVersion: 5,
        }),
      },
    );
  };

  const approve = async () => {
    setBusy(true);
    setError("");
    try {
      if (approvedUnapplied) {
        await applyAndAcknowledge({
          candidateKey: `document:${candidate.id}`,
          payloadHash: candidate.payloadHash,
          targetSectionId: candidate.targetSectionId,
          applyMode: candidate.applyMode,
          payload: candidate.payload,
          appliedAt: candidate.decidedAt ?? new Date().toISOString(),
        });
      } else {
        const patch = await jsonRequest<{ candidate: Candidate }>(
          `/api/resume/documents/candidates/${candidate.id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              payload,
              targetSectionId,
              applyMode,
              expectedUpdatedAt: candidate.updatedAt,
            }),
          },
        );
        const decision = await jsonRequest<{
          command: ResumeDocumentImportCommand;
        }>(`/api/resume/documents/candidates/${candidate.id}/decision`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision: "APPROVE" }),
        });
        if (!decision.command) throw new Error("승인 명령을 받지 못했습니다.");
        await applyAndAcknowledge(decision.command);
        void patch;
      }
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
      await jsonRequest(
        `/api/resume/documents/candidates/${candidate.id}/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision: "REJECT",
            rejectionReason: "사용자가 검토 후 제외함",
          }),
        },
      );
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
        <span
          className={`px-2 py-1 text-[10px] font-extrabold ${candidate.confidence >= 0.8 ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-800"}`}
        >
          {candidate.confidence >= 0.8 ? "근거 명확" : "확인 필요"}
        </span>
      </div>
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
            onChange={(event) => setTargetSectionId(event.target.value)}
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
              setApplyMode(event.target.value as ResumeDocumentApplyMode)
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
          onChange={setPayload}
        />
      </div>
      <details className="mt-4 border border-border bg-muted/20 p-3">
        <summary className="cursor-pointer text-xs font-extrabold">
          PDF 원문 근거 {candidate.evidence.length}개
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
          disabled={busy}
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
  if (payload.type === "identity-field") return "인적사항";
  if (payload.type === "eligibility-field") return "민감 정보 · 개별 승인";
  if (payload.type === "narrative") return "소개";
  if (payload.type === "tags") return "핵심 역량";
  const labels = {
    work: "경력",
    project: "프로젝트",
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
  onChange,
}: {
  payload: ResumeDocumentCandidatePayload;
  disabled: boolean;
  onChange: (payload: ResumeDocumentCandidatePayload) => void;
}) {
  const inputClass =
    "h-10 w-full border border-border bg-background px-3 text-sm font-normal text-foreground disabled:bg-muted";
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
  const endMonthEnabled = Boolean(payload.endMonth);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
        제목
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
        기관·전공
        <input
          className={inputClass}
          disabled={disabled}
          value={payload.subtitle}
          onChange={(event) =>
            onChange({ ...payload, subtitle: event.target.value })
          }
        />
      </label>
      <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
        시작 연월
        <input
          className={inputClass}
          disabled={disabled}
          type="month"
          value={payload.startMonth ?? ""}
          onChange={(event) =>
            onChange({ ...payload, startMonth: event.target.value })
          }
        />
      </label>
      <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
        종료 연월
        <input
          className={inputClass}
          disabled={disabled || !endMonthEnabled}
          type="month"
          value={payload.endMonth ?? ""}
          onChange={(event) =>
            onChange({ ...payload, endMonth: event.target.value })
          }
        />
        <span className="inline-flex items-center gap-2 text-xs font-bold text-foreground"><input checked={endMonthEnabled} disabled={disabled} type="checkbox" onChange={(event) => onChange({ ...payload, endMonth: event.target.checked ? payload.endMonth || payload.startMonth || currentLocalMonth() : "", isCurrent: event.target.checked ? false : payload.isCurrent })} /> 종료연월 있음</span>
      </label>
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
