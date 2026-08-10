import { z } from "zod";

import { buildGeneratedPlain, evaluatePressDraftQuality, validateSelectedReviewNotes } from "@/domain/press-ai-debugger/processExecutor";
import type { PressAiProcessEvent } from "@/domain/press-ai-debugger/processEvents";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import { initArticleDraft, generateArticleFromBrief } from "@/lib/services/press/pressService";
import { normalizeBriefUseCase } from "@/lib/services/article/generationUseCases";
import { reviewUseCase, rePolishUseCase } from "@/lib/services/article/reviewUseCases";
import { prisma } from "@/lib/prisma";
import type { PressAiDependencyOverrides } from "@/lib/services/article/pressAiDependencies";
import { createPressProcessRun, failProcessRun, finalizeProcessRunObservability, persistProcessEvent, setProcessWaiting, updateProcessStep } from "./processPersistence";

export const StartPressCreationProcessSchema = z.object({ processId: z.literal("press-creation"), rawText: z.string().min(1).max(12_000), tone: z.enum(["formal", "neutral", "friendly"]), reviewInstruction: z.string().max(1000).default("사실과 주의 문구가 보존됐는지 검토해 주세요."), rewriteInstruction: z.string().max(1000).default("선택한 리뷰 의견만 반영해 주세요."), acknowledgedQuotaAndArticleCreation: z.literal(true) }).strict();
export const ContinuePressCreationProcessSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm-brief"), confirmedBrief: z.object({ serviceName: z.string().optional(), announceType: z.string().min(1), oneLiner: z.string().optional(), points: z.array(z.string()), quoteMessage: z.string().optional(), quoteWho: z.string().optional(), tone: z.enum(["formal", "neutral", "friendly"]), rawText: z.string().optional(), eventAt: z.string().optional(), publishAt: z.string().optional() }).passthrough() }).strict(),
  z.object({ action: z.literal("start-review"), userInstruction: z.string().max(1000).optional() }).strict(),
  z.object({ action: z.literal("rewrite-selected"), selectedNoteIds: z.array(z.string()).min(1), userInstruction: z.string().max(1000) }).strict(),
]);

type Dependencies = { initArticleDraft: typeof initArticleDraft; normalizeBriefUseCase: typeof normalizeBriefUseCase; generateArticleFromBrief: typeof generateArticleFromBrief; reviewUseCase: typeof reviewUseCase; rePolishUseCase: typeof rePolishUseCase; pressAiDependencies?: PressAiDependencyOverrides };
const defaults: Dependencies = { initArticleDraft, normalizeBriefUseCase, generateArticleFromBrief, reviewUseCase, rePolishUseCase };

type ProcessObserver = (event: PressAiProcessEvent) => void | Promise<void>;

async function nodeStarted(teamId: string, runId: string, nodeId: string, input: unknown, observer?: ProcessObserver) {
  const node = pressCreationProcess.nodes.find((entry) => entry.id === nodeId);
  if (!node) throw new Error("PRESS_AI_PROCESS_NODE_INVALID");
  node.inputSchema.parse(input);
  await updateProcessStep({ runId, nodeId, status: "RUNNING", input });
  await persistProcessEvent({ teamId, runId, processId: "press-creation", event: { type: "node.state", dedupeKey: `node:${nodeId}:running`, node: { id: nodeId, state: "running", findingCode: null } }, observer });
}
async function nodeCompleted(teamId: string, runId: string, nodeId: string, output: unknown, observer?: ProcessObserver) {
  const node = pressCreationProcess.nodes.find((entry) => entry.id === nodeId);
  if (!node) throw new Error("PRESS_AI_PROCESS_NODE_INVALID");
  node.outputSchema.parse(output);
  await updateProcessStep({ runId, nodeId, status: "COMPLETED", output });
  await persistProcessEvent({ teamId, runId, processId: "press-creation", event: { type: "node.state", dedupeKey: `node:${nodeId}:succeeded`, node: { id: nodeId, state: "succeeded", findingCode: null } }, observer });
}
async function edgeTaken(teamId: string, runId: string, edgeId: string, observer?: ProcessObserver) {
  const edge = pressCreationProcess.edges.find((entry) => entry.id === edgeId);
  if (!edge) throw new Error("PRESS_AI_PROCESS_EDGE_INVALID");
  await persistProcessEvent({ teamId, runId, processId: "press-creation", event: { type: "edge.state", dedupeKey: `edge:${edge.id}:taken`, edge: { id: edge.id, source: edge.source, target: edge.target, state: "taken", findingCode: null } }, observer });
}

