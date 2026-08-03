type ApiErrorLike = {
  code?: string;
  message?: string;
  error?: string;
};

export function getAiPanelClientErrorMessage(
  status: number,
  payload: ApiErrorLike | null | undefined,
  fallback: string,
) {
  if (status === 429 || payload?.code === "AI_PANEL_RATE_LIMITED") {
    return "AI 패널이 잠시 제한되었습니다.\n사용량이 많아 잠깐 쉬어가야 합니다. 잠시 후 다시 시도해 주세요.";
  }

  return payload?.message ?? payload?.error ?? fallback;
}
