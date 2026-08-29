"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMeStore } from "@/stores/useMeStore"; // [추가] 스토어 import
import { trackGaEvent } from "@/lib/analytics/ga4";

export function SignupButton() {
  const router = useRouter();
  // [추가] 가입 후 즉시 내 정보를 갱신하기 위해 fetchMe 가져오기
  const fetchMe = useMeStore((state) => state.fetchMe);

  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState({
    terms: false,
    privacy: false,
  });

  const allAgreed = agreed.terms && agreed.privacy;

  const handleSignup = async () => {
    if (!allAgreed) return;
    setLoading(true);

    try {
      // 1. 가입 요청 (쿠키 세팅됨)
      const res = await fetch("/api/auth/google/register", {
        method: "POST",
      });

      if (!res.ok) throw new Error("가입 실패");
      const data = await res.json().catch(() => null);

      // ----------------------------------------------------------------
      // [핵심 수정] 페이지 이동 전, 클라이언트 스토어에 "로그인 상태임"을 알림
      // ----------------------------------------------------------------
      // 이 함수가 실행되면서 세팅된 쿠키를 달고 /api/me를 호출하여
      // 스토어의 me 데이터를 채우고 authStatus를 'authed'로 변경합니다.
      await fetchMe();

      // 2. 대시보드(or next)로 이동
      const nextPath =
        data?.next && typeof data.next === "string" && data.next.startsWith("/")
          ? data.next
          : "/";
      trackGaEvent("signup_completed", {
        method: "google",
        next_path: nextPath,
      });
      router.push(nextPath);
      if (
        !nextPath.startsWith("/press/simplified") &&
        !nextPath.startsWith("/press/new")
      ) {
        router.refresh(); // 서버 컴포넌트 데이터(레이아웃 등) 갱신
      }
    } catch (e) {
      alert("가입 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4 border border-border bg-muted/40 p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-gray-300"
            checked={agreed.terms}
            onChange={(e) => setAgreed({ ...agreed, terms: e.target.checked })}
          />
          <div className="text-sm leading-none">
            <span className="font-medium text-foreground">(필수) </span>
            <Link
              href="/terms"
              target="_blank"
              className="underline hover:text-primary"
            >
              이용약관
            </Link>
            에 동의합니다.
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-gray-300"
            checked={agreed.privacy}
            onChange={(e) =>
              setAgreed({ ...agreed, privacy: e.target.checked })
            }
          />
          <div className="text-sm leading-none">
            <span className="font-medium text-foreground">(필수) </span>
            <Link
              href="/privacy"
              target="_blank"
              className="underline hover:text-primary"
            >
              개인정보 수집 및 이용
            </Link>
            에 동의합니다.
          </div>
        </label>
      </div>

      <button
        onClick={handleSignup}
        disabled={!allAgreed || loading}
        className="w-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "가입 처리 및 로그인 중..." : "동의하고 가입하기"}
      </button>
    </div>
  );
}
