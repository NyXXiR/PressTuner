"use client";

import React from "react";
import { Loader2, Sparkles, Zap, LucideIcon } from "lucide-react";
import clsx from "clsx";

interface ResumeActionButtonProps {
  onClick?: () => void | Promise<void>;
  loading?: boolean;
  label: string;
  loadingLabel?: string;
  cost?: number; // 차감할 비용 (양수로 입력: 1 -> -1로 표시됨)
  icon?: LucideIcon;
  disabled?: boolean;
  className?: string;
}

export default function ResumeActionButton({
  onClick,
  loading = false,
  label,
  loadingLabel = "생성 중...",
  cost = 1,
  icon: Icon = Sparkles,
  disabled,
  className,
}: ResumeActionButtonProps) {
  const isDisabled = loading || !!disabled;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDisabled || !onClick) return;
    await onClick();
  };

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={handleClick}
      className={clsx(
        "group relative w-full overflow-hidden py-3.5 px-5 text-sm font-bold transition-all duration-200",
        // ✅ [수정] justify-between -> justify-center, gap-3 추가
        // 요소들을 중앙으로 모으고 간격을 주어 가독성을 높임
        "flex items-center justify-center gap-3 border",
        isDisabled
          ? "bg-muted text-muted-foreground cursor-not-allowed border-border"
          : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white border-transparent active:scale-[0.99]",
        className
      )}
    >
      {/* Shine Effect (활성 상태일 때만) */}
      {!isDisabled && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" />
      )}

      {/* Left: Action Info */}
      <div className="flex items-center gap-2 z-10">
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Icon className="w-4 h-4 text-indigo-100" />
        )}
        <span>{loading ? loadingLabel : label}</span>
      </div>

      {/* Right: Cost Info */}
      {!loading && cost > 0 && (
        <div
          className={clsx(
            "flex items-center gap-1 px-2.5 py-1 z-10",
            isDisabled
              ? "bg-black/5"
              : "bg-black/20 backdrop-blur-sm ring-1 ring-white/10 group-hover:bg-black/30 transition-colors"
          )}
        >
          {/* 번개 아이콘 */}
          <Zap
            className={clsx(
              "w-3.5 h-3.5",
              isDisabled
                ? "text-muted-foreground"
                : "fill-yellow-400 text-yellow-400"
            )}
          />
          {/* 비용 표시 */}
          <span
            className={clsx(
              "font-mono text-xs font-black tracking-tight",
              isDisabled ? "text-muted-foreground" : "text-yellow-100"
            )}
          >
            -{cost}
          </span>
        </div>
      )}

      <style jsx>{`
        @keyframes shine {
          0% {
            transform: translateX(-100%) skewX(-15deg);
          }
          100% {
            transform: translateX(100%) skewX(-15deg);
          }
        }
        .group:hover .animate-shine {
          animation: shine 0.7s forwards;
        }
      `}</style>
    </button>
  );
}
