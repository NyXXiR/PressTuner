import { NextResponse } from "next/server";

import { resumePdfRequestSchema, safeResumePdfFilename } from "@/domain/resume-documents/pdfSnapshot";
import { requireTeamContext } from "@/lib/auth";
import { generateResumePdf } from "@/lib/services/resume/resumePdfService";

export const runtime = "nodejs";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status });
}

export async function POST(request: Request) {
  try {
    await requireTeamContext();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("RESUME_PDF_INVALID_REQUEST", "요청 본문이 올바른 JSON이 아닙니다.", 400);
    }
    const parsed = resumePdfRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "RESUME_PDF_INVALID_REQUEST",
        "PDF로 만들 이력서 데이터가 올바르지 않습니다.",
        400,
        parsed.error.flatten(),
      );
    }

    const generated = await generateResumePdf(parsed.data.snapshot);
    const filename = safeResumePdfFilename(parsed.data.snapshot.documentName);
    return new Response(new Uint8Array(generated.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="resume.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(generated.bytes.byteLength),
        "X-Resume-Pdf-Page-Count": String(generated.pageCount),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    const authError = error as { status?: unknown; code?: unknown; message?: unknown };
    if (typeof authError.status === "number" && authError.status >= 400 && authError.status < 500) {
      return errorResponse(
        typeof authError.code === "string" ? authError.code : "UNAUTHORIZED",
        typeof authError.message === "string" ? authError.message : "로그인이 필요합니다.",
        authError.status,
      );
    }
    return errorResponse("RESUME_PDF_GENERATION_FAILED", "PDF 파일을 생성하지 못했습니다.", 500);
  }
}
