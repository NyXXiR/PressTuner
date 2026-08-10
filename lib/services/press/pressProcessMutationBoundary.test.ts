import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("dead process abstractions and divergent lock keys stay removed", () => {
  for (const file of [
    "lib/services/press/pressProcessComposition.ts",
    "lib/services/press/pressProcessPorts.ts",
    "lib/services/press/pressProcessService.ts",
    "lib/services/press/adapters/pressAiAdapter.ts",
    "lib/services/press/adapters/pressQuotaAdapter.ts",
    "lib/services/press/adapters/pressTelemetryAdapter.ts",
  ]) assert.equal(existsSync(join(root, file)), false, file);

  const mutationFiles = [
    "lib/services/article/articleFinalizationService.ts",
    "lib/services/article/articleGroundingService.ts",
    "lib/services/article/articleVerificationService.ts",
    "lib/services/articleService.ts",
    "lib/services/press/pressService.ts",
    "lib/services/pressReviewService.ts",
    "lib/services/reviewAssignmentService.ts",
    "lib/services/reviewService.ts",
  ];
  const source = mutationFiles.map((file) => readFileSync(join(root, file), "utf8")).join("\n");
  assert.doesNotMatch(source, /article-(?:finalize|grounding):/);
  for (const file of mutationFiles) {
    assert.match(readFileSync(join(root, file), "utf8"), /withLockedPressProcess/, file);
  }
});
