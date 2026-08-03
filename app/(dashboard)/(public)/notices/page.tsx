// app/notices/page.tsx
import NoticesListClient from "./NoticesListClient";
import { PageHeader } from "@/components/page/PageHeader";
import { getGlobalNoticesList } from "@/lib/notices";

export const dynamic = "force-dynamic";
export const metadata = { title: "공지사항 | brieFFlow" };

export default async function NoticesPage() {
  const items = await getGlobalNoticesList(50);
  const isAdmin = false;

  return (
    <div className="mx-auto w-full max-w-5xl pb-20">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          eyebrow="Notices"
          title="공지사항"
          description="서비스 운영 공지를 확인합니다."
        />
      </header>

      <section className="mt-6 border-t-2 border-foreground">
        <NoticesListClient
          items={items}
          isAdmin={isAdmin}
          basePath="/notices"
        />
      </section>
    </div>
  );
}
