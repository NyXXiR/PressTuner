"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Replace,
  Trash2,
  Upload,
} from "lucide-react";
import { knowledgeDocumentPresentation } from "@/domain/knowledge/documentPresentation";

type KnowledgeDocument = {
  id: string;
  originalName: string;
  byteSize: number;
  status: "UPLOADED" | "QUEUED" | "PARSING" | "INDEXING" | "READY" | "FAILED";
  pageCount: number | null;
  chunkCount: number;
  errorMessage: string | null;
  citationCount: number;
  replacesDocumentId: string | null;
  hasPendingReplacement: boolean;
  activeGenerationId: string | null;
  classificationOverride: KnowledgeRole | null;
  classificationStatus: "PENDING" | "CLASSIFYING" | "READY" | "FAILED" | null;
  classificationError: string | null;
  classificationCounts: Record<KnowledgeRole | "UNCLASSIFIED", number>;
};

type KnowledgeRole = "FACT" | "STYLE_POLICY" | "STYLE_EXAMPLE" | "IGNORE";

const ROLE_LABEL: Record<KnowledgeRole, string> = {
  FACT: "사실",
  STYLE_POLICY: "스타일 규칙",
  STYLE_EXAMPLE: "스타일 예시",
  IGNORE: "검색 제외",
};

type KnowledgeQuota = {
  activeDocumentCount: number;
  storedBytes: number;
  uploadsInWindow: number;
  limits: {
    documents: number;
    storedBytes: number;
    uploads: number;
    windowSeconds: number;
  };
};

const STATUS_LABEL: Record<KnowledgeDocument["status"], string> = {
  UPLOADED: "업로드됨",
  QUEUED: "대기 중",
  PARSING: "문서 분석 중",
  INDEXING: "검색 색인 중",
  READY: "검색 가능",
  FAILED: "처리 실패",
};

function knowledgeApiError(body: any, fallback: string) {
  const messageByCode: Record<string, string> = {
    KNOWLEDGE_UPLOAD_UNSUPPORTED_TYPE: "PDF 파일만 업로드할 수 있습니다.",
    KNOWLEDGE_UPLOAD_INVALID_PDF: "PDF 확장자와 실제 파일 내용이 일치하지 않습니다.",
    KNOWLEDGE_UPLOAD_TOO_LARGE: "파일이 허용된 최대 용량을 초과했습니다.",
    KNOWLEDGE_DOCUMENT_LIMIT_EXCEEDED: "팀의 최대 문서 수에 도달했습니다.",
    KNOWLEDGE_STORAGE_LIMIT_EXCEEDED: "팀의 지식 문서 저장 용량을 초과했습니다.",
    KNOWLEDGE_UPLOAD_RATE_LIMITED: "짧은 시간에 업로드가 너무 많았습니다.",
    KNOWLEDGE_REPLACEMENT_IDENTICAL: "현재 문서와 내용이 같은 PDF입니다.",
    KNOWLEDGE_REPLACEMENT_IN_PROGRESS: "이 문서는 이미 교체 처리 중입니다.",
    KNOWLEDGE_DOCUMENT_NOT_REPLACEABLE:
      "처리가 완료된 문서만 교체할 수 있습니다.",
    KNOWLEDGE_DOCUMENT_BUSY: "문서 처리 중에는 삭제할 수 없습니다.",
    KNOWLEDGE_INDEX_QUEUE_FAILED:
      "문서는 저장됐지만 처리를 시작하지 못했습니다. 재시도해 주세요.",
  };
  const retry = body?.details?.retryAfterSeconds
    ? ` ${body.details.retryAfterSeconds}초 후 다시 시도하세요.`
    : "";
  const preserved = body?.details?.oldDocumentPreserved
    ? " 기존 검색 가능 문서는 유지되었습니다."
    : "";
  return `${messageByCode[body?.code] ?? body?.message ?? fallback}${preserved}${retry}`;
}

