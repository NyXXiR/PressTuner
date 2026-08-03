import assert from "node:assert/strict";
import test from "node:test";

import {
  BRIEF_NORMALIZATION_VERSION,
  buildGroundedBriefPrompts,
  sanitizeGroundedBrief,
} from "./briefNormalizationService";

const sources = [
  {
    id: "memo",
    text: [
      "서비스 이름은 세이브잇이다.",
      "공식 공개 시각은 2026-09-18 10:00이다.",
      '김민준 대표는 "소비가 아닌 자산이 되는 경험을 제공하겠다"고 말했다.',
    ].join(" "),
  },
];

test("grounded brief sanitizer keeps supported facts and rejects invented fields", () => {
  const brief = sanitizeGroundedBrief(
    {
      serviceName: {
        value: "세이브잇",
        sourceId: "memo",
        evidence: "서비스 이름은 세이브잇이다.",
      },
      announceType: {
        value: "신제품 출시",
        sourceId: "memo",
        evidence: "서비스 이름은 세이브잇이다.",
      },
      oneLiner: {
        value: "세이브잇이 공식 공개된다.",
        sourceId: "memo",
        evidence: "공식 공개 시각은 2026-09-18 10:00이다.",
      },
      points: [
        {
          value: "공식 공개 시각은 2026-09-18 10:00이다.",
          sourceId: "memo",
          evidence: "공식 공개 시각은 2026-09-18 10:00이다.",
        },
        {
          value: "개발 예산은 30억원이다.",
          sourceId: "memo",
          evidence: "개발 예산은 30억원이다.",
        },
      ],
      quoteWho: {
        value: "이준호 개발팀장",
        sourceId: "memo",
        evidence: "이준호 개발팀장",
      },
      quoteMessage: {
        value: "빠르고 정확한 검색을 제공하겠다.",
        sourceId: "memo",
        evidence: "빠르고 정확한 검색을 제공하겠다.",
      },
      eventAt: {
        value: "2026-09-18 10:00",
        sourceId: "memo",
        evidence: "공식 공개 시각은 2026-09-18 10:00이다.",
      },
      publishAt: {
        value: "2026-07-24 10:00",
        sourceId: "memo",
        evidence: "오늘 오전 10시",
      },
    },
    sources,
  );

  assert.equal(brief.serviceName, "세이브잇");
  assert.equal(brief.announceType, "신제품 출시");
  assert.equal(brief.eventAt, "2026-09-18 10:00");
  assert.equal(brief.publishAt, "");
  assert.equal(brief.oneLiner, "세이브잇이 공식 공개된다.");
  assert.equal(brief.quoteWho, "");
  assert.equal(brief.quoteMessage, "");
  assert.deepEqual(brief.points, [
    "공식 공개 시각은 2026-09-18 10:00이다.",
  ]);
});

test("grounded brief sanitizer allows a concise summary only when its quoted evidence exists", () => {
  const brief = sanitizeGroundedBrief(
    {
      oneLiner: {
        value: "정부가 탄소국경조정제도 대응 설명회를 개최할 예정이다.",
        sourceId: "memo",
        evidence: "탄소국경조정제도 설명회 개최예정",
      },
      points: [
        {
          value: "보도자료는 7월 29일 오전 9시에 게시한다.",
          sourceId: "memo",
          evidence: "보도자료 게시날짜 7월 29일 오전 9시",
        },
        {
          value: "참여 기업은 25곳이다.",
          sourceId: "memo",
          evidence: "참여 기업은 25곳이다.",
        },
      ],
    },
    [
      {
        id: "memo",
        text: "탄소국경조정제도 설명회 개최예정. 보도자료 게시날짜 7월 29일 오전 9시",
      },
    ],
  );

  assert.equal(
    brief.oneLiner,
    "정부가 탄소국경조정제도 대응 설명회를 개최할 예정이다.",
  );
  assert.deepEqual(brief.points, [
    "보도자료는 7월 29일 오전 9시에 게시한다.",
  ]);
});

test("grounded brief prompts forbid date completion and use versioned evidence", () => {
  const prompts = buildGroundedBriefPrompts({
    tone: "formal",
    sources,
  });

  assert.match(prompts.system, /추측하거나 보완하지 마라/);
  assert.match(
    prompts.system,
    /JSON/i,
    "OpenAI json_object mode requires an explicit JSON instruction",
  );
  assert.match(prompts.system, /sourceId/);
  assert.match(prompts.system, /한 줄 요약과 핵심 포인트/);
  assert.match(prompts.system, /측정 기준, 집계 방식/);
  assert.doesNotMatch(prompts.system, /오늘|현재 연도|현재 월/);
  assert.match(prompts.user, /\[memo\]/);
  assert.match(BRIEF_NORMALIZATION_VERSION, /^grounded-/);
});

test("legacy normalization merges memo and retrieved knowledge into one source block", () => {
  const prompts = buildGroundedBriefPrompts({
    tone: "formal",
    sources: [
      { id: "memo", text: "사용자 메모" },
      { id: "source-1", text: "검색된 팀 문서 사실" },
    ],
  });
  assert.match(prompts.user, /\[memo\][\s\S]*사용자 메모/);
  assert.match(prompts.user, /\[source-1\][\s\S]*검색된 팀 문서 사실/);
});
