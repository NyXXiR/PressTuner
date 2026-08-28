"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Filter, Loader2, PenLine, PencilLine, RotateCcw, Search, SendHorizonal, X } from "lucide-react";
import { useResumeQuestionListStore } from "@/stores/useResumeQuestionListStore";
import clsx from "clsx";

type AiAssistantMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  suggestedQuery?: string;
  items?: Array<{
    id: string;
    questionText: string;
    answer: string | null;
    isCompleted: boolean;
    charLimit: number | null;
    updatedAt: string;
    score: number;
    application: {
      id: string;
      companyName: string;
      jobTitle: string;
      status: string;
    };
  }>;
};

type AssistantResultState = {
  suggestedQuery: string;
  assistantMessage: string;
  items: NonNullable<AiAssistantMessage["items"]>;
};

const QUESTION_ASSISTANT_SESSION_KEY = "resume-question-assistant-session";

export default function QuestionListPage() {
  const router = useRouter();
  const { query, list, fetchList, setFilters, setPage } =
    useResumeQuestionListStore();
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const [searchInput, setSearchInput] = useState(query.q);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<
    AiAssistantMessage[]
  >([
    {
      id: "assistant-intro",
      role: "assistant",
      text:
        "찾고 싶은 문항의 정확한 검색어가 기억나지 않으면 설명만 적어도 됩니다. 제가 검색어를 추려서 바로 목록 검색까지 연결할게요.",
    },
  ]);
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantResult, setAssistantResult] =
    useState<AssistantResultState | null>(null);

  useEffect(() => {
    setSearchInput(query.q);
  }, [query.q]);

  useEffect(() => {
    const raw =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem(QUESTION_ASSISTANT_SESSION_KEY)
        : null;
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as {
        assistantInput?: string;
        assistantMessages?: AiAssistantMessage[];
        assistantResult?: AssistantResultState | null;
        searchInput?: string;
      };

      if (typeof parsed.assistantInput === "string") {
        setAssistantInput(parsed.assistantInput);
      }
      if (
        Array.isArray(parsed.assistantMessages) &&
        parsed.assistantMessages.length > 0
      ) {
        setAssistantMessages(parsed.assistantMessages);
      }
      if (parsed.assistantResult) {
        setAssistantResult(parsed.assistantResult);
      }
      if (typeof parsed.searchInput === "string" && !query.q) {
        setSearchInput(parsed.searchInput);
      }
    } catch (error) {
      console.error("Failed to restore question assistant session", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.page, query.filter, query.q]);

  useEffect(() => {
    const node = chatScrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [assistantMessages, isAssistantLoading, assistantError]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.sessionStorage.setItem(
      QUESTION_ASSISTANT_SESSION_KEY,
      JSON.stringify({
        assistantInput,
        assistantMessages,
        assistantResult,
        searchInput,
      }),
    );
  }, [assistantInput, assistantMessages, assistantResult, searchInput]);

  const displayedItems = useMemo(
    () => assistantResult?.items ?? list.items,
    [assistantResult, list.items],
  );
  const isShowingAssistantResults = assistantResult !== null;

  const applySearch = (nextQuery: string) => {
    setSearchInput(nextQuery);
    setFilters({ q: nextQuery });
    setAssistantResult(null);
  };

  const handleSearch = () => {
    if (searchInput === query.q) return;
    setFilters({ q: searchInput });
    setAssistantResult(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleReset = () => {
    setSearchInput("");
    setFilters({ q: "" });
    setAssistantResult(null);
  };

  const handleClearText = () => {
    setSearchInput("");
  };

  const submitAssistant = async (preset?: string) => {
    const nextInput = (preset ?? assistantInput).trim();
    if (!nextInput || isAssistantLoading) return;

    const nextUserMessage: AiAssistantMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: nextInput,
    };

    const nextMessages = [...assistantMessages, nextUserMessage];
    setAssistantMessages(nextMessages);
    setAssistantError(null);
    setAssistantResult(null);
    if (!preset) {
      setAssistantInput("");
    }
    setIsAssistantLoading(true);

    try {
      const res = await fetch("/api/resume/questions/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.text,
          })),
          filter: query.filter,
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        throw new Error(
          json?.message ??
            json?.error ??
            "AI 검색 도우미 호출에 실패했습니다.",
        );
      }

      const suggestedQuery =
        typeof json.suggestedQuery === "string" ? json.suggestedQuery : "";
      const nextItems = Array.isArray(json.items) ? json.items : [];
      if (suggestedQuery) {
        setSearchInput(suggestedQuery);
      }
      setAssistantResult({
        suggestedQuery,
        assistantMessage:
          json.assistantMessage ??
          "대화를 기준으로 의미가 가까운 문항 후보를 직접 골랐습니다.",
        items: nextItems,
      });

      setAssistantMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text:
            json.assistantMessage ??
            "대화를 기준으로 검색어를 정리해서 문항을 다시 찾아봤습니다.",
          suggestedQuery,
          items: nextItems,
        },
      ]);
    } catch (error: any) {
      setAssistantError(
        error?.message ?? "AI 검색 도우미 호출에 실패했습니다.",
      );
    } finally {
      setIsAssistantLoading(false);
    }
  };

  const handleAssistantKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitAssistant();
    }
  };

  return (
    <div className="wongoji-sharp mx-auto w-full max-w-[1560px] px-4 pb-20 md:px-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(360px,3fr)]">
        <div className="min-w-0 space-y-8">
          <div className="flex flex-col justify-between gap-4 py-4 md:flex-row md:items-end">
            <div>
              <p className="text-[11px] font-bold tracking-[0.18em] text-primary">
                문항 뱅크
              </p>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                예전에 뭐라고 썼더라?
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                지금까지 작성한 모든 문항과 답변을 검색합니다. 정확한 표현이
                기억나지 않으면 오른쪽 연필에게 설명만 해도 됩니다.
              </p>
            </div>
          </div>

          <div>
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div className="flex w-full overflow-x-auto md:w-auto" role="group" aria-label="문항 필터">
                {[
                  { label: "전체 문항", value: "ALL" },
                  { label: "작성 완료", value: "COMPLETED" },
                  { label: "작성 필요", value: "PENDING" },
                ].map((tab, index) => (
                  <button
                    key={tab.value}
                    onClick={() => {
                      setAssistantResult(null);
                      setFilters({ filter: tab.value as any });
                    }}
                    aria-pressed={query.filter === tab.value}
                    className={clsx(
                      "whitespace-nowrap border px-4 py-2.5 text-sm font-bold transition-colors",
                      index > 0 && "-ml-px",
                      query.filter === tab.value
                        ? "z-10 border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex w-full items-center gap-2 md:w-auto">
                <div className="group relative flex-1 md:w-96">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
                    size={16}
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    placeholder="질문 내용이나 기업명 검색"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full border border-border bg-card py-2.5 pl-10 pr-10 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
                  />
                  {searchInput.length > 0 && (
                    <button
                      onClick={handleClearText}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                      type="button"
                      aria-label="검색어 지우기"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <button
                  onClick={handleSearch}
                  className="whitespace-nowrap bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
                >
                  검색
                </button>
                {query.q && (
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-2 whitespace-nowrap border border-border bg-background px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
                    title="검색 조건 초기화"
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    <span className="hidden sm:inline">초기화</span>
                  </button>
                )}
              </div>
            </div>

            {query.q && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="border border-primary/20 bg-primary/10 px-3 py-1 font-medium text-primary">
                  현재 검색어: {query.q}
                </span>
                <span>{list.total}개 문항</span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {isShowingAssistantResults && assistantResult && (
              <div className="border border-primary/20 bg-primary/[0.05] px-4 py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      AI가 고른 문항 후보
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {assistantResult.assistantMessage}
                    </p>
                    {assistantResult.suggestedQuery ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="border border-border bg-background px-3 py-1 font-medium text-primary">
                          추천 검색어: {assistantResult.suggestedQuery}
                        </span>
                        <span>{assistantResult.items.length}개 후보</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {assistantResult.suggestedQuery ? (
                      <button
                        type="button"
                        onClick={() =>
                          applySearch(assistantResult.suggestedQuery)
                        }
                        className="bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
                      >
                        검색 결과로 전환
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setAssistantResult(null)}
                      className="border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                    >
                      AI 결과 닫기
                    </button>
                  </div>
                </div>
              </div>
            )}

            {list.error && !list.loading && (
              <div className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {list.error}
              </div>
            )}

            {list.loading && (
              <div className="flex flex-col items-center py-20 text-muted-foreground">
                <Loader2 className="mb-2 animate-spin" aria-hidden="true" />
                <span>문항을 불러오는 중...</span>
              </div>
            )}

            {!list.loading && displayedItems.length === 0 && (
              <div className="flex flex-col items-center border border-dashed border-border bg-secondary/20 py-20 text-muted-foreground">
                <Filter className="mb-4 opacity-50" size={32} aria-hidden="true" />
                <p className="font-medium">
                  {isShowingAssistantResults
                    ? "AI가 제안할 만한 문항을 찾지 못했습니다."
                    : "조건에 맞는 문항이 없습니다."}
                </p>
                {isShowingAssistantResults ? (
                  <button
                    onClick={() => setAssistantResult(null)}
                    className="mt-4 flex items-center gap-2 border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
                  >
                    AI 결과 닫기
                  </button>
                ) : query.q ? (
                  <button
                    onClick={handleReset}
                    className="mt-4 flex items-center gap-2 border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
                  >
                    <RotateCcw size={14} aria-hidden="true" /> 검색 조건 초기화
                  </button>
                ) : null}
              </div>
            )}

            {!list.loading &&
              displayedItems.map((item) => (
                <div
                  key={item.id}
                  className="group relative cursor-pointer border border-border bg-card p-5 transition-colors hover:border-primary"
                  onClick={() => {
                    router.push(`/resume/write?id=${item.application.id}`);
                  }}
                >
                  <div className="mb-2.5 flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-xs font-bold text-primary">
                      {item.application.companyName}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {item.application.jobTitle}
                      </span>
                    </p>
                    {item.isCompleted ? (
                      <Check aria-label="작성 완료" className="h-4 w-4 shrink-0 text-primary" role="img" />
                    ) : (
                      <span className="shrink-0 border border-dashed border-border px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                        작성 전
                      </span>
                    )}
                  </div>

                  <h3 className="mb-2.5 text-base font-bold leading-relaxed text-foreground sm:text-lg">
                    {item.questionText}
                  </h3>

                  {item.answer ? (
                    <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {item.answer}
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-sm italic text-muted-foreground/60">
                      <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
                      아직 작성된 답변이 없습니다.
                    </p>
                  )}

                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {new Date(item.updatedAt).toLocaleDateString("ko-KR")}
                      {item.charLimit ? ` · ${item.charLimit}자` : ""}
                    </p>
                    <span className="flex translate-x-[-8px] items-center gap-1 text-xs font-bold text-primary opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
                      작성하러 가기 <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              ))}
          </div>

          {!list.loading &&
            !isShowingAssistantResults &&
            list.totalPages > 1 && (
              <div className="mt-8 flex justify-center gap-2">
                <button
                  disabled={query.page <= 1}
                  onClick={() => setPage(query.page - 1)}
                  className="border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
                >
                  이전
                </button>
                <span className="flex items-center px-4 py-2 text-sm font-medium text-muted-foreground">
                  {query.page} / {list.totalPages}
                </span>
                <button
                  disabled={query.page >= list.totalPages}
                  onClick={() => setPage(query.page + 1)}
                  className="border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
                >
                  다음
                </button>
              </div>
            )}
        </div>

        <aside className="xl:sticky xl:top-20 xl:h-[calc(100vh-168px)]">
          <div className="flex h-full max-h-[calc(100vh-168px)] flex-col overflow-hidden border-[1.5px] border-dashed border-ai bg-ai-soft/40">
            <div className="border-b border-dashed border-ai/60 px-5 py-5">
              <div className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.14em] text-ai">
                <PencilLine className="h-4 w-4" aria-hidden="true" />
                연필 — 문항 탐색 도우미
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                정확한 검색어가 기억나지 않아도 됩니다. 찾고 싶은 문항의 맥락이나
                기억나는 일부 표현만 적어보세요.
              </p>
            </div>

            <div
              ref={chatScrollRef}
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            >
              {assistantMessages.map((message) => (
                <div
                  key={message.id}
                  className={clsx(
                    "px-4 py-3 text-sm leading-6",
                    message.role === "assistant"
                      ? "border border-border bg-card text-foreground"
                      : "ml-8 bg-foreground text-background",
                  )}
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] opacity-70">
                    {message.role === "assistant" ? (
                      <>
                        <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                        연필
                      </>
                    ) : (
                      "나"
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap">{message.text}</p>

                  {message.suggestedQuery && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setAssistantResult(
                            message.items
                              ? {
                                  suggestedQuery: message.suggestedQuery ?? "",
                                  assistantMessage: message.text,
                                  items: message.items,
                                }
                              : null,
                          )
                        }
                        className="bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                      >
                        AI 결과 다시 보기
                      </button>
                      <button
                        type="button"
                        onClick={() => applySearch(message.suggestedQuery ?? "")}
                        className="border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground"
                      >
                        검색어만 적용: {message.suggestedQuery}
                      </button>
                    </div>
                  )}

                  {message.items && message.items.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            router.push(`/resume/write?id=${item.application.id}`)
                          }
                          className="block w-full border border-border/70 bg-background px-3 py-3 text-left transition-colors hover:border-primary"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-xs font-semibold text-primary">
                              {item.application.companyName} ·{" "}
                              {item.application.jobTitle}
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              유사도 {Math.round(item.score * 100)}%
                            </span>
                          </div>
                          <div className="mt-1 line-clamp-2 text-sm font-medium text-foreground">
                            {item.questionText}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {isAssistantLoading && (
                <div className="border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    대화 내용을 바탕으로 검색어와 후보 문항을 정리하는 중입니다.
                  </div>
                </div>
              )}

              {assistantError && (
                <div className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {assistantError}
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-ai/60 px-4 py-4">
              <div className="relative">
                <textarea
                  value={assistantInput}
                  onChange={(e) => setAssistantInput(e.target.value)}
                  onKeyDown={handleAssistantKeyDown}
                  placeholder="예: 삼성 지원동기 문항 같은데 정확한 표현이 기억 안 나"
                  rows={4}
                  className="min-h-[132px] w-full resize-none border border-border bg-card py-4 pl-4 pr-14 text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => void submitAssistant()}
                  disabled={
                    isAssistantLoading || assistantInput.trim().length === 0
                  }
                  aria-label="문항 탐색 요청 보내기"
                  className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <SendHorizonal className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Enter로 전송, Shift+Enter로 줄바꿈
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
