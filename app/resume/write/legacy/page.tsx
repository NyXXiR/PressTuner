"use client";

import { Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useResumeWriteStore,
  type Brick,
  type QuestionState,
  type ResumeWriteStep,
} from "@/stores/useResumeWriteStore";
import type { ResumeStructuredBrief } from "@/lib/services/resume/resumeBrief";
import {
  createEmptyResumeBrief,
} from "@/lib/services/resume/resumeBrief";
import {
  createTutorialQuestions,
  tutorialBricks,
  tutorialTargetInfo,
} from "@/lib/resumeTutorialSample";
import SetupStep from "@/app/resume/write/legacy/components/SetupStep";
import StrategyStep from "@/app/resume/write/legacy/components/StrategyStep";
import FocusStep from "@/app/resume/write/legacy/components/FocusStep";
import CompletionStep from "@/app/resume/write/legacy/components/CompletionStep";

const NEW_DRAFT_STORAGE_KEY = "resume-write-new-draft-v1";
const APP_DRAFT_STORAGE_PREFIX = "resume-write-app-draft-v1:";
const IS_DEV = process.env.NODE_ENV === "development";

type StoredDraft = {
  targetInfo: {
    company: string;
    job: string;
    brief?: ResumeStructuredBrief;
    jd?: string;
  };
  questions: Array<{
    id: string;
    questionText: string;
    charLimit: number;
    answer: string;
    aiAdvice?: string;
    relatedBricks: Brick[];
    isSaved: boolean;
    isCompleted: boolean;
  }>;
  step: "COLLECT" | "PLAN" | "DRAFT" | "COMPLETE";
  focusIndex: number;
};

function getStorageKey(existingId: string | null) {
  return existingId ? `${APP_DRAFT_STORAGE_PREFIX}${existingId}` : NEW_DRAFT_STORAGE_KEY;
}

