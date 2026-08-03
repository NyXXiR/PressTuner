// components/layout/SystemNoticeBar.tsx
"use client";

import { useMemo, useState } from "react";
import { useNoticeStore } from "@/stores/useNoticeStore";

type SystemNoticeBarProps = {
  message: string;
  noticeId: string;
};

export function SystemNoticeBar({ message, noticeId }: SystemNoticeBarProps) {
  const isHiddenToday = useNoticeStore((state) =>
    state.isHiddenToday(noticeId)
  );
  const hideToday = useNoticeStore((state) => state.hideToday);

  const [expanded, setExpanded] = useState(false);

  const short = useMemo(() => {
    const m = message ?? "";
    if (m.length <= 48) return m;
    return m.slice(0, 48) + "…";
  }, [message]);

  if (isHiddenToday) return null;

  const handleHide = () => hideToday(noticeId);

  return (
    <div className="border-b border-border bg-card text-foreground px-3 py-2 sm:px-6 sm:py-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] sm:text-xs leading-snug text-muted-foreground">
          <span className="sm:hidden">{expanded ? message : short}</span>
          <span className="hidden sm:inline">{message}</span>
        </p>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* 모바일: 자세히/접기 */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="sm:hidden text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            {expanded ? "접기" : "자세히"}
          </button>

          <button
            type="button"
            onClick={handleHide}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            오늘 하루 보지 않기
          </button>

          <button
            type="button"
            onClick={handleHide}
            className="text-[11px] text-muted-foreground hover:text-foreground"
            aria-label="공지 닫기"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
