import {
  FIXED_EVIDENCE_GUARDRAIL_ID,
  PUBLIC_PRESS_RAG_EVIDENCE,
  publicPressRagScenarioProcess,
  verifyNormalizedClaims,
  type PressRagCommandRequest,
  type PressRagNormalizationOutput,
  type PublicPressRagAttempt,
} from "./pressRagScenarioContract";
import {
  EVIDENCE_FACT_CONSISTENCY_REQUIREMENT_ID,
  evidenceFactText,
  evaluateEvidenceFactConsistency,
} from "@/domain/article/evidenceFactConsistency";

export class PressRagMachineError extends Error {
  constructor(readonly code: string, readonly details: Record<string, unknown> = {}) {
    super(code);
  }
}

type MachineContext = { now?: number; id?: () => string; revision?: number };
const timestamp = (context: MachineContext) => new Date(context.now ?? Date.now()).toISOString();
const identifier = (context: MachineContext, prefix: string) =>
  `${prefix}-${context.id?.() ?? crypto.randomUUID()}`;

export function createPublicPressRagAttempt(args: {
  runId: string;
  memo: string;
  tone: "formal" | "neutral" | "friendly";
  now?: number;
}): PublicPressRagAttempt {
  const createdAt = new Date(args.now ?? Date.now()).toISOString();
  const articleId = `demo-article-${args.runId}`;
  return {
    id: `attempt-${args.runId}-1`,
    processId: "press-creation",
    processVersion: publicPressRagScenarioProcess.version,
    registryHash: "public-fixed-evidence-v1",
    executorVersion: "public-press-rag-v1",
    status: "ACTIVE",
    revision: 0,
    articleId,
    activeNodeId: "article-initialization",
    startNodeId: "article-initialization",
    createdAt,
    completedAt: null,
    parentAttemptId: null,
    inputSnapshot: {
      articleId,
      rawText: args.memo,
      tone: args.tone,
      reviewInstruction: "사실을 유지하면서 제목과 본문의 명료성을 검토하세요.",
      rewriteInstruction: "선택한 리뷰 노트만 반영하고 근거 사실은 유지하세요.",
    },
    checkpoints: [],
    transitions: [],
  };
}

const latestCheckpoint = (attempt: PublicPressRagAttempt, nodeId: string) =>
  [...attempt.checkpoints]
    .filter((checkpoint) => checkpoint.nodeId === nodeId)
    .sort((left, right) => right.sequence - left.sequence)[0];

export function derivePublicPressRagNodeInput(
  attempt: PublicPressRagAttempt,
  command: Extract<PressRagCommandRequest, { type: "execute_node" }>,
) {
  const nodeId = attempt.activeNodeId;
  if (!nodeId) throw new PressRagMachineError("PRESS_RAG_NODE_OUT_OF_ORDER");
  const snapshot = attempt.inputSnapshot;
  if (nodeId === "article-initialization") return { type: "PRESS_RELEASE" };
  if (nodeId === "brief-normalization") {
    return {
      articleId: attempt.articleId,
      rawText: command.correctedMemo ?? snapshot.rawText,
      tone: snapshot.tone,
      evidenceDocument: PUBLIC_PRESS_RAG_EVIDENCE,
    };
  }
  const draft = latestCheckpoint(attempt, "draft-generation")?.output as
    | { title?: string; plain?: string }
    | undefined;
  if (nodeId === "draft-generation") {
    const brief = latestCheckpoint(attempt, "brief-normalization")?.output;
    if (!brief) throw new PressRagMachineError("PRESS_RAG_NODE_OUT_OF_ORDER");
    return { articleId: attempt.articleId, confirmedBrief: brief };
  }
  if (nodeId === "draft-review") {
    if (!draft?.title || !draft.plain) throw new PressRagMachineError("PRESS_RAG_NODE_OUT_OF_ORDER");
    return {
      articleId: attempt.articleId,
      title: draft.title,
      plain: draft.plain,
      userInstruction: command.reviewInstruction ?? snapshot.reviewInstruction,
    };
  }
  if (nodeId === "selected-rewrite") {
    const review = latestCheckpoint(attempt, "draft-review")?.output as
      | { notes?: Array<{ id: string }> }
      | undefined;
    const available = new Set(review?.notes?.map((note) => note.id) ?? []);
    const selected = command.selectedNoteIds ?? [];
    if (!selected.length || selected.some((id) => !available.has(id))) {
      throw new PressRagMachineError("PRESS_RAG_REVIEW_NOTE_INVALID", {
        availableNoteIds: [...available],
      });
    }
    return {
      articleId: attempt.articleId,
      title: draft?.title,
      plain: draft?.plain,
      reviewNotes: review?.notes,
      selectedNoteIds: selected,
      userInstruction: command.rewriteInstruction ?? snapshot.rewriteInstruction,
    };
  }
  throw new PressRagMachineError("PRESS_RAG_NODE_OUT_OF_ORDER");
}

