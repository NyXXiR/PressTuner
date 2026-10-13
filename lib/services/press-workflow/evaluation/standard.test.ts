import assert from "node:assert/strict";
import test from "node:test";
import { standardDraftText } from "../../../../domain/press-workflow/evaluation/standard";
import { evaluateStandard } from "./standard";

const input = { request: "근거와 대조", output: "제목\n\n보도자료", contexts: ["채택 사실"] };

test("standard results retain separate native thresholds and isolate each adapter input", async () => {
  const result = await evaluateStandard(input, { model: "offline", measure: async (framework, value) => {
    assert.deepEqual(value.contexts, ["채택 사실"]);
    value.contexts.push("adapter-local change");
    return { score: framework === "RAGAS" ? 0 : .5, usage: null };
  } });
  assert.deepEqual(input.contexts, ["채택 사실"]);
  assert.equal(result.results[0].score, 0);
  assert.equal(result.results[0].state, "COMPLETED");
  assert.equal(result.results[0].thresholdPassed, null);
  assert.equal(result.results[1].thresholdPassed, true);
  assert.equal(result.contextCount, 1);
});

test("one metric failure preserves the other result and does not invent a zero score", async () => {
  const result = await evaluateStandard(input, { model: "offline", measure: async framework => {
    if (framework === "RAGAS") throw Object.assign(new Error("TIMEOUT"), { usage: { inputTokens: 5, outputTokens: 2 } });
    return { score: 1, reason: "synthetic reason", usage: null };
  } });
  assert.equal(result.results[0].score, null);
  assert.equal(result.results[0].reasonCode, "TIMEOUT");
  assert.deepEqual(result.results[0].usage, { inputTokens: 5, outputTokens: 2 });
  assert.equal(result.results[1].score, 1);
});

test("nonfinite or out-of-range scores fail closed", async () => {
  const result = await evaluateStandard(input, { model: "offline", measure: async framework => ({ score: framework === "RAGAS" ? NaN : 1.1, usage: null }) });
  assert.ok(result.results.every(r => r.state === "FAILED" && r.score === null && r.reasonCode === "INVALID_RESULT"));
});

test("invalid context stops before calling either provider", async () => {
  let calls = 0;
  await assert.rejects(evaluateStandard({ ...input, contexts: [] }, { model: "offline", measure: async () => { calls++; } }));
  assert.equal(calls, 0);
});

test("freshness text uses the same paragraph whitespace normalization as draft persistence", () => {
  assert.equal(standardDraftText(" 제목 ", " 첫 문단  \n\n\n 두번째 문단 \n"), "제목\n\n첫 문단\n\n두번째 문단");
});
