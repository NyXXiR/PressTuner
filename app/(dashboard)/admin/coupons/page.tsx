import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminToolNav } from "../AdminToolNav";
import CouponAdminClient, { type CouponItem } from "./coupon-admin-client";

export default async function AdminCouponsPage() {
  try {
    await requireAdmin();
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401) redirect("/login");
    redirect("/unavailable");
  }

  const items = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { redemptions: true } } },
  });

  const initialItems: CouponItem[] = items.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    description: item.description,
    status: item.status,
    benefitType: item.benefitType,
    discountPercent: item.discountPercent,
    discountAmount: item.discountAmount,
    grantPlanId: item.grantPlanId,
    grantPlanType: item.grantPlanType,
    grantPlanCategory: item.grantPlanCategory,
    grantMonths: item.grantMonths,
    validFrom: item.validFrom?.toISOString() ?? null,
    validTo: item.validTo?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    redemptionsCount: item._count.redemptions,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">쿠폰 관리</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        슈퍼 어드민 전용 쿠폰 생성 및 상태/기간 관리
      </p>
      <div className="mt-5">
        <AdminToolNav current="coupons" compact />
      </div>
      <div className="mt-6">
        <CouponAdminClient initialItems={initialItems} />
      </div>
    </div>
  );
}
