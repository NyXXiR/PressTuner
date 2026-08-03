"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Wand2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  buildResumeBriefContext,
  useResumeWriteStore,
} from "@/stores/useResumeWriteStore";
import { createTutorialQuestions } from "@/lib/resumeTutorialSample";
import { AppModalFrame } from "@/components/ui/AppModalFrame";
import { DateInput } from "@/components/ui/DateInput";

function serializeQuestions(
  questions: Array<{ questionText: string; charLimit: number }>,
) {
  return questions
    .filter((question) => question.questionText.trim())
    .map(
      (question) =>
        `${question.questionText.trim()}${question.charLimit ? ` (${question.charLimit}자)` : ""}`,
    )
    .join("\n\n");
}

function parseBulkQuestions(raw: string) {
  const text = raw.trim();
  if (!text) return [];

  const blocks = text
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  const sourceBlocks =
    blocks.length > 1
      ? blocks
      : text
          .split(/\n(?=(?:Q\d+\.?|[0-9]+[.)]|[-*•])\s*)/g)
          .map((block) => block.trim())
          .filter(Boolean);

  return sourceBlocks
    .map((block) => {
      const charLimitMatch = block.match(/(\d{2,5})\s*자/);
      const charLimit = charLimitMatch ? Number(charLimitMatch[1]) : 700;
      const questionText = block
        .replace(/^(?:Q\d+\.?|[0-9]+[.)]|[-*•])\s*/i, "")
        .replace(/\(?\s*\d{2,5}\s*자\s*\)?/g, "")
        .trim();

      if (!questionText) return null;

      return {
        questionText,
        charLimit,
      };
    })
    .filter((question): question is { questionText: string; charLimit: number } => Boolean(question));
}

