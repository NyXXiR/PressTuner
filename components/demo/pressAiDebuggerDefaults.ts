/**
 * The memo the create form pre-fills. Shared so the attempt history can tell
 * "operator typed this" apart from "operator kept the sample": every attempt
 * made with the default otherwise shows the same excerpt and stops being a
 * useful label.
 */
export const DEFAULT_MEMO =
  "픽셔널 기업 브리프랩은 2031년 4월 17일 ‘루멘 브릿지’를 출시할 예정이다. 비공개 베타에는 20곳이 참여했고, 작업 시간은 150분에서 50분으로 줄었다. 이는 단순 평균이며 대조군이 없고 외부 검증을 거치지 않았다.";

/** Mirrors summarizeCheckpointAttemptHistory's excerpt rule (60 chars + ellipsis). */
const MEMO_EXCERPT_LIMIT = 60;

function excerptOf(text: string) {
  const flattened = text.replace(/\s+/g, " ").trim();
  return flattened.length > MEMO_EXCERPT_LIMIT
    ? `${flattened.slice(0, MEMO_EXCERPT_LIMIT)}…`
    : flattened;
}

const DEFAULT_MEMO_EXCERPT = excerptOf(DEFAULT_MEMO);

export function isDefaultMemoExcerpt(excerpt: string | undefined) {
  return Boolean(excerpt) && excerpt === DEFAULT_MEMO_EXCERPT;
}
