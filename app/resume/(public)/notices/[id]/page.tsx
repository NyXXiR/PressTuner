import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionContext, isSuperAdminEmail } from "@/lib/auth";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> | { id: string } };

async function getId(ctx: Ctx) {
  const p = await Promise.resolve(ctx.params as any);
  return p?.id as string | undefined;
}

export default async function ResumeNoticeDetailPage(ctx: Ctx) {
  const id = await getId(ctx);
  if (!id) notFound();

  const notice = await prisma.notice.findFirst({
    where: {
      id,
      scope: "GLOBAL",
      isDraft: false,
    },
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      sendAsNotification: true,
    },
  });

  if (!notice) notFound();

  const sessionCtx = await getSessionContext();
  const canEdit = isSuperAdminEmail(sessionCtx?.user?.email);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href="/resume/notices"
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
        >
          ← 목록으로
        </Link>

        {canEdit && (
          <Link
            href={`/resume/notices/${notice.id}/edit`}
            className="bg-muted/35 px-3 py-2 text-sm font-medium hover:bg-muted/55 transition-colors"
          >
            수정
          </Link>
        )}
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">{notice.title}</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        {new Date(notice.createdAt).toLocaleString()}
      </p>

      <article className="mt-6 border border-border/40 dark:border-white/10 bg-card/60 p-5 leading-7">
        <div className="whitespace-pre-wrap text-sm text-foreground/90">
          {notice.content}
        </div>
      </article>
    </div>
  );
}
