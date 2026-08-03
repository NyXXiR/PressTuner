"use client";

import { useEffect, useState } from "react";

type History = { id: string; label: string; at: string };

export default function HistoryPanel({ articleId }: { articleId: string }) {
  const [items, setItems] = useState<History[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/articles/${articleId}/history`, {
          cache: "no-store",
        });
        if (r.ok) setItems(await r.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [articleId]);

  return (
    <section className="border border-border bg-card p-3">
      <div className="text-sm font-medium">변경 이력</div>
      <ul className="mt-2 space-y-1">
        {loading ? (
          <li className="text-[12px] text-muted-foreground">불러오는 중…</li>
        ) : items.length === 0 ? (
          <li className="text-[12px] text-muted-foreground">
            표시할 이력이 없습니다.
          </li>
        ) : (
          items.map((it) => (
            <li key={it.id} className="text-[12px] text-muted-foreground">
              • {it.label} <span>({it.at})</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
