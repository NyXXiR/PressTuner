// components/press/FeedbackList.tsx
"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  vote: "LIKE" | "DISLIKE";
  comment: string | null;
  userLabel: string;
  createdAt: string;
};

export default function FeedbackList({ articleId }: { articleId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initLoaded, setInitLoaded] = useState(false);

  const load = async (next?: string | null) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        articleId,
        excludeMine: "1",
        limit: "10",
      });
      if (next) q.set("cursor", next);
      const res = await fetch(`/api/feedback?${q.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? "피드백 조회 실패");

      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
      setInitLoaded(true);
    } catch (e) {
      console.error(e);
      setInitLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 초기 로드 (articleId 바뀌면 리셋)
    setItems([]);
    setCursor(null);
    setInitLoaded(false);
    load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  if (!initLoaded && loading) {
    return (
      <div className="border border-border bg-card p-3 text-[12px] text-muted-foreground">
        피드백을 불러오는 중…
      </div>
    );
  }

  return (
    <div className="border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-xs font-semibold text-muted-foreground">
          다른 팀원이 남긴 피드백
        </h3>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-6 text-[12px] text-muted-foreground">
          아직 등록된 팀 피드백이 없습니다.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((it) => (
            <li key={it.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="text-[12px] text-muted-foreground">
                  {it.userLabel}
                  <span className="mx-1.5">·</span>
                  <span>
                    {new Date(it.createdAt).toLocaleString(undefined, {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="text-[12px]">
                  {it.vote === "LIKE" ? "👍" : "👎"}
                </div>
              </div>
              {it.comment && (
                <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">
                  {it.comment}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="px-4 py-2 border-t border-border">
        <button
          type="button"
          onClick={() => load(cursor)}
          disabled={!cursor || loading}
          className="text-[11px] border border-border px-3 py-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          {loading ? "불러오는 중…" : cursor ? "더 보기" : "1/1"}
        </button>
      </div>
    </div>
  );
}
