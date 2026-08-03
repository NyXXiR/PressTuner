import { createHash, randomBytes } from "node:crypto";

import type { CheckoutIntentStatus, SubscriptionPayProvider } from "@prisma/client";
import type { PayProvider } from "@/config/billing/options";

export const CHECKOUT_INTENT_TTL_MINUTES = 30;

export function createCheckoutIntentToken() {
  return randomBytes(24).toString("base64url");
}

export function normalizeCheckoutIntentToken(value: unknown) {
  const token = typeof value === "string" ? value.trim() : "";
  if (!token) return null;
  if (token.length < 16) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  return token;
}

export function hashCheckoutIntentToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createCheckoutIntentExpiry(now = new Date()) {
  return new Date(now.getTime() + CHECKOUT_INTENT_TTL_MINUTES * 60 * 1000);
}

export function isCheckoutIntentTerminal(status: CheckoutIntentStatus) {
  return status === "COMPLETED" || status === "EXPIRED";
}

export function isCheckoutIntentExpired(
  expiresAt: Date,
  now = new Date(),
) {
  return now.getTime() >= expiresAt.getTime();
}

export function dbProviderToPayProvider(
  provider: SubscriptionPayProvider,
): PayProvider {
  return provider === "INICIS" ? "inicis" : "kakaopay";
}

export function buildCheckoutIntentMobilePath(token: string) {
  return `/checkout/mobile?intent=${encodeURIComponent(token)}`;
}

export function buildCheckoutIntentMobileUrl(baseUrl: string, token: string) {
  return new URL(buildCheckoutIntentMobilePath(token), baseUrl).toString();
}
