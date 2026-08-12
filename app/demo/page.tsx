import type { Metadata } from "next";
import Link from "next/link";

import { BriefFlowProductDemo } from "@/components/demo/BriefFlowProductDemo";
import { MarketingFooter } from "@/components/layout/MarketingFooter";

const description =
  "오류가 있는 보도자료 초안을 PDF 페이지 단위 근거 검증으로 확인하고, BLOCK을 수정한 뒤 출처 맵과 함께 완료하는 brieFFlow 데모입니다.";

export const metadata: Metadata = {
  title: {
    absolute: "제품 데모 | brieFFlow",
  },
  description,
  alternates: {
    canonical: "/demo",
  },
  openGraph: {
    title: "brieFFlow 제품 데모",
    description,
    url: "/demo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "brieFFlow 제품 데모",
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background/95">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="text-lg font-black tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            brieFFlow
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">
              로그인 없는 보도자료 근거 검증 데모
            </span>
            <Link
              href="/login"
              className="border border-border px-4 py-2 text-sm font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              로그인
            </Link>
          </div>
        </div>
      </header>
      <BriefFlowProductDemo />
      <MarketingFooter />
    </div>
  );
}