export async function startPressCreationProcess(args: { teamId: string; userId: string; input: z.infer<typeof StartPressCreationProcessSchema>; observer?: ProcessObserver }, overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = { ...defaults, ...overrides };
  const run = await createPressProcessRun({ teamId: args.teamId, userId: args.userId, processId: "press-creation", input: args.input, enableObservability: true });
  await persistProcessEvent({ teamId: args.teamId, runId: run.id, processId: "press-creation", event: { type: "run.started", dedupeKey: "run:started", run: { status: "running" } }, observer: args.observer });
  let articleId: string | undefined;
  try {
    await nodeStarted(args.teamId, run.id, "article-initialization", { type: "PRESS_RELEASE" }, args.observer);
    const created = await dependencies.initArticleDraft({ teamId: args.teamId, userId: args.userId, type: "PRESS_RELEASE" });
    articleId = created.id;
    await prisma.agentRun.update({ where: { id: run.id }, data: { articleId } });
    await nodeCompleted(args.teamId, run.id, "article-initialization", { articleId }, args.observer);
    await edgeTaken(args.teamId, run.id, "initialization-brief", args.observer);
    await nodeStarted(args.teamId, run.id, "brief-normalization", { articleId, rawText: args.input.rawText, tone: args.input.tone }, args.observer);
    const normalized = await dependencies.normalizeBriefUseCase({ team: { id: args.teamId }, userId: args.userId, articleId, rawText: args.input.rawText, tone: args.input.tone, quotaMode: "simplified", dependencies: dependencies.pressAiDependencies });
    const output = { articleId, ...normalized.brief, tone: args.input.tone, rawText: args.input.rawText, factCandidates: normalized.factCandidates, usage: normalized.usage };
    await nodeCompleted(args.teamId, run.id, "brief-normalization", output, args.observer);
    await setProcessWaiting({ teamId: args.teamId, runId: run.id, processId: "press-creation", nodeId: "brief-normalization", gateId: "confirm-normalized-brief", articleId, output: { cursor: "brief-normalization", gate: "confirm-normalized-brief", articleId, normalizedBrief: { ...normalized.brief, tone: args.input.tone, rawText: args.input.rawText } }, observer: args.observer });
    return { runId: run.id, articleId, status: "WAITING_APPROVAL" as const };
  } catch (error) { await failProcessRun({ teamId: args.teamId, runId: run.id, processId: "press-creation", nodeId: articleId ? "brief-normalization" : "article-initialization", error, articleId, observer: args.observer }); throw Object.assign(error instanceof Error ? error : new Error("PRESS_AI_PROCESS_FAILED"), { runId: run.id, articleId }); }
}

function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }

