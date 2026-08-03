import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { NoticeForm } from "@/components/notices/NoticeForm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "공지 수정 | brieFFlow" };

export default async function EditResumeNoticePage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();

  const notice = await prisma.notice.findFirst({
    where: {
      id: params.id,
      scope: "GLOBAL",
      teamId: null,
    },
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
      <h1 className="text-2xl font-semibold tracking-tight">공지 수정</h1>
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
