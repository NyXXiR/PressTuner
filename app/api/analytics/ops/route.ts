import { NextResponse } from "next/server";

const MAX_BODY_BYTES = 128 * 1024;

function configuration() {
  const endpoint = process.env.OPS_CONSOLE_URL?.trim();
  const writeKey = (process.env.OPS_CONSOLE_ANALYTICS_WRITE_KEY ?? process.env.OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY)?.trim();
  const origin = (process.env.OPS_CONSOLE_ANALYTICS_ORIGIN ?? process.env.NEXT_PUBLIC_APP_URL)?.trim();
  if (!endpoint || !writeKey || !origin) return null;
  return { endpoint, writeKey, origin };
}

export async function POST(request: Request) {
  const config = configuration();
  if (!config) return NextResponse.json({ ok: false, error: "analytics_not_configured" }, { status: 503 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (!body || typeof body !== "object" || !Array.isArray((body as { events?: unknown }).events)) return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  try {
    const response = await fetch(`${config.endpoint.replace(/\/$/, "")}/api/analytics/v1/events`, {
      method: "POST", headers: { "content-type": "application/json", origin: config.origin },
      body: JSON.stringify({ writeKey: config.writeKey, events: (body as { events: unknown[] }).events }), cache: "no-store",
    });
    const responseBody = await response.json().catch(() => ({ ok: false, error: "invalid_response" }));
    return NextResponse.json(responseBody, { status: response.status });
  } catch { return NextResponse.json({ ok: false, error: "analytics_unavailable" }, { status: 503 }); }
}
