//components/ui/status-badge.tsx

import React from "react";
import { type LucideIcon } from "lucide-react";

const BADGE_VARIANTS = {
  neutral: "pt-badge pt-badge--neutral",

  // 기존 blue/indigo는 theme primary 토큰 기반으로 통일
  blue: "pt-badge pt-badge--primary",
  indigo: "pt-badge pt-badge--primary",

  // 상태성 컬러 (theme 배경과 color-mix로 눈부심 억제)
  emerald: "pt-badge pt-badge--success",
  amber: "pt-badge pt-badge--warning",
  rose: "pt-badge pt-badge--danger",

  // AI 전용 토큰 사용
  ai: "pt-badge pt-badge--ai",
} as const;

export type BadgeVariant = keyof typeof BADGE_VARIANTS;

interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  icon?: LucideIcon;
  className?: string;
  animate?: boolean;
}

function cx(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export function StatusBadge({
  children,
  variant = "neutral",
  icon: Icon,
  className,
  animate = false,
}: StatusBadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-tight transition-colors whitespace-nowrap",
        BADGE_VARIANTS[variant],
        className,
      )}
    >
      {Icon && (
        <Icon
          size={10}
          className={cx("shrink-0", animate && "animate-pulse")}
        />
      )}
      {children}
    </span>
  );
}
