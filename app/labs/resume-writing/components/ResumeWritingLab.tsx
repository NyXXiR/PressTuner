"use client";

import { useEffect, useReducer, useState } from "react";
import { FlaskConical, HardDrive, RotateCcw, X } from "lucide-react";

import {
  RESUME_WRITING_LAB_STORAGE_KEY,
  parseResumeWritingLabState,
  serializeResumeWritingLabState,
} from "@/domain/resume-writing/labPersistence";
import {
  createResumeWritingLabState,
  resumeWritingLabReducer,
  type LabStage,
  type ResumeWritingLabState,
} from "@/domain/resume-writing/labMachine";

import { LabCapture } from "./LabCapture";
import { LabDone } from "./LabDone";
import { LabIntake } from "./LabIntake";
import { LabReview } from "./LabReview";
import { LabWriting } from "./LabWriting";
import type { LabDispatch } from "./labViewTypes";

const STEPS = ["원문 입력", "정리 확인", "작성·첨삭", "경험 추출", "완료"] as const;

const STAGE_INDEX = {
  intake: 0,
  review: 1,
  writing: 2,
  capture: 3,
  done: 4,
} satisfies Record<LabStage, number>;

class UnexpectedLabStageError extends Error {
  constructor(readonly stage: never) {
    super("Unexpected resume writing lab stage");
    this.name = "UnexpectedLabStageError";
  }
}

function renderStage(state: ResumeWritingLabState, dispatch: LabDispatch) {
  const stage = state.stage;
  switch (stage) {
    case "intake":
      return <LabIntake state={state} onAction={dispatch} />;
    case "review":
      return <LabReview state={state} onAction={dispatch} />;
    case "writing":
      return <LabWriting state={state} onAction={dispatch} />;
    case "capture":
      return <LabCapture state={state} onAction={dispatch} />;
    case "done":
      return <LabDone state={state} onAction={dispatch} />;
    default:
      throw new UnexpectedLabStageError(stage);
  }
}

export function ResumeWritingLab() {
  const [state, dispatch] = useReducer(
    resumeWritingLabReducer,
    createResumeWritingLabState(),
  );
  const [hydrated, setHydrated] = useState(false);
  const currentStep = STAGE_INDEX[state.stage];

  useEffect(() => {
    const serialized = window.sessionStorage.getItem(
      RESUME_WRITING_LAB_STORAGE_KEY,
    );
    const restored = serialized
      ? parseResumeWritingLabState(serialized)
      : null;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (restored) dispatch({ type: "restore_session", state: restored });
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.sessionStorage.setItem(
      RESUME_WRITING_LAB_STORAGE_KEY,
      serializeResumeWritingLabState(state),
    );
  }, [hydrated, state]);

  return (
    <div className="theme-resume min-h-dvh bg-background text-foreground selection:bg-primary/30">
      <header className="border-b border-border/70 bg-card/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ai-soft text-ai">
              <FlaskConical className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold sm:text-base">자기소개서 작성 플로우 랩</p>
                <span className="rounded-full bg-ai-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ai">
                  Local
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                로그인·서버 저장 없이 전체 UX 상태만 테스트합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 text-[11px] font-bold text-muted-foreground sm:inline-flex">
              <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
              {hydrated ? "브라우저 자동 저장" : "상태 불러오는 중"}
            </span>
            {state.stage !== "intake" && (
              <button
                type="button"
                onClick={() => dispatch({ type: "reset" })}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">처음부터</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="border-b border-border/70 bg-muted/40">
        <ol className="mx-auto grid w-full max-w-[1180px] grid-cols-5 px-4 sm:px-6" aria-label="작성 진행 단계">
          {STEPS.map((step, index) => (
            <li
              key={step}
              aria-current={index === currentStep ? "step" : undefined}
              className={`border-b-2 px-1 py-3 text-center text-[10px] font-bold sm:text-xs ${
                index <= currentStep
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              <span className="hidden sm:inline">{index + 1}. </span>{step}
            </li>
          ))}
        </ol>
      </div>

      {state.notice && (
        <div className="border-b border-primary/10 bg-primary/5">
          <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-3 px-4 py-2.5 text-xs font-semibold text-primary sm:px-6">
            <p>{state.notice}</p>
            <button
              type="button"
              onClick={() => dispatch({ type: "dismiss_notice" })}
              aria-label="안내 닫기"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-primary/10"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
        {renderStage(state, dispatch)}
      </main>
    </div>
  );
}