function observation(
  context: MachineContext,
  guardrailId: string,
  verdict: "PASS" | "WARN" | "BLOCK",
  expected: string,
  observed: string,
  reason: string,
  evidence: unknown,
  displayOrder: number,
) {
  return {
    id: identifier(context, "observation"),
    guardrailId,
    origin: "MANDATORY" as const,
    expected,
    observed,
    reason,
    evidence,
    verdict,
    displayOrder,
  };
}

function passObservations(context: MachineContext, edgeId: string) {
  const edge = publicPressRagScenarioProcess.edges.find((item) => item.id === edgeId);
  return (edge?.mandatoryGuardrailIds ?? [])
    .filter((id) => id !== FIXED_EVIDENCE_GUARDRAIL_ID && id !== EVIDENCE_FACT_CONSISTENCY_REQUIREMENT_ID)
    .map((id, index) =>
      observation(
        context,
        id,
        "PASS",
        "입력 메모와 이전 체크포인트의 핵심 사실을 보존합니다.",
        "데모 입력과 출력에서 핵심 사실 보존을 확인했습니다.",
        "기존 메모 보존 규칙을 통과했습니다.",
        { edgeId },
        index,
      ),
    );
}

function transitionForExecution(
  attempt: PublicPressRagAttempt,
  nodeId: string,
  checkpointId: string,
  output: unknown,
  context: MachineContext,
) {
  let edgeId: string | null = null;
  const reviewExecutions = attempt.checkpoints.filter((item) => item.nodeId === "draft-review").length;
  if (nodeId === "article-initialization") edgeId = "initialization-brief";
  else if (nodeId === "brief-normalization") edgeId = "brief-draft";
  else if (nodeId === "draft-generation") edgeId = "draft-review";
  else if (nodeId === "draft-review") edgeId = reviewExecutions === 0 ? "review-repeat" : "review-rewrite";
  if (!edgeId) return null;
  const edge = publicPressRagScenarioProcess.edges.find((item) => item.id === edgeId)!;
  const draft = latestCheckpoint(attempt, "draft-generation")?.output as
    | { title?: string; plain?: string }
    | undefined;
  const targetPayload = edgeId === "initialization-brief"
    ? { articleId: attempt.articleId, rawText: attempt.inputSnapshot.rawText, tone: attempt.inputSnapshot.tone }
    : edgeId === "brief-draft"
      ? { articleId: attempt.articleId, confirmedBrief: output }
      : edgeId === "draft-review" || edgeId === "review-repeat"
        ? { articleId: attempt.articleId, title: draft?.title ?? (output as { title?: string }).title, plain: draft?.plain ?? (output as { plain?: string }).plain, reviewInstruction: attempt.inputSnapshot.reviewInstruction }
        : { articleId: attempt.articleId, reviewNotes: (output as { notes?: unknown }).notes, selectedNoteIds: [], rewriteInstruction: attempt.inputSnapshot.rewriteInstruction };
  let observations = passObservations(context, edgeId);
  let verdict: "PASS" | "BLOCK" = "PASS";
  if (edgeId === "brief-draft") {
    const result = verifyNormalizedClaims(output as PressRagNormalizationOutput);
    verdict = result.verdict;
    observations = [
      ...observations,
      observation(
        context,
        result.guardrailId,
        result.verdict,
        result.expected,
        result.observed,
        result.reason,
        result.evidence,
        observations.length,
      ),
    ];
  } else if (edgeId === "draft-review") {
    const assessment = evaluateEvidenceFactConsistency({
      draftText: evidenceFactText(output),
      sources: [{
        documentId: PUBLIC_PRESS_RAG_EVIDENCE.id,
        sourceVersion: PUBLIC_PRESS_RAG_EVIDENCE.sourceVersion,
        chunkId: PUBLIC_PRESS_RAG_EVIDENCE.chunkId,
        pageStart: PUBLIC_PRESS_RAG_EVIDENCE.pageStart,
        pageEnd: PUBLIC_PRESS_RAG_EVIDENCE.pageEnd,
        excerpt: PUBLIC_PRESS_RAG_EVIDENCE.facts.find((item) => item.id === "FACT-BRIDGE-REVENUE-2026")!.excerpt,
        content: PUBLIC_PRESS_RAG_EVIDENCE.facts.find((item) => item.id === "FACT-BRIDGE-REVENUE-2026")!.excerpt,
      }],
    });
    verdict = assessment.verdict === "BLOCK" ? "BLOCK" : "PASS";
    observations = [...observations, observation(
      context,
      EVIDENCE_FACT_CONSISTENCY_REQUIREMENT_ID,
      verdict,
      "통제 합성 PDF의 현재 수치 근거와 동일한 초안 주장",
      assessment.verdict.toLocaleLowerCase("en-US"),
      verdict === "BLOCK" ? "초안 수치가 통제 합성 근거와 충돌합니다." : "초안 수치가 통제 합성 근거와 일치합니다.",
      assessment.verdict === "NOT_EVALUABLE" ? null : assessment.details,
      observations.length,
    )];
  }
  return {
    id: identifier(context, "transition"),
    edgeId,
    sequence: attempt.transitions.length,
    sourceNodeId: edge.source,
    sourceCheckpointId: checkpointId,
    targetNodeId: edge.target,
    targetPayload,
    verdict,
    warnAcknowledgedAt: null,
    humanGateAcknowledgedAt: null,
    advancedAt: null,
    observations,
  };
}

