import assert from "node:assert/strict";
import test from "node:test";

import {
  CAREER_CANDIDATE_BATCH_LIMIT,
  CAREER_CANDIDATE_FIELD_LIMITS,
  careerCandidateCreateFieldsSchema,
  careerCandidatePatchFieldsSchema,
  normalizeCareerCandidateInput,
  validateCareerCandidateMode,
} from "./candidatePolicy";

test("candidate policy publishes a practical legacy batch limit", () => {
  assert.equal(CAREER_CANDIDATE_BATCH_LIMIT, 20);
});

test("link and augment require an owner-owned target", () => {
  assert.throws(
    () =>
      validateCareerCandidateMode({
        mode: "LINK",
        targetExperienceId: null,
        targetOwnerId: null,
        userId: "user-a",
      }),
    /target experience/,
  );
  assert.throws(
    () =>
      validateCareerCandidateMode({
        mode: "AUGMENT",
        targetExperienceId: "experience-b",
        targetOwnerId: "user-b",
        userId: "user-a",
      }),
    /owner/,
  );
  assert.doesNotThrow(() =>
    validateCareerCandidateMode({
      mode: "LINK",
      targetExperienceId: "experience-a",
      targetOwnerId: "user-a",
      userId: "user-a",
    }),
  );
});

test("create rejects a target and structured fields are trimmed", () => {
  assert.throws(
    () =>
      validateCareerCandidateMode({
        mode: "CREATE",
        targetExperienceId: "experience-a",
        targetOwnerId: "user-a",
        userId: "user-a",
      }),
    /must not/,
  );

  assert.deepEqual(
    normalizeCareerCandidateInput({
      title: "  Launch  ",
      content: "  Shipped a launch. ",
      organization: "  Acme ",
      roleTitle: "",
      tags: [" growth ", "", "growth"],
      actions: [" interviewed users ", ""],
      outcomes: [],
      metrics: [" 20% "],
      tools: [" SQL "],
    }),
    {
      title: "Launch",
      content: "Shipped a launch.",
      organization: "Acme",
      roleTitle: null,
      tags: ["growth"],
      actions: ["interviewed users"],
      outcomes: [],
      metrics: ["20%"],
      tools: ["SQL"],
    },
  );
});

test("candidate field policy accepts every field exactly at its documented limit", () => {
  const limits = CAREER_CANDIDATE_FIELD_LIMITS;
  const parsed = careerCandidateCreateFieldsSchema.parse({
    title: "t".repeat(limits.title),
    content: "c".repeat(limits.content),
    originalText: "o".repeat(limits.originalText),
    organization: "g".repeat(limits.scalar),
    roleTitle: "r".repeat(limits.scalar),
    period: "p".repeat(limits.scalar),
    actions: Array.from({ length: limits.arrayItems }, (_, index) =>
      `${index}:`.padEnd(limits.arrayItem, "a"),
    ),
    outcomes: ["u".repeat(limits.arrayItem)],
    metrics: ["m".repeat(limits.metricItem)],
    tools: ["x".repeat(limits.arrayItem)],
    tags: ["z".repeat(limits.arrayItem)],
  });

  assert.equal(parsed.title.length, limits.title);
  assert.equal(parsed.actions?.length, limits.arrayItems);
  assert.equal(parsed.metrics?.[0]?.length, limits.metricItem);
});

test("candidate field policy rejects oversized create and patch payloads", () => {
  const limits = CAREER_CANDIDATE_FIELD_LIMITS;
  const validRequired = { title: "Title", content: "Content" };
  const oversizedCases = [
    { ...validRequired, title: "t".repeat(limits.title + 1) },
    { ...validRequired, content: "c".repeat(limits.content + 1) },
    { ...validRequired, originalText: "o".repeat(limits.originalText + 1) },
    { ...validRequired, organization: "g".repeat(limits.scalar + 1) },
    {
      ...validRequired,
      actions: Array.from({ length: limits.arrayItems + 1 }, () => "action"),
    },
    { ...validRequired, tools: ["x".repeat(limits.arrayItem + 1)] },
    { ...validRequired, metrics: ["m".repeat(limits.metricItem + 1)] },
  ];

  for (const payload of oversizedCases) {
    assert.equal(careerCandidateCreateFieldsSchema.safeParse(payload).success, false);
  }
  assert.equal(
    careerCandidatePatchFieldsSchema.safeParse({
      tags: Array.from({ length: limits.arrayItems + 1 }, () => "tag"),
    }).success,
    false,
  );
});
