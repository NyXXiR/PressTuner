"use client";

import { useRef, useState } from "react";

import type { PressAiCheckpointAttempt } from "@/lib/pressAiProcessDebuggerClient";
import { PressAiAttemptComparison } from "./PressAiAttemptComparison";
import { PressAiAttemptHistory } from "./PressAiAttemptHistory";
import { PressAiCasePanel } from "./PressAiCasePanel";

const TABS = [
  { id: "history", label: "시도 기록" },
  { id: "cases", label: "테스트 케이스" },
  { id: "comparison", label: "이전 시도 비교" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Secondary tools collapsed into one tab strip so they stop stretching the page. */
export function PressAiSidePanels(props: {
  attempt: PressAiCheckpointAttempt;
  busy: boolean;
  refreshKey: string;
  onOpen: (attemptId: string) => void;
  onSaveCase: Parameters<typeof PressAiCasePanel>[0]["onSave"];
}) {
  const [tab, setTab] = useState<TabId>("history");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (delta: number) => {
    const index = TABS.findIndex((item) => item.id === tab);
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  };
  return (
    <div className="min-w-0">
      <div
        role="tablist"
        aria-label="디버거 보조 도구"
        className="flex gap-1 rounded-xl border border-border p-1"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            move(1);
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(-1);
          }
        }}
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            ref={(element) => {
              tabRefs.current[item.id] = element;
            }}
            type="button"
            role="tab"
            id={`press-ai-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`press-ai-tabpanel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            className={`min-h-10 flex-1 rounded-lg px-2 text-xs font-black transition-colors ${
              tab === item.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`press-ai-tabpanel-${tab}`}
        aria-labelledby={`press-ai-tab-${tab}`}
        className="mt-3 min-w-0"
      >
        {tab === "history" ? (
          <PressAiAttemptHistory
            attemptId={props.attempt.id}
            refreshKey={props.refreshKey}
            onOpen={props.onOpen}
          />
        ) : null}
        {tab === "cases" ? (
          <PressAiCasePanel
            checkpoints={props.attempt.checkpoints}
            busy={props.busy}
            onSave={props.onSaveCase}
            onOpenAttempt={props.onOpen}
          />
        ) : null}
        {tab === "comparison" ? (
          <PressAiAttemptComparison
            attemptId={props.attempt.id}
            refreshKey={props.refreshKey}
          />
        ) : null}
      </div>
    </div>
  );
}
