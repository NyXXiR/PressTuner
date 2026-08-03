"use client";

import { useMemo } from "react";
import React from "react";

export type Status = "DRAFT" | "IN_PROGRESS" | "FINAL";

const STEPS: { key: Status; label: string }[] = [
  { key: "DRAFT", label: "초안" },
  { key: "IN_PROGRESS", label: "검토 중" },
  { key: "FINAL", label: "발행 완료" },
];

type Props = {
  initialStatus: Status;
  compact?: boolean;
};

export default function StatusPanel({ initialStatus, compact }: Props) {
  const { currentIndex, currentLabel } = useMemo(() => {
    const idx = STEPS.findIndex((s) => s.key === initialStatus);
    const safeIndex = idx >= 0 ? idx : STEPS.length - 1;
    return {
      currentIndex: safeIndex,
      currentLabel: STEPS[safeIndex]?.label ?? initialStatus ?? "알 수 없음",
    };
  }, [initialStatus]);

  const isFinal = initialStatus === "FINAL";

  // absolute를 제거했으므로 과도한 pb-7 등이 필요 없어졌습니다.
  const containerClass = compact
    ? "border border-border/60 bg-card px-4 py-3 text-[11px]"
    : "border border-border/70 bg-card p-5";

  const headerClass = compact
    ? "hidden"
    : "mb-6 text-xs font-medium text-muted-foreground";

  const circlesSize = compact ? "h-6 w-6" : "h-7 w-7";

  return (
    <section className={containerClass} aria-label="진행 상태">
      {!compact && (
        <div className={headerClass}>
          진행 상태:{" "}
          <span className="font-semibold text-primary">{currentLabel}</span>
        </div>
      )}

      {/* items-start로 변경하여 라벨 높이가 달라도 원의 위치를 고정 */}
      <div className="flex w-full items-start justify-between">
        {STEPS.map((step, idx) => {
          const isDone = isFinal ? idx <= currentIndex : idx < currentIndex;
          const isCurrent = !isFinal && idx === currentIndex;
          const state = isDone ? "done" : isCurrent ? "current" : "upcoming";

          const circleBase = `relative z-10 flex shrink-0 items-center justify-center rounded-full border bg-card font-medium transition-colors ${circlesSize} text-[11px]`;

          const circleClass =
            state === "done"
              ? `${circleBase} border-primary bg-primary text-primary-foreground`
              : state === "current"
                ? `${circleBase} border-primary bg-primary/10 text-primary ring-2 ring-primary/20`
                : `${circleBase} border-border bg-muted text-muted-foreground`;

          // absolute 제거 및 flow 배치
          const labelClass =
            `mt-2 whitespace-nowrap text-center text-[11px] font-medium transition-colors ` +
            (isCurrent
              ? "font-bold text-primary"
              : isDone
                ? "text-foreground/80"
                : "text-muted-foreground/60");

          const connectorClass =
            "h-[2px] w-full transition-colors " +
            (isFinal || idx < currentIndex ? "bg-primary" : "bg-border/60");

          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center flex-1">
                <div className={circleClass}>{isDone ? "✓" : idx + 1}</div>
                <span className={labelClass}>{step.label}</span>
              </div>

              {/* 커넥터: 원의 높이만큼 영역을 잡아 중앙 정렬 유도 */}
              {idx < STEPS.length - 1 && (
                <div className={`flex items-center flex-1 ${circlesSize}`}>
                  <div className={connectorClass} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}
