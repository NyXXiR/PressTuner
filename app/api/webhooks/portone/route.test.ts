import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { POST } from "@/app/api/webhooks/portone/route";
import { prisma } from "@/lib/prisma";

test("invalid PortOne signatures are rejected before inbox persistence", async () => {
  const previous = process.env.PORTONE_WEBHOOK_SECRET;
  const transmissionId = `invalid-${randomUUID()}`;
  process.env.PORTONE_WEBHOOK_SECRET = "whsec_test_invalid_signature_boundary";
  try {
    const response = await POST(
      new Request("http://localhost/api/webhooks/portone", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "webhook-id": transmissionId,
          "webhook-timestamp": `${Math.floor(Date.now() / 1000)}`,
          "webhook-signature": "v1,invalid",
        },
        body: JSON.stringify({
          type: "Transaction.Paid",
          data: { paymentId: `payment-${transmissionId}` },
        }),
      }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "INVALID_WEBHOOK_SIGNATURE",
    });
    assert.equal(
      await prisma.billingWebhookEvent.count({ where: { transmissionId } }),
      0,
    );
  } finally {
    if (previous === undefined) delete process.env.PORTONE_WEBHOOK_SECRET;
    else process.env.PORTONE_WEBHOOK_SECRET = previous;
  }
});
