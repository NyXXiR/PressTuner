// app/api/resume/bricks/[brickId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import * as BrickService from "@/lib/services/resume/resumeBrickService";
import { requireTeamContext } from "@/lib/auth";
import { z } from "zod";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";
import { CareerExperienceType } from "@prisma/client";

const BodySchema = z.object({
  title: z.string().trim().min(1).optional(),
  content: z.string().trim().min(1).optional(),
  originalText: z.string().nullable().optional(),
  period: z.string().nullable().optional(),
  organization: z.string().nullable().optional(),
  roleTitle: z.string().nullable().optional(),
  experienceType: z.nativeEnum(CareerExperienceType).optional(),
  startDate: z.union([z.string(), z.date()]).nullable().optional(),
  endDate: z.union([z.string(), z.date()]).nullable().optional(),
  isCurrent: z.boolean().optional(),
  actions: z.array(z.string()).optional(),
  outcomes: z.array(z.string()).optional(),
  metrics: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

// 1. 수정 (덮어쓰기)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ brickId: string }> }
) {
  try {
    const { user } = await requireTeamContext();
    const { brickId } = await params;
    const body = await req.json();
    const parsed = validateBody(BodySchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }

    // 서비스 레이어를 통해 업데이트 수행 (Prisma 직접 호출 제거)
    const item = await BrickService.updateExperienceBrick(
      brickId,
      user.id,
      parsed.data,
    );

    return NextResponse.json({
      ok: true,
      item,
      data: item,
      pendingReview: true,
    });
  } catch (e: any) {
    const status = e?.status ?? (e?.message?.includes("Unauthorized") ? 403 : 500);
    const err = apiError(e?.code ?? "BRICK_UPDATE_FAILED", e?.message, status);
    return NextResponse.json(err.body, { status: err.status });
  }
}

// 2. 삭제
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ brickId: string }> }
) {
  try {
    const { user } = await requireTeamContext();
    const { brickId } = await params;

    await BrickService.deleteExperienceBrick(brickId, user.id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e.message.includes("Unauthorized") ? 403 : 500;
    const err = apiError("BRICK_DELETE_FAILED", e.message, status);
    return NextResponse.json(err.body, { status: err.status });
  }
}
