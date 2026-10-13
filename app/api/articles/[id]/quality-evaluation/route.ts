import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { qualityRequestSchema } from "@/domain/press-workflow/evaluation/article-evaluation";
import { requireCurrentUserId } from "@/lib/auth";
import { serviceError } from "@/lib/services/serviceError";
import { readArticleStandardEvaluation, runArticleStandardEvaluation } from "@/lib/services/press-workflow/evaluation/articleStandardEvaluation.server";

export const runtime = "nodejs";
export const maxDuration = 360;
type Context = { params: Promise<{ id: string }> };
async function readInput(request: NextRequest) {
  const limit = 90000;
  if (Number(request.headers.get("content-length") ?? 0) > limit)
    throw serviceError(413, "REQUEST_TOO_LARGE", "요청이 너무 큽니다.");
  const reader = request.body?.getReader();
  if (!reader) throw serviceError(422, "INVALID_REQUEST", "평가 요청 형식을 확인해 주세요.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw serviceError(413, "REQUEST_TOO_LARGE", "요청이 너무 큽니다.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw serviceError(422, "INVALID_REQUEST", "평가 요청 형식을 확인해 주세요."); }
  return qualityRequestSchema.parse(value);
}
function failure(error: unknown) {
  const e = error as { status?: number; code?: string; message?: string };
  const status = error instanceof z.ZodError ? 422 : e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
  return NextResponse.json({ ok: false, code: e.code ?? "STANDARD_EVALUATION_FAILED", message: status === 500 ? "표준 평가를 실행하지 못했습니다." : error instanceof z.ZodError ? "평가 요청 형식을 확인해 주세요." : e.message }, { status, headers: { "Cache-Control": "no-store" } });
}
export async function GET(_request: NextRequest, context: Context) {
  try {
    const userId = await requireCurrentUserId(), { id } = await context.params;
    return NextResponse.json({ ok: true, ...(await readArticleStandardEvaluation(id, userId)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin || !request.headers.get("content-type")?.startsWith("application/json"))
      return NextResponse.json({ ok: false, message: "같은 사이트의 편집 화면에서 실행해 주세요." }, { status: 403 });
    const userId = await requireCurrentUserId(), { id } = await context.params;
    const input = await readInput(request);
    return NextResponse.json({ ok: true, result: await runArticleStandardEvaluation(id, userId, input) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
