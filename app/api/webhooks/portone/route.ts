import { Webhook } from "@portone/server-sdk";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getPortOneWebhookSecret } from "@/config/billing/portone.server";
import {
  fetchPortonePaymentSnapshot,
  processBillingWebhookEvent,
  recordVerifiedPortoneWebhook,
} from "@/domain/billing/webhook/portone";

export const runtime = "nodejs";

function verificationHeaders(request: Request) {
  return {
    "webhook-id": request.headers.get("webhook-id") ?? "",
    "webhook-signature": request.headers.get("webhook-signature") ?? "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
  };
}

export async function POST(request: Request) {
  const transmissionId = request.headers.get("webhook-id")?.trim();
  if (!transmissionId) {
    return NextResponse.json({ ok: false, error: "WEBHOOK_ID_REQUIRED" }, { status: 400 });
  }

  const rawBody = await request.text();
  let verified: Awaited<ReturnType<typeof Webhook.verify>>;
  try {
    verified = await Webhook.verify(
      getPortOneWebhookSecret(),
      rawBody,
      verificationHeaders(request),
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_WEBHOOK_SIGNATURE" },
      { status: 400 },
    );
  }

  const event = verified as unknown as {
    type: string;
    data?: { paymentId?: string };
  };
  let payload: Prisma.InputJsonValue;
  try {
    payload = JSON.parse(rawBody) as Prisma.InputJsonValue;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_WEBHOOK_BODY" }, { status: 400 });
  }

  const recorded = await recordVerifiedPortoneWebhook({
    transmissionId,
    eventType: event.type,
    paymentId: event.data?.paymentId ?? null,
    payload,
  });
  const result = await processBillingWebhookEvent(recorded.event.id, {
    fetchPayment: fetchPortonePaymentSnapshot,
  });

  return NextResponse.json(
    { ok: true, duplicate: recorded.duplicate, status: result.status },
    { status: result.status === "RETRYABLE" ? 202 : 200 },
  );
}
