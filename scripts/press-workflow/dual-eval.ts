import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { CRITERIA, datasetSchema, draftSchema, evaluationBundleSchema, generationBundleSchema, hash, scenarioInputHash,
  type Draft, type GenerationBundle, type Scenario } from "../../domain/press-workflow/evaluation/contracts";
import { DOMAIN_PROMPT, evaluateDraft, type EvaluationPorts } from "../../lib/services/press-workflow/evaluation/evaluate";
import { freezePolicy, validateFrozenPolicy } from "../../domain/press-workflow/evaluation/policy-freeze";
import { runDraftWorkflow } from "../../lib/services/press-workflow/runDraftWorkflow";
import { livePorts } from "./evaluation-ports";

const USAGE = `Dual evaluation: generate | challenges | evaluate | review-packet | review-html | report | report-html | export-summary | freeze-policy
  --out FILE              Required, exclusively created; never overwritten
  --dataset FILE          Default evals/press-workflow/dual/v1/dataset.json
  --input FILE            Saved generation/evaluation artifact
  --review FILE           Human review JSON, for report only
  --policy FILE           Frozen policy required for holdout generation
  --mode mock|live        Default mock; live requires --allow-model-spend
  --partition development|holdout|all (default development)
  --limit 1..30           Default 2 source groups (generation/challenges only)
  --repeats 1..3          Default 1; paired baseline/candidate generation
  --model MODEL          Generator default gpt-4.1-mini
  --judge-model MODEL    Evaluator default gpt-4.1-mini
  --python EXECUTABLE     Python environment with pinned ragas dependencies
  --challenge KIND       Default OMISSION, paired with VALID authored output
  --help
Live evaluation: <=4 bounded Ragas calls + 1 rubric call per saved draft. Serial, no generator retry.
Artifacts contain synthetic source/draft evidence. Model usage is measured; cost is unavailable unless priced separately.
Human review is never inferred from authored expectations. Holdout must not tune prompts.`;

export function parseArgs(argv: string[]) {
  const command = argv[0] ?? "--help";
  const args = { command, out: "", input: "", review: "", policy: "", dataset: "evals/press-workflow/dual/v1/dataset.json", mode: "mock", partition: "development", limit: 2, repeats: 1,
    model: "gpt-4.1-mini", judgeModel: "gpt-4.1-mini", python: process.env.PRESS_EVAL_PYTHON ?? "python", challenge: "OMISSION", allowSpend: false, help: command === "--help" };
  if (!args.help && !["generate", "challenges", "evaluate", "review-packet", "review-html", "report", "report-html", "export-summary", "freeze-policy"].includes(command)) throw new Error("Unknown command");
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--help") { args.help = true; continue; }
    if (flag === "--allow-model-spend") { args.allowSpend = true; continue; }
    const fields: Record<string, string> = { "--out": "out", "--input": "input", "--review": "review", "--policy": "policy", "--dataset": "dataset", "--mode": "mode", "--partition": "partition", "--limit": "limit", "--repeats": "repeats", "--model": "model", "--judge-model": "judgeModel", "--python": "python", "--challenge": "challenge" };
    const field = fields[flag], value = argv[++i];
    if (!field || !value || value.startsWith("--")) throw new Error(`Invalid option ${flag}`);
    Object.assign(args, { [field]: ["limit", "repeats"].includes(field) ? Number(value) : value });
  }
  if (args.help) return args;
  if (!args.out || !["mock", "live"].includes(args.mode) || !["development", "holdout", "all"].includes(args.partition)
    || !Number.isInteger(args.limit) || args.limit < 1 || args.limit > 30 || !Number.isInteger(args.repeats) || args.repeats < 1 || args.repeats > 3
    || !["VALID", "OMISSION", "CONTRADICTION", "STYLE", "LEAKAGE", "PROMOTION", "PARAPHRASE"].includes(args.challenge)) throw new Error("Invalid arguments or bounds");
  if (["generate", "evaluate"].includes(command) && args.mode === "live" && !args.allowSpend) throw new Error("Live mode requires --allow-model-spend");
  if (!["generate", "challenges"].includes(command) && !args.input) throw new Error("--input is required");
  if (command === "freeze-policy" && !args.review) throw new Error("--review is required to freeze policy");
  return args;
}
export const readJson = async (path: string) => {
  const data = await readFile(resolve(path));
  if (data.byteLength > 32 * 1024 * 1024) throw new Error("Artifact too large");
  return JSON.parse(data.toString("utf8"));
};
export async function implementationHash() {
  const files = ["./dual-eval.ts", "./evaluation-ports.ts", "./ragas/evaluate.py", "./ragas/requirements.txt",
    "../../lib/services/press-workflow/evaluation/evaluate.ts", "../../domain/press-workflow/evaluation/policy-freeze.ts",
    "../../lib/services/press-workflow/runDraftWorkflow.ts", "../../domain/press-workflow/configuration.ts",
    "../../lib/llm/articleGenerator.ts", "../../lib/llm/prompts/press-release.ts", "../../lib/utils/datetime.ts"];
  return hash(await Promise.all(files.map(async file => ({ file, text: (await readFile(new URL(file, import.meta.url), "utf8")).replaceAll("\r\n", "\n") }))));
}
const responseFor = (c: Scenario) => ({ title: c.challenges[0].text.split("\n")[0], lead: c.challenges[0].text, fact: c.facts[0].content,
  paragraphs: [{ text: c.facts.map(f => f.content).join(" "), importance: 3 }], closing: "", usedFactIds: c.facts.map(f => f.id) });
