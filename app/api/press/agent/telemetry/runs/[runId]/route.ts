import { NextRequest, NextResponse } from "next/server";
import { isAdmin, requireTeamContext } from "@/lib/auth";
import { readCanonicalRunTelemetry } from "@/lib/services/ai-telemetry/telemetryReadService";

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const { team, role } = await requireTeamContext();
  if (!isAdmin(role)) return NextResponse.json({ ok: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  const { runId } = await context.params;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const afterSequence = url.searchParams.has("afterSequence") ? Number(url.searchParams.get("afterSequence")) : undefined;
  if (!runId || !Number.isInteger(limit) || limit < 1 || limit > 200 || (afterSequence !== undefined && (!Number.isInteger(afterSequence) || afterSequence < 0))) return NextResponse.json({ ok: false, error: { code: "INVALID_QUERY" } }, { status: 400 });
  const telemetry = await readCanonicalRunTelemetry({ teamId: team.id, runId, limit, afterSequence });
  return NextResponse.json({ ok: true, telemetry });
}
