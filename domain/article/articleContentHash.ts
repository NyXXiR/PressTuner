import { createHash } from "node:crypto";

export type CanonicalArticleContent = {
  title: string;
  bodyJson: unknown;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function serializeCanonicalArticleContent(
  article: CanonicalArticleContent,
): string {
  return JSON.stringify(
    canonicalize({
      title: article.title,
      bodyJson: article.bodyJson ?? null,
    }),
  );
}

export function hashArticleContent(article: CanonicalArticleContent): string {
  return createHash("sha256")
    .update(serializeCanonicalArticleContent(article))
    .digest("hex");
}
