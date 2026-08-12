import { randomBytes } from "node:crypto";
import { ZodError } from "zod";

import {
  PUBLIC_PRESS_RAG_EVIDENCE,
  PUBLIC_PRESS_RAG_LIMITS,
  PressRagCommandRequestSchema,
  PressRagDraftOutputSchema,
  PressRagNormalizationOutputSchema,
  PressRagReviewOutputSchema,
  PressRagRewriteOutputSchema,
  PressRagStartRequestSchema,
  ensureMemoClaimsEnumerated,
  mountControlledRevenueCitation,
  type PressRagCommandRequest,
  type PublicPressRagScenario,
} from "@/domain/demo/pressRagScenarioContract";
import {
  PressRagMachineError,
  advancePublicPressRagEdge,
  createPublicPressRagAttempt,
  derivePublicPressRagNodeInput,
  executePublicPressRagNode,
  retryPublicPressRagFromBlock,
} from "@/domain/demo/pressRagScenarioMachine";
import {
  acceptPressRagStart,
  consumePressRagCommand,
  decodePressRagCapability,
  encodePressRagCapability,
  pressRagQuota,
  readPressRagSession,
  registerPressRagRun,
  type PublicPressRagCapabilityState,
  type PublicPressRagSession,
} from "./pressRagScenarioSecurity";

export type PressRagCompletionKind = "normalization" | "draft" | "review" | "rewrite";
export type PressRagCompleteJson = (args: {
  kind: PressRagCompletionKind;
  input: unknown;
  system: string;
  prompt: string;
  maxOutputTokens: number;
}) => Promise<unknown>;

export class PressRagServiceError extends Error {
  constructor(readonly code: string, readonly status: 400 | 502, readonly details: Record<string, unknown> = {}) {
    super(code);
  }
}

export class PressRagProviderError extends PressRagServiceError {
  constructor(
    code: string,
    readonly scenario: PublicPressRagScenario,
    readonly session: PublicPressRagSession,
  ) {
    super(code, 502, { scenario });
  }
}

type ServiceOptions = {
  secret: string;
  cookie?: string;
  now?: number;
  id?: () => string;
};

const nextId = (options: ServiceOptions) =>
  options.id?.() ?? randomBytes(12).toString("base64url");

function scenarioFromState(
  state: PublicPressRagCapabilityState,
  session: PublicPressRagSession,
  secret: string,
  now: number,
): PublicPressRagScenario {
  return {
    runId: state.runId,
    attempt: state.attempt,
    attempts: [...state.ancestors, state.attempt],
    capability: encodePressRagCapability(state, secret),
    evidence: state.evidence,
    quota: pressRagQuota(session, now),
    limits: PUBLIC_PRESS_RAG_LIMITS,
    commandsRemaining: PUBLIC_PRESS_RAG_LIMITS.commandBudget - state.commandsUsed,
  };
}

export function startPublicPressRagScenario(
  rawInput: unknown,
  options: ServiceOptions,
) {
  const input = PressRagStartRequestSchema.parse(rawInput);
  const now = options.now ?? Date.now();
  let session = readPressRagSession(options.cookie, options.secret);
  session = acceptPressRagStart(session, now);
  const runId = nextId(options);
  const attempt = createPublicPressRagAttempt({ ...input, runId, now });
  session = registerPressRagRun(session, runId, attempt.revision);
  const state: PublicPressRagCapabilityState = {
    v: 1,
    sid: session.sid,
    runId,
    issuedAt: now,
    expiresAt: now + PUBLIC_PRESS_RAG_LIMITS.capabilityTtlSeconds * 1000,
    commandsUsed: 0,
    evidence: PUBLIC_PRESS_RAG_EVIDENCE,
    attempt,
    ancestors: [],
  };
  return { scenario: scenarioFromState(state, session, options.secret, now), session };
}

function validateEditableFields(
  nodeId: string | null,
  command: Extract<PressRagCommandRequest, { type: "execute_node" }>,
) {
  const present = new Set(
    (["correctedMemo", "reviewInstruction", "selectedNoteIds", "rewriteInstruction"] as const)
      .filter((key) => command[key] !== undefined),
  );
  const allowed = new Set<string>(
    nodeId === "brief-normalization"
      ? ["correctedMemo"]
      : nodeId === "draft-review"
        ? ["reviewInstruction"]
        : nodeId === "selected-rewrite"
          ? ["selectedNoteIds", "rewriteInstruction"]
          : [],
  );
  if ([...present].some((key) => !allowed.has(key))) {
    throw new PressRagServiceError("PRESS_RAG_EDITABLE_FIELD_INVALID", 400, {
      nodeId,
      allowed: [...allowed],
    });
  }
}

