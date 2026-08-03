"use client";

import { useState } from "react";
import clsx from "clsx";

type ViewMode = "original" | "edited";

type ArticleBodyProps = {
  title?: string | null;
  lead?: string | null; // (호환성 유지용)
  fact?: string | null; // (호환성 유지용)
  bodyJson: any; // 직접 접근을 위해 any 혹은 구체적 타입 사용
  rawInput?: string | null;
  defaultMode?: ViewMode | "read";
  className?: string;
};

export default function ArticleBody({
  title,
  bodyJson,
  rawInput,
  defaultMode = "edited",
  className,
}: ArticleBodyProps) {
  const initialMode: ViewMode =
    defaultMode === "original" ? "original" : "edited";
  const [mode, setMode] = useState<ViewMode>(initialMode);

  // [수정] 외부 유틸리티 대신 직접 파싱
  // bodyJson이 없거나 paragraphs가 없으면 빈 배열 처리
  const paragraphs = Array.isArray(bodyJson?.paragraphs)
    ? bodyJson.paragraphs
    : [];

  const showOriginal = mode === "original" && !!rawInput?.trim();

  return (
    <div className={clsx("w-full", className)}>
      {/* 1. 뷰 모드 토글 (rawInput 있을 때만) */}
      {rawInput && (
        <div className="flex items-center justify-end mb-4">
          <div className="inline-flex overflow-hidden border border-border bg-card">
            <ToggleBtn
              active={mode === "edited"}
              onClick={() => setMode("edited")}
              label="편집본"
            />
            <div className="w-px bg-border" />
            <ToggleBtn
              active={mode === "original"}
              onClick={() => setMode("original")}
              label="원문"
            />
          </div>
        </div>
      )}

      {/* 2. 컨텐츠 영역 */}
      {showOriginal ? (
        <pre className="whitespace-pre-wrap border border-border bg-muted/30 p-6 text-sm leading-relaxed text-foreground">
          {rawInput}
        </pre>
      ) : (
        <article className="prose prose-invert max-w-none">
          {/* 제목 */}
          {title && (
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-8 leading-snug">
              {title}
            </h1>
          )}

          {/* 본문 (paragraphs 순회) */}
          <div className="space-y-4 text-[17px] leading-[1.8] text-gray-200">
            {paragraphs.length > 0 ? (
              paragraphs.map((p: any, i: number) => {
                // 텍스트가 있으면 출력, 없으면(빈 줄) 투명한 공간으로 처리하여 줄바꿈 효과
                return (
                  <p key={i} className="min-h-[1.5em] break-words">
                    {p.text}
                  </p>
                );
              })
            ) : (
              // 데이터가 아예 없을 경우 (방어 코드)
              <p className="text-muted-foreground opacity-50">
                본문 내용이 없습니다.
              </p>
            )}

            {/* 맺음말(Closing) 처리 */}
            {bodyJson?.closing && (
              <>
                <hr className="border-border/50 my-8" />
                <p className="text-muted-foreground">{bodyJson.closing}</p>
              </>
            )}
          </div>
        </article>
      )}
    </div>
  );
}

/* --- 하위 컴포넌트 --- */

function ToggleBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "px-4 py-2 text-xs font-medium transition-colors outline-none",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}
