"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, Edit3, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { fetchWithLoading } from "@/lib/fetchWithLoading";
import { parseResumeBrief } from "@/lib/services/resume/resumeBrief";

type AppDetail = {
  id: string;
  companyName: string;
  jobTitle: string;
  jdText: string | null;
  status: string;
  updatedAt: string;
  questions: {
    id: string;
    questionText: string;
    answer: string;
    charLimit: number;
    relatedBricks: { brick: { title: string } }[];
  }[];
};

export default function ApplicationDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedQuestions, setExpandedQuestions] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        setData(null);

        const res = await fetchWithLoading(`/api/resume/applications/${id}`);
        const json = await res.json();

        if (isMounted && json.ok) {
          setData(json.data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="wongoji-sharp flex min-h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="wongoji-sharp p-20 text-center text-muted-foreground">
        데이터를 찾을 수 없습니다.
      </div>
    );
  }

  const parsedBrief = parseResumeBrief(data.jdText);
  const isDone = data.status === "DONE";
  const answeredCount = data.questions.filter((q) => q.answer?.trim()).length;

  const toggleQuestion = (questionId: string) => {
    setExpandedQuestions((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  };

  return (
    <div className="wongoji-sharp mx-auto w-full max-w-4xl pb-20">
      <Link
        href="/resume/applications"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        지원서 대장으로
      </Link>

      <header className="mt-5 flex flex-col justify-between gap-5 border-b-2 border-foreground pb-6 md:flex-row md:items-end">
        <div className="min-w-0">
          <div className="flex items-start gap-4">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              {data.companyName}
              <span className="ml-3 text-xl font-normal text-muted-foreground">
                {data.jobTitle}
              </span>
            </h1>
            {isDone && (
              <span aria-label="작성 완료" className="mt-1 inline-flex shrink-0 items-center gap-1.5 border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-extrabold text-primary">
                <Check className="h-4 w-4" />
                작성 완료
              </span>
            )}
          </div>
          <p className="mt-3 font-mono text-xs tabular-nums text-muted-foreground">
            문항 {answeredCount}/{data.questions.length} 작성 ·{" "}
            {new Date(data.updatedAt).toLocaleDateString("ko-KR")}
          </p>
        </div>

        <Link
          href={`/resume/write?id=${data.id}`}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Edit3 className="h-4 w-4" aria-hidden="true" />
          이어서 수정하기
        </Link>
      </header>

      {parsedBrief.summary && (
        <details className="group mt-5">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronDown
              className="h-4 w-4 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
            참고했던 채용 공고 보기
          </summary>
          <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
            {parsedBrief.summary}
          </div>
        </details>
      )}

      <section className="mt-8 space-y-5" aria-label="작성된 문항">
        {data.questions.map((q, idx) => {
          const expanded = Boolean(expandedQuestions[q.id]);
          const hasAnswer = Boolean(q.answer?.trim());
          return (
            <article key={q.id} className="border border-border bg-card">
              <div className="border-b border-border px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[11px] font-bold tracking-[0.1em] text-muted-foreground">
                    Q{idx + 1} · {q.charLimit}자
                  </p>
                  <p
                    className={`font-mono text-xs font-bold tabular-nums ${
                      hasAnswer ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {q.answer?.length || 0} / {q.charLimit}자
                  </p>
                </div>
                <h2 className="mt-2 text-base font-bold leading-relaxed sm:text-lg">
                  {q.questionText}
                </h2>
                {q.relatedBricks.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-muted-foreground">
                      재료
                    </span>
                    {q.relatedBricks.map((rb, i) => (
                      <span
                        key={i}
                        className="border border-primary/30 px-2 py-0.5 text-[11px] font-bold text-primary"
                      >
                        {rb.brick.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-5 py-4">
                {hasAnswer ? (
                  <>
                    <p
                      className={[
                        "wg-ruled whitespace-pre-wrap text-sm text-foreground sm:text-[15px]",
                        !expanded ? "line-clamp-4" : "",
                      ].join(" ")}
                    >
                      {q.answer}
                    </p>
                    <button
                      type="button"
                      onClick={() => toggleQuestion(q.id)}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary transition-opacity hover:opacity-80"
                    >
                      {expanded ? (
                        <>
                          <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                          접기
                        </>
                      ) : (
                        <>
                          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                          전체 보기
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    아직 작성된 내용이 없습니다.
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
