import assert from "node:assert/strict";
import test from "node:test";

import {
  buildResumeStrategyPrompt,
  buildResumeSuggestionPrompt,
  buildTrustedCareerGenerationContext,
  projectTrustedCareerExperiences,
} from "./careerTrustedGeneration";

const OWNER_ID = "owner";

function generationFacts() {
  return [
    {
      id: "safe-fact",
      userId: OWNER_ID,
      experienceId: "safe-experience",
      experienceStatus: "CONFIRMED",
      kind: "SUMMARY",
      fieldPath: "summary",
      value: "Built a supported launch",
      active: true,
      trustStatus: "TRUSTED",
    },
    {
      id: "secret-org",
      userId: OWNER_ID,
      experienceId: "safe-experience",
      experienceStatus: "CONFIRMED",
      kind: "ORGANIZATION",
      fieldPath: "organization",
      value: "NEEDS_REVIEW_SECRET_ORG",
      active: true,
      trustStatus: "NEEDS_REVIEW",
    },
    {
      id: "secret-metric",
      userId: OWNER_ID,
      experienceId: "safe-experience",
      experienceStatus: "CONFIRMED",
      kind: "METRIC",
      fieldPath: "metrics[0]",
      value: "999%",
      active: true,
      trustStatus: "NEEDS_REVIEW",
    },
    {
      id: "foreign-secret",
      userId: "different-owner",
      experienceId: "foreign-experience",
      experienceStatus: "CONFIRMED",
      kind: "SUMMARY",
      fieldPath: "summary",
      value: "FOREIGN_OWNER_SECRET",
      active: true,
      trustStatus: "TRUSTED",
    },
    {
      id: "inactive-secret",
      userId: OWNER_ID,
      experienceId: "safe-experience",
      experienceStatus: "CONFIRMED",
      kind: "SUMMARY",
      fieldPath: "summary",
      value: "INACTIVE_SECRET",
      active: false,
      trustStatus: "TRUSTED",
    },
  ];
}

test("trusted career projection returns ranking metadata plus owner-scoped trusted facts only", () => {
  const experiences = projectTrustedCareerExperiences({
    userId: OWNER_ID,
    facts: generationFacts(),
    rankings: [
      {
        id: "safe-experience",
        score: 0.9,
        title: "RAW_TITLE_MUST_NOT_LEAK",
        content: "RAW_CONTENT_MUST_NOT_LEAK",
        originalText: "RAW_ORIGINAL_MUST_NOT_LEAK",
        organization: "RAW_ORG_MUST_NOT_LEAK",
        roleTitle: "RAW_ROLE_MUST_NOT_LEAK",
        period: "RAW_PERIOD_MUST_NOT_LEAK",
        metrics: ["RAW_METRIC_MUST_NOT_LEAK"],
      },
      { id: "foreign-experience", score: 0.8 },
    ],
  });

  assert.deepEqual(experiences, [
    {
      id: "safe-experience",
      score: 0.9,
      facts: [
        {
          id: "safe-fact",
          experienceId: "safe-experience",
          kind: "SUMMARY",
          fieldPath: "summary",
          value: "Built a supported launch",
        },
      ],
    },
  ]);
  const serialized = JSON.stringify(experiences);
  for (const secret of [
    "NEEDS_REVIEW_SECRET_ORG",
    "999%",
    "FOREIGN_OWNER_SECRET",
    "INACTIVE_SECRET",
    "RAW_TITLE_MUST_NOT_LEAK",
    "RAW_CONTENT_MUST_NOT_LEAK",
    "RAW_ORIGINAL_MUST_NOT_LEAK",
    "RAW_ORG_MUST_NOT_LEAK",
    "RAW_ROLE_MUST_NOT_LEAK",
    "RAW_PERIOD_MUST_NOT_LEAK",
    "RAW_METRIC_MUST_NOT_LEAK",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(secret.replace("%", "\\%")));
  }
});

test("strategy and suggestion prompt builders never serialize review-only career values", () => {
  const experiences = projectTrustedCareerExperiences({
    userId: OWNER_ID,
    facts: generationFacts(),
    rankings: [{ id: "safe-experience", score: 0.9 }],
  });
  const strategyPrompt = buildResumeStrategyPrompt({
    questionsText: "Q1: Tell us about your work",
    experiences,
  });
  const suggestionPrompt = buildResumeSuggestionPrompt({
    companyName: "Example Co",
    jobTitle: "Engineer",
    questionText: "What did you accomplish?",
    currentSelectedExperienceIds: ["safe-experience"],
    instruction: "Pick evidence",
    experiences,
  });
  const generationContext = buildTrustedCareerGenerationContext({ experiences });

  for (const prompt of [strategyPrompt, suggestionPrompt, generationContext]) {
    assert.match(prompt, /Built a supported launch/);
    assert.doesNotMatch(prompt, /NEEDS_REVIEW_SECRET_ORG/);
    assert.doesNotMatch(prompt, /999%/);
    assert.doesNotMatch(prompt, /FOREIGN_OWNER_SECRET/);
  }
});
