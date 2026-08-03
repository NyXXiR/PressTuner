import assert from "node:assert/strict";
import test from "node:test";

import { projectResumeWritingWorkspace } from "./workspace";

test("projectResumeWritingWorkspace asks for questions when the workspace is empty", () => {
  // Given
  const source = {
    application: {
      id: "application-1",
      companyName: "PressTuner",
      jobTitle: "Product Engineer",
      status: "WRITING" as const,
    },
    questions: [],
    memory: {
      availableBrickCount: 4,
      capturedFromWritingCount: 1,
    },
  };

  // When
  const workspace = projectResumeWritingWorkspace(source);

  // Then
  assert.equal(workspace.stage, "COLLECT");
  assert.equal(workspace.activeQuestionId, null);
  assert.deepEqual(workspace.nextAction, { type: "add_questions" });
  assert.deepEqual(workspace.progress, {
    total: 0,
    completed: 0,
    percent: 0,
  });
});

test("projectResumeWritingWorkspace selects the first unfinished question and counts reused memory once", () => {
  // Given
  const source = {
    application: {
      id: "application-1",
      companyName: "PressTuner",
      jobTitle: "Product Engineer",
      status: "WRITING" as const,
    },
    questions: [
      {
        id: "question-1",
        order: 0,
        questionText: "지원 동기를 작성해 주세요.",
        charLimit: 700,
        answer: "완성한 답변",
        isCompleted: true,
        selectedBricks: [
          { id: "brick-1", source: "MANUAL" as const },
          { id: "brick-2", source: "AI_EXTRACT" as const },
        ],
        pendingCaptureCount: 0,
      },
      {
        id: "question-2",
        order: 1,
        questionText: "문제를 해결한 경험을 작성해 주세요.",
        charLimit: 1000,
        answer: "작성 중인 답변",
        isCompleted: false,
        selectedBricks: [{ id: "brick-1", source: "MANUAL" as const }],
        pendingCaptureCount: 0,
      },
      {
        id: "question-3",
        order: 2,
        questionText: "입사 후 포부를 작성해 주세요.",
        charLimit: null,
        answer: null,
        isCompleted: false,
        selectedBricks: [],
        pendingCaptureCount: 0,
      },
    ],
    memory: {
      availableBrickCount: 12,
      capturedFromWritingCount: 3,
    },
  };

  // When
  const workspace = projectResumeWritingWorkspace(source);

  // Then
  assert.equal(workspace.stage, "DRAFT");
  assert.equal(workspace.activeQuestionId, "question-2");
  assert.deepEqual(workspace.nextAction, {
    type: "continue_question",
    questionId: "question-2",
  });
  assert.deepEqual(workspace.progress, {
    total: 3,
    completed: 1,
    percent: 33,
  });
  assert.deepEqual(workspace.productivity, {
    availableBrickCount: 12,
    capturedFromWritingCount: 3,
    reusedBrickCount: 2,
  });
});

test("projectResumeWritingWorkspace prioritizes pending experience capture review after completion", () => {
  // Given
  const source = {
    application: {
      id: "application-1",
      companyName: "PressTuner",
      jobTitle: "Product Engineer",
      status: "DONE" as const,
    },
    questions: [
      {
        id: "question-1",
        order: 0,
        questionText: "지원 동기를 작성해 주세요.",
        charLimit: 700,
        answer: "완성한 답변",
        isCompleted: true,
        selectedBricks: [],
        pendingCaptureCount: 2,
      },
    ],
    memory: {
      availableBrickCount: 4,
      capturedFromWritingCount: 1,
    },
  };

  // When
  const workspace = projectResumeWritingWorkspace(source);

  // Then
  assert.equal(workspace.stage, "MEMORY_REVIEW");
  assert.equal(workspace.pendingCaptureCount, 2);
  assert.deepEqual(workspace.nextAction, {
    type: "review_experience_captures",
  });
});

test("failed capture extraction restores MEMORY_REVIEW after reconnect", () => {
  const workspace = projectResumeWritingWorkspace({
    application: {
      id: "application-1",
      companyName: "PressTuner",
      jobTitle: "Product Engineer",
      status: "WRITING",
    },
    questions: [
      {
        id: "question-1",
        order: 0,
        questionText: "지원 동기를 작성해 주세요.",
        charLimit: 700,
        answer: "완성한 답변",
        isCompleted: true,
        selectedBricks: [],
        pendingCaptureCount: 0,
      },
    ],
    memory: {
      availableBrickCount: 4,
      capturedFromWritingCount: 1,
    },
    pendingCaptureTaskCount: 1,
  });

  assert.equal(workspace.stage, "MEMORY_REVIEW");
  assert.deepEqual(workspace.nextAction, {
    type: "resolve_experience_capture_tasks",
  });
});
