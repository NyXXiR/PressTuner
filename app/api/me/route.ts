// src/app/api/me/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { apiError } from "@/lib/utils/api";
import { getMePayload } from "@/lib/services/meService";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, Cache-Control",
    },
  });
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      const err = apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
      return NextResponse.json(err.body, {
        status: err.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const payload = await getMePayload(session);

    return NextResponse.json(
      {
        ok: true,
        ...payload,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (e) {
    console.error(e);
    const status = (e as any)?.status ?? 500;
    const err = apiError(
      (e as any)?.code ?? "INTERNAL_ERROR",
      (e as any)?.message ?? "서버 에러가 발생했습니다.",
      status
    );
    return NextResponse.json(err.body, {
      status: err.status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
