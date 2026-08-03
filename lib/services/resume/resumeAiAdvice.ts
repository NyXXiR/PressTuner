// 서버는 문항별 AI 조언(aiAdvice)을 구 FocusStep 포맷인
// {"rationale": ..., "guideline": ...} JSON 문자열로 저장한다.
// 새 작성 플로우는 한 줄 조언 텍스트만 쓰므로 여기서 사람이 읽을 문장으로 정규화한다.
export function parseAiAdviceText(raw: string | null | undefined): string {
  const text = raw?.trim() ?? "";
  if (!text.startsWith("{")) return text;

  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return text;
    const { guideline, rationale } = parsed as {
      guideline?: unknown;
      rationale?: unknown;
    };
    if (typeof guideline === "string" && guideline.trim()) {
      return guideline.trim();
    }
    if (typeof rationale === "string" && rationale.trim()) {
      return rationale.trim();
    }
    return text;
  } catch {
    return text;
  }
}
