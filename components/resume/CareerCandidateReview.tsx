"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  CareerExperienceFields,
  type CareerExperienceDraft,
} from "./CareerExperienceFields";

type Candidate = CareerExperienceDraft & {
  id: string;
  mode: "CREATE" | "LINK" | "AUGMENT";
  targetExperienceId: string | null;
  evidence: Array<{
    id: string;
    fieldPath: string;
    excerpt: string;
    origin?: "SOURCE_EXCERPT" | "USER_ASSERTION" | null;
    pageStart: number | null;
    pageEnd: number | null;
  }>;
};
type Experience = { id: string; title: string; memoryStatus?: "CONFIRMED" | "NEEDS_REVIEW" };
type CandidateOperation = "saving" | "approving" | "rejecting";

function responseMessage(json: unknown, fallback: string) {
  if (!json || typeof json !== "object") return fallback;
  const value = json as { message?: unknown; error?: unknown };
  return typeof value.message === "string"
    ? value.message
    : typeof value.error === "string"
      ? value.error
      : fallback;
}

function candidateValidationError(candidate: Candidate) {
  if (!candidate.title.trim()) return "경험 이름을 입력해 주세요.";
  if (!candidate.content.trim()) return "요약을 입력해 주세요.";
  if (candidate.mode !== "CREATE" && !candidate.targetExperienceId) {
    return "반영할 대상 경험을 선택해 주세요.";
  }
  if (
    !candidate.isCurrent &&
    candidate.startDate &&
    candidate.endDate &&
    candidate.endDate < candidate.startDate
  ) {
    return "종료일은 시작일보다 빠를 수 없습니다.";
  }
  return null;
}

