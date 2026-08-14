"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Loader2,
  Play,
  Send,
  Trash2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useRightPanelStore } from "@/stores/rightPanelStore";
import { usePressEditStore } from "@/stores/usePressEditStore";
import {
  usePressAiPanelStore,
  type PressAiPanelMessage,
} from "@/stores/usePressAiPanelStore";
import { AssistantMessageBubble } from "@/components/common/AssistantMessageBubble";
import { getAiPanelClientErrorMessage } from "@/lib/aiPanelClientError";
import {
  agentRunMessage,
  agentStatusNotice,
} from "@/lib/pressAgentClientPresentation";
import { emitAiOperationOutcome } from "@/lib/analytics/aiOperationOutcome";

type PlannedAction = {
  id: string;
  type:
    | "analyze_article"
    | "rewrite_article"
    | "apply_pending_result"
    | "save_article"
    | "finalize_article";
  instruction: string | null;
  title: string;
  description: string;
  quotaCost: number;
  estimatedTokens: number;
  requiresConfirmation: boolean;
};

type CommandPlan = {
  summary: string;
  totalQuotaCost: number;
  totalEstimatedTokens: number;
  actions: PlannedAction[];
};

type AgentApproval = {
  id: string;
  toolName: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  toolInput?: {
    arguments?: {
      title?: string;
      body?: string;
    };
  };
};

type AgentRunView = {
  id: string;
  operationId?: string | null;
  vendorOperationId?: string | null;
  vendorProjectId?: string | null;
  vendorEnvironment?: string | null;
  vendorServiceName?: string | null;
  status:
    | "PENDING"
    | "RUNNING"
    | "WAITING_APPROVAL"
    | "COMPLETED"
    | "FAILED";
  output?: {
    answer?: string;
    summary?: string;
    sourceIds?: string[];
  } | null;
  errorMessage?: string | null;
  canRetry: boolean;
  feedback: {
    usefulness: "POSITIVE" | "NEGATIVE" | null;
    citationAccuracy: "POSITIVE" | "NEGATIVE" | null;
  } | null;
  approvals: AgentApproval[];
  citations: Array<{
    id: string;
    documentId: string;
    sourceId: string;
    documentName: string;
    pageStart: number;
    pageEnd: number;
  }>;
};

