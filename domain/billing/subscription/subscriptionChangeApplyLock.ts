import type { Prisma } from "@prisma/client";

export const SUBSCRIPTION_CHANGE_APPLY_LOCK_NAMESPACE =
  "subscription-change-local-apply";

export async function lockSubscriptionChangeApply(
  tx: Prisma.TransactionClient,
  changeId: string,
) {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${SUBSCRIPTION_CHANGE_APPLY_LOCK_NAMESPACE}),
      hashtext(${changeId})
    )::text AS locked
  `;
}
