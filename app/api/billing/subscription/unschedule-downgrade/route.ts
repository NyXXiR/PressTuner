// app/api/billing/subscription/unschedule-downgrade/route.ts
import { NextResponse } from "next/server";
import { requireTeamContext, isAdmin } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { unscheduleDowngradeForTeam } from "@/lib/services/billing/subscriptionService";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { product?: unknown };
    const product = body.product === "PRESS" || body.product === "CAREER" ? body.product : null;
    const { team, role } = await requireTeamContext();
    if (!team?.id || !isAdmin(role)) {
      return NextResponse.json(
        apiError("FORBIDDEN", "FORBIDDEN", 403).body,
        { status: 403 }
      );
    }

    const updated = await unscheduleDowngradeForTeam(team.id, product);

    return NextResponse.json({ ok: true, team: updated });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    const err = apiError(
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? "INTERNAL_ERROR",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
