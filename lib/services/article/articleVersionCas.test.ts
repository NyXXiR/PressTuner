import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { saveDraftUseCase } from "@/lib/services/article/generationUseCases";

test("versioned article save rejects stale agent output without overwriting the user edit", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: { loginId: `agent-cas-${suffix}`, label: "Agent CAS" },
  });
  const team = await prisma.team.create({
    data: { name: `Agent CAS ${suffix}`, slug: `agent-cas-${suffix}` },
  });
  const article = await prisma.article.create({
    data: {
      teamId: team.id,
      userId: user.id,
      type: "PRESS_RELEASE",
      status: "DRAFT",
      title: "Agent baseline",
      bodyJson: { paragraphs: [], closing: "" },
    },
  });

  try {
    await prisma.article.update({
      where: { id: article.id },
      data: {
        title: "User edit",
        updatedAt: new Date(article.updatedAt.getTime() + 1_000),
      },
    });

    await assert.rejects(
      saveDraftUseCase({
        teamId: team.id,
        userId: user.id,
        articleId: article.id,
        expectedUpdatedAt: article.updatedAt,
        patch: {
          title: "Stale agent edit",
          bodyJson: { paragraphs: [{ text: "stale" }], closing: "" },
        },
      }),
      /PRESS_AGENT_ARTICLE_VERSION_CONFLICT/,
    );

    const preserved = await prisma.article.findUniqueOrThrow({
      where: { id: article.id },
      select: { title: true },
    });
    assert.equal(preserved.title, "User edit");
  } finally {
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
