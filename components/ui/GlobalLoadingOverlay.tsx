// components/ui/GlobalLoadingOverlay.tsx
"use client";

import { useEffect } from "react";
import { useUiStore } from "@/stores/useUiStore";

export function GlobalLoadingOverlay() {
  const overlay = useUiStore((s) => s.globalOverlay);
  const isOpen = overlay.open;

  // ✅ 오버레이가 열린 동안만 body 스크롤 잠금
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-auto">
      {/* ✅ 화면 상호작용 차단(클릭/스크롤 모두 막음) */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" />

      {/* 스피너(중앙) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-3 border border-border bg-card px-4 py-3 shadow">
          <div
            className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
            aria-label="Loading"
          />
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {overlay.title ?? "불러오는 중…"}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {overlay.message ?? "잠시만 기다려주세요"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
