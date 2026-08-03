import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

test("legacy Team billing snapshot backfills one product subscription idempotently", async () => {
  const suffix = randomUUID();
  const team = await prisma.team.create({
    data: {
      slug: `backfill-${suffix}`,
      name: "Backfill fixture",
      planId: "pro_monthly_v1",
      plan: "PRO",
      planCategory: "PRESS",
      membershipStatus: "ACTIVE",
      nextPaymentAmount: 29_000,
    },
  });

  try {
    const sql = await readFile(
      resolve(process.cwd(), "scripts", "backfill-product-subscriptions.sql"),
      "utf8",
    );

    assert.equal(
      await prisma.teamProductSubscription.count({ where: { teamId: team.id } }),
      0,
    );

    await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        "SELECT set_config('presstuner.backfill_team_id', $1, true)",
        team.id,
      );
      await tx.$executeRawUnsafe(sql);
      await tx.$executeRawUnsafe(sql);
    });

    const rows = await prisma.teamProductSubscription.findMany({
      where: { teamId: team.id },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.product, "PRESS");
    assert.equal(rows[0]?.planId, "pro_monthly_v1");
    assert.equal(rows[0]?.plan, "PRO");
    assert.equal(rows[0]?.nextPaymentAmount, 29_000);
  } finally {
    await prisma.team.delete({ where: { id: team.id } }).catch(() => {});
  }
});