function FeedbackButtons(props: {
  label: string;
  positiveLabel: string;
  negativeLabel: string;
  value: "POSITIVE" | "NEGATIVE" | null;
  pending: boolean;
  onSelect: (rating: "POSITIVE" | "NEGATIVE") => void;
}) {
  return (
    <div>
      <p className="font-medium">{props.label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {[
          ["POSITIVE", props.positiveLabel],
          ["NEGATIVE", props.negativeLabel],
        ].map(([rating, label]) => (
          <button
            key={rating}
            type="button"
            aria-pressed={props.value === rating}
            disabled={props.pending}
            onClick={() => props.onSelect(rating as "POSITIVE" | "NEGATIVE")}
            className={clsx(
              "min-h-11 border px-3 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50",
              props.value === rating
                ? "border-primary bg-primary/10 text-primary"
                : "border-border",
            )}
          >
            {props.pending && props.value === rating && (
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
            )}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PressAssistantBar() {
  const togglePanel = useRightPanelStore((state) => state.toggle);
  const {
    articleId,
    title,
    plain,
    notes,
    selectedNoteIds,
    reviewing,
    saveState,
    pendingResult,
    usage,
    setSelectedNoteIds,
    toggleNoteSelection,
    runReview,
    runRePolish,
    applyPendingResult,
    saveDraft,
    completeWriting,
  } = usePressEditStore();
  const {
    editMessages,
    editSessionKey,
    setEditMessages,
    appendEditMessage,
    setEditSessionKey,
    clearEditMessages,
  } = usePressAiPanelStore();

  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<CommandPlan | null>(null);
  const [agentRun, setAgentRun] = useState<AgentRunView | null>(null);
  const [executingActionIds, setExecutingActionIds] = useState<string[]>([]);
  const [feedbackPending, setFeedbackPending] = useState<
    "usefulness" | "citationAccuracy" | null
  >(null);
  const [agentStatus, setAgentStatus] = useState<ReturnType<
    typeof agentStatusNotice
  > | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const createMessageId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const introMessage =
    notes.length > 0
      ? "오른쪽에서 분석 결과를 보고, 수정할 포인트를 골라 재작성까지 이어갈 수 있습니다."
      : "원고를 분석하거나, 톤 수정과 문장 다듬기 요청을 실행 계획으로 정리해드릴게요.";

  useEffect(() => {
    if (!articleId) return;

    if (editSessionKey !== articleId) {
      setEditSessionKey(articleId);
      setEditMessages([
        {
          id: createMessageId(),
          role: "assistant",
          body: introMessage,
          tone: "neutral",
        },
      ]);
      return;
    }

    if (editMessages.length === 0) {
      setEditMessages([
        {
          id: createMessageId(),
          role: "assistant",
          body: introMessage,
          tone: "neutral",
        },
      ]);
    }
  }, [
    articleId,
    editMessages.length,
    editSessionKey,
    introMessage,
    setEditMessages,
    setEditSessionKey,
  ]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [editMessages.length, isRunning, pendingPlan, executingActionIds.length]);

  const appendMessage = (message: Omit<PressAiPanelMessage, "id">) => {
    appendEditMessage({
      id: createMessageId(),
      ...message,
    });
  };

  const observeAgentRun = (run: AgentRunView) => {
    setAgentRun(run);
    emitAiOperationOutcome({
      vendorOperationId: run.vendorOperationId,
      vendorProjectId: run.vendorProjectId,
      vendorEnvironment: run.vendorEnvironment,
      vendorServiceName: run.vendorServiceName,
      status: run.status,
    });
    return run;
  };

  const selectedCount = selectedNoteIds.length;
  const contextLine = [
    title || "제목 없음",
    `${plain.length}자`,
    `노트 ${notes.length}개`,
    selectedCount > 0 ? `선택 ${selectedCount}개` : null,
    pendingResult ? "수정안 준비됨" : null,
    saveState,
    usage?.article
      ? usage.article.unlimited
        ? "AI 무제한"
        : `AI ${usage.article.polishRemaining}/${usage.article.polishLimit}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const requestAgentRun = async (prompt: string) => {
    const res = await fetch("/api/press/agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, articleId }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(
        getAiPanelClientErrorMessage(
          res.status,
          json,
          "Press Agent 실행에 실패했습니다.",
        ),
      );
    }
    return json.run as AgentRunView;
  };

  const decideAgentApproval = async (
    approvalId: string,
    decision: "APPROVED" | "REJECTED",
  ) => {
    if (!agentRun) return;
    setIsRunning(true);
    try {
      const res = await fetch(
        `/api/press/agent/runs/${agentRun.id}/approvals/${approvalId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.message ?? "승인 처리에 실패했습니다.");
      }
      const nextRun = json.run as AgentRunView;
      observeAgentRun(nextRun);
      appendMessage({
        role: "assistant",
        body:
          nextRun.output?.answer ??
          (decision === "APPROVED"
            ? "승인된 작업을 실행했습니다."
            : "작업을 거절하고 실행을 이어갔습니다."),
        tone: nextRun.status === "FAILED" ? "error" : "success",
      });
      if (decision === "APPROVED" && nextRun.status === "COMPLETED") {
        window.location.reload();
      }
    } catch (error: any) {
      appendMessage({
        role: "assistant",
        body: error?.message ?? "승인 처리에 실패했습니다.",
        tone: "error",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const refreshAgentRun = async () => {
    if (!agentRun) return null;
    const response = await fetch(`/api/press/agent/runs/${agentRun.id}`, {
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.message ?? "실행 상태를 불러오지 못했습니다.");
    return observeAgentRun(body.run as AgentRunView);
  };

  const retryAgentRun = async () => {
    if (!agentRun || isRunning) return;
    setIsRunning(true);
    setAgentStatus(agentStatusNotice("Press Agent를 다시 시도하고 있습니다."));
    try {
      const response = await fetch(
        `/api/press/agent/runs/${agentRun.id}/retry`,
        { method: "POST" },
      );
      const body = await response.json();
      if (response.status === 409) {
        const refreshed = await refreshAgentRun();
        if (
          refreshed &&
          (refreshed.status === "COMPLETED" || refreshed.status === "FAILED")
        ) {
          appendMessage({ role: "assistant", ...agentRunMessage(refreshed) });
        }
        setAgentStatus(agentStatusNotice("최신 실행 상태로 새로고침했습니다."));
        return;
      }
      if (!response.ok) throw new Error(body?.message ?? "재시도에 실패했습니다.");
      const nextRun = body.run as AgentRunView;
      observeAgentRun(nextRun);
      appendMessage({ role: "assistant", ...agentRunMessage(nextRun) });
      setAgentStatus(
        agentStatusNotice(
          nextRun.status === "FAILED"
            ? "재시도가 실패했습니다. 다시 시도할 수 있습니다."
            : "재시도가 완료되었습니다.",
          nextRun.status === "FAILED",
        ),
      );
    } catch (cause) {
      setAgentStatus(
        agentStatusNotice(
          cause instanceof Error ? cause.message : String(cause),
          true,
        ),
      );
    } finally {
      setIsRunning(false);
    }
  };

  const saveFeedback = async (
    dimension: "usefulness" | "citationAccuracy",
    rating: "POSITIVE" | "NEGATIVE",
  ) => {
    if (!agentRun) return;
    setFeedbackPending(dimension);
    setAgentStatus(agentStatusNotice("피드백을 저장하고 있습니다."));
    try {
      const response = await fetch(
        `/api/press/agent/runs/${agentRun.id}/feedback`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [dimension]: rating }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message ?? "피드백 저장에 실패했습니다.");
      setAgentRun((current) =>
        current ? { ...current, feedback: body.feedback } : current,
      );
      setAgentStatus(agentStatusNotice("피드백이 저장되었습니다."));
    } catch (cause) {
      setAgentStatus(
        agentStatusNotice(
          cause instanceof Error ? cause.message : String(cause),
          true,
        ),
      );
    } finally {
      setFeedbackPending(null);
    }
  };

  const executeAction = async (action: PlannedAction) => {
    switch (action.type) {
      case "analyze_article": {
        await runReview();
        const nextNotes = usePressEditStore.getState().notes;
        return nextNotes.length > 0
          ? `분석을 마쳤습니다. 현재 ${nextNotes.length}개의 수정 포인트가 있습니다.`
          : "분석을 마쳤습니다. 큰 수정 포인트는 발견되지 않았습니다.";
      }
      case "rewrite_article": {
        let nextNotes = notes;
        if (nextNotes.length === 0) {
          await runReview();
          nextNotes = usePressEditStore.getState().notes;
        }
        const targetIds =
          selectedNoteIds.length > 0 ? selectedNoteIds : nextNotes.map((note) => note.id);
        if (targetIds.length === 0) {
          throw new Error("재작성할 분석 포인트를 찾지 못했습니다.");
        }
        setSelectedNoteIds(targetIds);
        await runRePolish(action.instruction ?? "보도자료 톤에 맞게 더 매끄럽게 다듬어줘.");
        const nextPending = usePressEditStore.getState().pendingResult;
        if (!nextPending) {
          throw new Error("수정안 준비에 실패했습니다.");
        }
        return nextNotes.length > 0
          ? "필요한 분석을 반영해 수정안을 준비했습니다. 검토 후 반영할 수 있습니다."
          : "수정안을 준비했습니다. 검토 후 반영할 수 있습니다.";
      }
      case "apply_pending_result": {
        if (!pendingResult) {
          throw new Error("반영할 수정안이 없습니다.");
        }
        await applyPendingResult();
        return "준비된 수정안을 원고에 반영했습니다.";
      }
      case "save_article": {
        const ok = await saveDraft({ force: true });
        if (!ok) {
          throw new Error("원고 저장에 실패했습니다.");
        }
        return "현재 원고를 저장했습니다.";
      }
      case "finalize_article": {
        const ok = await completeWriting();
        if (!ok) {
          throw new Error("작성 완료 처리에 실패했습니다.");
        }
        return "원고를 완료 상태로 변경했습니다.";
      }
      default:
        throw new Error("지원하지 않는 작업입니다.");
    }
  };

  const removePlanActions = (actionIds: string[]) => {
    setPendingPlan((prev) => {
      if (!prev) return null;
      const remainingActions = prev.actions.filter(
        (action) => !actionIds.includes(action.id),
      );
      if (remainingActions.length === 0) {
        return null;
      }
      return {
        ...prev,
        actions: remainingActions,
        totalQuotaCost: remainingActions.reduce(
          (sum, action) => sum + action.quotaCost,
          0,
        ),
        totalEstimatedTokens: remainingActions.reduce(
          (sum, action) => sum + action.estimatedTokens,
          0,
        ),
      };
    });
  };

  const dismissPendingPlan = () => {
    if (executingActionIds.length > 0) return;
    setPendingPlan(null);
  };

  const dismissPendingAction = (actionId: string) => {
    if (executingActionIds.length > 0) return;
    removePlanActions([actionId]);
  };

  const handleExecuteActions = async (actions: PlannedAction[]) => {
    if (actions.length === 0) return;

    setExecutingActionIds(actions.map((action) => action.id));
    const completedIds: string[] = [];

    try {
      for (const action of actions) {
        const result = await executeAction(action);
        completedIds.push(action.id);
        appendMessage({
          role: "assistant",
          body: `${action.title}\n${result}`,
          tone: "success",
        });
      }
      removePlanActions(completedIds);
    } catch (error: any) {
      appendMessage({
        role: "assistant",
        body: error?.message ?? "계획 실행 중 오류가 발생했습니다.",
        tone: "error",
      });
      removePlanActions(completedIds);
    } finally {
      setExecutingActionIds([]);
    }
  };

  const handleSubmit = async () => {
    const command = input.trim();
    if (!command || isRunning) return;

    setIsRunning(true);
    appendMessage({ role: "user", body: command });
    setInput("");

    try {
      const nextRun = await requestAgentRun(command);
      setPendingPlan(null);
      observeAgentRun(nextRun);
      appendMessage({
        role: "assistant",
        body:
          nextRun.status === "WAITING_APPROVAL"
            ? "근거 검색과 검증을 마쳤습니다. 원고에 반영하려면 아래 작업을 승인해주세요."
            : nextRun.output?.answer ??
              nextRun.output?.summary ??
              "Press Agent 실행을 마쳤습니다.",
        tone: nextRun.status === "FAILED" ? "error" : "neutral",
      });
    } catch (error: any) {
      appendMessage({
        role: "assistant",
        body: error?.message ?? "AI 계획 생성에 실패했습니다.",
        tone:
          error?.message?.includes("잠시 제한") || error?.message?.includes("잠깐 쉬어가")
            ? "neutral"
            : "error",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleClear = () => {
    clearEditMessages();
    setEditMessages([
      {
        id: createMessageId(),
        role: "assistant",
        body: introMessage,
        tone: "neutral",
      },
    ]);
    setPendingPlan(null);
    setAgentRun(null);
    setInput("");
  };

  const allNoteIds = useMemo(() => notes.map((note) => note.id), [notes]);

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
                  {contextLine}
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
            {notes.length > 0 && (
              <div className="border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">
                    분석 포인트 {notes.length}개
                  </p>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSelectedNoteIds(allNoteIds)}
                      className="text-primary hover:underline"
                    >
                      전체 선택
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedNoteIds([])}
                      className="text-muted-foreground hover:underline"
                    >
                      해제
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {notes.slice(0, 6).map((note) => {
                    const isSelected = selectedNoteIds.includes(note.id);
                    return (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => toggleNoteSelection(note.id)}
                        className={clsx(
                          "w-full border px-3 py-2 text-left transition-colors",
                          isSelected
                            ? "border-primary/30 bg-primary/5"
                            : "border-border bg-card hover:border-primary/20",
                        )}
                      >
                        <div className="text-[11px] font-medium text-foreground">
                          {note.note}
                        </div>
                        {!!note.quote && (
                          <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                            {note.quote}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {editMessages.map((message) => (
              <AssistantMessageBubble
                key={message.id}
                role={message.role}
                tone={message.tone}
              >
                  <p className="whitespace-pre-wrap leading-relaxed">{message.body}</p>
              </AssistantMessageBubble>
            ))}

            {isRunning && (
              <div className="flex justify-start">
                <div className="border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                  근거를 검색하고 실행 단계를 기록하고 있습니다...
                </div>
              </div>
            )}

            {agentRun?.status === "WAITING_APPROVAL" &&
              agentRun.approvals
                .filter((approval) => approval.status === "PENDING")
                .map((approval) => (
                  <div
                    key={approval.id}
                    className="border border-amber-300 bg-amber-50 p-4 text-amber-950"
                  >
                    <p className="text-sm font-semibold">사용자 승인 필요</p>
                    <p className="mt-1 text-xs">
                      {approval.toolName} 작업은 원고를 변경하므로 승인 후 실행됩니다.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        disabled={isRunning}
                        type="button"
                        onClick={() =>
                          void decideAgentApproval(approval.id, "APPROVED")
                        }
                        className="bg-amber-900 px-3 py-2 text-xs font-semibold text-white"
                      >
                        승인하고 실행
                      </button>
                      <button
                        disabled={isRunning}
                        type="button"
                        onClick={() =>
                          void decideAgentApproval(approval.id, "REJECTED")
                        }
                        className="border border-amber-400 px-3 py-2 text-xs font-semibold"
                      >
                        거절
                      </button>
                    </div>
                  </div>
                ))}

            {agentRun?.status === "FAILED" && (
              <div className="border border-red-300 bg-red-50 p-4 text-red-950">
                <p className="text-sm font-semibold">Press Agent 실행 실패</p>
                <p className="mt-1 text-xs">{agentRun.errorMessage ?? "실행을 완료하지 못했습니다."}</p>
                <button
                  type="button"
                  disabled={isRunning || !agentRun.canRetry}
                  onClick={() => void retryAgentRun()}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 bg-red-900 px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isRunning && <Loader2 className="h-4 w-4 animate-spin" />}
                  다시 시도
                </button>
                {!agentRun.canRetry && (
                  <p className="mt-2 text-xs">저장된 체크포인트가 없어 이 실행은 재시도할 수 없습니다.</p>
                )}
              </div>
            )}

            {agentRun && agentRun.citations.length > 0 && (
              <div className="border border-border bg-background p-3">
                <p className="text-xs font-semibold">사용한 근거</p>
                <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                  {agentRun.citations.map((citation) => (
                    <li key={citation.id}>
                      <a
                        href={`/api/knowledge/documents/${citation.documentId}/source#page=${citation.pageStart}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        [{citation.sourceId}] {citation.documentName} · p.
                        {citation.pageStart}
                        {citation.pageEnd !== citation.pageStart
                          ? `-${citation.pageEnd}`
                          : ""}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {agentRun?.status === "COMPLETED" && (
              <div className="space-y-3 border border-border bg-background p-3 text-xs">
                <FeedbackButtons
                  label="답변이 도움됐나요?"
                  positiveLabel="도움됨"
                  negativeLabel="도움 안 됨"
                  value={agentRun.feedback?.usefulness ?? null}
                  pending={feedbackPending === "usefulness"}
                  onSelect={(rating) => void saveFeedback("usefulness", rating)}
                />
                {agentRun.citations.length > 0 && (
                  <FeedbackButtons
                    label="인용이 정확했나요?"
                    positiveLabel="정확함"
                    negativeLabel="부정확함"
                    value={agentRun.feedback?.citationAccuracy ?? null}
                    pending={feedbackPending === "citationAccuracy"}
                    onSelect={(rating) =>
                      void saveFeedback("citationAccuracy", rating)
                    }
                  />
                )}
              </div>
            )}

            {agentStatus && (
              <p
                role={agentStatus.kind === "error" ? "alert" : "status"}
                aria-live={agentStatus.kind === "error" ? "assertive" : "polite"}
                className={clsx(
                  "border px-3 py-2 text-xs",
                  agentStatus.kind === "error"
                    ? "border-red-300 bg-red-50 text-red-800"
                    : "border-border bg-muted/50 text-muted-foreground",
                )}
              >
                {agentStatus.message}
              </p>
            )}

            {pendingPlan && (
              <div className="border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">실행 계획</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      예상 quota {pendingPlan.totalQuotaCost}회 · 예상 토큰{" "}
                      {pendingPlan.totalEstimatedTokens.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={dismissPendingPlan}
                      disabled={executingActionIds.length > 0}
                      className="inline-flex items-center gap-1 border border-border bg-background px-2.5 py-2 text-xs font-medium text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <X className="h-3.5 w-3.5" />
                      닫기
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExecuteActions(pendingPlan.actions)}
                      disabled={executingActionIds.length > 0}
                      className="inline-flex items-center gap-2 bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {executingActionIds.length > 0 ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      전체 실행
                    </button>
                  </div>
                </div>
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {pendingPlan.actions.map((action) => {
                    const isExecuting = executingActionIds.includes(action.id);
                    return (
                      <div
                        key={action.id}
                        className="border border-border/80 bg-card px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {action.title}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              {action.description}
                            </p>
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              quota {action.quotaCost} · 토큰{" "}
                              {action.estimatedTokens.toLocaleString()}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleExecuteActions([action])}
                              disabled={executingActionIds.length > 0}
                              aria-label={`${action.title} 실행`}
                              className="inline-flex items-center justify-center border border-border bg-background p-2 text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isExecuting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Play className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => dismissPendingAction(action.id)}
                              disabled={executingActionIds.length > 0}
                              aria-label={`${action.title} 취소`}
                              className="inline-flex items-center justify-center border border-border bg-background p-2 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
              placeholder="예: 원고를 먼저 분석하고, 광고성 표현은 줄여서 다시 다듬어줘"
              className="h-24 w-full resize-none bg-transparent px-1 py-1 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">Enter 전송, Shift+Enter 줄바꿈</p>
              <button
                onClick={() => void handleSubmit()}
                disabled={!input.trim() || isRunning || reviewing}
                className="inline-flex items-center gap-2 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRunning || reviewing ? (
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
