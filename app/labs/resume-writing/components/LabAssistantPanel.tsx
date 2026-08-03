import {
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, MessageSquareText } from "lucide-react";

import type { LabQuestion } from "@/domain/resume-writing/labMachine";

import type { LabDispatch } from "./labViewTypes";

const QUICK_PROMPTS = [
  "성과 수치를 더 선명하게 보여줘",
  "첫 문장을 두괄식으로 바꿔줘",
  "협업 과정이 잘 보이게 다듬어줘",
] as const;

type LabAssistantPanelProps = {
  readonly question: LabQuestion;
  readonly onAction: LabDispatch;
};

export function LabAssistantPanel({ question, onAction }: LabAssistantPanelProps) {
  const [prompt, setPrompt] = useState("");
  const completed = question.status === "completed";
  const canChat = Boolean(question.answer.trim()) && !completed;

  const sendPrompt = (value: string) => {
    onAction({ type: "send_prompt", prompt: value });
    setPrompt("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (prompt.trim()) sendPrompt(prompt);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.nativeEvent.isComposing ||
      event.key !== "Enter" ||
      event.shiftKey
    ) {
      return;
    }
    event.preventDefault();
    if (prompt.trim()) sendPrompt(prompt);
  };

  return (
    <aside className="flex min-h-[min(650px,82dvh)] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-label="AI 첨삭 도우미">
      <header className="border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-ai-soft text-ai">
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-bold">AI 첨삭 도우미</h2>
            <p className="text-[11px] text-muted-foreground">원하는 수정 방향을 말해보세요.</p>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {question.messages.length === 0 && (
          <div className="rounded-xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
            초안을 만든 뒤 아래 빠른 요청을 누르거나 직접 첨삭 방향을 입력할 수 있습니다.
          </div>
        )}
        {question.messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <p className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-5 ${
              message.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}>
              {message.body}
            </p>
          </div>
        ))}
        {question.pendingSuggestion && (
          <p className="rounded-xl border border-ai/30 bg-ai-soft p-3 text-xs leading-5 text-foreground">
            수정안을 만들었습니다. 왼쪽 에디터에서 이전 내용과 비교한 뒤 적용 여부를 선택하세요.
          </p>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((quickPrompt) => (
            <button
              key={quickPrompt}
              type="button"
              onClick={() => sendPrompt(quickPrompt)}
              disabled={!canChat}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:border-ai/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai disabled:cursor-not-allowed disabled:opacity-40"
            >
              {quickPrompt}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <label className="sr-only" htmlFor="lab-assistant-prompt">첨삭 요청</label>
          <textarea
            id="lab-assistant-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!canChat}
            rows={2}
            placeholder={completed ? "완료된 문항입니다." : "예: 이 문장을 더 간결하게 바꿔줘"}
            className="min-h-11 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-xs leading-5 outline-none transition-colors focus:border-ai focus:ring-2 focus:ring-ai/20 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="submit"
            aria-label="첨삭 요청 보내기"
            disabled={!canChat || !prompt.trim()}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ai text-ai-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      </div>
    </aside>
  );
}
