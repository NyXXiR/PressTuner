import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const sampleRoot = resolve(
  process.env.PRESSTUNER_QA_SAMPLES_DIR ??
    "/home/nyxxir/presstuner-test-samples",
);
const benchmarkScript = resolve(sampleRoot, "run-independent-benchmark.mjs");

const domainTests = [
  "domain/article/groundingPolicy.test.ts",
  "domain/article/verificationPolicy.test.ts",
  "lib/services/article/articleFinalizationService.test.ts",
  "lib/services/article/articleGroundingService.test.ts",
  "lib/services/article/articleVerificationService.test.ts",
  "lib/services/knowledge/agentKnowledgeCitationService.test.ts",
  "lib/services/knowledge/agentKnowledgeEvidenceService.test.ts",
  "lib/services/knowledge/knowledgeClassificationService.test.ts",
  "lib/services/knowledge/knowledgeContextService.test.ts",
  "lib/services/knowledge/knowledgeDocumentService.test.ts",
  "lib/services/knowledge/knowledgeRetrievalService.test.ts",
  "lib/services/press/pressFinalizationApi.test.ts",
  "domain/career-memory/candidatePolicy.test.ts",
  "domain/career-memory/captureRetryPolicy.test.ts",
  "domain/career-memory/finalAnswerCapture.test.ts",
  "domain/career-memory/retrievalPolicy.test.ts",
  "domain/career-memory/verificationPolicy.test.ts",
  "lib/services/resume/careerCandidateService.test.ts",
  "lib/services/resume/careerFinalAnswerCaptureService.test.ts",
  "lib/services/resume/careerFinalizationService.test.ts",
  "lib/services/resume/careerGroundingService.test.ts",
  "lib/services/resume/careerRetrievalService.test.ts",
  "lib/services/resume/careerVerificationService.test.ts",
];

function runStep(name, command, args, options = {}) {
  const startedAt = Date.now();
  console.log(`\n[QA] ${name}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${name} failed with exit code ${result.status ?? "unknown"}`);
  }
  return {
    name,
    passed: true,
    durationMs: Date.now() - startedAt,
  };
}

function requireInputs() {
  const required = [
    benchmarkScript,
    resolve(sampleRoot, "independent-benchmark-v1/benchmark-manifest.json"),
    resolve(sampleRoot, "career-01-sample-resume.pdf"),
    resolve(sampleRoot, "press-01-company-facts.pdf"),
    resolve(sampleRoot, "press-02-launch-facts.pdf"),
    resolve(sampleRoot, "press-03-style-policy.pdf"),
    resolve(sampleRoot, "press-04-style-examples.pdf"),
  ];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length > 0) {
    throw new Error(`QA sample files are missing:\n${missing.join("\n")}`);
  }
}

function main() {
  requireInputs();
  const results = [];

  results.push(
    runStep("Independent PDF parser benchmark", process.execPath, [
      benchmarkScript,
    ]),
  );
  results.push(
    runStep("Press and Career backend domain suites", process.execPath, [
      resolve(repoRoot, "scripts/run-tests.mjs"),
      ...domainTests,
    ]),
  );
  results.push(
    runStep("Press RAG v1 evaluation contract", process.execPath, [
      "--import",
      "tsx",
      resolve(repoRoot, "scripts/evaluatePressRag.ts"),
      "--dataset",
      resolve(repoRoot, "evals/press-rag/v1/cases.json"),
    ]),
  );
  results.push(
    runStep("Press RAG v2 evaluation contract", process.execPath, [
      "--import",
      "tsx",
      resolve(repoRoot, "scripts/evaluatePressRag.ts"),
      "--dataset",
      resolve(repoRoot, "evals/press-rag/v2/cases.json"),
    ]),
  );

  console.log(
    `\n${JSON.stringify(
      {
        ok: true,
        mode: "local-backend-only",
        sampleRoot,
        testDatabaseSafety: "enforced by scripts/run-tests.mjs",
        steps: results,
      },
      null,
      2,
    )}`,
  );
}

try {
  main();
} catch (error) {
  console.error(
    `\n[QA] FAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
