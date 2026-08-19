import type { Metadata } from "next";
import Link from "next/link";

import { SITE_URL } from "@/lib/site-url";
const canonical = `${SITE_URL}/cover-letter-ai`;

export const metadata: Metadata = {
  title: "자기소개서 AI · 자소서 AI · Cover Letter AI",
  description:
    "자기소개서 AI로 경험을 정리하고 문항별 자소서 초안을 빠르게 만드세요. 경험 브릭 재사용, 질문별 소재 매칭, cover letter draft 생성 흐름을 한 번에 제공합니다.",
  keywords: [
    "자기소개서 AI",
    "자소서 AI",
    "cover letter ai",
    "ai cover letter builder",
    "자기소개서 초안 ai",
    "cover letter generator",
    "job application ai writer",
    "자소서 작성 ai",
    "지원동기 ai 작성",
  ],
  alternates: { canonical },
  openGraph: {
    title: "자기소개서 AI · 자소서 AI · Cover Letter AI",
    description:
      "경험을 브릭으로 정리하고 문항별 자기소개서 초안을 빠르게 만드는 brieFFlow Resume 안내 페이지",
    url: canonical,
    siteName: "brieFFlow",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/images/og_image.png",
        width: 1200,
        height: 630,
        alt: "brieFFlow cover letter AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "자기소개서 AI · Cover Letter AI",
    description:
      "Turn resume experience into reusable material and draft tailored cover letters faster.",
    images: ["/images/og_image.png"],
  },
};

