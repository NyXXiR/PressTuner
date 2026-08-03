// app/api/notices/[id]/route.ts
import { NextResponse } from "next/server";
import { requireAdmin, requireTeamContext, isAdmin } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { deleteNotice, getNoticeMeta, updateNotice } from "@/lib/services/noticeService";
import { ServiceError } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> | { id: string } };

async function getId(ctx: Ctx) {
  const p = await Promise.resolve(ctx.params as any);
  return p?.id as string | undefined;
}

type NoticeAuthContext =
  | {
      scope: "GLOBAL";
      noticeId: string;
      href: string;
      teamId: null;
    }
  | {
      scope: "TEAM";
      noticeId: string;
      href: string;
      teamId: string;
    };

// ✅ 공지 1건 조회 + scope에 맞춘 권한 체크 + href/teamId 결정까지
async function requireNoticeAuth(id: string): Promise<NoticeAuthContext> {
  let notice;
  try {
    notice = await getNoticeMeta(id);
  } catch (e: any) {
    if (e instanceof ServiceError) {
      const err = apiError(e.code, e.message, e.status);
      throw NextResponse.json(err.body, { status: err.status });
    }
    const err = apiError("UNKNOWN", "UNKNOWN", 500);
    throw NextResponse.json(err.body, { status: err.status });
  }
  const scope = notice.scope;

  if (scope === "GLOBAL") {
    // ✅ 전역 공지: 슈퍼어드민만
    await requireAdmin();
    return {
      scope: "GLOBAL",
      noticeId: notice.id,
      teamId: null,
      href: `/notices/${notice.id}`,
    };
  }

  // ✅ 팀 공지: 팀 컨텍스트 + ADMIN/OWNER
  const { team, role } = await requireTeamContext();

  // 팀 불일치 방어
  if (!notice.teamId || notice.teamId !== team.id) {
    const err = apiError("FORBIDDEN", "FORBIDDEN", 403);
    throw NextResponse.json(err.body, { status: err.status });
  }

  if (!isAdmin(role)) {
    const err = apiError("FORBIDDEN", "FORBIDDEN", 403);
    throw NextResponse.json(err.body, { status: err.status });
  }

  return {
    scope: "TEAM",
    noticeId: notice.id,
    teamId: team.id,
    href: `/team/notices/${notice.id}`,
  };
}

export async function PATCH(req: Request, ctx: Ctx) {
  const id = await getId(ctx);
  if (!id) {
    const err = apiError("INVALID_ID", "INVALID_ID", 400);
    return NextResponse.json(err.body, { status: err.status });
  }

  // ✅ scope에 따라 권한 분기 + teamId/href 확보
  const auth = await (async () => {
    try {
      return await requireNoticeAuth(id);
    } catch (e: any) {
      // requireNoticeAuth가 NextResponse를 throw한 경우 그대로 반환
      if (e instanceof Response) return e as any;
      const err = apiError("UNKNOWN", "UNKNOWN", 500);
      return NextResponse.json(err.body, { status: err.status });
    }
  })();
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();
  const sendAsNotification = !!body.sendAsNotification;

  if (!title || !content) {
    const err = apiError("INVALID", "INVALID", 400);
    return NextResponse.json(err.body, { status: err.status });
  }

  const updated = await updateNotice({
    scope: auth.scope,
    noticeId: auth.noticeId,
    teamId: auth.teamId ?? null,
    title,
    content,
    sendAsNotification,
    href: auth.href,
  });

  return NextResponse.json({ ok: true, notice: updated });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const id = await getId(ctx);
  if (!id) {
    const err = apiError("INVALID_ID", "INVALID_ID", 400);
    return NextResponse.json(err.body, { status: err.status });
  }

  // ✅ scope에 따라 권한 분기 + teamId/href 확보
  const auth = await (async () => {
    try {
      return await requireNoticeAuth(id);
    } catch (e: any) {
      if (e instanceof Response) return e as any;
      const err = apiError("UNKNOWN", "UNKNOWN", 500);
      return NextResponse.json(err.body, { status: err.status });
    }
  })();
  if (auth instanceof Response) return auth;

  await deleteNotice({
    scope: auth.scope,
    noticeId: auth.noticeId,
    teamId: auth.teamId ?? null,
  });

  return NextResponse.json({ ok: true });
}
