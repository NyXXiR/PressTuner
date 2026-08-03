import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { syncBriefUserFacts } from "./articleGroundingService";

test("brief USER fact synchronization is idempotent and preserves manual facts", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: { loginId: `brief-facts-${suffix}`, label: "Brief facts" },
  });
  const team = await prisma.team.create({
    data: { name: `Brief facts ${suffix}`, slug: `brief-facts-${suffix}` },
  });
  const article = await prisma.article.create({
    data: {
      teamId: team.id,
      userId: user.id,
      title: "브리프 사실 테스트",
      bodyJson: { paragraphs: [] },
    },
  });
  const manual = await prisma.articleFact.create({
    data: {
      articleId: article.id,
      teamId: team.id,
      origin: "USER",
      content: "수동 등록 사실",
    },
  });

  try {
    const first = await syncBriefUserFacts({
      teamId: team.id,
      articleId: article.id,
      brief: {
        serviceName: "프레스튜너",
        announceType: "서비스 업데이트",
        points: ["초기 포인트", "삭제할 포인트"],
      },
    });
    assert.equal(first.changed, true);

    const second = await syncBriefUserFacts({
      teamId: team.id,
      articleId: article.id,
      brief: {
        serviceName: "프레스튜너",
        announceType: "서비스 업데이트",
        points: ["수정 포인트"],
      },
    });
    assert.equal(second.changed, true);
    const third = await syncBriefUserFacts({
      teamId: team.id,
      articleId: article.id,
      brief: {
        serviceName: "프레스튜너",
        announceType: "서비스 업데이트",
        points: ["수정 포인트"],
      },
    });
    assert.equal(third.changed, false);

    const facts = await prisma.articleFact.findMany({
      where: { articleId: article.id },
      orderBy: { sourceKey: "asc" },
    });
    assert.equal(facts.find((fact) => fact.id === manual.id)?.active, true);
    assert.equal(
      facts.find((fact) => fact.sourceKey === "brief:point:0")?.content,
      "수정 포인트",
    );
    assert.equal(
      facts.find((fact) => fact.sourceKey === "brief:point:1")?.active,
      false,
    );
    assert.equal(
      (
        await prisma.articleGroundingState.findUniqueOrThrow({
          where: { articleId: article.id },
        })
      ).groundingRevision,
      2,
    );
  } finally {
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
