import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site-url";

type Entry = {
  path: string;
  lastModified: string;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
};

/**
 * 경로별 내용이 마지막으로 바뀐 날.
 *
 * 빌드 시각(`new Date()`)을 쓰면 배포할 때마다 모든 URL이 "오늘 수정됨"이 되고,
 * 구글은 신뢰할 수 없는 lastmod를 무시한다. 페이지를 실제로 고칠 때 이 날짜를 함께 올린다.
 */
const ENTRIES: Entry[] = [
  { path: "/", lastModified: "2026-08-03", changeFrequency: "daily", priority: 1 },
  { path: "/pricing", lastModified: "2026-08-03", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", lastModified: "2026-08-03", changeFrequency: "yearly", priority: 0.4 },
  { path: "/notices", lastModified: "2026-08-03", changeFrequency: "weekly", priority: 0.7 },
  { path: "/resume", lastModified: "2026-08-03", changeFrequency: "weekly", priority: 0.9 },
  { path: "/resume/pricing", lastModified: "2026-08-03", changeFrequency: "monthly", priority: 0.6 },
  { path: "/resume/about", lastModified: "2026-08-03", changeFrequency: "monthly", priority: 0.5 },
  { path: "/resume/contact", lastModified: "2026-08-03", changeFrequency: "yearly", priority: 0.4 },
  { path: "/cover-letter-ai", lastModified: "2026-08-03", changeFrequency: "weekly", priority: 0.9 },
  { path: "/press/pricing", lastModified: "2026-08-03", changeFrequency: "monthly", priority: 0.6 },
  { path: "/press/contact", lastModified: "2026-08-03", changeFrequency: "yearly", priority: 0.4 },
  { path: "/demo", lastModified: "2026-08-12", changeFrequency: "weekly", priority: 0.9 },
  { path: "/demo/rag-test", lastModified: "2026-08-11", changeFrequency: "weekly", priority: 0.85 },
  { path: "/demo/rag-test/scenario", lastModified: "2026-08-11", changeFrequency: "weekly", priority: 0.8 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return ENTRIES.map((entry) => ({
    url: new URL(entry.path, SITE_URL).toString(),
    lastModified: new Date(`${entry.lastModified}T00:00:00Z`),
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
