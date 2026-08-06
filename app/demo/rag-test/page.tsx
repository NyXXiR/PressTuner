import type { Metadata } from "next";
import Link from "next/link";

import { PressRagLiveDebugger } from "@/components/demo/PressRagLiveDebugger";
import { MarketingFooter } from "@/components/layout/MarketingFooter";

export const dynamic = "force-static";

const description =
  "팀 문서를 직접 선택하고 실제 Press Agent의 검색, 근거 판단, 검증, 안전 대체 결과를 단계별로 확인하는 RAG 디버거입니다.";

export const metadata: Metadata = {
  title: { absolute: "RAG 실행 워크플로 디버거 | brieFFlow" },
  description,
  alternates: { canonical: "/demo/rag-test" },
  openGraph: {
    title: "brieFFlow RAG 실행 워크플로 디버거",
    description,
    url: "/demo/rag-test",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "brieFFlow RAG 실행 워크플로 디버거",
    description,
  },
  robots: { index: true, follow: true },
};

export default function PressRagTestPage() {
  // clip, not hidden: keep the page from becoming an extra horizontal scroll container.
  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <header className="border-b border-border/60 bg-background/95">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-lg font-black tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            brieFFlow
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">로그인 후 실제 실행</span>
            <Link href="/login" className="border border-border px-4 py-2 text-sm font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              로그인
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="border-b border-border bg-muted/30">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 sm:px-6">
            <h1 className="text-xl font-black tracking-tight text-foreground">RAG 실행 워크플로 디버거</h1>
            <p className="text-sm text-muted-foreground">현재 팀 문서를 명시적으로 마운트하고 실제 AI 실행의 저장된 단계별 입출력을 점검합니다.</p>
            <details className="ml-auto text-xs">
              <summary className="cursor-pointer font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">실행 조건과 데이터 범위</summary>
              <p className="mt-2 max-w-3xl leading-6 text-muted-foreground">실행과 기록 조회에는 로그인 및 현재 팀 컨텍스트가 필요하며 기존 Press 사용량 1회를 사용합니다. 선택한 준비 완료 문서만 검색 범위로 고정됩니다.</p>
            </details>
          </div>
        </section>

        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6"><PressRagLiveDebugger /></div>
      </main>
      <MarketingFooter />
    </div>
  );
}
