import type { ProductLine } from "@prisma/client";

import { resolveHistoryRange } from "@/domain/billing/history/dateRange";
import { listTeamBillingHistory } from "@/domain/billing/history/query";
import { serviceError } from "@/lib/services/serviceError";

export async function listBillingHistoryForTeam(input: {
  teamId: string;
  product?: ProductLine | null;
  startDate?: string | null;
  endDate?: string | null;
  monthsFallback?: number;
  take?: number;
}) {
  if (!input.teamId) {
    throw serviceError(400, "NO_TEAM", "NO_TEAM");
  }

  const { from, toExclusive } = resolveHistoryRange({
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    monthsFallback: input.monthsFallback ?? 3,
  });

  const items = await listTeamBillingHistory({
    teamId: input.teamId,
    product: input.product,
    from,
    toExclusive,
    take: input.take ?? 500,
  });

  return items;
}

export { serviceError };
