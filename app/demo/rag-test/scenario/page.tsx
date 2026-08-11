import type { Metadata } from "next";
import Link from "next/link";

import { PressAiScenarioDemo } from "@/components/demo/PressAiScenarioDemo";
import { MarketingFooter } from "@/components/layout/MarketingFooter";

export const dynamic = "force-static";

const description =
  "보도자료 작성의 다섯 노드를 실패, 입력 수정, 재시도, 리뷰 반복까지 로그인 없이 직접 실행하는 결정론적 Press AI 시나리오입니다.";

export const metadata: Metadata = {
  title: { absolute: "Press AI 실행 시나리오 | brieFFlow" },
  description,
  alternates: { canonical: "/demo/rag-test/scenario" },
  openGraph: {
    title: "brieFFlow Press AI 실행 시나리오",
    description,
    url: "/demo/rag-test/scenario",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "brieFFlow Press AI 실행 시나리오",
    description,
  },
  robots: { index: true, follow: true },
};

export default function PressAiScenarioPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <header className="border-b border-border/60 bg-background/95">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-lg font-black tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            brieFFlow
          </Link>
          <p className="break-words text-xs font-semibold leading-5 text-muted-foreground sm:text-right">
            로그인 없음 · API/AI/저장/할당량 사용 없음
          </p>
        </div>
      </header>

      <main>
        <PressAiScenarioDemo />
      </main>
      <MarketingFooter />
    </div>
  );
}
