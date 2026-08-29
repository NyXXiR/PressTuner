"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  Plus,
} from "lucide-react";

import ArticleBody from "@/components/article/ArticleBody";
import { PressSimplifiedDevSwitcher } from "@/components/press/PressSimplifiedDevSwitcher";
import {
  PressSimplifiedBottomBar,
  PressSimplifiedWorkspace,
} from "@/components/press/PressSimplifiedWorkspace";
import ShareModal from "@/components/press/ShareModal";
import { toast } from "@/stores/toastStore";
import { useMeStore } from "@/stores/useMeStore";
import { useTeamStore } from "@/stores/useTeamStore";
import { buildCanonicalArticlePlain } from "@/domain/article/articleCanonicalContent";

type ArticlePayload = {
  id: string;
  title: string;
  bodyJson: any | null;
  rawInput: string | null;
  teamId?: string | null;
  pressExtra?: { lead: string | null; fact: string | null } | null;
  isShared?: boolean;
  shareToken?: string | null;
};

function buildPlainFromArticle(article: ArticlePayload) {
  const body = article.bodyJson || {};
  return buildCanonicalArticlePlain({
    lead: body.lead || article.pressExtra?.lead,
    fact: body.fact || article.pressExtra?.fact,
    paragraphs: body.paragraphs,
    closing: body.closing,
    rawInput: article.rawInput,
  });
}

function buildArticleBodyJson(article: ArticlePayload) {
  const body = article.bodyJson || {};
  const lead = body.lead || article.pressExtra?.lead || "";
  const fact = body.fact || article.pressExtra?.fact || "";
  const bodyParagraphs = Array.isArray(body.paragraphs)
    ? body.paragraphs
        .map((item: any) => {
          if (typeof item === "string") {
            return { text: item, importance: 0 };
          }

          return {
            text: typeof item?.text === "string" ? item.text : "",
            importance:
              typeof item?.importance === "number" ? item.importance : 0,
          };
        })
        .filter((item: { text: string }) => item.text.trim())
    : [];
  const paragraphTexts = new Set(
    bodyParagraphs.map((item: { text: string }) => item.text.trim()),
  );

  return {
    ...body,
    paragraphs: [
      ...(lead && !paragraphTexts.has(lead.trim())
        ? [{ text: lead, importance: 3 }]
        : []),
      ...(fact && !paragraphTexts.has(fact.trim())
        ? [{ text: fact, importance: 2 }]
        : []),
      ...bodyParagraphs,
    ],
    closing: typeof body.closing === "string" ? body.closing : "",
  };
}

export function SimplifiedPressComplete() {
  const params = useParams() as { id?: string | string[] };
  const rawId = params?.id;
  const articleId = Array.isArray(rawId) ? rawId[0] : rawId;

  const me = useMeStore((state) => state.me);
  const fetchMe = useMeStore((state) => state.fetchMe);
  const selectedTeamId = useTeamStore((state) => state.selectedTeamId);
  const hydrateFromStorage = useTeamStore((state) => state.hydrateFromStorage);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [article, setArticle] = useState<ArticlePayload | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    hydrateFromStorage();
    if (!me) void fetchMe();
  }, [fetchMe, hydrateFromStorage, me]);

  useEffect(() => {
    if (!articleId) {
      setError("잘못된 주소입니다.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const teamId = selectedTeamId || me?.teamId;
        const url = teamId
          ? `/api/articles/${articleId}?teamId=${encodeURIComponent(teamId)}`
          : `/api/articles/${articleId}`;
        const res = await fetch(url, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(
            data?.message ?? data?.error ?? "보도자료를 불러오지 못했습니다.",
          );
        }

        setArticle(data.article as ArticlePayload);
      } catch (err: any) {
        setError(err?.message ?? "네트워크 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, [articleId, me?.teamId, selectedTeamId]);

  const plain = useMemo(
    () => (article ? buildPlainFromArticle(article) : ""),
    [article],
  );
  const articleBodyJson = useMemo(
    () => (article ? buildArticleBodyJson(article) : null),
    [article],
  );

  const handleCopy = async () => {
    if (!article) return;
    await navigator.clipboard.writeText(`${article.title}\n\n${plain}`.trim());
    setCopied(true);
    toast.success("복사했습니다.", undefined, "top-center");
    setTimeout(() => setCopied(false), 1800);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm font-semibold text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
        최종 문서를 불러오는 중입니다.
      </div>
    );
  }

  if (error || !article || !articleId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center text-sm text-muted-foreground">
        <p>{error ?? "보도자료를 찾을 수 없습니다."}</p>
        <Link
          href="/press/new"
          className="bg-primary px-4 py-2 font-bold text-primary-foreground"
        >
          새로 만들기
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PressSimplifiedWorkspace mainClassName="max-w-4xl">
        <div className="mb-6 border-b border-border/70 pb-5">
          <Link
            href="/press/articles"
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            보도자료 목록
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-bold text-success">
            <Check className="h-3.5 w-3.5" />
            완료
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            보도자료가 완료되었습니다.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            최종 문서를 확인하고 필요한 작업을 선택하세요.
          </p>
        </div>

        <section className="border border-border bg-card p-6 text-foreground sm:p-10 [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_li]:text-foreground [&_p]:text-foreground [&_pre]:text-foreground">
          <ArticleBody
            title={article.title || "제목 없음"}
            lead={article.pressExtra?.lead}
            fact={article.pressExtra?.fact}
            bodyJson={articleBodyJson}
            rawInput={article.rawInput ?? undefined}
            defaultMode="read"
          />
        </section>
      </PressSimplifiedWorkspace>

      <PressSimplifiedBottomBar contentClassName="max-w-4xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-foreground">
              최종 문서가 저장되었습니다.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              필요한 경우 복사하거나 목록으로 돌아가세요.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <ShareModal
              articleId={articleId}
              initialIsShared={Boolean(article.isShared)}
              initialToken={article.shareToken ?? null}
              title={article.title || "제목 없음"}
              description={
                plain.slice(0, 120) || "보도자료 작성이 완료되었습니다."
              }
            />
            <Link
              href="/press/new"
              className="inline-flex h-11 items-center justify-center gap-2 border border-border px-5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              새로 만들기
            </Link>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-11 items-center justify-center gap-2 border border-border px-5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "복사됨" : "복사"}
            </button>
            <Link
              href="/press/articles"
              className="inline-flex h-11 items-center justify-center gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
            >
              보도자료 목록
            </Link>
          </div>
        </div>
      </PressSimplifiedBottomBar>
      <PressSimplifiedDevSwitcher current="complete" />
    </div>
  );
}
