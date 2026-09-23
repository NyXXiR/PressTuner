import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { draftRunInputSchema } from "../../domain/press-workflow/configuration";
import { draftOutputSchema } from "../../domain/press-workflow/guardrails";
import { runDraftWorkflow, type DraftWorkflowDependencies } from "../../lib/services/press-workflow/runDraftWorkflow";

const scenarioSchema = draftRunInputSchema.extend({ mockResponse: draftOutputSchema });
const usage = `Usage: npm run workflow:press -- [options]
  --case <file>       Default: evals/press-workflow/friendly-launch.json
  --out <file>        New JSON artifact (existing files are never overwritten)
  --mode mock|live    Default: mock; both baseline and candidate run once
  --allow-model-spend Required with live; OPENAI_API_KEY must be set in the environment
  --help             Print this help

Mock uses a fixed synthetic response for both configurations; it cannot demonstrate quality improvement.
Live makes two sequential model calls and does not use a database or a Next.js server.
Environment files are not loaded automatically. Artifacts contain full prompts and output; keep them local.`;

export function parseArguments(argv: string[]) {
  const result = {
    casePath: "evals/press-workflow/friendly-launch.json",
    out: `evals/press-workflow/runs/${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    mode: "mock" as "mock" | "live",
    allowModelSpend: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === "--help") { result.help = true; continue; }
    if (flag === "--allow-model-spend") { result.allowModelSpend = true; continue; }
    if (!["--case", "--out", "--mode"].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (flag === "--case") result.casePath = value;
    if (flag === "--out") result.out = value;
    if (flag === "--mode") {
      if (value !== "mock" && value !== "live") throw new Error("Mode must be mock or live");
      result.mode = value;
    }
  }
  if (!result.help && result.mode === "live" && !result.allowModelSpend) {
    throw new Error("Live mode requires --allow-model-spend (two model calls)");
  }
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  if (args.help) { console.log(usage); return; }
  const scenario = scenarioSchema.parse(JSON.parse(await readFile(resolve(args.casePath), "utf8")));
  const { mockResponse, ...runInput } = scenario;
  let completeJson: DraftWorkflowDependencies["completeJson"];
  if (args.mode === "mock") {
    completeJson = async () => JSON.stringify(mockResponse);
  } else {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for live mode");
    const { default: OpenAI } = await import("openai");
    // No automatic retries: one CLI comparison means exactly two attempted calls.
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 60_000 });
    completeJson = async (request) => {
      const result = await client.chat.completions.create({
        model: request.model, messages: request.messages,
        temperature: request.temperature, response_format: request.responseFormat,
      });
      return result.choices[0]?.message?.content ?? "";
    };
  }
  const outPath = resolve(args.out);
  await mkdir(dirname(outPath), { recursive: true });
  // Reserve before any model calls; a collision cannot spend money and then lose the result.
  const file = await open(outPath, "wx");
  try {
    const dependencies = { mode: args.mode, completeJson };
    const baselineInput = { ...runInput };
    delete baselineInput.override;
    const baseline = await runDraftWorkflow(baselineInput, dependencies);
    const candidate = await runDraftWorkflow(runInput, dependencies);
    const comparison = {
      version: "press-draft-comparison/v1",
      createdAt: new Date().toISOString(),
      baseline, candidate,
      qualityComparison: "NOT_EVALUATED",
      note: args.mode === "mock"
        ? "Both outputs use the same fixed synthetic response. Inspect prompts/configuration; do not infer model quality."
        : "Two real model executions. Human review is required; one pair is not a quality benchmark.",
    };
    await file.writeFile(`${JSON.stringify(comparison, null, 2)}\n`, "utf8");
    console.log(`Artifact: ${outPath}`);
    console.log(`Baseline: ${baseline.executionStatus}/${baseline.guardrailStatus}; candidate: ${candidate.executionStatus}/${candidate.guardrailStatus}; quality: NOT_EVALUATED`);
    if ([baseline, candidate].some((run) => run.executionStatus === "FAILED" || run.guardrailStatus === "BLOCK")) {
      process.exitCode = 1;
    }
  } finally {
    await file.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Workflow failed");
    process.exitCode = 1;
  });
}
