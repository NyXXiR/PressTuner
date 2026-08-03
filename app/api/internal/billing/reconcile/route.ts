import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import {
  auditRecentSuccessfulBillingPayments,
  detectDuplicateSuccessfulBillingAttempts,
  fetchPortonePaymentSnapshot,
  reconcilePendingBillingWebhookEvents,
  reconcileStaleRequestedBillingPayments,
} from "@/domain/billing/webhook/portone";
import {
  reconcileConfirmedSubscriptionChanges,
  reconcileStalePendingSubscriptionChanges,
} from "@/domain/billing/subscription/subscriptionChangeReconciliation";

export const runtime = "nodejs";

function authorized(request: Request) {
  const expected = process.env.BILLING_RECONCILIATION_SECRET?.trim();
  if (!expected) return false;
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!received) return false;
  const expectedHash = createHash("sha256").update(expected).digest();
  const receivedHash = createHash("sha256").update(received).digest();
  return timingSafeEqual(expectedHash, receivedHash);
}

type ReconciliationWorker = () => Promise<unknown>;

type BillingReconciliationWorkers = {
  pendingWebhooks: ReconciliationWorker;
  requestedPayments: ReconciliationWorker;
  stalePendingSubscriptionChanges: ReconciliationWorker;
  confirmedSubscriptionChanges: ReconciliationWorker;
  successfulPaymentAudit: ReconciliationWorker;
  duplicateChargeIncidents: ReconciliationWorker;
};

const productionWorkers: BillingReconciliationWorkers = {
  pendingWebhooks: () =>
    reconcilePendingBillingWebhookEvents({
      fetchPayment: fetchPortonePaymentSnapshot,
    }),
  requestedPayments: () =>
    reconcileStaleRequestedBillingPayments({
      fetchPayment: fetchPortonePaymentSnapshot,
    }),
  stalePendingSubscriptionChanges: () =>
    reconcileStalePendingSubscriptionChanges(),
  confirmedSubscriptionChanges: () =>
    reconcileConfirmedSubscriptionChanges(),
  successfulPaymentAudit: () =>
    auditRecentSuccessfulBillingPayments({
      fetchPayment: fetchPortonePaymentSnapshot,
    }),
  duplicateChargeIncidents: () =>
    detectDuplicateSuccessfulBillingAttempts({
      since: new Date(Date.now() - 24 * 60 * 60_000),
    }),
};

export async function runBillingReconciliation(
  workers: BillingReconciliationWorkers = productionWorkers,
) {
  const pendingWebhooks = await workers.pendingWebhooks();
  const requestedPayments = await workers.requestedPayments();
  const stalePendingSubscriptionChanges =
    await workers.stalePendingSubscriptionChanges();
  const confirmedSubscriptionChanges =
    await workers.confirmedSubscriptionChanges();
  const successfulPaymentAudit = await workers.successfulPaymentAudit();
  const duplicateChargeIncidents = await workers.duplicateChargeIncidents();
  return {
    pendingWebhooks,
    requestedPayments,
    stalePendingSubscriptionChanges,
    confirmedSubscriptionChanges,
    successfulPaymentAudit,
    duplicateChargeIncidents,
  };
}

export async function POST(request: Request) {
  if (!process.env.BILLING_RECONCILIATION_SECRET?.trim()) {
    return NextResponse.json(
      { ok: false, error: "BILLING_RECONCILIATION_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await runBillingReconciliation();

  return NextResponse.json({
    ok: true,
    ...result,
  });
}
