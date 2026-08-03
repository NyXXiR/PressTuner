import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth"; // 제공해주신 auth.ts 사용
import { listResumeQuestions } from "@/lib/services/resume/resumeService";
import { z } from "zod";
import { validateQuery } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().optional().default(""),
  filter: z.enum(["ALL", "COMPLETED", "PENDING"]).default("ALL"),
});

export async function GET(req: Request) {
  try {
    const user = await requireUser();

    // 2. 쿼리 파라미터 파싱
    const { searchParams } = new URL(req.url);
    const parsed = validateQuery(QuerySchema, {
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      q: searchParams.get("q") || undefined,
      filter: searchParams.get("filter") || undefined,
    });
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    const { page, pageSize, q, filter } = parsed.data;

    const result = await listResumeQuestions({
      userId: user.id,
      page,
      pageSize,
      q,
      filter,
    });

    // 5. 응답 반환
    return NextResponse.json({
      ok: true,
      items: result.items, // ResumeQuestionItem 타입과 일치하는 구조
      total: result.total,
      totalPages: result.totalPages,
      page: result.page,
      pageSize: result.pageSize,
    });
  } catch (e: any) {
    console.error("[API_RESUME_QUESTIONS_GET]", e);

    // auth.ts에서 던진 에러(status 포함) 처리
    const status = e.status || 500;
    const message = e.message || "Internal Server Error";
    const err = apiError("QUESTIONS_LIST_FAILED", message, status);
    return NextResponse.json(err.body, { status: err.status });
  }
}
