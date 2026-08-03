"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Layers, PenTool } from "lucide-react";
import { useRouter } from "next/navigation";

type TourStep = {
  targetId: string;
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
};

const TOUR_STEPS: TourStep[] = [
  {
    targetId: "tour-brick-change",
    title: "상단 브릭 변경",
    description:
      "문항에 연결된 경험을 바꾸는 곳입니다. 다른 브릭을 선택해 문항과 연결할 수 있습니다.",
    position: "bottom",
  },
  {
    targetId: "tour-question-list",
    title: "문항 목록",
    description: "문항별 상태 확인과 이동을 할 수 있습니다.",
    position: "bottom",
  },
  {
    targetId: "tour-draft-editor",
    title: "초안 작성",
    description: "생성된 답변을 확인하고 직접 수정할 수 있는 곳입니다.",
    position: "top",
  },
  {
    targetId: "tour-ai-chat",
    title: "AI 대화",
    description: "답변을 더 다듬거나 새로운 경험을 반영할 수 있습니다.",
    position: "top",
  },
];

export default function ResumeTutorialTour({
  onClose,
  onOpenAiChat,
  onCloseAiChat,
}: {
  onClose: () => void;
  onOpenAiChat?: () => void;
  onCloseAiChat?: () => void;
}) {
  const router = useRouter();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const rafRef = useRef<number | null>(null);

  const currentStep = TOUR_STEPS[currentStepIndex];

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const getTargetId = useCallback(() => {
    if (!currentStep) return null;
    // Responsive target: use mobile-specific id when on mobile
    if (isMobile && currentStep.targetId === "tour-question-list") {
      return "tour-question-list-mobile";
    }
    return currentStep.targetId;
  }, [currentStep, isMobile]);

  const scrollToTarget = useCallback(() => {
    const targetId = getTargetId();
    if (!targetId) return;
    const target = document.querySelector(
      `[data-tour-id="${targetId}"]`,
    );
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [getTargetId]);

  const measureTarget = useCallback(() => {
    if (typeof window === "undefined") return;
    const targetId = getTargetId();
    if (!targetId) return;
    const target = document.querySelector(
      `[data-tour-id="${targetId}"]`,
    );
    if (target) {
      setTargetRect(target.getBoundingClientRect());
    }
  }, [getTargetId]);

  useEffect(() => {
    if (showCompletion) return;

    // Step 4 on mobile: open bottom sheet first, then measure
    if (isMobile && currentStepIndex === 3 && onOpenAiChat) {
      onOpenAiChat();
      const timer = setTimeout(() => {
        scrollToTarget();
        setTimeout(measureTarget, 400);
      }, 400);
      return () => clearTimeout(timer);
    }

    scrollToTarget();
    const timer = setTimeout(measureTarget, 400);
    const handleChange = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measureTarget);
    };
    window.addEventListener("resize", handleChange);
    window.addEventListener("scroll", handleChange, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleChange);
      window.removeEventListener("scroll", handleChange, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [measureTarget, scrollToTarget, showCompletion, isMobile, currentStepIndex, onOpenAiChat]);

  const finishTour = () => {
    onCloseAiChat?.();
    setShowCompletion(true);
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      finishTour();
    }
  };

  const handleSkip = () => {
    finishTour();
  };

  const handleCloseCompletion = () => {
    setShowCompletion(false);
    onClose();
  };

  const handleGoToWrite = () => {
    setShowCompletion(false);
    onClose();
    router.push("/resume/write");
  };

  const handleGoToBricks = () => {
    setShowCompletion(false);
    onClose();
    router.push("/resume/bricks");
  };

  // --- Completion Popup ---
  if (showCompletion) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
        <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md flex flex-col border border-border overflow-hidden animate-in zoom-in-95">
          <div className="px-6 py-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-4">
              <span className="text-2xl">🎉</span>
            </div>
            <h2 className="text-xl font-bold text-foreground">
              튜토리얼이 완료되었습니다!
            </h2>
            <p className="mt-2 text-sm text-muted-foreground leading-6">
              이제 직접 자소서를 작성하거나, 경험 브릭을 관리해 보세요.
            </p>
          </div>
          <div className="px-6 pb-6 space-y-3">
            <button
              onClick={handleGoToWrite}
              className="w-full inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-bold text-background transition-opacity hover:opacity-90"
            >
              <PenTool className="h-4 w-4" />
              첫 자소서 쓰러 가기
            </button>
            <button
              onClick={handleGoToBricks}
              className="w-full inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-background px-5 text-sm font-bold text-foreground transition-colors hover:bg-muted/60"
            >
              <Layers className="h-4 w-4" />
              경험 보관함으로 이동
            </button>
            <button
              onClick={handleCloseCompletion}
              className="w-full inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border/60 bg-background px-5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/60"
            >
              계속 둘러보기
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentStep) return null;

  // --- Mobile Bottom Sheet Style ---
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[60]">
        <div className="absolute inset-0 bg-black/40" />
        {targetRect && (
          <div
            className="absolute rounded-lg border-2 border-primary/70 transition-all duration-300 pointer-events-none"
            style={{
              top: targetRect.top - 4,
              left: targetRect.left - 4,
              width: targetRect.width + 8,
              height: targetRect.height + 8,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)",
            }}
          />
        )}
        {/* Bottom Sheet */}
        <div className="absolute bottom-0 left-0 right-0 z-10 rounded-t-2xl border-t border-border bg-background p-5 shadow-2xl animate-in slide-in-from-bottom">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {currentStepIndex + 1} / {TOUR_STEPS.length}
              </span>
              <h3 className="mt-2 text-base font-bold text-foreground">
                {currentStep.title}
              </h3>
            </div>
            <button
              onClick={handleSkip}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {currentStep.description}
          </p>
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              건너뛰기
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                disabled={currentStepIndex === 0}
                className="inline-flex h-9 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                이전
              </button>
              <button
                onClick={handleNext}
                className="inline-flex h-9 items-center gap-1 rounded-full bg-foreground px-4 text-xs font-bold text-background hover:bg-foreground/90"
              >
                {currentStepIndex === TOUR_STEPS.length - 1 ? "완료" : "다음"}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Desktop Floating Tooltip ---
  const tooltipWidth = 320;
  const tooltipHeight = 200;
  const margin = 12;

  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect) {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: tooltipWidth,
      };
    }

    let top = 0;
    let left = 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const preferTop = () => {
      const t = targetRect.top - tooltipHeight - margin;
      return t >= 8;
    };
    const preferBottom = () => {
      const t = targetRect.bottom + margin;
      return t + tooltipHeight <= vh - 8;
    };
    const preferRight = () => {
      const l = targetRect.right + margin;
      return l + tooltipWidth <= vw - 8;
    };
    const preferLeft = () => {
      const l = targetRect.left - tooltipWidth - margin;
      return l >= 8;
    };

    const clampX = (x: number) => Math.min(Math.max(x, 8), vw - tooltipWidth - 8);
    const clampY = (y: number) => Math.min(Math.max(y, 8), vh - tooltipHeight - 8);

    switch (currentStep.position) {
      case "bottom":
        if (preferBottom()) {
          top = targetRect.bottom + margin;
        } else {
          top = preferTop() ? targetRect.top - tooltipHeight - margin : clampY(vh / 2 - tooltipHeight / 2);
        }
        left = clampX(targetRect.left + targetRect.width / 2 - tooltipWidth / 2);
        break;
      case "right":
        if (preferRight()) {
          left = targetRect.right + margin;
        } else {
          left = preferLeft() ? targetRect.left - tooltipWidth - margin : clampX(vw / 2 - tooltipWidth / 2);
        }
        top = clampY(targetRect.top + targetRect.height / 2 - tooltipHeight / 2);
        break;
      case "left":
        if (preferLeft()) {
          left = targetRect.left - tooltipWidth - margin;
        } else {
          left = preferRight() ? targetRect.right + margin : clampX(vw / 2 - tooltipWidth / 2);
        }
        top = clampY(targetRect.top + targetRect.height / 2 - tooltipHeight / 2);
        break;
      case "top":
      default:
        if (preferTop()) {
          top = targetRect.top - tooltipHeight - margin;
        } else {
          top = preferBottom() ? targetRect.bottom + margin : clampY(vh / 2 - tooltipHeight / 2);
        }
        left = clampX(targetRect.left + targetRect.width / 2 - tooltipWidth / 2);
        break;
    }

    return { top, left, width: tooltipWidth };
  };

  const tooltipStyle = getTooltipStyle();

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Dark overlay with cutout around target */}
      <div className="absolute inset-0 bg-black/40" />
      {targetRect && (
        <div
          className="absolute rounded-lg border-2 border-primary/70 transition-all duration-300 pointer-events-none"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)",
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="absolute z-10 rounded-2xl border border-border bg-background p-5 shadow-2xl transition-all duration-300 pointer-events-auto"
        style={tooltipStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              {currentStepIndex + 1} / {TOUR_STEPS.length}
            </span>
            <h3 className="mt-2 text-base font-bold text-foreground">
              {currentStep.title}
            </h3>
          </div>
          <button
            onClick={handleSkip}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {currentStep.description}
        </p>
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            건너뛰기
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              disabled={currentStepIndex === 0}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              이전
            </button>
            <button
              onClick={handleNext}
              className="inline-flex h-9 items-center gap-1 rounded-full bg-foreground px-4 text-xs font-bold text-background hover:bg-foreground/90"
            >
              {currentStepIndex === TOUR_STEPS.length - 1 ? "완료" : "다음"}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
