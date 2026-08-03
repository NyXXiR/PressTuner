"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PressEditClient } from "@/components/press/PressEditClient";
import { removeRecentPressHistoryItem } from "@/lib/recentPressHistory";
import { useMeStore } from "@/stores/useMeStore";
import { useTeamStore } from "@/stores/useTeamStore";

type ArticlePayload = {
  id: string;
  title: string;
  bodyJson: any | null;
  rawInput: string | null;
  teamId?: string | null;
  pressExtra?: { lead: string | null; fact: string | null } | null;
  lastPolishResult?: any | null;
};

export default function PressEditPage() {
  const params = useParams() as { id?: string | string[] };
  const rawId = params?.id;
  const articleId = Array.isArray(rawId) ? rawId[0] : rawId;

  const me = useMeStore((s) => s.me);
  const selectedTeamId = useTeamStore((s) => s.selectedTeamId);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [article, setArticle] = useState<ArticlePayload | null>(null);

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

        const res = await fetch(url, { credentials: "include" });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          if (
            (res.status === 404 || res.status === 403) &&
            me?.userId &&
            teamId
          ) {
            removeRecentPressHistoryItem(me.userId, teamId, articleId);
          }
          throw new Error(
            data?.message ?? data?.error ?? "보도자료를 불러오는 데 실패했습니다."
          );
        }

        console.log(data);
        setArticle(data.article as ArticlePayload);
      } catch (e: any) {
        setError(e?.message ?? "네트워크 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, [articleId, me?.userId, me?.teamId, selectedTeamId]);

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center text-sm text-muted-foreground">
        보도자료 데이터를 불러오는 중입니다…
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="flex h-[70vh] items-center justify-center text-sm text-muted-foreground">
        {error ?? "보도자료를 찾을 수 없습니다."}
      </div>
    );
  }

  // --- 데이터 복원 로직 (Standardization) ---
  const body = article.bodyJson || {};

  // 1. 리드 (bodyJson 우선, 없으면 pressExtra)
  const lead = body.lead || article.pressExtra?.lead || "";

  // 2. 본문 문단 (문자열 배열과 객체 배열 [{id, text}] 모두 대응)
  let paragraphsStr = "";
  if (Array.isArray(body.paragraphs)) {
    paragraphsStr = body.paragraphs
      .map((p: any) => (typeof p === "string" ? p : p?.text || ""))
      .filter(Boolean)
      .join("\n\n");
  }

  // 3. 맺음말
  const closing = body.closing || "";

  // 4. 결합
  let initialPlain = [lead, paragraphsStr, closing]
    .filter(Boolean)
    .join("\n\n");

  // 만약 bodyJson이 아예 비어있다면 rawInput이라도 시도
  if (!initialPlain.trim() && article.rawInput) {
    initialPlain = article.rawInput;
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
      <PressEditClient
        articleId={article.id}
        teamId={article.teamId ?? null}
        initialTitle={article.title || "제목 미정"}
        initialPlain={initialPlain}
        initialSpans={article.lastPolishResult?.spans || []}
        // ▼ 이 줄을 추가해야 합니다.
        initialNotes={article.lastPolishResult?.notes || []}
        finalPathForArticle={(targetArticleId) =>
          `/legacy/press/${targetArticleId}/final`
        }
      />
    </div>
  );
}
