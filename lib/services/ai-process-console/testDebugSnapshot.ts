import { Prisma } from "@prisma/client";
import { evaluateFinalOutputQuality } from "@/domain/ai-process-console/v2/checkpointFactHooks";
import { StoredTestDebugSnapshotSchema, type StoredTestDebugSnapshot } from "@/domain/ai-process-console/v2/projectTestDebugContracts";
import { prisma } from "@/lib/prisma";

const object = (value: unknown): Record<string, Prisma.JsonValue> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
const requirement = (guardrailId: string, verdict: "PASS" | "WARN" | "BLOCK", origin: "MANDATORY" | "CASE_EXPECTATION") => ({ requirementId: guardrailId, requirementVersion: "1.0.0", verdict, reasonCodes: verdict === "PASS" ? [] : [origin === "MANDATORY" ? "MANDATORY_GUARDRAIL_FAILED" : "CASE_EXPECTATION_FAILED"] });

export async function captureTestDebugSnapshot(receiptId: string, attemptId: string, processDefinitionVersion = "3.0.0"): Promise<StoredTestDebugSnapshot> {
  const attempt = await prisma.pressAiDebugAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: {
      teamId: true, articleId: true,
      checkpoints: { orderBy: { sequence: "asc" }, select: { nodeId: true, input: true, output: true } },
      transitions: { orderBy: { sequence: "asc" }, select: { id: true, edgeId: true, sourceNodeId: true, targetNodeId: true, targetPayload: true, verdict: true, sourceCheckpoint: { select: { input: true, output: true } }, observations: { orderBy: [{ displayOrder: "asc" }, { guardrailId: "asc" }], select: { guardrailId: true, verdict: true, origin: true } } } },
      article: { select: { teamId: true, type: true } },
    },
  });
  const snapshot = StoredTestDebugSnapshotSchema.parse({
    schemaVersion: "2.0",
    nodes: attempt.checkpoints.map((checkpoint) => {
      const final = checkpoint.nodeId === "selected-rewrite" ? evaluateFinalOutputQuality(checkpoint.output) : undefined;
      return { nodeId: checkpoint.nodeId, input: object(checkpoint.input), output: object(checkpoint.output), requirements: final ? [{ requirementId: "final-output-quality", requirementVersion: "1.0.0", verdict: final.verdict, reasonCodes: final.reasonCodes }] : [] };
    }),
    transitions: attempt.transitions.map((transition) => ({
      transitionId: transition.edgeId, transitionEvaluationId: transition.id, sourceNodeId: transition.sourceNodeId, targetNodeId: transition.targetNodeId,
      sourceInput: object(transition.sourceCheckpoint.input), sourceOutput: object(transition.sourceCheckpoint.output), targetInput: object(transition.targetPayload),
      decision: { decisionRef: `presstuner:decision:${transition.edgeId}:${processDefinitionVersion}`, matched: transition.verdict !== "BLOCK" },
      requirements: transition.observations.map((item) => requirement(item.guardrailId, item.verdict, item.origin)),
      context: { teamId: attempt.teamId, articleId: attempt.articleId, articleTeamId: attempt.article.teamId ?? attempt.teamId, articleType: "PRESS_RELEASE" },
    })),
  });
  await prisma.aiProcessTestRun.update({ where: { id: receiptId }, data: { debugSnapshot: snapshot as unknown as Prisma.InputJsonValue } });
  return snapshot;
}