export default function TeamKnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<KnowledgeQuota | null>(null);
  const [rowAction, setRowAction] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const response = await fetch("/api/knowledge/documents", {
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.message ?? "문서를 불러오지 못했습니다.");
    setDocuments(body.documents);
    setQuota(body.quota);
  }, []);

  useEffect(() => {
    load()
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (
      !documents.some((document) =>
        knowledgeDocumentPresentation(document).shouldPoll ||
        ["PENDING", "CLASSIFYING"].includes(
          document.classificationStatus ?? "",
        ),
      )
    ) return;
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, [documents, load]);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/knowledge/documents", {
        method: "POST",
        body: formData,
      });
      const body = await response.json();
      if (!response.ok) {
        if (body?.code === "KNOWLEDGE_INDEX_QUEUE_FAILED") await load();
        throw new Error(knowledgeApiError(body, "업로드에 실패했습니다."));
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUploading(false);
    }
  }

  async function retry(documentId: string) {
    setError(null);
    setRowAction((current) => ({ ...current, [documentId]: "retry" }));
    try {
      const response = await fetch(
        `/api/knowledge/documents/${documentId}/retry`,
        { method: "POST" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(knowledgeApiError(body, "재시도에 실패했습니다."));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRowAction((current) => ({ ...current, [documentId]: "" }));
    }
  }

  async function remove(document: KnowledgeDocument) {
    const message = document.citationCount
      ? "인용 기록이 있어 목록과 검색에서만 보관 처리됩니다. PDF와 저장 용량은 유지됩니다."
      : "이 문서와 PDF를 영구 삭제하고 저장 용량을 회수합니다.";
    if (!window.confirm(message)) return;
    setError(null);
    setRowAction((current) => ({ ...current, [document.id]: "delete" }));
    try {
      const response = await fetch(`/api/knowledge/documents/${document.id}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(knowledgeApiError(body, "삭제에 실패했습니다."));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRowAction((current) => ({ ...current, [document.id]: "" }));
    }
  }

  async function replace(documentId: string, file: File) {
    setError(null);
    setRowAction((current) => ({ ...current, [documentId]: "replace" }));
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch(
        `/api/knowledge/documents/${documentId}/replacement`,
        { method: "POST", body: formData },
      );
      const body = await response.json();
      if (!response.ok) {
        if (body?.code === "KNOWLEDGE_INDEX_QUEUE_FAILED") await load();
        throw new Error(knowledgeApiError(body, "교체에 실패했습니다."));
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRowAction((current) => ({ ...current, [documentId]: "" }));
    }
  }

  async function setClassification(
    documentId: string,
    override: KnowledgeRole | null,
  ) {
    setError(null);
    setRowAction((current) => ({
      ...current,
      [documentId]: "classification",
    }));
    try {
      const response = await fetch(
        `/api/knowledge/documents/${documentId}/classification`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ override }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.message ?? "분류 설정을 변경하지 못했습니다.");
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRowAction((current) => ({ ...current, [documentId]: "" }));
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">근거 문서</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            사내 PDF를 업로드하면 Press Agent가 검색하고 페이지 단위로 인용합니다.
          </p>
        </div>
        <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          PDF 업로드
          <input
            className="sr-only"
            type="file"
            accept="application/pdf,.pdf"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </header>

      <section className="border border-primary/25 bg-primary/5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold">RAG 피드백 테스트</h2>
            <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>1. PDF를 올리고 상태가 ‘검색 가능’이 될 때까지 기다립니다.</li>
              <li>2. 새 보도자료를 만든 뒤 첨삭 화면의 AI 패널을 엽니다.</li>
              <li>3. 문서 근거를 요구하고, 인용과 수정안을 확인한 후 반영을 승인합니다.</li>
            </ol>
          </div>
          <Link
            href="/press/new"
            className="inline-flex h-10 shrink-0 items-center justify-center bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            새 보도자료에서 테스트
          </Link>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {quota && (
        <section className="grid gap-3 border border-border bg-card p-4 text-sm sm:grid-cols-3">
          <div>문서 <strong>{quota.activeDocumentCount}/{quota.limits.documents}</strong></div>
          <div>저장 용량 <strong>{(quota.storedBytes / 1024 / 1024).toFixed(1)}MB/{(quota.limits.storedBytes / 1024 / 1024).toFixed(0)}MB</strong></div>
          <div>최근 {Math.round(quota.limits.windowSeconds / 3600)}시간 업로드 <strong>{quota.uploadsInWindow}/{quota.limits.uploads}</strong></div>
        </section>
      )}

      <div className="border border-border bg-card">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : documents.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 text-center">
            <FileText className="text-muted-foreground" />
            <p className="text-sm font-medium">아직 등록된 근거 문서가 없습니다.</p>
            <p className="text-xs text-muted-foreground">최대 20MB PDF부터 시작할 수 있습니다.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {documents.map((document) => {
              const presentation = knowledgeDocumentPresentation(document);
              const acting = Boolean(rowAction[document.id]);
              return (
                <li key={document.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="shrink-0 text-primary" />
                      <span className="truncate text-sm font-semibold">{document.originalName}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {(document.byteSize / 1024 / 1024).toFixed(2)}MB
                      {document.pageCount ? ` · ${document.pageCount}페이지` : ""}
                      {document.chunkCount ? ` · ${document.chunkCount}개 검색 조각` : ""}
                    </p>
                    {document.errorMessage && <p className="mt-2 text-xs text-red-600">{document.errorMessage}</p>}
                    {document.classificationError && (
                      <p className="mt-2 text-xs text-red-600">
                        자동 분류 실패: {document.classificationError}
                      </p>
                    )}
                    {document.activeGenerationId !== null && (
                      <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                        <p>
                          자동 분류 · 사실 {document.classificationCounts.FACT}
                          {" · "}규칙 {document.classificationCounts.STYLE_POLICY}
                          {" · "}예시 {document.classificationCounts.STYLE_EXAMPLE}
                          {" · "}제외 {document.classificationCounts.IGNORE}
                          {document.classificationCounts.UNCLASSIFIED > 0
                            ? ` · 대기 ${document.classificationCounts.UNCLASSIFIED}`
                            : ""}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            disabled={acting}
                            onClick={() => void setClassification(document.id, null)}
                            className={`border px-2 py-1 ${document.classificationOverride === null ? "border-primary text-primary" : "border-border"}`}
                          >
                            자동
                          </button>
                          {(Object.keys(ROLE_LABEL) as KnowledgeRole[]).map((role) => (
                            <button
                              key={role}
                              type="button"
                              disabled={acting}
                              onClick={() => void setClassification(document.id, role)}
                              className={`border px-2 py-1 ${document.classificationOverride === role ? "border-primary text-primary" : "border-border"}`}
                            >
                              {ROLE_LABEL[role]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {presentation.showPendingReplacementCopy && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        교체 문서 · 준비가 끝날 때까지 기존 문서가 검색됩니다.
                      </p>
                    )}
                  </div>
                  <div className="flex min-h-11 flex-wrap items-center gap-2 sm:justify-end">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                      {presentation.showSpinner && <Loader2 size={14} className="animate-spin" />}
                      {document.status === "READY" && <CheckCircle2 size={14} className="text-emerald-600" />}
                      {document.status === "FAILED" && <AlertCircle size={14} className="text-red-600" />}
                      {STATUS_LABEL[document.status]}
                    </span>
                    {presentation.canRetry && (
                      <button disabled={acting} type="button" onClick={() => void retry(document.id)} className="inline-flex min-h-11 items-center gap-1 border border-border px-3 text-xs hover:bg-muted disabled:opacity-50">
                        <RefreshCw size={12} />
                        {presentation.retryLabel}
                      </button>
                    )}
                    {presentation.canReplace && (
                      <label className="inline-flex min-h-11 cursor-pointer items-center gap-1 border border-border px-3 text-xs hover:bg-muted">
                        {rowAction[document.id] === "replace" ? <Loader2 size={12} className="animate-spin" /> : <Replace size={12} />}
                        교체
                        <input
                          className="sr-only"
                          type="file"
                          accept="application/pdf,.pdf"
                          disabled={acting}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void replace(document.id, file);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    )}
                    {presentation.canDelete && (
                      <button
                        disabled={acting}
                        type="button"
                        onClick={() => void remove(document)}
                        className="inline-flex min-h-11 items-center gap-1 border border-red-200 px-3 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        {rowAction[document.id] === "delete" ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        삭제
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
