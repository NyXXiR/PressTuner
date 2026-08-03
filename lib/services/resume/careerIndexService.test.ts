import assert from "node:assert/strict";
import test from "node:test";

import { requestCareerExperienceIndex } from "./careerIndexService";

test("career index requests carry the committed revision and report enqueue failure", async () => {
  const target = {
    experienceId: "experience-1",
    userId: "user-1",
    embeddingRevision: 7,
  };
  const enqueued: typeof target[] = [];
  const warnings: Array<{
    message: string;
    context: Record<string, unknown>;
  }> = [];

  assert.equal(
    await requestCareerExperienceIndex(target, {
      enqueue: async (input) => {
        enqueued.push(input);
      },
    }),
    true,
  );
  assert.deepEqual(enqueued, [target]);

  assert.equal(
    await requestCareerExperienceIndex(target, {
      enqueue: async () => {
        throw new Error("scheduler unavailable");
      },
      warn: (message, context) => warnings.push({ message, context }),
    }),
    false,
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!.message, /stale revision remains durable/);
  assert.deepEqual(warnings[0]!.context, {
    experienceId: "experience-1",
    embeddingRevision: 7,
    error: "scheduler unavailable",
  });
});
