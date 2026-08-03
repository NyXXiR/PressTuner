"use client";

import React from "react";
import clsx from "clsx";
import {
  CheckCircle,
  XCircle,
  PlusCircle,
  MinusCircle,
  RefreshCw,
  AlertTriangle,
  Loader2,
} from "lucide-react";

export type StagedAction = "CREATE" | "UPDATE" | "SKIP";
export type MatchType = "NONE" | "PERFECT_MATCH" | "CONTENT_MISMATCH" | "SIMILAR";

export type StagedBrick = {
  id: string;
  title: string;
  content: string;
  originalText: string;
  period?: string;
  tags: string[];
  matchType: MatchType;
  matchBrickId?: string;
  matchBrickTitle?: string;
  action: StagedAction;
};

type BrickReviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (items: StagedBrick[]) => void;
  stagedItems: StagedBrick[];
  setStagedItems: React.Dispatch<React.SetStateAction<StagedBrick[]>>;
  isSaving?: boolean;
  title?: string;
  subtitle?: string;
  applyLabel?: string;
};

export default function BrickReviewModal({
  isOpen,
  onClose,
  onApply,
  stagedItems,
  setStagedItems,
  isSaving = false,
  title = "AI 분석 결과 검토",
  subtitle,
  applyLabel = "적용하기",
}: BrickReviewModalProps) {
  if (!isOpen) return null;

  const handleActionChange = (id: string, action: StagedAction) => {
    setStagedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, action } : item))
    );
  };

  const handleTitleChange = (id: string, value: string) => {
    setStagedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, title: value } : item))
    );
  };

  const handleContentChange = (id: string, value: string) => {
    setStagedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, content: value } : item))
    );
  };

  const activeCount = stagedItems.filter((i) => i.action !== "SKIP").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
      <div className="bg-card shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col border border-border animate-in zoom-in-95">
        {/* Header */}
        <div className="shrink-0 px-6 py-5 border-b border-border flex justify-between items-center bg-secondary/30">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
              <CheckCircle className="w-5 h-5 text-primary" />
              {title}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {subtitle ?? `총 ${stagedItems.length}개의 경험을 찾았습니다.`}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-2 hover:bg-secondary text-muted-foreground transition-colors disabled:opacity-50"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-secondary/10 space-y-4 custom-scrollbar">
          {stagedItems.map((item) => (
            <div
              key={item.id}
              className={clsx(
                "flex flex-col md:flex-row gap-4 p-5 border transition-all",
                item.action !== "SKIP"
                  ? "bg-card border-primary/40"
                  : "bg-secondary/20 border-border opacity-60"
              )}
            >
              {/* Action selectors */}
              <div className="md:w-36 flex flex-col gap-2 shrink-0">
                <label
                  className={clsx(
                    "flex items-center gap-2 p-2.5 cursor-pointer border transition-colors",
                    item.action === "CREATE"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                      : "border-transparent text-muted-foreground hover:bg-secondary"
                  )}
                >
                  <input
                    type="radio"
                    checked={item.action === "CREATE"}
                    onChange={() => handleActionChange(item.id, "CREATE")}
                    className="hidden"
                  />
                  <PlusCircle className="w-4 h-4" />
                  <span className="text-xs font-bold">추가</span>
                </label>

                <label
                  className={clsx(
                    "flex items-center gap-2 p-2.5 cursor-pointer border transition-colors",
                    item.action === "SKIP"
                      ? "bg-secondary border-border text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-secondary"
                  )}
                >
                  <input
                    type="radio"
                    checked={item.action === "SKIP"}
                    onChange={() => handleActionChange(item.id, "SKIP")}
                    className="hidden"
                  />
                  <MinusCircle className="w-4 h-4" />
                  <span className="text-xs font-bold">건너뛰기</span>
                </label>

                {item.matchType !== "NONE" && (
                  <label
                    className={clsx(
                      "flex items-center gap-2 p-2.5 cursor-pointer border transition-colors",
                      item.action === "UPDATE"
                        ? "bg-orange-500/10 border-orange-500/30 text-orange-600"
                        : "border-transparent text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    <input
                      type="radio"
                      checked={item.action === "UPDATE"}
                      onChange={() => handleActionChange(item.id, "UPDATE")}
                      className="hidden"
                    />
                    <RefreshCw className="w-4 h-4" />
                    <span className="text-xs font-bold">덮어쓰기</span>
                  </label>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 space-y-3">
                {item.matchType !== "NONE" && (
                  <div className="text-xs font-bold text-orange-500 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    유사 경험 발견 ({item.matchType})
                    {item.matchBrickTitle && (
                      <span className="font-normal text-muted-foreground ml-1">
                        — {item.matchBrickTitle}
                      </span>
                    )}
                  </div>
                )}
                <input
                  value={item.title}
                  onChange={(e) => handleTitleChange(item.id, e.target.value)}
                  className="w-full font-bold bg-transparent border-b border-border/30 hover:border-border focus:border-primary outline-none py-1 text-foreground"
                  placeholder="제목"
                />
                {item.period && (
                  <div className="text-xs text-muted-foreground">
                    기간: {item.period}
                  </div>
                )}
                <textarea
                  value={item.content}
                  onChange={(e) => handleContentChange(item.id, e.target.value)}
                  className="w-full text-sm bg-secondary/50 p-3 resize-none outline-none focus:ring-1 focus:ring-primary border border-transparent text-foreground/90"
                  rows={3}
                  placeholder="내용"
                />
                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-2 py-0.5 bg-secondary rounded text-muted-foreground border border-border"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-5 border-t border-border flex justify-between items-center bg-card">
          <div className="text-sm text-muted-foreground">
            {activeCount > 0 ? (
              <span>
                <span className="font-bold text-foreground">{activeCount}</span>
                개 적용 예정
              </span>
            ) : (
              "적용할 항목이 없습니다"
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-5 py-2.5 text-sm font-medium hover:bg-secondary text-muted-foreground transition-colors disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={() => onApply(stagedItems)}
              disabled={isSaving || activeCount === 0}
              className="px-8 py-2.5 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                applyLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
