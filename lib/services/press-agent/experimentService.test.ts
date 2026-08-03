import assert from "node:assert/strict";
import test from "node:test";

import { executePressRagExperiment } from "./experimentService";

test("live execution requires both operator and spend authorization and is never implicit", async () => {
  const base = {
    executor: "live" as const,
    baseline: {},
    candidate: {},
    dataset: {},
    environment: {},
  };
  await assert.rejects(
    executePressRagExperiment({ ...base, allowModelSpend: false, operatorAuthorized: true }),
    /SPEND_AUTHORIZATION/,
  );
  await assert.rejects(
    executePressRagExperiment({ ...base, allowModelSpend: true, operatorAuthorized: false }),
    /SPEND_AUTHORIZATION/,
  );
  await assert.rejects(
    executePressRagExperiment({ ...base, allowModelSpend: true, operatorAuthorized: true }),
    /LIVE_EXECUTOR_NOT_CONFIGURED/,
  );
});
