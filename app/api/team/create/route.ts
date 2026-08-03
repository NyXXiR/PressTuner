import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { trackOpsEvent } from "@/lib/ops";
import { createTeam } from "@/lib/services/teamService";
import { apiError } from "@/lib/utils/api";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();

    const team = await createTeam({
      userId: user.id,
      name: body.name,
    });

    void trackOpsEvent({
      event: "workspace_registered",
      userId: user.id,
      properties: {
        workspaceId: team.id,
        workspaceSlug: team.slug,
        workspaceName: team.name,
      },
    });

    return NextResponse.json({
      ok: true,
      teamId: team.id,
      teamSlug: team.slug,
    });
  } catch (error: any) {
    const err = apiError("BAD_REQUEST", error.message, 400);
    return NextResponse.json(err.body, { status: err.status });
  }
}
