import { NextResponse } from "next/server";

import { isAdmin, requireTeamContext } from "@/lib/auth";
import { cancelPressAgentRun } from "@/lib/services/press-agent/pressAgentRuntime";

export async function POST(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { team, user, role } = await requireTeamContext();
  const { runId } = await context.params;
  const run = await cancelPressAgentRun({
    runId,
    teamId: team.id,
    userId: user.id,
    canManageTeam: isAdmin(role),
  });
  return NextResponse.json({ ok: true, run });
}
