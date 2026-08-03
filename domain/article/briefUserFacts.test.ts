import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBriefUserFactSpecs,
  planBriefUserFactSync,
} from "./briefUserFacts";

test("confirmed brief fields become stable managed USER fact specs", () => {
  assert.deepEqual(
    buildBriefUserFactSpecs({
      serviceName: "프레스튜너",
      announceType: "서비스 업데이트",
      oneLiner: "AI 첨삭 기능을 공개했다.",
      points: [
        "작성 시간이 40% 줄었다.",
        "참여 팀의 직접 기록 시간을 단순 평균한 내부 집계다.",
      ],
      quoteWho: "김민준 대표",
      quoteMessage: "사실을 지키는 글쓰기를 돕겠다.",
      eventAt: "2026-07-27T10:00:00.000Z",
      publishAt: "2026-07-28T09:00:00.000Z",
    }),
    [
      { sourceKey: "brief:announcement", content: "프레스튜너 · 서비스 업데이트" },
      { sourceKey: "brief:one-liner", content: "AI 첨삭 기능을 공개했다." },
      { sourceKey: "brief:point:0", content: "작성 시간이 40% 줄었다." },
      {
        sourceKey: "brief:point:1",
        content: "참여 팀의 직접 기록 시간을 단순 평균한 내부 집계다.",
      },
      {
        sourceKey: "brief:quote",
        content: '김민준 대표: "사실을 지키는 글쓰기를 돕겠다."',
      },
      {
        sourceKey: "brief:event-at",
        content: "행사/출시 일시: 2026-07-27T10:00:00.000Z",
      },
      {
        sourceKey: "brief:publish-at",
        content: "보도자료 게시 일시: 2026-07-28T09:00:00.000Z",
      },
    ],
  );
});

test("brief fact sync is idempotent and deactivates only stale managed facts", () => {
  const desired = [
    { sourceKey: "brief:point:0", content: "수정된 핵심 사실" },
    { sourceKey: "brief:one-liner", content: "동일한 요약" },
  ];
  const current = [
    { id: "update", sourceKey: "brief:point:0", content: "이전 핵심 사실", active: true },
    { id: "same", sourceKey: "brief:one-liner", content: "동일한 요약", active: true },
    { id: "stale", sourceKey: "brief:point:1", content: "삭제된 사실", active: true },
    { id: "manual", sourceKey: null, content: "수동 등록 사실", active: true },
  ];
  assert.deepEqual(planBriefUserFactSync(current, desired), {
    upserts: [{ sourceKey: "brief:point:0", content: "수정된 핵심 사실" }],
    deactivateIds: ["stale"],
    changed: true,
  });
  assert.deepEqual(
    planBriefUserFactSync(
      [
        { id: "update", sourceKey: "brief:point:0", content: "수정된 핵심 사실", active: true },
        { id: "same", sourceKey: "brief:one-liner", content: "동일한 요약", active: true },
      ],
      desired,
    ),
    { upserts: [], deactivateIds: [], changed: false },
  );
});