export default function Page() {
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "brieFFlow Resume",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: canonical,
      inLanguage: ["ko", "en"],
      description:
        "AI workspace for structuring resume experience into reusable blocks and generating tailored self-introduction drafts.",
      featureList: [
        "경험 브릭 정리",
        "문항별 소재 매칭",
        "자기소개서 초안 생성",
        "지원서별 재사용 흐름",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "자기소개서 AI는 어떤 단계에서 가장 도움이 되나요?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "경험은 많은데 문항별로 어떤 소재를 꺼내야 할지 막히는 초안 단계에서 가장 도움이 됩니다. 질문에 맞는 경험을 골라 첫 문서를 만드는 시간이 크게 줄어듭니다.",
          },
        },
        {
          "@type": "Question",
          name: "cover letter generator와 무엇이 다른가요?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "단순히 한 편의 문장을 생성하는 것이 아니라, 이력서 경험을 재사용 가능한 브릭으로 정리하고 회사별 질문에 맞춰 다시 조합하는 흐름을 제공합니다.",
          },
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Cover Letter AI", item: canonical },
      ],
    },
  ];

  return (
    <>
      {structuredData.map((entry, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
        />
      ))}

      <main className="mx-auto max-w-5xl px-6 py-20">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-primary">Cover Letter AI</p>
        <h1 className="mt-4 text-4xl font-black tracking-tight">
          자기소개서 AI로 경험을 정리하고 문항별 초안을 만드세요
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
          brieFFlow Resume은 자기소개서 AI 워크스페이스입니다. 이력서 경험을 재사용 가능한 브릭으로 정리하고,
          지원 문항에 맞는 조합으로 자소서 초안을 빠르게 만들 수 있습니다. 자기소개서 AI, 자소서 AI,
          cover letter AI, cover letter generator를 찾는 사용자가 실제로 겪는 문제는 문장 생성보다 경험 정리와
          질문별 재구성에 더 가깝습니다.
        </p>

        <section className="mt-12 grid gap-5 md:grid-cols-2">
          <article className="border border-border/60 bg-card/40 p-7">
            <h2 className="text-xl font-bold">이런 문항에 잘 맞습니다</h2>
            <ul className="mt-4 space-y-3 leading-7 text-muted-foreground">
              <li>지원동기와 입사 후 포부를 빠르게 초안화해야 할 때</li>
              <li>협업, 문제 해결, 도전 경험을 문항별로 다시 풀어야 할 때</li>
              <li>여러 회사 지원서를 같은 경험으로 반복 작성해야 할 때</li>
              <li>cover letter draft를 영문 검색 의도로 찾고 있을 때</li>
            </ul>
          </article>
          <article className="border border-border/60 bg-card/40 p-7">
            <h2 className="text-xl font-bold">자기소개서 AI가 해주는 일</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              경험 추출, 문항별 소재 매칭, 초안 생성, 지원서별 재사용 정리까지 자기소개서 작성에 필요한 흐름을
              하나로 묶어 제공합니다. 빈 화면에서 처음 쓰는 부담을 줄이는 데 초점이 있습니다.
            </p>
          </article>
        </section>

        <section className="mt-12 border border-border/60 bg-card/40 p-8">
          <h2 className="text-2xl font-bold">자기소개서 AI 워크플로우</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <article className="border border-border/50 bg-background/40 p-5">
              <h3 className="font-semibold">1. 경험 브릭 정리</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">프로젝트, 역할, 성과, 배운 점을 재사용 가능한 단위로 정리합니다.</p>
            </article>
            <article className="border border-border/50 bg-background/40 p-5">
              <h3 className="font-semibold">2. 문항과 소재 연결</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">지원 회사의 질문에 맞는 경험 브릭을 고르고, 빠진 맥락을 보완합니다.</p>
            </article>
            <article className="border border-border/50 bg-background/40 p-5">
              <h3 className="font-semibold">3. 초안 생성</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">문항 길이와 목적에 맞는 자기소개서 초안을 먼저 만들고, 이후 표현을 다듬습니다.</p>
            </article>
            <article className="border border-border/50 bg-background/40 p-5">
              <h3 className="font-semibold">4. 지원서별 재사용</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">같은 경험을 회사마다 다른 강조점으로 재조립해 여러 지원서에 반복 활용합니다.</p>
            </article>
          </div>
        </section>

        <section className="mt-12 grid gap-5 md:grid-cols-2">
          <article className="border border-border/60 bg-card/40 p-7">
            <h2 className="text-xl font-bold">단순 생성기와 다른 점</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              일반 cover letter generator는 완성 문장 한 편을 바로 뽑는 데 가깝습니다. brieFFlow Resume은 먼저 경험을 자산으로 정리하고,
              회사와 문항이 바뀌어도 다시 조합할 수 있게 설계된 점이 다릅니다.
            </p>
          </article>
          <article className="border border-border/60 bg-card/40 p-7">
            <h2 className="text-xl font-bold">영문 검색에도 맞는 표현</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              This page also speaks to searches like cover letter AI, AI cover letter builder, cover letter generator, and job application AI writer.
              The emphasis is on reusable experience material, not just one-off text generation.
            </p>
          </article>
        </section>

        <section className="mt-12 border border-border/60 bg-card/40 p-8">
          <h2 className="text-2xl font-bold">FAQ</h2>
          <div className="mt-6 space-y-5 text-muted-foreground">
            <article>
              <h3 className="font-semibold text-foreground">자소서 AI는 어떤 단계에서 가장 도움이 되나요?</h3>
              <p className="mt-2 leading-7">경험은 많은데 문항에 맞는 사례를 꺼내 쓰기 어려운 초안 단계에서 가장 도움이 됩니다. 무엇을 써야 할지 막힐 때 첫 방향을 잡아 줍니다.</p>
            </article>
            <article>
              <h3 className="font-semibold text-foreground">cover letter generator를 찾는 사용자에게도 맞나요?</h3>
              <p className="mt-2 leading-7">맞습니다. 특히 여러 지원서에 같은 경험을 다른 방식으로 재활용해야 하는 사용자라면, 단일 생성기보다 브릭 기반 워크플로우가 더 실용적일 수 있습니다.</p>
            </article>
          </div>
        </section>

        <section className="mt-12 border border-primary/20 bg-primary/5 p-8">
          <h2 className="text-2xl font-bold">관련 페이지</h2>
          <div className="mt-5 flex flex-wrap gap-4">
            <Link className="font-semibold text-primary" href="/resume">Resume 메인</Link>
            <Link className="font-semibold text-primary" href="/resume/pricing">Resume 가격 안내</Link>
            <Link className="font-semibold text-primary" href="/press">보도자료 AI 페이지</Link>
          </div>
        </section>
      </main>
    </>
  );
}
