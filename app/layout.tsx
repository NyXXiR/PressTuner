import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { GlobalLoadingOverlay } from "@/components/ui/GlobalLoadingOverlay";
import { GoogleAnalytics } from "@next/third-parties/google";
import Toaster from "@/components/ui/Toaster";
import { ClientPageTitle } from "@/components/common/ClientPageTitle";
import { PostHogProvider } from "@/components/analytics/PostHogProvider";
import { getPostHogClientConfig } from "@/lib/server/posthog-config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.briefflow.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "brieFFlow | 보도자료 AI · 자기소개서 AI",
    template: "%s | brieFFlow",
  },
  description:
    "보도자료 AI, 자기소개서 AI, 자소서 AI 워크스페이스. 팀 문체에 맞는 초안 작성과 커리어 문서 초안 생성을 빠르게 진행합니다.",
  keywords: [
    "보도자료 AI",
    "보도자료 작성 AI",
    "press release ai",
    "press release ai writer",
    "자기소개서 AI",
    "자소서 AI",
    "cover letter ai",
    "스타트업 보도자료 작성",
    "자기소개서 초안 AI",
    "팀 문체 맞춤 글쓰기",
  ],
  verification: {
    google: "9RD_KbVTPsXmu3krkNMw_8z3CScA7ztiHZy70niy0I4",
  },
  openGraph: {
    title: "brieFFlow | 보도자료 AI · 자기소개서 AI",
    description:
      "보도자료 AI와 자기소개서 AI 도구. 팀 문체와 목적에 맞춰 초안을 빠르게 만드는 AI",
    url: SITE_URL,
    siteName: "brieFFlow",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/images/og_image.png",
        width: 1200,
        height: 630,
        alt: "brieFFlow Preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "brieFFlow | 보도자료 AI · Cover Letter AI",
    description:
      "Press release drafting and cover letter drafting with AI, tuned for team tone and fast first drafts.",
    images: ["/images/og_image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon/favicon.ico" },
    ],
    apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/favicon/site.webmanifest",
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const posthogConfig = getPostHogClientConfig();

  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <PostHogProvider
          apiKey={posthogConfig.apiKey}
          apiHost={posthogConfig.apiHost}
          productArea="briefflow"
        >
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
            <ClientPageTitle />
            <div className="pt-app-spotlight min-h-screen">
              {children}
              <GlobalLoadingOverlay />
              <Toaster />
            </div>
            <GoogleAnalytics gaId="G-Q3BK044558" />
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
