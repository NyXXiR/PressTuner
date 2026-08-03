type ParagraphLike = string | { text?: string | null; importance?: number };

export type CanonicalArticleParts = {
  lead?: string | null;
  fact?: string | null;
  paragraphs?: readonly ParagraphLike[] | null;
  closing?: string | null;
  rawInput?: string | null;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function buildCanonicalArticlePlain(parts: CanonicalArticleParts) {
  const paragraphs = (parts.paragraphs ?? [])
    .map((paragraph) =>
      clean(typeof paragraph === "string" ? paragraph : paragraph.text),
    )
    .filter(Boolean);
  const plain = [
    clean(parts.lead),
    clean(parts.fact),
    ...paragraphs,
    clean(parts.closing),
  ]
    .filter(Boolean)
    .join("\n\n");
  return plain || clean(parts.rawInput);
}

export function normalizeEditedPlainForPersistence(plain: string) {
  return {
    lead: null,
    fact: null,
    paragraphs: plain
      .split(/\n{2,}/)
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ text, importance: 0 })),
    closing: "",
  };
}
