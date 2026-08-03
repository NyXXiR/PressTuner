"use client";

import { useState } from "react";
import clsx from "clsx";
import { Sparkles, UserCheck, Check, RefreshCw } from "lucide-react";
import { useRightPanelStore } from "@/stores/rightPanelStore";

type Props = {
  reviewing: boolean;
  usage?: {
    article?: {
      unlimited?: boolean;
      polishRemaining: number;
      polishLimit: number;
    };
  } | null;
  onReview: () => void | Promise<void>;
  // 비동기 처리를 위해 Promise<void>도 허용하도록 타입 유연화 (기존 () => void와 호환됨)
  onComplete: () => void | Promise<void>;
  onRequestApproval: () => void;
  completeDisabled?: boolean;
};

export default function FloatingActionBar({
  reviewing,
  usage,
  onReview,
  onComplete,
  onRequestApproval,
  completeDisabled = false,
}: Props) {
  // [추가] 완료 처리 중 상태 관리
  const [isCompleting, setIsCompleting] = useState(false);
  const openRightPanel = useRightPanelStore((state) => state.open);

  const remaining = usage?.article?.polishRemaining ?? 0;
  const limit = usage?.article?.polishLimit ?? 0;
  const isUsageExhausted =
    !!usage?.article && usage.article.unlimited !== true && remaining <= 0;

  // 리뷰 중이거나 완료 처리 중이면 AI 버튼 등 다른 액션도 잠금
  const isBusy = reviewing || isCompleting;
  // [추가] 완료 버튼 핸들러 (중복 클릭 방지)
  const handleCompleteClick = async () => {
    if (isBusy || completeDisabled) return;

    setIsCompleting(true);
    try {
      // 부모 컴포넌트의 onComplete가 비동기라면 기다림
      await onComplete();
    } catch (error) {
      console.error(error);
      setIsCompleting(false); // 에러 발생 시에만 락 해제 (성공 시엔 페이지 이동하므로 유지)
    }
  };

  const handleReviewClick = async () => {
    if (isBusy || isUsageExhausted) return;
    openRightPanel();
    await onReview();
  };

  return (
    <footer className="fixed inset-x-0 bottom-0 z-40">
      {/* 배경 그라데이션 + safe-area */}
      <div className="pointer-events-none bg-gradient-to-t from-background/95 via-background/70 to-transparent pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
        <div className="pointer-events-auto mx-auto w-full max-w-xl px-4">
          <div className="border border-border/60 bg-background/70 backdrop-blur-xl shadow-lg">
            <div className="flex items-center gap-2 p-2">
              {/* 1. [좌측] 검토 요청 (Secondary) */}
              <button
                type="button"
                onClick={onRequestApproval}
                disabled={isBusy}
                className={clsx(
                  "flex-1 h-14 px-2 text-sm font-bold transition active:scale-[0.99] min-w-0",
                  "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <span className="inline-flex items-center justify-center gap-1.5 w-full">
                  <UserCheck size={16} className="shrink-0 opacity-70" />
                  <span className="truncate">검토 요청</span>
                </span>
              </button>

              <button
                type="button"
                onClick={handleReviewClick}
                disabled={isBusy || isUsageExhausted}
                className={clsx(
                  "flex-[2] h-14 px-3 text-center min-w-0 transition active:scale-[0.99]",
                  isBusy || isUsageExhausted
                    ? "border border-border/60 bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                    : "border border-ai/30 bg-ai text-ai-foreground hover:bg-ai/90",
                )}
              >
                <div className="flex items-center justify-center gap-2 text-base font-bold">
                  {reviewing ? (
                    <RefreshCw size={16} className="shrink-0 animate-spin" />
                  ) : (
                    <Sparkles size={16} className="shrink-0" />
                  )}
                  <span className="truncate">
                    {reviewing ? "AI 첨삭 분석 중" : "AI 첨삭 분석"}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-ai-foreground/80">
                  {usage?.article
                    ? remaining <= 0
                      ? `사용량 소진 ${remaining}/${limit}`
                      : `남은 사용량 ${remaining}/${limit}`
                    : "사용량 확인 중"}
                </div>
              </button>

              {/* 3. [우측] 작성 완료 버튼 (Primary Action) */}
              <button
                type="button"
                onClick={handleCompleteClick} // [수정] 핸들러 교체
                disabled={isBusy || completeDisabled}
                className={clsx(
                  "flex-1 h-14 px-2 text-sm font-bold transition active:scale-[0.99] min-w-0",
                  // 로딩 중이거나 리뷰 중일 때 스타일 처리
                  isBusy || completeDisabled
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                <span className="inline-flex items-center justify-center gap-1.5 w-full">
                  {isCompleting ? (
                    // [추가] 완료 로딩 스피너
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current shrink-0" />
                  ) : (
                    <Check size={16} className="shrink-0" />
                  )}
                  <span className="truncate">
                    {isCompleting ? "처리 중" : "완료"}
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
