import assert from "node:assert/strict";
import test from "node:test";
import { fixtureRegistryV2, resolveSyntheticFixtureV2 } from "./fixtureRegistry";

test("v2 fixtures make one non-technical quality BLOCK reproducible", () => {
  assert.deepEqual(fixtureRegistryV2.map(({ fixture }) => fixture.scenario), ["SUCCESS", "QUALITY_BLOCK"]);
  for (const { fixture, artifact } of fixtureRegistryV2) assert.equal(resolveSyntheticFixtureV2(artifact)?.fixtureId, fixture.fixtureId);
});
