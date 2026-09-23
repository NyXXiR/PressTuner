import { sha256Canonical } from "@/domain/evaluation/configurationIdentity";
import { draftRunInputSchema, resolveDraftConfiguration } from "@/domain/press-workflow/configuration";
import { DRAFT_EVALUATOR_REVISION, draftOutputSchema, evaluateDraftGuardrails, type DraftCheck } from "@/domain/press-workflow/guardrails";
import { generateArticleWithLLM } from "@/lib/llm/articleGenerator";
import type { ArticleResult } from "@/lib/types/article";
import type { PressAiCompletionRequest } from "../article/pressAiDependencies";

export type DraftWorkflowDependencies = {
  mode: "mock" | "live";
  completeJson: (request: PressAiCompletionRequest) => Promise<string>;
};

/** Shared application entry point. I/O, authorization and persistence belong to the caller. */
export async function runDraftWorkflow(input: unknown, dependencies: DraftWorkflowDependencies) {
  const args = draftRunInputSchema.parse(input);
  const configuration = resolveDraftConfiguration(args.defaults, args.override);
  const effective = configuration.snapshot.effective;
  const captured: { request: PressAiCompletionRequest | null; rawResponse: string | null } = {
    request: null, rawResponse: null,
  };
  let output: ArticleResult | null = null;
  let error: string | null = null;
  let checks: DraftCheck[] = [];
  try {
    output = await generateArticleWithLLM({
      ...args.input,
      tone: effective.tone,
      stylePolicy: effective.stylePolicy,
      outputRequirements: {
        requiredPhrases: effective.requiredPhrases,
        forbiddenPhrases: effective.forbiddenPhrases,
      },
    }, {
      model: effective.model,
      dependencies: {
        now: () => new Date(args.frozenAt),
        completeJson: async (request) => {
          captured.request = structuredClone(request);
          const raw = await dependencies.completeJson(structuredClone(request));
          captured.rawResponse = raw;
          draftOutputSchema.parse(JSON.parse(raw));
          return raw;
        },
      },
    });
    checks = evaluateDraftGuardrails(output, args.input.acceptedFacts.map((fact) => fact.id), effective);
  } catch (cause) {
    output = null;
    error = cause instanceof Error ? cause.message : "Draft execution failed";
  }
  return {
    version: "press-draft-run/v1" as const,
    workflowRevision: "press-draft/v1",
    evaluatorRevision: DRAFT_EVALUATOR_REVISION,
    caseId: args.caseId,
    mode: dependencies.mode,
    evidenceClass: dependencies.mode === "mock" ? "synthetic" as const : "measured" as const,
    frozenAt: args.frozenAt,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    configuration,
    input: args.input,
    inputHash: sha256Canonical(args.input),
    request: captured.request,
    requestHash: captured.request ? sha256Canonical(captured.request) : null,
    rawResponse: captured.rawResponse,
    output,
    executionStatus: error === null ? "COMPLETED" as const : "FAILED" as const,
    error,
    checks,
    guardrailStatus: error !== null ? "NOT_EVALUATED" as const
      : checks.some((c) => c.status === "BLOCK") ? "BLOCK" as const
      : checks.some((c) => c.status === "WARN") ? "WARN" as const : "PASS" as const,
    qualityStatus: "NOT_EVALUATED" as const,
  };
}
