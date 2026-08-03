import { ApplicationStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import {
  createApplication,
  listApplications,
  startResumeApplication,
} from "@/lib/services/resume/resumeApplicationService";
import { StartResumeApplicationCommandSchema } from "@/domain/resume-writing/contracts";

const APPLICATION_LIST_DEFAULT_PAGE = 1;
const APPLICATION_LIST_DEFAULT_PAGE_SIZE = 10;
const APPLICATION_LIST_MAX_PAGE_SIZE = 100;
const APPLICATION_STATUS_VALUES = new Set<ApplicationStatus>([
  ApplicationStatus.WRITING,
  ApplicationStatus.DONE,
]);

function parsePositiveInt(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseStatusFilter(value: string | null) {
  if (!value) return [] as ApplicationStatus[];

  return value
    .split(",")
    .map((status) => status.trim())
    .filter(Boolean)
    .filter((status): status is ApplicationStatus =>
      APPLICATION_STATUS_VALUES.has(status as ApplicationStatus),
    );
}

export async function GET(req: NextRequest) {
  try {
    const { user, team } = await requireTeamContext();
    const { searchParams } = new URL(req.url);
    const page = parsePositiveInt(
      searchParams.get("page"),
      APPLICATION_LIST_DEFAULT_PAGE,
    );
    const pageSize = parsePositiveInt(
      searchParams.get("pageSize"),
      APPLICATION_LIST_DEFAULT_PAGE_SIZE,
      APPLICATION_LIST_MAX_PAGE_SIZE,
    );
    const status = parseStatusFilter(searchParams.get("status"));

    const result = await listApplications({
      userId: user.id,
      teamId: team.id,
      q: searchParams.get("q") ?? undefined,
      status,
      page,
      pageSize,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "APPLICATION_LIST_FAILED",
      error?.message ?? "APPLICATION_LIST_FAILED",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. 인증 및 팀 컨텍스트 확인
    const { user, team } = await requireTeamContext();
    const body = await req.json();
    const command = StartResumeApplicationCommandSchema.safeParse(body);
    if (command.success) {
      const result = await startResumeApplication({
        userId: user.id,
        teamId: team.id,
        command: command.data,
      });
      return NextResponse.json({
        ok: true,
        id: result.applicationId,
        ...result,
      });
    }
    const { companyName, jobTitle, jdText, deadline, questions } = body;

    if (!Array.isArray(questions)) {
      const err = apiError("MISSING_QUESTIONS", "Missing questions", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    // 2. 지원서 및 문항 트랜잭션 생성
    const app = await createApplication({
      userId: user.id,
      teamId: team.id,
      companyName: typeof companyName === "string" ? companyName : "",
      jobTitle: typeof jobTitle === "string" ? jobTitle : "",
      jdText,
      deadline,
      questions,
    });

    return NextResponse.json({ ok: true, id: app.id });
  } catch (error: any) {
    console.error(error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "APPLICATION_CREATE_FAILED",
      error?.message || "Failed to create application",
      status,
      error?.details ? { details: error.details } : undefined,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
