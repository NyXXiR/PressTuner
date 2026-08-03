import assert from "node:assert/strict";
import test from "node:test";

import { runBillingReconciliation } from "./route";

test("billing reconciliation includes stale pending subscription payments", async () => {
  const calls: string[] = [];
  const worker = <T>(name: string, result: T) => async () => {
    calls.push(name);
    return result;
  };

  const result = await runBillingReconciliation({
    pendingWebhooks: worker("pendingWebhooks", { processed: 1 }),
    requestedPayments: worker("requestedPayments", { reconciled: 2 }),
    stalePendingSubscriptionChanges: worker("stalePendingSubscriptionChanges", {
      scanned: 1,
      resumed: 1,
      failed: 0,
    }),
    confirmedSubscriptionChanges: worker("confirmedSubscriptionChanges", {
      scanned: 3,
      applied: 3,
      failed: 0,
    }),
    successfulPaymentAudit: worker("successfulPaymentAudit", { audited: 4 }),
    duplicateChargeIncidents: worker("duplicateChargeIncidents", { incidents: 0 }),
  });

  assert.deepEqual(calls, [
    "pendingWebhooks",
    "requestedPayments",
    "stalePendingSubscriptionChanges",
    "confirmedSubscriptionChanges",
    "successfulPaymentAudit",
    "duplicateChargeIncidents",
  ]);
  assert.deepEqual(result.stalePendingSubscriptionChanges, {
    scanned: 1,
    resumed: 1,
    failed: 0,
  });
});