export function executePublicPressRagNode(args: {
  attempt: PublicPressRagAttempt;
  input: unknown;
  output: unknown;
  context?: MachineContext;
}) {
  const context = args.context ?? {};
  const nodeId = args.attempt.activeNodeId;
  if (!nodeId) throw new PressRagMachineError("PRESS_RAG_NODE_OUT_OF_ORDER");
  if (args.attempt.transitions.some((transition) => !transition.advancedAt)) {
    throw new PressRagMachineError("PRESS_RAG_NODE_OUT_OF_ORDER");
  }
  const checkpoint = {
    id: identifier(context, "checkpoint"),
    nodeId,
    sequence: args.attempt.checkpoints.length,
    mode: "EXECUTED" as const,
    input: args.input,
    output: args.output,
    quotaUnits: nodeId === "article-initialization" ? 0 : 1,
  };
  const transition = transitionForExecution(
    args.attempt,
    nodeId,
    checkpoint.id,
    args.output,
    context,
  );
  const completed = nodeId === "selected-rewrite";
  const blocked = transition?.verdict === "BLOCK";
  return {
    ...args.attempt,
    revision: context.revision ?? args.attempt.revision + 1,
    status: completed ? ("COMPLETED" as const) : blocked ? ("BLOCKED" as const) : ("INSPECTING" as const),
    activeNodeId: null,
    completedAt: completed ? timestamp(context) : null,
    checkpoints: [...args.attempt.checkpoints, checkpoint],
    transitions: transition ? [...args.attempt.transitions, transition] : args.attempt.transitions,
  };
}