export function CareerCandidateReview({
  refreshToken,
  onChanged,
}: {
  refreshToken: number;
  onChanged?: () => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operations, setOperations] = useState<Record<string, CandidateOperation>>({});
  const [operationErrors, setOperationErrors] = useState<Record<string, string>>({});
  const operationLocks = useRef(new Set<string>());

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [candidateResponse, experienceResponse] = await Promise.all([
        fetch("/api/resume/career/candidates?status=PENDING"),
        fetch("/api/resume/bricks?page=1&pageSize=100"),
      ]);
      const [candidateJson, experienceJson] = await Promise.all([
        candidateResponse.json().catch(() => null),
        experienceResponse.json().catch(() => null),
      ]);
      if (!candidateResponse.ok) {
        throw new Error(
          responseMessage(candidateJson, "검토 후보를 불러오지 못했습니다."),
        );
      }
      if (!experienceResponse.ok) {
        throw new Error(
          responseMessage(experienceJson, "대상 경험을 불러오지 못했습니다."),
        );
      }
      setCandidates(candidateJson?.candidates ?? []);
      setExperiences(experienceJson?.items ?? []);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "검토 후보를 불러오지 못했습니다.",
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

  const patch = (id: string, update: Partial<Candidate>) => {
    setCandidates((items) =>
      items.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
    setOperationErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const reject = async (candidate: Candidate) => {
    if (operationLocks.current.has(candidate.id)) return;
    operationLocks.current.add(candidate.id);
    setOperations((current) => ({ ...current, [candidate.id]: "rejecting" }));
    setOperationErrors((current) => {
      const next = { ...current };
      delete next[candidate.id];
      return next;
    });
    try {
      const response = await fetch(
        `/api/resume/career/candidates/${candidate.id}/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision: "REJECT",
            rejectionReason: "사용자가 검토 후 제외함",
          }),
        },
      );
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responseMessage(json, "후보를 제외하지 못했습니다."));
      }
      await load();
    } catch (error) {
      setOperationErrors((current) => ({
        ...current,
        [candidate.id]:
          error instanceof Error ? error.message : "후보를 제외하지 못했습니다.",
      }));
    } finally {
      operationLocks.current.delete(candidate.id);
      setOperations((current) => {
        const next = { ...current };
        delete next[candidate.id];
        return next;
      });
    }
  };

  const approve = async (candidate: Candidate) => {
    if (operationLocks.current.has(candidate.id)) return;
    const validationError = candidateValidationError(candidate);
    if (validationError) {
      setOperationErrors((current) => ({
        ...current,
        [candidate.id]: validationError,
      }));
      return;
    }
    operationLocks.current.add(candidate.id);
    setOperations((current) => ({ ...current, [candidate.id]: "saving" }));
    setOperationErrors((current) => {
      const next = { ...current };
      delete next[candidate.id];
      return next;
    });
    try {
      const payload = {
        ...candidate,
        evidence: undefined,
        id: undefined,
      };
      const saved = await fetch(`/api/resume/career/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const savedJson = await saved.json().catch(() => null);
      if (!saved.ok) throw new Error(responseMessage(savedJson, "수정 내용을 저장하지 못했습니다."));

      setOperations((current) => ({ ...current, [candidate.id]: "approving" }));
      const approved = await fetch(
        `/api/resume/career/candidates/${candidate.id}/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision: "APPROVE" }),
        },
      );
      const approvedJson = await approved.json().catch(() => null);
      if (!approved.ok) throw new Error(responseMessage(approvedJson, "후보를 승인하지 못했습니다."));
      await load();
      onChanged?.();
    } catch (error) {
      setOperationErrors((current) => ({
        ...current,
        [candidate.id]:
          error instanceof Error ? error.message : "후보를 승인하지 못했습니다.",
      }));
    } finally {
      operationLocks.current.delete(candidate.id);
      setOperations((current) => {
        const next = { ...current };
        delete next[candidate.id];
        return next;
      });
    }
  };

  if (!isLoading && !loadError && candidates.length === 0) return null;
  return (
    <section className="mt-6 space-y-4" aria-labelledby="candidate-review-title">
      <div>
        <p className="text-[11px] font-bold tracking-[0.14em] text-primary">검토함</p>
        <h2 id="candidate-review-title" className="mt-1 text-xl font-extrabold">
          경력 기억 후보 {candidates.length}개
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          확인하고 승인하기 전에는 글쓰기에 사용되지 않습니다.
        </p>
      </div>
      {isLoading && candidates.length === 0 && (
        <p className="flex items-center gap-2 border border-border p-4 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 검토 후보를 불러오는 중입니다.
        </p>
      )}
      {loadError && (
        <div className="flex flex-wrap items-center gap-2 border border-destructive/30 p-4 text-xs text-destructive" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => void load()} className="border border-current px-2 py-1 font-bold">
            다시 불러오기
          </button>
        </div>
      )}
      {candidates.map((candidate) => {
        const operation = operations[candidate.id];
        const validationError = candidateValidationError(candidate);
        return (
          <article key={candidate.id} className="border border-primary/30 bg-card p-4">
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold">
                반영 방식
                <select
                  value={candidate.mode}
                  disabled={Boolean(operation)}
                  onChange={(event) => {
                    const mode = event.target.value as Candidate["mode"];
                    patch(candidate.id, {
                      mode,
                      targetExperienceId:
                        mode === "CREATE" ? null : candidate.targetExperienceId,
                    });
                  }}
                  className="mt-1 h-10 w-full border border-border bg-background px-3 font-normal disabled:opacity-50"
                >
                  <option value="CREATE">새 경험 만들기</option>
                  <option value="LINK">기존 경험에 근거 연결</option>
                  <option value="AUGMENT">기존 경험 보강</option>
                </select>
              </label>
              {candidate.mode !== "CREATE" && (
                <label className="text-xs font-bold">
                  대상 경험
                  <select
                    value={candidate.targetExperienceId ?? ""}
                    disabled={Boolean(operation)}
                    onChange={(event) =>
                      patch(candidate.id, {
                        targetExperienceId: event.target.value || null,
                      })
                    }
                    className="mt-1 h-10 w-full border border-border bg-background px-3 font-normal disabled:opacity-50"
                  >
                    <option value="">선택해 주세요</option>
                    {experiences.map((experience) => (
                      <option key={experience.id} value={experience.id}>
                        {experience.title}
                        {experience.memoryStatus === "NEEDS_REVIEW" ? " (재확인 필요)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <CareerExperienceFields
              value={candidate}
              onChange={(value) => patch(candidate.id, value)}
            />
            {candidate.evidence.length > 0 && (
              <details className="mt-4 border border-border p-3 text-xs">
                <summary className="cursor-pointer font-bold">근거와 입력 출처 보기</summary>
                <ul className="mt-2 space-y-2 text-muted-foreground">
                  {candidate.evidence.map((evidence) => (
                    <li key={evidence.id}>
                      <span className="mr-1 font-bold text-foreground">
                        {evidence.origin === "USER_ASSERTION" ? "사용자 확인" : "PDF 원문"}
                      </span>
                      {evidence.pageStart
                        ? `${evidence.pageStart}${evidence.pageEnd !== evidence.pageStart ? `–${evidence.pageEnd}` : ""}쪽 · `
                        : ""}
                      {evidence.fieldPath}: {evidence.excerpt}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {(operationErrors[candidate.id] || validationError) && (
              <p className="mt-3 text-xs font-semibold text-destructive" role="alert">
                {operationErrors[candidate.id] || validationError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={Boolean(operation)}
                onClick={() => void reject(candidate)}
                className="h-10 border border-border px-4 text-xs font-bold disabled:opacity-50"
              >
                {operation === "rejecting" ? "제외 중" : "제외"}
              </button>
              <button
                type="button"
                disabled={Boolean(operation) || Boolean(validationError)}
                onClick={() => void approve(candidate)}
                className="inline-flex h-10 items-center gap-2 bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-40"
              >
                {operation && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {operation === "saving"
                  ? "수정 저장 중"
                  : operation === "approving"
                    ? "승인 중"
                    : "승인하고 기억에 반영"}
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
