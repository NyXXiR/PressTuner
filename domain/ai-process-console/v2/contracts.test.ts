import assert from "node:assert/strict";
import test from "node:test";
import { ProcessDefinitionV2Schema } from "./contracts";
import { buildProcessDefinitionV2Compatibility, PRESS_CREATION_V2_CANONICAL_SHA256 } from "./publication";

test("compatibility grants are strict, bounded, replayable, unique, and non-self-referential", () => {
  const valid = buildProcessDefinitionV2Compatibility();
  assert.equal(ProcessDefinitionV2Schema.safeParse(valid).success, true);
  const index = valid.transitions.findIndex((transition) => transition.transitionId === "brief-draft");
  const transition = valid.transitions[index]!;
  const replace = (testApi: unknown) => ({ ...valid, transitions: valid.transitions.map((item, current) => current === index ? { ...item, testApi } : item) });
  const grant = { processVersion: "3.0.0", processDefinitionHash: PRESS_CREATION_V2_CANONICAL_SHA256 };
  assert.equal(ProcessDefinitionV2Schema.safeParse(replace({ snapshotInspect: true, compatibleDefinitions: [grant] })).success, false);
  assert.equal(ProcessDefinitionV2Schema.safeParse(replace({ ...transition.testApi, compatibleDefinitions: [grant, grant] })).success, false);
  assert.equal(ProcessDefinitionV2Schema.safeParse(replace({ ...transition.testApi, compatibleDefinitions: [{ processVersion: valid.version, processDefinitionHash: valid.canonicalSha256 }] })).success, false);
});
