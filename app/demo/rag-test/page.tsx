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
            <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">로그인 없는 기록 재생 데모</span>
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
            <p className="text-sm text-muted-foreground">승인된 controlled-live 기록의 변경값만 브라우저에서 로컬 판정합니다. 새 검색, 답변 생성, 모델/API 호출은 없습니다.</p>
            <details className="ml-auto text-xs">
              <summary className="cursor-pointer font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">재생 조건과 데이터 출처</summary>
              <p className="mt-2 max-w-3xl leading-6 text-muted-foreground">모든 자료는 승인된 synthetic 데이터입니다. 이 페이지는 모델, API, 데이터베이스를 호출하지 않으며 저장, 승인, 상태 변경을 수행하지 않습니다. 기록 실행 참조는 Ops Console UUID나 공급자 추적 ID가 아니며 서로 조인할 수 없습니다.</p>
            </details>
          </div>
        </section>

        <PressRagTestDemo viewModel={viewModel} />
      </main>
      <MarketingFooter />
    </div>
  );
}
