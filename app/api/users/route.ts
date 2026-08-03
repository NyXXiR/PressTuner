// app/api/users/route.ts
import { NextResponse } from "next/server";
import { apiError } from "@/lib/utils/api";
import { listUsersByLabel } from "@/lib/services/userService";
import { isAdmin, requireTeamContext } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const { role } = await requireTeamContext();
    if (!isAdmin(role)) {
      return NextResponse.json(
        apiError("FORBIDDEN", "FORBIDDEN", 403).body,
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "";
    const users = await listUsersByLabel(q, 20);
    return NextResponse.json({ users });
  } catch (error: any) {
    const status = typeof error?.status === "number" ? error.status : 500;
    const err = apiError(
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "INTERNAL_ERROR",
      status,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
