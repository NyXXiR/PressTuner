import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { isAdmin, requireTeamContext } from "@/lib/auth";
import { executePressRagExperiment } from "@/lib/services/press-agent/experimentService";
import {
  listAgentExperimentCycles,
  persistAgentExperimentCycle,
} from "@/lib/services/press-agent/experimentPersistenceService";
import { validateBody } from "@/lib/utils/validate";

const BodySchema = z
  .object({
    executor: z.enum(["deterministic", "live"]).default("deterministic"),
    allowModelSpend: z.boolean().default(false),
    baseline: z.unknown(),
    candidate: z.unknown(),
    dataset: z.unknown(),
    environment: z.unknown(),
  })
  .strict();

export async function POST(request: NextRequest) {
  const { team, user, role } = await requireTeamContext();
  if (!isAdmin(role)) {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const parsed = validateBody(BodySchema, await request.json());
  if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status });
  const operatorIds = new Set(
    (process.env.PT_AGENT_EXPERIMENT_OPERATOR_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  try {
    const operatorAuthorized = operatorIds.has(user.id);
    const artifact = await executePressRagExperiment({
      ...parsed.data,
      operatorAuthorized,
    });
    const cycle = await persistAgentExperimentCycle({
      teamId: team.id,
      userId: user.id,
      dataset: parsed.data.dataset,
      environment: parsed.data.environment,
      artifact,
    });
    return NextResponse.json({ ok: true, artifact, cycle }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "EXPERIMENT_FAILED";
    const status = message.startsWith("LIVE_") ? 403 : 400;
    return NextResponse.json({ ok: false, error: { code: message } }, { status });
  }
}

function safeTokenMatch(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  const configuredToken = process.env.PT_AGENT_EVIDENCE_EXPORT_TOKEN?.trim() ?? "";
  const exportTeamId = process.env.PT_AGENT_EVIDENCE_EXPORT_TEAM_ID?.trim() ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const presentedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  let teamId: string;
  if (
    configuredToken &&
    exportTeamId &&
    safeTokenMatch(presentedToken, configuredToken)
  ) {
    teamId = exportTeamId;
  } else {
    const { team, role } = await requireTeamContext();
    if (!isAdmin(role)) {
      return NextResponse.json({ ok: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    teamId = team.id;
  }
  const cycles = await listAgentExperimentCycles({ teamId });
  return NextResponse.json({
    ok: true,
    cycles,
    artifacts: cycles.map((cycle) => ({
      producerId: "press-tuner",
      producerContractVersion: "agent-experiment-cycle/v2",
      provenance:
        cycle.evidenceClass === "synthetic"
          ? "synthetic"
          : cycle.evidenceClass === "measured"
            ? "live"
            : "recorded",
      artifact: cycle.artifact,
    })),
  });
}
