// app/api/team/invitations/inbox/route.ts
import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/utils/api";
import { listInvitationInbox } from "@/lib/services/team/teamService";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json(
      apiError("UNAUTHORIZED", "Unauthorized", 401).body,
      { status: 401 }
    );

  try {
    const result = await listInvitationInbox({ userId: session.userId });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "INVITATION_LIST_FAILED",
      e?.message ?? "Invitation list failed",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
