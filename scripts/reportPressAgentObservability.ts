import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { calculatePressAgentObservability } from "../domain/press-agent/observability";
import { prisma } from "../lib/prisma";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const hours = Number(argument("--hours") ?? "24");
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("PRESS_OBSERVABILITY_HOURS_INVALID");
  }
  const teamId = argument("--team-id") ?? process.env.PRESS_OBSERVABILITY_TEAM_ID;
  const outputPath = argument("--output");
  const since = new Date(Date.now() - hours * 60 * 60 * 1_000);
  const scope = {
    createdAt: { gte: since },
    ...(teamId ? { teamId } : {}),
  };

  const [documents, runs, steps, approvals] = await Promise.all([
    prisma.knowledgeDocument.findMany({
      where: scope,
      select: {
        status: true,
        queuedAt: true,
        processingStartedAt: true,
        indexedAt: true,
      },
    }),
    prisma.agentRun.findMany({
      where: scope,
      select: {
        status: true,
        latencyMs: true,
        retryCount: true,
        inputTokens: true,
        cachedInputTokens: true,
        estimatedCostMicros: true,
      },
    }),
    prisma.agentStep.findMany({
      where: { run: scope },
      select: { kind: true, latencyMs: true },
    }),
    prisma.agentApproval.findMany({
      where: { run: scope },
      select: { requestedAt: true, decidedAt: true },
    }),
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    since: since.toISOString(),
    windowHours: hours,
    scopedToTeam: Boolean(teamId),
    metrics: calculatePressAgentObservability({
      documents,
      runs,
      steps,
      approvals,
    }),
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (outputPath) await writeFile(resolve(outputPath), serialized, "utf8");
  else process.stdout.write(serialized);
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
