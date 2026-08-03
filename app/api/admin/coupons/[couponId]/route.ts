import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  CouponBenefitType,
  CouponStatus,
  PlanCategory,
  PlanType,
} from "@prisma/client";
import { apiError } from "@/lib/utils/api";
import { updateCoupon } from "@/lib/services/adminCouponService";
import { trackOpsEvent } from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BENEFIT_TYPES: CouponBenefitType[] = [
  "PERCENT",
  "FIXED_AMOUNT",
  "PLAN_GRANT",
];
const STATUSES: CouponStatus[] = ["ACTIVE", "INACTIVE", "ARCHIVED"];
const PLAN_TYPES: PlanType[] = ["FREE", "BASIC", "PRO", "ENTERPRISE"];
const PLAN_CATEGORIES: PlanCategory[] = ["PRESS", "CAREER", "STANDARD"];

function parseOptionalDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ couponId: string }> },
) {
  try {
    const { user } = await requireAdmin();
    const { couponId } = await params;
    const body = (await req.json().catch(() => ({}))) as any;

    const updates: Record<string, any> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (typeof body.description === "string") {
      updates.description = body.description.trim() || null;
    }

    if (STATUSES.includes(body.status)) {
      updates.status = body.status as CouponStatus;
    }

    if (BENEFIT_TYPES.includes(body.benefitType)) {
      updates.benefitType = body.benefitType as CouponBenefitType;
    }

    if (body.discountPercent != null) {
      const value = Number(body.discountPercent);
      updates.discountPercent = Number.isFinite(value) ? Math.round(value) : null;
    }

    if (body.discountAmount != null) {
      const value = Number(body.discountAmount);
      updates.discountAmount = Number.isFinite(value) ? Math.round(value) : null;
    }

    if (typeof body.grantPlanId === "string") {
      updates.grantPlanId = body.grantPlanId.trim() || null;
    }

    if (PLAN_TYPES.includes(body.grantPlanType)) {
      updates.grantPlanType = body.grantPlanType as PlanType;
    } else if (body.grantPlanType === null) {
      updates.grantPlanType = null;
    }

    if (PLAN_CATEGORIES.includes(body.grantPlanCategory)) {
      updates.grantPlanCategory = body.grantPlanCategory as PlanCategory;
    } else if (body.grantPlanCategory === null) {
      updates.grantPlanCategory = null;
    }

    if (body.grantMonths != null) {
      const value = Number(body.grantMonths);
      updates.grantMonths = Number.isFinite(value) ? Math.round(value) : null;
    }

    if (body.validFrom !== undefined) {
      updates.validFrom = parseOptionalDate(body.validFrom);
    }
    if (body.validTo !== undefined) {
      updates.validTo = parseOptionalDate(body.validTo);
    }

    if (updates.validFrom && updates.validTo && updates.validFrom > updates.validTo) {
      const err = apiError("INVALID_DATE_RANGE", "INVALID_DATE_RANGE", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const updated = await updateCoupon(couponId, updates);
    await trackOpsEvent({
      event: "security.admin_coupon_updated",
      userId: user.id,
      properties: { couponId, changedFields: Object.keys(updates) },
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    const err = apiError(
      "COUPON_UPDATE_FAILED",
      e?.message ?? "COUPON_UPDATE_FAILED",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
