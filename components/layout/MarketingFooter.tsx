// components/layout/MarketingFooter.tsx
"use client";

import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-background/60">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6">
        {/* 링크 영역 */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-muted-foreground">
          <Link className="hover:underline" href="/terms">
            이용약관
          </Link>
          <span className="opacity-50">·</span>
          <Link className="hover:underline" href="/privacy">
            개인정보처리방침
          </Link>
          <span className="opacity-50">·</span>
          <Link className="hover:underline" href="/policy/service">
            서비스 제공기간
          </Link>
          <span className="opacity-50">·</span>
          <Link className="hover:underline" href="/policy/refund">
            교환/환불/취소 규정
          </Link>
          <span className="opacity-50">·</span>
          <Link className="hover:underline" href="/business">
            사업자정보
          </Link>
          <span className="opacity-50">·</span>
          <Link className="hover:underline" href="/press">
            보도자료 AI
          </Link>
          <span className="opacity-50">·</span>
          <Link className="hover:underline" href="/cover-letter-ai">
            자기소개서 AI
          </Link>
        </div>

        {/* 사업자 정보 */}
        <div className="mt-3 text-xs text-muted-foreground leading-relaxed">
          <div>
            상호명: 미어캣스튜디오 · 대표자: 임규훈 · 사업자등록번호:
            195-32-01837
          </div>

          <div className="mt-1">
            주소: 서울특별시 양천구 목동동로 430, 615동 301호(목동,
            목동신시가지아파트)
          </div>

          <div className="mt-1">
            연락처: 010-2032-0334 · 이메일:{" "}
            <a className="hover:underline" href="mailto:lgh0334@gmail.com">
              lgh0334@gmail.com
            </a>
          </div>

          {/* 필요 시(이니시스 요청 시) 아래 한 줄만 추가 */}
          {/* <div className="mt-1">통신판매신고번호: 20XX-서울OO-XXXX</div> */}
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          © {new Date().getFullYear()} brieFFlow. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
