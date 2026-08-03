import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SAMPLE_RAW_INPUT } from "./labFixtures";
import {
  createResumeWritingLabState,
  resumeWritingLabReducer,
  type ResumeWritingLabAction,
  type ResumeWritingLabState,
} from "./labMachine";

function dispatchAll(
  initial: ResumeWritingLabState,
  actions: readonly ResumeWritingLabAction[],
): ResumeWritingLabState {
  return actions.reduce(resumeWritingLabReducer, initial);
}

test("organizes rough pasted content into an editable review", () => {
  // Given
  const intake = resumeWritingLabReducer(createResumeWritingLabState(), {
    type: "update_intake",
    field: "rawText",
    value: SAMPLE_RAW_INPUT,
  });

  // When
  const reviewed = resumeWritingLabReducer(intake, { type: "organize_intake" });

  // Then
  assert.equal(reviewed.stage, "review");
  assert.equal(reviewed.target.company, "모노랩");
  assert.equal(reviewed.target.role, "프로덕트 매니저");
  assert.equal(reviewed.questions.length, 2);
  assert.deepEqual(
    reviewed.questions.map((question) => question.charLimit),
    [700, 700],
  );
});

test("generates every draft after review and applies a compared AI suggestion", () => {
  // Given
  const review = dispatchAll(createResumeWritingLabState(), [
    { type: "update_intake", field: "rawText", value: SAMPLE_RAW_INPUT },
    { type: "organize_intake" },
  ]);

  // When
  const proposed = dispatchAll(review, [
    { type: "confirm_review" },
    { type: "toggle_brick_link", brickId: "brick-experiment" },
    { type: "send_prompt", prompt: "성과 수치를 더 선명하게 보여줘" },
  ]);
  const revised = resumeWritingLabReducer(proposed, {
    type: "apply_suggestion",
  });

  // Then
  assert.equal(proposed.stage, "writing");
  assert.equal(
    proposed.questions.every((question) => question.status === "drafted"),
    true,
  );
  assert.match(proposed.questions[0]?.answer ?? "", /가입 흐름/);
  assert.equal(proposed.questions[0]?.pendingSuggestion?.original.length !== 0, true);
  assert.match(proposed.questions[0]?.pendingSuggestion?.revised ?? "", /42%/);
  assert.match(proposed.questions[0]?.pendingSuggestion?.revised ?? "", /31%/);
  assert.equal(revised.questions[0]?.status, "revised");
  assert.equal(revised.questions[0]?.pendingSuggestion, null);
});

test("saves, completes, advances, and reopens individual questions", () => {
  // Given
  const writing = dispatchAll(createResumeWritingLabState(), [
    { type: "organize_intake" },
    { type: "confirm_review" },
  ]);

  // When
  const advanced = dispatchAll(writing, [
    { type: "save_question" },
    { type: "complete_question" },
  ]);
  const reopened = resumeWritingLabReducer(advanced, {
    type: "reopen_question",
    questionId: advanced.questions[0]?.id ?? "question-1",
  });

  // Then
  assert.equal(advanced.questions[0]?.status, "completed");
  assert.equal(advanced.activeQuestionId, advanced.questions[1]?.id);
  assert.equal(reopened.questions[0]?.status, "saved");
  assert.equal(reopened.activeQuestionId, reopened.questions[0]?.id);
});

test("captures a new experience during writing and reuses it on the question", () => {
  // Given
  const writing = dispatchAll(createResumeWritingLabState(), [
    { type: "organize_intake" },
    { type: "confirm_review" },
    { type: "extract_active_experience" },
  ]);
  const candidateId = writing.inlineCandidate?.id;
  assert.ok(candidateId);

  // When
  const captured = resumeWritingLabReducer(writing, {
    type: "save_inline_candidate",
    resolution: "create",
  });

  // Then
  assert.equal(captured.inlineCandidate, null);
  assert.equal(captured.bricks.some((brick) => brick.sourceQuestionId !== null), true);
  assert.equal(captured.questions[0]?.linkedBrickIds.length, 2);
});

test("finishes the application only after every question and applies capture choices", () => {
  // Given
  const writing = dispatchAll(createResumeWritingLabState(), [
    { type: "organize_intake" },
    { type: "confirm_review" },
    { type: "complete_question" },
    { type: "complete_question" },
  ]);

  // When
  const capture = resumeWritingLabReducer(writing, {
    type: "complete_application",
  });
  const secondCandidateId = capture.captureCandidates[1]?.id;
  const resolved = secondCandidateId
    ? resumeWritingLabReducer(capture, {
        type: "set_candidate_resolution",
        candidateId: secondCandidateId,
        resolution: "skip",
      })
    : capture;
  const completed = resumeWritingLabReducer(resolved, {
    type: "save_candidates",
  });

  // Then
  assert.equal(capture.stage, "capture");
  assert.equal(capture.captureCandidates.length, 2);
  assert.equal(completed.stage, "done");
  assert.equal(completed.sessionSavedBrickIds.length, 1);
});

test("resets a restored session to the sample intake", () => {
  // Given
  const changed = dispatchAll(createResumeWritingLabState(), [
    { type: "organize_intake" },
    { type: "confirm_review" },
  ]);

  // When
  const reset = resumeWritingLabReducer(changed, { type: "reset" });

  // Then
  assert.equal(reset.stage, "intake");
  assert.equal(reset.intake.rawText, SAMPLE_RAW_INPUT);
  assert.equal(reset.questions.length, 0);
});
