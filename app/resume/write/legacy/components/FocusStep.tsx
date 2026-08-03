"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, Check, Loader2, Sparkles, X } from "lucide-react";
import {
  buildResumeBriefContext,
  useResumeWriteStore,
} from "@/stores/useResumeWriteStore";
import DraftQuestionStrip from "@/app/resume/write/legacy/components/DraftQuestionStrip";
import DraftHub from "@/app/resume/write/legacy/components/DraftHub";
import DraftEditor from "@/app/resume/write/legacy/components/DraftEditor";
import InlineBrickCaptureReview, {
  type InlineBrickCaptureItem,
} from "@/app/resume/write/legacy/components/InlineBrickCaptureReview";
import ResumeTutorialTour from "@/app/resume/write/legacy/components/ResumeTutorialTour";
import {
  InlineBrickCaptureError,
  applyInlineBrickCapture,
  buildInlineBrickCapturePrompt,
  previewInlineBrickCapture,
  toInlineBrickCaptureRecentMessages,
} from "@/app/resume/write/legacy/components/inlineBrickCaptureApi";
import { logBrowserDevEvent, previewText } from "@/lib/debug/browserDevLogger";

type AnswerSearchItem = {
  id: string;
  questionText: string;
  answer: string;
  score: number;
  application: {
    id: string;
    companyName: string;
    jobTitle: string;
  };
};

type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type AiPreview = {
  prompt: string;
  mode: "generate" | "revise";
  originalText: string;
  revisedText: string;
};

export type PreviewTab = "compare" | "revised" | "original";

const LONGER_REQUEST_PATTERN =
  /길게|더 길|자세히|구체적|풍부|확장|보강|분량|늘려|더 써|longer|expand|elaborate/i;

function hasQuestionInProgress(question: {
  answer: string;
  aiAdvice?: string;
  relatedBricks: { id: string }[];
  draftStatus?: "idle" | "generating" | "ready" | "error";
  isCompleted: boolean;
}) {
  return (
    !question.isCompleted &&
    (question.answer.trim().length > 0 ||
      (question.aiAdvice ?? "").trim().length > 0 ||
      question.relatedBricks.length > 0 ||
      question.draftStatus === "generating" ||
      question.draftStatus === "ready")
  );
}

function getNextFocusIndexAfterCompletion(
  questions: Array<{
    answer: string;
    aiAdvice?: string;
    relatedBricks: { id: string }[];
    draftStatus?: "idle" | "generating" | "ready" | "error";
    isCompleted: boolean;
  }>,
  currentIndex: number,
) {
  const nextIncompleteIndex = questions.findIndex(
    (question, index) => index > currentIndex && !question.isCompleted,
  );
  if (nextIncompleteIndex >= 0) return nextIncompleteIndex;

  const firstInProgressIndex = questions.findIndex(hasQuestionInProgress);
  if (firstInProgressIndex >= 0) return firstInProgressIndex;

  return questions.findIndex((question) => !question.isCompleted);
}

