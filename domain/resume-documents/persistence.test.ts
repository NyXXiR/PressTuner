import assert from "node:assert/strict";
import test from "node:test";

import { applyResumeImportCommand, type ResumeDocumentImportCommand } from "./importCandidate";
import { addRoleCustomSection, createResumeDocumentSeed, updateRoleCustomSection, updateSharedSection, updateSharedSectionTitle, type ItemsContent } from "./model";
import {
  protectResumeDocumentHydration,
  resolveResumeDocumentCandidateApplication,
  resolveResumeDocumentLoad,
  resumeDocumentFingerprint,
  sameResumeDocumentState,
  type ResumeDocumentSyncMetadata,
} from "./persistence";

const serverRecord = (state = createResumeDocumentSeed(), revision = 2) => ({
  state,
  revision,
  updatedAt: "2026-08-27T00:00:00.000Z",
});

test("legacy local documents migrate only when the user has no server document", () => {
  const local = updateSharedSectionTitle(createResumeDocumentSeed(), "summary", "로컬 소개");
  const withoutServer = resolveResumeDocumentLoad({ localState: local, localMetadata: null, serverDocument: null, fallback: createResumeDocumentSeed() });
  assert.equal(withoutServer.state.sharedSections.find((section) => section.id === "summary")?.title, "로컬 소개");
  assert.equal(withoutServer.needsSave, true);

  const server = updateSharedSectionTitle(createResumeDocumentSeed(), "summary", "서버 소개");
  const withServer = resolveResumeDocumentLoad({ localState: local, localMetadata: null, serverDocument: serverRecord(server), fallback: createResumeDocumentSeed() });
  assert.equal(withServer.state.sharedSections.find((section) => section.id === "summary")?.title, "서버 소개");
  assert.equal(withServer.needsSave, false);
});

test("unsynced local edits resume against the same server revision but conflict with a newer server revision", () => {
  const base = createResumeDocumentSeed();
  const local = updateSharedSectionTitle(base, "summary", "오프라인에서 편집한 소개");
  const metadata: ResumeDocumentSyncMetadata = { revision: 2, fingerprint: resumeDocumentFingerprint(JSON.stringify(base)) };

  const resumable = resolveResumeDocumentLoad({ localState: local, localMetadata: metadata, serverDocument: serverRecord(base, 2), fallback: base });
  assert.equal(resumable.state, local);
  assert.equal(resumable.needsSave, true);
  assert.equal(resumable.conflict, false);

  const conflict = resolveResumeDocumentLoad({ localState: local, localMetadata: metadata, serverDocument: serverRecord(base, 3), fallback: base });
  assert.equal(conflict.state, local);
  assert.equal(conflict.needsSave, false);
  assert.equal(conflict.conflict, true);
});

test("resume document state equality supports content-addressed idempotent saves", () => {
  const state = createResumeDocumentSeed();
  const reverseObjectKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(reverseObjectKeys);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseObjectKeys(item)]));
  };
  const sameContent = reverseObjectKeys(state) as typeof state;
  const changed = updateSharedSectionTitle(state, "summary", "다른 소개");

  assert.equal(sameResumeDocumentState(state, sameContent), true);
  assert.equal(sameResumeDocumentState(state, changed), false);
});

test("a late candidate response preserves edits made after the application request", () => {
  const requestedState = createResumeDocumentSeed();
  const editedState = updateSharedSectionTitle(requestedState, "summary", "반영을 기다리는 동안 수정한 소개");
  const command: ResumeDocumentImportCommand = {
    candidateKey: "document:candidate-late-response",
    payloadHash: "candidate-late-response-hash",
    targetSectionId: "profile",
    applyMode: "REPLACE",
    payload: { type: "identity-field", field: "name", value: "홍길동" },
    appliedAt: "2026-08-31T00:00:00.000Z",
  };
  const serverState = applyResumeImportCommand(requestedState, command);

  const resolved = resolveResumeDocumentCandidateApplication({
    requestedState,
    currentState: editedState,
    serverState,
  });

  assert.equal(resolved.needsSave, true);
  assert.equal(
    resolved.state.sharedSections.find((section) => section.id === "summary")?.title,
    "반영을 기다리는 동안 수정한 소개",
  );
  const profile = resolved.state.sharedSections.find((section) => section.id === "profile");
  assert.equal((profile?.content as { name?: string }).name, "홍길동");
  assert.equal(resolved.state.importLedger.at(-1)?.candidateKey, command.candidateKey);
});

test("a late candidate response keeps a newer edit to the same field", () => {
  const requestedState = createResumeDocumentSeed();
  const editedState = updateSharedSection(requestedState, "summary", { body: "요청 후 사용자가 직접 쓴 소개" });
  const command: ResumeDocumentImportCommand = {
    candidateKey: "document:candidate-overlap",
    payloadHash: "candidate-overlap-hash",
    targetSectionId: "summary",
    applyMode: "REPLACE",
    payload: { type: "narrative", body: "가져온 소개" },
    appliedAt: "2026-08-31T00:00:00.000Z",
  };
  const serverState = applyResumeImportCommand(requestedState, command);

  const resolved = resolveResumeDocumentCandidateApplication({ requestedState, currentState: editedState, serverState });

  const summary = resolved.state.sharedSections.find((section) => section.id === "summary");
  assert.equal((summary?.content as { body?: string }).body, "요청 후 사용자가 직접 쓴 소개");
  assert.equal(resolved.state.importLedger.at(-1)?.candidateKey, command.candidateKey);
  assert.equal(resolved.needsSave, true);
});

