import type { Metadata } from "next";
import Link from "next/link";

import { PressRagTestDemo } from "@/components/demo/PressRagTestDemo";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { loadPressRagDemo } from "@/lib/services/evaluation/loadPressRagDemo";

export const dynamic = "force-static";

const description =
  "승인된 synthetic controlled-live 기록을 단계별로 편집하고 로컬에서 결정론적으로 재평가하는 brieFFlow RAG 실행 워크플로 샌드박스입니다.";

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

export default async function PressRagTestPage() {
  const viewModel = await loadPressRagDemo();
  // clip, not hidden: `overflow-x: hidden` makes this a scroll container and would break
  // the debugger's sticky verdict header.
  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <header className="border-b border-border/60 bg-background/95">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-lg font-black tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            brieFFlow
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">공개 설명 · 로그인 후 실제 실행</span>
            <Link href="/login" className="border border-border px-4 py-2 text-sm font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              로그인
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* The workflow is the page. The title states what this is in one line and the
            replay conditions stay available without pushing the graph below the fold. */}
        <section className="border-b border-border bg-muted/30">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 sm:px-6">
            <h1 className="text-xl font-black tracking-tight text-foreground">RAG 실행 워크플로 디버거</h1>
            <p className="text-sm text-muted-foreground">로그인한 팀은 실제 AI 실행을 관찰할 수 있고, 아래 고급 로컬 예제는 API 호출 없이 재평가할 수 있습니다.</p>
            <details className="ml-auto text-xs">
              <summary className="cursor-pointer font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">재생 조건과 데이터 출처</summary>
              <p className="mt-2 max-w-3xl leading-6 text-muted-foreground">실제 실행과 실행 기록은 로그인 및 현재 팀 컨텍스트가 필요하고 기존 Press 사용량을 사용합니다. 고급 로컬 예제만 승인된 synthetic 데이터로 동작하며 모델 호출이나 저장을 수행하지 않습니다.</p>
            </details>
          </div>
        </section>

        <PressRagTestDemo viewModel={viewModel} />
      </main>
      <MarketingFooter />
    </div>
  );
}
