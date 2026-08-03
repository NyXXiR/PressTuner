import { notFound } from "next/navigation";
import Link from "next/link";
import { getReadableArticleOrNull } from "@/lib/acl";
import ArticleBody from "@/components/article/ArticleBody";
import StatusPanel from "@/components/article/StatusPanel";
import ShareModal from "@/components/press/ShareModal";
import { getCurrentUserId } from "@/lib/auth";
import RecordRecentPress from "@/components/article/RecordRecentPress";
import {
  BookOpen,
  FileText,
  Sparkles,
  Target,
  MessageSquare,
  ChevronLeft,
  Pencil,
  Clock,
  User,
  Hash,
} from "lucide-react";

// 타입 에러 해결을 위한 인터페이스 정의
interface ArticleBodyContent {
  closing?: string;
  [key: string]: any;
}

type PageProps = { params: Promise<{ id: string }> };

function fmt(dt: Date) {
  const d = new Date(dt);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default async function ArticleDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();

  const userId = await getCurrentUserId();
  if (!userId) notFound();

  const article = await getReadableArticleOrNull(id, userId);
  if (!article) notFound();

  // 타입 안전성 확보
  const bodyContent = article.bodyJson as unknown as ArticleBodyContent;
  const lead = article.pressExtra?.lead || "";
  const fact = article.pressExtra?.fact || "";
  const hasClosing = !!bodyContent?.closing;

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

      <div className="mx-auto w-full max-w-5xl">
        {/* 상단 툴바 */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-6">
          <Link
            href="/my/articles"
            className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft
              size={18}
              className="transition-transform group-hover:-translate-x-1"
            />
            목록으로 돌아가기
          </Link>
          <div className="flex items-center gap-2">
            <ShareModal
              articleId={article.id}
              initialIsShared={article.isShared}
              initialToken={article.shareToken}
              title={article.title || "(제목 없음)"}
              description={lead || fact || "보도자료 결과를 공유합니다."}
            />
            <Link
              href={`/press/${article.id}/edit`}
              className="flex items-center gap-2 bg-primary px-5 py-2 text-[13px] font-semibold text-primary-foreground transition-all"
            >
              <Pencil size={14} />
              수정하기
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* 본문 영역 */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <article className="overflow-hidden border border-border bg-card">
              <header className="border-b border-border/50 bg-muted/5 p-8 sm:p-10">
                <div className="mb-4 inline-flex items-center gap-2 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                  {article.type}
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
                  {article.title || "(제목 없음)"}
                </h1>
                <div className="mt-6 flex gap-6 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Clock size={14} /> {fmt(article.updatedAt)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <User size={14} /> 내 문서
                  </span>
                </div>
              </header>

              <section className="grid grid-cols-1 md:grid-cols-2 border-b border-border/50">
                <div className="p-8 border-b md:border-b-0 md:border-r border-border/50">
                  <div className="mb-3 flex items-center gap-2 text-primary font-bold text-[11px] uppercase tracking-widest">
                    <Sparkles size={16} /> 리드 요약
                  </div>
                  <p className="text-sm leading-relaxed">
                    {lead || "내용 없음"}
                  </p>
                </div>
                <div className="p-8">
                  <div className="mb-3 flex items-center gap-2 text-emerald-500 font-bold text-[11px] uppercase tracking-widest">
                    <Target size={16} /> 핵심 팩트
                  </div>
                  <p className="text-sm leading-relaxed">
                    {fact || "내용 없음"}
                  </p>
                </div>
              </section>

              <section className="p-8 sm:p-10 min-h-[400px]">
                <ArticleBody
                  title={article.title}
                  lead={article.pressExtra?.lead}
                  fact={article.pressExtra?.fact}
                  bodyJson={article.bodyJson}
                  rawInput={article.rawInput ?? undefined}
                  defaultMode="read"
                />
              </section>

              <footer className="border-t border-border bg-muted/20 p-8">
                <div className="flex items-center gap-2 mb-4 text-sm font-bold uppercase tracking-widest">
                  <MessageSquare size={18} /> 피드백 및 메모
                </div>
                <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground hover:bg-muted/50 cursor-pointer transition-colors">
                  이곳에 피드백을 기록하세요.
                </div>
              </footer>
            </article>
          </div>

          {/* 사이드바 영역 */}
          <aside className="lg:col-span-4 flex flex-col gap-6">
            {/* 상태 관리 카드: py-4를 제거하고 패딩을 조절하여 여유 공간 확보 */}
            <section className="border border-border bg-card p-6">
              <h3 className="mb-5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                상태 관리
              </h3>
              <StatusPanel initialStatus={article.status as any} />

              <div className="mt-8 bg-blue-50/50 dark:bg-blue-900/10 p-4 border border-blue-100 dark:border-blue-900/20">
                <p className="text-[11px] leading-relaxed text-blue-700 dark:text-blue-300">
                  <strong>💡 안내:</strong> 발행 완료 상태가 되면 외부 공유
                  링크를 통해 제3자가 문서를 열람할 수 있습니다.
                </p>
              </div>
            </section>

            <div className="sticky top-6 flex flex-col gap-6">
              <section className="border border-border bg-card p-6">
                <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <BookOpen size={16} /> 빠른 이동
                </h3>
                <nav className="flex flex-col gap-1 text-[13px] text-muted-foreground">
                  <a
                    href="#summary-lead"
                    className="px-3 py-2 hover:bg-muted hover:text-foreground transition-all"
                  >
                    리드 요약
                  </a>
                  <a
                    href="#summary-fact"
                    className="px-3 py-2 hover:bg-muted hover:text-foreground transition-all"
                  >
                    핵심 팩트
                  </a>
                  <a
                    href="#article-body"
                    className="px-3 py-2 hover:bg-muted hover:text-foreground transition-all"
                  >
                    본문 읽기
                  </a>
                </nav>
              </section>

              <section className="border border-border bg-card p-6 text-[11px]">
                <h3 className="mb-4 flex items-center gap-2 font-bold uppercase tracking-widest text-muted-foreground">
                  <Hash size={16} /> 문서 정보
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">문서 ID</span>
                    <span className="font-mono text-foreground">
                      {article.id.slice(0, 8)}...
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">유형</span>
                    <span className="font-bold text-foreground">
                      {article.type}
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
