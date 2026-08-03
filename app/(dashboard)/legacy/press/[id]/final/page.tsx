"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import FeedbackPanel from "@/components/press/FeedbackPanel";
import FeedbackList from "@/components/press/FeedbackList";
import ArticleBody from "@/components/article/ArticleBody";
// ✅ ShareModal 추가
import ShareModal from "@/components/press/ShareModal";
import { CheckCircle2, FileEdit, ArrowLeft } from "lucide-react";
import clsx from "clsx";

export default function PressFinalPage() {
  const params = useParams() as { id?: string | string[] };
  const router = useRouter();

  const raw = params?.id;
  const articleId = Array.isArray(raw) ? raw[0] : raw;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [article, setArticle] = useState<any>(null);

  useEffect(() => {
    if (!articleId) {
      setError("잘못된 접근입니다.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // [CRITICAL] 캐시 방지
        const res = await fetch(`/api/articles/${articleId}`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          },
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.message ?? errData?.error ?? "문서 조회에 실패했습니다.");
        }

        const data = await res.json();
        setArticle(data.article);
      } catch (e: any) {
        console.error("Final Page Load Error:", e);
        setError(e?.message ?? "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, [articleId]);

  const reopenForEdit = async () => {
    if (!articleId) return;

    try {
      await fetch(`/api/articles/${articleId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      });
      router.push(`/legacy/press/${articleId}/edit`);
    } catch (e) {
      console.error(e);
      router.push(`/legacy/press/${articleId}/edit`);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground animate-pulse">
        <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-sm font-medium">
          최종 결과물을 불러오는 중입니다...
        </p>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="text-red-500 font-medium">
          {error ?? "문서를 찾을 수 없습니다."}
        </div>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} /> 돌아가기
        </button>
      </div>
    );
  }

  const bodyJson = article.bodyJson || { paragraphs: [] };
  const lead = article.pressExtra?.lead || "";
  const fact = article.pressExtra?.fact || "";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10 pb-32 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* 상단 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border pb-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={12} />
            WRITING COMPLETED
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            보도자료 작성이 완료되었습니다.
          </h1>
          <p className="text-sm text-muted-foreground">
            최종 결과물을 확인하고, 필요한 경우 다시 수정하거나 피드백을
            남겨주세요.
          </p>
        </div>

        {/* ✅ 버튼 그룹: 공유 버튼 + 수정 버튼 */}
        <div className="flex items-center gap-3">
          <ShareModal
            articleId={articleId as string}
            initialIsShared={article.isShared} // API 응답에 이 필드가 있어야 함
            initialToken={article.shareToken} // API 응답에 이 필드가 있어야 함
            title={article.title}
            description={lead}
          />

          <button
            onClick={reopenForEdit}
            className="group flex shrink-0 items-center gap-2 rounded-full border border-border bg-background px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground active:scale-95 shadow-sm"
          >
            <FileEdit
              size={14}
              className="text-muted-foreground group-hover:text-foreground transition-colors"
            />
            다시 수정하기
          </button>
        </div>
      </div>

      {/* 본문 뷰어 */}
      <section
        className={clsx(
          "min-h-[400px] rounded-2xl border border-border p-8 md:p-12 shadow-sm",
          "bg-card text-foreground",
          "[&_p]:text-foreground [&_li]:text-foreground [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground",
          "[&_p]:leading-relaxed [&_li]:leading-relaxed",
        )}
      >
        <ArticleBody
          title={article.title}
          lead={lead}
          fact={fact}
          bodyJson={bodyJson}
          rawInput={article.rawInput ?? undefined}
          defaultMode="read"
        />
      </section>

      {/* 피드백 영역 */}
      <div className="mt-4 space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-medium text-muted-foreground shrink-0">
            AI 모델 개선을 위해 평가를 남겨주세요
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="flex flex-col gap-6">
          <FeedbackPanel articleId={articleId!} />
          <FeedbackList articleId={articleId!} />
        </div>
      </div>
    </div>
  );
}
