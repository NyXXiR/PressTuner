import assert from "node:assert/strict";
import test from "node:test";

import {
  createDevRagFixtureService,
  pressFixtureIdentity,
  resumeFixtureIdentity,
  type DevRagFixtureRepository,
} from "./devRagFixtureService";

type State = {
  press: Map<string, boolean>;
  resume: Map<string, boolean>;
  pressVersions: Map<string, number>;
  resumeVersions: Map<string, number>;
  pressIds: Set<string>;
  resumeIds: Set<string>;
  writes: string[];
  groundingRows: number;
};

function fakeRepository(state: State): DevRagFixtureRepository {
  return {
    transaction: async (operation) => operation(state),
    lockPress: async () => {},
    lockResume: async () => {},
    readPress: async (_tx, teamId) => ({
      mounted: state.press.get(teamId) ?? false,
      resourceVersion: state.pressVersions.get(teamId) ?? 0,
    }),
    readResume: async (_tx, userId) => ({
      mounted: state.resume.get(userId) ?? false,
      resourceVersion: state.resumeVersions.get(userId) ?? 0,
    }),
    mountPress: async (_tx, input) => {
      state.press.set(input.teamId, true);
      state.pressIds.add(input.identity.documentId);
      state.writes.push(`knowledge:${input.teamId}`);
      return {};
    },
    unmountPress: async (_tx, input) => {
      state.press.set(input.teamId, false);
      state.writes.push(`knowledge-hide:${input.teamId}`);
      state.groundingRows += 1;
      return { affectedArticles: 1 };
    },
    mountResume: async (_tx, input) => {
      state.resume.set(input.userId, true);
      state.resumeIds.add(input.identity.brickId);
      state.writes.push(`career:${input.userId}`);
      return {};
    },
    unmountResume: async (_tx, input) => {
      state.resume.set(input.userId, false);
      state.writes.push(`career-hide:${input.userId}`);
      return {};
    },
    incrementPressVersion: async (_tx, teamId) => {
      const next = (state.pressVersions.get(teamId) ?? 0) + 1;
      state.pressVersions.set(teamId, next);
      return next;
    },
    incrementResumeVersion: async (_tx, userId) => {
      const next = (state.resumeVersions.get(userId) ?? 0) + 1;
      state.resumeVersions.set(userId, next);
      return next;
    },
  };
}

function harness() {
  const state: State = {
    press: new Map(),
    resume: new Map(),
    pressVersions: new Map(),
    resumeVersions: new Map(),
    pressIds: new Set(),
    resumeIds: new Set(),
    writes: [],
    groundingRows: 0,
  };
  return { state, service: createDevRagFixtureService(fakeRepository(state)) };
}

test("mounts are domain-isolated, scoped, deterministic, and idempotent", async () => {
  const { state, service } = harness();
  const press1 = await service.setPressMounted({
    teamId: "team-a",
    userId: "user-a",
    mounted: true,
  });
  const press2 = await service.setPressMounted({
    teamId: "team-a",
    userId: "user-a",
    mounted: true,
  });
  assert.equal(press1.changed, true);
  assert.equal(press2.changed, false);
  assert.equal(press2.resourceVersion, 1);
  assert.equal(state.resumeVersions.size, 0);
  assert.deepEqual(state.writes, ["knowledge:team-a"]);
  assert.equal(
    [...state.pressIds][0],
    pressFixtureIdentity("team-a").documentId,
  );

  await service.setResumeMounted({
    teamId: "team-a",
    userId: "user-a",
    mounted: true,
  });
  assert.equal(state.pressVersions.get("team-a"), 1);
  assert.equal(state.resumeVersions.get("user-a"), 1);
  assert.equal(
    [...state.resumeIds][0],
    resumeFixtureIdentity("user-a").brickId,
  );
  assert.ok(state.writes.every((write) => !/billing|quota|usage|application/.test(write)));
});
test("unmount and remount reuse records and increment exactly once per transition", async () => {
  const { state, service } = harness();
  const input = { teamId: "team-a", userId: "user-a" };
  await service.setPressMounted({ ...input, mounted: true });
  const id = [...state.pressIds][0];
  assert.equal(
    (await service.setPressMounted({ ...input, mounted: false })).changed,
    true,
  );
  assert.equal(
    (await service.setPressMounted({ ...input, mounted: false })).changed,
    false,
  );
  await service.setPressMounted({ ...input, mounted: true });
  assert.deepEqual([...state.pressIds], [id]);
  assert.equal(state.pressVersions.get("team-a"), 3);
  assert.equal(state.groundingRows, 1);
});

test("team and owner scope prevent cross-scope observation and mutation", async () => {
  const { service } = harness();
  await service.setPressMounted({
    teamId: "team-a",
    userId: "user-a",
    mounted: true,
  });
  await service.setResumeMounted({
    teamId: "team-a",
    userId: "user-a",
    mounted: true,
  });
  const other = await service.read({ teamId: "team-b", userId: "user-b" });
  assert.equal(other[0].mounted, false);
  assert.equal(other[1].mounted, false);
});

test("Resume unmount keeps historical grounding outside fixture writes", async () => {
  const { state, service } = harness();
  state.groundingRows = 4;
  await service.setResumeMounted({
    teamId: "team-a",
    userId: "user-a",
    mounted: true,
  });
  await service.setResumeMounted({
    teamId: "team-a",
    userId: "user-a",
    mounted: false,
  });
  assert.equal(state.groundingRows, 4);
  assert.equal(state.resume.get("user-a"), false);
  assert.equal(state.resumeVersions.get("user-a"), 2);
});
