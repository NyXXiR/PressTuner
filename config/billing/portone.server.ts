// src/config/billing/portone.server.ts
import type { PayProvider } from "./options";

export function getAppUrl() {
  const v = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return v && v.length > 0 ? v : "http://localhost:3000";
}

function normalizeOrigin(value?: string | null) {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function getForwardedOrigin(req: Request) {
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!forwardedProto || !forwardedHost) return null;
  return normalizeOrigin(`${forwardedProto}://${forwardedHost}`);
}

export function getTrustedAppUrl(req?: Request) {
  const configured = normalizeOrigin(getAppUrl()) ?? "http://localhost:3000";
  if (!req || process.env.NODE_ENV === "production") return configured;
  return normalizeOrigin(req.headers.get("origin")) ?? getForwardedOrigin(req) ?? configured;
}

export function getPortOneStoreId() {
  const storeId = process.env.PORTONE_STORE_ID?.trim();
  if (!storeId) throw new Error("MISSING_PORTONE_STORE_ID");
  return storeId;
}

export function getPortOneApiSecret() {
  const secret = process.env.PORTONE_API_SECRET?.trim();
  if (!secret) throw new Error("MISSING_PORTONE_API_SECRET");
  return secret;
}

export function getPortOneWebhookSecret() {
  const secret = process.env.PORTONE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("MISSING_PORTONE_WEBHOOK_SECRET");
  return secret;
}

type Channel = {
  channelGroupId: string | null;
  channelKey: string | null;
};

/**
 * 결제 채널 분기 (env 명확화 버전)
 *
 * env:
 * - PORTONE_CHANNEL_GROUP_ID_INICIS
 * - PORTONE_CHANNEL_KEY_INICIS
 * - PORTONE_CHANNEL_GROUP_ID_KAKAOPAY
 * - PORTONE_CHANNEL_KEY_KAKAOPAY
 *
 * 목적(purpose):
 * - PAYMENT: 단건결제(일반 결제창)
 * - BILLING_KEY: 빌링키 발급/빌링키 결제 (✅ 가능하면 channelKey 강제)
 */
export function resolvePortOneChannel(
  payProvider: PayProvider,
  purpose: "PAYMENT" | "BILLING_KEY" = "PAYMENT"
): Channel {
  const inicisGroupId =
    process.env.PORTONE_CHANNEL_GROUP_ID_INICIS?.trim() || null;
  const kakaoGroupId =
    process.env.PORTONE_CHANNEL_GROUP_ID_KAKAOPAY?.trim() || null;

  const inicisKey = process.env.PORTONE_CHANNEL_KEY_INICIS?.trim() || null;
  const kakaoKey = process.env.PORTONE_CHANNEL_KEY_KAKAOPAY?.trim() || null;

  if (payProvider === "inicis") {
    // ✅ 빌링키 발급은 channelKey를 강제하는 게 안전
    if (purpose === "BILLING_KEY") {
      if (!inicisKey) throw new Error("MISSING_INICIS_CHANNEL_KEY");
      return { channelGroupId: null, channelKey: inicisKey };
    }

    // PAYMENT: groupId 우선
    if (inicisGroupId)
      return { channelGroupId: inicisGroupId, channelKey: null };
    if (inicisKey) return { channelGroupId: null, channelKey: inicisKey };
    throw new Error("MISSING_INICIS_CHANNEL");
  }

  // kakaopay (단건결제용; 정기결제는 현재 정책상 미사용)
  if (purpose === "BILLING_KEY") {
    if (!kakaoKey) throw new Error("MISSING_KAKAOPAY_CHANNEL_KEY");
    return { channelGroupId: null, channelKey: kakaoKey };
  }

  if (kakaoGroupId) return { channelGroupId: kakaoGroupId, channelKey: null };
  if (kakaoKey) return { channelGroupId: null, channelKey: kakaoKey };
  throw new Error("MISSING_KAKAOPAY_CHANNEL");
}
