import assert from "node:assert/strict";
import test from "node:test";

import {
  applicableCustomExpectations,
  defaultWorkbenchSelection,
  projectSelectedTransition,
  reconcileWorkbenchSelection,
  resolveStateIoNodeId,
  resolveStateIoPayload,
  sourceCheckpointForEdge,
} from "./pressAiStateIo";

test("explicit graph selection controls the state I/O inspector", () => {
  assert.equal(
    resolveStateIoNodeId(
      {
        activeNodeId: "draft-review",
        checkpoints: [
          { nodeId: "brief-normalization", sequence: 0 },
          { nodeId: "draft-generation", sequence: 1 },
        ],
      },
      "brief-normalization",
    ),
    "brief-normalization",
  );
});

test("the active state is shown before prior checkpoint history", () => {
  assert.equal(
    resolveStateIoNodeId(
      {
        activeNodeId: "draft-review",
        checkpoints: [
          { nodeId: "brief-normalization", sequence: 0 },
          { nodeId: "draft-generation", sequence: 1 },
        ],
      },
      null,
    ),
    "draft-review",
  );
});

test("completed attempts default to the latest checkpoint", () => {
  assert.equal(
    resolveStateIoNodeId(
      {
        activeNodeId: null,
        checkpoints: [
          { nodeId: "draft-generation", sequence: 1 },
          { nodeId: "brief-normalization", sequence: 0 },
          { nodeId: "finalization", sequence: 4 },
        ],
      },
      null,
    ),
    "finalization",
  );
});

test("an unexecuted target state shows the payload passed by its transition", () => {
  assert.deepEqual(
    resolveStateIoPayload(
      {
        activeNodeId: "draft-generation",
        checkpoints: [],
        transitions: [
          {
            targetNodeId: "draft-generation",
            targetPayload: { normalizedBrief: "launch" },
            advancedAt: "2026-08-10T00:00:00.000Z",
          },
        ],
      },
      "draft-generation",
    ),
    {
      input: { normalizedBrief: "launch" },
      output: null,
      inputSource: "다음 호출에 전달될 입력",
      outputSource: "아직 실행 결과 없음",
    },
  );
});

test("a stored checkpoint wins over prospective transition payload", () => {
  assert.deepEqual(
    resolveStateIoPayload(
      {
        activeNodeId: null,
        checkpoints: [
          {
            nodeId: "draft-generation",
            sequence: 1,
            input: { normalizedBrief: "stored" },
            output: { draft: "result" },
          },
        ],
        transitions: [],
      },
      "draft-generation",
    ),
    {
      input: { normalizedBrief: "stored" },
      output: { draft: "result" },
      inputSource: "저장된 호출 입력",
      outputSource: "저장된 실행 결과",
    },
  );
});

test("blocked and inspecting attempts default to their latest persisted transition", () => {
  const attempt = {
    status: "BLOCKED",
    activeNodeId: "draft-review",
    checkpoints: [{ id: "cp-draft", nodeId: "draft-generation", sequence: 2 }],
    transitions: [
      { id: "tr-1", edgeId: "brief-draft", sequence: 1, sourceNodeId: "brief-normalization", targetNodeId: "draft-generation", targetPayload: {}, advancedAt: null },
      { id: "tr-2", edgeId: "draft-review", sequence: 2, sourceNodeId: "draft-generation", targetNodeId: "draft-review", targetPayload: {}, advancedAt: null },
    ],
  };
  assert.deepEqual(defaultWorkbenchSelection(attempt), { kind: "edge", edgeId: "draft-review" });
  assert.deepEqual(defaultWorkbenchSelection({ ...attempt, status: "INSPECTING" }), { kind: "edge", edgeId: "draft-review" });
  assert.deepEqual(defaultWorkbenchSelection({ ...attempt, status: "ACTIVE" }), { kind: "node", nodeId: "draft-review" });
});

test("transition projection resolves registry topology and the exact source checkpoint", () => {
  const attempt = {
    status: "INSPECTING",
    activeNodeId: null,
    checkpoints: [
      { id: "cp-source", nodeId: "draft-generation", sequence: 2, input: { brief: "in" }, output: { title: "out" } },
    ],
    transitions: [
      { id: "tr-draft-review", edgeId: "draft-review", sequence: 2, sourceNodeId: "draft-generation", targetNodeId: "draft-review", targetPayload: { title: "payload" }, advancedAt: null },
    ],
  };
  const projected = projectSelectedTransition(attempt, "draft-review");
  assert.equal(projected?.edge.source, "draft-generation");
  assert.equal(projected?.transition?.id, "tr-draft-review");
  assert.equal(projected?.sourceCheckpoint?.id, "cp-source");
  assert.equal(sourceCheckpointForEdge(attempt, "draft-review")?.id, "cp-source");
});

test("transition sourceCheckpointId wins when a source node has multiple checkpoints", () => {
  const attempt = {
    status: "INSPECTING",
    activeNodeId: null,
    checkpoints: [
      { id: "cp-exact", nodeId: "draft-generation", sequence: 2, input: { version: 1 }, output: { version: 1 } },
      { id: "cp-newer", nodeId: "draft-generation", sequence: 9, input: { version: 2 }, output: { version: 2 } },
    ],
    transitions: [
      { id: "tr-draft-review", edgeId: "draft-review", sequence: 2, sourceNodeId: "draft-generation", sourceCheckpointId: "cp-exact", targetNodeId: "draft-review", targetPayload: {}, advancedAt: null },
    ],
  };

  assert.equal(sourceCheckpointForEdge(attempt, "draft-review")?.id, "cp-exact");
});

test("custom rules include selected-edge and explicit global scope only", () => {
  const rules = [
    { id: "selected", edgeId: "draft-review" },
    { id: "global" },
    { id: "other", edgeId: "brief-draft" },
  ];
  assert.deepEqual(applicableCustomExpectations(rules, "draft-review").map((item) => item.id), ["selected", "global"]);
});

test("a transition created by executing the selected source node is selected automatically", () => {
  const before = {
    status: "ACTIVE",
    activeNodeId: "draft-generation",
    checkpoints: [],
    transitions: [{ id: "old", edgeId: "brief-draft", sequence: 1, sourceNodeId: "brief-normalization", targetNodeId: "draft-generation", targetPayload: {}, advancedAt: "2026-08-10T00:00:00Z" }],
  };
  const after = {
    ...before,
    status: "INSPECTING",
    activeNodeId: null,
    transitions: [...before.transitions, { id: "new", edgeId: "draft-review", sequence: 2, sourceNodeId: "draft-generation", targetNodeId: "draft-review", targetPayload: {}, advancedAt: null }],
  };
  assert.deepEqual(reconcileWorkbenchSelection({ kind: "node", nodeId: "draft-generation" }, before, after), { kind: "edge", edgeId: "draft-review" });
  assert.deepEqual(reconcileWorkbenchSelection({ kind: "node", nodeId: "brief-normalization" }, before, after), { kind: "node", nodeId: "brief-normalization" });
});
