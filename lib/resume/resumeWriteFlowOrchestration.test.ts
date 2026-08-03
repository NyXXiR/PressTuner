import assert from "node:assert/strict";
import test from "node:test";

import {
  assertWorkspaceReadyForCompletion,
  completeReadyApplication,
  saveThenCompleteQuestion,
  startIntakeWithBricks,
  startWorkspaceWithFirstDraft,
  type ResumeWriteFlowApi,
} from "./resumeWriteFlowOrchestration";

const brief = {
  summary: "",
  deadline: null,
  employmentType: null,
  location: null,
  coreResponsibilities: [],
  requirements: [],
  preferredQualifications: [],
  keySignals: [],
  writingGuidance: [],
};

test("intake composition and brick loading begin concurrently", async () => {
  const started: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const api = {
    organizeIntake: async () => {
      started.push("intake");
      await gate;
      return { company: "", job: "", brief, questions: [] };
    },
    loadUserBricks: async () => {
      started.push("bricks");
      await gate;
      return [];
    },
  } as unknown as ResumeWriteFlowApi;

  const pending = startIntakeWithBricks({
    api,
    intake: { rawText: "posting", postingUrl: "" },
  });
  await Promise.resolve();
  assert.deepEqual(started, ["intake", "bricks"]);
  release();
  await pending;
});

test("workspace receives every question and automatically drafts only the first", async () => {
  const calls: unknown[] = [];
  const questions = [
    { prompt: "one", charLimit: 500 },
    { prompt: "two", charLimit: 600 },
  ];
  const api = {
    startWorkspace: async (input: unknown) => {
      calls.push(["workspace", input]);
      return {
        appId: "app-1",
        questions: questions.map((question, index) => ({
          ...question,
          id: `q-${index + 1}`,
          aiAdvice: `advice-${index + 1}`,
          linkedBrickIds: [],
        })),
      };
    },
    generateDraft: async (input: unknown) => {
      calls.push(["draft", input]);
      return { text: "draft", grounding: null };
    },
  } as unknown as ResumeWriteFlowApi;

  const result = await startWorkspaceWithFirstDraft({
    api,
    workspace: { company: "c", job: "j", brief, questions },
    instructionFor: (question) => question.aiAdvice,
  });

  assert.equal(result.workspace.questions.length, 2);
  assert.deepEqual(calls, [
    ["workspace", { company: "c", job: "j", brief, questions }],
    [
      "draft",
      { questionId: "q-1", instruction: "advice-1", charLimit: 500 },
    ],
  ]);
});

test("question completion saves first and forwards the returned revision", async () => {
  const calls: unknown[] = [];
  const api = {
    saveQuestionAnswer: async (input: unknown) => {
      calls.push(["save", input]);
      return { answerRevision: 17 };
    },
    completeQuestion: async (input: unknown) => {
      calls.push(["complete", input]);
      return { capture: { kind: "none" }, verification: null };
    },
  } as unknown as ResumeWriteFlowApi;

  await saveThenCompleteQuestion({
    api,
    appId: "app-1",
    questionId: "q-1",
    answer: "answer",
  });
  assert.deepEqual(calls, [
    [
      "save",
      { questionId: "q-1", answer: "answer", isCompleted: false },
    ],
    [
      "complete",
      {
        appId: "app-1",
        questionId: "q-1",
        answer: "answer",
        expectedAnswerRevision: 17,
      },
    ],
  ]);
});

function workspace(overrides: Record<string, unknown> = {}) {
  return {
    questions: [{ status: "completed" }],
    captures: [],
    deferredCaptures: [],
    ...overrides,
  } as any;
}

test("application completion refuses incomplete and pending capture work", () => {
  assert.throws(() =>
    assertWorkspaceReadyForCompletion(
      workspace({ questions: [{ status: "drafted" }] }),
    ),
  );
  assert.throws(() =>
    assertWorkspaceReadyForCompletion(workspace({ captures: [{}] })),
  );
  assert.doesNotThrow(() =>
    assertWorkspaceReadyForCompletion(workspace({ deferredCaptures: [{}] })),
  );
  assert.doesNotThrow(() => assertWorkspaceReadyForCompletion(workspace()));
});

test("application completion reloads authoritative state before mutation", async () => {
  const calls: string[] = [];
  const api = {
    loadExistingApplication: async () => {
      calls.push("load");
      return workspace();
    },
    completeApplication: async () => {
      calls.push("complete");
    },
  } as unknown as ResumeWriteFlowApi;
  await completeReadyApplication({ api, appId: "app-1" });
  assert.deepEqual(calls, ["load", "complete"]);
});
