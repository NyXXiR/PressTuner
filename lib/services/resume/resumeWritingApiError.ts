import { ServiceError } from "@/lib/errors";

export type ResumeWritingApiError = {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
};

export function toResumeWritingApiError(
  error: unknown,
  fallbackCode: string,
): ResumeWritingApiError {
  if (error instanceof ServiceError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      ...(error.data === undefined ? {} : { details: error.data }),
    };
  }

  if (error instanceof Error) {
    const status =
      "status" in error && typeof error.status === "number"
        ? error.status
        : 500;
    const code =
      "code" in error && typeof error.code === "string"
        ? error.code
        : fallbackCode;
    const details = "details" in error ? error.details : undefined;
    return {
      status,
      code,
      message: error.message || fallbackCode,
      ...(details === undefined ? {} : { details }),
    };
  }

  return {
    status: 500,
    code: fallbackCode,
    message: fallbackCode,
  };
}
