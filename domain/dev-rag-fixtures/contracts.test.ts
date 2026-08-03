import assert from "node:assert/strict";
import test from "node:test";

import {
  decideDevRagFixtureTransition,
  parseDevRagFixtureDomain,
  parseDevRagFixtureMutation,
  PRESS_DEV_RAG_FIXTURE_CONTENT,
  type DevRagFixtureState,
} from "./contracts";

test("the Press inspection sample is the exact searchable fixture content", () => {
  assert.match(PRESS_DEV_RAG_FIXTURE_CONTENT, /2026년 9월 15일/);
  assert.match(PRESS_DEV_RAG_FIXTURE_CONTENT, /팀 지식에서 채택한 사실/);
  assert.match(PRESS_DEV_RAG_FIXTURE_CONTENT, /박서윤 대표/);
});

test("only Press and Resume fixture domains are addressable", () => {
  assert.equal(parseDevRagFixtureDomain("press"), "PRESS");
  assert.equal(parseDevRagFixtureDomain("resume"), "RESUME");
  for (const value of [
    "PRESS",
    "RESUME",
    "career",
    "knowledge",
    "",
    null,
    1,
  ]) {
    assert.equal(parseDevRagFixtureDomain(value), null);
  }
});

test("mutation body accepts exactly one boolean mounted field", () => {
  assert.deepEqual(parseDevRagFixtureMutation({ mounted: true }), {
    mounted: true,
  });
  assert.deepEqual(parseDevRagFixtureMutation({ mounted: false }), {
    mounted: false,
  });
  for (const value of [
    null,
    [],
    "text",
    {},
    { mounted: "true" },
    { mounted: true, text: "trusted" },
    { mounted: true, facts: [] },
    { mounted: true, content: "trusted" },
    { mounted: true, fixtureId: "override" },
    { mounted: true, teamId: "override" },
    { mounted: true, userId: "override" },
  ]) {
    assert.equal(parseDevRagFixtureMutation(value), null);
  }
});

test("same-state transitions are no-ops and real transitions increment once", () => {
  assert.deepEqual(decideDevRagFixtureTransition(true, true), {
    changed: false,
    incrementResourceVersionBy: 0,
    nextMounted: true,
  });
  assert.deepEqual(decideDevRagFixtureTransition(false, false), {
    changed: false,
    incrementResourceVersionBy: 0,
    nextMounted: false,
  });
  assert.equal(
    decideDevRagFixtureTransition(false, true).incrementResourceVersionBy,
    1,
  );
  assert.equal(
    decideDevRagFixtureTransition(true, false).incrementResourceVersionBy,
    1,
  );
});

test("domain states use distinct scope and resource-version meanings", () => {
  const press: DevRagFixtureState = {
    domain: "PRESS",
    mounted: true,
    fixtureVersion: "press-v1",
    summary: "press",
    scope: { kind: "TEAM", id: "team-1" },
    resourceVersion: 2,
  };
  const resume: DevRagFixtureState = {
    domain: "RESUME",
    mounted: true,
    fixtureVersion: "resume-v1",
    summary: "resume",
    scope: { kind: "USER", id: "user-1" },
    resourceVersion: 7,
  };
  assert.notEqual(press.scope.kind, resume.scope.kind);
  assert.notEqual(press.fixtureVersion, resume.fixtureVersion);
});
