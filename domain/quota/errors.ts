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
