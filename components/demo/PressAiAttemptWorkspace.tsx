"use client";

import { useMemo, useState } from "react";

import {
  getBeginningRetryNodeId,
  getCompletedRetryCheckpoints,
} from "@/domain/press-ai-debugger/retryPolicy";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import { formatRelativeTimeKo } from "@/lib/formatRelativeTimeKo";
import type { PressAiCheckpointAttempt } from "@/lib/pressAiProcessDebuggerClient";
import { PressAiProcessGraph } from "./PressAiProcessGraph";
import { PressAiRunActionBar } from "./PressAiRunActionBar";
import { PressAiRunTimeline } from "./PressAiRunTimeline";
import { PressAiSidePanels } from "./PressAiSidePanels";
import {
  attemptStatusLabel,
  edgeAnchorId,
  focusAnchor,
  nextAction,
  nodeAnchorId,
} from "./pressAiRunProgress";

const absoluteKoreanTime = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "long",
  timeStyle: "medium",
  timeZone: "Asia/Seoul",
});

export function PressAiAttemptWorkspace(props: {
  attempt: PressAiCheckpointAttempt;
  busy: boolean;
  loading: boolean;
  onClear: () => void;
  onOpen: (attemptId: string) => void;
  onExecute: (nodeId: string, input?: Record<string, unknown>) => void;
  onAdvance: (
    edgeId: string,
    acknowledgeWarn: boolean,
    acknowledgeHumanGate: boolean,
  ) => void;
  onRetry: (nodeId: string) => void;
  onSaveCase: Parameters<typeof PressAiSidePanels>[0]["onSaveCase"];
  attachedCase: Parameters<typeof PressAiSidePanels>[0]["attachedCase"];
  caseLoading: boolean;
  caseError: string | null;
  caseSaved: boolean;
}) {
  const { attempt } = props;
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [rewriteInstruction, setRewriteInstruction] = useState(
    attempt.inputSnapshot.rewriteInstruction,
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  /** Bookkeeping, not a command: collapsed until the operator asks for it. */
  const [metaOpen, setMetaOpen] = useState(false);
  const checkpointChoices = useMemo(
    () => getCompletedRetryCheckpoints(attempt),
    [attempt],
  );
  const [branchNodeId, setBranchNodeId] = useState(
    () => checkpointChoices[0]?.nodeId ?? "",
  );
  const selectedBranchNodeId = checkpointChoices.some(
    (choice) => choice.nodeId === branchNodeId,
  )
    ? branchNodeId
    : (checkpointChoices[0]?.nodeId ?? "");
  const action = useMemo(() => nextAction(attempt), [attempt]);
  const beginningNodeId = useMemo(
    () => getBeginningRetryNodeId(attempt),
    [attempt],
  );
  const controlsDisabled = props.busy || props.loading;

  const defaultOpenKey =
    action.kind === "advance" || action.kind === "retry"
      ? `edge:${action.edgeId}`
      : action.kind === "execute" || action.kind === "rewrite"
        ? `node:${action.nodeId}`
        : null;
  const reviewCheckpoint = attempt.checkpoints.find(
    (item) => item.nodeId === "draft-review",
  );
  const reviewNotes =
    reviewCheckpoint &&
    reviewCheckpoint.output &&
    typeof reviewCheckpoint.output === "object" &&
    Array.isArray((reviewCheckpoint.output as { notes?: unknown[] }).notes)
      ? (
          reviewCheckpoint.output as { notes: Array<Record<string, unknown>> }
        ).notes.filter((item) => typeof item.id === "string")
      : [];
  const rewriteReady =
    selectedNoteIds.length > 0 && Boolean(rewriteInstruction.trim());
  const refreshKey = `${attempt.id}:${attempt.revision}`;
  const startNode = pressCreationProcess.nodes.find(
    (node) => node.id === attempt.startNodeId,
  );
  const createdAt = new Date(attempt.createdAt);

  const revealRow = (key: string, anchorId: string) => {
    setSelectedKey(key);
    setOpenRows((state) => ({ ...state, [key]: true }));
    focusAnchor(anchorId);
  };

  return (
    <div className="mt-4 min-w-0">
      {/* The next command comes first: the attempt's bookkeeping used to push it
          a screenful down, so the operator scrolled before seeing what to press. */}
      <PressAiRunActionBar
        attempt={attempt}
        busy={controlsDisabled}
        action={action}
        rewriteReady={rewriteReady}
        onExecute={(nodeId) => props.onExecute(nodeId)}
        onRewrite={() =>
          props.onExecute("selected-rewrite", {
            selectedNoteIds,
            rewriteInstruction,
          })
        }
        onAdvance={props.onAdvance}
        onRetry={props.onRetry}
      />
      <section
        className="mb-4 rounded-xl border border-border"
        aria-labelledby="press-ai-persisted-attempt-heading"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
          <button
            type="button"
            onClick={() => setMetaOpen(!metaOpen)}
            aria-expanded={metaOpen}
            aria-controls="press-ai-persisted-attempt-body"
            className="flex min-h-9 min-w-0 basis-full items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:basis-0 sm:flex-1"
          >
            <span aria-hidden="true" className="text-xs text-muted-foreground">
              {metaOpen ? "▾" : "▸"}
            </span>
            <h2
              id="press-ai-persisted-attempt-heading"
              className="min-w-0 font-black sm:truncate"
            >
              저장된 시도 · 완료 체크포인트 보존
            </h2>
          </button>
          {/* The only status badge on the page; the table below repeats it only
              once expanded. */}
          <span
            title={attempt.status}
            className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-bold"
          >
            {attemptStatusLabel(attempt.status)}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            <time dateTime={attempt.createdAt}>
              {formatRelativeTimeKo(attempt.createdAt)}
            </time>{" "}
            · 리비전 {attempt.revision}
          </span>
        </div>

        {metaOpen ? (
          <div
            id="press-ai-persisted-attempt-body"
            className="border-t border-border p-4"
          >
            <p className="text-sm text-muted-foreground">
              완료된 체크포인트는 다시 쓰지 않습니다. 현재 시도를 계속 진행할 수
              있고, 다시 시작하거나 분기하면 별도의 자식 시도와 Article이
              만들어집니다.
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div className="min-w-0">
                <dt className="font-bold text-muted-foreground">시도 ID</dt>
                <dd className="break-all font-mono text-xs">{attempt.id}</dd>
              </div>
              <div>
                <dt className="font-bold text-muted-foreground">상태</dt>
                <dd title={attempt.status}>
                  {attemptStatusLabel(attempt.status)}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-muted-foreground">생성 시각</dt>
                <dd>
                  <time dateTime={attempt.createdAt}>
                    {absoluteKoreanTime.format(createdAt)} (KST)
                  </time>
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-bold text-muted-foreground">부모 시도</dt>
                <dd>
                  {attempt.parentAttemptId ? (
                    <button
                      type="button"
                      disabled={controlsDisabled}
                      onClick={() => props.onOpen(attempt.parentAttemptId!)}
                      className="min-h-11 break-all text-left font-mono text-xs underline underline-offset-2 disabled:opacity-50"
                    >
                      {attempt.parentAttemptId}
                    </button>
                  ) : (
                    "최초 시도"
                  )}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-bold text-muted-foreground">시작 노드</dt>
                <dd>
                  {startNode?.label ?? attempt.startNodeId} (
                  {attempt.startNodeId})
                </dd>
              </div>
              <div>
                <dt className="font-bold text-muted-foreground">리비전</dt>
                <dd>{attempt.revision}</dd>
              </div>
            </dl>

            {/* One baseline: the branch select used to carry a visible label that
                floated above the two buttons beside it. */}
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
              <button
                type="button"
                disabled={controlsDisabled}
                onClick={props.onClear}
                className="min-h-11 rounded-lg border border-border bg-background px-4 text-sm font-black disabled:opacity-50"
              >
                새 입력으로 시작
              </button>
              <button
                type="button"
                disabled={controlsDisabled || !beginningNodeId}
                onClick={() => beginningNodeId && props.onRetry(beginningNodeId)}
                className="min-h-11 rounded-lg border border-border bg-background px-4 text-sm font-black disabled:opacity-50"
              >
                같은 입력으로 처음부터
              </button>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  id="press-ai-branch-checkpoint"
                  aria-label="분기 체크포인트"
                  value={selectedBranchNodeId}
                  disabled={controlsDisabled || checkpointChoices.length === 0}
                  onChange={(event) => setBranchNodeId(event.target.value)}
                  className="pt-input min-h-11 min-w-0 flex-1 px-3 disabled:opacity-50"
                >
                  {checkpointChoices.map((choice) => (
                    <option key={choice.nodeId} value={choice.nodeId}>
                      {choice.sequence + 1}. {choice.label} ({choice.mode})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={controlsDisabled || !selectedBranchNodeId}
                  onClick={() =>
                    selectedBranchNodeId && props.onRetry(selectedBranchNodeId)
                  }
                  className="min-h-11 shrink-0 rounded-lg border border-primary bg-background px-4 text-sm font-black text-primary disabled:opacity-50"
                >
                  이 단계부터 분기
                </button>
              </div>
            </div>
            {checkpointChoices.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                아직 저장된 체크포인트가 없어 단계 분기는 할 수 없습니다.
                처음부터 다시 실행할 수는 있습니다.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {attempt.activeNodeId === "selected-rewrite" ? (
        <section
          id="press-ai-review-selection"
          tabIndex={-1}
          className="mb-4 min-w-0 scroll-mt-24 rounded-xl border border-primary/40 bg-primary/5 p-4 focus:outline-none"
        >
          <h3 className="font-black">반영할 리뷰 노트 선택</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            저장된 리뷰 결과 중 실제로 반영할 항목만 고르세요. 선택하면 위의 실행
            버튼이 열립니다.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {reviewNotes.map((note) => {
              const id = String(note.id);
              const label =
                typeof note.message === "string"
                  ? note.message
                  : typeof note.text === "string"
                    ? note.text
                    : id;
              return (
                <li key={id}>
                  <label className="flex min-h-11 gap-3 rounded border border-border bg-background p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedNoteIds.includes(id)}
                      onChange={(event) =>
                        setSelectedNoteIds((items) =>
                          event.target.checked
                            ? [...items, id]
                            : items.filter((item) => item !== id),
                        )
                      }
                    />
                    <span className="min-w-0">
                      <strong>{id}</strong>
                      <br />
                      {label}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <label className="mt-3 block text-sm font-bold">
            수정 지침
            <input
              value={rewriteInstruction}
              onChange={(event) => setRewriteInstruction(event.target.value)}
              className="pt-input mt-1 min-h-11 px-3"
            />
          </label>
        </section>
      ) : null}

      <section
        className="mb-4 min-w-0 rounded-xl border border-border"
        aria-labelledby="press-ai-process-graph-heading"
      >
        <h3
          id="press-ai-process-graph-heading"
          className="px-4 py-2 text-sm font-black"
        >
          프로세스 그래프
        </h3>
        <div className="border-t border-border">
          <PressAiProcessGraph
            attempt={attempt}
            busy={props.busy}
            selectedNodeId={
              selectedKey?.startsWith("node:") ? selectedKey.slice(5) : null
            }
            selectedEdgeId={
              selectedKey?.startsWith("edge:") ? selectedKey.slice(5) : null
            }
            onNode={(id) => revealRow(`node:${id}`, nodeAnchorId(id))}
            onEdge={(id) => revealRow(`edge:${id}`, edgeAnchorId(id))}
          />
        </div>
      </section>
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <PressAiRunTimeline
          attempt={attempt}
          busy={props.busy}
          defaultOpenKey={defaultOpenKey}
          open={openRows}
          onOpenChange={setOpenRows}
        />
        {/* The timeline runs far past the side panels; sticking them keeps the
            rail useful instead of leaving a column of empty page beside it.
            top-24 clears the sticky action bar, matching the rows' scroll-mt-24. */}
        <div className="min-w-0 lg:sticky lg:top-24">
          <PressAiSidePanels
            attempt={attempt}
            attachedCase={props.attachedCase}
            caseLoading={props.caseLoading}
            caseError={props.caseError}
            caseSaved={props.caseSaved}
            busy={controlsDisabled}
            refreshKey={refreshKey}
            onOpen={props.onOpen}
            onSaveCase={props.onSaveCase}
          />
        </div>
      </div>
    </div>
  );
}
