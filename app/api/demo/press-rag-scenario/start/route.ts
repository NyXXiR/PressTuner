import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { PUBLIC_PRESS_RAG_COOKIE, PUBLIC_PRESS_RAG_LIMITS } from "@/domain/demo/pressRagScenarioContract";
import {
  PressRagSecurityError,
  pressRagSessionCookie,
  resolvePressRagSigningSecret,
  writePressRagSession,
} from "@/lib/services/demo/pressRagScenarioSecurity";
import { isPublicPressRagSameOrigin } from "@/lib/services/demo/pressRagScenarioHttp";
import { startPublicPressRagScenario } from "@/lib/services/demo/pressRagScenarioService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

async function strictJson(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  const site = request.headers.get("sec-fetch-site");
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) throw new Error("PRESS_RAG_JSON_REQUIRED");
  if (site === "cross-site" || !isPublicPressRagSameOrigin(request)) throw new Error("PRESS_RAG_CROSS_SITE_REJECTED");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > PUBLIC_PRESS_RAG_LIMITS.bodyBytes) throw new Error("PRESS_RAG_BODY_TOO_LARGE");
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > PUBLIC_PRESS_RAG_LIMITS.bodyBytes) throw new Error("PRESS_RAG_BODY_TOO_LARGE");
  return JSON.parse(text) as unknown;
}

export async function POST(request: NextRequest) {
  try {
    const secret = resolvePressRagSigningSecret();
    const body = await strictJson(request);
    const result = startPublicPressRagScenario(body, {
      secret,
      cookie: request.cookies.get(PUBLIC_PRESS_RAG_COOKIE)?.value,
    });
    const response = NextResponse.json(result.scenario, { status: 201, headers: noStore });
    response.headers.set("Set-Cookie", pressRagSessionCookie(writePressRagSession(result.session, secret)));
    return response;
  } catch (error) {
    const status = error instanceof PressRagSecurityError ? error.status : error instanceof ZodError || error instanceof SyntaxError || error instanceof Error && error.message.startsWith("PRESS_RAG_") ? 400 : 503;
    const code = error instanceof PressRagSecurityError ? error.code : error instanceof ZodError ? "PRESS_RAG_REQUEST_INVALID" : error instanceof SyntaxError ? "PRESS_RAG_JSON_INVALID" : error instanceof Error ? error.message : "PRESS_RAG_START_FAILED";
    const details = error instanceof PressRagSecurityError ? error.details : {};
    const response = NextResponse.json({ code, ...details }, { status, headers: noStore });
    if (status === 429 && typeof details.retryAfterSeconds === "number") response.headers.set("Retry-After", String(details.retryAfterSeconds));
    return response;
  }
}