function parseStoredDraft(raw: string | null): StoredDraft | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed || !Array.isArray(parsed.questions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeStoredTargetInfo(targetInfo: StoredDraft["targetInfo"]) {
  if (targetInfo.brief) {
    return {
      company: targetInfo.company,
      job: targetInfo.job,
      brief: targetInfo.brief,
    };
  }

  return {
    company: targetInfo.company,
    job: targetInfo.job,
    brief: {
      ...createEmptyResumeBrief(),
      summary: targetInfo.jd ?? "",
    },
  };
}

function toStoredQuestions(questions: StoredDraft["questions"]): QuestionState[] {
  return questions.map((question) => ({
    ...question,
    relatedBricks: question.relatedBricks.map((brick) => ({
      id: String(brick.id),
      title: String(brick.title),
      tags: Array.isArray(brick.tags)
        ? brick.tags.map((tag) => String(tag))
        : [],
      content: String(brick.content ?? ""),
      originalText:
        typeof brick.originalText === "string" ? brick.originalText : undefined,
      isAiSuggested:
        typeof brick.isAiSuggested === "boolean" ? brick.isAiSuggested : undefined,
      isSelected:
        typeof brick.isSelected === "boolean" ? brick.isSelected : undefined,
    })),
  }));
}

function DevStepSwitcher({
  step,
  onChange,
}: {
  step: ResumeWriteStep;
  onChange: (step: ResumeWriteStep) => void;
}) {
  if (!IS_DEV) return null;

  const items = [
    { key: "COLLECT", label: "준비" },
    { key: "PLAN", label: "정리 팝업" },
    { key: "DRAFT", label: "작성" },
    { key: "COMPLETE", label: "완료" },
  ] as const;

  return (
    <div className="fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 rounded-2xl border border-amber-300/60 bg-amber-50/95 p-1.5 shadow-xl backdrop-blur dark:border-amber-400/30 dark:bg-amber-950/90">
      <div className="flex items-center gap-1">
        <span className="px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">
          Dev
        </span>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={[
              "h-8 rounded-xl px-3 text-xs font-bold transition-colors",
              step === item.key
                ? "bg-amber-600 text-white shadow-sm"
                : "text-amber-900 hover:bg-amber-200/70 dark:text-amber-100 dark:hover:bg-amber-800/70",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function WriteResumeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const existingId = searchParams.get("id");
  const isTutorial = searchParams.get("tutorial") === "1";
  const [isInitializing, setIsInitializing] = useState(true);

  const {
    step,
    loading,
    targetInfo,
    questions,
    focusIndex,
    fetchUserBricks,
    fetchApplication,
    reset,
    setStep,
    setTargetInfo,
    setQuestions,
    setFocusIndex,
  } = useResumeWriteStore();

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      setIsInitializing(true);

      if (isTutorial) {
        reset();
        useResumeWriteStore.setState({
          appId: null,
          step: "COLLECT",
          targetInfo: tutorialTargetInfo,
          questions: createTutorialQuestions(),
          userBricks: tutorialBricks,
          focusIndex: 0,
          loading: false,
          error: null,
        });
        setIsInitializing(false);
        return;
      }

      if (existingId) {
        await Promise.all([
          fetchUserBricks(),
          fetchApplication(existingId),
        ]);

        if (cancelled) return;

        if (useResumeWriteStore.getState().step !== "COMPLETE") {
          const storedDraft = parseStoredDraft(
            window.sessionStorage.getItem(getStorageKey(existingId)),
          );

          if (storedDraft) {
            setTargetInfo(normalizeStoredTargetInfo(storedDraft.targetInfo));
            setQuestions(toStoredQuestions(storedDraft.questions));
            setStep(storedDraft.step);
            setFocusIndex(storedDraft.focusIndex);
          }
        }

        setIsInitializing(false);
        return;
      }

      reset();
      await fetchUserBricks();

      if (cancelled) return;

      const storedDraft = parseStoredDraft(
        window.sessionStorage.getItem(getStorageKey(null)),
      );

      if (storedDraft) {
        setTargetInfo(normalizeStoredTargetInfo(storedDraft.targetInfo));
        setQuestions(toStoredQuestions(storedDraft.questions));
        setStep(storedDraft.step);
        setFocusIndex(storedDraft.focusIndex);
      }

      setIsInitializing(false);
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [
    existingId,
    fetchApplication,
    fetchUserBricks,
    isTutorial,
    reset,
    setFocusIndex,
    setQuestions,
    setStep,
    setTargetInfo,
  ]);

  useEffect(() => {
    if (isTutorial) return;

    const storageKey = getStorageKey(existingId);
    const payload: StoredDraft = {
      targetInfo,
      questions,
      step,
      focusIndex,
    };

    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
  }, [existingId, focusIndex, isTutorial, questions, step, targetInfo]);

  useEffect(() => {
    if (step === "COMPLETE" && !existingId && !isTutorial) {
      window.sessionStorage.removeItem(getStorageKey(null));
    }
  }, [existingId, isTutorial, step]);

  const handleBack = () => {
    if (step === "COMPLETE") {
      router.push("/resume/applications");
      return;
    }

    if (step === "DRAFT") {
      setStep("PLAN");
      return;
    }

    if (step === "PLAN") {
      setStep("COLLECT");
      return;
    }

    if (isTutorial) {
      router.push("/resume/dashboard");
      return;
    }

    router.push("/resume/applications");
  };

  const handleForward = () => {
    if (step === "COLLECT") {
      setStep("PLAN");
      return;
    }

    if (step === "PLAN") {
      setStep("DRAFT");
    }
  };

  const handleDevStepChange = (nextStep: ResumeWriteStep) => {
    setStep(nextStep);
    if (nextStep === "DRAFT" || nextStep === "COMPLETE") {
      setFocusIndex(0);
    }
  };

  if (isInitializing || (loading && existingId && step !== "DRAFT")) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="pb-24">
      {step === "COLLECT" && (
        <SetupStep
          isTutorial={isTutorial}
          onBack={handleBack}
          onForward={handleForward}
        />
      )}
      {step === "PLAN" && (
        <StrategyStep
          isTutorial={isTutorial}
          onBack={handleBack}
          onForward={handleForward}
        />
      )}
      {step === "DRAFT" && (
        <FocusStep isTutorial={isTutorial} onBack={handleBack} />
      )}
      {step === "COMPLETE" && <CompletionStep />}
      <DevStepSwitcher step={step} onChange={handleDevStepChange} />
    </div>
  );
}

export default function WriteResumePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      }
    >
      <WriteResumeContent />
    </Suspense>
  );
}
