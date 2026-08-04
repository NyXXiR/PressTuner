import type { Metadata } from "next";
import Link from "next/link";

import { PressRagTestDemo } from "@/components/demo/PressRagTestDemo";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { loadPressRagDemo } from "@/lib/services/evaluation/loadPressRagDemo";

export const dynamic = "force-static";

const description =
  "승인된 synthetic controlled-live 기록으로 RAG 검색, 답변 유보, 인용과 주장 검증을 비교하는 brieFFlow 공개 데모입니다.";

export const metadata: Metadata = {
  title: { absolute: "RAG 기록 비교 데모 | brieFFlow" },
  description,
  alternates: { canonical: "/demo/rag-test" },
  openGraph: {
    title: "brieFFlow RAG 기록 비교 데모",
    description,
    url: "/demo/rag-test",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "brieFFlow RAG 기록 비교 데모",
    description,
  },
  robots: { index: true, follow: true },
};

export default async function PressRagTestPage() {
  const viewModel = await loadPressRagDemo();
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
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
        <section className="border-b border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Approved controlled-live replay</p>
            <h1 className="mt-3 max-w-4xl text-3xl font-black tracking-tight text-foreground sm:text-5xl">RAG 동작을 기록으로 검토합니다</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">검색, 근거 기반 답변, 답변 유보, 상충 자료, 프롬프트 주입 방어를 같은 승인 데이터에서 비교합니다.</p>
            <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 p-5">
              <p className="text-base font-black text-foreground">새 요청을 실행하지 않고, 승인된 controlled-live 기록을 재생합니다.</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">모든 자료는 synthetic 데이터입니다. 이 페이지는 모델, API, 데이터베이스를 호출하지 않으며 저장이나 상태 변경을 수행하지 않습니다.</p>
            </div>
          </div>
        </section>

        <PressRagTestDemo viewModel={viewModel} />
      </main>
      <MarketingFooter />
    </div>
  );
}
