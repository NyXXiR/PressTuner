import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("resume brick organizer API keeps rough memo structuring behind a preview route", () => {
  const route = source("app/api/resume/bricks/organize/route.ts");
  const service = source("lib/services/resume/resumeBrickOrganizerService.ts");
  const modelPolicy = source("lib/ai/modelPolicy.ts");

  assert.match(route, /roughText:\s*z\.string\(\)\.trim\(\)\.min\(10/);
  assert.match(route, /requireTeamContext\(\)/);
  assert.match(route, /action:\s*"resume_brick_extract"/);
  assert.match(route, /organizeResumeBrickDrafts\(parsed\.data\.roughText\)/);
  assert.match(route, /drafts/);
  assert.match(route, /draft:\s*firstDraft/);

  assert.match(service, /zodResponseFormat/);
  assert.match(service, /resume\.brick\.organize/);
  assert.match(service, /OrganizedBrickDraftsSchema/);
  assert.match(service, /items:\s*z\.array\(OrganizedBrickDraftSchema\)\.min\(1\)\.max\(6\)/);
  assert.match(service, /originalText:\s*z\.string\(\)\.min\(10\)/);
  assert.match(service, /startDate:\s*MonthSchema\.nullable\(\)/);
  assert.match(service, /endDate:\s*MonthSchema\.nullable\(\)/);
  assert.match(service, /isCurrent:\s*z\.boolean\(\)/);
  assert.match(service, /tags:\s*z\.array\(z\.string\(\)\.min\(1\)\.max\(16\)\)\.max\(6\)/);
  assert.match(service, /Do not merge separate experiences into one summary/);
  assert.match(service, /4-7 sentences/);
  assert.match(modelPolicy, /"resume\.brick\.organize": AI_MODELS\.MINI/);
});

test("direct brick modal supports multiple organized experience drafts", () => {
  const modal = source("components/resume/BrickModal.tsx");
  const footer = source("components/resume/BrickModalFooter.tsx");
  const client = source("components/resume/brickOrganizerApi.ts");
  const reviewList = source("components/resume/BrickDraftReviewList.tsx");
  const page = source("app/resume/bricks/page.tsx");

  assert.match(client, /\/api\/resume\/bricks\/organize/);
  assert.match(client, /OrganizedBrickDraftSchema/);
  assert.match(client, /drafts:\s*z\.array\(OrganizedBrickDraftSchema\)/);
  assert.match(client, /organizeExperienceBrickDrafts/);
  assert.match(client, /organizeExperienceBrickDraft/);
  assert.match(client, /roughText/);

  assert.match(modal, /roughMemo/);
  assert.match(modal, /organizeExperienceBrickDrafts/);
  assert.match(modal, /setDraftMode\("review"\)/);
  assert.match(modal, /onConfirmMany/);
  assert.match(footer, /AI로 정리/);

  assert.match(reviewList, /여러 경험 후보를 찾았습니다/);
  assert.match(reviewList, /selected/);
  assert.match(reviewList, /내용을 조금 더 구체적으로 다듬어 저장하세요/);

  assert.match(page, /originalText:\s*data\.originalText \?\? data\.content/);
  assert.match(page, /handleSaveBricks/);
  assert.match(page, /\/api\/resume\/career\/candidates/);
  assert.match(page, /경력 기억 후보/);
  assert.doesNotMatch(page, /createBricksBatch/);
});
