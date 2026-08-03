import { NextResponse } from "next/server";

import {
  parseDevRagFixtureDomain,
  parseDevRagFixtureMutation,
} from "@/domain/dev-rag-fixtures/contracts";
import { isAdmin, requireTeamContext } from "@/lib/auth";
import { assertDevApiPlaygroundEnabled } from "@/lib/devApiPlayground";
import {
  setPressDevRagFixtureMounted,
  setResumeDevRagFixtureMounted,
} from "@/lib/services/dev/devRagFixtureService";
import { apiError } from "@/lib/utils/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(code: string, message: string, status: number) {
  const response = apiError(code, message, status);
  return NextResponse.json(response.body, { status: response.status });
}
function statusOf(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number"
    ? (error as { status: number }).status
    : 500;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ domain: string }> },
) {
  try {
    assertDevApiPlaygroundEnabled();
    const { team, user, role } = await requireTeamContext();
    if (!team?.id || !user?.id || !isAdmin(role)) {
      return jsonError("FORBIDDEN", "FORBIDDEN", 403);
    }
    const domain = parseDevRagFixtureDomain((await context.params).domain);
    if (!domain) {
      return jsonError(
        "UNSUPPORTED_RAG_FIXTURE_DOMAIN",
        "Fixture domain must be press or resume",
        404,
      );
    }
    const body = parseDevRagFixtureMutation(
      await request.json().catch(() => null),
    );
    if (!body) {
      return jsonError(
        "INVALID_RAG_FIXTURE_MUTATION",
        'Body must be exactly { "mounted": boolean }',
        400,
      );
    }
    const input = {
      teamId: team.id,
      userId: user.id,
      mounted: body.mounted,
    };
    const fixture =
      domain === "PRESS"
        ? await setPressDevRagFixtureMounted(input)
        : await setResumeDevRagFixtureMounted(input);
    return NextResponse.json({ ok: true, fixture });
  } catch (error) {
    const status = statusOf(error);
    return jsonError(
      status === 404
        ? "NOT_FOUND"
        : status === 401
          ? "UNAUTHORIZED"
          : "DEV_RAG_FIXTURE_MUTATION_FAILED",
      status === 404
        ? "Not found"
        : (error as Error)?.message ?? "DEV_RAG_FIXTURE_MUTATION_FAILED",
      status,
    );
  }
}