export async function continuePressCreationProcess(args: { teamId: string; userId: string; runId: string; input: z.infer<typeof ContinuePressCreationProcessSchema>; observer?: ProcessObserver }, overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = { ...defaults, ...overrides };
  const run = await prisma.agentRun.findFirst({ where: { id: args.runId, teamId: args.teamId, startedById: args.userId, status: "WAITING_APPROVAL", input: { path: ["processId"], equals: "press-creation" } }, select: { id: true, articleId: true, input: true, output: true } });
  if (!run?.articleId) throw Object.assign(new Error("PRESS_AI_PROCESS_CONTINUATION_STALE"), { status: 409, code: "PRESS_AI_PROCESS_CONTINUATION_STALE" });
  const state = record(run.output); const initial = record(record(run.input).initialInput);
  const expectedGate = args.input.action === "confirm-brief" ? "confirm-normalized-brief" : args.input.action === "start-review" ? "confirm-generated-draft" : "select-review-notes";
  if (state.gate !== expectedGate) throw Object.assign(new Error("PRESS_AI_PROCESS_CONTINUATION_STALE"), { status: 409, code: "PRESS_AI_PROCESS_CONTINUATION_STALE" });
  const claimed = await prisma.agentRun.updateMany({ where: { id: run.id, status: "WAITING_APPROVAL" }, data: { status: "RUNNING" } });
  if (claimed.count !== 1) throw Object.assign(new Error("PRESS_AI_PROCESS_CONTINUATION_STALE"), { status: 409, code: "PRESS_AI_PROCESS_CONTINUATION_STALE" });
  const reviewedNodeId = expectedGate === "confirm-normalized-brief" ? "brief-normalization" : expectedGate === "confirm-generated-draft" ? "draft-generation" : "draft-review";
  try {
    await persistProcessEvent({ teamId: args.teamId, runId: run.id, processId: "press-creation", event: { type: "human.reviewed", dedupeKey: `gate:${expectedGate}:approved`, gate: { id: expectedGate, nodeId: reviewedNodeId }, decision: "APPROVED" }, observer: args.observer });
  } catch {
    // Review telemetry must not invalidate a successfully claimed continuation.
  }
  let nodeId = "draft-generation";
  try {
    if (args.input.action === "confirm-brief") {
      await updateProcessStep({ runId: run.id, nodeId: "brief-normalization", status: "COMPLETED" });
      nodeId = "draft-generation"; const body = args.input.confirmedBrief;
      await edgeTaken(args.teamId, run.id, "brief-draft", args.observer);
      await nodeStarted(args.teamId, run.id, nodeId, { articleId: run.articleId, ...body }, args.observer);
      const generated = await dependencies.generateArticleFromBrief({ teamId: args.teamId, userId: args.userId, articleId: run.articleId, body, dependencies: dependencies.pressAiDependencies });
      const plain = buildGeneratedPlain(generated); const output = { ...generated, plain, qualityChecks: evaluatePressDraftQuality(plain) };
      await nodeCompleted(args.teamId, run.id, nodeId, output, args.observer);
      await setProcessWaiting({ teamId: args.teamId, runId: run.id, processId: "press-creation", nodeId, gateId: "confirm-generated-draft", articleId: run.articleId, output: { cursor: nodeId, gate: "confirm-generated-draft", articleId: run.articleId, draft: { title: output.title, plain: output.plain }, confirmedBrief: body }, observer: args.observer });
    } else if (args.input.action === "start-review") {
      await updateProcessStep({ runId: run.id, nodeId: "draft-generation", status: "COMPLETED" });
      nodeId = "draft-review"; const draft = record(state.draft); const instruction = args.input.userInstruction ?? initial.reviewInstruction ?? "";
      await edgeTaken(args.teamId, run.id, "draft-review", args.observer);
      await nodeStarted(args.teamId, run.id, nodeId, { articleId: run.articleId, title: draft.title, plain: draft.plain, userInstruction: instruction }, args.observer);
      const reviewed = await dependencies.reviewUseCase({ team: { id: args.teamId }, userId: args.userId, articleId: run.articleId, title: String(draft.title ?? ""), plain: String(draft.plain ?? ""), userInstruction: String(instruction), quotaMode: "simplified", dependencies: dependencies.pressAiDependencies });
      const reviewOutput = { ...reviewed, qualityChecks: [{ id: "actionable-notes", label: "선택 가능한 리뷰 노트", pass: reviewed.notes.length > 0, detail: `${reviewed.notes.length}개` }] };
      await nodeCompleted(args.teamId, run.id, nodeId, reviewOutput, args.observer);
      await setProcessWaiting({ teamId: args.teamId, runId: run.id, processId: "press-creation", nodeId, gateId: "select-review-notes", articleId: run.articleId, output: { cursor: nodeId, gate: "select-review-notes", articleId: run.articleId, draft, review: reviewOutput }, observer: args.observer });
    } else {
      await updateProcessStep({ runId: run.id, nodeId: "draft-review", status: "COMPLETED" });
      nodeId = "selected-rewrite"; const review = record(state.review); const notes = Array.isArray(review.notes) ? review.notes.filter((note): note is { id: string } => Boolean(note) && typeof note.id === "string") : [];
      const selectedNoteIds = validateSelectedReviewNotes(args.input.selectedNoteIds, notes);
      await edgeTaken(args.teamId, run.id, "review-rewrite", args.observer);
      await nodeStarted(args.teamId, run.id, nodeId, { articleId: run.articleId, selectedNoteIds, userInstruction: args.input.userInstruction }, args.observer);
      const rewritten = await dependencies.rePolishUseCase({ articleId: run.articleId, teamId: args.teamId, userId: args.userId, selectedNoteIds, userInstruction: args.input.userInstruction, quotaMode: "simplified", dependencies: dependencies.pressAiDependencies });
      const output = record(rewritten); const title = output.revisedTitle ?? output.title; const plain = output.revisedPlain ?? output.plain;
      await nodeCompleted(args.teamId, run.id, nodeId, { ...output, title, plain, qualityChecks: evaluatePressDraftQuality(String(plain ?? "")) }, args.observer);
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "COMPLETED", completedAt: new Date(), output: { cursor: nodeId, articleId: run.articleId, title, plain } } });
      await finalizeProcessRunObservability({ teamId: args.teamId, runId: run.id, processId: "press-creation", status: "succeeded", observer: args.observer });
    }
    return { runId: run.id, articleId: run.articleId };
  } catch (error) { await failProcessRun({ teamId: args.teamId, runId: run.id, processId: "press-creation", nodeId, error, articleId: run.articleId, observer: args.observer }); throw error; }
}

export const PRESS_CREATION_NODE_IDS = pressCreationProcess.nodes.map((node) => node.id);
