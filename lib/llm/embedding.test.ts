import assert from "node:assert/strict";
import test from "node:test";

import { assertEmbeddingDimensions } from "./embedding";

test("embedding validation rejects a vector that cannot fit the pgvector column", () => {
  assert.throws(
    () => assertEmbeddingDimensions([1, 2], 3),
    /EMBEDDING_DIMENSION_MISMATCH/,
  );
});
