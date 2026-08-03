import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AGENT_FAILURE_CATEGORIES } from "@/domain/evaluation/failureTaxonomy";
import { isAdmin, requireTeamContext } from "@/lib/auth";
import {
  ingestRegressionCandidate,
  listRegressionCandidates,
} from "@/lib/services/press-agent/regressionCandidateService";
import { validateBody } from "@/lib/utils/validate";

const CandidateSignalSchema = z.object({
  sourceKind: z.enum([
    "negative_feedback",
    "citation_accuracy",
    "approval_rejection",
    "runtime_failure",
    "draft_edit",
    "verification_finding",
    "retry_trace",
  ]),
  sourceId: z.string().min(1).max(200),
  excerpt: z.string().min(1).max(20_000),
  failureCategory: z.enum(AGENT_FAILURE_CATEGORIES),
  logicalSourceRefs: z.array(z.string().min(1).max(200)).max(100).default([]),
  terminal: z.boolean(),
  consent: z.boolean(),
  eligibleForEvaluation: z.boolean(),
}).strict();

export async function GET() {
  const { team, role } = await requireTeamContext();
  if (!isAdmin(role)) {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const candidates = await listRegressionCandidates({ teamId: team.id });
  return NextResponse.json({ ok: true, candidates });
}

export async function POST(req: NextRequest) {
  const { team, role } = await requireTeamContext();
  if (!isAdmin(role)) {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const parsed = validateBody(CandidateSignalSchema, await req.json());
  if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status });
  const result = await ingestRegressionCandidate({
    ...parsed.data,
    sourceTeamId: team.id,
    targetTeamId: team.id,
    containsProhibitedData: false,
  });
  return NextResponse.json({ ok: true, result }, { status: result.ingested ? 201 : 202 });
}
