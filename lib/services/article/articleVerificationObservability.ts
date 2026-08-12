import { createOpsConsoleOperationClient } from "@/lib/services/operations/opsConsoleOperationClient";

export const ARTICLE_VERIFICATION_WORKFLOW = {
  id: "presstuner.press-creation",
  version: "2.1.0",
} as const;

type VerificationVerdict = "PASS" | "BLOCK" | "NOT_EVALUABLE";
type ObservabilityClient = Pick<
  ReturnType<typeof createOpsConsoleOperationClient>,
  "beginService" | "reportGuardrails" | "complete"
>;

const defaultClient = createOpsConsoleOperationClient();

export function mapEvidenceFactConsistencyVerdict(
  verdict: VerificationVerdict,
): "pass" | "violation" | "not_evaluable" {
  return verdict === "PASS"
    ? "pass"
    : verdict === "BLOCK"
      ? "violation"
      : "not_evaluable";
}

/** Fail-open bridge: no caller-visible error or result depends on Ops delivery. */
export async function emitArticleVerificationObservability(
  args: {
    teamId: string;
    verdict: VerificationVerdict;
    relatedOperationId?: string;
  },
  client: ObservabilityClient = defaultClient,
): Promise<void> {
  try {
    let operationId = args.relatedOperationId;
    let registeredHere = false;
    if (!operationId) {
      const registration = await client.beginService({
        teamId: args.teamId,
        workflowId: ARTICLE_VERIFICATION_WORKFLOW.id,
        workflowVersion: ARTICLE_VERIFICATION_WORKFLOW.version,
      });
      if (registration.status !== "registered") return;
      operationId = registration.operationId;
      registeredHere = true;
    }
    await client.reportGuardrails({
      operationId,
      verdicts: [{
        stageId: "verification",
        guardrailId: "evidence-fact-consistency",
        verdict: mapEvidenceFactConsistencyVerdict(args.verdict),
      }],
    });
    if (registeredHere) await client.complete({ operationId });
  } catch {
    // Verification persistence is authoritative; observability is fail-open.
  }
}
