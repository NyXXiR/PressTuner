type EnvLike = {
  NODE_ENV?: string;
  ENABLE_DEV_API_PLAYGROUND?: string;
};

type GeneratedArticleLike = {
  lead?: unknown;
  fact?: unknown;
  paragraphs?: unknown;
  closing?: unknown;
};

export type PressApiQualityCheck = {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
};

export function isDevPressApiPlaygroundEnabled(
  env: EnvLike = process.env,
) {
  return (
    env.NODE_ENV !== "production" ||
    env.ENABLE_DEV_API_PLAYGROUND === "true"
  );
}

export function assertDevPressApiPlaygroundEnabled() {
  if (isDevPressApiPlaygroundEnabled()) return;
  const error = new Error("NOT_FOUND") as Error & { status?: number };
  error.status = 404;
  throw error;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildGeneratedPlain(value: GeneratedArticleLike) {
  const paragraphs = Array.isArray(value.paragraphs)
    ? value.paragraphs
        .map((item) =>
          item && typeof item === "object" && "text" in item
            ? text((item as { text?: unknown }).text)
            : "",
        )
        .filter(Boolean)
    : [];
  return [
    text(value.lead),
    text(value.fact),
    ...paragraphs,
    text(value.closing),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function evaluatePressDraftQuality(
  plain: string,
): PressApiQualityCheck[] {
  const requiredPhrases = ["20곳", "150분", "50분", "단순 평균", "대조군"];
  return [
    ...requiredPhrases.map((phrase) => ({
      id: `contains-${phrase}`,
      label: `‘${phrase}’ 보존`,
      pass: plain.includes(phrase),
      detail: plain.includes(phrase) ? "본문에 있음" : "본문에서 찾지 못함",
    })),
    {
      id: "external-verification",
      label: "외부 검증 제한 보존",
      pass: /외부.*검증|검증.*않/.test(plain),
      detail: /외부.*검증|검증.*않/.test(plain)
        ? "제한 문구가 있음"
        : "제한 문구를 찾지 못함",
    },
    {
      id: "no-seoul-hq",
      label: "‘서울 기반’을 ‘서울 본사’로 강화하지 않음",
      pass: !plain.includes("서울 본사"),
      detail: plain.includes("서울 본사")
        ? "근거 없는 ‘서울 본사’ 표현 발견"
        : "강화 표현 없음",
    },
  ];
}

