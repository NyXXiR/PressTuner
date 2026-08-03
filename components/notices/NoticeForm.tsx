"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod"; // ✅ zod import
import { validate, V } from "@/lib/utils/validate"; // ✅ validate 유틸 import
import clsx from "clsx";

// --- [추가] 공지사항 검증 스키마 ---
const NoticeSchema = z.object({
  title: V.required("제목").max(100, "제목은 최대 100자까지 입력 가능합니다."),
  content: V.minLen("공지 내용", 5), // 최소 5자
});

type Props = {
  mode: "create" | "edit";
  noticeId?: string;
  initial?: {
    title: string;
    content: string;
    sendAsNotification: boolean;
  };
};

export function NoticeForm({ mode, noticeId, initial }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [sendAsNotification, setSendAsNotification] = useState(
    initial?.sendAsNotification ?? true,
  );
  const [busy, setBusy] = useState(false);

  // --- [추가] 에러 상태 ---
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    // --- [수정] validate 사용 ---
    const { success, errors: validationErrors } = validate(NoticeSchema, {
      title,
      content,
    });

    if (!success && validationErrors) {
      setErrors(validationErrors);
      // 첫 번째 에러 메시지 알림 (선택 사항)
      // alert(Object.values(validationErrors)[0]);
      return;
    }

    setBusy(true);
    setErrors({}); // 에러 초기화

    try {
      const url =
        mode === "create" ? "/api/notices" : `/api/notices/${noticeId}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, sendAsNotification }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.message ?? data?.error ?? "저장에 실패했습니다.");
        return;
      }

      const id = data?.notice?.id ?? noticeId;
      router.push(id ? `/team/notices/${id}` : "/notices");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border border-border/40 dark:border-white/10 bg-card/60 p-4">
        <label className="block text-xs text-muted-foreground">제목</label>
        <input
          className={clsx(
            "mt-2 w-full border bg-background/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30",
            errors.title
              ? "border-red-500/50 focus:border-red-500"
              : "border-border/40 dark:border-white/10",
          )}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="공지 제목"
        />
        {errors.title && (
          <p className="mt-1 text-xs text-red-500 animate-in slide-in-from-top-1">
            {errors.title}
          </p>
        )}
      </div>

      <div className="border border-border/40 dark:border-white/10 bg-card/60 p-4">
        <label className="block text-xs text-muted-foreground">내용</label>
        <textarea
          className={clsx(
            "mt-2 min-h-[240px] w-full border bg-background/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30",
            errors.content
              ? "border-red-500/50 focus:border-red-500"
              : "border-border/40 dark:border-white/10",
          )}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="공지 내용을 입력하세요"
        />
        {errors.content && (
          <p className="mt-1 text-xs text-red-500 animate-in slide-in-from-top-1">
            {errors.content}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <input
            id="sendAsNotification"
            type="checkbox"
            checked={sendAsNotification}
            onChange={(e) => setSendAsNotification(e.target.checked)}
          />
          <label htmlFor="sendAsNotification" className="text-sm">
            알림으로 보내기
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          체크된 상태로 저장되면 공지 제목이 알림함/배너에 노출됩니다.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="h-10 border border-border/40 dark:border-white/10 px-4 text-sm hover:bg-muted"
          disabled={busy}
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          className="h-10 bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          disabled={busy}
        >
          {mode === "create" ? "작성" : "수정"}
        </button>
      </div>
    </div>
  );
}
