"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Loader2,
  PencilLine,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import BrickModal from "@/components/resume/BrickModal";
import {
  buildStructuredCareerBrickPayload,
  careerBrickToFormData,
} from "@/domain/career-memory/careerFormPayload";
import { CareerCandidateReview } from "@/components/resume/CareerCandidateReview";
import { CareerSourceList } from "@/components/resume/CareerSourceList";
import type { BrickData } from "@/components/resume/brickModalTypes";
import {
  useResumeBrickStore,
  type BrickItem,
} from "@/stores/resume/useResumeBrickStore";

type BrickFormData = BrickData;

function formatPeriod(period: string | null) {
  return period?.trim() || "기간 없음";
}

const TUTORIAL_SEEN_KEY = "presstuner.resume-write-tutorial-seen:v1";
const WALL_MAX_CELLS = 40;

function BrickWall({ count }: { readonly count: number }) {
  const filled = Math.min(count, WALL_MAX_CELLS);
  const total = Math.min(Math.max(count + 4, 12), WALL_MAX_CELLS);
  const overflow = count - WALL_MAX_CELLS;
  return (
    <div
      className="flex max-w-[280px] flex-wrap items-center gap-1"
      aria-label={`경력 기억 ${count}개 보유`}
    >
      {Array.from({ length: total }, (_, index) => (
        <i
          key={index}
          className={`h-3.5 w-3.5 border border-primary ${
            index < filled ? "bg-primary" : ""
          }`}
        />
      ))}
      {overflow > 0 && (
        <span className="ml-1 font-mono text-[11px] font-bold tabular-nums text-primary">
          +{overflow}
        </span>
      )}
    </div>
  );
}

function SourceBadge({ source }: { readonly source: BrickItem["source"] }) {
  if (source === "AI_EXTRACT") {
    return (
      <span className="border border-primary/40 px-1.5 py-0.5 text-[10px] font-bold text-primary">
        작성에서 추출
      </span>
    );
  }
  if (source === "FILE_PARSE") {
    return (
      <span className="border border-dashed border-ai px-1.5 py-0.5 text-[10px] font-bold text-ai">
        PDF 추출
      </span>
    );
  }
  return null;
}

