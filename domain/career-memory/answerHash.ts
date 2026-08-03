import { createHash } from "node:crypto";

export function canonicalizeCareerAnswer(answer: string) {
  return answer
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .replace(/\n+$/g, "");
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashCareerAnswer(answer: string) {
  return sha256(canonicalizeCareerAnswer(answer));
}

export function hashCareerRetrievalQuery(parts: readonly string[]) {
  return sha256(
    parts.map((part) => part.trim()).filter(Boolean).join("\n"),
  );
}
