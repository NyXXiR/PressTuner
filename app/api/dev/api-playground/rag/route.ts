import { NextResponse } from "next/server";

import { isAdmin, requireTeamContext } from "@/lib/auth";
import { assertDevApiPlaygroundEnabled } from "@/lib/devApiPlayground";
import { readDevRagFixtures } from "@/lib/services/dev/devRagFixtureService";
import { apiError } from "@/lib/utils/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusOf(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number"
    ? (error as { status: number }).status
    : 500;
}
export async function GET() {
  try {
    assertDevApiPlaygroundEnabled();
    const { team, user, role } = await requireTeamContext();
    if (!team?.id || !user?.id || !isAdmin(role)) {
      const forbidden = apiError("FORBIDDEN", "FORBIDDEN", 403);
      return NextResponse.json(forbidden.body, { status: forbidden.status });
    }
    const fixtures = await readDevRagFixtures({
      teamId: team.id,
      userId: user.id,
    });
    return NextResponse.json({ ok: true, fixtures });
  } catch (error) {
    const status = statusOf(error);
    const response = apiError(
      status === 404
        ? "NOT_FOUND"
        : status === 401
          ? "UNAUTHORIZED"
          : "DEV_RAG_FIXTURE_READ_FAILED",
      status === 404
        ? "Not found"
        : (error as Error)?.message ?? "DEV_RAG_FIXTURE_READ_FAILED",
      status,
    );
    return NextResponse.json(response.body, { status: response.status });
  }
}