export default function ResumeBricksPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    list,
    query,
    setPage,
    setSearch,
    fetchList,
    updateBrick,
    deleteOne,
  } = useResumeBrickStore();
  const [qDraft, setQDraft] = useState(query.q ?? "");
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingBrick, setEditingBrick] = useState<BrickItem | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [careerRefresh, setCareerRefresh] = useState(0);
  const [writeHref] = useState(() => {
    if (typeof window === "undefined") return "/resume/write";
    const seen = window.sessionStorage.getItem(TUTORIAL_SEEN_KEY);
    return seen ? "/resume/write" : "/resume/write?tutorial=1";
  });

  useEffect(() => {
    void fetchList();
  }, [fetchList, query.page, query.q]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (qDraft !== query.q) setSearch(qDraft);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [qDraft, query.q, setSearch]);

  const totalPages = Math.max(
    1,
    Math.ceil((list.total || 0) / query.pageSize),
  );
  const brickTotal = list.total ?? list.items.length;
  const confirmedBrickTotal = list.confirmedTotal ?? 0;
  const isEmpty = !list.loading && !list.error && list.items.length === 0;
  const isSearching = Boolean(query.q);

  const handleDelete = (brick: BrickItem) => {
    if (!window.confirm(`${brick.title || "이 경험"} 경험을 삭제할까요?`))
      return;
    void deleteOne(brick.id);
  };

  const handleSaveBrick = async (data: BrickFormData) => {
    const payload = buildStructuredCareerBrickPayload(
      data,
      editingBrick
        ? {}
        : { originalText: data.originalText ?? data.content },
    );

    if (editingBrick) {
      const ok = await updateBrick(editingBrick.id, payload);
      if (ok) {
        setEditingBrick(null);
        setCareerRefresh((value) => value + 1);
        setNotice("수정 후보로 저장했습니다. 아래에서 검토 후 승인해 주세요.");
      } else {
        setNotice("수정 후보를 저장하지 못했습니다. 내용을 확인하고 다시 시도해 주세요.");
      }
      return;
    }

    try {
      const response = await fetch("/api/resume/career/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, mode: "CREATE" }),
      });
      if (!response.ok) throw new Error("candidate create failed");
      setIsManualModalOpen(false);
      setCareerRefresh((value) => value + 1);
      setNotice("경력 기억 후보로 저장했습니다. 아래에서 검토 후 승인해 주세요.");
    } catch {
      setNotice("경력 기억 후보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  const handleSaveBricks = async (items: BrickFormData[]) => {
    const payloads = items.map((data) =>
      buildStructuredCareerBrickPayload(data, {
        originalText: data.originalText ?? data.content,
      }),
    );

    const results = await Promise.allSettled(
      payloads.map((payload) =>
        fetch("/api/resume/career/candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, mode: "CREATE" }),
        }),
      ),
    );
    const ok = results.every(
      (result) => result.status === "fulfilled" && result.value.ok,
    );
    setNotice(
      ok
        ? `${payloads.length}개의 경력 기억 후보를 만들었습니다. 검토 후 승인해 주세요.`
        : "경험 저장에 실패했습니다.",
    );
    if (ok) {
      setIsManualModalOpen(false);
      setCareerRefresh((value) => value + 1);
    }
  };

  const handlePdfUpload = async (file: File | null) => {
    if (!file) return;
    setIsUploading(true);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/resume/career/sources", {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.message ?? "PDF 접수 실패");
      setNotice(
        json?.deduplicated
          ? "이미 처리 중이거나 준비된 같은 PDF가 있습니다."
          : "PDF를 안전하게 접수했습니다. 처리 현황을 아래에서 확인하세요.",
      );
      setCareerRefresh((value) => value + 1);
    } catch {
      setNotice("PDF 경험을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="wongoji-sharp mx-auto w-full max-w-5xl pb-20">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-bold tracking-[0.18em] text-primary">
            경력 기억
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            확인한 경험만 기억합니다
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
            승인한 경력 기억만 자기소개서의 근거로 사용됩니다. PDF 원본과
            추출 후보는 본인에게만 보입니다.
          </p>
        </div>
        <div className="shrink-0">
          <BrickWall count={brickTotal} />
          <p className="mt-2 font-mono text-sm font-bold tabular-nums text-muted-foreground">
            경험 <span className="text-primary">{brickTotal}</span>개
          </p>
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            aria-label="경험 검색"
            placeholder="경험 제목·키워드 검색"
            value={qDraft}
            onChange={(event) => setQDraft(event.target.value)}
            className="h-11 w-full border border-border bg-card pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
          />
        </div>
        <div className="flex shrink-0 gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(event) =>
              void handlePdfUpload(event.target.files?.[0] ?? null)
            }
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex h-11 items-center justify-center gap-2 border-[1.5px] border-dashed border-ai bg-card px-4 text-sm font-bold text-foreground transition-colors hover:bg-ai-soft/60 disabled:opacity-50"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <PencilLine className="h-4 w-4 text-ai" aria-hidden="true" />
            )}
            {isUploading ? "PDF 접수 중" : "PDF에서 경험 찾기"}
          </button>
          <button
            type="button"
            onClick={() => setIsManualModalOpen(true)}
            className="inline-flex h-11 items-center justify-center gap-2 bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            직접 추가
          </button>
        </div>
      </div>

      {notice && (
        <p className="mt-3 border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary">
          {notice}
        </p>
      )}

      <CareerSourceList
        refreshToken={careerRefresh}
        onChanged={() => setCareerRefresh((value) => value + 1)}
      />
      <CareerCandidateReview
        refreshToken={careerRefresh}
        onChanged={() => {
          setCareerRefresh((value) => value + 1);
          void fetchList();
        }}
      />

      <div className="mt-6">
        {list.loading ? (
          <div className="flex min-h-64 items-center justify-center border border-dashed border-border">
            <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
          </div>
        ) : list.error ? (
          <p className="border border-destructive/20 bg-destructive/10 p-6 text-center text-sm font-semibold text-destructive">
            {list.error}
          </p>
        ) : isEmpty ? (
          isSearching ? (
            <div className="border border-dashed border-border py-14 text-center">
              <h2 className="text-lg font-bold">검색 결과가 없습니다.</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                다른 키워드로 다시 찾아보세요.
              </p>
            </div>
          ) : (
            <div className="border-[1.5px] border-dashed border-primary/50 bg-primary/[0.03] px-6 py-14 text-center">
              <div className="mx-auto flex w-fit gap-1" aria-hidden="true">
                {Array.from({ length: 5 }, (_, index) => (
                  <i
                    key={index}
                    className={`h-4 w-4 border border-primary ${index < 2 ? "bg-primary" : ""}`}
                  />
                ))}
              </div>
              <h2 className="mt-5 text-xl font-extrabold tracking-tight">
                첫 경력 기억을 만들어볼까요?
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                이력서 PDF를 올리면 그 안에 담긴 경험을 AI가 검토 후보로
                정리합니다. 핵심 경험 두세 개만 직접 적어도 충분히 시작할 수 있어요.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="inline-flex h-11 items-center justify-center gap-2 border-[1.5px] border-dashed border-ai bg-card px-5 text-sm font-bold transition-colors hover:bg-ai-soft/60 disabled:opacity-50"
                >
                  <PencilLine className="h-4 w-4 text-ai" aria-hidden="true" />
                  PDF에서 경험 추출
                </button>
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(true)}
                  className="inline-flex h-11 items-center justify-center gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  직접 추가
                </button>
              </div>
            </div>
          )
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.items.map((brick) => (
              <li key={brick.id}>
                <article
                  className={`group flex h-full min-h-[210px] flex-col border bg-card p-4 transition-colors ${
                    brick.memoryStatus === "NEEDS_REVIEW"
                      ? "border-amber-500/60"
                      : "border-border hover:border-primary"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="line-clamp-2 text-base font-bold leading-snug">
                      {brick.title}
                    </h2>
                    <div className="flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => setEditingBrick(brick)}
                        className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`${brick.title} 수정`}
                      >
                        <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(brick)}
                        className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`${brick.title} 삭제`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {formatPeriod(brick.period)}
                    </p>
                    <SourceBadge source={brick.source} />
                    {brick.memoryStatus === "NEEDS_REVIEW" && (
                      <span className="border border-amber-500/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                        재확인 필요
                      </span>
                    )}
                  </div>
                  <p className="mt-3 line-clamp-4 text-sm leading-6 text-muted-foreground">
                    {brick.content}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                    {brick.memoryStatus === "NEEDS_REVIEW" && (
                      <div className="mb-2 w-full border border-amber-500/30 bg-amber-500/10 p-2 text-xs leading-5 text-amber-800">
                        <p>원본 삭제 등으로 근거 상태가 바뀌었습니다. 재확인 전에는 글쓰기에 사용되지 않습니다.</p>
                        <button
                          type="button"
                          onClick={() => setEditingBrick(brick)}
                          className="mt-1 border border-current px-2 py-1 font-bold"
                        >
                          내용 확인 후 다시 승인
                        </button>
                      </div>
                    )}
                    {brick.tags.slice(0, 4).map((tag) => (
                      <span
                        key={`${brick.id}-${tag}`}
                        className="border border-primary/30 px-2 py-0.5 text-[11px] font-bold text-primary"
                      >
                        #{tag}
                      </span>
                    ))}
                    {brick.tags.length === 0 && (
                      <span className="border border-dashed border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        태그 없음
                      </span>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>

      {list.total > 0 && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={query.page === 1}
            onClick={() => setPage(query.page - 1)}
            className="inline-flex h-10 w-10 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
            aria-label="이전 페이지"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="font-mono text-sm font-semibold tabular-nums text-muted-foreground">
            {query.page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={query.page >= totalPages}
            onClick={() => setPage(query.page + 1)}
            className="inline-flex h-10 w-10 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
            aria-label="다음 페이지"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {confirmedBrickTotal > 0 && (
        <div className="mt-10 flex flex-col items-center gap-2 border-t-2 border-foreground pt-5 sm:flex-row sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">
            재료가 준비됐어요. 공고를 붙여넣으면 이 경험들로 초안을 만듭니다.
          </p>
          <Link
            href={writeHref}
            className="inline-flex h-11 shrink-0 items-center gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            이 경험으로 자소서 쓰기
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}

      <BrickModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onConfirm={handleSaveBrick}
        onConfirmMany={handleSaveBricks}
      />
      <BrickModal
        isOpen={Boolean(editingBrick)}
        onClose={() => setEditingBrick(null)}
        onConfirm={handleSaveBrick}
        initialData={editingBrick ? careerBrickToFormData(editingBrick) : undefined}
      />
    </div>
  );
}