function completionRequest(nodeId: string, input: unknown, reviewRun: number) {
  if (nodeId === "brief-normalization") {
    return {
      kind: "normalization" as const,
      input,
      maxOutputTokens: 1800,
      system: "고정 근거 문서로 보도자료 메모를 구조화한다. 다음 키만 가진 JSON 객체를 반환한다: serviceName(string), announceType(string), oneLiner(string), points(string[]), tone(formal|neutral|friendly), rawText(string), claims(array). claims의 각 항목은 claim(string)과 citation(null 또는 sourceDocumentId, factId, evidenceExcerpt 문자열 객체)만 가진다. 메모의 각 문장을 claim에 원문 그대로 한 번씩 열거한다. 정확히 대응하는 fact만 인용하고 evidenceExcerpt는 문서 문장을 글자 그대로 복사하며, 미지원 문장은 citation을 null로 둔다. 추가 키를 만들지 않는다.",
      prompt: JSON.stringify(input),
    };
  }
  if (nodeId === "draft-generation") {
    return {
      kind: "draft" as const,
      input,
      maxOutputTokens: 1800,
      system: "확인된 브리프의 근거 사실만 사용해 한국어 보도자료 초안을 작성한다. title과 plain 문자열, 선택적인 lead 문자열만 가진 JSON 객체를 반환하고 추가 키를 만들지 않는다.",
      prompt: JSON.stringify(input),
    };
  }
  if (nodeId === "draft-review") {
    return {
      kind: "review" as const,
      input,
      maxOutputTokens: 1000,
      system: `보도자료를 검토한다. notes 배열만 가진 JSON 객체를 반환한다. 각 노트는 고유한 id 문자열과 구체적인 message 문자열만 가진다. 1~8개 노트를 만들고 추가 키를 만들지 않는다. 현재 리뷰 실행은 ${reviewRun}회차다.`,
      prompt: JSON.stringify(input),
    };
  }
  if (nodeId === "selected-rewrite") {
    return {
      kind: "rewrite" as const,
      input,
      maxOutputTokens: 1800,
      system: "선택된 리뷰 노트만 반영해 보도자료를 수정한다. title과 plain 문자열만 가진 JSON 객체를 반환하고 추가 키를 만들지 않는다.",
      prompt: JSON.stringify(input),
    };
  }
  return null;
}

function parseCompletion(kind: PressRagCompletionKind, value: unknown, memo: string) {
  if (kind === "normalization") {
    return PressRagNormalizationOutputSchema.parse(
      mountControlledRevenueCitation(ensureMemoClaimsEnumerated(memo, PressRagNormalizationOutputSchema.parse(value))),
    );
  }
  if (kind === "draft") return PressRagDraftOutputSchema.parse(value);
  if (kind === "review") return PressRagReviewOutputSchema.parse(value);
  return PressRagRewriteOutputSchema.parse(value);
}

function controlledDraftRevenue(value: unknown, corrected: boolean) {
  const draft = PressRagDraftOutputSchema.parse(value);
  const amount = corrected ? "200" : "360";
  const assertion = `Bridge는 2026년 매출 ${amount}억원을 기록했습니다.`;
  const pattern = /(Bridge(?:는)?\s*2026\s*년\s*매출(?:액)?\s*)[\d,]+(?:\.\d+)?\s*(?=억\s*원)/gu;
  const plain = pattern.test(draft.plain)
    ? draft.plain.replace(pattern, `$1${amount}`)
    : `${draft.plain.trim()}\n${assertion}`;
  return { ...draft, plain };
}

export async function commandPublicPressRagScenario(
  rawCommand: unknown,
  options: ServiceOptions & { completeJson: PressRagCompleteJson },
) {
  const command = PressRagCommandRequestSchema.parse(rawCommand);
  const now = options.now ?? Date.now();
  let session = readPressRagSession(options.cookie, options.secret);
  const current = decodePressRagCapability(command.capability, session, options.secret, now);
  const consumed = consumePressRagCommand(session, current, command.expectedRevision);
  session = consumed.session;
  let attempt = current.attempt;
  let ancestors = current.ancestors;

  try {
    if (command.type === "advance_edge") {
      attempt = advancePublicPressRagEdge(attempt, { now, revision: consumed.revision });
    } else if (command.type === "retry_from_block") {
      ancestors = [...ancestors, attempt];
      attempt = retryPublicPressRagFromBlock({
        attempt,
        correctedMemo: command.correctedMemo,
        context: { now, revision: consumed.revision, id: () => nextId(options) },
      });
    } else {
      validateEditableFields(attempt.activeNodeId, command);
      const input = derivePublicPressRagNodeInput(attempt, command);
      const nodeId = attempt.activeNodeId!;
      const request = completionRequest(
        nodeId,
        input,
        attempt.checkpoints.filter((item) => item.nodeId === "draft-review").length + 1,
      );
      let output = request
        ? parseCompletion(
            request.kind,
            await options.completeJson(request),
            String((input as { rawText?: unknown }).rawText ?? attempt.inputSnapshot.rawText),
          )
        : { articleId: attempt.articleId, type: "PRESS_RELEASE" };
      if (nodeId === "draft-generation") {
        output = controlledDraftRevenue(output, Boolean(attempt.parentAttemptId));
      }
      attempt = executePublicPressRagNode({
        attempt,
        input,
        output,
        context: { now, revision: consumed.revision, id: () => nextId(options) },
      });
    }
  } catch (error) {
    if (error instanceof PressRagMachineError) throw error;
    if (error instanceof PressRagServiceError) throw error;
    if (
      error &&
      typeof error === "object" &&
      (error as { status?: unknown }).status === 503
    ) throw error;
    const failedAttempt = { ...attempt, revision: consumed.revision };
    const failedState: PublicPressRagCapabilityState = {
      ...current,
      commandsUsed: consumed.commandsUsed,
      attempt: failedAttempt,
      ancestors,
    };
    const code = error instanceof ZodError
      ? "PRESS_RAG_STRUCTURED_OUTPUT_INVALID"
      : "PRESS_RAG_PROVIDER_FAILED";
    throw new PressRagProviderError(
      code,
      scenarioFromState(failedState, session, options.secret, now),
      session,
    );
  }

  const state: PublicPressRagCapabilityState = {
    ...current,
    commandsUsed: consumed.commandsUsed,
    attempt,
    ancestors,
  };
  return { scenario: scenarioFromState(state, session, options.secret, now), session };
}
