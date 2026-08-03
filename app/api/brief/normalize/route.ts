// app/api/brief/normalize/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createHash } from "crypto";
import { apiError } from "@/lib/utils/api";
import {
  cleanupBriefNormalizeCache,
  deleteBriefNormalizeCache,
  getBriefNormalizeCache,
  getBriefNormalizeIpUsage,
  recordBriefNormalizeUsageAndCache,
} from "@/lib/services/briefNormalizeService";
import {
  BRIEF_NORMALIZATION_VERSION,
  normalizeBriefFromEvidence,
} from "@/lib/services/article/briefNormalizationService";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 필요하면 env로 분리
const MODEL = process.env.PT_BRIEF_MODEL ?? "gpt-4.1-mini";

const DAILY_IP_LIMIT = 3;
const MAX_INPUT_LENGTH = 3000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function getClientIp(req: NextRequest): string {
  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) return xForwardedFor.split(",")[0].trim();
  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  return "unknown";
}

function kstDayKey(d: Date): string {
  const utc = d.getTime();
  const kst = new Date(utc + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(
    kst.getUTCDate(),
  )}`;
}

function hashInput(rawText: string, tone: string): string {
  return createHash("sha256")
    .update(`${BRIEF_NORMALIZATION_VERSION}:${tone}:${rawText}`)
    .digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawText = body?.rawText as string | undefined;
    const tone = (body?.tone as string | undefined) ?? "formal";

    if (
      !rawText ||
      typeof rawText !== "string" ||
      rawText.trim().length === 0
    ) {
      const err = apiError(
        "BAD_REQUEST",
        "rawText(대략적인 메모)를 먼저 입력해 주세요.",
        400
      );
      return NextResponse.json(err.body, { status: err.status });
    }

    if (rawText.length > MAX_INPUT_LENGTH) {
      const err = apiError(
        "TOO_LONG",
        "입력 글자 수가 너무 깁니다. 3,000자 이하로 줄여 주세요.",
        413
      );
      return NextResponse.json(err.body, { status: err.status });
    }

    const safeTone =
      tone === "friendly" || tone === "neutral" || tone === "formal"
        ? tone
        : "formal";

    const ip = getClientIp(req);
    const now = new Date();
    const todayKey = kstDayKey(now);

    const cacheKey = hashInput(rawText, safeTone);
    const cached = await getBriefNormalizeCache(cacheKey);
    if (cached && cached.expiresAt.getTime() > Date.now()) {
      return NextResponse.json(cached.payload);
    }

    if (cached && cached.expiresAt.getTime() <= Date.now()) {
      await deleteBriefNormalizeCache(cacheKey);
    }

    const usage = await getBriefNormalizeIpUsage({ ip, dayKey: todayKey });
    const used = usage?.count ?? 0;
    if (used >= DAILY_IP_LIMIT) {
      const err = apiError(
        "RATE_LIMIT",
        "로그인하면 더 많은 브리핑을 할 수 있습니다.",
        429
      );
      return NextResponse.json(err.body, { status: err.status });
    }

    const payload = await normalizeBriefFromEvidence({
      rawText,
      tone: safeTone,
      complete: async ({ system, user }) => {
        const completion = await openai.chat.completions.create({
          model: MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        });
        const content = completion.choices[0]?.message?.content;
        if (!content) throw new Error("BRIEF_NORMALIZATION_EMPTY");
        return content;
      },
    });

    await recordBriefNormalizeUsageAndCache({
      ip,
      dayKey: todayKey,
      cacheKey,
      payload,
      cacheTtlMs: CACHE_TTL_MS,
    });

    if (Math.random() < 0.02) {
      await cleanupBriefNormalizeCache(now, todayKey);
    }

    return NextResponse.json(payload);
  } catch (err) {
    console.error("normalize error", err);
    const apiErr = apiError(
      "SERVER_ERROR",
      "브리프 생성 중 서버 오류가 발생했습니다.",
      500
    );
    return NextResponse.json(apiErr.body, { status: apiErr.status });
  }
}
