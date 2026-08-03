import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { patchAgentRunFeedback } from "./agentRunFeedbackService";

async function fixture() {
  const suffix = randomUUID();
  const [user, otherUser] = await Promise.all([
    prisma.user.create({
      data: {
        loginId: `agent-feedback-${suffix}`,
        label: "Agent Feedback",
        email: `agent-feedback-${suffix}@example.com`,
      },
    }),
    prisma.user.create({
      data: {
        loginId: `agent-feedback-other-${suffix}`,
        label: "Agent Feedback Other",
        email: `agent-feedback-other-${suffix}@example.com`,
      },
    }),
  ]);
  const team = await prisma.team.create({
    data: {
      slug: `agent-feedback-${suffix}`,
      name: "Agent Feedback",
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });
  const run = await prisma.agentRun.create({
    data: {
      teamId: team.id,
      startedById: user.id,
      status: "COMPLETED",
      agentVersion: "test-v1",
      model: "test",
      input: {},
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });
  return { user, otherUser, team, run };
}

test("Agent feedback persists dimensions independently per user", async () => {
  const { user, otherUser, team, run } = await fixture();
  try {
    await assert.rejects(
      patchAgentRunFeedback({
        runId: run.id,
        teamId: `other-${team.id}`,
        userId: user.id,
        patch: { usefulness: "POSITIVE" },
      }),
      /PRESS_AGENT_RUN_NOT_FOUND/,
    );
    const usefulness = await patchAgentRunFeedback({
      runId: run.id,
      teamId: team.id,
      userId: user.id,
      patch: { usefulness: "POSITIVE" },
    });
    assert.equal(usefulness?.usefulness, "POSITIVE");
    assert.equal(usefulness?.citationAccuracy, null);

    await assert.rejects(
      patchAgentRunFeedback({
        runId: run.id,
        teamId: team.id,
        userId: user.id,
        patch: {
          usefulness: "NEGATIVE",
          citationAccuracy: "POSITIVE",
        },
      }),
      /PRESS_AGENT_CITATION_FEEDBACK_NOT_AVAILABLE/,
    );
    const afterRejected = await prisma.agentRunFeedback.findUniqueOrThrow({
      where: { runId_userId: { runId: run.id, userId: user.id } },
    });
    assert.equal(afterRejected.usefulness, "POSITIVE");

    const clearedCitation = await patchAgentRunFeedback({
      runId: run.id,
      teamId: team.id,
      userId: user.id,
      patch: { citationAccuracy: null },
    });
    assert.equal(clearedCitation?.usefulness, "POSITIVE");
    assert.equal(clearedCitation?.citationAccuracy, null);

    const document = await prisma.knowledgeDocument.create({
      data: {
        teamId: team.id,
        uploadedById: user.id,
        originalName: "feedback-evidence.pdf",
        mimeType: "application/pdf",
        byteSize: 8,
        storageKey: `db://${team.id}/feedback-evidence`,
        checksum: `feedback-evidence-${run.id}`,
        status: "READY",
        sourceData: Buffer.from("%PDF-x"),
      },
    });
    const chunk = await prisma.knowledgeChunk.create({
      data: {
        teamId: team.id,
        documentId: document.id,
        generationId: (
          await prisma.knowledgeIndexGeneration.create({
            data: {
              documentId: document.id,
              generation: 1,
              fingerprint: `fixture-${run.id}`,
              parserVersion: "test-v1",
              chunkerVersion: "test-v1",
              embeddingModel: "test",
              embeddingDimensions: 1536,
              indexStatus: "READY",
              classificationStatus: "READY",
            },
          })
        ).id,
        ordinal: 0,
        content: "feedback evidence",
        pageStart: 1,
        pageEnd: 1,
        contentHash: `feedback-evidence-${run.id}`,
        parserVersion: "test-v1",
      },
    });
    await prisma.agentCitation.create({
      data: {
        runId: run.id,
        documentId: document.id,
        chunkId: chunk.id,
        sourceId: "source-1",
        documentName: document.originalName,
        pageStart: 1,
        pageEnd: 1,
        excerpt: chunk.content,
      },
    });

    const complete = await patchAgentRunFeedback({
      runId: run.id,
      teamId: team.id,
      userId: user.id,
      patch: { citationAccuracy: "NEGATIVE" },
    });
    assert.equal(complete?.usefulness, "POSITIVE");
    assert.equal(complete?.citationAccuracy, "NEGATIVE");

    await patchAgentRunFeedback({
      runId: run.id,
      teamId: team.id,
      userId: otherUser.id,
      patch: { usefulness: "NEGATIVE" },
    });
    assert.equal(
      await prisma.agentRunFeedback.count({ where: { runId: run.id } }),
      2,
    );

    await Promise.all([
      patchAgentRunFeedback({
        runId: run.id,
        teamId: team.id,
        userId: user.id,
        patch: { usefulness: "NEGATIVE" },
      }),
      patchAgentRunFeedback({
        runId: run.id,
        teamId: team.id,
        userId: user.id,
        patch: { citationAccuracy: "POSITIVE" },
      }),
    ]);
    const concurrent = await prisma.agentRunFeedback.findUniqueOrThrow({
      where: { runId_userId: { runId: run.id, userId: user.id } },
    });
    assert.equal(concurrent.usefulness, "NEGATIVE");
    assert.equal(concurrent.citationAccuracy, "POSITIVE");

    await patchAgentRunFeedback({
      runId: run.id,
      teamId: team.id,
      userId: user.id,
      patch: { usefulness: null, citationAccuracy: null },
    });
    assert.equal(
      await prisma.agentRunFeedback.count({
        where: { runId: run.id, userId: user.id },
      }),
      0,
    );
  } finally {
    await prisma.agentCitation.deleteMany({
      where: { run: { teamId: team.id } },
    });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, otherUser.id] } },
    });
  }
});
