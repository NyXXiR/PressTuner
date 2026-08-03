import assert from "node:assert/strict";
import test from "node:test";

import { assertFinalSourceIds } from "@/domain/press-agent/runPolicy";

test("irrelevant retrieval candidates are omitted from final Agent citations", () => {
  assert.deepEqual(
    assertFinalSourceIds(["source-2"], ["source-1", "source-2", "source-3"]),
    ["source-2"],
  );
  assert.throws(
    () => assertFinalSourceIds(["style-source"], ["fact-source"]),
    /PRESS_AGENT_FINAL_SOURCE_INVALID/,
  );
});
