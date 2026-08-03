import { prisma } from "@/lib/prisma";

export async function getBriefNormalizeCache(key: string) {
  return prisma.briefNormalizeCache.findUnique({
    where: { key },
  });
}

export async function deleteBriefNormalizeCache(key: string) {
  await prisma.briefNormalizeCache.delete({ where: { key } });
}

export async function getBriefNormalizeIpUsage(input: {
  ip: string;
  dayKey: string;
}) {
  return prisma.briefNormalizeIpUsage.findUnique({
    where: { ip_dayKey: { ip: input.ip, dayKey: input.dayKey } },
  });
}

export async function recordBriefNormalizeUsageAndCache(input: {
  ip: string;
  dayKey: string;
  cacheKey: string;
  payload: any;
  cacheTtlMs: number;
}) {
  await prisma.$transaction([
    prisma.briefNormalizeIpUsage.upsert({
      where: { ip_dayKey: { ip: input.ip, dayKey: input.dayKey } },
      update: { count: { increment: 1 } },
      create: { ip: input.ip, dayKey: input.dayKey, count: 1 },
    }),
    prisma.briefNormalizeCache.upsert({
      where: { key: input.cacheKey },
      update: {
        payload: input.payload,
        expiresAt: new Date(Date.now() + input.cacheTtlMs),
      },
      create: {
        key: input.cacheKey,
        payload: input.payload,
        expiresAt: new Date(Date.now() + input.cacheTtlMs),
      },
    }),
  ]);
}

export async function cleanupBriefNormalizeCache(now: Date, todayKey: string) {
  await Promise.all([
    prisma.briefNormalizeCache.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
    prisma.briefNormalizeIpUsage.deleteMany({
      where: { dayKey: { lt: todayKey } },
    }),
  ]);
}
