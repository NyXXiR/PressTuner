// app/api/generate/route.ts (있다면)
import { NextResponse } from "next/server";
import { apiError } from "@/lib/utils/api";

export async function POST() {
  const err = apiError(
    "DEPRECATED",
    "DEPRECATED. Use /api/articles/[id]/generate",
    410
  );
  return NextResponse.json(err.body, { status: err.status });
}
