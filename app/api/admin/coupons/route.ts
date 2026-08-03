import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  CouponBenefitType,
  CouponStatus,
  PlanCategory,
  PlanType,
} from "@prisma/client";
import { normalizeCouponCode } from "@/lib/services/couponService";
import { apiError } from "@/lib/utils/api";
import { createCoupon, listCoupons } from "@/lib/services/adminCouponService";
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

function parseStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(String).map((v) => v.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [] as string[];
}

function parseEnumArray<T extends string>(value: unknown, allowed: T[]): T[] {
  const raw = parseStringArray(value);
  return raw.filter((v): v is T => allowed.includes(v as T));
}

export async function GET() {
  try {
    await requireAdmin();
    const items = await listCoupons();

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    const err = apiError(
      "COUPON_LIST_FAILED",
      e?.message ?? "COUPON_LIST_FAILED",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function POST(req: Request) {
  try {
    const { user } = await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as any;

    const codeRaw = typeof body.code === "string" ? body.code : "";
    const code = normalizeCouponCode(codeRaw);
    if (!code) {
      const err = apiError("CODE_REQUIRED", "CODE_REQUIRED", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      const err = apiError("NAME_REQUIRED", "NAME_REQUIRED", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const benefitType = BENEFIT_TYPES.includes(body.benefitType)
      ? (body.benefitType as CouponBenefitType)
      : null;
    if (!benefitType) {
      const err = apiError("INVALID_BENEFIT_TYPE", "INVALID_BENEFIT_TYPE", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const status = STATUSES.includes(body.status)
      ? (body.status as CouponStatus)
      : "ACTIVE";

    const discountPercent =
      typeof body.discountPercent === "number"
        ? body.discountPercent
        : Number(body.discountPercent ?? NaN);
    const discountAmount =
      typeof body.discountAmount === "number"
        ? body.discountAmount
        : Number(body.discountAmount ?? NaN);

    if (benefitType === "PERCENT") {
      if (!Number.isFinite(discountPercent) || discountPercent <= 0) {
        const err = apiError(
          "INVALID_DISCOUNT_PERCENT",
          "INVALID_DISCOUNT_PERCENT",
          400
        );
        return NextResponse.json(err.body, { status: err.status });
      }
    }

    if (benefitType === "FIXED_AMOUNT") {
      if (!Number.isFinite(discountAmount) || discountAmount <= 0) {
        const err = apiError(
          "INVALID_DISCOUNT_AMOUNT",
          "INVALID_DISCOUNT_AMOUNT",
          400
        );
        return NextResponse.json(err.body, { status: err.status });
      }
    }

    const grantPlanId =
      typeof body.grantPlanId === "string" && body.grantPlanId.trim()
        ? body.grantPlanId.trim()
        : null;
    const grantPlanType = PLAN_TYPES.includes(body.grantPlanType)
      ? (body.grantPlanType as PlanType)
      : null;
    const grantPlanCategory = PLAN_CATEGORIES.includes(body.grantPlanCategory)
      ? (body.grantPlanCategory as PlanCategory)
      : null;

    const grantMonths =
      typeof body.grantMonths === "number"
        ? body.grantMonths
        : Number(body.grantMonths ?? NaN);

    if (benefitType === "PLAN_GRANT") {
      if (!grantPlanId && !grantPlanType) {
        const err = apiError("GRANT_PLAN_REQUIRED", "GRANT_PLAN_REQUIRED", 400);
        return NextResponse.json(err.body, { status: err.status });
      }
      if (!Number.isFinite(grantMonths) || grantMonths <= 0) {
        const err = apiError("INVALID_GRANT_MONTHS", "INVALID_GRANT_MONTHS", 400);
        return NextResponse.json(err.body, { status: err.status });
      }
    }

    const validFrom = parseOptionalDate(body.validFrom);
    const validTo = parseOptionalDate(body.validTo);
    if (validFrom && validTo && validFrom > validTo) {
      const err = apiError("INVALID_DATE_RANGE", "INVALID_DATE_RANGE", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const applicablePlanIds = parseStringArray(body.applicablePlanIds);
    const applicablePlanTypes = parseEnumArray(body.applicablePlanTypes, PLAN_TYPES);
    const applicablePlanCategories = parseEnumArray(
      body.applicablePlanCategories,
      PLAN_CATEGORIES,
    );

    const created = await createCoupon({
      code,
      name,
      description:
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null,
      status,
      benefitType,
      discountPercent: Number.isFinite(discountPercent)
        ? Math.round(discountPercent)
        : null,
      discountAmount: Number.isFinite(discountAmount)
        ? Math.round(discountAmount)
        : null,
      grantPlanId,
      grantPlanType,
      grantPlanCategory,
      grantMonths: Number.isFinite(grantMonths)
        ? Math.round(grantMonths)
        : null,
      validFrom,
      validTo,
      applicablePlanIds,
      applicablePlanTypes,
      applicablePlanCategories,
      minAmount:
        typeof body.minAmount === "number"
          ? body.minAmount
          : Number(body.minAmount ?? NaN) || null,
      maxRedemptions:
        typeof body.maxRedemptions === "number"
          ? body.maxRedemptions
          : Number(body.maxRedemptions ?? NaN) || null,
      maxRedemptionsPerUser:
        typeof body.maxRedemptionsPerUser === "number"
          ? body.maxRedemptionsPerUser
          : Number(body.maxRedemptionsPerUser ?? NaN) || null,
    });
    await trackOpsEvent({
      event: "security.admin_coupon_created",
      userId: user.id,
      properties: { couponId: created.id, code: created.code },
    });

    return NextResponse.json({ ok: true, item: created });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    const message =
      e?.code === "P2002" ? "DUPLICATE_CODE" : e?.message ?? "COUPON_CREATE_FAILED";
    const err = apiError("COUPON_CREATE_FAILED", message, status);
    return NextResponse.json(err.body, { status: err.status });
  }
}
