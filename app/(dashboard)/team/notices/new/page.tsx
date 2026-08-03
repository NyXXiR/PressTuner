// app/team/notices/new/page.tsx
import { requireTeamContext, isAdmin } from "@/lib/auth";
import { NoticeForm } from "@/components/notices/NoticeForm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "팀 공지 작성 | brieFFlow" };

export default async function NewTeamNoticePage() {
  const { role } = await requireTeamContext();
  if (!isAdmin(role)) notFound();

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">팀 공지 작성</h1>
      <div className="mt-6">
        <NoticeForm mode="create" />
      </div>
    </div>
  );
}
