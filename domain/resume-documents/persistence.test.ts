import assert from "node:assert/strict";
import test from "node:test";

import { createResumeDocumentSeed, updateSharedSectionTitle } from "./model";
import {
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
