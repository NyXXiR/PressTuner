import type { VerifiableSource } from "./claimSpanVerification";

export function splitExactSourceSentences(value: string) {
  const sentences: string[] = [];
  for (const rawLine of value.split(/\r?\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let start = 0;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (![".", "!", "?"].includes(character)) continue;
      if (character === "." && /\d/.test(line[index - 1] ?? "") && /\d/.test(line[index + 1] ?? "")) continue;
      const sentence = line.slice(start, index + 1).trim();
      if (sentence) sentences.push(sentence);
      start = index + 1;
    }
    const remainder = line.slice(start).trim();
    if (remainder) sentences.push(remainder);
  }
  return sentences;
}

export function buildExtractiveVerificationFallback(args: Readonly<{
  prompt: string;
  sources: readonly VerifiableSource[];
}>) {
  const requestedIdentifiers = [...new Set(
    args.prompt.match(/(?:PT-(?:CAREER|PRESS)-\d+|CE-(?:PDFKIT|PDFLIB)-\d+)/gi) ?? [],
  )].map((value) => value.toUpperCase());
  if (requestedIdentifiers.length === 0) return null;
  const selected = requestedIdentifiers.map((identifier) => ({
    identifier,
    source: args.sources.find(({ content }) => content.toUpperCase().includes(identifier)),
  }));
  if (selected.some(({ source }) => !source)) return null;
  const uniqueSources = [...new Map(selected.map(({ source }) => [source!.sourceId, source!])).values()];
  const claims: Array<{
    id: string;
    text: string;
    evidence: Array<{ sourceId: string; quote: string }>;
  }> = [];
  for (const source of uniqueSources) {
    const sentences = splitExactSourceSentences(source.content);
    const required = requestedIdentifiers.filter((identifier) => source.content.toUpperCase().includes(identifier));
    const selectedSentences = sentences.filter((sentence) => required.some((identifier) => sentence.toUpperCase().includes(identifier)));
    const evidenceSentences = selectedSentences.length > 0 ? selectedSentences : sentences.slice(0, 1);
    for (const sentence of evidenceSentences) {
      claims.push({
        id: `extractive-${claims.length + 1}`,
        text: sentence,
        evidence: [{ sourceId: source.sourceId, quote: sentence }],
      });
    }
  }
  if (claims.length === 0) return null;
  return {
    summary: "생성형 답변이 검증을 통과하지 못해 요청 식별자가 확인된 원문 문장으로 대체했습니다.",
    answer: claims.map(({ text }) => text).join("\n"),
    sourceIds: uniqueSources.map(({ sourceId }) => sourceId),
    cannotAnswer: false,
    claims,
  };
}
