"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMeStore } from "@/stores/useMeStore";
import {
  TERMS_DATA,
  PRIVACY_DATA,
  type PolicySection,
} from "@/lib/constants/policies";
import { trackGaEvent } from "@/lib/analytics/ga4";
import { PageCTA } from "@/components/page/PageCTA";

// 약관 내용을 보여주는 내부 컴포넌트
function PolicyViewer({ data }: { data: PolicySection[] }) {
  return (
    <div className="h-[360px] w-full overflow-y-auto border border-border bg-muted/30 p-5 text-sm text-muted-foreground scrollbar-thin scrollbar-thumb-border">
      <div className="space-y-6">
        {data.map((section, idx) => (
          <div key={idx}>
            <h4 className="mb-2 font-bold text-foreground">
              {section.title}
            </h4>
            <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed">
              {section.content.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SignupForm({ email }: { email: string }) {
  const router = useRouter();
  const fetchMe = useMeStore((state) => state.fetchMe);
  const [loading, setLoading] = useState(false);

  // 현재 보고 있는 탭 (terms | privacy)
  const [activeTab, setActiveTab] = useState<"terms" | "privacy">("terms");

  // 동의 상태
  const [agreed, setAgreed] = useState({
    terms: false,
    privacy: false,
  });

  const allAgreed = agreed.terms && agreed.privacy;

  const handleSignup = async () => {
    if (!allAgreed) return;
    setLoading(true);

    trackGaEvent("signup_started", {
      method: "google",
      has_terms_agreed: agreed.terms,
      has_privacy_agreed: agreed.privacy,
    });

    try {
      // 1. 가입 API 호출
      const res = await fetch("/api/auth/google/register", { method: "POST" });
      if (!res.ok) throw new Error("가입 실패");
      const data = await res.json().catch(() => null);

      // 2. 중요: 페이지 이동 전 Zustand Store 갱신 (쿠키 기반)
      await fetchMe();

      // 3. 대시보드로 이동
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
        router.refresh();
      }
    } catch {
      alert("가입 처리 중 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  // 전체 동의 핸들러
  const handleAllAgree = (checked: boolean) => {
    setAgreed({ terms: checked, privacy: checked });
  };

  return (
    <div className="flex w-full flex-col gap-8 lg:flex-row">
      {/* [LEFT] 약관 내용 뷰어 */}
      <div className="flex-1 space-y-4">
        {/* 탭 버튼 */}
        <div className="flex gap-2 border-b border-border pb-1">
          <button
            onClick={() => setActiveTab("terms")}
            className={[
              "px-4 py-2 text-sm font-bold transition-colors",
              activeTab === "terms"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            이용약관
          </button>
          <button
            onClick={() => setActiveTab("privacy")}
            className={[
              "px-4 py-2 text-sm font-bold transition-colors",
              activeTab === "privacy"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            개인정보처리방침
          </button>
        </div>

        {/* 탭 내용 */}
        {activeTab === "terms" ? (
          <PolicyViewer data={TERMS_DATA} />
        ) : (
          <PolicyViewer data={PRIVACY_DATA} />
        )}
      </div>

      {/* [RIGHT] 가입 폼 */}
      <div className="flex w-full flex-col space-y-6 border-t border-border pt-6 lg:w-[350px] lg:shrink-0 lg:border-l lg:border-t-0 lg:pl-8">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Welcome
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            환영합니다!
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-bold text-foreground">{email}</span>{" "}
            계정으로
            <br />
            서비스를 시작합니다.
          </p>
        </div>

        <div className="space-y-4 border border-border bg-muted/40 p-5">
          {/* 전체 동의 체크박스 */}
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4 border-border accent-primary"
              checked={allAgreed}
              onChange={(e) => handleAllAgree(e.target.checked)}
            />
            <span className="text-sm font-bold text-foreground">
              약관에 모두 동의합니다
            </span>
          </label>

          <div className="h-px w-full bg-border/60" />

          {/* 개별 동의 체크박스 */}
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 border-border accent-primary"
              checked={agreed.terms}
              onChange={(e) =>
                setAgreed({ ...agreed, terms: e.target.checked })
              }
            />
            <span className="text-xs text-muted-foreground">
              (필수) 이용약관 동의
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 border-border accent-primary"
              checked={agreed.privacy}
              onChange={(e) =>
                setAgreed({ ...agreed, privacy: e.target.checked })
              }
            />
            <span className="text-xs text-muted-foreground">
              (필수) 개인정보 수집 및 이용 동의
            </span>
          </label>
        </div>

        <div className="pt-2">
          <PageCTA
            onClick={handleSignup}
            disabled={!allAgreed || loading}
            className="w-full"
          >
            {loading ? "가입 처리 중..." : "동의하고 가입하기"}
          </PageCTA>
          <p className="mt-4 text-[11px] text-center text-muted-foreground">
            위 &apos;동의하고 가입하기&apos;를 누르면 가입이 완료됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
