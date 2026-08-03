"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  FileStack,
  Loader2,
  PenSquare,
  Plus,
  Sparkles,
} from "lucide-react";
import { useResumeWriteStore } from "@/stores/useResumeWriteStore";

type PendingBrickIngestionItem = {
  previewId: string;
  mode: "create" | "link" | "augment";
  title: string;
  content: string;
  originalText: string;
  period: string | null;
  tags: string[];
  matchedBrickId: string | null;
  matchedBrickTitle: string | null;
  reason: string | null;
  existingContent: string | null;
  existingOriginalText: string | null;
};

type PreviewResult = {
  questionId: string;
  questionText: string;
  items: PendingBrickIngestionItem[];
};

function buildCompletionIngestionPrompt(questionText: string, answer: string) {
  return [
    "지원서 작성을 마쳤습니다.",
    "아래 문항 답변에서 새롭게 저장할 만한 경험이 있으면 경험 브릭 후보로 추출해줘.",
    `문항: ${questionText}`,
    `답변: ${answer}`,
  ].join("\n\n");
}

export default function CompletionStep() {
  const store = useResumeWriteStore();
  const completedCount = store.questions.filter((question) => question.isCompleted).length;
  const lastPreviewKeyRef = useRef<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<
    "idle" | "loading" | "ready" | "empty" | "error"
  >("idle");
  const [applyStatus, setApplyStatus] = useState<"idle" | "applying" | "done" | "error">(
    "idle",
  );
  const [previewResults, setPreviewResults] = useState<PreviewResult[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const completedQuestions = useMemo(
    () =>
      store.questions.filter(
        (question) => question.isCompleted && question.answer.trim().length > 0,
      ),
    [store.questions],
  );
  const previewKey = useMemo(
    () =>
      store.appId
        ? `${store.appId}:${completedQuestions
            .map((question) => `${question.id}:${question.answer.trim().length}`)
            .join("|")}`
        : null,
    [completedQuestions, store.appId],
  );

  useEffect(() => {
    if (!previewKey) {
      setPreviewStatus("idle");
      setSummary("지원서 정보를 확인하고 있습니다.");
      return;
    }

    if (lastPreviewKeyRef.current === previewKey) {
      return;
    }

    lastPreviewKeyRef.current = previewKey;

    const runPreview = async () => {
      if (completedQuestions.length === 0) {
        setPreviewStatus("empty");
        setSummary("완료된 문항 답변이 없어 추가로 추출할 경험 브릭 후보가 없습니다.");
        return;
      }

      setPreviewStatus("loading");
      setApplyStatus("idle");
      setError(null);
      setSummary("작성한 내용을 바탕으로 저장해둘 경험이 있는지 점검하고 있습니다.");
      setPreviewResults([]);

      try {
        const results: PreviewResult[] = [];

        for (const question of completedQuestions) {
          const res = await fetch(`/api/resume/questions/${question.id}/ingest-bricks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              applicationId: store.appId,
              mode: "preview",
              prompt: buildCompletionIngestionPrompt(
                question.questionText,
                question.answer.trim(),
              ),
              recentMessages: [
                {
                  role: "user",
                  body: question.answer.trim(),
                },
              ],
            }),
          });
          const json = await res.json().catch(() => null);

          if (!res.ok || !json?.ok) {
            throw new Error(
              json?.message ?? json?.error ?? "경험 브릭 후보 추출에 실패했습니다.",
            );
          }

          const items = Array.isArray(json.items)
            ? (json.items as PendingBrickIngestionItem[])
            : [];

          if (items.length === 0) {
            continue;
          }

          results.push({
            questionId: question.id,
            questionText: question.questionText,
            items,
          });
        }

        setPreviewResults(results);
        if (results.length === 0) {
          setPreviewStatus("empty");
          setSummary("문항 답변을 모두 점검했고, 이번에는 새로 저장할 경험이 없었습니다.");
          return;
        }

        setPreviewStatus("ready");
        setSummary(
          `${results.length}개 문항에서 ${results.reduce(
            (count, result) => count + result.items.length,
            0,
          )}개의 경험을 브릭으로 정리했습니다. 추가할지 선택하세요.`,
        );
      } catch (previewError: any) {
        setPreviewStatus("error");
        setError(previewError?.message ?? "경험 브릭 후보 추출에 실패했습니다.");
      }
    };

    void runPreview();
  }, [completedQuestions, previewKey, store.appId]);

  const totalPreviewCount = useMemo(
    () => previewResults.reduce((count, result) => count + result.items.length, 0),
    [previewResults],
  );
  const summaryTone =
    error || previewStatus === "error" || applyStatus === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : applyStatus === "done"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : previewStatus === "ready"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-border bg-card text-foreground";

  const handleApply = async () => {
    if (!store.appId || previewResults.length === 0) return;

    setApplyStatus("applying");
    setError(null);
    setSummary("선택한 경험을 브릭에 반영하고 있습니다.");

    try {
      for (const result of previewResults) {
        const res = await fetch(`/api/resume/questions/${result.questionId}/ingest-bricks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicationId: store.appId,
            mode: "apply",
            items: result.items,
          }),
        });
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.ok) {
          throw new Error(
            json?.message ?? json?.error ?? "경험 브릭 반영에 실패했습니다.",
          );
        }

        if (Array.isArray(json.questionBricks)) {
          store.updateQuestionById(result.questionId, {
            relatedBricks: json.questionBricks,
          });
        }
      }

      await store.fetchUserBricks();
      setApplyStatus("done");
      setSummary("경험 브릭 반영이 끝났습니다. 브릭 화면에서 바로 확인할 수 있습니다.");
    } catch (applyError: any) {
      setApplyStatus("error");
      setError(applyError?.message ?? "경험 브릭 반영에 실패했습니다.");
    }
  };

  const handleSkip = () => {
    setPreviewResults([]);
    setPreviewStatus("empty");
    setApplyStatus("idle");
    setSummary("경험 브릭 추가는 이번에 건너뛰었습니다.");
    setError(null);
  };

  return (
    <div className="px-4 py-7 md:px-6 md:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[28px] border border-border bg-card px-4 py-7 shadow-[0_32px_100px_rgba(12,18,28,0.10)] sm:px-6 md:px-8 md:py-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 sm:h-20 sm:w-20">
            <CheckCircle2 className="h-8 w-8 sm:h-10 sm:w-10" />
          </div>
          <h1 className="mt-5 text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            자기소개서 작성이 마무리됐습니다.
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-7 text-muted-foreground">
            <span className="font-semibold text-foreground">
              {store.targetInfo.company || "이번 지원서"}
            </span>{" "}
            기준으로 <span className="font-semibold text-foreground">{completedCount}개 문항</span>을 완료 처리했습니다.
          </p>

          <section className="mt-8 rounded-[24px] border border-border bg-background p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="inline-flex items-center justify-center rounded-full bg-primary/10 p-3 text-primary mb-3">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-bold text-foreground">경험 자산(브릭) 자동 추출</h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-lg">
                작성하신 훌륭한 답변이 휘발되지 않도록, 다음 자소서에서도 바로 꺼내 쓸 수 있는
                &apos;경험 브릭&apos; 후보를 발견했습니다. 나의 자산으로 저장해둘까요?
              </p>
            </div>

            {summary ? (
              <div className={`mt-6 rounded-[18px] border px-4 py-3 text-center text-sm ${summaryTone}`}>
                {summary}
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {previewStatus === "loading" || applyStatus === "applying" ? (
              <div className="mt-6 flex min-h-[160px] flex-col items-center justify-center rounded-[20px] border border-dashed border-border bg-card px-4 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="mt-3 text-sm font-semibold text-foreground">
                  {applyStatus === "applying"
                    ? "선택한 경험을 내 브릭 지갑에 저장하는 중입니다..."
                    : "답변을 분석하여 새로운 경험 자산을 발굴하고 있습니다..."}
                </p>
              </div>
            ) : null}

            {applyStatus === "done" ? (
              <div className="mt-6 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-3">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <p className="text-base font-bold text-emerald-800">
                  나의 경험 브릭 자산이 늘어났습니다!
                </p>
                <p className="mt-1 text-sm text-emerald-700/80">
                  다음 지원서를 쓸 때 방금 저장한 경험을 바로 활용할 수 있습니다.
                </p>
              </div>
            ) : null}

            {previewStatus === "ready" ? (
              <div className="mt-6">
                <div className="space-y-4">
                  {previewResults.map((result) => (
                    <div
                      key={result.questionId}
                      className="rounded-[20px] border border-primary/20 bg-primary/5 p-4 sm:p-5"
                    >
                      <div className="flex flex-col gap-1 mb-3">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                          발견된 경험 출처
                        </span>
                        <div className="text-sm font-semibold text-foreground line-clamp-2">
                          {result.questionText}
                        </div>
                      </div>
                      <div className="grid gap-3">
                        {result.items.map((item) => (
                          <div
                            key={item.previewId}
                            className="rounded-xl border border-border/80 bg-background px-4 py-4 shadow-sm"
                          >
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                                {item.mode === "create"
                                  ? "✨ 새로운 브릭"
                                  : item.mode === "augment"
                                    ? "📈 기존 경험 보강"
                                    : "🔗 기존 브릭 연결"}
                              </span>
                              <span className="text-[15px] font-bold text-foreground">
                                {item.title}
                              </span>
                            </div>
                            <p className="text-sm leading-7 text-muted-foreground">
                              {item.content}
                            </p>
                            {item.tags.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {item.tags.map((tag) => (
                                  <span
                                    key={`${item.previewId}-${tag}`}
                                    className="rounded-full bg-secondary/80 px-2 py-1 text-[11px] font-medium text-muted-foreground"
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex flex-col items-center gap-4">
                  <button
                    onClick={() => void handleApply()}
                    disabled={applyStatus === "applying"}
                    className="inline-flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-foreground px-8 text-sm font-bold text-background shadow-md transition-all hover:bg-foreground/90 disabled:opacity-50"
                  >
                    {applyStatus === "applying" ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Sparkles className="h-5 w-5" />
                    )}
                    내 브릭으로 모두 저장하기
                  </button>
                  <button
                    onClick={handleSkip}
                    disabled={applyStatus === "applying"}
                    className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
                  >
                    이번엔 저장하지 않고 건너뛰기
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            {applyStatus === "done" || previewStatus === "empty" || applyStatus === "idle" && previewStatus !== "ready" && previewStatus !== "loading" ? (
              <>
                {(applyStatus === "done" || previewStatus === "empty") && (
                  <Link
                    href="/resume/bricks"
                    className="inline-flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-foreground px-8 text-sm font-bold text-background shadow-md transition-all hover:bg-foreground/90"
                  >
                    <PenSquare className="h-4 w-4" />
                    내 브릭 지갑 보러가기
                  </Link>
                )}
                <Link
                  href="/resume/applications"
                  className={`inline-flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-full border px-8 text-sm font-semibold transition-all ${
                     applyStatus === "done" || previewStatus === "empty"
                      ? "border-border bg-background text-foreground hover:bg-secondary"
                      : "border-transparent bg-foreground text-background shadow-md hover:bg-foreground/90"
                  }`}
                >
                  <FileStack className="h-4 w-4" />
                  지원서 목록으로
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
