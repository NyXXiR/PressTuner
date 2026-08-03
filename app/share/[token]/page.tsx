// app/share/[token]/page.tsx
import Link from "next/link"; // ✅ Link Import
import { getSharedArticleByToken } from "@/lib/services/article/articleUseCases";
import ArticleBody from "@/components/article/ArticleBody";
import { notFound } from "next/navigation";
import { Metadata } from "next";

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { token } = await params;
    const article = await getSharedArticleByToken(token);
    return {
      title: article.title,
      description: article.pressExtra?.lead || "AI 보도자료 작성 결과입니다.",
      openGraph: {
        title: article.title,
        description: article.pressExtra?.lead || "AI 보도자료 작성 결과입니다.",
        images: [
          {
            url: "/images/og_image.png",
            width: 1200,
            height: 630,
            alt: "brieFFlow Preview",
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: article.title,
        description: article.pressExtra?.lead || "AI 보도자료 작성 결과입니다.",
        images: ["/images/og_image.png"],
      },
    };
  } catch {
    return { title: "문서를 찾을 수 없습니다." };
  }
}

export default async function SharedArticlePage({ params }: Props) {
  let article;

  try {
    const { token } = await params;
    article = await getSharedArticleByToken(token);
  } catch (e) {
    notFound();
  }

  const bodyJson = (article.bodyJson as any) || { paragraphs: [] };
  const lead = article.pressExtra?.lead || "";
  const fact = article.pressExtra?.fact || "";

  return (
    <main className="min-h-screen bg-background flex flex-col items-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-3xl space-y-8 animate-in fade-in duration-500">
        {/* Header */}
        <div className="text-center space-y-3 border-b border-border pb-8">
          <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-wider mb-2">
            SHARED ARTICLE
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">
            {article.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(article.createdAt).toLocaleDateString()} 작성됨
          </p>
        </div>

        {/* 재료: 원문 + 브리프 */}
        <div className="pt-surface p-6 md:p-8 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              작성에 사용된 원문
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {article.rawInput || "입력된 원문이 없습니다."}
            </p>
          </div>
        </div>

        {/* 결과물 Viewer */}
        <div className="pt-surface p-8 md:p-12 text-foreground">
          <ArticleBody
            title={article.title}
            lead={lead}
            fact={fact}
            bodyJson={bodyJson}
            defaultMode="read"
          />
        </div>

        {/* Footer */}
        <div className="pt-8 pb-12">
          <div className="pt-surface p-6 text-center text-sm text-muted-foreground">
            <p>이 문서는 brieFFlow AI를 통해 작성되었습니다.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link
                href="/"
                className="inline-flex items-center justify-center bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                나도 작성해보기
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
              >
                로그인하고 이어서
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
