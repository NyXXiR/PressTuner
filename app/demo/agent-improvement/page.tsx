import { readFile } from "node:fs/promises";
import path from "node:path";

import { PressAgentImprovementDemo } from "@/components/demo/PressAgentImprovementDemo";
import { sha256Canonical } from "@/domain/evaluation/configurationIdentity";
import { createAgentExperimentCycleEvidence } from "@/domain/evaluation/experimentCycleEvidence";
import { executePressRagExperiment } from "@/lib/services/press-agent/experimentService";

async function json(relativePath: string) {
  return JSON.parse(await readFile(path.join(process.cwd(), relativePath), "utf8"));
}

function opsDemoUrl() {
  const configured = process.env.NEXT_PUBLIC_OPS_AGENT_DEMO_URL;
  if (configured) {
    if (process.env.NODE_ENV === "production" && !configured.startsWith("https://")) {
      return undefined;
    }
    return configured;
  }
  return process.env.NODE_ENV === "production"
    ? undefined
    : "http://localhost:3012/demo/agents/improvement";
}

export default async function AgentImprovementDemoPage() {
  const rawDataset = await json("evals/press-rag/v3/cases.json");
  const cases = rawDataset.cases.map((entry: any) => ({
    id: entry.id,
    question: entry.question,
    expectedBehavior: entry.expectedBehavior,
  }));
  const datasetBody = { version: rawDataset.version, cases };
  const artifact = await executePressRagExperiment({
    executor: "deterministic",
    allowModelSpend: false,
    operatorAuthorized: false,
    baseline: await json("evals/press-rag/configurations/baseline-v1.json"),
    candidate: await json("evals/press-rag/configurations/candidate-v2.json"),
    dataset: {
      id: rawDataset.version,
      ...datasetBody,
      contentHash: sha256Canonical(datasetBody),
    },
    environment: await json("evals/press-rag/environments/deterministic-v1.json"),
  });
  const cycle = createAgentExperimentCycleEvidence({
    cycleId: "press-tuner-cycle-002",
    sequence: 2,
    experiment: artifact,
    auditEvents: [
      {
        occurredAt: artifact.createdAt,
        eventType: "DETERMINISTIC_EXPERIMENT_RECORDED",
        failureCategory: null,
      },
    ],
  });
  return <PressAgentImprovementDemo cycle={cycle} opsUrl={opsDemoUrl()} />;
}
