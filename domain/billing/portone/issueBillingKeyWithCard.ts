import {
  getPortOneStoreId,
  resolvePortOneChannel,
} from "@/config/billing/portone.server";
import { portonePostV2 } from "@/lib/portone/portoneRestV2";

function err(
  status: number,
  code: string,
  message = code,
  details?: unknown,
) {
  const e = new Error(message) as Error & {
    status?: number;
    code?: string;
    details?: unknown;
  };
  e.status = status;
  e.code = code;
  e.details = details;
  return e;
}

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeExpiryYear(value: string) {
  const yy = onlyDigits(value);
  if (yy.length === 2) return yy;
  if (yy.length === 4) return yy.slice(2);
  return "";
}

export function normalizeExpiryMonth(value: string) {
  const mm = onlyDigits(value).padStart(2, "0");
  const n = Number(mm);
  if (!Number.isFinite(n) || n < 1 || n > 12) return "";
  return mm;
}

export function extractBillingKey(raw: any) {
  const key = raw?.billingKeyInfo?.billingKey ?? raw?.billingKey;
  return typeof key === "string" && key.trim() ? key.trim() : null;
}

export function buildInicisBillingKeyIssueBody(input: {
  storeId: string;
  channelKey: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhoneNumber: string;
  cardNumber: string;
  expiryYear: string;
  expiryMonth: string;
  birthOrBizNo: string;
  passwordTwoDigits: string;
}) {
  return {
    storeId: input.storeId,
    channelKey: input.channelKey,
    customer: {
      id: input.customerId,
      name: { full: input.customerName },
      email: input.customerEmail,
      phoneNumber: input.customerPhoneNumber,
    },
    method: {
      card: {
        credential: {
          number: input.cardNumber,
          expiryYear: input.expiryYear,
          expiryMonth: input.expiryMonth,
          birthOrBusinessRegistrationNumber: input.birthOrBizNo,
          passwordTwoDigits: input.passwordTwoDigits,
        },
      },
    },
  };
}

export async function issueBillingKeyWithCard(input: {
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhoneNumber?: string;
  cardNumber: string;
  expiryYear: string;
  expiryMonth: string;
  birthOrBizNo: string;
  passwordTwoDigits: string;
}) {
  const customerId = input.customerId?.trim() || `cust_${crypto.randomUUID()}`;
  const customerName = input.customerName?.trim() || "테스트 사용자";
  const customerEmail = input.customerEmail?.trim() || "test@test.com";
  const customerPhoneNumber = onlyDigits(
    input.customerPhoneNumber?.trim() || "01000000000",
  );

  const cardNumber = onlyDigits(input.cardNumber);
  const expiryYear = normalizeExpiryYear(input.expiryYear);
  const expiryMonth = normalizeExpiryMonth(input.expiryMonth);
  const birthOrBizNo = onlyDigits(input.birthOrBizNo);
  const passwordTwoDigits = onlyDigits(input.passwordTwoDigits);

  if (
    !cardNumber ||
    !expiryYear ||
    !expiryMonth ||
    !birthOrBizNo ||
    passwordTwoDigits.length !== 2
  ) {
    throw err(400, "INVALID_INPUT", "INVALID_INPUT", {
      cardNumber: !!cardNumber,
      expiryYear: !!expiryYear,
      expiryMonth: !!expiryMonth,
      birthOrBizNo: !!birthOrBizNo,
      passwordTwoDigits: passwordTwoDigits.length === 2,
    });
  }

  const channel = resolvePortOneChannel("inicis", "BILLING_KEY");
  if (!channel.channelKey) {
    throw err(500, "MISSING_CHANNEL_KEY", "MISSING_CHANNEL_KEY");
  }

  const storeId = getPortOneStoreId();
  const body = buildInicisBillingKeyIssueBody({
    storeId,
    channelKey: channel.channelKey,
    customerId,
    customerName,
    customerEmail,
    customerPhoneNumber,
    cardNumber,
    expiryYear,
    expiryMonth,
    birthOrBizNo,
    passwordTwoDigits,
  });

  const response = await portonePostV2<any>("/billing-keys", body, {
    idempotencyKey: crypto.randomUUID(),
  });

  if (!response.ok) {
    throw err(
      400,
      "PORTONE_BILLING_KEY_ISSUE_FAILED",
      "PORTONE_BILLING_KEY_ISSUE_FAILED",
      response.raw ?? response.error,
    );
  }

  const billingKey = extractBillingKey(response.data);
  if (!billingKey) {
    throw err(
      500,
      "NO_BILLING_KEY_IN_RESPONSE",
      "NO_BILLING_KEY_IN_RESPONSE",
      response.data,
    );
  }

  return {
    billingKey,
    raw: response.data,
    customer: {
      id: customerId,
      name: { full: customerName },
      email: customerEmail,
      phoneNumber: customerPhoneNumber,
    },
  };
}
