import assert from "node:assert/strict";
import test from "node:test";

import {
  createOpsConsoleTestProcessData,
  type OpsConsoleTestProcessDependencies,
} from "./opsConsoleTestProcessData";

const operationId = "10000000-0000-4000-8000-000000000001";
const uuids = Array.from({ length: 80 }, (_, index) =>
  `${String(index + 2).padStart(8, "0")}-0000-4000-8000-000000000001`,
);

function dependencies(
  calls: string[],
  overrides: Partial<OpsConsoleTestProcessDependencies> = {},
): OpsConsoleTestProcessDependencies {
  let uuidIndex = 0;
  return {
    now: () => new Date("2026-08-10T12:00:00.000Z"),
    randomUUID: () => uuids[uuidIndex++]!,
    registerWorkflow: async (manifest) => {
      calls.push(`manifest:${manifest.workflow.id}`);
      return { status: "registered", operationId, environment: "test" };
    },
    beginOperation: async (args) => {
      calls.push(`begin:${args.workflowId}`);
      return { status: "registered", operationId, environment: "test" };
    },
    appendFacts: async (batch) => {
      calls.push(`facts:${batch.facts.length}`);
      return { status: "reported", operationId, environment: "test" };
    },
    completeOperation: async (args) => {
      calls.push(`complete:${args.operationId}`);
      return { status: "completed", operationId, environment: "test" };
    },
    ...overrides,
  };
}

test("inserts a complete, clearly labeled Press AI sample through the OPS producer API", async () => {
  const calls: string[] = [];
  const result = await createOpsConsoleTestProcessData(
    { teamId: "team-private", userId: "user-private" },
    dependencies(calls),
  );

  assert.deepEqual(calls, [
    "manifest:presstuner.press-creation.demo-test",
    "begin:presstuner.press-creation.demo-test",
    `facts:${result.factCount}`,
    `complete:${operationId}`,
  ]);
  assert.equal(result.operationId, operationId);
  assert.equal(result.workflowId, "presstuner.press-creation.demo-test");
  assert.ok(result.factCount > 0);
  assert.equal(result.status, "inserted");
});

test("declares lifecycle support under a version reserved for the generated sample definition", async () => {
  const calls: string[] = [];
  await createOpsConsoleTestProcessData(
    { teamId: "team-private", userId: "user-private" },
    dependencies(calls, {
      registerWorkflow: async (manifest) => {
        assert.ok(manifest.capabilities.includes("operation.lifecycle.v1"));
        assert.equal(manifest.workflow.version, "2.0.0-demo.2");
        return { status: "registered", operationId, environment: "test" };
      },
    }),
  );
});

test("sample facts cover stage completion, traversal, evaluation, and human review without private content", async () => {
  let serialized = "";
  const calls: string[] = [];
  await createOpsConsoleTestProcessData(
    { teamId: "team-private", userId: "user-private" },
    dependencies(calls, {
      appendFacts: async (batch) => {
        serialized = JSON.stringify(batch);
        const kinds = new Set(batch.facts.map((fact) => fact.kind));
        assert.deepEqual(kinds, new Set([
          "node.lifecycle",
          "edge.traversal",
          "transition.evaluation",
          "human.review",
        ]));
        const sourceCompleted = batch.facts.findIndex((fact) => fact.kind === "node.lifecycle" && fact.stageId === "article-initialization" && fact.state === "COMPLETED");
        const transitionEvaluated = batch.facts.findIndex((fact) => fact.kind === "transition.evaluation" && fact.edgeId === "initialization-brief");
        const targetStarted = batch.facts.findIndex((fact) => fact.kind === "node.lifecycle" && fact.stageId === "brief-normalization" && fact.state === "STARTED");
        assert.ok(sourceCompleted < transitionEvaluated && transitionEvaluated < targetStarted);
        return { status: "reported", operationId, environment: "test" };
      },
    }),
  );
  assert.doesNotMatch(serialized, /team-private|user-private|prompt|document/i);
});

test("does not complete or report success after a required OPS write fails", async () => {
  const calls: string[] = [];
  await assert.rejects(
    createOpsConsoleTestProcessData(
      { teamId: "team-private", userId: "user-private" },
      dependencies(calls, {
        appendFacts: async () => ({
          status: "failed",
          code: "OPS_CONSOLE_HTTP_ERROR",
          operationId,
          environment: "test",
        }),
      }),
    ),
    /OPS_CONSOLE_HTTP_ERROR/,
  );
  assert.equal(calls.some((call) => call.startsWith("complete:")), false);
});
