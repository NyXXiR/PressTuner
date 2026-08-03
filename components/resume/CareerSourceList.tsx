"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCcw, Trash2 } from "lucide-react";

type Source = {
  id: string;
  originalName: string;
  status: "UPLOADED" | "QUEUED" | "PARSING" | "INDEXING" | "EXTRACTING" | "READY" | "FAILED";
  pageCount: number | null;
  candidateCount: number;
  errorMessage: string | null;
};

type SourceOperation = "retrying" | "deleting";

const busy = new Set<Source["status"]>([
  "UPLOADED",
  "QUEUED",
  "PARSING",
  "INDEXING",
  "EXTRACTING",
]);
const labels: Record<Source["status"], string> = {
  UPLOADED: "접수됨",
  QUEUED: "처리 대기",
  PARSING: "페이지 읽는 중",
  INDEXING: "검색 준비 중",
  EXTRACTING: "경험 찾는 중",
  READY: "검토 준비됨",
  FAILED: "처리 실패",
};

function responseMessage(json: unknown, fallback: string) {
  if (!json || typeof json !== "object") return fallback;
  const value = json as { message?: unknown; error?: unknown };
  return typeof value.message === "string"
    ? value.message
    : typeof value.error === "string"
      ? value.error
      : fallback;
}

export function CareerSourceList({
  refreshToken,
  onChanged,
}: {
  refreshToken: number;
  onChanged?: () => void;
}) {
  const [sources, setSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operations, setOperations] = useState<Record<string, SourceOperation>>({});
  const [operationErrors, setOperationErrors] = useState<Record<string, string>>({});
  const operationLocks = useRef(new Set<string>());
  const previousStatuses = useRef(new Map<string, Source["status"]>());
  const notifiedReadySourceIds = useRef(new Set<string>());
  const onChangedRef = useRef(onChanged);

  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/resume/career/sources");
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(responseMessage(json, "PDF 처리 현황을 불러오지 못했습니다."));
      }
      const nextSources = (json.sources ?? []) as Source[];
      let becameReady = false;
      for (const source of nextSources) {
        const previousStatus = previousStatuses.current.get(source.id);
        if (busy.has(source.status)) {
          notifiedReadySourceIds.current.delete(source.id);
        }
        if (
          source.status === "READY" &&
          previousStatus &&
          busy.has(previousStatus) &&
          !notifiedReadySourceIds.current.has(source.id)
        ) {
          notifiedReadySourceIds.current.add(source.id);
          becameReady = true;
        }
      }
      previousStatuses.current = new Map(
        nextSources.map((source) => [source.id, source.status]),
      );
      setSources(nextSources);
      setLoadError(null);
      if (becameReady) onChangedRef.current?.();
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "PDF 처리 현황을 불러오지 못했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load, refreshToken]);

  useEffect(() => {
    if (!sources.some((source) => busy.has(source.status))) return;
    const timer = window.setTimeout(() => void load(), 2_000);
    return () => window.clearTimeout(timer);
  }, [load, sources]);

  const runOperation = async (
    source: Source,
    operation: SourceOperation,
    request: () => Promise<Response>,
  ) => {
    if (operationLocks.current.has(source.id)) return;
    operationLocks.current.add(source.id);
    setOperations((current) => ({ ...current, [source.id]: operation }));
    setOperationErrors((current) => {
      const next = { ...current };
      delete next[source.id];
      return next;
    });
    try {
      const response = await request();
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          responseMessage(
            json,
            operation === "retrying"
              ? "다시 시도하지 못했습니다."
              : "원본을 삭제하지 못했습니다.",
          ),
        );
      }
      await load();
      if (operation === "deleting") onChangedRef.current?.();
    } catch (error) {
      setOperationErrors((current) => ({
        ...current,
        [source.id]:
          error instanceof Error ? error.message : "요청을 완료하지 못했습니다.",
      }));
    } finally {
      operationLocks.current.delete(source.id);
      setOperations((current) => {
        const next = { ...current };
        delete next[source.id];
        return next;
      });
    }
  };

  if (!isLoading && !loadError && sources.length === 0) return null;
  return (
    <section className="mt-6 border border-border bg-card p-4" aria-labelledby="career-source-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="career-source-title" className="text-sm font-extrabold">
          이력서 원본 처리 현황
        </h2>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="불러오는 중" />}
      </div>
      {loadError && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-destructive" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => void load()} className="border border-current px-2 py-1 font-bold">
            다시 불러오기
          </button>
        </div>
      )}
      <ul className="mt-3 divide-y divide-border">
        {sources.map((source) => (
          <li key={source.id} className="flex flex-wrap items-center gap-3 py-3 text-xs">
            <span className="min-w-0 flex-1 truncate font-bold">{source.originalName}</span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              {busy.has(source.status) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {labels[source.status]}
            </span>
            {source.status === "READY" && (
              <span className="text-primary">
                {source.pageCount ?? 0}쪽 · 후보 {source.candidateCount}개
              </span>
            )}
            {source.status === "FAILED" && (
              <>
                <span className="basis-full text-destructive">
                  {source.errorMessage || "처리 중 문제가 발생했습니다."}
                </span>
                <button
                  type="button"
                  disabled={Boolean(operations[source.id])}
                  onClick={() =>
                    void runOperation(source, "retrying", () =>
                      fetch(`/api/resume/career/sources/${source.id}/retry`, {
                        method: "POST",
                      }),
                    )
                  }
                  className="inline-flex items-center gap-1 border border-border px-2 py-1 font-bold disabled:opacity-50"
                >
                  {operations[source.id] === "retrying" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-3 w-3" />
                  )}
                  {operations[source.id] === "retrying" ? "다시 시도 중" : "다시 시도"}
                </button>
              </>
            )}
            <button
              type="button"
              aria-label={`${source.originalName} 삭제`}
              disabled={Boolean(operations[source.id])}
              onClick={() => {
                if (!window.confirm("원본과 검색 데이터를 삭제할까요? 승인된 기억은 재검토 상태가 됩니다.")) return;
                void runOperation(source, "deleting", () =>
                  fetch(`/api/resume/career/sources/${source.id}`, { method: "DELETE" }),
                );
              }}
              className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
            >
              {operations[source.id] === "deleting" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
            {operationErrors[source.id] && (
              <span className="basis-full text-destructive" role="alert">
                {operationErrors[source.id]} 잠시 후 다시 시도해 주세요.
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
