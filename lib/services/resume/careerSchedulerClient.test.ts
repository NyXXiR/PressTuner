import assert from "node:assert/strict";
import test from "node:test";

import { resolveCareerSchedulerConfig } from "./careerSchedulerClient";

test("career scheduler config prefers dedicated values", () => {
  assert.deepEqual(
    resolveCareerSchedulerConfig({
      CAREER_SCHEDULER_URL: "http://career-scheduler:3005",
      SCHEDULER_INTERNAL_URL: "http://internal-scheduler:3005",
      SCHEDULER_URL: "http://legacy-scheduler:3005",
      CAREER_SCHEDULER_TOKEN: "career-token",
      SCHEDULER_INTERNAL_TOKEN: "internal-token",
      MANUAL_API_KEY: "legacy-token",
    }),
    {
      schedulerBaseUrl: "http://career-scheduler:3005",
      schedulerToken: "career-token",
    },
  );
});

test("career scheduler config supports the deployed legacy aliases", () => {
  assert.deepEqual(
    resolveCareerSchedulerConfig({
      SCHEDULER_URL: "http://legacy-scheduler:3005",
      MANUAL_API_KEY: "legacy-token",
    }),
    {
      schedulerBaseUrl: "http://legacy-scheduler:3005",
      schedulerToken: "legacy-token",
    },
  );
});
