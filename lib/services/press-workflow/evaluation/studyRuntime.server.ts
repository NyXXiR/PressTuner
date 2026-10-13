import "server-only";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomInt, randomUUID } from "node:crypto";
import OpenAI from "openai";
import { prisma } from "../../../prisma";
import { hash } from "../../../../domain/press-workflow/evaluation/contracts";
import { requireStudy } from "../../../../domain/press-workflow/evaluation/study";
import { runDraftWorkflow } from "../runDraftWorkflow";
import { makeStudyRepository } from "./studyRepository";
import { makeQualityRepository } from "./qualityRepository";
import { qualityRuntime, measureQualityMetric } from "./qualityRuntime.server";
import { executeArticleEvaluation } from "./articleEvaluation";
import { loadSnapshot } from "./articleStandardEvaluation.server";
import type { StudyActor, StudyPorts } from "./studyService";

export async function verifyStudyActor(actor: StudyActor) {
  const member = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: actor.teamId, userId: actor.userId } }, select: { role: true } });
  requireStudy(member && (!actor.operator || ["OWNER", "ADMIN"].includes(member.role)), "STUDY_ACCESS_REVOKED");
}
export function studyPorts(): StudyPorts {
  const repository = makeStudyRepository(prisma), evaluations = makeQualityRepository(prisma);
  return { repository, now: () => new Date().toISOString(), random: () => randomInt(0, 2 ** 30) / 2 ** 30, token: randomUUID,
    async loadRun(articleId, runId, actor) {
      await verifyStudyActor(actor); const source = await loadSnapshot(articleId, actor.userId);
      requireStudy(source.teamId === actor.teamId, "SAMPLE_TEAM_MISMATCH");
      const run = await evaluations.find(articleId, runId); requireStudy(run && run.teamId === actor.teamId, "SAMPLE_NOT_FOUND"); return run;
    },
    runtime: qualityRuntime,
    async generator() {
      const files = ["lib/services/press-workflow/evaluation/studyRuntime.server.ts", "lib/services/press-workflow/runDraftWorkflow.ts", "domain/press-workflow/configuration.ts", "lib/llm/articleGenerator.ts", "lib/llm/prompts/press-release.ts", "lib/utils/datetime.ts"];
      const root = process.env.PRESS_EVALUATION_ROOT || process.cwd();
      const implementationHash = hash(await Promise.all(files.map(async file => { const path = resolve(root, file); return { file, source: (await readFile(/* turbopackIgnore: true */ path, "utf8")).replaceAll("\r\n", "\n") }; })));
      // Match the established headless generator. Judge models remain independent.
      return { model: process.env.PRESS_EXPERIMENT_MODEL || "gpt-4.1-mini", implementationHash };
    },
    async generate(snapshot, experiment, variant) {
      const client = new OpenAI({ maxRetries: 0, timeout: 60000 });
      let usage: { inputTokens: number; outputTokens: number } | null = null;
      const started = performance.now();
      const run = await runDraftWorkflow({ caseId: snapshot.articleId, frozenAt: experiment.createdAt,
        input: { announceType: "보도자료", rawText: `${snapshot.input.request}\n${snapshot.facts.map(x => x.content).join("\n")}`, points: snapshot.facts.map(x => x.content), acceptedFacts: snapshot.facts.map(({ id, content }) => ({ id, content })), styleExamples: "" },
        defaults: { revision: "study-baseline/v1", model: experiment.generatorModel, tone: "neutral", stylePolicy: "", requiredPhrases: [], forbiddenPhrases: [] },
        ...(variant === "CANDIDATE" ? { override: { revision: experiment.recipeHash, stylePolicy: experiment.instructions.map(x => x.text).join("\n") } } : {}),
      }, { mode: "live", completeJson: async request => {
        const result = await client.chat.completions.create({ model: request.model, messages: request.messages, temperature: request.temperature, response_format: request.responseFormat, max_tokens: 2000 });
        usage = result.usage ? { inputTokens: result.usage.prompt_tokens, outputTokens: result.usage.completion_tokens } : null;
        return result.choices[0]?.message?.content ?? "";
      } });
      requireStudy(run.output && run.requestHash, "GENERATION_FAILED");
      const output = [run.output.title, run.output.lead, run.output.fact, ...run.output.paragraphs.map(x => x.text), run.output.closing].filter(Boolean).join("\n\n");
      return { sampleId: "assigned-by-service", variant, output, outputHash: hash(output), generation: { evidence: "MEASURED", model: experiment.generatorModel, recipeHash: experiment.recipeHash, requestHash: run.requestHash, elapsedMs: performance.now() - started, usage } };
    },
    async evaluate(snapshot, experiment, key, actor) {
      const result = await executeArticleEvaluation(snapshot.articleId, actor.userId, { kind: experiment.evaluator.kind, expectedOutput: snapshot.input.output, idempotencyKey: key }, {
        load: async () => { await verifyStudyActor(actor); const current = await loadSnapshot(snapshot.articleId, actor.userId); requireStudy(current.teamId === actor.teamId, "SAMPLE_TEAM_MISMATCH"); return structuredClone(snapshot); },
        runtime: async kind => { const runtime = await qualityRuntime(kind); requireStudy(hash(runtime.profile) === hash(experiment.evaluator), "FROZEN_EVALUATOR_MISMATCH"); return runtime; },
        measure: measureQualityMetric, repository: evaluations,
      });
      const run = await evaluations.find(snapshot.articleId, result.id); requireStudy(run, "EVALUATION_NOT_FOUND"); return run;
    },
  };
}
