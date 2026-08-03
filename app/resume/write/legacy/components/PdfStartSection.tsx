"use client";

import type { ChangeEvent, RefObject } from "react";
import clsx from "clsx";
import { CheckCircle2, FileText, FileUp, Loader2 } from "lucide-react";
import type { ParsedBrick } from "@/app/resume/write/legacy/components/resumeStartTypes";

type PdfStartSectionProps = {
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
  readonly pdfName: string;
  readonly isParsingPdf: boolean;
  readonly isSavingBricks: boolean;
  readonly uploadError: string | null;
  readonly parsedBricks: readonly ParsedBrick[];
  readonly selectedBrickIndexes: readonly number[];
  readonly onPdfChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onPickPdf: () => void;
  readonly onToggleBrickSelection: (index: number) => void;
  readonly onSaveSelectedBricks: () => void;
};

export function PdfStartSection({
  fileInputRef,
  pdfName,
  isParsingPdf,
  isSavingBricks,
  uploadError,
  parsedBricks,
  selectedBrickIndexes,
  onPdfChange,
  onPickPdf,
  onToggleBrickSelection,
  onSaveSelectedBricks,
}: PdfStartSectionProps) {
  const selectedBrickCount = selectedBrickIndexes.length;

  return (
    <section className="rounded-[24px] border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <FileUp className="h-4 w-4 text-primary" />
          PDF로 경험 추가
        </div>
        <button
          type="button"
          onClick={onPickPdf}
          disabled={isParsingPdf}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {isParsingPdf ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileUp className="h-4 w-4" />
          )}
          PDF 선택
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={onPdfChange}
      />
      <button
        type="button"
        onClick={onPickPdf}
        className={clsx(
          "mt-4 flex min-h-[150px] w-full flex-col items-center justify-center rounded-[22px] border-2 border-dashed px-5 text-center transition-colors",
          isParsingPdf
            ? "border-primary/40 bg-primary/[0.04]"
            : "border-border bg-background hover:border-primary/35 hover:bg-primary/[0.03]",
        )}
      >
        <FileText className="h-7 w-7 text-primary" />
        <div className="mt-3 text-sm font-bold text-foreground">
          {pdfName || "PDF를 드래그하거나 클릭해 업로드"}
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          이력서, 포트폴리오, 경력기술서를 사용할 수 있습니다.
        </p>
      </button>
      {uploadError ? (
        <div className="mt-3 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {uploadError}
        </div>
      ) : null}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs leading-5 text-muted-foreground">
          {parsedBricks.length > 0
            ? `${parsedBricks.length}개 후보 중 ${selectedBrickCount}개 선택됨`
            : "분석한 브릭 후보가 여기에 표시됩니다."}
        </p>
        <button
          type="button"
          onClick={onSaveSelectedBricks}
          disabled={isSavingBricks || selectedBrickCount === 0}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-background px-4 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          {isSavingBricks ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          선택 브릭 저장
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {parsedBricks.map((brick, index) => {
          const checked = selectedBrickIndexes.includes(index);
          return (
            <button
              key={`${brick.title}-${index}`}
              type="button"
              onClick={() => onToggleBrickSelection(index)}
              className={clsx(
                "w-full rounded-[18px] border p-3 text-left transition-colors",
                checked
                  ? "border-primary/30 bg-primary/[0.05]"
                  : "border-border bg-background hover:border-primary/25",
              )}
            >
              <div className="text-sm font-bold text-foreground">
                {brick.title}
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {brick.content}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
