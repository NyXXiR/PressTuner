import assert from "node:assert/strict";
import test from "node:test";
import { fixtureRegistryV2, resolveSyntheticFixtureV2, SyntheticFixtureV2Schema } from "./fixtureRegistry";
import { evaluatePressTransitionGuardrails } from "@/domain/press-ai-debugger/transitionGuardrails";

test("v2 fixtures preserve existing order and append exact transition scenarios", () => {
  assert.deepEqual(fixtureRegistryV2.map(({ fixture }) => fixture.fixtureId), ["success-v2", "final-quality-block-v2", "brief-draft-warn-v2", "brief-draft-block-v2"]);
  assert.deepEqual(fixtureRegistryV2.map(({ fixture }) => fixture.scenario), ["SUCCESS", "QUALITY_BLOCK", "TRANSITION_WARN", "TRANSITION_BLOCK"]);
  assert.equal(fixtureRegistryV2.find(({ fixture }) => fixture.fixtureId === "success-v2")?.artifact.sha256, "4a65ac6181b609cf0e1e9f4b902645d27276e3e9d332b383ed9e66baefb8f127");
  assert.equal(fixtureRegistryV2.find(({ fixture }) => fixture.fixtureId === "final-quality-block-v2")?.artifact.sha256, "f1dcfbb8739217229a7a2ced658f38a968c3d0054c3165c90bb6793ea36c8872");
  for (const { fixture, artifact } of fixtureRegistryV2) assert.equal(resolveSyntheticFixtureV2(artifact)?.fixtureId, fixture.fixtureId);
});

test("v2 fixture resolution rejects every modified identity field and fixture body", () => {
  const entry = fixtureRegistryV2.find(({ fixture }) => fixture.fixtureId === "brief-draft-warn-v2")!;
  for (const changed of [
    { ...entry.artifact, locator: `${entry.artifact.locator}-changed` },
    { ...entry.artifact, sizeBytes: entry.artifact.sizeBytes + 1 },
    { ...entry.artifact, sha256: "0".repeat(64) },
    { ...entry.artifact, artifactId: `${entry.artifact.artifactId}-changed` },
    { ...entry.artifact, schemaVersion: "1.0" },
  ]) assert.equal(resolveSyntheticFixtureV2(changed), null);
  assert.equal(SyntheticFixtureV2Schema.safeParse({ ...entry.fixture, processId: "other" }).success, false);
  assert.equal(SyntheticFixtureV2Schema.safeParse({ ...entry.fixture, processVersion: "3.0.1" }).success, false);
  assert.equal(SyntheticFixtureV2Schema.safeParse({ ...entry.fixture, memoText: "changed", extra: true }).success, false);
});

test("transition WARN fixture preserves one of two extracted facts and evaluates both authored guardrails as WARN", () => {
  const fixture = fixtureRegistryV2.find(({ fixture }) => fixture.fixtureId === "brief-draft-warn-v2")!.fixture;
  const output = { oneLiner: fixture.normalizedBriefText, points: [fixture.normalizedBriefText] };
  const result = evaluatePressTransitionGuardrails({
    edgeId: "brief-draft",
    sourceInput: { rawText: fixture.memoText },
    sourceOutput: output,
    targetPayload: { confirmedBrief: output },
    attempt: { teamId: "synthetic-team", articleId: "synthetic-article" },
  });
  assert.equal(result.verdict, "WARN");
  assert.deepEqual(result.observations.map(({ guardrailId, verdict }) => [guardrailId, verdict]), [
    ["memo-brief-grounding", "WARN"],
    ["critical-fact-preservation", "WARN"],
  ]);
});
