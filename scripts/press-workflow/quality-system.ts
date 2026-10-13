import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { datasetSchema, evaluationBundleSchema, hash } from "../../domain/press-workflow/evaluation/contracts";
import { auditJudges, decisionAnalysis, rebindReview } from "../../domain/press-workflow/evaluation/decision";
import { improvementPlan, promoteRegression, regressionGate } from "../../domain/press-workflow/evaluation/regression";
import { compareExperiment, freezeExperiment } from "../../domain/press-workflow/evaluation/experiment";
import { implementationHash, readJson } from "./dual-eval";

export async function main(argv = process.argv.slice(2)) {
  const [command, ...flags] = argv;
  if (!command || command === "--help") {
    console.log("Quality lifecycle: analyse | plan | freeze | compare | promote | regression | compare-judges | rebind-review\n--input EVALUATION --out NEW_FILE [--review HUMAN_REVIEW] [--dataset FILE] [--against EVALUATION] [--manifest FILE] [--model MODEL]\nNo model calls. regression exits 0=observed pass, 1=regression, 2=incomplete. None authorize deployment.");
    return 0;
  }
  if (!["analyse", "plan", "freeze", "compare", "promote", "regression", "compare-judges", "rebind-review"].includes(command)) throw new Error("INVALID_COMMAND");
  const options: Record<string, string> = {};
  for (let i = 0; i < flags.length; i += 2) {
    if (!["--input", "--out", "--review", "--dataset", "--against", "--manifest", "--model", "--audit"].includes(flags[i]) || !flags[i + 1] || options[flags[i]]) throw new Error("INVALID_ARGUMENTS");
    options[flags[i]] = flags[i + 1];
  }
  if (!options["--input"] || !options["--out"]) throw new Error("INPUT_AND_OUTPUT_REQUIRED");
  const dataset = datasetSchema.parse(await readJson(options["--dataset"] ?? "evals/press-workflow/dual/v1/dataset.json"));
  const batch = evaluationBundleSchema.parse(await readJson(options["--input"]));
  const review = options["--review"] ? await readJson(options["--review"]) : undefined;
  let output: unknown, exitCode = 0;
  if (command === "analyse") output = decisionAnalysis(dataset, batch, review);
  else if (command === "plan") output = improvementPlan(dataset, batch, review);
  else if (command === "freeze") output = freezeExperiment(dataset, batch, review, await implementationHash(), options["--model"] ?? "gpt-4.1-mini");
  else if (command === "compare") output = compareExperiment(dataset, batch, options["--audit"] ? await readJson(options["--audit"]) : undefined);
  else if (command === "promote") output = promoteRegression(dataset, batch, review);
  else if (command === "regression") {
    if (!options["--manifest"]) throw new Error("MANIFEST_REQUIRED");
    const result = regressionGate(dataset, await readJson(options["--manifest"]), batch);
    output = result; exitCode = result.exitCode;
  } else {
    if (!options["--against"] || !review) throw new Error("AGAINST_AND_HUMAN_REVIEW_REQUIRED");
    const other = evaluationBundleSchema.parse(await readJson(options["--against"]));
    const transferred = rebindReview(dataset, batch, review, other);
    output = command === "rebind-review" ? transferred : { version: "press-judge-comparison/v1", sourceReviewHash: hash(review),
      scope: "SAME_OUTPUT_REVIEWED_SAMPLE_ONLY", judges: [batch, other].map((b, i) => ({ artifactHash: hash(b), evaluator: b.evaluations[0]?.evaluator ?? null,
        audit: auditJudges(dataset, b, i ? transferred : review), elapsedMs: b.evaluations.reduce((n, e) => n + e.domain.elapsedMs, 0),
        usage: b.evaluations.map(e => e.domain.usage) })), independentValidation: false };
  }
  const out = resolve(options["--out"]);
  await mkdir(dirname(out), { recursive: true });
  const file = await open(out, "wx");
  try { await file.writeFile(`${JSON.stringify(output, null, 2)}\n`, "utf8"); } finally { await file.close(); }
  console.log(`Quality artifact: ${out}`);
  return exitCode;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then(code => { process.exitCode = code; }).catch(error => {
  console.error(error instanceof Error ? error.message : "Quality command failed"); process.exitCode = 2;
});
