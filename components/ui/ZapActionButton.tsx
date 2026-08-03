"use client";

import { Zap, RefreshCw, ArrowRight, LucideIcon } from "lucide-react";
import clsx from "clsx";
import { useState } from "react";

interface ZapActionButtonProps {
  onClick?: () => void | Promise<void>; // 비동기 함수 대응
  loading?: boolean;
  label: string;
  loadingLabel?: string;
  points?: number;
  icon?: LucideIcon;
  disabled?: boolean;
  className?: string;
}

export default function ZapActionButton({
  onClick,
  loading = false,
  label,
  loadingLabel = "처리 중...",
  points = -1,
  icon: Icon = ArrowRight,
  disabled,
  className,
}: ZapActionButtonProps) {
  // ✅ 애니메이션 실행 여부를 내부에서 직접 관리합니다.
  const [isAnimating, setIsAnimating] = useState(false);

  const isDisabled = loading || !!disabled;

  const handleInternalClick = async () => {
    if (isDisabled) return;

    // 1) 애니메이션 트리거
    setIsAnimating(true);

    // ✅ 2) 애니메이션 종료 예약을 먼저 걸어둔다
    setTimeout(() => {
      setIsAnimating(false);
    }, 1100);

    // 3) 부모 클릭 실행
    if (onClick) {
      await onClick();
    }
  };

  return (
    <div className="relative w-full sm:w-auto">
      <button
        type="button"
        disabled={isDisabled}
        onClick={handleInternalClick}
        className={clsx(
          "group relative w-full sm:w-auto px-8 py-3.5 text-base font-bold transition-all overflow-hidden",
          "active:scale-95 disabled:cursor-not-allowed",
          // ✅ 로딩/disabled일 때 회색 처리
          isDisabled
            ? "bg-muted text-muted-foreground shadow-none ring-1 ring-border"
            : [
                // 🎨 [수정] Blue Gradient -> AI Orange Gradient
                // from-orange-700 via-ai to-orange-700 로 변경하여 깊이감 있는 오렌지 그라데이션 적용
                "bg-gradient-to-r from-orange-700 via-ai to-orange-700 bg-[length:200%_auto] animate-shimmer",
                // 🎨 [수정] Shadow Color (Blue -> AI Orange Glow)
                // hsl(var(--ai) / 0.5)를 사용하여 AI 색상의 50% 투명도 그림자 적용
                "text-ai-foreground",
              ],
          className
        )}
      >
        {/* ✅ 로딩/disabled일 땐 shine 레이어 제거 */}
        {!isDisabled && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:animate-shine" />
        )}

        <div className="relative flex items-center justify-center gap-3">
          {loading ? (
            <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-300">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span className="tracking-tight opacity-90">{loadingLabel}</span>
            </div>
          ) : (
            <>
              {/* 포인트 뱃지 (오렌지 배경 위라 어둡게 유지하되 투명도 조정) */}
              <div
                className={clsx(
                  "flex items-center gap-1.5 px-2.5 py-1 ring-1 backdrop-blur-sm",
                  isDisabled
                    ? "bg-black/5 ring-border"
                    : "bg-black/20 ring-white/20" // 오렌지 위에서 너무 진하지 않게 조정
                )}
              >
                <Zap
                  className={clsx(
                    "w-4 h-4",
                    isDisabled
                      ? "text-muted-foreground"
                      : "fill-yellow-300 text-yellow-300 drop-shadow-[0_0_8px_rgba(253,224,71,0.6)] animate-pulse"
                    // 오렌지 배경에서는 노란색이 묻힐 수 있어 더 밝은 yellow-300 사용
                  )}
                />
                <span
                  className={clsx(
                    "text-[11px] font-black",
                    isDisabled ? "text-muted-foreground" : "text-white"
                  )}
                >
                  {points}
                </span>
              </div>
              <span className="tracking-tight">{label}</span>
              <Icon className="w-5 h-5 opacity-80 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </div>
      </button>

      {/* 내부 상태인 isAnimating에 따라 애니메이션 표시 */}
      {isAnimating && (
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-0 z-50">
          <div className="animate-pop-and-float flex flex-col items-center">
            <div className="relative">
              {/* 팝업 뱃지 */}
              <span className="flex items-center gap-2 rounded-full bg-yellow-400 px-4 py-2 text-base font-black text-orange-950 shadow-[0_0_30px_rgba(250,204,21,0.6)] ring-2 ring-white">
                <Zap className="w-5 h-5 fill-current" />
                {points}
              </span>
              <div className="absolute inset-0 animate-ping rounded-full bg-yellow-400/60" />
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes shimmer {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        @keyframes shine {
          0% {
            transform: translateX(-100%) skewX(-15deg);
          }
          100% {
            transform: translateX(100%) skewX(-15deg);
          }
        }
        @keyframes pop-and-float {
          0% {
            opacity: 0;
            transform: translateY(10px) scale(0.6) rotate(-20deg);
          }
          20% {
            opacity: 1;
            transform: translateY(-40px) scale(1.3) rotate(15deg);
          }
          100% {
            opacity: 0;
            transform: translateY(-120px) scale(0.9) rotate(5deg);
          }
        }
        .animate-shimmer {
          animation: shimmer 3s infinite linear;
        }
        .group:hover .animate-shine {
          animation: shine 0.7s forwards;
        }
        .animate-pop-and-float {
          animation: pop-and-float 1.1s forwards;
        }
      `}</style>
    </div>
  );
}
