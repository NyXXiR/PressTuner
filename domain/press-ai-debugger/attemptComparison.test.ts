import assert from "node:assert/strict";
import test from "node:test";
import { compareAttemptOutputs } from "./attemptComparison";
test("comparison preserves independent old and new values", () => { const value = compareAttemptOutputs({ baselineOutput: { title: "old" }, candidateOutput: { title: "new" }, baselineVerdict: "BLOCK", candidateVerdict: "PASS" }); assert.equal(value.changed, true); assert.deepEqual(value.fields[0], { key: "title", oldValue: "old", newValue: "new", changed: true }); });
