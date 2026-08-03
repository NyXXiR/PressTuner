// app/team/notices/[id]/edit/page.tsx
import { prisma } from "@/lib/prisma";
import { requireTeamContext, isAdmin } from "@/lib/auth";
import { NoticeForm } from "@/components/notices/NoticeForm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "팀 공지 수정 | brieFFlow" };

type Ctx = { params: Promise<{ id: string }> | { id: string } };

async function getId(ctx: Ctx) {
  const p = await Promise.resolve(ctx.params as any);
  return p?.id as string | undefined;
}

export default async function EditTeamNoticePage(ctx: Ctx) {
  const { team, role } = await requireTeamContext();
  if (!isAdmin(role)) notFound();

  const id = await getId(ctx);
  if (!id) notFound();

  const notice = await prisma.notice.findFirst({
    where: { id, scope: "TEAM", teamId: team.id },
    select: {
      id: true,
      title: true,
      content: true,
      sendAsNotification: true,
    },
  });

  if (!notice) notFound();

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">팀 공지 수정</h1>
      <div className="mt-6">
        <NoticeForm
          mode="edit"
          noticeId={notice.id}
          initial={{
            title: notice.title,
            content: notice.content,
            sendAsNotification: notice.sendAsNotification,
          }}
        />
      </div>
    </div>
  );
}
