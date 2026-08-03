// app/business/page.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page/PageHeader";
import { PageCTA } from "@/components/page/PageCTA";

type Row = { label: string; value: string; copy?: boolean };

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="ml-2 inline-flex items-center border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 900);
        } catch {
          // clipboard 권한이 막힌 경우 대비(조용히 무시)
        }
      }}
      aria-label="복사"
    >
      {copied ? "복사됨" : "복사"}
    </button>
  );
}

function InfoTable({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section>
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      <div className="mt-3 border-t-2 border-foreground">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex flex-col gap-1 border-b border-border px-1 py-4 sm:flex-row sm:items-start"
          >
            <div className="sm:w-44 text-xs font-bold text-muted-foreground">
              {r.label}
            </div>
            <div className="flex-1 text-sm leading-relaxed break-words text-foreground">
              {r.value}
              {r.copy && <CopyButton value={r.value} />}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function BusinessPage() {
  const businessRows: Row[] = [
    { label: "상호명", value: "미어캣스튜디오", copy: true },
    { label: "대표자", value: "임규훈", copy: true },
    { label: "사업자등록번호", value: "195-32-01837", copy: true },
    { label: "과세유형", value: "간이과세자", copy: true },
    {
      label: "사업장주소",
      value:
        "서울특별시 양천구 목동동로 430, 615동 301호(목동, 목동신시가지아파트)",
      copy: true,
    },
  ];

  const supportRows: Row[] = [
    { label: "연락처", value: "010-2032-0334", copy: true },
    { label: "이메일", value: "lgh0334@gmail.com", copy: true },
  ];

  return (
    <div className="wongoji-sharp mx-auto w-full max-w-5xl pb-20 pt-8 sm:pt-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          eyebrow="Business Info"
          title="사업자정보"
          description="결제/문의/정책 확인을 위한 사업자 필수정보입니다."
        />
        <PageCTA href="/" variant="secondary">
          홈으로
        </PageCTA>
      </header>

      <div className="mt-8 space-y-8">
        <InfoTable title="사업자 정보" rows={businessRows} />
        <InfoTable title="고객센터" rows={supportRows} />
      </div>

      <div className="mt-8 flex flex-wrap gap-2 border-t-2 border-foreground pt-5">
        <Link
          href="/terms"
          className="inline-flex h-9 items-center border border-border bg-card px-4 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          이용약관
        </Link>
        <Link
          href="/privacy"
          className="inline-flex h-9 items-center border border-border bg-card px-4 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          개인정보처리방침
        </Link>
        <Link
          href="/policy/service"
          className="inline-flex h-9 items-center border border-border bg-card px-4 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          서비스 제공기간
        </Link>
        <Link
          href="/policy/refund"
          className="inline-flex h-9 items-center border border-border bg-card px-4 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          교환/환불/취소 규정
        </Link>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        © {new Date().getFullYear()} brieFFlow. All rights reserved.
      </p>
    </div>
  );
}
