import assert from "node:assert/strict";
import test from "node:test";

import {
  PRESS_AI_SCENARIO_NODES,
  createInitialPressAiScenarioState,
  getPressAiScenarioNodeState,
  isValidScenarioLaunchDate,
  pressAiScenarioReducer,
} from "./pressAiScenario";
import { pressCreationProcess } from "../press-ai-debugger/processRegistry";

const run = (
  state: ReturnType<typeof createInitialPressAiScenarioState>,
  nodeId: (typeof PRESS_AI_SCENARIO_NODES)[number]["id"],
) => pressAiScenarioReducer(state, { type: "run_node", nodeId });

test("the scenario exposes the canonical five-node registry roster", () => {
  assert.deepEqual(
    PRESS_AI_SCENARIO_NODES,
    pressCreationProcess.nodes.map(({ id, label, sequence }) => ({
      id,
      label,
      sequence,
    })),
  );
  assert.deepEqual(PRESS_AI_SCENARIO_NODES, [
    { id: "article-initialization", label: "문서 초기화", sequence: 0 },
    { id: "brief-normalization", label: "메모 정규화", sequence: 1 },
    { id: "draft-generation", label: "초안 생성", sequence: 2 },
    { id: "draft-review", label: "초안 리뷰", sequence: 3 },
    { id: "selected-rewrite", label: "선택 수정", sequence: 4 },
  ]);
});

test("nodes cannot be skipped and initialization and normalization are explicit", () => {
  const initial = createInitialPressAiScenarioState();

  assert.equal(getPressAiScenarioNodeState(initial, "article-initialization"), "active");
  assert.equal(getPressAiScenarioNodeState(initial, "brief-normalization"), "waiting");
  assert.deepEqual(run(initial, "brief-normalization"), initial);

  const initialized = run(initial, "article-initialization");
  assert.equal(getPressAiScenarioNodeState(initialized, "article-initialization"), "completed");
  assert.equal(getPressAiScenarioNodeState(initialized, "brief-normalization"), "active");
  assert.deepEqual(run(initialized, "draft-generation"), initialized);

  const normalized = run(initialized, "brief-normalization");
  assert.equal(getPressAiScenarioNodeState(normalized, "draft-generation"), "active");
});

test("draft generation fails once, stays closed, and requires an explicit valid retry", () => {
  let state = createInitialPressAiScenarioState();
  state = run(state, "article-initialization");
  state = run(state, "brief-normalization");
  state = run(state, "draft-generation");

  assert.equal(state.failedNodeId, "draft-generation");
  assert.equal(state.draftAttempts, 1);
  assert.equal(state.failureOpen, false);
  assert.equal(getPressAiScenarioNodeState(state, "draft-generation"), "failed");

  const opened = pressAiScenarioReducer(state, { type: "open_failure" });
  assert.equal(opened.failureOpen, true);

  for (const launchDate of ["", "2026-02-30", "09/18/2026", "2026-9-18"]) {
    const edited = pressAiScenarioReducer(opened, {
      type: "set_launch_date",
      value: launchDate,
    });
    assert.equal(isValidScenarioLaunchDate(edited.launchDate), false);
    assert.deepEqual(
      pressAiScenarioReducer(edited, { type: "retry_draft" }),
      edited,
    );
  }

  const corrected = pressAiScenarioReducer(opened, {
    type: "set_launch_date",
    value: "2026-09-18",
  });
  assert.equal(isValidScenarioLaunchDate(corrected.launchDate), true);
  assert.equal(corrected.failedNodeId, "draft-generation");
  assert.equal(corrected.currentNodeId, "draft-generation");

  const retried = pressAiScenarioReducer(corrected, { type: "retry_draft" });
  assert.equal(retried.failedNodeId, null);
  assert.equal(retried.failureOpen, false);
  assert.equal(retried.draftAttempts, 2);
  assert.equal(retried.currentNodeId, "draft-review");
  assert.equal(getPressAiScenarioNodeState(retried, "draft-generation"), "completed");
});

test("review runs exactly twice before selected rewrite completes the scenario", () => {
  let state = createInitialPressAiScenarioState();
  state = run(state, "article-initialization");
  state = run(state, "brief-normalization");
  state = run(state, "draft-generation");
  state = pressAiScenarioReducer(state, {
    type: "set_launch_date",
    value: "2026-09-18",
  });
  state = pressAiScenarioReducer(state, { type: "retry_draft" });

  const firstReview = run(state, "draft-review");
  assert.equal(firstReview.reviewRuns, 1);
  assert.equal(firstReview.reviewLoopRecorded, false);
  assert.equal(firstReview.currentNodeId, "draft-review");
  assert.equal(getPressAiScenarioNodeState(firstReview, "draft-review"), "active");

  const secondReview = run(firstReview, "draft-review");
  assert.equal(secondReview.reviewRuns, 2);
  assert.equal(secondReview.reviewLoopRecorded, true);
  assert.equal(secondReview.currentNodeId, "selected-rewrite");
  assert.equal(getPressAiScenarioNodeState(secondReview, "draft-review"), "completed");

  const completed = run(secondReview, "selected-rewrite");
  assert.equal(completed.isComplete, true);
  assert.equal(completed.currentNodeId, null);
  assert.equal(getPressAiScenarioNodeState(completed, "selected-rewrite"), "completed");

  assert.deepEqual(
    pressAiScenarioReducer(completed, { type: "reset" }),
    createInitialPressAiScenarioState(),
  );
});
