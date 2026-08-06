import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluatePressTransitionDataset } from "@/domain/evaluation/pressTransitionEvaluator";

function option(name: string) { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
async function main() {
  const fixture = resolve(option("--fixture") ?? "evals/press-ai-debugger/v1/dataset.json");
  const baselinePath = resolve(option("--baseline") ?? "evals/press-ai-debugger/v1/baseline.json");
  const output = option("--output"); const mode = option("--mode") ?? "deterministic"; const spend = process.argv.includes("--allow-spend");
  let artifact: unknown; let exitCode = 0;
  try {
    if (mode === "live" && !spend) throw new Error("LIVE_EVALUATION_SPEND_AUTHORIZATION_REQUIRED");
    if (mode !== "deterministic") throw new Error("LIVE_EVALUATION_EXECUTOR_NOT_IMPLEMENTED");
    artifact = evaluatePressTransitionDataset(JSON.parse(await readFile(fixture, "utf8")), JSON.parse(await readFile(baselinePath, "utf8")));
    if (!(artifact as { releaseBlockingPassed: boolean }).releaseBlockingPassed) exitCode = 1;
  } catch (error) { exitCode = 1; artifact = { schemaVersion: "press-transition-evaluation/v1", deterministic: mode === "deterministic", releaseBlockingPassed: false, error: { code: error instanceof Error ? error.message : "PRESS_TRANSITION_EVALUATION_FAILED" } }; }
  const rendered = `${JSON.stringify(artifact, null, 2)}\n`;
  if (output) await writeFile(resolve(output), rendered, "utf8"); else process.stdout.write(rendered);
  process.exitCode = exitCode;
}
void main();