test("a late candidate response merges role custom sections instead of losing the applied candidate", () => {
  const profileId = createResumeDocumentSeed().activeRoleProfileId;
  const added = addRoleCustomSection(createResumeDocumentSeed(), profileId, {
    title: "직군 소개",
    kind: "narrative",
    content: { body: "기존 소개" },
  });
  const requestedState = added.state;
  const currentState = updateRoleCustomSection(requestedState, profileId, added.section.id, { title: "요청 후 바꾼 제목" });
  const command: ResumeDocumentImportCommand = {
    candidateKey: "document:candidate-role-custom",
    payloadHash: "candidate-role-custom-hash",
    targetSectionId: added.section.id,
    applyMode: "REPLACE",
    payload: { type: "narrative", body: "가져온 직군 소개" },
    appliedAt: "2026-08-31T00:00:00.000Z",
  };
  const serverState = applyResumeImportCommand(requestedState, command);

  const resolved = resolveResumeDocumentCandidateApplication({ requestedState, currentState, serverState });
  const section = resolved.state.roleProfiles.find((profile) => profile.id === profileId)?.customSections.find((item) => item.id === added.section.id);
  assert.equal(section?.title, "요청 후 바꾼 제목");
  assert.equal((section?.content as { body?: string }).body, "가져온 직군 소개");
  assert.equal(resolved.state.importLedger.at(-1)?.candidateKey, command.candidateKey);
  assert.equal(resolved.needsSave, true);
});

test("an appended item and a concurrent edit to an existing starter item both survive", () => {
  const requestedState = createResumeDocumentSeed();
  const experience = requestedState.sharedSections.find((section) => section.id === "experience")!;
  const currentState = updateSharedSection(requestedState, "experience", {
    ...(experience.content as ItemsContent),
    items: (experience.content as ItemsContent).items.map((item, index) => index === 0 ? { ...item, body: "요청 후 사용자가 수정한 경력" } : item),
  });
  const command: ResumeDocumentImportCommand = {
    candidateKey: "document:candidate-item-append",
    payloadHash: "candidate-item-append-hash",
    targetSectionId: "experience",
    applyMode: "APPEND",
    payload: { type: "item", itemKind: "work", title: "새 회사", subtitle: "개발팀", body: "새 경력", isCurrent: false, tags: [] },
    appliedAt: "2026-08-31T00:00:00.000Z",
  };
  const serverState = applyResumeImportCommand(requestedState, command);

  const resolved = resolveResumeDocumentCandidateApplication({ requestedState, currentState, serverState });
  const items = resolved.state.sharedSections.find((section) => section.id === "experience")!.content as ItemsContent;
  assert.equal(items.items.find((item) => item.id === "starter-work-current")?.body, "요청 후 사용자가 수정한 경력");
  assert.ok(items.items.some((item) => item.title === "새 회사"));
  assert.ok(!items.items.some((item) => item.id === "starter-work-previous"));
  assert.equal(resolved.state.importLedger.at(-1)?.candidateKey, command.candidateKey);
});

test("an unresolved hydration conflict survives a browser reload", () => {
  const serverState = createResumeDocumentSeed();
  const localState = updateSharedSectionTitle(serverState, "summary", "아직 선택하지 않은 로컬 소개");
  const reloaded = resolveResumeDocumentLoad({
    localState,
    localMetadata: {
      revision: 4,
      fingerprint: resumeDocumentFingerprint(JSON.stringify(serverState)),
      conflict: true,
    },
    serverDocument: serverRecord(serverState, 4),
    fallback: serverState,
  });

  assert.equal(reloaded.state, localState);
  assert.equal(reloaded.conflict, true);
  assert.equal(reloaded.needsSave, false);
});

test("a late initial load preserves edits made while hydration was in flight", () => {
  const requestedState = createResumeDocumentSeed();
  const editedState = updateSharedSectionTitle(requestedState, "summary", "서버 응답을 기다리는 동안 수정한 소개");
  const serverState = updateSharedSectionTitle(requestedState, "summary", "기존 서버 소개");
  const resolved = protectResumeDocumentHydration({
    requestedState,
    currentState: editedState,
    resolvedDocument: {
      state: serverState,
      revision: 4,
      needsSave: false,
      conflict: false,
    },
  });

  assert.equal(resolved.state.sharedSections.find((section) => section.id === "summary")?.title, "서버 응답을 기다리는 동안 수정한 소개");
  assert.equal(resolved.needsSave, false);
  assert.equal(resolved.conflict, true);
});
