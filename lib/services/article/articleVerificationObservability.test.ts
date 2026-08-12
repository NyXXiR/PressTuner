import assert from "node:assert/strict";
import test from "node:test";

import { emitArticleVerificationObservability } from "./articleVerificationObservability";

test("emits the exact workflow and quality identity with service registration", async () => {
  const calls: Array<[string, unknown]> = [];
  const client = {
    beginService: async (value: unknown) => {
      calls.push(["begin", value]);
      return { status: "registered" as const, operationId: "10000000-0000-4000-8000-000000000001", environment: "test" };
    },
    reportGuardrails: async (value: unknown) => {
      calls.push(["report", value]);
      return { status: "reported" as const, operationId: "10000000-0000-4000-8000-000000000001", environment: "test" };
    },
    complete: async (value: unknown) => {
      calls.push(["complete", value]);
      return { status: "completed" as const, operationId: "10000000-0000-4000-8000-000000000001", environment: "test" };
    },
  };
  await emitArticleVerificationObservability({ teamId: "private-team", verdict: "BLOCK" }, client);
  assert.deepEqual(calls[0], ["begin", {
    teamId: "private-team",
    workflowId: "presstuner.press-creation",
    workflowVersion: "2.1.0",
  }]);
  assert.deepEqual(calls[1], ["report", {
    operationId: "10000000-0000-4000-8000-000000000001",
    verdicts: [{ stageId: "verification", guardrailId: "evidence-fact-consistency", verdict: "violation" }],
  }]);
  assert.equal(JSON.stringify(calls).includes("private-team"), true);
  assert.doesNotMatch(JSON.stringify(calls[1]), /project|amount|draft|pdf|user/i);
});

test("maps PASS, BLOCK and absent comparable evaluation", async () => {
  const verdicts: string[] = [];
  const client = {
    beginService: async () => ({ status: "registered" as const, operationId: "10000000-0000-4000-8000-000000000001", environment: "test" }),
    reportGuardrails: async (value: { verdicts: readonly { verdict: string }[] }) => {
      verdicts.push(value.verdicts[0]!.verdict);
      return { status: "reported" as const, operationId: "10000000-0000-4000-8000-000000000001", environment: "test" };
    },
    complete: async () => ({ status: "completed" as const, operationId: "10000000-0000-4000-8000-000000000001", environment: "test" }),
  };
  for (const verdict of ["PASS", "BLOCK", "NOT_EVALUABLE"] as const) {
    await emitArticleVerificationObservability({ teamId: "team", verdict }, client);
  }
  assert.deepEqual(verdicts, ["pass", "violation", "not_evaluable"]);
});

test("related attempts reuse their UUID and all delivery failures are swallowed", async () => {
  let began = false;
  let completed = false;
  await assert.doesNotReject(emitArticleVerificationObservability({
    teamId: "team",
    verdict: "PASS",
    relatedOperationId: "10000000-0000-4000-8000-000000000001",
  }, {
    beginService: async () => { began = true; throw new Error("must not register"); },
    reportGuardrails: async () => { throw new Error("network private body"); },
    complete: async () => { completed = true; throw new Error("must not complete"); },
  }));
  assert.equal(began, false);
  assert.equal(completed, false);
});
