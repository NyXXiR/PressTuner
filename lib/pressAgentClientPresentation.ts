type AgentRunPresentationInput = {
  status: "PENDING" | "RUNNING" | "WAITING_APPROVAL" | "COMPLETED" | "FAILED";
  output?: {
    answer?: string;
    summary?: string;
  } | null;
  errorMessage?: string | null;
};

export function agentRunMessage(run: AgentRunPresentationInput): {
  body: string;
  tone: "success" | "error";
} {
  if (run.status === "FAILED") {
    return {
      body: run.errorMessage?.trim() || "Press Agent 재시도가 실패했습니다.",
      tone: "error",
    };
  }
  return {
    body:
      run.output?.answer?.trim() ||
      run.output?.summary?.trim() ||
      "Press Agent 재시도가 완료되었습니다.",
    tone: "success",
  };
}
export function agentStatusNotice(message: string, isError = false) {
  return {
    message,
    kind: isError ? ("error" as const) : ("status" as const),
  };
}
