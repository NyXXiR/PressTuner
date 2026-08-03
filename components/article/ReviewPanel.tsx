"use client";

import { useEffect, useState } from "react";

type Review = { id: string; author: string; comment: string; at: string };

export default function ReviewPanel({ articleId }: { articleId: string }) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/articles/${articleId}/reviews`, {
          cache: "no-store",
        });
        if (res.ok) setItems(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [articleId]);

  async function submit() {
    const v = text.trim();
    if (!v) return;
    setText("");
    const res = await fetch(`/api/articles/${articleId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: v }),
    });
    if (res.ok) {
      const item = (await res.json()) as Review;
      setItems((prev) => [item, ...prev]);
    }
  }

  return (
    <section className="border border-border bg-card p-3">
      <div className="text-sm font-medium">리뷰 / 코멘트</div>

      <div className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="리뷰어에게 메모 남기기 (@멘션 예정)"
          className="h-9 flex-1 border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        />
        <button
          onClick={submit}
          className="h-9 border border-border px-3 text-[11px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          남기기
        </button>
      </div>

      <div className="mt-2 max-h-64 space-y-2 overflow-auto border border-border bg-background p-2">
        {loading ? (
          <p className="text-[12px] text-muted-foreground">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            아직 코멘트가 없습니다.
          </p>
        ) : (
          items.map((it) => (
            <div key={it.id} className="text-[12px]">
              <div className="text-foreground">
                <span className="font-medium">{it.author}</span>{" "}
                <span className="text-muted-foreground">{it.at}</span>
              </div>
              <div className="whitespace-pre-wrap">{it.comment}</div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
