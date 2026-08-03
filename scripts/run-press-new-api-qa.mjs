import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { config as loadDotEnv } from "dotenv";
import { chromium } from "playwright";

loadDotEnv({ path: resolve(process.cwd(), ".env"), override: true });

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const baseUrl = option("--base-url", "http://localhost:3003").replace(/\/$/, "");
const outputPath = option("--output", "");
const qaSecret = process.env.AI_QA_AUTH_SECRET?.trim();
assert.ok(qaSecret, "AI_QA_AUTH_SECRET is required. Configure local QA auth first.");

const memo = [
  "프레스튜너는 기업 홍보팀을 위한 AI 보도자료 편집 서비스 ‘브리핑플로우 프레스 3.0’을 2026년 10월 6일 출시한다.",
  "2026년 8월 국내 스타트업 홍보팀 20곳을 대상으로 비공개 테스트를 진행했다.",
  "보도자료 한 건의 평균 초안 작성 시간은 150분에서 50분으로 줄었다.",
  "이 수치는 참여 팀이 직접 기록한 작업 시간의 단순 평균이며 외부 기관의 검증을 거치지 않았고 대조군을 두지 않았다.",
  "프레스튜너는 서울에 기반을 둔 B2B 소프트웨어 기업이다.",
  "김민서 대표는 ‘문장 작성 시간을 줄이고 사실 판단에 집중하도록 설계했다’고 말했다.",
].join("\n");

const report = {
  startedAt: new Date().toISOString(),
  baseUrl,
  articleId: null,
  endpoints: [],
  qualityChecks: [],
  outputs: {},
};

function quality(name, pass, detail) {
  report.qualityChecks.push({ name, pass: Boolean(pass), detail });
}

async function parse(response, name, expectedStatus = 200) {
  const startedAt = Date.now();
  const body = await response.json().catch(async () => ({
    raw: await response.text().catch(() => ""),
  }));
  report.endpoints.push({
    name,
    status: response.status(),
    ok: response.status() === expectedStatus,
    elapsedMs: Date.now() - startedAt,
  });
  assert.equal(
    response.status(),
    expectedStatus,
    `${name} returned ${response.status()}: ${JSON.stringify(body)}`,
  );
  return body;
}