export default function StrategyStep({
  isTutorial = false,
  isModal = false,
  onBack,
}: {
  isTutorial?: boolean;
  isModal?: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  const router = useRouter();
  const store = useResumeWriteStore();
  const [questionSourceText, setQuestionSourceText] = useState(
    serializeQuestions(store.questions),
  );
  const [entrySnapshot, setEntrySnapshot] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);
  const [isOrganizingQuestions, setIsOrganizingQuestions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readyQuestions = store.questions.filter((question) => question.questionText.trim());
  const completedDrafts = store.questions.filter((question) => question.answer.trim()).length;
  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        company: store.targetInfo.company,
        job: store.targetInfo.job,
        brief: store.targetInfo.brief,
        questions: store.questions.map((question) => ({
          id: question.id,
          questionText: question.questionText,
          charLimit: question.charLimit,
        })),
      }),
    [store.questions, store.targetInfo],
  );
  const isDirty = !isTutorial && entrySnapshot.length > 0 && entrySnapshot !== currentSnapshot;

  useEffect(() => {
    setQuestionSourceText(serializeQuestions(store.questions));
  }, [store.questions]);

  useEffect(() => {
    setEntrySnapshot(
      JSON.stringify({
        company: store.targetInfo.company,
        job: store.targetInfo.job,
        brief: store.targetInfo.brief,
        questions: store.questions.map((question) => ({
          id: question.id,
          questionText: question.questionText,
          charLimit: question.charLimit,
        })),
      }),
    );
  }, []);

  const replaceQuestions = (value: string) => {
    const parsedQuestions = parseBulkQuestions(value);
    store.invalidateDrafts();
    store.setQuestions(
      parsedQuestions.length > 0
        ? parsedQuestions.map((question, index) => ({
            id: `manual-${Date.now()}-${index}`,
            questionText: question.questionText,
            charLimit: question.charLimit,
            answer: "",
            relatedBricks: [],
            isSaved: false,
            isCompleted: false,
          }))
        : [],
    );
  };

  const handleOrganizeQuestions = async () => {
    if (!questionSourceText.trim()) return;

    setError(null);
    setIsOrganizingQuestions(true);

    try {
      const res = await fetch("/api/resume/intake/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: questionSourceText }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.message ?? json?.error ?? "문항 정리에 실패했습니다.");
      }

      const questions = Array.isArray(json.questions) ? json.questions : [];
      if (questions.length === 0) {
        throw new Error("문항을 찾지 못했습니다. 원문을 조금 더 구체적으로 넣어주세요.");
      }

      replaceQuestions(
        questions
          .map((question: { questionText: string; charLimit: number | null }) =>
            `${question.questionText}${question.charLimit ? ` (${question.charLimit}자)` : ""}`,
          )
          .join("\n\n"),
      );
    } catch (organizeError: any) {
      setError(organizeError?.message ?? "문항 정리에 실패했습니다.");
    } finally {
      setIsOrganizingQuestions(false);
    }
  };

  const updateQuestion = (
    index: number,
    patch: { questionText?: string; charLimit?: number },
  ) => {
    store.invalidateDrafts();
    store.updateLocalQuestion(index, patch);
  };

  const addQuestion = () => {
    store.invalidateDrafts();
    store.addQuestion({ questionText: "", charLimit: 700 });
  };

  const handlePrepare = async () => {
    setError(null);

    if (isTutorial) {
      useResumeWriteStore.setState({
        questions: createTutorialQuestions(true),
        step: "DRAFT",
        focusIndex: 0,
      });
      return;
    }

    if (store.userBricks.length === 0) {
      router.push("/resume/bricks?onboarding=true");
      return;
    }

    setIsPreparing(true);

    try {
      const saved = await store.saveDraftApplication();
      if (!saved) {
        throw new Error(store.error ?? "지원서 저장에 실패했습니다.");
      }

      const prepared = await store.generateStrategy();
      if (!prepared) {
        throw new Error(store.error ?? "문항 준비에 실패했습니다.");
      }

      const questions = useResumeWriteStore.getState().questions;

      questions.forEach((question) => {
        useResumeWriteStore.getState().updateQuestionById(question.id, {
          draftStatus: question.relatedBricks.some((brick) => brick.isSelected)
            ? "generating"
            : "idle",
          draftError: null,
        });
      });

      await Promise.all(
        questions.map(async (question, index) => {
          try {
            const selectedBricks = question.relatedBricks.filter((brick) => brick.isSelected);
            if (selectedBricks.length === 0) return;

            const res = await fetch("/api/resume/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                question: question.questionText,
                bricks: selectedBricks,
                charLimit: question.charLimit,
                briefContext: buildResumeBriefContext(store.targetInfo.brief),
                instruction:
                  "질문 의도에 맞는 자기소개서 초안을 간결하고 현대적인 톤으로 작성해줘.",
              }),
            });

            const json = await res.json();
            if (!res.ok || !json.ok || !json.text) {
              throw new Error(json?.message ?? json?.error ?? `Q${index + 1} 초안 생성에 실패했습니다.`);
            }

            useResumeWriteStore.getState().updateQuestionById(question.id, {
              answer: json.text,
              draftStatus: "ready",
              draftError: null,
            });
            await useResumeWriteStore
              .getState()
              .saveAnswer(question.id, json.text, question.relatedBricks, false);
          } catch (draftError) {
            useResumeWriteStore.getState().updateQuestionById(question.id, {
              draftStatus: "error",
              draftError:
                draftError instanceof Error
                  ? draftError.message
                  : `Q${index + 1} 초안 생성에 실패했습니다.`,
            });
            throw draftError;
          }
        }),
      );
    } catch (prepareError: any) {
      setError(prepareError?.message ?? "초안 일괄 생성에 실패했습니다.");
      return;
    } finally {
      setIsPreparing(false);
    }
  };

  return (
    <AppModalFrame modal={isModal}>
        <div className="shrink-0 border-b border-border px-4 py-4 sm:px-5 md:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="mt-1 flex items-center gap-2">
              <button
                onClick={onBack}
                className="rounded-full border border-border bg-background p-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft size={20} />
              </button>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                준비 내용 확인
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                {isTutorial
                  ? "샘플 brief와 문항을 확인한 뒤 초안 화면으로 넘어갑니다."
                  : "AI가 정리한 brief와 문항을 짧게 확인한 뒤 초안을 만듭니다."}
                {isDirty
                  ? " 변경사항이 있어 아래 버튼으로 다시 생성해야 합니다."
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border bg-background px-3 py-1.5">
              문항 {readyQuestions.length}개
            </span>
            <span className="rounded-full border border-border bg-background px-3 py-1.5">
              브릭 {store.userBricks.length}개
            </span>
            {completedDrafts > 0 && (
              <span className="rounded-full border border-border bg-background px-3 py-1.5">
                초안 {completedDrafts}개 있음
              </span>
            )}
          </div>
        </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-28 sm:px-5 md:px-6">
          <section className="rounded-[20px] border border-border bg-background p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Target className="h-4 w-4 text-primary" />
              기본 정보
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="rounded-[16px] border border-border bg-card p-3">
                <div className="text-xs font-bold text-primary">회사명</div>
                <input
                  value={store.targetInfo.company}
                  readOnly={isTutorial}
                  onChange={(event) => {
                    if (isTutorial) return;
                    store.invalidateDrafts();
                    store.setTargetInfo({ company: event.target.value });
                  }}
                  className="mt-2 h-8 w-full bg-transparent text-base font-bold text-foreground outline-none"
                  placeholder="회사명을 입력하세요"
                />
              </label>

              <label className="rounded-[16px] border border-border bg-card p-3">
                <div className="text-xs font-bold text-primary">직무</div>
                <input
                  value={store.targetInfo.job}
                  readOnly={isTutorial}
                  onChange={(event) => {
                    if (isTutorial) return;
                    store.invalidateDrafts();
                    store.setTargetInfo({ job: event.target.value });
                  }}
                  className="mt-2 h-8 w-full bg-transparent text-base font-bold text-foreground outline-none"
                  placeholder="직무를 입력하세요"
                />
              </label>

              <DateInput
                label="마감일"
                className="sm:col-span-2"
                value={store.targetInfo.brief.deadline ?? ""}
                readOnly={isTutorial}
                disabled={isTutorial}
                onChange={(value) => {
                  if (isTutorial) return;
                  store.invalidateDrafts();
                  store.setTargetInfo({
                    brief: { deadline: value || null },
                  });
                }}
              />

              <label className="rounded-[16px] border border-border bg-card p-3 sm:col-span-2">
                <div className="flex items-center gap-2 text-xs font-bold text-primary">
                  <FileText className="h-4 w-4" />
                  AI 요약
                </div>
                <textarea
                  value={store.targetInfo.brief.summary}
                  readOnly={isTutorial}
                  onChange={(event) => {
                    if (isTutorial) return;
                    store.invalidateDrafts();
                    store.setTargetInfo({
                      brief: { summary: event.target.value },
                    });
                  }}
                  className="mt-2 h-24 w-full resize-none bg-transparent text-sm leading-6 text-foreground outline-none"
                  placeholder="공고 핵심 요약을 입력하세요"
                />
              </label>
            </div>

            <details className="mt-3 rounded-[16px] border border-dashed border-border bg-card/70 p-3">
              <summary className="cursor-pointer text-sm font-bold text-foreground">
                AI가 참고할 내용
              </summary>
              <div className="mt-3 grid gap-3 text-sm text-foreground sm:grid-cols-2">
                <div>
                  <span className="font-semibold">고용형태</span>
                  <p className="mt-1 text-muted-foreground">
                    {store.targetInfo.brief.employmentType || "찾지 못했습니다."}
                  </p>
                </div>
                <div>
                  <span className="font-semibold">근무지</span>
                  <p className="mt-1 text-muted-foreground">
                    {store.targetInfo.brief.location || "찾지 못했습니다."}
                  </p>
                </div>
                <div>
                  <span className="font-semibold">핵심 신호</span>
                  <p className="mt-1 text-muted-foreground">
                    {store.targetInfo.brief.keySignals.length > 0
                      ? store.targetInfo.brief.keySignals.join(", ")
                      : "아직 구조화되지 않았습니다."}
                  </p>
                </div>
                <div>
                  <span className="font-semibold">작성 가이드</span>
                  <p className="mt-1 text-muted-foreground">
                    {store.targetInfo.brief.writingGuidance.length > 0
                      ? store.targetInfo.brief.writingGuidance.join(", ")
                      : "아직 구조화되지 않았습니다."}
                  </p>
                </div>
              </div>
            </details>

            {store.userBricks.length === 0 ? (
              <div className="mt-3 rounded-[16px] border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="text-sm font-semibold text-foreground">
                  초안을 만들기 전에 경험 브릭이 필요합니다.
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  PDF 업로드로 브릭을 저장하거나 기존 브릭 관리 화면에서 재료를 먼저 채워주세요.
                </p>
                <Link
                  href="/resume/bricks?onboarding=true"
                  className="mt-3 inline-flex h-10 items-center rounded-full bg-foreground px-4 text-sm font-bold text-background"
                >
                  경험 브릭 만들기
                </Link>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2 rounded-[16px] border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3 text-sm font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                브릭 {store.userBricks.length}개 준비 완료
              </div>
            )}
          </section>

          <section className="rounded-[20px] border border-border bg-background p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground">문항 확인</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  필요한 문항만 남기고 초안 생성을 시작합니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={addQuestion}
                  disabled={isTutorial}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                  문항 추가
                </button>
                <button
                  onClick={() => void handleOrganizeQuestions()}
                  disabled={isTutorial || isOrganizingQuestions || !questionSourceText.trim()}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground disabled:opacity-40"
                >
                  {isOrganizingQuestions ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  AI 문항 정리
                </button>
              </div>
            </div>

            <details className="mt-3 rounded-[16px] border border-border bg-card p-3">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                문항 원문 편집
              </summary>
              <textarea
                value={questionSourceText}
                readOnly={isTutorial}
                onChange={(event) => {
                  if (isTutorial) return;
                  setQuestionSourceText(event.target.value);
                }}
                placeholder={"문항 원문을 한 번에 붙여넣으세요.\n예: 지원 동기를 작성해 주세요. (700자)\n\n협업 경험을 설명해 주세요. (1000자)"}
                className="mt-3 h-28 w-full resize-none bg-transparent px-1 py-1 text-sm leading-7 text-foreground outline-none placeholder:text-muted-foreground/45"
              />
            </details>

            <div className="mt-3 space-y-2">
              {store.questions.length === 0 ? (
                <div className="rounded-[16px] border border-dashed border-border bg-background p-4 text-sm leading-7 text-muted-foreground">
                  공고에 자기소개서 문항이 명시되어 있지 않으면 비워둡니다. 필요한 문항만 직접
                  추가하거나 붙여넣은 뒤 `AI 문항 정리`를 눌러주세요.
                </div>
              ) : (
                store.questions.map((question, index) => (
                  <div key={question.id} className="rounded-[16px] border border-border/60 bg-card p-3 transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                        Q{index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <input
                          value={question.questionText}
                          readOnly={isTutorial}
                          onChange={(event) =>
                            updateQuestion(index, { questionText: event.target.value })
                          }
                          placeholder="문항 내용을 입력하세요"
                          className="w-full bg-transparent text-sm font-semibold leading-6 text-foreground outline-none"
                        />

                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>글자수</span>
                          <input
                            type="number"
                            min={100}
                            value={question.charLimit}
                            readOnly={isTutorial}
                            disabled={isTutorial}
                            onChange={(event) =>
                              updateQuestion(index, {
                                charLimit: Number(event.target.value) || 700,
                              })
                            }
                            className="h-8 w-20 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
                          />
                          <span>자</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (isTutorial) return;
                          store.invalidateDrafts();
                          store.removeQuestion(index);
                        }}
                        disabled={isTutorial}
                        className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {error && (
              <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}
          </section>
        </div>
        <div className="shrink-0 border-t border-border bg-card/95 px-4 py-3 shadow-[0_-12px_30px_rgba(12,18,28,0.08)] backdrop-blur sm:px-5 md:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-5 text-muted-foreground sm:text-sm">
              {readyQuestions.length > 0
                ? isTutorial
                  ? `문항 ${readyQuestions.length}개 기준으로 샘플 초안을 확인합니다.`
                  : `문항 ${readyQuestions.length}개 기준으로 초안을 생성합니다.`
                : "문항을 최소 1개 이상 준비해야 다음 단계로 갈 수 있습니다."}
            </div>
            <button
              onClick={handlePrepare}
              disabled={
                isPreparing ||
                readyQuestions.length === 0 ||
                !store.targetInfo.company.trim() ||
                !store.targetInfo.job.trim() ||
                store.userBricks.length === 0
              }
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-bold text-background disabled:opacity-40 sm:w-auto"
            >
              {isPreparing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  초안 생성 중
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  {isTutorial ? "샘플 초안 보기" : "초안 만들기"}
                </>
              )}
            </button>
          </div>
        </div>
    </AppModalFrame>
  );
}
