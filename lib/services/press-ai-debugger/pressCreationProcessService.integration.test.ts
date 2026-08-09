import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import { prisma } from "@/lib/prisma";
import { continuePressCreationProcess, startPressCreationProcess } from "./pressCreationProcessService";

test("Press creation persists the registry nodes and every confirmation handoff", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { loginId: `process-${suffix}`, label: "Process integration" } });
  const team = await prisma.team.create({ data: { slug: `process-${suffix}`, name: "Process integration", planId: "free_v1", plan: "FREE", planCategory: "STANDARD", nextPaymentAmount: 0 } });
  let completionIndex = 0;
  const dependencies = { pressAiDependencies: {
    now: () => new Date("2031-04-17T00:00:00.000Z"),
    searchKnowledge: async () => ({ hits: [] }),
    loadKnowledgeContexts: async () => ({ stylePolicy: "", styleExamples: "" }),
    completeJson: async () => {
      completionIndex += 1;
      if (completionIndex === 1) return JSON.stringify({ serviceName: "픽셔널", announceType: "출시", oneLiner: "테스트", points: ["근거 본문", "외부 검증 전이며 대조군 없음"], quoteMessage: "", quoteWho: "", eventAt: "", publishAt: "" });
      if (completionIndex === 2) return JSON.stringify({ title: "픽셔널 출시", lead: "리드", fact: "사실", paragraphs: [{ text: "근거 본문", importance: 3 }], closing: "끝", usedFactIds: [] });
      if (completionIndex === 3) return JSON.stringify({ notes: [{ quote: "근거 본문", note: "더 명확하게", type: "HINT", sourceFactIds: [] }] });
      return JSON.stringify({ title: "픽셔널 출시 수정", plain: "수정 본문" });
    },
  } };
  try {
    const started = await startPressCreationProcess({ teamId: team.id, userId: user.id, input: { processId: "press-creation", rawText: "픽셔널 메모", tone: "formal", reviewInstruction: "검토", rewriteInstruction: "수정", acknowledgedQuotaAndArticleCreation: true } }, dependencies);
    let run = await prisma.agentRun.findUniqueOrThrow({ where: { id: started.runId }, include: { steps: { orderBy: { sequence: "asc" } }, approvals: true } });
    assert.equal(run.status, "WAITING_APPROVAL"); assert.equal(run.articleId, started.articleId); assert.equal(run.approvals.length, 0);
    assert.deepEqual(run.steps.map((step) => step.toolName), pressCreationProcess.nodes.map((node) => node.id));
    await continuePressCreationProcess({ teamId: team.id, userId: user.id, runId: run.id, input: { action: "confirm-brief", confirmedBrief: { serviceName: "픽셔널", announceType: "출시", points: ["근거"], tone: "formal" } } }, dependencies);
    await continuePressCreationProcess({ teamId: team.id, userId: user.id, runId: run.id, input: { action: "start-review", userInstruction: "검토" } }, dependencies);
    const waitingReview = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id }, select: { output: true } });
    const noteId = (((waitingReview.output as any).review.notes as Array<{ id: string }>)[0]).id;
    await continuePressCreationProcess({ teamId: team.id, userId: user.id, runId: run.id, input: { action: "rewrite-selected", selectedNoteIds: [noteId], userInstruction: "수정" } }, dependencies);
    run = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id }, include: { steps: { orderBy: { sequence: "asc" } }, approvals: true } });
    assert.equal(run.status, "COMPLETED"); assert.deepEqual(run.steps.map((step) => step.status), pressCreationProcess.nodes.map(() => "COMPLETED")); assert.equal(run.approvals.length, 0);
    assert.equal((run.output as Record<string, unknown>).plain, "수정 본문");
    const events = await prisma.agentRuntimeAuditEvent.count({ where: { runId: run.id, eventType: "PUBLIC_PROCESS_EVENT_V1" } }); assert.ok(events >= 10);
    const canonicalReviews = await prisma.agentRuntimeAuditEvent.findMany({
      where: { runId: run.id, eventType: "CANONICAL_AI_TELEMETRY_V1", eventKind: "human.approval" },
      orderBy: { sequence: "asc" },
      select: { details: true },
    });
    assert.deepEqual(canonicalReviews.map(({ details }) => (details as any).payload.decision), [
      "PENDING", "APPROVED",
      "PENDING", "APPROVED",
      "PENDING", "APPROVED",
    ]);
    assert.doesNotMatch(JSON.stringify(canonicalReviews), /픽셔널 메모|검토|수정 본문|selectedNoteIds|userInstruction/);
    assert.deepEqual((await prisma.usageLog.findMany({ where: { teamId: team.id }, select: { model: true }, orderBy: { createdAt: "asc" } })).map((entry) => entry.model), ["quota:PRESS:press_brief_normalize", "quota:PRESS:press_draft_generate", "quota:PRESS:press_review", "quota:PRESS:press_rewrite"]);
  } finally {
    // Runtime audit events intentionally have no Prisma relation, so remove them
    // before the team cascade deletes the associated run.
    await prisma.agentRuntimeAuditEvent.deleteMany({ where: { teamId: team.id } });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("approval persistence failure cannot strand a claimed continuation in RUNNING", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { loginId: `process-failure-${suffix}`, label: "Process failure integration" } });
  const team = await prisma.team.create({ data: { slug: `process-failure-${suffix}`, name: "Process failure integration", planId: "free_v1", plan: "FREE", planCategory: "STANDARD", nextPaymentAmount: 0 } });
  const dependencies = { pressAiDependencies: {
    now: () => new Date("2031-04-17T00:00:00.000Z"),
    searchKnowledge: async () => ({ hits: [] }),
    loadKnowledgeContexts: async () => ({ stylePolicy: "", styleExamples: "" }),
    completeJson: async () => JSON.stringify({ serviceName: "픽셔널", announceType: "출시", oneLiner: "테스트", points: ["근거"], quoteMessage: "", quoteWho: "", eventAt: "", publishAt: "" }),
  } };
  try {
    const started = await startPressCreationProcess({ teamId: team.id, userId: user.id, input: { processId: "press-creation", rawText: "픽셔널 메모", tone: "formal", reviewInstruction: "검토", rewriteInstruction: "수정", acknowledgedQuotaAndArticleCreation: true } }, dependencies);
    await assert.rejects(() => continuePressCreationProcess({
      teamId: team.id,
      userId: user.id,
      runId: started.runId,
      input: { action: "confirm-brief", confirmedBrief: { serviceName: "픽셔널", announceType: "출시", points: ["근거"], tone: "formal" } },
    }, {
      ...dependencies,
      persistHumanReview: async () => { throw new Error("review persistence unavailable"); },
    }), /review persistence unavailable/);
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: started.runId }, select: { status: true } });
    assert.equal(run.status, "FAILED");
  } finally {
    await prisma.agentRuntimeAuditEvent.deleteMany({ where: { teamId: team.id } });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