const issueResponse = await fetch(`${baseUrl}/api/auth/qa/issue`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${qaSecret}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ next: "/press/new" }),
});
const issueBody = await issueResponse.json().catch(() => null);
report.endpoints.push({
  name: "QA 로그인 티켓 발급",
  status: issueResponse.status,
  ok: issueResponse.status === 201,
});
assert.equal(
  issueResponse.status,
  201,
  `QA auth issue failed: ${JSON.stringify(issueBody)}`,
);
assert.ok(issueBody?.loginUrl, "QA auth issue response has no loginUrl");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const loginResponse = await page.goto(issueBody.loginUrl, {
    waitUntil: "networkidle",
  });
  assert.equal(loginResponse?.status(), 200, "QA login redirect did not reach a page");
  report.endpoints.push({
    name: "QA 로그인 세션 생성",
    status: loginResponse.status(),
    ok: true,
  });

  const init = await parse(
    await page.request.post(`${baseUrl}/api/articles/init`, {
      data: { type: "PRESS_RELEASE" },
    }),
    "보도자료 문서 초기화",
  );
  const articleId = init.articleId ?? init.id;
  assert.ok(articleId, "init response has no articleId");
  report.articleId = articleId;

  const normalized = await parse(
    await page.request.post(
      `${baseUrl}/api/articles/${articleId}/brief/normalize`,
      {
        data: { rawText: memo, tone: "formal", quotaMode: "simplified" },
      },
    ),
    "브리프 정규화",
  );
  assert.equal(normalized.ok, true);
  assert.ok(normalized.announceType);
  assert.ok(Array.isArray(normalized.points));
  const pointText = normalized.points.join(" ");
  for (const [field, value] of Object.entries({
    serviceName: normalized.serviceName,
    oneLiner: normalized.oneLiner,
    quoteWho: normalized.quoteWho,
    quoteMessage: normalized.quoteMessage,
  })) {
    quality(`정규화 ${field} 추출`, Boolean(value?.trim?.()), value || "비어 있음");
  }
  quality(
    "정규화 측정 조건 보존",
    ["단순 평균", "대조군"].every((term) => pointText.includes(term)) &&
      /외부.*검증|검증.*않/.test(pointText),
    pointText,
  );

  const generated = await parse(
    await page.request.post(`${baseUrl}/api/articles/${articleId}/generate`, {
      data: {
        serviceName: normalized.serviceName || "",
        announceType: normalized.announceType,
        oneLiner: normalized.oneLiner || "",
        points: normalized.points,
        quoteWho: normalized.quoteWho || "",
        quoteMessage: normalized.quoteMessage || "",
        eventAt: normalized.eventAt || undefined,
        publishAt: normalized.publishAt || undefined,
        tone: "formal",
        rawText: memo,
        quotaMode: "simplified",
      },
    }),
    "초안 생성",
  );
  const generatedPlain = [
    generated.lead,
    generated.fact,
    ...(generated.paragraphs ?? []).map((item) => item.text),
    generated.closing,
  ]
    .filter(Boolean)
    .join("\n\n");
  assert.ok(generated.title);
  assert.ok(generatedPlain);
  for (const phrase of ["20곳", "150분", "50분", "단순 평균", "대조군"]) {
    quality(`초안 '${phrase}' 보존`, generatedPlain.includes(phrase), phrase);
  }
  quality(
    "초안 외부 검증 제한 보존",
    /외부.*검증|검증.*않/.test(generatedPlain),
    "외부 검증 제한 문구",
  );
  quality(
    "서울 기반의 본사 강화 없음",
    !generatedPlain.includes("서울 본사"),
    generatedPlain.includes("서울 본사") ? "서울 본사 발견" : "강화 없음",
  );

  const polished = await parse(
    await page.request.post(`${baseUrl}/api/articles/${articleId}/polish`, {
      data: {
        title: generated.title,
        plain: generatedPlain,
        userInstruction:
          "수치의 측정 기준과 제한사항 누락, 근거보다 강해진 표현, 기사체를 점검해줘.",
        quotaMode: "simplified",
      },
    }),
    "AI 첨삭",
  );
  assert.ok(Array.isArray(polished.notes));
  quality("실행 가능한 첨삭 제안 존재", polished.notes.length > 0, `${polished.notes.length}개`);
  const noteKeys = new Set();
  for (const note of polished.notes) {
    const quote = note.quote || note.original || "";
    const replacement = note.replacement || note.suggestion || "";
    const key = `${quote}::${note.note || note.reason || ""}::${replacement}`;
    quality(
      `첨삭 제안 ${note.id} 유효성`,
      Boolean(note.id) &&
        (!quote || generatedPlain.includes(quote)) &&
        (!replacement || replacement !== quote) &&
        !noteKeys.has(key),
      key,
    );
    noteKeys.add(key);
  }
  assert.ok(polished.notes.length > 0, "polish returned no actionable notes");

  const rewritten = await parse(
    await page.request.post(`${baseUrl}/api/articles/${articleId}/re-polish`, {
      data: {
        selectedNoteIds: polished.notes.slice(0, 2).map((note) => note.id),
        userInstruction:
          "확정 사실과 모든 조건을 유지하며 선택한 제안만 반영해줘.",
        quotaMode: "simplified",
      },
    }),
    "선택 첨삭 재작성",
  );
  const revisedTitle = rewritten.revisedTitle ?? rewritten.title;
  const revisedPlain = rewritten.revisedPlain ?? rewritten.plain;
  assert.ok(revisedTitle);
  assert.ok(revisedPlain);
  for (const phrase of ["20곳", "150분", "50분", "단순 평균", "대조군"]) {
    quality(`재작성 '${phrase}' 보존`, revisedPlain.includes(phrase), phrase);
  }
  quality(
    "재작성 서울 본사 강화 없음",
    !revisedPlain.includes("서울 본사"),
    revisedPlain.includes("서울 본사") ? "서울 본사 발견" : "강화 없음",
  );

  await parse(
    await page.request.post(`${baseUrl}/api/articles/${articleId}/save`, {
      data: {
        title: revisedTitle,
        plain: revisedPlain,
        harnessAction: {
          type: "apply_pending_rewrite",
          appliedAt: new Date().toISOString(),
        },
      },
    }),
    "재작성 원고 저장",
  );

  const verification = await parse(
    await page.request.post(
      `${baseUrl}/api/articles/${articleId}/verification`,
      { data: {} },
    ),
    "최신 원고 검증",
  );
  assert.ok(["PASS", "WARN", "BLOCK"].includes(verification.verification?.result));
  const findings = verification.verification?.findings ?? [];
  quality(
    "검증 finding 한국어 표시",
    findings.every((finding) =>
      /[가-힣]/.test(`${finding.message || ""} ${finding.explanation || ""}`),
    ),
    `${findings.length}개 finding`,
  );

  const finalized = await parse(
    await page.request.patch(
      `${baseUrl}/api/articles/${articleId}/status`,
      { data: { status: "FINAL" } },
    ),
    "최종 완료",
  );
  assert.equal(finalized.status, "FINAL");

  const article = await parse(
    await page.request.get(`${baseUrl}/api/articles/${articleId}`),
    "완성 원고 조회",
  );
  assert.equal(article.article?.status, "FINAL");

  const usage = await parse(
    await page.request.get(`${baseUrl}/api/articles/usage`),
    "FREE 사용량 조회",
  );

  report.outputs = {
    normalizedBrief: {
      serviceName: normalized.serviceName,
      announceType: normalized.announceType,
      oneLiner: normalized.oneLiner,
      points: normalized.points,
      quoteWho: normalized.quoteWho,
      quoteMessage: normalized.quoteMessage,
      eventAt: normalized.eventAt,
      publishAt: normalized.publishAt,
    },
    generatedTitle: generated.title,
    revisedTitle,
    revisedPlain,
    verification: verification.verification,
    article: article.article,
    usage,
  };
  report.finishedAt = new Date().toISOString();
  report.ok = report.endpoints.every((entry) => entry.ok);
  report.qualityPassed = report.qualityChecks.every((check) => check.pass);
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.ok = false;
  report.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await browser.close();
  const rendered = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) {
    await writeFile(resolve(outputPath), rendered, "utf8");
  }
  process.stdout.write(rendered);
}
