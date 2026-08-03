// app/team/notices/page.tsx
import NoticesListClient from "@/app/(dashboard)/(public)/notices/NoticesListClient";
import Link from "next/link";
import { requireTeamContext, isAdmin } from "@/lib/auth";
import { getTeamNoticesList } from "@/lib/notices";

export const dynamic = "force-dynamic";
export const metadata = { title: "팀 공지사항 | brieFFlow" };

export default async function TeamNoticesPage() {
  const { team, role } = await requireTeamContext();

  const items = await getTeamNoticesList(team.id, 50);
  const admin = isAdmin(role);

  return (
    <div className="space-y-10">
      {/* Header (MyDashboard 스타일) */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            팀 공지사항
          </h1>
          <p className="text-sm text-muted-foreground">
            워크스페이스(팀) 내에서 공유되는 공지사항입니다.
          </p>
        </div>

        {admin ? (
          <div className="flex items-center gap-2">
            <Link
              href="/team/notices/new"
              className="inline-flex h-11 items-center justify-center bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
            >
              + 새 공지
            </Link>
          </div>
        ) : null}
      </header>

      {/* List Surface */}
      <section className="border border-border bg-card overflow-hidden">
        <NoticesListClient
          items={items}
          isAdmin={admin}
          basePath="/team/notices"
        />
      </section>
    </div>
  );
}