function splitSegments(text: string) {
  return text
    .split(/(?<=[.!?。！？\n])|(?<=다\.)|(?<=요\.)/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function buildHighlightedSegments(source: string, counterpart: string) {
  const sourceSegments = splitSegments(source);
  const counterpartSet = new Set(splitSegments(counterpart));

  return sourceSegments.length > 0
    ? sourceSegments.map((segment, index) => ({
        id: `${index}-${segment.slice(0, 16)}`,
        text: segment,
        changed: !counterpartSet.has(segment),
      }))
    : [{ id: "empty", text: source, changed: false }];
}

function createIntroMessage(questionIndex: number): AiChatMessage {
  return {
    id: `assistant-intro-${questionIndex}`,
    role: "assistant",
    text: "답변을 읽으면서 톤 수정, 논리 보강, 분량 확장, 새 경험 반영처럼 원하는 작업을 적어주세요. 요청에 맞는 수정안을 먼저 만들고, 실제 교체 여부만 마지막에 물어볼게요.",
  };
}

export default function FocusStep({
  isTutorial = false,
  onBack,
}: {
  isTutorial?: boolean;
  onBack: () => void;
}) {
  const store = useResumeWriteStore();
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const fetchedQuestionIdsRef = useRef<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isAiWorking, setIsAiWorking] = useState(false);
  const [isSavingBricks, setIsSavingBricks] = useState(false);
  const [isCapturingExperience, setIsCapturingExperience] = useState(false);
  const [isApplyingCapture, setIsApplyingCapture] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompletingApplication, setIsCompletingApplication] = useState(false);
  const [isBrickPickerOpen, setIsBrickPickerOpen] = useState(false);
  const [isCaptureReviewOpen, setIsCaptureReviewOpen] = useState(false);
  const [captureItems, setCaptureItems] = useState<InlineBrickCaptureItem[]>([]);
  const [captureSummary, setCaptureSummary] = useState<string | null>(null);
  const [showTour, setShowTour] = useState(isTutorial);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(true);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistoryByQuestion, setChatHistoryByQuestion] = useState<
    Record<string, AiChatMessage[]>
  >({});
  const [loadedChatQuestionIds, setLoadedChatQuestionIds] = useState<
    Record<string, boolean>
  >({});
  const [loadingChatQuestionIds, setLoadingChatQuestionIds] = useState<
    Record<string, boolean>
  >({});
  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("compare");
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const completedCount = useMemo(
    () => store.questions.filter((question) => question.isCompleted).length,
    [store.questions],
  );
  const activeIndex = Math.min(
    store.focusIndex,
    Math.max(store.questions.length - 1, 0),
  );
  const activeQuestion = store.questions[activeIndex];
  const activeQuestionId = activeQuestion?.id ?? null;
  const activeChatMessages = activeQuestionId
    ? (chatHistoryByQuestion[activeQuestionId] ?? [])
    : [];
  const selectedBricks = activeQuestion
    ? activeQuestion.relatedBricks.filter((brick) => brick.isSelected)
    : [];
  const briefContext = buildResumeBriefContext(store.targetInfo.brief);
  const canMovePrev = activeIndex > 0;
  const canMoveNext = activeIndex < store.questions.length - 1;
  const allCompleted =
    store.questions.length > 0 &&
    store.questions.every((question) => question.isCompleted);
  const canCaptureExperience =
    !isTutorial &&
    Boolean(store.appId) &&
    Boolean(
      activeQuestion?.answer.trim() ||
        activeChatMessages.some(
          (message) => message.role === "user" && message.text.trim(),
        ),
    );

  useEffect(() => {
    setChatInput("");
    setIsBrickPickerOpen(false);
    setIsCaptureReviewOpen(false);
    setCaptureItems([]);
    setCaptureSummary(null);
    setAiPreview(null);
    setPreviewTab("compare");
  }, [activeIndex, activeQuestionId]);

  useEffect(() => {
    fetchedQuestionIdsRef.current.clear();
    setChatHistoryByQuestion({});
    setLoadedChatQuestionIds({});
    setLoadingChatQuestionIds({});
  }, [store.appId]);

  useEffect(() => {
    if (aiPreview) {
      setIsAiPanelOpen(false);
    }
  }, [aiPreview]);

  useEffect(() => {
    if (!activeQuestionId) return;
    if (isTutorial) return;
    if (fetchedQuestionIdsRef.current.has(activeQuestionId)) {
      return;
    }

    fetchedQuestionIdsRef.current.add(activeQuestionId);

    const loadChatHistory = async () => {
      setLoadingChatQuestionIds((current) => ({
        ...current,
        [activeQuestionId]: true,
      }));

      try {
        const res = await fetch(
          `/api/resume/questions/${activeQuestionId}/ai-chat`,
        );
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(
            json?.message ??
              json?.error ??
              "AI 대화 내역을 불러오지 못했습니다.",
          );
        }

        const items = Array.isArray(json.items) ? json.items : [];
        setChatHistoryByQuestion((current) => ({
          ...current,
          [activeQuestionId]: (() => {
            const serverMessages = items.map((item: any) => ({
              id: item.id,
              role: item.role === "USER" ? "user" : "assistant",
              text: item.content,
            }));
            const existingMessages = current[activeQuestionId] ?? [];
            if (existingMessages.length === 0) {
              return serverMessages;
            }

            const seen = new Set(
              serverMessages.map(
                (message: AiChatMessage) => `${message.role}:${message.text}`,
              ),
            );

            return [
              ...serverMessages,
              ...existingMessages.filter((message: AiChatMessage) => {
                const key = `${message.role}:${message.text}`;
                if (seen.has(key)) {
                  return false;
                }
                seen.add(key);
                return true;
              }),
            ];
          })(),
        }));
      } catch (loadError) {
        console.error(loadError);
      } finally {
        setLoadingChatQuestionIds((current) => ({
          ...current,
          [activeQuestionId]: false,
        }));
        setLoadedChatQuestionIds((current) => ({
          ...current,
          [activeQuestionId]: true,
        }));
      }
    };

    void loadChatHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuestionId, isTutorial]);

  const chatMessages = activeQuestionId
    ? [
        createIntroMessage(activeIndex),
        ...(chatHistoryByQuestion[activeQuestionId] ?? []),
      ]
    : [];
  const isChatLoading = activeQuestionId
    ? Boolean(loadingChatQuestionIds[activeQuestionId])
    : false;
  const originalSegments = useMemo(
    () =>
      aiPreview
        ? buildHighlightedSegments(
            aiPreview.originalText,
            aiPreview.revisedText,
          )
        : [],
    [aiPreview],
  );
  const revisedSegments = useMemo(
    () =>
      aiPreview
        ? buildHighlightedSegments(
            aiPreview.revisedText,
            aiPreview.originalText,
          )
        : [],
    [aiPreview],
  );

  useEffect(() => {
    const node = chatScrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [chatMessages, isAiWorking]);

  const appendChatMessages = (messages: AiChatMessage[]) => {
    if (!activeQuestionId || messages.length === 0) return;

    setChatHistoryByQuestion((current) => ({
      ...current,
      [activeQuestionId]: [...(current[activeQuestionId] ?? []), ...messages],
    }));
  };

  const persistQuestionChatMessages = async (
    questionId: string,
    messages: {
      role: "USER" | "ASSISTANT" | "SYSTEM";
      kind: "PROMPT" | "STATUS" | "SUGGESTION" | "APPLY" | "DISCARD";
      content: string;
      meta?: Record<string, unknown>;
    }[],
  ) => {
    if (isTutorial) return;
    if (messages.length === 0) return;

    try {
      const res = await fetch(`/api/resume/questions/${questionId}/ai-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      if (!res.ok) {
        throw new Error("AI 대화 저장에 실패했습니다.");
      }
    } catch (persistError) {
      console.error("Failed to persist question AI messages", persistError);
    }
  };

  const resetSideEffects = () => {
    setError(null);
    setBanner(null);
  };

  const moveQuestion = (nextIndex: number) => {
    resetSideEffects();
    store.setFocusIndex(nextIndex);
  };

  const openQuestionDetail = (index: number) => {
    resetSideEffects();
    store.setFocusIndex(index);
  };

  const handleGenerate = async () => {
    if (isTutorial) return;
    if (!activeQuestion || selectedBricks.length === 0) return;

    setIsGenerating(true);
    setError(null);
    setBanner(null);

    try {
      logBrowserDevEvent("resume", "generate_request", {
        questionId: activeQuestion.id,
        question: previewText(activeQuestion.questionText, 160),
        briefContext: previewText(briefContext),
        charLimit: activeQuestion.charLimit,
        bricks: selectedBricks.map((brick) => ({
          id: brick.id,
          title: previewText(brick.title, 80),
          content: previewText(brick.content, 120),
        })),
      });
      const res = await fetch("/api/resume/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: activeQuestion.questionText,
          bricks: selectedBricks,
          charLimit: activeQuestion.charLimit,
          briefContext: buildResumeBriefContext(store.targetInfo.brief),
          instruction:
            "질문 의도에 맞는 자기소개서 초안을 간결하고 현대적인 톤으로 작성해줘.",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok || !json.text) {
        throw new Error(
          json?.message ?? json?.error ?? "초안 생성에 실패했습니다.",
        );
      }

      logBrowserDevEvent("resume", "generate_response", {
        questionId: activeQuestion.id,
        textPreview: previewText(json.text),
        textLength: json.text.length,
      });

      store.updateLocalQuestion(activeIndex, {
        answer: json.text,
        isCompleted: false,
      });
      await store.saveAnswer(
        activeQuestion.id,
        json.text,
        activeQuestion.relatedBricks,
        false,
      );
      setBanner("현재 문항 초안을 다시 생성했습니다.");
    } catch (generateError: any) {
      setError(generateError?.message ?? "초안 생성에 실패했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async (markComplete: boolean) => {
    if (isTutorial) return;
    if (!activeQuestion) return;

    setIsSaving(true);
    setError(null);
    setBanner(null);

    try {
      const saved = await store.saveAnswer(
        activeQuestion.id,
        activeQuestion.answer,
        activeQuestion.relatedBricks,
        markComplete,
      );

      if (!saved) {
        throw new Error("문항 저장에 실패했습니다.");
      }

      if (markComplete) {
        const nextQuestions = store.questions.map((question, index) =>
          index === activeIndex ? { ...question, isCompleted: true } : question,
        );
        const nextIncompleteIndex = getNextFocusIndexAfterCompletion(
          nextQuestions,
          activeIndex,
        );
        const isAllCompleted = nextQuestions.every(
          (question) => question.isCompleted,
        );

        if (isAllCompleted) {
          setBanner(
            "모든 문항이 완료되었습니다. 이제 지원서를 완료 처리할 수 있습니다.",
          );
        } else if (
          nextIncompleteIndex >= 0 &&
          nextIncompleteIndex !== activeIndex
        ) {
          store.setFocusIndex(nextIncompleteIndex);
          setBanner(
            `문항을 완료 처리했습니다. Q${nextIncompleteIndex + 1}로 이동합니다.`,
          );
        } else {
          setBanner("문항을 완료 처리했습니다.");
        }
      } else {
        setBanner("문항을 저장했습니다.");
      }
    } catch (saveError: any) {
      setError(saveError?.message ?? "문항 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreviewInlineBrickCapture = async (sourcePrompt?: string) => {
    if (isTutorial) return;
    if (!activeQuestion || !store.appId) return;

    const prompt = buildInlineBrickCapturePrompt({
      answer: activeQuestion.answer,
      sourcePrompt,
      messages: activeChatMessages,
    });

    if (!prompt.trim()) {
      setBanner("저장할 경험 후보가 있는 답변이나 AI 대화가 필요합니다.");
      return;
    }

    setIsCapturingExperience(true);
    setError(null);
    setBanner(null);

    try {
      const json = await previewInlineBrickCapture({
        endpoint: `/api/resume/questions/${activeQuestion.id}/ingest-bricks`,
        applicationId: store.appId,
        prompt,
        recentMessages: toInlineBrickCaptureRecentMessages(activeChatMessages),
      });

      if (json.previewCount === 0 || json.items.length === 0) {
        setBanner(json.summary || "새로 저장할 경험 후보를 찾지 못했습니다.");
        return;
      }

      setCaptureItems([...json.items]);
      setCaptureSummary(json.summary);
      setIsCaptureReviewOpen(true);
      setBanner("경험 저장 후보를 찾았습니다. 검토 후 저장하세요.");
    } catch (captureError) {
      setError(
        captureError instanceof InlineBrickCaptureError
          ? captureError.message
          : "경험 저장 후보를 찾지 못했습니다.",
      );
    } finally {
      setIsCapturingExperience(false);
    }
  };

  const handleApplyInlineBrickCapture = async (
    items: readonly InlineBrickCaptureItem[],
  ) => {
    if (isTutorial) return;
    if (!activeQuestion || !store.appId) return;

    setIsApplyingCapture(true);
    setError(null);
    setBanner(null);

    try {
      const json = await applyInlineBrickCapture({
        endpoint: `/api/resume/questions/${activeQuestion.id}/ingest-bricks`,
        applicationId: store.appId,
        items,
      });

      store.updateLocalQuestion(activeIndex, {
        relatedBricks: json.questionBricks,
        isCompleted: false,
      });
      await store.fetchUserBricks();
      setCaptureItems([]);
      setCaptureSummary(null);
      setIsCaptureReviewOpen(false);
      setBanner(json.summary);
    } catch (captureError) {
      setError(
        captureError instanceof InlineBrickCaptureError
          ? captureError.message
          : "경험 브릭 저장에 실패했습니다.",
      );
    } finally {
      setIsApplyingCapture(false);
    }
  };

  const searchPreviousAnswers = async (query: string) => {
    try {
      const res = await fetch("/api/resume/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.message ?? json?.error ?? "검색에 실패했습니다.");
      }
      return (json.items ?? []) as AnswerSearchItem[];
    } catch {
      return [];
    }
  };

  const executeAiAction = async (
    nextPrompt: string,
    mode: "generate" | "revise",
  ) => {
    if (!activeQuestion) return;

    setIsAiWorking(true);
    setError(null);
    setBanner(null);

    try {
      const previousAnswers = await searchPreviousAnswers(
        activeQuestion.questionText.length >= 2
          ? activeQuestion.questionText
          : nextPrompt,
      );
      const previousAnswerContext = previousAnswers
        .slice(0, 3)
        .map(
          (item, index) =>
            `참고 답변 ${index + 1}\n문항: ${item.questionText}\n답변: ${item.answer}`,
        )
        .join("\n\n");

      if (mode === "generate" || !activeQuestion.answer.trim()) {
        if (selectedBricks.length === 0) {
          throw new Error(
            "초안 생성을 위해 먼저 연결된 경험 브릭이 필요합니다.",
          );
        }

        const res = await fetch("/api/resume/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: activeQuestion.questionText,
            bricks: selectedBricks,
            charLimit: activeQuestion.charLimit,
            briefContext: buildResumeBriefContext(store.targetInfo.brief),
            instruction: [
              nextPrompt,
              previousAnswerContext
                ? `아래 예전 답변도 참고하되 현재 문항에 맞게 다시 작성해줘.\n\n${previousAnswerContext}`
                : null,
            ]
              .filter(Boolean)
              .join("\n\n"),
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok || !json.text) {
          throw new Error(
            json?.message ?? json?.error ?? "AI 응답 생성에 실패했습니다.",
          );
        }
        setAiPreview({
          prompt: nextPrompt,
          mode,
          originalText: activeQuestion.answer,
          revisedText: json.text,
        });
        setPreviewTab("compare");
        appendChatMessages([
          {
            id: `assistant-draft-${Date.now()}`,
            role: "assistant",
            text: "요청을 반영해 초안을 새로 생성했습니다. 비교 후 적용 여부를 선택해주세요.",
          },
        ]);
        void persistQuestionChatMessages(activeQuestion.id, [
          {
            role: "ASSISTANT",
            kind: "SUGGESTION",
            content:
              "요청을 반영해 초안을 새로 생성했습니다. 비교 후 적용 여부를 선택해주세요.",
          },
        ]);
      } else {
        logBrowserDevEvent("resume", "polish_request", {
          questionId: activeQuestion.id,
          question: previewText(activeQuestion.questionText, 160),
          answerPreview: previewText(activeQuestion.answer),
          answerLength: activeQuestion.answer.length,
          briefContext: previewText(briefContext),
          bricks: selectedBricks.map((brick) => ({
            id: brick.id,
            title: previewText(brick.title, 80),
            content: previewText(brick.content, 120),
          })),
        });
        const polishRes = await fetch("/api/resume/polish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: activeQuestion.id,
            text: activeQuestion.answer,
            question: activeQuestion.questionText,
            briefContext,
            bricks: selectedBricks,
          }),
        });
        const polishJson = await polishRes.json();
        if (!polishRes.ok || !polishJson.ok) {
          throw new Error(
            polishJson?.message ??
              polishJson?.error ??
              "첨삭 분석에 실패했습니다.",
          );
        }

        logBrowserDevEvent("resume", "polish_response", {
          questionId: activeQuestion.id,
          notesCount: Array.isArray(polishJson.notes) ? polishJson.notes.length : 0,
          notesPreview: Array.isArray(polishJson.notes)
            ? polishJson.notes.slice(0, 5).map((note: any) => ({
                quote: previewText(note?.quote, 80),
                note: previewText(note?.note, 120),
                type: note?.type,
              }))
            : [],
        });

        const repolishInstruction = [
          nextPrompt,
          LONGER_REQUEST_PATTERN.test(nextPrompt)
            ? `중요: 현재 답변(${activeQuestion.answer.length}자)보다 분량을 확실히 늘려 써줘. 가능하면 ${Math.min(
                activeQuestion.charLimit,
                Math.max(
                  activeQuestion.answer.length + 120,
                  Math.floor(activeQuestion.charLimit * 0.8),
                ),
              )}자 이상으로 확장하되 ${activeQuestion.charLimit}자를 넘기지 마.`
            : null,
          previousAnswerContext
            ? `필요하면 아래 예전 답변의 강점도 참고해 현재 문항에 맞게 반영해줘.\n\n${previousAnswerContext}`
            : null,
        ]
          .filter(Boolean)
          .join("\n\n");

        logBrowserDevEvent("resume", "repolish_request", {
          questionId: activeQuestion.id,
          question: previewText(activeQuestion.questionText, 160),
          briefContext: previewText(briefContext),
          charLimit: activeQuestion.charLimit,
          userInstruction: previewText(repolishInstruction),
          selectedNotes: Array.isArray(polishJson.notes)
            ? polishJson.notes.slice(0, 5).map((note: any) => ({
                quote: previewText(note?.quote, 80),
                note: previewText(note?.note, 120),
                type: note?.type,
              }))
            : [],
          bricks: selectedBricks.map((brick) => ({
            id: brick.id,
            title: previewText(brick.title, 80),
          })),
        });

        const repolishRes = await fetch("/api/resume/repolish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: activeQuestion.id,
            originalText: activeQuestion.answer,
            question: activeQuestion.questionText,
            bricks: selectedBricks,
            briefContext,
            selectedNotes: polishJson.notes ?? [],
            userInstruction: repolishInstruction,
            charLimit: activeQuestion.charLimit,
          }),
        });
        const repolishJson = await repolishRes.json();
        if (!repolishRes.ok || !repolishJson.ok || !repolishJson.text) {
          throw new Error(
            repolishJson?.message ??
              repolishJson?.error ??
              "답변 다듬기에 실패했습니다.",
          );
        }
        logBrowserDevEvent("resume", "repolish_response", {
          questionId: activeQuestion.id,
          revisedTextPreview: previewText(repolishJson.text),
          revisedTextLength: repolishJson.text.length,
        });
        setAiPreview({
          prompt: nextPrompt,
          mode,
          originalText: activeQuestion.answer,
          revisedText: repolishJson.text,
        });
        setPreviewTab("compare");
        appendChatMessages([
          {
            id: `assistant-rewrite-${Date.now()}`,
            role: "assistant",
            text: "요청을 반영한 수정안을 만들었습니다. 비교 후 적용 여부를 선택해주세요.",
          },
        ]);
        void persistQuestionChatMessages(activeQuestion.id, [
          {
            role: "ASSISTANT",
            kind: "SUGGESTION",
            content:
              "요청을 반영한 수정안을 만들었습니다. 비교 후 적용 여부를 선택해주세요.",
          },
        ]);
      }
      setChatInput("");
      setBanner("AI가 적용 후보 초안을 만들었습니다. 교체 여부를 선택하세요.");
    } catch (chatError: any) {
      setError(chatError?.message ?? "AI 요청 처리에 실패했습니다.");
    } finally {
      setIsAiWorking(false);
    }
  };

  const handleApplyAiPreview = async () => {
    if (isTutorial) return;
    if (!activeQuestion || !aiPreview) return;

    setIsSaving(true);
    setError(null);

    try {
      logBrowserDevEvent("resume", "apply_preview", {
        questionId: activeQuestion.id,
        originalPreview: previewText(aiPreview.originalText),
        revisedPreview: previewText(aiPreview.revisedText),
        revisedLength: aiPreview.revisedText.length,
      });
      store.updateLocalQuestion(activeIndex, {
        answer: aiPreview.revisedText,
        isCompleted: false,
      });
      const saved = await store.saveAnswer(
        activeQuestion.id,
        aiPreview.revisedText,
        activeQuestion.relatedBricks,
        false,
      );

      if (!saved) {
        throw new Error("AI 초안 적용에 실패했습니다.");
      }

      appendChatMessages([
        {
          id: `assistant-apply-${Date.now()}`,
          role: "assistant",
          text: "수정안을 현재 답변에 반영했습니다.",
        },
      ]);
      void persistQuestionChatMessages(activeQuestion.id, [
        {
          role: "ASSISTANT",
          kind: "APPLY",
          content: "수정안을 현재 답변에 반영했습니다.",
        },
      ]);
      setBanner("AI 수정안을 현재 답변에 반영했습니다.");
      setAiPreview(null);
    } catch (applyError: any) {
      setError(applyError?.message ?? "AI 초안 적용에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardAiPreview = () => {
    if (isTutorial) return;
    if (!activeQuestion) return;

    appendChatMessages([
      {
        id: `assistant-discard-${Date.now()}`,
        role: "assistant",
        text: "이번 수정안은 적용하지 않았습니다. 다른 방향으로 다시 요청할 수 있습니다.",
      },
    ]);
    void persistQuestionChatMessages(activeQuestion.id, [
      {
        role: "ASSISTANT",
        kind: "DISCARD",
        content:
          "이번 수정안은 적용하지 않았습니다. 다른 방향으로 다시 요청할 수 있습니다.",
      },
    ]);
    setAiPreview(null);
    setBanner("AI 수정안은 적용하지 않았습니다.");
  };

  const handleAiChatSubmit = async (preset?: string) => {
    if (isTutorial) return;
    if (!activeQuestion) return;

    const nextPrompt = (preset ?? chatInput).trim();
    if (!nextPrompt) return;

    const mode: "generate" | "revise" =
      activeQuestion.answer.trim().length > 0 ? "revise" : "generate";

    setError(null);
    setBanner(null);
    appendChatMessages([
      { id: `user-${Date.now()}`, role: "user", text: nextPrompt },
    ]);
    void persistQuestionChatMessages(activeQuestion.id, [
      {
        role: "USER",
        kind: "PROMPT",
        content: nextPrompt,
      },
    ]);
    if (!preset) {
      setChatInput("");
    }

    await executeAiAction(nextPrompt, mode);
  };

  const toggleBrickSelection = async (brickId: string) => {
    if (!activeQuestion) return;

    const existing = activeQuestion.relatedBricks.find(
      (brick) => brick.id === brickId,
    );
    const sourceBrick =
      existing ?? store.userBricks.find((brick) => brick.id === brickId);
    if (!sourceBrick) return;

    const nextRelatedBricks = existing
      ? activeQuestion.relatedBricks.map((brick) =>
          brick.id === brickId
            ? { ...brick, isSelected: !brick.isSelected }
            : brick,
        )
      : [
          ...activeQuestion.relatedBricks,
          {
            ...sourceBrick,
            originalText: sourceBrick.originalText ?? sourceBrick.content,
            isAiSuggested: false,
            isSelected: true,
          },
        ];

    setIsSavingBricks(true);
    setError(null);
    try {
      store.updateLocalQuestion(activeIndex, {
        relatedBricks: nextRelatedBricks,
        isCompleted: false,
      });
      await store.saveAnswer(
        activeQuestion.id,
        activeQuestion.answer,
        nextRelatedBricks,
        activeQuestion.isCompleted,
      );
      setBanner("현재 문항에 연결된 경험 브릭을 업데이트했습니다.");
    } catch (brickError: any) {
      setError(brickError?.message ?? "경험 브릭 변경에 실패했습니다.");
    } finally {
      setIsSavingBricks(false);
    }
  };

  const handleCompleteApplication = async () => {
    if (isTutorial) return;
    setIsCompletingApplication(true);
    setError(null);
    try {
      const success = await store.completeApplication();
      if (!success) {
        throw new Error(store.error ?? "지원서 완료 처리에 실패했습니다.");
      }
    } catch (completeError: any) {
      setError(completeError?.message ?? "지원서 완료 처리에 실패했습니다.");
    } finally {
      setIsCompletingApplication(false);
    }
  };

  if (!activeQuestion) {
    return null;
  }

  return (
    <div className="px-4 py-3 md:px-6 md:py-4">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-4 flex flex-col gap-2 border-b border-border pb-3">
          <div className="flex items-start gap-3 w-full">
            <div className="flex items-center gap-2 mt-0.5">
              <button
                onClick={onBack}
                className="rounded-full border border-border bg-background p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <ArrowLeft size={16} />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1">
                {store.targetInfo.company && store.targetInfo.job ? (
                  <>
                    <span>{store.targetInfo.company}</span>
                    <span className="text-border mx-1">/</span>
                    <span>{store.targetInfo.job}</span>
                  </>
                ) : (
                  <span>새 지원서 작성</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                  Q{activeIndex + 1}
                </span>
                <span className="text-sm font-semibold text-foreground line-clamp-1">
                  {activeQuestion.questionText}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {selectedBricks.length > 0 ? (
                  selectedBricks.map((brick) => (
                    <span
                      key={brick.id}
                      className="rounded-md border border-primary/15 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary"
                    >
                      {brick.title}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    연결된 경험 브릭 없음
                  </span>
                )}
                <button
                  data-tour-id="tour-brick-change"
                  onClick={() => setIsBrickPickerOpen(true)}
                  disabled={isTutorial}
                  className="ml-1 inline-flex h-5 items-center rounded-md border border-border bg-background px-2 text-[10px] font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  브릭 변경
                </button>{" "}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile: Horizontal Question Tabs */}
        <div data-tour-id="tour-question-list-mobile" className="md:hidden mb-4 -mx-4 px-4 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2">
            {store.questions.map((question, index) => {
              const isActive = index === activeIndex;
              const isDone = question.isCompleted;
              return (
                <button
                  key={question.id}
                  onClick={() => openQuestionDetail(index)}
                  className={clsx(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all",
                    isActive
                      ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                      : isDone
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                        : "border-border bg-background text-muted-foreground"
                  )}
                >
                  <span
                    className={clsx(
                      "h-2 w-2 rounded-full",
                      isDone
                        ? "bg-emerald-500"
                        : question.answer.trim()
                          ? "bg-blue-500"
                          : "bg-muted-foreground/30"
                    )}
                  />
                  Q{index + 1}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
          {/* Sidebar */}
          <div data-tour-id="tour-question-list" className="w-full xl:sticky xl:top-20 xl:max-h-[calc(100vh-100px)] xl:overflow-y-auto hidden md:block">
            <div className="rounded-[24px] border border-border/60 bg-card p-4 shadow-sm ring-1 ring-border/5">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary px-1">
                문항 목록
              </div>
              <div className="flex flex-col gap-2">
                {store.questions.map((question, index) => {
                  const isActive = index === activeIndex;
                  const statusLabel =
                    question.draftStatus === "generating"
                      ? "대기"
                      : question.isCompleted
                        ? "완료"
                        : question.answer.trim()
                          ? "작성중"
                          : "대기";
                  return (
                    <button
                      key={question.id}
                      onClick={() => {
                        if (question.draftStatus === "generating") return;
                        openQuestionDetail(index);
                      }}
                      disabled={question.draftStatus === "generating"}
                      className={clsx(
                        "flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-all",
                        isActive
                          ? "border-primary/40 bg-primary/5 shadow-sm ring-1 ring-primary/20"
                          : "border-border/60 bg-background hover:border-primary/30",
                        question.draftStatus === "generating" &&
                          "cursor-wait opacity-60",
                      )}
                    >
                      <span
                        className={clsx(
                          "text-sm font-semibold truncate",
                          isActive ? "text-primary" : "text-foreground",
                        )}
                      >
                        Q{index + 1}. {question.questionText}
                      </span>
                      <span
                        className={clsx(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                          question.draftStatus === "generating"
                            ? "bg-amber-500/10 text-amber-700"
                            : question.isCompleted
                              ? "bg-emerald-500/10 text-emerald-600"
                              : question.answer.trim()
                                ? "bg-blue-500/10 text-blue-600"
                                : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {statusLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 border-t border-border/60 pt-4">
                <button
                  onClick={() => void handleCompleteApplication()}
                  disabled={isTutorial || !allCompleted || isCompletingApplication}
                  className={clsx(
                    "w-full inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all",
                    allCompleted
                      ? "bg-foreground text-background hover:bg-foreground/90 shadow-sm"
                      : "bg-secondary text-muted-foreground cursor-not-allowed",
                  )}
                >
                  {isCompletingApplication ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  전체 완료 처리
                </button>
              </div>
            </div>
          </div>

          {/* Main Editor Area */}
          <div className="min-w-0">
            <DraftEditor
              activeIndex={activeIndex}
              activeQuestion={activeQuestion}
              selectedBricks={selectedBricks}
              canMovePrev={canMovePrev}
              canMoveNext={canMoveNext}
              chatMessages={chatMessages}
              chatInput={chatInput}
              isChatLoading={isChatLoading}
              isAiWorking={isAiWorking}
              isGenerating={isGenerating}
              isSaving={isSaving}
              isCapturingExperience={isCapturingExperience}
              isCompletingApplication={isCompletingApplication}
              allCompleted={allCompleted}
              readOnly={isTutorial}
              canCaptureExperience={canCaptureExperience}
              banner={banner}
              error={error}
              aiPreview={aiPreview}
              previewTab={previewTab}
              originalSegments={originalSegments}
              revisedSegments={revisedSegments}
              chatScrollRef={chatScrollRef}
              isAiPanelOpen={isAiPanelOpen}
              onToggleAiPanel={() => setIsAiPanelOpen((prev) => !prev)}
              isAiChatOpen={isAiChatOpen}
              onSetAiChatOpen={setIsAiChatOpen}
              onBackToList={() => {}}
              onMoveQuestion={moveQuestion}
              onChangeAnswer={(value) =>
                !isTutorial &&
                store.updateLocalQuestion(activeIndex, {
                  answer: value,
                  isCompleted: false,
                })
              }
              onCaptureExperience={() => void handlePreviewInlineBrickCapture()}
              onGenerate={() => void handleGenerate()}
              onSave={(markComplete) => void handleSave(markComplete)}
              onCompleteApplication={() => void handleCompleteApplication()}
              onOpenBrickPicker={() => setIsBrickPickerOpen(true)}
              onChatSubmit={(preset) => void handleAiChatSubmit(preset)}
              onChangeChatInput={setChatInput}
              onApplyAiPreview={() => void handleApplyAiPreview()}
              onDiscardAiPreview={handleDiscardAiPreview}
              onChangePreviewTab={setPreviewTab}
            />
          </div>
        </div>{" "}
        {isBrickPickerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-[24px] border border-border bg-card shadow-2xl">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    경험 브릭 변경
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    현재 문항에 사용할 경험을 선택하거나 해제하세요.
                  </p>
                </div>
                <button
                  onClick={() => setIsBrickPickerOpen(false)}
                  className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[60vh] overflow-auto p-4">
                <div className="grid gap-2">
                  {[...store.userBricks]
                    .sort((a, b) => {
                      const aSelected = activeQuestion.relatedBricks.some(
                        (item) => item.id === a.id && item.isSelected,
                      );
                      const bSelected = activeQuestion.relatedBricks.some(
                        (item) => item.id === b.id && item.isSelected,
                      );
                      const aSuggested = a.isAiSuggested;
                      const bSuggested = b.isAiSuggested;
                      // Selected first, then AI suggested, then alphabetical
                      if (aSelected !== bSelected) return bSelected ? 1 : -1;
                      if (aSuggested !== bSuggested) return bSuggested ? 1 : -1;
                      return a.title.localeCompare(b.title);
                    })
                    .map((brick) => {
                      const isSelected = activeQuestion.relatedBricks.some(
                        (item) => item.id === brick.id && item.isSelected,
                      );
                      const isAiSuggested = brick.isAiSuggested;
                      return (
                        <button
                          key={brick.id}
                          onClick={() => void toggleBrickSelection(brick.id)}
                          className={clsx(
                            "rounded-[14px] border px-3 py-3 text-left transition-all",
                            isSelected
                              ? "border-primary/30 bg-primary/[0.05]"
                              : "border-border bg-background hover:border-primary/20",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold text-foreground">
                                  {brick.title}
                                </div>
                                {isAiSuggested && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-600">
                                    <Sparkles className="h-3 w-3" />
                                    AI 추천
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs leading-6 text-muted-foreground">
                                {brick.content}
                              </p>
                            </div>
                            <span
                              className={clsx(
                                "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                                isSelected
                                  ? "border-primary bg-primary text-background"
                                  : "border-border bg-background text-transparent",
                              )}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  {store.userBricks.length === 0 && (
                    <div className="rounded-[14px] border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                      저장된 경험 브릭이 없습니다.
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border px-5 py-4">
                <div className="text-xs text-muted-foreground">
                  {isSavingBricks
                    ? "변경사항 저장 중"
                    : "선택 즉시 현재 문항에 반영됩니다."}
                </div>
                <button
                  onClick={() => setIsBrickPickerOpen(false)}
                  className="inline-flex h-10 items-center rounded-full bg-foreground px-4 text-xs font-bold text-background"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}

        <InlineBrickCaptureReview
          isOpen={isCaptureReviewOpen}
          summary={captureSummary}
          items={captureItems}
          isApplying={isApplyingCapture}
          onClose={() => setIsCaptureReviewOpen(false)}
          onApply={(items) => void handleApplyInlineBrickCapture(items)}
        />

        {showTour && (
          <ResumeTutorialTour
            onClose={() => setShowTour(false)}
            onOpenAiChat={() => setIsAiChatOpen(true)}
            onCloseAiChat={() => setIsAiChatOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
