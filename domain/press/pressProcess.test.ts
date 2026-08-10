import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PressDomainError,
  assertPressFinalizable,
  classifyPressVerification,
  decidePressCommand,
  requirePressTransition,
  type PressCommand,
  type PressProcessState,
} from "./pressProcess";

const fingerprint = {
  draftHash: "draft-1",
  groundingRevision: 2,
  corpusVersion: 3,
};

function initialState(): PressProcessState {
  return {
    phase: "INTAKE",
    verification: { kind: "MISSING" },
    approval: "NOT_REQUESTED",
    hasReview: false,
    hasPendingRewrite: false,
  };
}

function run(state: PressProcessState, command: PressCommand) {
  const decision = decidePressCommand(state, command);
  if (!decision.ok) throw decision.error;
  return decision.state;
}

describe("press process", () => {
  it("runs the happy path through all five phases", () => {
    let state = initialState();
    state = run(state, { type: "NORMALIZE_BRIEF" });
    assert.equal(state.phase, "BRIEF_READY");
    state = run(state, { type: "GENERATE_DRAFT" });
    assert.equal(state.phase, "DRAFT_READY");
    state = run(state, { type: "START_EDITING" });
    assert.equal(state.phase, "EDITING");
    state = run(state, {
      type: "RECORD_VERIFICATION",
      result: "PASS",
      fingerprint,
    });
    state = run(state, { type: "FINALIZE" });
    assert.equal(state.phase, "FINALIZED");
  });

  it("allows brief normalization to be retried without skipping phases", () => {
    const briefReady = run(initialState(), { type: "NORMALIZE_BRIEF" });
    const retried = run(briefReady, { type: "NORMALIZE_BRIEF" });
    assert.equal(retried.phase, "BRIEF_READY");
  });

  it("supports optional review, rewrite, and approval without finalizing", () => {
    let state: PressProcessState = {
      ...initialState(),
      phase: "DRAFT_READY",
    };
    state = run(state, { type: "COMPLETE_REVIEW" });
    assert.equal(state.phase, "EDITING");
    assert.equal(state.hasReview, true);
    state = run(state, { type: "REQUEST_REWRITE" });
    assert.equal(state.hasPendingRewrite, true);
    state = run(state, { type: "APPLY_REWRITE", contentChanged: true });
    assert.equal(state.hasPendingRewrite, false);
    state = run(state, { type: "REQUEST_APPROVAL" });
    state = run(state, { type: "RECORD_APPROVAL", outcome: "APPROVED" });
    assert.equal(state.phase, "EDITING");
    assert.equal(state.approval, "APPROVED");
  });

  it("allows editing to return to draft-ready through compatibility status", () => {
    const state = run(
      { ...initialState(), phase: "EDITING" },
      { type: "SET_COMPATIBILITY_STATUS", status: "DRAFT" },
    );
    assert.equal(state.phase, "DRAFT_READY");
  });

  it("invalidates verification only when content or grounding inputs change", () => {
    const verified: PressProcessState = {
      ...initialState(),
      phase: "EDITING",
      verification: { kind: "CURRENT", result: "PASS", fingerprint },
    };
    assert.equal(
      run(verified, { type: "SAVE_CONTENT", contentChanged: false })
        .verification.kind,
      "CURRENT",
    );
    assert.equal(
      run(verified, { type: "SAVE_CONTENT", contentChanged: true }).verification
        .kind,
      "STALE",
    );
    assert.equal(
      run(verified, { type: "GROUNDING_CHANGED" }).verification.kind,
      "STALE",
    );
    assert.equal(
      run(verified, { type: "CORPUS_CHANGED" }).verification.kind,
      "STALE",
    );
  });

  for (const command of [
    { type: "GENERATE_DRAFT" },
    { type: "START_EDITING" },
    { type: "FINALIZE" },
  ] as PressCommand[]) {
    it(`rejects invalid skip: ${command.type}`, () => {
      const decision = decidePressCommand(initialState(), command);
      assert.equal(decision.ok, false);
      if (decision.ok) return;
      assert.equal(decision.error.code, "PRESS_TRANSITION_INVALID");
      assert.equal(decision.error.status, 409);
    });
  }

  it("makes finalized state terminal", () => {
    const state = { ...initialState(), phase: "FINALIZED" as const };
    const noOp = decidePressCommand(state, {
      type: "SET_COMPATIBILITY_STATUS",
      status: "FINAL",
    });
    assert.deepEqual(noOp, { ok: true, state });

    const mutation = decidePressCommand(state, {
      type: "SAVE_CONTENT",
      contentChanged: true,
    });
    assert.equal(mutation.ok, false);
    if (mutation.ok) return;
    assert.equal(mutation.error.code, "PRESS_FINALIZED_IMMUTABLE");
    assert.equal(mutation.error.status, 409);
    assert.equal(mutation.error.message, "최종 확정된 문서는 변경할 수 없습니다.");
  });

  it("uses an explicit assignment-change command and throws the domain error", () => {
    const draft = { ...initialState(), phase: "DRAFT_READY" as const };
    assert.deepEqual(
      requirePressTransition(draft, { type: "REVIEW_ASSIGNMENTS_CHANGED" }),
      draft,
    );
    assert.throws(
      () => requirePressTransition(
        { ...draft, phase: "FINALIZED" },
        { type: "REVIEW_ASSIGNMENTS_CHANGED" },
      ),
      (error: unknown) =>
        error instanceof PressDomainError &&
        error.status === 409 &&
        error.code === "PRESS_FINALIZED_IMMUTABLE" &&
        error.message === "최종 확정된 문서는 변경할 수 없습니다.",
    );
  });
});

describe("press verification policy", () => {
  for (const [verification, code] of [
    [null, "ARTICLE_VERIFICATION_REQUIRED"],
    [{ kind: "CURRENT", result: "BLOCK", fingerprint }, "ARTICLE_VERIFICATION_BLOCKED"],
    [
      { kind: "STALE", result: "PASS", fingerprint },
      "ARTICLE_VERIFICATION_STALE",
    ],
  ] as const) {
    it(`rejects non-finalizable verification: ${code}`, () => {
      assert.throws(() => {
        assertPressFinalizable({
          ...initialState(),
          phase: "EDITING",
          verification: verification ?? { kind: "MISSING" },
        });
      }, PressDomainError);
      try {
        assertPressFinalizable({
          ...initialState(),
          phase: "EDITING",
          verification: verification ?? { kind: "MISSING" },
        });
      } catch (error) {
        assert.equal((error as PressDomainError).code, code);
      }
    });
  }

  for (const result of ["PASS", "WARN"] as const) {
    it(`allows current ${result}`, () => {
      assert.doesNotThrow(() =>
        assertPressFinalizable({
          ...initialState(),
          phase: "EDITING",
          verification: { kind: "CURRENT", result, fingerprint },
        }),
      );
    });
  }

  for (const [current, kind] of [
    [{ ...fingerprint, draftHash: "other" }, "STALE"],
    [{ ...fingerprint, groundingRevision: 4 }, "STALE"],
    [{ ...fingerprint, corpusVersion: 4 }, "STALE"],
    [fingerprint, "CURRENT"],
  ] as const) {
    it(`classifies fingerprint freshness as ${kind}`, () => {
    assert.equal(
      classifyPressVerification(
        { kind: "CURRENT", result: "PASS", fingerprint },
        current,
      ).kind,
      kind,
    );
    });
  }
});
