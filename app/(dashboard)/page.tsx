import type { Metadata } from "next";
import { BriefFlowLandingPage } from "@/components/marketing/BriefFlowLandingPage";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.briefflow.com";

export const metadata: Metadata = {
  title: "brieFFlow · 보도자료 AI와 자기소개서 AI",
  description:
    "brieFFlow는 보도자료 AI와 자기소개서 AI를 한곳에서 제공하는 문서 작성 워크스페이스입니다. 목적에 맞는 트랙에서 초안을 빠르게 시작하세요.",
  keywords: [
    "brieFFlow",
    "보도자료 AI",
    "자기소개서 AI",
    "자소서 AI",
    "보도자료 작성 AI",
    "press release ai",
    "press release ai writer",
    "cover letter ai",
    "ai press release generator",
    "홍보팀 AI",
    "브리프 ai",
  ],
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "brieFFlow · 보도자료 AI와 자기소개서 AI",
    description:
      "보도자료와 자기소개서 초안을 목적에 맞는 AI 트랙에서 빠르게 시작하세요.",
    url: SITE_URL,
    siteName: "brieFFlow",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/images/og_image.png",
        width: 1200,
        height: 630,
        alt: "brieFFlow press release AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "brieFFlow document AI",
    description:
      "Start press releases and cover letter drafts from the right AI document track.",
    images: ["/images/og_image.png"],
  },
};

export default function Page() {
  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "brieFFlow",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "AI document workspace for press release drafting and cover letter writing.",
    url: SITE_URL,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
      />
      <BriefFlowLandingPage />
    </>
  );
}
