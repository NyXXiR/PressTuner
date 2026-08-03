"use client";

import { useEffect, useState } from "react";

type Vote = "LIKE" | "DISLIKE";

export default function FeedbackPanel({ articleId }: { articleId: string }) {
  const [loading, setLoading] = useState(true);

  // 조회 결과
  const [exists, setExists] = useState(false);
  const [existing, setExisting] = useState<{
    vote: Vote;
    comment?: string;
  } | null>(null);

  // 작성/수정 폼
  const [vote, setVote] = useState<Vote | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 수정 모드
  const [editing, setEditing] = useState(false);

  // 🔎 "내" 피드백만 1건 조회해서 패널 잠금/초깃값 세팅
  async function fetchMine() {
    const q = new URLSearchParams({ articleId, mineOnly: "1", limit: "1" });
    const r = await fetch(`/api/feedback?${q.toString()}`);
    if (!r.ok) return;
    const data = await r.json();
    const mine =
      Array.isArray(data?.items) && data.items.length > 0
        ? data.items[0]
        : null;

    if (mine) {
      setExists(true);
      setExisting({ vote: mine.vote, comment: mine.comment ?? "" });
      // 수정 모드가 아닐 때만 폼 값 초기화
      if (!editing) {
        setVote(null);
        setComment("");
      }
    } else {
      setExists(false);
      setExisting(null);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await fetchMine();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  // 최초 제출
  const onSubmit = async () => {
    if (!vote) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, vote, comment }),
      });

      if (res.status === 409) {
        // 이미 있음 → 서버 상태를 다시 읽어 잠금
        await fetchMine();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? data?.error ?? "피드백 실패");
      }

      setExists(true);
      setExisting({ vote, comment });
      setVote(null);
      setComment("");
    } catch (e: any) {
      setError(e?.message ?? "피드백 오류");
    } finally {
      setSubmitting(false);
    }
  };

  // 수정 저장
  const onUpdate = async () => {
    if (!vote && comment === (existing?.comment ?? "")) {
      // 변경 없음
      setEditing(false);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/feedback`, {
        method: "PUT", // ← 서버에서 내 피드백 upsert/update 처리
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId,
          // vote는 선택적으로만 보냄(버튼 안 누르면 기존값 유지)
          vote: (vote ?? existing?.vote) as Vote,
          comment,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? data?.error ?? "수정 실패");
      }
      // 성공 → 최신 상태 반영
      setExisting({ vote: (vote ?? existing?.vote) as Vote, comment });
      setEditing(false);
    } catch (e: any) {
      setError(e?.message ?? "수정 오류");
    } finally {
      setSubmitting(false);
    }
  };

  // 수정 시작
  const startEdit = () => {
    if (!existing) return;
    setVote(existing.vote);
    setComment(existing.comment ?? "");
    setEditing(true);
    setError(null);
  };

  // 수정 취소
  const cancelEdit = () => {
    setEditing(false);
    setVote(null);
    setComment("");
    setError(null);
  };

  if (loading) {
    return (
      <div className="border border-border bg-card p-4 text-sm text-muted-foreground">
        피드백 영역 로딩 중…
      </div>
    );
  }

  // ✅ 이미 제출했을 때
  if (exists && existing && !editing) {
    return (
      <div className="border border-border bg-card p-4 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold mb-1">피드백을 남겼습니다.</h3>
            <p className="text-[12px] text-muted-foreground mb-3">
              응답해 주신 내용은 팀 보도자료 작성/첨삭 품질을 개선하는 데
              반영됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={startEdit}
            className="text-[12px] border border-border px-3 py-1 hover:bg-muted"
            title="수정하기"
          >
            수정하기
          </button>
        </div>

        <div className="text-[12px]">
          <div className="mb-1">
            내 투표:{" "}
            <span
              className={
                existing.vote === "LIKE" ? "text-green-600" : "text-red-500"
              }
            >
              {existing.vote === "LIKE" ? "좋아요" : "싫어요"}
            </span>
          </div>
          {existing.comment ? (
            <div className="text-muted-foreground whitespace-pre-wrap">
              남긴 코멘트: {existing.comment}
            </div>
          ) : (
            <div className="text-muted-foreground">코멘트 없음</div>
          )}
        </div>
      </div>
    );
  }

  // ✏️ 수정 모드(또는 최초 작성 폼)
  const isEditing = exists && editing;

  return (
    <div className="border border-border bg-card p-4 text-sm">
      <h3 className="text-sm font-semibold mb-2">
        {isEditing ? "내 피드백 수정" : "최종본에 대한 피드백"}
      </h3>

      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => setVote("LIKE")}
          className={`text-[12px] px-3 py-1 border ${
            (vote ?? existing?.vote) === "LIKE"
              ? "bg-green-500 text-white border-green-600"
              : "hover:bg-muted"
          }`}
        >
          👍 좋아요
        </button>
        <button
          type="button"
          onClick={() => setVote("DISLIKE")}
          className={`text-[12px] px-3 py-1 border ${
            (vote ?? existing?.vote) === "DISLIKE"
              ? "bg-red-500 text-white border-red-600"
              : "hover:bg-muted"
          }`}
        >
          👎 싫어요
        </button>
      </div>

      <textarea
        value={isEditing ? comment : comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={
          isEditing
            ? "코멘트를 수정하세요. (선택)"
            : "간단한 이유나 코멘트를 남겨주세요. (선택)"
        }
        className="w-full bg-background border border-input px-3 py-2 text-sm min-h-[80px]"
      />

      {error && <div className="mt-2 text-[11px] text-red-500">{error}</div>}

      <div className="mt-3 flex justify-end gap-2">
        {isEditing ? (
          <>
            <button
              type="button"
              onClick={cancelEdit}
              className="text-[12px] border border-border px-3 py-1 hover:bg-muted"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onUpdate}
              disabled={submitting || !(vote ?? existing?.vote)}
              className="text-[12px] bg-primary text-primary-foreground px-3 py-1 hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "수정 중…" : "수정 저장"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || !vote}
            className="text-[12px] bg-primary text-primary-foreground px-3 py-1 hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "제출 중…" : "피드백 제출"}
          </button>
        )}
      </div>
    </div>
  );
}
