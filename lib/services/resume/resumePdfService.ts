import { getDocumentProxy } from "unpdf";

import { ResumePdfDocument } from "@/components/resume/ResumePdfDocument";
import type { ResumePdfSnapshot } from "@/domain/resume-documents/pdfSnapshot";
import { registerResumePdfFonts } from "@/lib/services/resume/resumePdfFonts";

export type GeneratedResumePdf = {
  bytes: Buffer;
  pageCount: number;
};

export async function generateResumePdf(snapshot: ResumePdfSnapshot): Promise<GeneratedResumePdf> {
  const renderer = await import("@react-pdf/renderer");
  registerResumePdfFonts(renderer.Font);
  const bytes = await renderer.renderToBuffer(ResumePdfDocument({ renderer, snapshot }));
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Resume PDF renderer returned invalid bytes");
  }

  const proxy = await getDocumentProxy(new Uint8Array(bytes), { disableWorker: true } as never);
  try {
    if (!Number.isInteger(proxy.numPages) || proxy.numPages < 1) {
      throw new Error("Resume PDF parser returned an invalid page count");
    }
    return { bytes, pageCount: proxy.numPages };
  } finally {
    await proxy.destroy();
  }
}
