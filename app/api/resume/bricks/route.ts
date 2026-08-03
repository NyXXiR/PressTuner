// app/api/resume/bricks/route.ts

import { NextRequest, NextResponse } from "next/server";
import * as BrickService from "@/lib/services/resume/resumeBrickService";
import { requireTeamContext } from "@/lib/auth";
import { z } from "zod";
import { validateBody, validateQuery } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";
import { BrickSource, CareerExperienceType } from "@prisma/client";
import { getCareerMemoryReadiness } from "@/lib/services/resume/careerMemoryReadinessService";

const QuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

const BodySchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  originalText: z.string().optional(),
  period: z.string().nullable().optional(),
  organization: z.string().nullable().optional(),
  roleTitle: z.string().nullable().optional(),
  experienceType: z.nativeEnum(CareerExperienceType).optional(),
  actions: z.array(z.string()).optional(),
  outcomes: z.array(z.string()).optional(),
  metrics: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
  startDate: z.union([z.string(), z.date()]).nullable().optional(),
  endDate: z.union([z.string(), z.date()]).nullable().optional(),
  isCurrent: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireTeamContext();
    const { searchParams } = new URL(req.url);
    const parsed = validateQuery(QuerySchema, {
      q: searchParams.get("q") || undefined,
      page: searchParams.get("page") || undefined,
      pageSize: searchParams.get("pageSize") || undefined,
    });
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    const { q, page, pageSize } = parsed.data;

    const { items, total, confirmedTotal } = await BrickService.getExperienceBricks({
      userId: user.id,
      q,
      page,
      pageSize,
    });
    const readiness = await getCareerMemoryReadiness(user.id);

    return NextResponse.json({
      ok: true,
      items,
      total,
      confirmedTotal,
      ...readiness,
    });
  } catch (e: any) {
    const status = e.status || 500;
    const err = apiError("BRICK_LIST_FAILED", e.message, status);
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { team, user } = await requireTeamContext();
    const body = await req.json();
    const parsed = validateBody(BodySchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    const item = await BrickService.createExperienceBrick({
      teamId: team.id,
      userId: user.id,
      ...parsed.data,
      tags: parsed.data.tags ?? [],
      source: parsed.data.source as BrickSource | undefined,
    });
    const readiness = await getCareerMemoryReadiness(user.id);

    return NextResponse.json({
      ok: true,
      candidateId: item.id,
      item,
      data: item,
      pendingReview: true,
      ...readiness,
    });
  } catch (e: any) {
    const status = e?.status || 500;
    const err = apiError(e?.code ?? "BRICK_CREATE_FAILED", e?.message, status);
    return NextResponse.json(err.body, { status: err.status });
  }
}
