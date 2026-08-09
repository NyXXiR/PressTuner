import { NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import { getProducerVerification } from "@/lib/services/press-ai-debugger/producerVerificationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

type RouteDependencies = {
  requireTeamContext: typeof requireTeamContext;
  getVerification: typeof getProducerVerification;
};

export function createProducerVerificationRouteHandler(dependencies: RouteDependencies) {
  return async function handler(_: Request, context: { params: Promise<{ attemptId: string }> }) {
    try {
      const { team } = await dependencies.requireTeamContext();
      const { attemptId } = await context.params;
      const verification = await dependencies.getVerification({ teamId: team.id, attemptId });
      return NextResponse.json({ verification }, { headers: NO_STORE });
    } catch (error) {
      const candidate = error as { status?: unknown };
      const status = candidate.status === 401 || candidate.status === 403 || candidate.status === 404 ? candidate.status : 500;
      const code = status === 401
        ? "PRESS_AI_PRODUCER_VERIFICATION_UNAUTHENTICATED"
        : status === 403
          ? "PRESS_AI_PRODUCER_VERIFICATION_FORBIDDEN"
          : status === 404
            ? "PRESS_AI_PRODUCER_VERIFICATION_NOT_FOUND"
            : "PRESS_AI_PRODUCER_VERIFICATION_FAILED";
      return NextResponse.json({ code }, { status, headers: NO_STORE });
    }
  };
}

export const GET = createProducerVerificationRouteHandler({ requireTeamContext, getVerification: getProducerVerification });
