"use client";

import { safeResumePdfFilename, type ResumePdfSnapshot } from "@/domain/resume-documents/pdfSnapshot";

export type ResumePdfResource = {
  url: string;
  filename: string;
  pageCount: number;
  dispose: () => void;
};

function responseFilename(response: Response, fallback: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/iu)?.[1];
  if (encoded) {
    try {
      return safeResumePdfFilename(decodeURIComponent(encoded));
    } catch {
      // Fall back to the trusted local document name below.
    }
  }
  const quoted = disposition.match(/filename="([^"]+)"/iu)?.[1];
  return safeResumePdfFilename(quoted || fallback);
}

async function responseError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: unknown } };
    if (typeof payload.error?.message === "string" && payload.error.message.trim()) {
      return payload.error.message;
    }
  } catch {
    // The route may have failed before producing a JSON error body.
  }
  return "PDF 파일을 생성하지 못했습니다.";
}

export async function requestResumePdf(
  snapshot: ResumePdfSnapshot,
  options: { signal?: AbortSignal } = {},
): Promise<ResumePdfResource> {
  const response = await fetch("/api/resume/documents/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshot }),
    cache: "no-store",
    signal: options.signal,
  });
  if (!response.ok) throw new Error(await responseError(response));

  const mimeType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mimeType !== "application/pdf") throw new Error("서버가 PDF 파일이 아닌 응답을 반환했습니다.");

  const pageCountValue = response.headers.get("x-resume-pdf-page-count") ?? "";
  const pageCount = Number(pageCountValue);
  if (!/^\d+$/u.test(pageCountValue) || !Number.isSafeInteger(pageCount) || pageCount < 1) {
    throw new Error("생성된 PDF의 페이지 수를 확인하지 못했습니다.");
  }

  const blob = await response.blob();
  if (options.signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
  const url = URL.createObjectURL(blob);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    URL.revokeObjectURL(url);
  };
  if (options.signal?.aborted) {
    dispose();
    throw new DOMException("The operation was aborted", "AbortError");
  }
  return {
    url,
    filename: responseFilename(response, snapshot.documentName),
    pageCount,
    dispose,
  };
}
