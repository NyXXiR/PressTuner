import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("experiment persistence retains legacy events and dual-writes canonical outcomes and review", () => {
  const source = readFileSync("lib/services/press-agent/experimentPersistenceService.ts", "utf8");
  assert.match(source, /AGENT_EXPERIMENT_RECORDED/); assert.match(source, /AGENT_EXPERIMENT_REVIEWED/); assert.match(source, /mapExperimentOutcomes/); assert.match(source, /canonical\.experiment/); assert.match(source, /canonical\.regression/); assert.match(source, /mapHumanApproval/);
});