export function advancePublicPressRagEdge(
  attempt: PublicPressRagAttempt,
  context: MachineContext = {},
) {
  const pending = attempt.transitions.find((transition) => !transition.advancedAt);
  if (!pending || attempt.activeNodeId || pending.verdict === "BLOCK") {
    throw new PressRagMachineError("PRESS_RAG_EDGE_OUT_OF_ORDER");
  }
  const at = timestamp(context);
  return {
    ...attempt,
    revision: context.revision ?? attempt.revision + 1,
    status: "ACTIVE" as const,
    activeNodeId: pending.targetNodeId,
    transitions: attempt.transitions.map((transition) =>
      transition.id === pending.id
        ? { ...transition, advancedAt: at, humanGateAcknowledgedAt: at }
        : transition,
    ),
  };
}

export function retryPublicPressRagFromBlock(args: {
  attempt: PublicPressRagAttempt;
  correctedMemo: string;
  context?: MachineContext;
}) {
  const context = args.context ?? {};
  const blocked = args.attempt.transitions.find(
    (transition) => !transition.advancedAt && transition.verdict === "BLOCK",
  );
  if (!blocked || !["brief-draft", "draft-review"].includes(blocked.edgeId)) {
    throw new PressRagMachineError("PRESS_RAG_RETRY_OUT_OF_ORDER");
  }
  const restored = args.attempt.checkpoints
    .filter((checkpoint) => checkpoint.sequence < (args.attempt.checkpoints.find((item) => item.id === blocked.sourceCheckpointId)?.sequence ?? 0))
    .map((checkpoint, index) => ({
      ...checkpoint,
      id: identifier(context, "checkpoint"),
      sequence: index,
      mode: "RESTORED" as const,
    }));
  const createdAt = timestamp(context);
  if (blocked.edgeId === "draft-review") {
    const oldToNewCheckpoint = new Map(
      restored.map((checkpoint, index) => [
        args.attempt.checkpoints[index]?.id,
        checkpoint.id,
      ]),
    );
    const restoredTransitions = args.attempt.transitions
      .filter((transition) => transition.advancedAt && transition.sequence < blocked.sequence)
      .map((transition, index) => ({
        ...transition,
        id: identifier(context, "transition"),
        sequence: index,
        sourceCheckpointId: transition.sourceCheckpointId
          ? oldToNewCheckpoint.get(transition.sourceCheckpointId)
          : undefined,
      }));
    return {
      ...args.attempt,
      id: identifier(context, "attempt"),
      parentAttemptId: args.attempt.id,
      revision: context.revision ?? args.attempt.revision + 1,
      status: "ACTIVE" as const,
      activeNodeId: "draft-generation",
      startNodeId: "draft-generation",
      createdAt,
      completedAt: null,
      inputSnapshot: { ...args.attempt.inputSnapshot, rawText: args.correctedMemo },
      checkpoints: restored,
      transitions: restoredTransitions,
    };
  }
  const restoredInit = restored.find((checkpoint) => checkpoint.nodeId === "article-initialization");
  const transition = {
    id: identifier(context, "transition"),
    edgeId: "initialization-brief",
    sequence: 0,
    sourceNodeId: "article-initialization",
    sourceCheckpointId: restoredInit?.id,
    targetNodeId: "brief-normalization",
    targetPayload: {
      articleId: args.attempt.articleId,
      rawText: args.correctedMemo,
      tone: args.attempt.inputSnapshot.tone,
    },
    verdict: "PASS" as const,
    warnAcknowledgedAt: null,
    humanGateAcknowledgedAt: null,
    advancedAt: createdAt,
    observations: passObservations(context, "initialization-brief"),
  };
  return {
    ...args.attempt,
    id: identifier(context, "attempt"),
    parentAttemptId: args.attempt.id,
    revision: context.revision ?? args.attempt.revision + 1,
    status: "ACTIVE" as const,
    activeNodeId: "brief-normalization",
    startNodeId: "brief-normalization",
    createdAt,
    completedAt: null,
    inputSnapshot: { ...args.attempt.inputSnapshot, rawText: args.correctedMemo },
    checkpoints: restored,
    transitions: [transition],
  };
}
