import assert from "node:assert/strict";
import test from "node:test";
import { SyntheticFixtureSchema, fixtureRegistry, resolveSyntheticFixture } from "./fixtureRegistry";

test("the fixture registry resolves only exact versioned synthetic artifact references", () => {
  assert.deepEqual(fixtureRegistry.map(({ fixture }) => fixture.scenario), ["SUCCESS", "GUARDRAIL_BLOCK", "NODE_FAILURE"]);
  for (const { fixture, artifact } of fixtureRegistry) assert.equal(resolveSyntheticFixture(artifact)?.fixtureId, fixture.fixtureId);
  assert.equal(resolveSyntheticFixture({ ...fixtureRegistry[0].artifact, sha256: "0".repeat(64) }), null);
  assert.equal(resolveSyntheticFixture({ ...fixtureRegistry[0].artifact, locator: "ref:saved-cases/unsafe" }), null);
  assert.equal(SyntheticFixtureSchema.safeParse({ ...fixtureRegistry[0].fixture, unexpected: true }).success, false);
});
