"use client";

import type { ChangeEvent, RefObject } from "react";
import { CheckCircle2, FileUp, Layers, Loader2, PenLine, Sparkles } from "lucide-react";
import { PdfStartSection } from "@/app/resume/write/legacy/components/PdfStartSection";
import type { ParsedBrick } from "@/app/resume/write/legacy/components/resumeStartTypes";

type NoBrickStartPanelProps = {
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
  readonly pdfName: string;
  readonly isParsingPdf: boolean;
  readonly isSavingBricks: boolean;
  readonly uploadError: string | null;
  readonly parsedBricks: readonly ParsedBrick[];
  readonly selectedBrickIndexes: readonly number[];
  readonly memoTitle: string;
  readonly memoContent: string;
  readonly memoError: string | null;
  readonly isSavingMemo: boolean;
  readonly onPdfChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onPickPdf: () => void;
  readonly onToggleBrickSelection: (index: number) => void;
  readonly onSaveSelectedBricks: () => void;
  readonly onMemoTitleChange: (value: string) => void;
  readonly onMemoContentChange: (value: string) => void;
  readonly onSaveMemo: () => void;
  readonly onStartFromPosting: () => void;
};

export function NoBrickStartPanel({
  fileInputRef,
  pdfName,
  isParsingPdf,
  isSavingBricks,
  uploadError,
  parsedBricks,
  selectedBrickIndexes,
  memoTitle,
  memoContent,
  memoError,
  isSavingMemo,
  onPdfChange,
  onPickPdf,
  onToggleBrickSelection,
  onSaveSelectedBricks,
  onMemoTitleChange,
  onMemoContentChange,
  onSaveMemo,
  onStartFromPosting,
}: NoBrickStartPanelProps) {
  const memoReady = memoContent.trim().length >= 10;

  return (
    <section className="space-y-4">
      <div className="rounded-[28px] border border-border bg-card p-5 shadow-[0_24px_80px_rgba(12,18,28,0.08)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <Layers className="h-3.5 w-3.5" />
              첫 작성 준비
            </p>
            <h2 className="mt-4 text-xl font-bold leading-tight text-foreground sm:text-3xl">
              자료가 없어도 바로 시작할 수 있습니다.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              PDF가 있으면 추출하고, 없으면 경험 메모부터 저장하세요.
              공고를 먼저 정리한 뒤 경험을 붙여도 됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onStartFromPosting}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-bold text-foreground transition-colors hover:bg-muted"
          >
            <PenLine className="h-4 w-4" />
            공고부터 먼저 입력
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={onPickPdf}
            className="rounded-[20px] border border-border bg-background p-4 text-left transition-colors hover:border-primary/35 hover:bg-primary/[0.03]"
          >
            <FileUp className="h-5 w-5 text-primary" />
            <div className="mt-3 text-sm font-bold text-foreground">
              PDF로 경험 추가
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              이력서나 경력기술서가 있을 때 가장 빠릅니다.
            </p>
          </button>
          <a
            href="#resume-memo-start"
            className="rounded-[20px] border border-ai/30 bg-ai/10 p-4 text-left transition-colors hover:bg-ai/15"
          >
            <Sparkles className="h-5 w-5 text-ai" />
            <div className="mt-3 text-sm font-bold text-foreground">
              경험 메모로 시작
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              STAR 형식이 아니어도 짧은 메모를 먼저 저장합니다.
            </p>
          </a>
          <button
            type="button"
            onClick={onStartFromPosting}
            className="rounded-[20px] border border-border bg-background p-4 text-left transition-colors hover:border-primary/35 hover:bg-primary/[0.03]"
          >
            <PenLine className="h-5 w-5 text-primary" />
            <div className="mt-3 text-sm font-bold text-foreground">
              공고부터 먼저 입력
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              문항과 회사 정보부터 저장하고 경험은 나중에 붙입니다.
            </p>
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section
          id="resume-memo-start"
          className="rounded-[24px] border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Sparkles className="h-4 w-4 text-ai" />
            경험 메모로 시작
          </div>
          <input
            value={memoTitle}
            onChange={(event) => onMemoTitleChange(event.target.value)}
            placeholder="제목은 비워도 됩니다."
            className="mt-4 h-11 w-full rounded-[16px] border border-border bg-background px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-primary"
          />
          <textarea
            value={memoContent}
            onChange={(event) => onMemoContentChange(event.target.value)}
            placeholder="예: 결제 실패 알림 문구를 바꿔 클릭률을 18%에서 31%로 올렸습니다."
            className="mt-3 min-h-[150px] w-full resize-none rounded-[18px] border border-border bg-background px-4 py-3 text-sm leading-7 text-foreground outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-primary"
          />
          {memoError ? (
            <div className="mt-3 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
              {memoError}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onSaveMemo}
            disabled={isSavingMemo || !memoReady}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            {isSavingMemo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            경험 메모 저장
          </button>
        </section>

        <PdfStartSection
          fileInputRef={fileInputRef}
          pdfName={pdfName}
          isParsingPdf={isParsingPdf}
          isSavingBricks={isSavingBricks}
          uploadError={uploadError}
          parsedBricks={parsedBricks}
          selectedBrickIndexes={selectedBrickIndexes}
          onPdfChange={onPdfChange}
          onPickPdf={onPickPdf}
          onToggleBrickSelection={onToggleBrickSelection}
          onSaveSelectedBricks={onSaveSelectedBricks}
        />
      </div>
    </section>
  );
}
