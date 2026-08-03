import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { processReviewAction } from "./reviewService";

test("review approval leaves the article IN_PROGRESS for explicit verification", async () => {
  const suffix = randomUUID();
  const requester = await prisma.user.create({
    data: { loginId: `review-requester-${suffix}`, label: "Requester" },
  });
  const reviewer = await prisma.user.create({
    data: { loginId: `reviewer-${suffix}`, label: "Reviewer" },
  });
  const team = await prisma.team.create({
    data: { slug: `review-${suffix}`, name: "Review" },
  });
  const article = await prisma.article.create({
    data: {
      teamId: team.id,
      userId: requester.id,
      title: "Review draft",
      status: "IN_PROGRESS",
    },
  });
  const assignment = await prisma.articleReviewAssignment.create({
    data: {
      articleId: article.id,
      teamId: team.id,
      reviewerId: reviewer.id,
      assignedById: requester.id,
    },
  });
  try {
    await processReviewAction({
      assignmentId: assignment.id,
      userId: reviewer.id,
      action: "APPROVE",
    });
    assert.equal(
      (
        await prisma.article.findUniqueOrThrow({
          where: { id: article.id },
          select: { status: true },
        })
      ).status,
      "IN_PROGRESS",
    );
  } finally {
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [requester.id, reviewer.id] } },
    });
  }
});
