import { strict as assert } from "node:assert";
import { test } from "node:test";

import { createResumeWriteFlowPreviewState } from "./flowPreviewState";

type FlowStage = Parameters<typeof createResumeWriteFlowPreviewState>[0];

const STAGES: readonly FlowStage[] = [
  "intake",
  "review",
  "writing",
  "capture",
  "done",
];

test("creates a safe sample state for every preview stage", () => {
  for (const stage of STAGES) {
    const state = createResumeWriteFlowPreviewState(stage);

    assert.equal(state.stage, stage);
    assert.ok(state.userBricks.every((brick) => brick.id.startsWith("preview-")));
    assert.ok(
      state.questions.every((question) => question.id.startsWith("preview-")),
    );
  }
});

test("marks capture and done previews with their expected completion state", () => {
  const capture = createResumeWriteFlowPreviewState("capture");
  const done = createResumeWriteFlowPreviewState("done");

  assert.ok(capture.questions.every((question) => question.status === "completed"));
  assert.equal(capture.captures[0]?.status, "pending");
  assert.ok(done.questions.every((question) => question.status === "completed"));
  assert.equal(done.captures[0]?.status, "applied");
  assert.deepEqual(done.productivity, {
    availableBrickCount: 8,
    capturedFromWritingCount: 1,
    reusedBrickCount: 2,
  });
});
