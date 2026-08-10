import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  derivePressPhase,
  projectArticleStatus,
  resolveCompatibilityStatusCommand,
} from "./pressProcess";
import type { PressProcessState } from "./pressProcess";

const base: PressProcessState = {
  phase: "INTAKE",
  verification: { kind: "MISSING" },
  approval: "NOT_REQUESTED",
  hasReview: false,
  hasPendingRewrite: false,
};

describe("ArticleStatus projection", () => {
  for (const [phase, approval, status] of [
    ["INTAKE", "NOT_REQUESTED", "DRAFT"],
    ["BRIEF_READY", "NOT_REQUESTED", "BRIEF"],
    ["DRAFT_READY", "NOT_REQUESTED", "DRAFT"],
    ["EDITING", "PENDING", "IN_PROGRESS"],
    ["EDITING", "APPROVED", "IN_PROGRESS"],
    ["EDITING", "CHANGES_REQUESTED", "DRAFT"],
    ["EDITING", "DISMISSED", "DECLINED"],
    ["FINALIZED", "NOT_REQUESTED", "FINAL"],
  ] as const) {
    it(`projects ${phase}/${approval} to ${status}`, () => {
      assert.equal(projectArticleStatus({ ...base, phase, approval }), status);
    });
  }
});

describe("legacy rehydration", () => {
  for (const [snapshot, phase] of [
    [{ status: "FINAL" }, "FINALIZED"],
    [{ status: "BRIEF" }, "BRIEF_READY"],
    [{ status: "IN_PROGRESS" }, "EDITING"],
    [{ status: "DECLINED" }, "EDITING"],
    [{ status: "DRAFT" }, "INTAKE"],
    [{ status: "DRAFT", hasRawInput: true }, "DRAFT_READY"],
    [{ status: "DRAFT", hasGeneratedContent: true }, "DRAFT_READY"],
    [{ status: "DRAFT", hasHarness: true }, "DRAFT_READY"],
    [
      { status: "DRAFT", approval: "CHANGES_REQUESTED" },
      "EDITING",
    ],
  ] as const) {
    it(`derives ${phase} from legacy snapshot`, () => {
      assert.equal(derivePressPhase(snapshot), phase);
    });
  }
});

describe("compatibility status commands", () => {
  it("keeps same projected status idempotent", () => {
    assert.deepEqual(resolveCompatibilityStatusCommand(base, "DRAFT"), {
      ok: true,
      state: base,
    });
  });

  it("rejects direct DECLINED patches", () => {
    const decision = resolveCompatibilityStatusCommand(base, "DECLINED");
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.error.code, "PRESS_TRANSITION_INVALID");
    const dismissed = resolveCompatibilityStatusCommand(
      { ...base, phase: "EDITING", approval: "DISMISSED" },
      "DECLINED",
    );
    assert.equal(dismissed.ok, false);
  });

  it("maps the legacy progression", () => {
    const brief = resolveCompatibilityStatusCommand(base, "BRIEF");
    assert.equal(brief.ok && brief.state.phase, "BRIEF_READY");
    if (!brief.ok) throw brief.error;
    const draft = resolveCompatibilityStatusCommand(brief.state, "DRAFT");
    assert.equal(draft.ok && draft.state.phase, "DRAFT_READY");
    if (!draft.ok) throw draft.error;
    const editing = resolveCompatibilityStatusCommand(draft.state, "IN_PROGRESS");
    assert.equal(editing.ok && editing.state.phase, "EDITING");
  });
});
