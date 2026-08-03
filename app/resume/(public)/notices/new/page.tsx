import { requireAdmin } from "@/lib/auth";
import { NoticeForm } from "@/components/notices/NoticeForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "공지 작성 | brieFFlow" };

export default async function NewResumeNoticePage() {
  await requireAdmin();

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">공지 작성</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        체크된 상태로 저장하면 알림(배너/알림함)에 반영됩니다.
      </p>

      <div className="mt-6">
        <NoticeForm mode="create" />
      </div>
    </div>
  );
}
