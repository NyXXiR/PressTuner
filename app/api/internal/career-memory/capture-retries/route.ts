import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { processDueCareerFinalAnswerCaptureTasks } from "@/lib/services/resume/careerFinalAnswerCaptureTaskService";
import { apiError } from "@/lib/utils/api";

const BodySchema = z.object({
  limit: z.number().int().optional().default(5),
});

function tokenMatches(expected: string, received: string): boolean {
  const expectedHash = createHash("sha256").update(expected).digest();
  const receivedHash = createHash("sha256").update(received).digest();
  return timingSafeEqual(expectedHash, receivedHash);
}

export async function POST(request: NextRequest) {
  const expectedToken =
    process.env.CAREER_SCHEDULER_TOKEN?.trim() ||
    process.env.SCHEDULER_INTERNAL_TOKEN?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  const receivedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!expectedToken || !receivedToken || !tokenMatches(expectedToken, receivedToken)) {
    const error = apiError("UNAUTHORIZED", "Unauthorized", 401);
    return NextResponse.json(error.body, { status: error.status });
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    const error = apiError("INVALID_REQUEST", "Invalid retry batch request", 400);
    return NextResponse.json(error.body, { status: error.status });
  }
  const result = await processDueCareerFinalAnswerCaptureTasks({
    limit: Math.min(20, Math.max(1, parsed.data.limit)),
  });
  return NextResponse.json({ ok: true, ...result });
}
