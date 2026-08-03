import type { PayProvider } from "@/config/billing/options";
import { portonePostV2 } from "@/lib/portone/portoneRestV2";
import type { SubscriptionPayProvider } from "@prisma/client";

export type BillingCustomerInput = {
  fullName?: string | null;
  name?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
};

export type BillingPortOneDeps = {
  post?: typeof portonePostV2;
  storeId?: string;
  channelKey?: string | null;
  persistConfirmation?: (args: {
    id: string;
    externalPaymentId: string;
    paymentConfirmedAt: Date;
  }) => Promise<unknown>;
};

export function parseBillingCustomerInput(value: unknown): BillingCustomerInput | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const stringOrNull = (field: string) =>
    typeof input[field] === "string" ? input[field] as string : undefined;
  return {
    fullName: stringOrNull("fullName"),
    name: stringOrNull("name"),
    email: stringOrNull("email"),
    phoneNumber: stringOrNull("phoneNumber"),
  };
}

export function normalizeSubscriptionProvider(provider: PayProvider): SubscriptionPayProvider {
  return provider === "inicis" ? "INICIS" : "KAKAOPAY";
}

export function createSubscriptionPaymentId(planCode: string, attemptId: string) {
  const code = planCode.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 12);
  const suffix = attemptId.replace(/-/g, "").slice(0, 16);
  const id = `bs_${code}_${suffix}`;
  if (id.length < 6 || id.length > 64) {
    throw new Error(`paymentId length invalid: ${id.length}`);
  }
  return id;
}

function normalizeCustomer(input?: BillingCustomerInput) {
  const fullName = typeof input?.fullName === "string" ? input.fullName.trim() : "";
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const email = typeof input?.email === "string" ? input.email.trim() : "";
  const phoneNumber = typeof input?.phoneNumber === "string" ? input.phoneNumber.trim() : "";
  return {
    name: { full: fullName || name || "테스트 사용자" },
    email: email || "test@test.com",
    phoneNumber: phoneNumber || "01000000000",
  };
}

export function isDefinitiveSubscriptionPaymentFailure(error: unknown) {
  return (error as { definitive?: unknown } | null)?.definitive === true;
}

export async function confirmSubscriptionPayment(input: {
  post: typeof portonePostV2;
  storeId: string;
  channelKey: string | null;
  billingKey: string;
  paymentId: string;
  amount: number;
  orderName: string;
  customer?: BillingCustomerInput;
  attemptId: string;
  customData: Record<string, unknown>;
}) {
  const paid = await input.post<unknown>(
    `/payments/${input.paymentId}/billing-key`,
    {
      storeId: input.storeId,
      billingKey: input.billingKey,
      channelKey: input.channelKey ?? undefined,
      orderName: input.orderName,
      customer: normalizeCustomer(input.customer),
      amount: { total: input.amount },
      currency: "KRW",
      customData: JSON.stringify(input.customData),
    },
    { idempotencyKey: input.attemptId },
  );
  if (!paid.ok) {
    const status = paid.status;
    const error = new Error(paid.error ?? "PORTONE_PAY_FAILED") as Error & {
      status?: number;
      definitive?: boolean;
    };
    error.status = status || 503;
    error.definitive =
      status >= 400 &&
      status < 500 &&
      ![408, 409, 425, 429].includes(status);
    throw error;
  }
  return { paidAt: new Date(), paidMeta: paid };
}
