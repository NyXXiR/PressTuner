"use client";

export default function ExportPanel({ articleId }: { articleId: string }) {
  async function copyPlain() {
    const el = document.querySelector("#article-plain");
    const text = el?.textContent ?? "";
    if (!text.trim()) return alert("복사할 본문이 없습니다.");
    await navigator.clipboard.writeText(text);
    alert("본문을 복사했어요.");
  }

  return (
    <section className="border border-border bg-card p-3">
      <div className="text-sm font-medium">내보내기</div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={copyPlain}
          className="inline-flex items-center border border-border px-2 py-1 text-[11px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          본문 복사
        </button>
        <a
          href={`/api/articles/${articleId}/export?format=md`}
          className="inline-flex items-center border border-border px-2 py-1 text-[11px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          Markdown
        </a>
        <a
          href={`/api/articles/${articleId}/export?format=docx`}
          className="inline-flex items-center border border-border px-2 py-1 text-[11px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          DOCX
        </a>
      </div>
    </section>
  );
}
