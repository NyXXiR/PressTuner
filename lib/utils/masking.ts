// utils/masking.ts
export function redactPII(input: string): string {
  let text = input;

  // 이메일
  text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]");

  // 한국 휴대폰/전화번호(대략 커버)
  // 010-1234-5678, 01012345678, 02-123-4567, 031-123-4567, 공백/점/하이픈/유니코드 대시 등
  text = text.replace(
    /\b(0\d{1,2})[-.\s\u2010-\u2015]?\d{3,4}[-.\s\u2010-\u2015]?\d{4}\b/g,
    "[PHONE]"
  );

  return text;
}
