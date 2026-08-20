import type { Metadata } from "next";
import Link from "next/link";

import { PressDemoHeaderStatus } from "@/components/demo/PressDemoHeaderStatus";
import { PressRagTestAuthGate } from "@/components/demo/PressRagTestAuthGate";
import { MarketingFooter } from "@/components/layout/MarketingFooter";

export const dynamic = "force-static";

const description =
  "로그인 없이도 Press AI 보도자료 작성 노드를 한 단계씩 실행하고 체크포인트, 전이 가드레일, 재시도를 비교하는 디버거입니다. 세션당 시작 횟수는 제한됩니다.";

export const metadata: Metadata = {
  title: { absolute: "Press AI 프로세스 디버거 | brieFFlow" },
  description,
  alternates: { canonical: "/demo/rag-test" },
  openGraph: {
    title: "brieFFlow Press AI 프로세스 디버거",
    description,
    url: "/demo/rag-test",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "brieFFlow Press AI 프로세스 디버거",
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
          <PressDemoHeaderStatus />
        </div>
      </header>

      <main>
        <section className="border-b border-border bg-muted/30">
          {/* Stacked while narrow: on one baseline row the description wrapped
              and left the summary stranded against the right edge. */}
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3 sm:px-6">
            <h1 className="text-xl font-black tracking-tight text-foreground">Press AI 프로세스 디버거</h1>
            <p className="text-sm text-muted-foreground">로그인하지 않아도 보도자료 작성 노드를 명시적으로 실행하고 저장된 체크포인트와 전이 판정을 점검합니다.</p>
            <details className="text-xs sm:ml-auto">
              <summary className="cursor-pointer font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">실행 조건과 데이터 범위</summary>
              <p className="mt-2 max-w-3xl leading-6 text-muted-foreground">로그인 없이도 공개 데모 시나리오를 실행할 수 있으며, 세션당 시작 횟수가 제한됩니다. 로그인하면 시도 히스토리와 케이스 저장·분기 기능을 함께 사용할 수 있습니다. 공개 시나리오는 고정 근거 문서만 사용하며 고객 Article이나 제품 할당량을 소모하지 않습니다.</p>
            </details>
          </div>
        </section>

        <PressRagTestAuthGate />
      </main>
      <MarketingFooter />
    </div>
  );
}
