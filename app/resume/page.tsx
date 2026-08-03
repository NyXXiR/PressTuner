import type { Metadata } from "next";
import { ResumeHomeClient } from "./ResumeHomeClient";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.briefflow.com";
const canonical = `${SITE_URL}/resume`;

export const metadata: Metadata = {
  title: "자기소개서 AI · 자소서 AI · Cover Letter AI",
  description:
    "자기소개서 AI와 자소서 AI 도구. 이력서를 경험 브릭으로 정리하고 문항별 초안을 빠르게 만드는 Cover Letter AI 워크스페이스입니다.",
  keywords: [
    "자기소개서 AI",
    "자소서 AI",
    "cover letter ai",
    "ai cover letter builder",
    "resume ai",
    "자소서 작성 ai",
    "자기소개서 초안 ai",
  ],
  alternates: {
    canonical,
  },
  openGraph: {
    title: "자기소개서 AI",
    description:
      "이력서를 경험 브릭으로 분해하고 문항별 자소서 초안을 빠르게 만드는 자기소개서 AI",
    url: canonical,
    siteName: "brieFFlow",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/images/og_image.png",
        width: 1200,
        height: 630,
        alt: "brieFFlow resume AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cover Letter AI",
    description:
      "Turn resume experience into reusable bricks and generate tailored cover letter drafts with AI.",
    images: ["/images/og_image.png"],
  },
};

export default function ResumePage() {
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "brieFFlow Resume",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "AI cover letter and self-introduction writing workspace for structuring resume experience into reusable blocks.",
      url: canonical,
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
      <ResumeHomeClient />
    </>
  );
}
