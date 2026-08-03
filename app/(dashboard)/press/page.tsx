import type { Metadata } from "next";
import { PressLandingPage } from "@/components/marketing/PressLandingPage";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.briefflow.com";
const canonical = `${SITE_URL}/press`;

export const metadata: Metadata = {
  title: "보도자료 AI · Press Release AI Writer",
  description:
    "brieFFlow Press는 출시, 제휴, 행사 소식을 팀 톤에 맞는 보도자료 초안으로 빠르게 정리하는 보도자료 AI 워크스페이스입니다.",
  keywords: [
    "보도자료 AI",
    "보도자료 작성 AI",
    "press release ai",
    "press release ai writer",
    "ai press release generator",
    "홍보팀 AI",
    "브리프 ai",
  ],
  alternates: {
    canonical,
  },
  openGraph: {
    title: "보도자료 AI",
    description:
      "출시, 제휴, 행사 소식을 팀 톤에 맞는 보도자료 초안으로 빠르게 만드는 보도자료 AI",
    url: canonical,
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
    title: "Press Release AI Writer",
    description:
      "Turn launches, partnerships, and company updates into structured press release drafts with AI.",
    images: ["/images/og_image.png"],
  },
};

export default function PressPage() {
  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "brieFFlow Press",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "AI workspace for press release drafting, brief normalization, and team-tone writing.",
    url: canonical,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
      />
      <PressLandingPage />
    </>
  );
}
