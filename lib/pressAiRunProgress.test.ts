import assert from "node:assert/strict";
import test from "node:test";

import {
  nextAction,
  payloadFields,
  timelineRows,
} from "@/components/demo/pressAiRunProgress";
import type { PressAiCheckpointAttempt } from "@/lib/pressAiProcessDebuggerClient";

type Attempt = PressAiCheckpointAttempt;
type Transition = Attempt["transitions"][number];
type Checkpoint = Attempt["checkpoints"][number];

const checkpoint = (nodeId: string, sequence: number): Checkpoint => ({
  id: `cp-${nodeId}`,
  nodeId,
  sequence,
  mode: "EXECUTED",
  input: { articleId: "art-1" },
  output: { articleId: "art-1" },
  quotaUnits: 1,
});

const transition = (
  edgeId: string,
  sequence: number,
  overrides: Partial<Transition> = {},
): Transition => ({
  id: `tr-${edgeId}`,
  edgeId,
  sequence,
  sourceNodeId: "article-initialization",
  targetNodeId: "brief-normalization",
  targetPayload: {},
  verdict: "PASS",
  warnAcknowledgedAt: null,
  humanGateAcknowledgedAt: null,
  advancedAt: null,
  observations: [],
  ...overrides,
});

const attempt = (overrides: Partial<Attempt> = {}): Attempt => ({
  id: "attempt-1",
  processId: "press-creation",
  processVersion: "2.0.0",
  registryHash: "hash",
  executorVersion: "1",
  status: "ACTIVE",
  revision: 1,
  articleId: "art-1",
  activeNodeId: "article-initialization",
  startNodeId: "article-initialization",
  createdAt: "2026-08-10T00:00:00.000Z",
  completedAt: null,
  parentAttemptId: null,
  inputSnapshot: {
    articleId: "art-1",
    rawText: "memo",
    tone: "formal",
    reviewInstruction: "review",
    rewriteInstruction: "rewrite",
  },
  checkpoints: [],
  transitions: [],
  ...overrides,
});

test("an active node yields exactly one execute action", () => {
  const action = nextAction(attempt());
  assert.equal(action.kind, "execute");
  assert.equal(action.kind === "execute" && action.nodeId, "article-initialization");
  assert.match(action.label, /^1\. 문서 초기화 실행$/);
});

test("the rewrite node is distinguished so note selection can gate it", () => {
  const action = nextAction(attempt({ activeNodeId: "selected-rewrite" }));
  assert.equal(action.kind, "rewrite");
});

test("a pending transition takes priority over any node and names its gates", () => {
  const action = nextAction(
    attempt({
      activeNodeId: null,
      status: "INSPECTING",
      checkpoints: [checkpoint("brief-normalization", 1)],
      transitions: [
        transition("initialization-brief", 0, { advancedAt: "2026-08-07" }),
        transition("brief-draft", 1, {
          verdict: "WARN",
          sourceNodeId: "brief-normalization",
          targetNodeId: "draft-generation",
        }),
      ],
    }),
  );
  assert.equal(action.kind, "advance");
  if (action.kind !== "advance") return;
  assert.equal(action.edgeId, "brief-draft");
  assert.equal(action.needsWarnAck, true);
  assert.equal(action.humanGateLabel, "정규화 브리프 확인");
  assert.match(action.label, /초안 생성 활성화/);
});

test("an acknowledged warn no longer demands a second acknowledgement", () => {
  const action = nextAction(
    attempt({
      activeNodeId: null,
      transitions: [
        transition("brief-draft", 1, {
          verdict: "WARN",
          warnAcknowledgedAt: "2026-08-07",
          humanGateAcknowledgedAt: "2026-08-07",
        }),
      ],
    }),
  );
  assert.equal(action.kind === "advance" && action.needsWarnAck, false);
  assert.equal(action.kind === "advance" && action.humanGateLabel, null);
});

test("a BLOCK verdict offers retry instead of advance", () => {
  const action = nextAction(
    attempt({
      activeNodeId: null,
      status: "BLOCKED",
      transitions: [transition("initialization-brief", 0, { verdict: "BLOCK" })],
    }),
  );
  assert.equal(action.kind, "retry");
  assert.equal(action.kind === "retry" && action.nodeId, "article-initialization");
});

test("a finished attempt offers nothing to press", () => {
  const action = nextAction(
    attempt({
      activeNodeId: null,
      status: "COMPLETED",
      transitions: [transition("initialization-brief", 0, { advancedAt: "2026-08-07" })],
    }),
  );
  assert.equal(action.kind, "idle");
});

test("timeline rows interleave every node with its outgoing edges in execution order", () => {
  const rows = timelineRows(attempt(), false);
  assert.deepEqual(
    rows.map((row) => row.key),
    [
      "node:article-initialization",
      "edge:initialization-brief",
      "node:brief-normalization",
      "edge:brief-draft",
      "node:draft-generation",
      "edge:draft-review",
      "node:draft-review",
      "edge:review-rewrite",
      "node:selected-rewrite",
    ],
  );
  assert.equal(rows[0].kind === "node" && rows[0].state, "ACTIVE");
  assert.equal(rows[2].kind === "node" && rows[2].state, "WAITING");
});

test("payload previews stay short enough to read inline", () => {
  const fields = payloadFields({
    title: "가".repeat(200),
    notes: [1, 2, 3],
    nested: { a: 1 },
    missing: null,
  });
  assert.deepEqual(
    fields.map((field) => field.key),
    ["title", "notes", "nested", "missing"],
  );
  assert.ok(fields[0].preview.length <= 73);
  assert.equal(fields[1].preview, "3개 항목");
  assert.equal(fields[2].preview, "1개 필드");
  assert.equal(fields[3].preview, "—");
  assert.deepEqual(payloadFields(null), []);
});
