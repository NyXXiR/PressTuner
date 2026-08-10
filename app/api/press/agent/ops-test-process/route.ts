import { NextResponse } from "next/server";

import { requireAdmin, requireTeamContext } from "@/lib/auth";
import { createOpsConsoleTestProcessData } from "@/lib/services/operations/opsConsoleTestProcessData";
import { apiError } from "@/lib/utils/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST() {
  try {
    await requireAdmin();
    const { team, user } = await requireTeamContext();
    return NextResponse.json(
      await createOpsConsoleTestProcessData({ teamId: team.id, userId: user.id }),
      { status: 201, headers },
    );
  } catch (error: unknown) {
    const candidate = error as { code?: string; message?: string; status?: number };
    const code = candidate.code ?? candidate.message ?? "OPS_TEST_PROCESS_INSERT_FAILED";
    const status = candidate.status ?? 500;
    return NextResponse.json(
      apiError(code, candidate.message ?? "Failed to insert OPS test process", status).body,
      { status, headers },
    );
  }
}
