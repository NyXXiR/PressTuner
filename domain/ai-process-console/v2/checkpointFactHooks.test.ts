import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFinalOutputQuality } from "./checkpointFactHooks";

test("final output quality is independent from technical execution completion", () => {
  assert.deepEqual(evaluateFinalOutputQuality({ title: "완성 제목", plain: "완성 본문" }), { verdict: "PASS", reasonCodes: [] });
  assert.deepEqual(evaluateFinalOutputQuality({ title: "", plain: "완성 본문" }), { verdict: "BLOCK", reasonCodes: ["EMPTY_FINAL_OUTPUT"] });
  assert.deepEqual(evaluateFinalOutputQuality(null), { verdict: "BLOCK", reasonCodes: ["EMPTY_FINAL_OUTPUT"] });
});
