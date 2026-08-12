import assert from "node:assert/strict";
import test from "node:test";

import { PUBLIC_PRESS_RAG_GUIDED_MEMO, publicPressRagScenarioProcess } from "./pressRagScenarioContract";
import { PRESS_AI_SCENARIO_NODES, latestScenarioReviewNotes, repairedScenarioMemo } from "./pressAiScenario";
import { createPublicPressRagAttempt, executePublicPressRagNode } from "./pressRagScenarioMachine";

test("scenario presentation follows the injected canonical topology", () => {
  assert.deepEqual(PRESS_AI_SCENARIO_NODES.map((node) => node.id), publicPressRagScenarioProcess.nodes.map((node) => node.id));
  assert.doesNotMatch(repairedScenarioMemo(), /360억원/);
  assert.match(repairedScenarioMemo(), /200억원/);
  assert.match(PUBLIC_PRESS_RAG_GUIDED_MEMO, /360억원/);
});

test("latest review notes select the second repeated checkpoint", () => {
  let attempt = createPublicPressRagAttempt({ runId: "run", memo: "memo", tone: "formal", now: 1 });
  attempt = { ...attempt, activeNodeId: "draft-review" };
  attempt = executePublicPressRagNode({ attempt, input: { run: 1 }, output: { notes: [{ id: "one", message: "first" }] }, context: { now: 2, id: () => "one" } });
  attempt = { ...attempt, status: "ACTIVE", activeNodeId: "draft-review", transitions: attempt.transitions.map((item) => ({ ...item, advancedAt: "2026-01-01T00:00:00.000Z" })) };
  attempt = executePublicPressRagNode({ attempt, input: { run: 2 }, output: { notes: [{ id: "two", message: "second" }] }, context: { now: 3, id: () => "two" } });
  assert.deepEqual(latestScenarioReviewNotes(attempt).map((note) => note.id), ["two"]);
});
