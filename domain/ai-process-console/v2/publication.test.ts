import assert from "node:assert/strict";
import test from "node:test";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import { sha256Canonical } from "../v1/canonicalJson";
import { buildProcessDefinitionV2, buildProcessDefinitionV2Compatibility, PRESS_CREATION_V2_CANONICAL_SHA256 } from "./publication";

test("v2 publication truthfully reflects the real one-pass five-node runtime", () => {
  const definition = buildProcessDefinitionV2();
  assert.equal(definition.version, "3.0.0");
  assert.deepEqual(definition.nodes.map(({ nodeId }) => nodeId), pressCreationProcess.nodes.map(({ id }) => id));
  assert.deepEqual(definition.transitions.map(({ transitionId }) => transitionId), pressCreationProcess.edges.map(({ id }) => id));
  assert.equal(definition.nodes.at(-1)?.kind, "TERMINAL");
  assert.equal(definition.transitions.some((edge) => edge.targetNodeId === "draft-review" && edge.sourceNodeId === "selected-rewrite"), false);
  const base = Object.fromEntries(Object.entries(definition).filter(([key]) => key !== "canonicalSha256"));
  assert.equal(definition.canonicalSha256, sha256Canonical(base));
});

test("every mandatory runtime guardrail has one exact transition requirement", () => {
  const definition = buildProcessDefinitionV2();
  const expected = pressCreationProcess.edges.flatMap((edge) => edge.mandatoryGuardrailIds.map((requirementId) => [requirementId, edge.id, edge.source]));
  assert.deepEqual(definition.requirements.filter((requirement) => requirement.location.kind === "TRANSITION").map((requirement) => [requirement.requirementId, requirement.location.kind === "TRANSITION" ? requirement.location.transitionId : "", requirement.location.kind === "TRANSITION" ? requirement.location.stageId : ""]), expected);
  assert.deepEqual(definition.requirements.find((requirement) => requirement.requirementId === "final-output-quality")?.location, { kind: "NODE", nodeId: "selected-rewrite" });
});

test("3.1.0 grants only the exact immutable 3.0.0 brief-draft transition", () => {
  const predecessor = buildProcessDefinitionV2();
  const carrier = buildProcessDefinitionV2Compatibility();
  assert.equal(predecessor.canonicalSha256, PRESS_CREATION_V2_CANONICAL_SHA256);
  assert.equal(carrier.version, "3.1.0");
  const advertised = carrier.transitions.filter((transition) => transition.testApi);
  assert.equal(advertised.length, 1);
  assert.deepEqual(advertised[0]?.testApi, { snapshotInspect: true, isolatedReplay: true, compatibleDefinitions: [{ processVersion: "3.0.0", processDefinitionHash: PRESS_CREATION_V2_CANONICAL_SHA256 }] });
  assert.deepEqual([advertised[0]?.transitionId, advertised[0]?.sourceNodeId, advertised[0]?.targetNodeId], ["brief-draft", "brief-normalization", "draft-generation"]);
  assert.equal(predecessor.transitions.some((transition) => transition.testApi), false);
});
