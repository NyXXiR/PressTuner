import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import { promisify } from "node:util";

type HiringPageExtractor = {
  key: string;
  matches: (url: URL) => boolean;
  extract: (url: URL) => Promise<string>;
};

type GenericFetchSnapshot = {
  status: number;
  html: string;
  readableText: string;
  merged: string;
  title: string;
};

type CollectionPolicy = "accept-raw" | "browser-render" | "reject";

const execFileAsync = promisify(execFile);
const WINDOWS_EDGE_POWERSHELL_PATH =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const WINDOWS_EDGE_EXECUTABLE_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe",
];

export const HIRING_URL_FALLBACK_MESSAGE =
  "URL 해석에 문제가 있습니다. 채용 정보를 텍스트로 입력하거나 관리자에게 문의해 주세요.";

function decodeHtml(text: string) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function cleanText(text: string) {
  return decodeHtml(text)
    .replace(/\r/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToReadableText(html: string) {
  return cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(p|div|li|tr|section|article|h1|h2|h3|h4|h5|h6)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanText(match[1]) : "";
}

function extractMetaContent(html: string, name: string) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([\\s\\S]*?)["'][^>]+(?:name|property)=["']${name}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return cleanText(match[1]);
  }

  return "";
}

function extractJsonLdText(html: string) {
  const matches = Array.from(
    html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  );

  const parts: string[] = [];

  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        const type = item?.["@type"];
        if (type !== "JobPosting") continue;

        parts.push(
          [
            item.title ? `공고명: ${item.title}` : null,
            item.hiringOrganization?.name
              ? `기업명: ${item.hiringOrganization.name}`
              : null,
            item.employmentType ? `고용형태: ${item.employmentType}` : null,
            item.validThrough ? `마감일: ${item.validThrough}` : null,
            item.jobLocation?.address?.addressLocality
              ? `근무지: ${item.jobLocation.address.addressLocality}`
              : null,
            item.description
              ? `공고 내용:\n${htmlToReadableText(String(item.description))}`
              : null,
            item.qualifications
              ? `자격 요건:\n${htmlToReadableText(String(item.qualifications))}`
              : null,
            item.responsibilities
              ? `주요 업무:\n${htmlToReadableText(String(item.responsibilities))}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
    } catch {
      continue;
    }
  }

  return parts.join("\n\n").trim();
}

function extractScriptCandidateText(html: string) {
  const matches = Array.from(html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi));
  const parts: string[] = [];
  const keywords = [
    "jobNoticeName",
    "companyName",
    "jobTitle",
    "jobPosting",
    "qualForAppInfo",
    "requiredItem",
    "preferredItem",
    "question",
    "introduce",
    "recruit",
  ];

  for (const match of matches) {
    const script = match[1];
    if (!script || script.length > 150000) continue;
    if (!keywords.some((keyword) => script.includes(keyword))) continue;

    const compact = cleanText(
      script
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\u003c/g, "<")
        .replace(/\\u003e/g, ">")
        .replace(/\\u0026/g, "&")
        .replace(/<\/?[^>]+>/g, " ")
        .replace(/[{}[\],]/g, " "),
    );

    if (compact.length >= 120) {
      parts.push(compact.slice(0, 4000));
    }

    if (parts.length >= 2) break;
  }

  return parts.join("\n\n").trim();
}

function buildReadableHiringText(html: string) {
  const title = extractTitle(html);
  const description =
    extractMetaContent(html, "description") ||
    extractMetaContent(html, "og:description");
  const jsonLd = extractJsonLdText(html);
  const visibleText = htmlToReadableText(html);
  const scriptCandidates =
    visibleText.length < 300 ? extractScriptCandidateText(html) : "";

  return [
    title ? `페이지 제목: ${title}` : null,
    description ? `페이지 요약: ${description}` : null,
    jsonLd || null,
    visibleText || null,
    scriptCandidates || null,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000)
    .trim();
}

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function looksLikeShellPage(html: string, readableText: string) {
  const shellSignals = [
    /__next_f/i,
    /__NEXT_DATA__/i,
    /id=["']root["']/i,
    /id=["']__next["']/i,
    /Loading/i,
    /hydrate/i,
  ];

  const hiringSignals = [
    /채용/i,
    /공고/i,
    /자격/i,
    /우대/i,
    /주요 업무/i,
    /지원하기/i,
    /question/i,
    /job/i,
  ];

  return (
    countMatches(html, shellSignals) >= 2 &&
    readableText.length < 1200 &&
    countMatches(readableText, hiringSignals) < 4
  );
}

function shouldUseBrowserFallback(html: string, readableText: string, merged: string) {
  if (merged.length < 160) return true;
  if (looksLikeShellPage(html, readableText)) return true;
  if (readableText.length < 500 && /<script/i.test(html)) return true;
  return false;
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; brieFFlowResumeIntake/1.0; +https://www.briefflow.com)",
    },
    cache: "no-store",
  });

  const html = await response.text();

  return {
    status: response.status,
    ok: response.ok,
    html,
  };
}

function looksLikeErrorDocument(title: string, html: string, merged: string) {
  const errorSignals = [
    /application error/i,
    /client-side exception/i,
    /internal server error/i,
    /something went wrong/i,
    /unexpected error/i,
    /error occurred/i,
    /temporarily unavailable/i,
  ];

  const combined = [title, merged.slice(0, 2000), html.slice(0, 4000)].join("\n");
  return errorSignals.some((pattern) => pattern.test(combined));
}

function selectCollectionPolicy(snapshot: GenericFetchSnapshot): CollectionPolicy {
  const { status, html, readableText, merged, title } = snapshot;
  const meaningfulLength = merged.length;
  const hasEnoughContent = meaningfulLength >= 160;
  const errorDocument = looksLikeErrorDocument(title, html, merged);

  if (errorDocument) {
    return "browser-render";
  }

  if (status >= 500 && !hasEnoughContent) {
    return "browser-render";
  }

  if (shouldUseBrowserFallback(html, readableText, merged)) {
    return "browser-render";
  }

  if (meaningfulLength >= 80) {
    return "accept-raw";
  }

  return "reject";
}

function isWslRuntime() {
  return process.platform === "linux" && os.release().toLowerCase().includes("microsoft");
}

async function resolveWindowsEdgeExecutable() {
  const candidates =
    process.platform === "win32"
      ? WINDOWS_EDGE_EXECUTABLE_CANDIDATES.filter((candidate) => candidate.includes(":\\"))
      : isWslRuntime()
        ? WINDOWS_EDGE_EXECUTABLE_CANDIDATES.filter((candidate) => candidate.startsWith("/mnt/"))
        : WINDOWS_EDGE_EXECUTABLE_CANDIDATES;

  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("Windows Edge executable not found");
}

function escapePowerShellSingleQuoted(value: string) {
  return value.replace(/'/g, "''");
}

async function fetchBrowserRenderedHtml(url: string) {
  await resolveWindowsEdgeExecutable();

  const command = [
    `& '${escapePowerShellSingleQuoted(WINDOWS_EDGE_POWERSHELL_PATH)}'`,
    "--headless=new",
    "--disable-gpu",
    "--virtual-time-budget=15000",
    "--dump-dom",
    `'${escapePowerShellSingleQuoted(url)}'`,
  ].join(" ");

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-Command", command],
    {
      timeout: 30000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  return stdout.trim();
}

async function extractGenericText(url: URL) {
  const { status, html } = await fetchHtml(url.toString());
  const readableText = htmlToReadableText(html);
  const merged = buildReadableHiringText(html);
  const title = extractTitle(html);

  return {
    status,
    html,
    readableText,
    merged,
    title,
  };
}

async function extractLgCareersText(url: URL) {
  const jobNoticeId = url.searchParams.get("id");

  if (!jobNoticeId) {
    throw new Error("LG Careers 공고 ID를 찾을 수 없습니다.");
  }

  const response = await fetch(
    "https://api.careers.lg.com/rmk/job/retrieveJobNoticesDetail",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jobNoticeId }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("LG Careers 공고 API를 불러오지 못했습니다.");
  }

  const json = await response.json();
  if (json?.status !== "S" || !json?.data?.jobNoticesDetail) {
    throw new Error("LG Careers 공고 내용을 읽을 수 없습니다.");
  }

  const detail = json.data.jobNoticesDetail.jobNoticesDetail ?? {};
  const sectors = Array.isArray(json.data.jobNoticesDetail.recList)
    ? json.data.jobNoticesDetail.recList
    : [];

  const sectorText = sectors
    .map((sector: Record<string, unknown>, index: number) =>
      [
        `[포지션 ${index + 1}]`,
        sector.orgName ? `조직: ${sector.orgName}` : null,
        sector.jobGroupName ? `직무: ${sector.jobGroupName}` : null,
        sector.locationName ? `근무지: ${sector.locationName}` : null,
        sector.detailContext ? `주요 업무:\n${sector.detailContext}` : null,
        sector.requiredItem
          ? `자격 요건:\n${htmlToReadableText(String(sector.requiredItem))}`
          : null,
        sector.preferredItem
          ? `우대 사항:\n${htmlToReadableText(String(sector.preferredItem))}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  return cleanText(
    [
      `기업명: ${detail.companyName ?? ""}`,
      `공고명: ${detail.jobNoticeName ?? ""}`,
      `직무: ${detail.jobGroupSh ?? ""}`,
      detail.recStartDate || detail.recEndDate
        ? `접수기간: ${detail.recStartDate ?? ""} ~ ${detail.recEndDate ?? ""}`
        : null,
      detail.qualForAppInfo ? `지원 자격:\n${detail.qualForAppInfo}` : null,
      detail.recProcessInfo ? `전형 절차:\n${detail.recProcessInfo}` : null,
      detail.submitMethodInfo ? `지원 방법:\n${detail.submitMethodInfo}` : null,
      detail.otherInfo ? `기타 안내:\n${detail.otherInfo}` : null,
      sectorText || null,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
}

async function extractBrowserRenderedText(url: URL) {
  const html = await fetchBrowserRenderedHtml(url.toString());
  const merged = buildReadableHiringText(html);

  if (merged.length < 80) {
    throw new Error(HIRING_URL_FALLBACK_MESSAGE);
  }

  return merged;
}

const SITE_ADAPTERS: HiringPageExtractor[] = [
  {
    key: "lg-careers",
    matches: (url) =>
      url.hostname === "careers.lg.com" && url.pathname === "/apply/detail",
    extract: extractLgCareersText,
  },
];

export async function fetchHiringPageText(url: string) {
  try {
    const parsedUrl = new URL(url);
    const siteAdapter = SITE_ADAPTERS.find((candidate) => candidate.matches(parsedUrl));

    if (siteAdapter) {
      return await siteAdapter.extract(parsedUrl);
    }

    const snapshot = await extractGenericText(parsedUrl);
    const policy = selectCollectionPolicy(snapshot);

    if (policy === "accept-raw") {
      return snapshot.merged;
    }

    if (policy === "browser-render") {
      try {
        return await extractBrowserRenderedText(parsedUrl);
      } catch {
        if (snapshot.merged.length >= 80 && !looksLikeErrorDocument(snapshot.title, snapshot.html, snapshot.merged)) {
          return snapshot.merged;
        }
        throw new Error(HIRING_URL_FALLBACK_MESSAGE);
      }
    }

    throw new Error(HIRING_URL_FALLBACK_MESSAGE);
  } catch (error: any) {
    if (error?.message === HIRING_URL_FALLBACK_MESSAGE) {
      throw error;
    }
    throw new Error(HIRING_URL_FALLBACK_MESSAGE);
  }
}
