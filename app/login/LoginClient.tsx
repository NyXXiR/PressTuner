"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import Image from "next/image"; // ✅ 이미지 사용을 위해 추가
import {
  ChevronRight,
  ArrowLeft,
  AlertCircle,
  Sparkles,
  User,
  Lock,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { trackGaEvent } from "@/lib/analytics/ga4";

// Google SVG Icon
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LoginClient() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTestForm, setShowTestForm] = useState(false);

  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const redirectUrl = nextParam && nextParam.startsWith("/") ? nextParam : "/";
  const isResumeRedirect = redirectUrl.startsWith("/resume");
  const backHref = isResumeRedirect ? "/resume" : "/";
  const backLabel = isResumeRedirect ? "자기소개서 AI로 돌아가기" : "메인으로 돌아가기";
  const introLine = isResumeRedirect
    ? "자기소개서 초안을 이어서 시작하세요"
    : "팀의 톤앤매너를 완성하는";
  const detailLine = isResumeRedirect
    ? "경험과 문항을 안전하게 불러옵니다"
    : "가장 스마트한 AI 에디터";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    trackGaEvent("login_started", {
      method: "email",
      next_path: redirectUrl,
    });

    try {
      // 실제 로그인 로직 (예시)
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data?.message ?? data?.error ?? "로그인에 실패했습니다.");
      } else {
        trackGaEvent("login_completed", {
          method: "email",
          next_path: redirectUrl,
        });
        window.location.href = redirectUrl;
      }
    } catch (err) {
      console.error(err);
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    trackGaEvent("login_started", {
      method: "google",
      next_path: redirectUrl,
    });
    window.location.href = `/api/auth/google/start?next=${encodeURIComponent(
      redirectUrl,
    )}`;
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-background overflow-hidden text-foreground selection:bg-primary/20">
      {/* 배경 조명 효과 */}
      <div className="absolute top-0 left-1/2 -z-10 h-[600px] w-full max-w-[1000px] -translate-x-1/2 -translate-y-20 opacity-[0.15] dark:opacity-20 [background:radial-gradient(circle_at_center,hsl(var(--primary))_0,transparent_70%)]" />
      <div className="absolute bottom-0 right-0 -z-10 h-[400px] w-[400px] opacity-[0.1] blur-[100px] bg-blue-500/30" />

      <div className="w-full max-w-[420px] px-6 z-10">
        {/* 뒤로가기 링크 */}
        <Link
          href={backHref}
          className="mb-6 inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
        >
          <div className="mr-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/50 border border-border/50 group-hover:border-primary/50 transition-colors">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          </div>
          {backLabel}
        </Link>

        {/* 메인 카드 (Glass Style) */}
        <div className="relative overflow-hidden border border-white/10 dark:border-white/10 bg-card/40 backdrop-blur-md p-8">
          {/* 헤더 섹션 */}
          <div className="text-center mb-8">
            {/* 상단 아이콘 포인트 */}
            <div className="inline-flex h-12 w-12 items-center justify-center bg-primary/10 border border-primary/20 mb-6">
              <Sparkles className="h-6 w-6 text-primary fill-primary/10" />
            </div>

            {/* ✅ [수정됨] 텍스트 대신 로고 이미지 배치 */}
            <div className="relative h-10 w-[180px] mx-auto mb-4">
              {/* 🌞 라이트 모드용 (검은 로고) */}
              <Image
                src="/favicon/logo_black.png"
                alt="brieFFlow"
                fill
                sizes="180px"
                priority
                className="object-contain logo-light"
              />
              {/* 🌙 다크 모드용 (흰 로고) */}
              <Image
                src="/favicon/logo_white.png"
                alt="brieFFlow"
                fill
                sizes="180px"
                priority
                className="object-contain logo-dark"
              />
            </div>

            {/* 서브텍스트 */}
            <p className="text-sm text-muted-foreground leading-relaxed">
              {introLine} <br />
              {detailLine}
            </p>
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="relative flex h-12 w-full items-center justify-center gap-3 border border-border/60 bg-background/50 hover:bg-background/80 hover:border-primary/30 active:scale-[0.98] transition-all duration-200 group"
            >
              <GoogleIcon className="h-5 w-5 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium">
                Google 계정으로 시작하기
              </span>
            </button>
          </div>

          {/* 구분선 및 테스트 계정 토글 */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <button
                onClick={() => setShowTestForm(!showTestForm)}
                className="bg-background/80 px-3 py-1 border border-border/60 text-muted-foreground hover:text-primary hover:border-primary/30 transition-all text-[11px] font-semibold tracking-wider backdrop-blur-sm"
              >
                {showTestForm ? "테스트 계정 닫기" : "이메일 로그인"}
              </button>
            </div>
          </div>

          {showTestForm && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground ml-1">
                      아이디
                    </label>
                    <div className="relative group/input">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within/input:text-primary/70 transition-colors">
                        <User className="h-4 w-4" />
                      </div>
                      <input
                        type="text"
                        className="w-full h-11 pl-10 pr-3 border border-border/60 bg-background/50 text-sm placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        placeholder="ID"
                        value={loginId}
                        onChange={(e) => setLoginId(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground ml-1">
                      비밀번호
                    </label>
                    <div className="relative group/input">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within/input:text-primary/70 transition-colors">
                        <Lock className="h-4 w-4" />
                      </div>
                      <input
                        type="password"
                        className="w-full h-11 pl-10 pr-3 border border-border/60 bg-background/50 text-sm placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !loginId || !password}
                  className="w-full h-11 bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 mt-2"
                >
                  {loading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <>
                      로그인
                      <ChevronRight className="h-4 w-4 opacity-80" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          © {new Date().getFullYear()} brieFFlow. All rights reserved.
        </p>
      </div>
    </div>
  );
}
