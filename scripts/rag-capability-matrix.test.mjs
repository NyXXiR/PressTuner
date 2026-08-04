import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildRagCapabilityMatrix,
  validateRagCapabilityMatrix,
} from "./rag-capability-matrix.mjs";

const catalogPath =
  ".agent-work/rag-interview-readiness/QUESTION_CATALOG.md";

test("capability matrix covers every detailed and priority question exactly once", async () => {
  const catalogText = await readFile(catalogPath, "utf8");
  const matrix = buildRagCapabilityMatrix(catalogText);
  const result = validateRagCapabilityMatrix({ catalogText, matrixText: matrix });

  assert.deepEqual(result.statusCounts, {
    implemented: 62,
    partial: 6,
    missing: 2,
  });
  assert.equal(result.detailedQuestionCount, 70);
  assert.equal(result.priorityAliasCount, 10);
});

test("validator rejects missing questions and unsupported implementation claims", async () => {
  const catalogText = await readFile(catalogPath, "utf8");
  const matrix = buildRagCapabilityMatrix(catalogText);

  assert.throws(
    () =>
      validateRagCapabilityMatrix({
        catalogText,
        matrixText: matrix.replace(/- \[implemented\] `A01`[\s\S]*?(?=\n- \[)/, ""),
      }),
    /MATRIX_DETAILED_QUESTION_COUNT_MISMATCH|MATRIX_QUESTION_MISSING:A01/,
  );
  assert.throws(
    () =>
      validateRagCapabilityMatrix({
        catalogText,
        matrixText: matrix.replace(
          "- [missing] `D14`",
          "- [implemented] `D14`",
        ),
      }),
    /MATRIX_IMPLEMENTED_STATUS_NOT_SUPPORTED:D14/,
  );
});
