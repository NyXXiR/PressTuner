import { NextResponse } from "next/server";

import { apiError } from "@/lib/utils/api";

export function resumeDocumentApiError(error: unknown) {
  const value = error as { status?: number; code?: string; message?: string; details?: unknown };
  const result = apiError(
    value.code ?? "RESUME_DOCUMENT_IMPORT_REQUEST_FAILED",
    value.message ?? "Resume document import request failed",
    value.status ?? 500,
    { details: value.details },
  );
  return NextResponse.json(result.body, { status: result.status });
}
