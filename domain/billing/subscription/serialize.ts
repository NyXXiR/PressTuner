// src/domain/billing/subscription/serialize.ts
import { formatYMDHM } from "@/lib/utils/datetime";

export function iso(d?: Date | null) {
  return d ? d.toISOString() : null;
}
export function ymdhm(d?: Date | null) {
  return d ? formatYMDHM(d) : null;
}

export function withoutBillingKey<T extends { billingKey?: any }>(t: T) {
  const { billingKey, ...safe } = t as any;
  return { safe, hasBillingKey: !!billingKey };
}
