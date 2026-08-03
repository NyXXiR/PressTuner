export type CompletionVerificationInput = {
  outputSchemaValid: boolean;
  selectedSourcesEligible: boolean;
  pendingApprovalCount: number;
  unfinishedWriteCount: number;
  persistedStatus: string;
  reportedStatus: string;
};

export function verifyAgentCompletion(input: CompletionVerificationInput) {
  const failures: string[] = [];
  if (!input.outputSchemaValid) failures.push("OUTPUT_SCHEMA_INVALID");
  if (!input.selectedSourcesEligible) failures.push("SOURCE_INELIGIBLE");
  if (input.pendingApprovalCount > 0) failures.push("PENDING_APPROVAL");
  if (input.unfinishedWriteCount > 0) failures.push("UNFINISHED_WRITE");
  if (input.persistedStatus !== input.reportedStatus) failures.push("STATUS_MISMATCH");
  return { verified: failures.length === 0, failures } as const;
}

export function assertAgentCompletion(input: CompletionVerificationInput) {
  const result = verifyAgentCompletion(input);
  if (!result.verified) {
    throw new Error(`PRESS_AGENT_COMPLETION_VERIFICATION_FAILED:${result.failures.join(",")}`);
  }
  return result;
}
