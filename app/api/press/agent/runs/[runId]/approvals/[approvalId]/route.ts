import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { decidePressAgentApproval } from "@/lib/services/press-agent/pressAgentRuntime";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

export const runtime = "nodejs";

const BodySchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().max(2_000).optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ runId: string; approvalId: string }> },
) {
  try {
    const { team, user } = await requireTeamContext();
    const parsed = validateBody(BodySchema, await req.json());
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    const { runId, approvalId } = await context.params;
    const runRecord = await decidePressAgentApproval({
      runId,
      approvalId,
      teamId: team.id,
      userId: user.id,
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, run: runRecord });
  } catch (error: any) {
    const message = error?.message;
    const status =
      message === "PRESS_AGENT_APPROVAL_NOT_FOUND"
        ? 404
        : message === "PRESS_AGENT_ARTICLE_SCOPE_MISMATCH"
          ? 403
          : message === "PRESS_AGENT_ARTICLE_VERSION_CONFLICT" ||
              message === "PRESS_AGENT_APPROVAL_CONFLICT"
            ? 409
            : error?.status ?? 500;
    return NextResponse.json(
      apiError(
        error?.code ?? "PRESS_AGENT_APPROVAL_FAILED",
        error?.message ?? "Failed to decide Press Agent approval",
        status,
      ).body,
      { status },
    );
  }
}
