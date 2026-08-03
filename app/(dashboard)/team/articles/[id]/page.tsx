import { notFound } from "next/navigation";
import Link from "next/link";
import { getReadableArticleOrNull } from "@/lib/acl";
import { getCurrentUserId } from "@/lib/auth";

import ArticleBody from "@/components/article/ArticleBody";
import StatusPanel from "@/components/article/StatusPanel";
import NextSteps from "@/components/article/NextSteps";
import ReviewPanel from "@/components/article/ReviewPanel";
import HistoryPanel from "@/components/article/HistoryPanel";
import ExportPanel from "@/components/article/ExportPanel";
import RecordRecentPress from "@/components/article/RecordRecentPress";

type PageProps = { params: Promise<{ id: string }> };

function fmt(dt: Date) {
  const d = new Date(dt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(
    2,
    "0"
  )}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default async function TeamArticleDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();

  const userId = await getCurrentUserId();
  if (!userId) notFound();

  // acl.ts 변경으로 인해 userId가 팀 멤버라면 currentTeamId 없이도 조회 가능
  const article = await getReadableArticleOrNull(id, userId);
  if (!article) notFound();

  if (article.type !== "PRESS_RELEASE") notFound();

  const lead = article.pressExtra?.lead || "";
  const fact = article.pressExtra?.fact || "";

  return (
    <>
      <RecordRecentPress
        article={{
          id: article.id,
          title: article.title || "(제목 없음)",
          status: article.status as any,
          updatedAt: article.updatedAt.toISOString(),
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 본문 영역 */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* 헤더 */}
          <header className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold">
                {article.title || "(제목 없음)"}
              </h1>
              <p className="text-[11px] text-muted-foreground mt-1">
                유형: <b>{article.type}</b> · 업데이트: {fmt(article.updatedAt)}
              </p>
            </div>

            <div className="flex gap-2 shrink-0">
              <Link
                href={`/team/articles/${article.id}/edit`}
                className="text-[11px] border border-border px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                ✏️ 수정
              </Link>
              <Link
                href="/team/articles"
                className="text-[11px] border border-border px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                목록
              </Link>
            </div>
          </header>

          {/* 리드/팩트/메타 */}
          <section className="border border-border bg-card p-3 space-y-2">
            <div className="flex gap-3">
              <div className="shrink-0">
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  리드
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">
                {lead || "작성된 리드가 없습니다."}
              </p>
            </div>

            <div className="flex gap-3">
              <div className="shrink-0">
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  핵심 팩트
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">
                {fact || "핵심 팩트가 비어 있습니다."}
              </p>
            </div>

            <div className="flex gap-3 border-t border-border/60 pt-2 mt-1 text-[11px] text-muted-foreground">
              <div className="shrink-0">
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  메타
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span>생성일: {fmt(article.createdAt)}</span>
                <span>상태: {article.status}</span>
              </div>
            </div>
          </section>

          {/* 본문 */}
          <section className="border border-border bg-card p-4">
            <h2 className="text-sm font-medium mb-2">본문</h2>
            <ArticleBody
              title={article.title}
              lead={article.pressExtra?.lead}
              fact={article.pressExtra?.fact}
              bodyJson={article.bodyJson}
              rawInput={article.rawInput ?? undefined}
              defaultMode="edited"
            />
          </section>
        </div>

        {/* 우측 패널 */}
        <aside className="lg:col-span-4 flex flex-col gap-3">
          <StatusPanel initialStatus={article.status as any} />
          <NextSteps articleId={article.id} />
          <ReviewPanel articleId={article.id} />
          <HistoryPanel articleId={article.id} />
          <ExportPanel articleId={article.id} />
        </aside>
      </div>
    </>
  );
}
