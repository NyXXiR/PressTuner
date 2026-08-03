import { NextRequest, NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { deleteTeamArticle } from "@/lib/services/articleManagementService";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, team, role } = await requireTeamContext();
    const { id } = await params;

    await deleteTeamArticle({
      teamId: team.id,
      userId: user.id,
      role,
      articleId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e?.status ?? 500;
    const err = apiError("ERROR", e?.message ?? "ERROR", status);
    return NextResponse.json(err.body, { status: err.status });
  }
}
