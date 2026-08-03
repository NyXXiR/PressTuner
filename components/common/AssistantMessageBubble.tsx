"use client";

import { type ReactNode } from "react";
import clsx from "clsx";

type Props = {
  role: "user" | "assistant";
  tone?: "neutral" | "success" | "error";
  children: ReactNode;
};

export function AssistantMessageBubble({ role, tone = "neutral", children }: Props) {
  const isUser = role === "user";

  return (
    <div className={clsx("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={clsx("max-w-[94%]", isUser ? "items-end" : "items-start")}>
        <div
          className={clsx(
            "mb-1 px-1 text-[10px] font-semibold tracking-[0.12em]",
            isUser ? "text-primary" : "text-muted-foreground",
          )}
        >
          {isUser ? "ME" : "AI"}
        </div>
        <div
          className={clsx(
            "border px-4 py-3 text-sm",
            isUser && "border-primary/30 bg-primary text-primary-foreground",
            !isUser &&
              tone === "neutral" &&
              "border-border/80 bg-muted/35 text-foreground",
            !isUser &&
              tone === "success" &&
              "border-emerald-500/30 bg-emerald-500/10 text-foreground",
            !isUser &&
              tone === "error" &&
              "border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
