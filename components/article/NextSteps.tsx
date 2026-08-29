"use client";

import { useState } from "react";

type Item = { id: string; label: string; done: boolean };

export default function NextSteps({ articleId }: { articleId: string }) {
  const [items, setItems] = useState<Item[]>([
    { id: "tone", label: "팀 톤 맞춤 점검", done: false },
    { id: "facts", label: "팩트 및 수치 검증", done: false },
    { id: "legal", label: "법무/규정 검토", done: false },
  ]);

  const toggle = (id: string) =>
    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, done: !x.done } : x))
    );

  return (
    <section className="border border-border bg-card p-3">
      <div className="text-sm font-medium">다음 작업</div>
      <ul className="mt-2 space-y-1">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2">
            <input
              id={`next-${it.id}`}
              type="checkbox"
              checked={it.done}
              onChange={() => toggle(it.id)}
              className="h-4 w-4 rounded border-input bg-background"
            />
            <label htmlFor={`next-${it.id}`} className="text-[12px] leading-5">
              {it.label}
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href="/team/knowledge"
          className="inline-flex items-center border border-border px-2 py-1 text-[11px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          팀 지식
        </a>
        <a
          href={`/press/${articleId}/edit`}
          className="inline-flex items-center border border-border px-2 py-1 text-[11px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          본문 다듬기
        </a>
      </div>
    </section>
  );
}
