"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Loader2, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  useResumeAiPanelStore,
  type ResumeAiPanelMessage,
} from "@/stores/useResumeAiPanelStore";
import { useRightPanelStore } from "@/stores/rightPanelStore";
import { AssistantMessageBubble } from "@/components/common/AssistantMessageBubble";
import { getAiPanelClientErrorMessage } from "@/lib/aiPanelClientError";

export function ResumeGuideAssistant() {
  const pathname = usePathname();
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const togglePanel = useRightPanelStore((state) => state.toggle);
  const messages = useResumeAiPanelStore((state) => state.guideMessages);
  const guideLastPathname = useResumeAiPanelStore((state) => state.guideLastPathname);
  const setGuideMessages = useResumeAiPanelStore((state) => state.setGuideMessages);
  const appendGuideMessage = useResumeAiPanelStore((state) => state.appendGuideMessage);
  const setGuideLastPathname = useResumeAiPanelStore(
    (state) => state.setGuideLastPathname,
  );
  const clearGuideMessages = useResumeAiPanelStore((state) => state.clearGuideMessages);

  const createMessageId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  useEffect(() => {
    if (messages.length === 0) {
      setGuideMessages([
        {
          id: createMessageId(),
          role: "assistant",
          body: "필요한 걸 물어보면 관련 페이지를 찾아서 바로 안내할게요.",
          tone: "neutral",
        },
      ]);
      setGuideLastPathname(pathname);
      return;
    }

    if (guideLastPathname !== pathname) {
      setGuideLastPathname(pathname);
    }
  }, [
    guideLastPathname,
    messages.length,
    pathname,
    setGuideLastPathname,
    setGuideMessages,
  ]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, isRunning]);

  const appendMessage = (message: Omit<ResumeAiPanelMessage, "id">) => {
    appendGuideMessage({
      id: createMessageId(),
      ...message,
    });
  };

  const buildRecentMessages = (nextUserMessage: string) => {
    const recent = messages.slice(-5).map((message) => ({
      role: message.role,
      body: message.body,
    }));

    return [...recent, { role: "user" as const, body: nextUserMessage }];
  };

  const handleSubmit = async () => {
    const message = input.trim();
    if (!message || isRunning) return;

    setIsRunning(true);
    appendMessage({ role: "user", body: message });
    setInput("");

    try {
      const res = await fetch("/api/resume/guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          pathname,
          recentMessages: buildRecentMessages(message),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(
          getAiPanelClientErrorMessage(res.status, json, "AI 응답 생성에 실패했습니다."),
        );
      }

      appendMessage({
        role: "assistant",
        body: json.data.answer,
        links: json.data.links,
      });
    } catch (err: any) {
      appendMessage({
        role: "assistant",
        body: err?.message ?? "AI 응답 생성에 실패했습니다.",
        tone:
          err?.message?.includes("잠시 제한") || err?.message?.includes("잠깐 쉬어가")
            ? "neutral"
            : "error",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleClear = () => {
    clearGuideMessages();
    setInput("");
  };

  return (
    <div className="h-full min-h-0">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={togglePanel}
                className="inline-flex shrink-0 items-center justify-center border border-border bg-background p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="AI 패널 접기"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">AI Assistant</div>
                <div className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                  필요한 페이지를 바로 찾고 안내합니다.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClear}
              aria-label="대화 비우기"
              className="inline-flex items-center justify-center border border-red-500/30 bg-red-500/10 p-1.5 text-red-600 transition-colors hover:bg-red-500/15 hover:text-red-700 dark:border-red-400/30 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-3">
            {messages.map((message) => (
              <AssistantMessageBubble
                key={message.id}
                role={message.role}
                tone={message.tone}
              >
                  <p className="whitespace-pre-wrap leading-relaxed">{message.body}</p>
                  {!!message.links?.length && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.links.map((link) => (
                        <Link
                          key={`${link.href}-${link.label}`}
                          href={link.href}
                          className="border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  )}
              </AssistantMessageBubble>
            ))}

            {isRunning && (
              <div className="flex justify-start">
                <div className="border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                  답변을 준비하고 있습니다...
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border px-4 py-3">
          <div className="border border-border bg-background p-3">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="예: 내 이력서 등록 어디서해? / 나 이제 뭐부터 하면 돼?"
              className="h-20 w-full resize-none bg-transparent px-1 py-1 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">Enter 전송, Shift+Enter 줄바꿈</p>
              <button
                onClick={() => void handleSubmit()}
                disabled={!input.trim() || isRunning}
                className="inline-flex items-center gap-2 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-primary/20 transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                전송
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
