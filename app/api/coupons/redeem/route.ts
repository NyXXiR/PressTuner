import { NextResponse } from "next/server";
import { requireTeamContext, isAdmin } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { redeemCouponForTeam } from "@/lib/services/couponRedeemService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    code?: unknown;
  };

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    const err = apiError("COUPON_CODE_REQUIRED", "COUPON_CODE_REQUIRED", 400);
    return NextResponse.json(err.body, { status: err.status });
  }

  try {
    const { team, role, user } = await requireTeamContext();
    if (!team?.id || !isAdmin(role)) {
      const err = apiError("FORBIDDEN", "FORBIDDEN", 403);
      return NextResponse.json(err.body, { status: err.status });
    }
    const result = await redeemCouponForTeam({ team, user, code });

    return NextResponse.json({
      ok: true,
      team: result.team,
      coupon: result.coupon,
    });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    const err = apiError(
      e?.code ?? "COUPON_REDEEM_FAILED",
      e?.message ?? "COUPON_REDEEM_FAILED",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
