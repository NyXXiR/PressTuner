// domain/billing/subscription/portone.ts
import type { PayProvider } from "@/config/billing/options";
import type { SubscriptionPayProvider } from "@prisma/client";
import { portonePostV2 } from "@/lib/portone/portoneRestV2";
import {
  getPortOneStoreId,
  resolvePortOneChannel,
} from "@/config/billing/portone.server";

export function normalizeProvider(p: PayProvider): SubscriptionPayProvider {
  return p === "inicis" ? "INICIS" : "KAKAOPAY";
}

export function normalizeAttemptId(v: any): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  ) {
    return null;
  }
  return s;
}

/**
 * attemptId 기반으로 paymentId를 "결정론적으로" 생성
 * - 동일 attemptId로 재호출되면 PortOne도/서버도 동일 paymentId로 요청됨 → 중복 결제 방지
 */
export function createPaymentIdFromAttempt(
  planCode: string,
  attemptId: string
) {
  const code = planCode.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 12);
  const suffix = attemptId.replace(/-/g, "").slice(0, 16);
  const id = `bs_${code}_${suffix}`;
  if (id.length < 6 || id.length > 64) {
    throw new Error(`paymentId length invalid: ${id.length}`);
  }
  return id;
}

/**
 * PortOne REST CustomerInput: { name: { full }, email, phoneNumber }
 */
export function normalizeCustomerForRest(input: any) {
  const fullName =
    typeof input?.fullName === "string" ? input.fullName.trim() : "";
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const email = typeof input?.email === "string" ? input.email.trim() : "";
  const phoneNumber =
    typeof input?.phoneNumber === "string" ? input.phoneNumber.trim() : "";

  const finalName = fullName || name || "테스트 사용자";

  return {
    name: { full: finalName },
    email: email || "test@test.com",
    phoneNumber: phoneNumber || "01000000000",
  };
}

export async function payWithBillingKey(args: {
  payProvider: PayProvider;
  billingKey: string;
  orderName: string;
  amountWon: number;
  customer: any;
  customData: any;
  attemptId: string; // idempotencyKey
  paymentId: string;
}) {
  const storeId = getPortOneStoreId();
  const channel = resolvePortOneChannel(args.payProvider, "BILLING_KEY");

  const payBody = {
    storeId,
    billingKey: args.billingKey,
    channelKey: channel.channelKey ?? undefined,
    orderName: args.orderName,
    customer: args.customer,
    amount: { total: args.amountWon },
    currency: "KRW",
    customData: JSON.stringify(args.customData),
  };

  return portonePostV2<any>(
    `/payments/${args.paymentId}/billing-key`,
    payBody,
    {
      idempotencyKey: args.attemptId,
    }
  );
}
