import assert from "node:assert/strict";
import test from "node:test";

import {
  ResumeBriefInputSchema,
  StartResumeApplicationCommandSchema,
} from "./contracts";

const brief = {
  companyName: "Example",
  jobTitle: "Backend Engineer",
  deadline: null,
  employmentType: null,
  location: null,
  summary: "Distributed systems role",
  coreResponsibilities: ["Build APIs"],
  requirements: ["TypeScript"],
  preferredQualifications: [],
  keySignals: ["ownership"],
  writingGuidance: ["Use concrete evidence"],
  questions: [{ questionText: "Tell us about an achievement", charLimit: 800 }],
};

test("resume brief accepts bounded text or URL inputs", () => {
  assert.equal(
    ResumeBriefInputSchema.parse({ text: "x".repeat(20) }).text!.length,
    20,
  );
  assert.equal(
    ResumeBriefInputSchema.parse({ url: "https://example.com/jobs/1" }).url,
    "https://example.com/jobs/1",
  );
  assert.equal(ResumeBriefInputSchema.safeParse({}).success, false);
  assert.equal(
    ResumeBriefInputSchema.safeParse({ url: "javascript:alert(1)" }).success,
    false,
  );
  assert.equal(
    ResumeBriefInputSchema.safeParse({ text: "x".repeat(20_001) }).success,
    false,
  );
});

test("start command requires an idempotency key and bounded non-empty questions", () => {
  const parsed = StartResumeApplicationCommandSchema.parse({
    clientRequestId: "start-application-1",
    brief,
    commonWritingGuidance: ["Lead with impact"],
  });
  assert.equal(parsed.brief.questions.length, 1);

  assert.equal(
    StartResumeApplicationCommandSchema.safeParse({
      clientRequestId: "",
      brief,
    }).success,
    false,
  );
  assert.equal(
    StartResumeApplicationCommandSchema.safeParse({
      clientRequestId: "too-many",
      brief: {
        ...brief,
        questions: Array.from({ length: 9 }, (_, index) => ({
          questionText: `Question ${index + 1}`,
          charLimit: 500,
        })),
      },
    }).success,
    false,
  );
  assert.equal(
    StartResumeApplicationCommandSchema.safeParse({
      clientRequestId: "blank",
      brief: {
        ...brief,
        questions: [{ questionText: "  ", charLimit: null }],
      },
    }).success,
    false,
  );
});
