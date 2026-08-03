import { prisma } from "@/lib/prisma";

export async function listCoupons() {
  return prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { redemptions: true } },
    },
  });
}

export async function createCoupon(data: any) {
  return prisma.coupon.create({ data });
}

export async function updateCoupon(couponId: string, updates: Record<string, any>) {
  return prisma.coupon.update({
    where: { id: couponId },
    data: updates,
  });
}
