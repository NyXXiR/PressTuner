import NoticesListClient from "@/app/(dashboard)/(public)/notices/NoticesListClient";
import { PageHeader } from "@/components/page/PageHeader";
import { getGlobalNoticesList } from "@/lib/notices";

export const dynamic = "force-dynamic";
export const metadata = { title: "공지사항 | brieFFlow" };

export default async function PressNoticesPage() {
  const items = await getGlobalNoticesList(50);
  const isAdmin = false;

  return (
    <div className="mx-auto w-full max-w-5xl pb-20">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          eyebrow="brieFFlow Press"
          title="공지사항"
          description="서비스 운영 정보를 간단히 확인합니다."
        />
      </header>

      <section className="mt-6 border-t-2 border-foreground">
        <NoticesListClient
          items={items}
          isAdmin={isAdmin}
          basePath="/press/notices"
          variant="compact"
        />
      </section>
    </div>
  );
}
