export class QuotaLimitError extends Error {
  status = 403;
  code = "AI_QUOTA_LIMIT_EXCEEDED" as const;
  details?: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = "QuotaLimitError";
    this.details = details;
  }
}

export class AiPanelRateLimitError extends Error {
  status = 429;
  code = "AI_PANEL_RATE_LIMITED" as const;

  constructor(
    message =
      "AI 패널이 잠시 제한되었습니다. 사용량이 많아 잠깐 쉬어가야 합니다. 잠시 후 다시 시도해 주세요.",
  ) {
    super(message);
    this.name = "AiPanelRateLimitError";
  }
}
