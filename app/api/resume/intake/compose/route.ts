import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";
import { parseResumeApplicationInput } from "@/lib/services/resume/resumeIntakeService";
import {
  fetchHiringPageText,
  HIRING_URL_FALLBACK_MESSAGE,
} from "@/lib/services/resume/resumeIntakeFetch";
import { consumeAiQuota } from "@/domain/quota/aiQuota";
import {
  ResumeBriefTextInputSchema,
  ResumeBriefUrlInputSchema,
} from "@/domain/resume-writing/contracts";

const BodySchema = z.object({
  text: z.union([ResumeBriefTextInputSchema, z.literal("")]).optional().default(""),
  url: z.union([ResumeBriefUrlInputSchema, z.literal("")]).optional().default(""),
}).superRefine((value, ctx) => {
  if (!value.text.trim() && !value.url.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["text"],
      message: "text or url is required",
    });
  }
});

const URL_PATTERN = /https?:\/\/[^\s)>"']+/gi;

function extractUrls(text: string) {
  return Array.from(new Set(text.match(URL_PATTERN) ?? []));
}

function removeUrls(text: string, urls: string[]) {
  return urls.reduce((current, url) => current.replaceAll(url, " "), text)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const { user, team } = await requireTeamContext();

    const body = await req.json();
    const parsed = validateBody(BodySchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }

    const parts: string[] = [];
    const explicitUrl = parsed.data.url.trim();
    const detectedUrls = extractUrls(parsed.data.text);
    const allUrls = Array.from(
      new Set([explicitUrl, ...detectedUrls].filter((value) => value.length > 0)),
    );
    const pastedText = removeUrls(parsed.data.text.trim(), detectedUrls);

    for (const targetUrl of allUrls) {
      const urlText = await fetchHiringPageText(targetUrl);
      parts.push(`[URL SOURCE]\n${urlText}`);
    }

    if (pastedText) {
      parts.push(`[PASTED SOURCE]\n${pastedText}`);
    }

    const merged = parts.join("\n\n");
    await consumeAiQuota({
      teamId: team.id,
      userId: user.id,
      action: "resume_strategy",
      meta: {
        route: "/api/resume/intake/compose",
        sourceCount: parts.length,
      },
    });
    const result = await parseResumeApplicationInput(merged);

    return NextResponse.json({ ok: true, data: result });
  } catch (error: any) {
    console.error("Resume intake compose error:", error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "RESUME_INTAKE_COMPOSE_FAILED",
      error?.message ?? HIRING_URL_FALLBACK_MESSAGE,
      status,
      error?.details ? { details: error.details } : undefined,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
