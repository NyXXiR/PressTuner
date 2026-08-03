"use client";

import { useState } from "react";
import clsx from "clsx";
import {
  Loader2,
  MessageSquareText,
  Send,
  Bot,
  FilePlus2,
  X,
  PanelRightClose,
  PanelRightOpen,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import type { Brick, QuestionState } from "@/stores/useResumeWriteStore";
import type {
  AiPreview,
  PreviewTab,
} from "@/app/resume/write/legacy/components/FocusStep";

type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type Props = {
  activeIndex: number;
  activeQuestion: QuestionState;
  selectedBricks: Brick[];
  canMovePrev: boolean;
  canMoveNext: boolean;
  chatMessages: AiChatMessage[];
  chatInput: string;
  isChatLoading: boolean;
  isAiWorking: boolean;
  isGenerating: boolean;
  isSaving: boolean;
  isCapturingExperience?: boolean;
  isCompletingApplication?: boolean;
  allCompleted?: boolean;
  readOnly?: boolean;
  canCaptureExperience?: boolean;
  banner: string | null;
  error: string | null;
  aiPreview: AiPreview | null;
  previewTab: PreviewTab;
  originalSegments: { id: string; text: string; changed: boolean }[];
  revisedSegments: { id: string; text: string; changed: boolean }[];
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
  isAiPanelOpen?: boolean;
  onToggleAiPanel?: () => void;
  isAiChatOpen?: boolean;
  onSetAiChatOpen?: (open: boolean) => void;
  onBackToList: () => void;
  onMoveQuestion: (nextIndex: number) => void;
  onChangeAnswer: (value: string) => void;
  onCaptureExperience: () => void;
  onGenerate: () => void;
  onSave: (markComplete: boolean) => void;
  onCompleteApplication?: () => void;
  onOpenBrickPicker: () => void;
  onChatSubmit: (preset?: string) => void;
  onChangeChatInput: (value: string) => void;
  onApplyAiPreview: () => void;
  onDiscardAiPreview: () => void;
  onChangePreviewTab: (tab: PreviewTab) => void;
};

function AiChatContent({
  activeQuestion,
  chatMessages,
  chatInput,
  isChatLoading,
  isAiWorking,
  readOnly,
  banner,
  error,
  chatScrollRef,
  onChatSubmit,
  onChangeChatInput,
}: {
  activeQuestion: QuestionState;
  chatMessages: AiChatMessage[];
  chatInput: string;
  isChatLoading: boolean;
  isAiWorking: boolean;
  readOnly: boolean;
  banner: string | null;
  error: string | null;
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
  onChatSubmit: (preset?: string) => void;
  onChangeChatInput: (value: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 flex items-center justify-between text-sm font-semibold text-foreground px-1">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-primary" />
          AI 대화
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 shrink-0">
        <button
          onClick={() =>
            onChatSubmit("현재 답변을 더 간결하고 두괄식으로 다듬어줘.")
          }
          disabled={readOnly || isAiWorking || !activeQuestion.answer.trim()}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-foreground disabled:opacity-50 hover:bg-secondary transition-colors"
        >
          간결하게 다듬기
        </button>
        <button
          onClick={() => onChatSubmit("핵심 성과가 더 잘 드러나게 첨삭해줘.")}
          disabled={readOnly || isAiWorking || !activeQuestion.answer.trim()}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-foreground disabled:opacity-50 hover:bg-secondary transition-colors"
        >
          성과 강조
        </button>
        <button
          onClick={() =>
            onChatSubmit("새로운 경험을 추가해도 되니 설득력 있게 다시 써줘.")
          }
          disabled={readOnly || isAiWorking}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-foreground disabled:opacity-50 hover:bg-secondary transition-colors"
        >
          새 경험 반영
        </button>
      </div>
      <div
        ref={chatScrollRef}
        className="mt-4 flex-1 min-h-0 overflow-y-auto rounded-[16px] border border-border/60 bg-background/80 p-4 scrollbar-thin"
      >
        <div className="space-y-3">
          {chatMessages.length > 0 ? (
            chatMessages.map((message) => (
              <div
                key={message.id}
                className={clsx(
                  "rounded-[16px] px-4 py-3 text-[13px] sm:text-sm leading-7",
                  message.role === "user"
                    ? "ml-auto max-w-[90%] bg-foreground text-background rounded-tr-sm"
                    : "max-w-[90%] border border-primary/20 bg-primary/5 text-foreground rounded-tl-sm",
                )}
              >
                {message.text}
              </div>
            ))
          ) : (
            <div className="text-sm leading-7 text-muted-foreground text-center py-10">
              <p>어떻게 도와드릴까요?</p>
              <p className="mt-2 text-[12px] opacity-70">
                예: &quot;논리가 약한 부분을 보강해줘&quot;
                <br />
                &quot;새 인턴 경험을 추가해서 다시 써줘&quot;
              </p>
            </div>
          )}
          {isAiWorking && (
            <div className="max-w-[90%] rounded-[16px] rounded-tl-sm border border-border bg-secondary/55 px-4 py-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>AI가 요청을 반영해 수정안을 만드는 중입니다...</span>
              </div>
            </div>
          )}
          {isChatLoading && !isAiWorking && (
            <div className="max-w-[90%] rounded-[16px] rounded-tl-sm border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>이전 AI 대화를 불러오는 중입니다...</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 mt-4 rounded-[18px] border border-border bg-background p-3 shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
        <TextareaAutosize
          value={chatInput}
          readOnly={readOnly}
          onChange={(event) => onChangeChatInput(event.target.value)}
          onKeyDown={(event) => {
            if (readOnly) return;
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onChatSubmit();
            }
          }}
          minRows={2}
          maxRows={5}
          placeholder={
            activeQuestion.answer.trim()
              ? "예: 더 자신감 있는 톤으로 다듬어줘"
              : "예: 지원 동기가 먼저 드러나게 초안을 작성해줘"
          }
          className="w-full resize-none bg-transparent text-sm leading-7 text-foreground outline-none placeholder:text-muted-foreground/60 scrollbar-thin"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[10px] text-muted-foreground pl-1 hidden sm:block">
            Enter로 전송
          </p>
          <button
            onClick={() => onChatSubmit()}
            disabled={readOnly || !chatInput.trim() || isAiWorking}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl bg-foreground px-4 text-xs font-bold text-background disabled:opacity-50 hover:bg-foreground/90 transition-colors"
          >
            {isAiWorking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            요청
          </button>
        </div>
      </div>

      {(banner || error) && (
        <div
          className={clsx(
            "mt-4 rounded-xl border px-4 py-3 text-sm flex items-start gap-2 shrink-0",
            error
              ? "border-destructive/20 bg-destructive/5 text-destructive"
              : "border-primary/20 bg-primary/5 text-foreground",
          )}
        >
          {error || banner}
        </div>
      )}
    </div>
  );
}

export default function DraftEditor({
  activeIndex,
  activeQuestion,
  selectedBricks,
  canMovePrev,
  canMoveNext,
  chatMessages,
  chatInput,
  isChatLoading,
  isAiWorking,
  isGenerating,
  isSaving,
  isCapturingExperience = false,
  isCompletingApplication = false,
  allCompleted = false,
  readOnly = false,
  canCaptureExperience = false,
  banner,
  error,
  aiPreview,
  previewTab,
  originalSegments,
  revisedSegments,
  chatScrollRef,
  onBackToList,
  onMoveQuestion,
  onChangeAnswer,
  onCaptureExperience,
  onGenerate,
  onSave,
  onCompleteApplication,
  onOpenBrickPicker,
  onChatSubmit,
  onChangeChatInput,
  onApplyAiPreview,
  onDiscardAiPreview,
  onChangePreviewTab,
  isAiPanelOpen: controlledIsAiPanelOpen,
  onToggleAiPanel,
  isAiChatOpen: controlledIsAiChatOpen,
  onSetAiChatOpen,
}: Props) {
  const [localAiChatOpen, setLocalAiChatOpen] = useState(false);
  const isAiPanelOpen = controlledIsAiPanelOpen ?? true;
  const isAiChatOpen = controlledIsAiChatOpen ?? localAiChatOpen;
  const setIsAiChatOpen = onSetAiChatOpen ?? setLocalAiChatOpen;

  return (
    <div
      className={clsx(
        "grid gap-5 transition-all duration-300",
        isAiPanelOpen
          ? "lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]"
          : "lg:grid-cols-1",
      )}
    >
      {/* Main Editor */}
      <section
        data-tour-id="tour-draft-editor"
        className="flex flex-col rounded-[24px] border border-primary/20 bg-card shadow-[0_24px_80px_rgba(12,18,28,0.12)] ring-1 ring-primary/10"
      >
        <div className="flex flex-col gap-2 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-sm font-bold text-foreground">
                {aiPreview ? "AI 수정안 비교" : "초안 작성"}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {aiPreview
                  ? "요청을 반영한 수정안입니다. 하이라이트된 부분이 달라진 내용입니다."
                  : "먼저 여기서 문장의 흐름을 확인하세요."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleAiPanel}
              className="hidden lg:flex items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title={isAiPanelOpen ? "AI 패널 닫기" : "AI 패널 열기"}
            >
              {isAiPanelOpen ? (
                <PanelRightClose className="h-5 w-5" />
              ) : (
                <PanelRightOpen className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {!aiPreview ? (
          <div className="relative flex flex-col p-4 sm:p-5">
            <TextareaAutosize
              value={activeQuestion.answer}
              readOnly={readOnly}
              onChange={(event) => onChangeAnswer(event.target.value)}
              minRows={15}
              className="w-full resize-none bg-transparent text-[15px] leading-8 text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 sm:text-[16px]"
              placeholder="이곳에 문항 답변을 작성하세요."
            />
            {/* Character count - bottom right of textarea area */}
            <div className="absolute bottom-4 right-4 sm:bottom-5 sm:right-5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              {activeQuestion.answer.length} / {activeQuestion.charLimit}자
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="flex flex-wrap gap-2 border-b border-border/60 px-5 py-3 sm:px-6">
              {[
                { key: "compare", label: "비교하기" },
                { key: "revised", label: "수정본만" },
                { key: "original", label: "이전 내용만" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => onChangePreviewTab(tab.key as PreviewTab)}
                  className={clsx(
                    "rounded-full px-4 py-2 text-xs font-semibold transition-colors",
                    previewTab === tab.key
                      ? "bg-foreground text-background"
                      : "border border-border bg-background text-foreground hover:bg-secondary",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="p-4 sm:p-6 bg-secondary/20 min-h-[400px]">
              {previewTab === "compare" && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[20px] border border-border bg-background p-4 shadow-sm">
                    <div className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      이전 내용
                    </div>
                    <div className="space-y-2 text-[15px] leading-8 text-foreground sm:text-[16px]">
                      {originalSegments.map((segment) => (
                        <span
                          key={segment.id}
                          className={clsx(
                            "inline-block rounded px-1.5 py-0.5 transition-colors",
                            segment.changed &&
                              "bg-destructive/15 text-destructive-foreground dark:bg-destructive/20",
                          )}
                        >
                          {segment.text}{" "}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[20px] border border-border bg-background p-4 shadow-sm">
                    <div className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-primary">
                      수정안
                    </div>
                    <div className="space-y-2 text-[15px] leading-8 text-foreground sm:text-[16px]">
                      {revisedSegments.map((segment) => (
                        <span
                          key={segment.id}
                          className={clsx(
                            "inline-block rounded px-1.5 py-0.5 transition-colors",
                            segment.changed &&
                              "bg-success/15 text-success-foreground dark:bg-success/20",
                          )}
                        >
                          {segment.text}{" "}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {previewTab === "revised" && (
                <div className="rounded-[20px] border border-border bg-background p-5 shadow-sm">
                  <div className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-primary">
                    수정안만 보기
                  </div>
                  <div className="text-[15px] leading-8 text-foreground sm:text-[16px]">
                    {revisedSegments.map((segment) => (
                      <span
                        key={segment.id}
                        className={clsx(
                          "inline-block rounded px-1.5 py-0.5 transition-colors",
                          segment.changed &&
                            "bg-success/15 text-success-foreground dark:bg-success/20",
                        )}
                      >
                        {segment.text}{" "}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {previewTab === "original" && (
                <div className="rounded-[20px] border border-border bg-background p-5 shadow-sm">
                  <div className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    이전 내용만 보기
                  </div>
                  <div className="text-[15px] leading-8 text-foreground sm:text-[16px]">
                    {originalSegments.map((segment) => (
                      <span
                        key={segment.id}
                        className={clsx(
                          "inline-block rounded px-1.5 py-0.5 transition-colors",
                          segment.changed &&
                            "bg-destructive/15 text-destructive-foreground dark:bg-destructive/20",
                        )}
                      >
                        {segment.text}{" "}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border/60 bg-background px-4 py-4 sm:px-6 rounded-b-[24px]">
              <div className="text-xs text-muted-foreground">
                현재 답변은 아직 바뀌지 않았습니다.
              </div>
              <div className="flex w-full sm:w-auto items-center gap-2">
                <button
                  onClick={onDiscardAiPreview}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-6 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-50 transition-colors"
                >
                  적용 취소
                </button>
                <button
                  onClick={onApplyAiPreview}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-6 text-sm font-bold text-background hover:bg-foreground/90 disabled:opacity-50 shadow-sm transition-all"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  수정안 적용
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {!aiPreview && (
          <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border/60 bg-muted/95 backdrop-blur px-3 py-3 sm:px-5 rounded-b-[24px]">
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => onMoveQuestion(activeIndex - 1)}
                disabled={!canMovePrev}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-secondary disabled:opacity-30"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => onMoveQuestion(activeIndex + 1)}
                disabled={!canMoveNext}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-secondary disabled:opacity-30"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={onCaptureExperience}
                disabled={
                  readOnly || isCapturingExperience || !canCaptureExperience
                }
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-ai/30 bg-ai/10 px-3 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-ai/15 disabled:opacity-50"
              >
                {isCapturingExperience ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-ai" />
                ) : (
                  <FilePlus2 className="h-3.5 w-3.5 text-ai" />
                )}
                <span className="hidden sm:inline">경험 저장 후보</span>
                <span className="sm:hidden">경험</span>
              </button>
              <button
                onClick={() => onSave(false)}
                disabled={readOnly || isSaving}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-background px-4 text-xs sm:text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary disabled:opacity-50 shrink-0"
              >
                임시저장
              </button>
              <button
                onClick={() => onSave(true)}
                disabled={readOnly || isSaving}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-foreground px-4 text-xs sm:text-sm font-bold text-background shadow-sm transition-colors hover:bg-foreground/90 disabled:opacity-50 shrink-0"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                완료 처리
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Floating AI Button (Mobile) */}
      <button
        onClick={() => setIsAiChatOpen(true)}
        className={clsx(
          "lg:hidden fixed z-40 inline-flex h-14 w-14 items-center justify-center rounded-full border border-border bg-primary text-primary-foreground shadow-xl transition-all duration-300 hover:scale-[1.03] hover:bg-primary/90 active:scale-[0.98]",
          "bottom-24 right-4",
        )}
        aria-label="AI 대화 열기"
      >
        <Bot className="h-6 w-6" />
      </button>

      {/* Floating AI Button (Desktop - only when panel is closed) */}
      {!isAiPanelOpen && (
        <button
          onClick={onToggleAiPanel}
          className={clsx(
            "hidden lg:inline-flex fixed z-40 h-14 w-14 items-center justify-center rounded-full border border-border bg-primary text-primary-foreground shadow-xl transition-all duration-300 hover:scale-[1.03] hover:bg-primary/90 active:scale-[0.98]",
            "bottom-6 right-6",
          )}
          aria-label="AI 패널 열기"
        >
          <Bot className="h-6 w-6" />
        </button>
      )}

      {/* Desktop: Right Panel (Grid Column) */}
      {isAiPanelOpen && (
        <section
          data-tour-id="tour-ai-chat"
          className="hidden lg:flex flex-col rounded-[24px] border border-border/60 bg-muted/35 p-4 shadow-sm ring-1 ring-border/5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-100px)]"
        >
          <AiChatContent
            activeQuestion={activeQuestion}
            chatMessages={chatMessages}
            chatInput={chatInput}
            isChatLoading={isChatLoading}
            isAiWorking={isAiWorking}
            readOnly={readOnly ?? false}
            banner={banner}
            error={error}
            chatScrollRef={chatScrollRef}
            onChatSubmit={onChatSubmit}
            onChangeChatInput={onChangeChatInput}
          />
        </section>
      )}

      {/* Mobile: Bottom Sheet */}
      <div className="lg:hidden fixed inset-0 z-50 pointer-events-none">
        {/* Backdrop */}
        <div
          className={clsx(
            "absolute inset-0 transition-opacity duration-300",
            isAiChatOpen ? "pointer-events-auto bg-black/40" : "opacity-0",
          )}
          onClick={() => setIsAiChatOpen(false)}
          aria-hidden={!isAiChatOpen}
        />
        {/* Bottom Sheet */}
        <div
          data-tour-id="tour-ai-chat"
          className={clsx(
            "pointer-events-auto absolute bottom-0 left-0 right-0 z-10 rounded-t-2xl border-t border-border bg-card shadow-2xl transition-transform duration-300 ease-out",
            isAiChatOpen ? "translate-y-0" : "translate-y-full",
          )}
          style={{ height: "min(70vh, 600px)" }}
        >
          <div className="flex h-full flex-col p-5">
            {/* Drag handle */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
            <div className="shrink-0 flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <MessageSquareText className="h-4 w-4 text-primary" />
                AI 대화
              </div>
              <button
                onClick={() => setIsAiChatOpen(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <AiChatContent
                activeQuestion={activeQuestion}
                chatMessages={chatMessages}
                chatInput={chatInput}
                isChatLoading={isChatLoading}
                isAiWorking={isAiWorking}
                readOnly={readOnly ?? false}
                banner={banner}
                error={error}
                chatScrollRef={chatScrollRef}
                onChatSubmit={onChatSubmit}
                onChangeChatInput={onChangeChatInput}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
