import { NextResponse } from "next/server";
import { requireTeamContext, isAdmin } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { bulkDeleteTeamArticles } from "@/lib/services/articleManagementService";

export async function POST(req: Request) {
  try {
    const { team, role } = await requireTeamContext();
    if (!isAdmin(role))
      return NextResponse.json(
        apiError("FORBIDDEN", "FORBIDDEN", 403).body,
        { status: 403 }
      );

    const body = await req.json().catch(() => null);
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    if (ids.length === 0) return NextResponse.json({ ok: true });

    await bulkDeleteTeamArticles({ teamId: team.id, ids });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e?.status ?? 500;
    const err = apiError("ERROR", e?.message ?? "ERROR", status);
    return NextResponse.json(err.body, { status: err.status });
  }
}
