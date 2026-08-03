// src/lib/portone/portoneRestV2.ts
import { getPortOneApiSecret } from "@/config/billing/portone.server";

const PORTONE_API_BASE = "https://api.portone.io";

export type PortOneRestError = {
  type?: string;
  message?: string;
};

export async function portoneGetV2<TResponse>(
  path: string,
): Promise<
  { ok: true; data: TResponse } | { ok: false; error: string; status: number; raw?: any }
> {
  const secret = getPortOneApiSecret();
  const res = await fetch(`${PORTONE_API_BASE}${path}`, {
    method: "GET",
    headers: { Authorization: `PortOne ${secret}` },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (json?.message as string | undefined) ||
      (json?.type as string | undefined) ||
      `PORTONE_REST_ERROR_${res.status}`;
    return { ok: false, error: message, status: res.status, raw: json };
  }
  return { ok: true, data: json as TResponse };
}

export async function portonePostV2<TResponse>(
  path: string,
  body: unknown,
  opts?: { idempotencyKey?: string }
): Promise<
  { ok: true; data: TResponse } | { ok: false; error: string; status: number; raw?: any }
> {
  const secret = getPortOneApiSecret();

  const headers: Record<string, string> = {
    "content-type": "application/json",
    // PortOne REST V2: Authorization: PortOne {API_SECRET}
    Authorization: `PortOne ${secret}`,
  };

  // PortOne 문서상 Idempotency-Key는 RFC 8941 문자열로 "따옴표" 권장
  if (opts?.idempotencyKey) {
    headers["Idempotency-Key"] = `"${opts.idempotencyKey}"`;
  }

  const res = await fetch(`${PORTONE_API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      (json?.message as string | undefined) ||
      (json?.type as string | undefined) ||
      `PORTONE_REST_ERROR_${res.status}`;
    return { ok: false, error: msg, status: res.status, raw: json };
  }

  return { ok: true, data: json as TResponse };
}
