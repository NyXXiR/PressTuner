const MEMO_EXCERPT_LIMIT = 60;

type HistoryRowInput = {
  id: string;
  processId: string;
  processVersion: string;
  status: string;
  revision: number;
  articleId: string;
  activeNodeId: string | null;
  parentAttemptId: string | null;
  createdAt: Date | string;
  completedAt: Date | string | null;
  inputSnapshot: unknown;
  _count?: { checkpoints: number };
};

export type CheckpointAttemptHistorySummary = Omit<
  HistoryRowInput,
  "inputSnapshot" | "_count"
> & {
  memoExcerpt: string;
  checkpointCount: number;
};

function memoExcerpt(snapshot: unknown): string {
  const rawText =
    snapshot && typeof snapshot === "object"
      ? (snapshot as { rawText?: unknown }).rawText
      : null;
  if (typeof rawText !== "string") return "";
  const flattened = rawText.replace(/\s+/g, " ").trim();
  return flattened.length > MEMO_EXCERPT_LIMIT
    ? `${flattened.slice(0, MEMO_EXCERPT_LIMIT)}…`
    : flattened;
}

export function summarizeCheckpointAttemptHistory(
  rows: readonly HistoryRowInput[],
): CheckpointAttemptHistorySummary[] {
  return rows.map(({ inputSnapshot, _count, ...row }) => ({
    ...row,
    memoExcerpt: memoExcerpt(inputSnapshot),
    checkpointCount: _count?.checkpoints ?? 0,
  }));
}
