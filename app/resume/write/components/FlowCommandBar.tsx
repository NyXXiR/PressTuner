"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Loader2, PencilLine } from "lucide-react";

import type { FlowQuestion } from "@/domain/resume-writing/flowMachine";

type FlowCommandBarProps = {
  readonly question: FlowQuestion;
  readonly onSendPrompt: (prompt: string) => void;
};

const QUICK_PROMPTS = [
  "두괄식으로 바꿔줘",
  "성과 수치를 선명하게",
  "더 간결하게 다듬어줘",
] as const;

function statusLine(question: FlowQuestion): string | null {
  if (question.suggestionStatus === "pending") return null;
  if (question.pendingSuggestion) {
    return "수정안이 도착했어요. 위에서 비교한 뒤 적용 여부를 선택하세요.";
  }
  const lastAssistant = [...question.messages]
    .reverse()
    .find((message) => message.role === "assistant");
  return lastAssistant?.body ?? null;
}

const MAX_TEXTAREA_HEIGHT = 160;

export function FlowCommandBar({ question, onSendPrompt }: FlowCommandBarProps) {
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const completed = question.status === "completed";
  const thinking = question.suggestionStatus === "pending";
  const canChat =
    Boolean(question.answer.trim()) &&
    !completed &&
    !thinking &&
    !question.pendingSuggestion;
  const status = statusLine(question);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = `${nextHeight}px`;
  };

  useEffect(() => {
    resizeTextarea();
  }, [prompt]);

  const sendPrompt = (value: string) => {
    onSendPrompt(value);
    setPrompt("");
    requestAnimationFrame(() => {
      resizeTextarea();
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (prompt.trim() && canChat) sendPrompt(prompt);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    if (prompt.trim() && canChat) sendPrompt(prompt);
  };

  return (
    <section
      aria-label="AI 첨삭 요청"
      className="border-[1.5px] border-dashed border-ai bg-ai-soft/60 p-4"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.14em] text-ai">
        <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
        연필 — AI 첨삭
      </p>
      <div
        className="flex items-start gap-2 py-2 text-xs leading-5"
        aria-live="polite"
      >
        {thinking ? (
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            요청을 반영한 수정안을 만들고 있어요…
          </span>
        ) : question.suggestionStatus === "error" && question.suggestionError ? (
          <span role="alert" className="text-destructive">
            {question.suggestionError}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {completed
              ? "완료된 문항입니다. 수정하려면 위에서 다시 열어주세요."
              : (status ??
                "방향을 말하면 수정안을 만들어 원고 옆에 나란히 보여드려요. 적용 전까지 원고는 바뀌지 않습니다.")}
          </span>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {QUICK_PROMPTS.map((quickPrompt) => (
          <button
            key={quickPrompt}
            type="button"
            onClick={() => sendPrompt(quickPrompt)}
            disabled={!canChat}
            className="border border-ai/50 bg-card px-3 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:border-ai hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai disabled:cursor-not-allowed disabled:opacity-40"
          >
            {quickPrompt}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <label className="sr-only" htmlFor="flow-command-prompt">
          첨삭 요청
        </label>
        <textarea
          ref={textareaRef}
          id="flow-command-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!canChat}
          placeholder={
            completed
              ? "완료된 문항입니다."
              : thinking
                ? "수정안을 기다리는 중입니다."
                : "예: 협업 과정이 잘 보이게 다듬어줘"
          }
          className="min-h-11 flex-1 resize-none overflow-y-auto border border-input bg-card px-3.5 py-3 text-sm leading-5 outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          aria-label="첨삭 요청 보내기"
          disabled={!canChat || !prompt.trim()}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