function mockPorts(c: Scenario): EvaluationPorts {
  return { mode: "MOCK", model: "synthetic-fixture", ragas: async input => {
    const known = c.challenges.find(d => d.text === input.response);
    return { score: known?.expectedFailures.includes("FACTUAL_SUPPORT") ? 0.5 : 1, usage: null };
  }, judge: async input => {
    const known = c.challenges.find(d => d.text === input.draft);
    return { checks: CRITERIA.map(criterion => ({ criterion, judgment: known?.expectedFailures.includes(criterion) ? "FAIL" : "PASS",
      reason: "합성 배선 검증 결과이며 실제 평가기 판정이 아닙니다.", evidence: [] })), usage: null };
  } };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) { console.log(USAGE); return; }
  const dataset = datasetSchema.parse(await readJson(args.dataset)), datasetHash = hash(dataset);
  // Validate input and reserve destination before constructing clients or making calls.
  const generation = args.command === "evaluate" ? generationBundleSchema.parse(await readJson(args.input)) : null;
  const batch = !["generate", "challenges", "evaluate"].includes(args.command) ? evaluationBundleSchema.parse(await readJson(args.input)) : null;
  const sourceHash = ["generate", "evaluate", "freeze-policy"].includes(args.command) ? await implementationHash() : "";
  if ((generation && generation.datasetHash !== datasetHash) || (batch && batch.generation.datasetHash !== datasetHash)) throw new Error("DATASET_IDENTITY_MISMATCH");
  for (const attempt of generation?.attempts ?? []) if (attempt.draft) {
    const c = dataset.cases.find(c => c.caseId === attempt.caseId);
    if (!c || attempt.draft.inputHash !== scenarioInputHash(c) || attempt.draft.partition !== c.partition || attempt.draft.groupId !== c.groupId) throw new Error("INPUT_IDENTITY_MISMATCH");
  }
  const wantsHoldout = ["generate", "challenges"].includes(args.command) && args.partition !== "development";
  if (wantsHoldout && (!args.policy || args.command === "challenges")) throw new Error("FROZEN_POLICY_REQUIRED");
  const policy = args.command === "generate" && args.policy ? validateFrozenPolicy(await readJson(args.policy), {
    datasetHash, implementationHash: sourceHash, generatorModel: args.model, judgeModel: args.judgeModel, promptHash: hash(DOMAIN_PROMPT),
  }) : undefined;
  if (generation?.attempts.some(a => dataset.cases.find(c => c.caseId === a.caseId)?.partition === "HOLDOUT")) {
    if (!generation.policyFreeze) throw new Error("FROZEN_POLICY_REQUIRED");
    const frozen = validateFrozenPolicy(generation.policyFreeze, { datasetHash, implementationHash: sourceHash, judgeModel: args.judgeModel, promptHash: hash(DOMAIN_PROMPT) });
    if (args.mode !== "live" || generation.attempts.some(a => a.draft && (a.draft.model !== frozen.generatorModel || a.draft.provenance?.implementationHash !== sourceHash))) throw new Error("FROZEN_GENERATION_MISMATCH");
  }
  if (args.mode === "live" && ["generate", "evaluate"].includes(args.command) && !process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");
  const out = resolve(args.out); await mkdir(dirname(out), { recursive: true }); const handle = await open(out, "wx");
  try {
    let artifact: unknown;
    if (["generate", "challenges"].includes(args.command)) {
      const cases = dataset.cases.filter(c => args.partition === "all" || c.partition.toLowerCase() === args.partition).slice(0, args.limit);
      const attempts: GenerationBundle["attempts"] = [];
      const client = args.command === "generate" && args.mode === "live" ? new OpenAI({ maxRetries: 0, timeout: 60_000 }) : null;
      for (const c of cases) for (let trial = 1; trial <= args.repeats; trial++) for (const variant of ["BASELINE", "CANDIDATE"] as const) {
        let usage: Draft["usage"] = null;
        const started = performance.now();
        try {
          let text: string, configurationHash: string, provenance: Draft["provenance"];
          if (args.command === "challenges") {
            text = c.challenges.find(ch => ch.kind === (variant === "BASELINE" ? "VALID" : args.challenge))!.text;
            configurationHash = hash({ source: "AI_AUTHORED", challenge: variant === "BASELINE" ? "VALID" : args.challenge });
          } else {
            const run = await runDraftWorkflow({ caseId: c.caseId, frozenAt: "2026-10-06T00:00:00.000Z",
              input: { announceType: "출시", rawText: `${c.request}\n${c.facts.map(f => f.content).join("\n")}`, points: c.facts.map(f => f.content), acceptedFacts: c.facts, styleExamples: c.styleExamples },
              defaults: { revision: "dual-baseline/v1", model: args.model, tone: "friendly", stylePolicy: c.requestedStyle, requiredPhrases: [], forbiddenPhrases: [] },
              ...(variant === "CANDIDATE" ? { override: { revision: "dual-candidate/v1", stylePolicy: `${c.requestedStyle}\n출시일과 월 이용료를 누락하지 마세요. 표현 예시의 이름, 숫자, 성과는 복사하지 마세요. 근거로 확인한 사실만 서술하세요.` } } : {}),
            }, { mode: args.mode === "live" ? "live" : "mock", completeJson: async request => {
              if (!client) return JSON.stringify(responseFor(c));
              const completion = await client.chat.completions.create({ model: request.model, temperature: request.temperature, messages: request.messages, response_format: request.responseFormat, max_tokens: 3000 });
              usage = completion.usage ? { inputTokens: completion.usage.prompt_tokens, outputTokens: completion.usage.completion_tokens } : null;
              return completion.choices[0]?.message?.content ?? "";
            } });
            if (!run.output) throw new Error("GENERATION_FAILED");
            text = [run.output.title, run.output.lead, run.output.fact, ...run.output.paragraphs.map(p => p.text), run.output.closing].filter(Boolean).join("\n\n");
            configurationHash = run.configuration.contentHash;
            if (!run.request || !run.requestHash) throw new Error("MISSING_GENERATION_PROVENANCE");
            provenance = { implementationHash: sourceHash, request: run.request, requestHash: run.requestHash, configuration: run.configuration.snapshot };
          }
          const draft = draftSchema.parse({ version: "press-eval-draft/v1", caseId: c.caseId, groupId: c.groupId, partition: c.partition, variant, trial, datasetHash,
            inputHash: scenarioInputHash(c), configurationHash, model: args.command === "challenges" ? "authored-challenge" : args.mode === "mock" ? "mock" : args.model,
            evidenceClass: client ? "MEASURED_TEST" : "SYNTHETIC", createdAt: new Date().toISOString(), text, outputHash: hash(text), generationMs: performance.now() - started, usage, ...(provenance ? { provenance } : {}) });
          attempts.push({ caseId: c.caseId, variant, trial, draft, errorCode: null });
        } catch { attempts.push({ caseId: c.caseId, variant, trial, draft: null, errorCode: "GENERATION_FAILED" }); }
      }
      artifact = generationBundleSchema.parse({ version: "press-eval-generation/v1", datasetHash, kind: args.command === "challenges" ? "AUTHORED_CHALLENGES" : "GENERATION", createdAt: new Date().toISOString(), attempts, ...(policy ? { policyFreeze: policy } : {}) });
    } else if (generation) {
      const live = args.mode === "live" ? livePorts(args.judgeModel, args.python) : null;
      const evaluations = [];
      for (const attempt of generation.attempts) if (attempt.draft) {
        const c = dataset.cases.find(c => c.caseId === attempt.caseId)!;
        evaluations.push(await evaluateDraft(dataset, attempt.draft, live ?? mockPorts(c)));
        console.log(`Evaluated ${attempt.caseId}/${attempt.variant}/${attempt.trial}`);
      }
      artifact = evaluationBundleSchema.parse({ version: "press-eval-batch/v1", generation, evaluations });
    } else {
      const report = await import("../../domain/press-workflow/evaluation/report");
      if (args.command === "freeze-policy") artifact = freezePolicy(dataset, batch!, await readJson(args.review), sourceHash);
      else if (args.command === "review-packet") artifact = report.reviewPacket(dataset, batch!);
      else if (args.command === "review-html") artifact = (await import("./evaluation-html")).reviewHtml(report.reviewPacket(dataset, batch!));
      else {
        const result = report.buildReport(dataset, batch!, args.review ? await readJson(args.review) : undefined);
        artifact = args.command === "export-summary" ? result.summary : args.command === "report-html" ? (await import("./evaluation-html")).reportHtml(batch!, result) : result;
      }
    }
    await handle.writeFile(typeof artifact === "string" ? artifact : `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    console.log(`Artifact: ${out}`);
  } finally { await handle.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error instanceof Error && !argsMayUseLive() ? error.message : "Evaluation command failed; check inputs, output collision, environment and dependencies."); process.exitCode = 1;
});
function argsMayUseLive() { return process.argv.includes("live"); }
