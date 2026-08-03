type ReviewNote = {
  quote?: unknown;
  note?: unknown;
  type?: unknown;
  sourceFactIds?: unknown;
};

export type ActionableReviewNote = {
  quote: string;
  note: string;
  type?: unknown;
  sourceFactIds?: unknown;
};

function normalize(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function isNoOpReplacement(note: string) {
  const quoted = [...note.matchAll(/['"“”‘’]([^'"“”‘’]+)['"“”‘’]/g)].map(
    (match) => normalize(match[1]),
  );
  return quoted.length >= 2 && quoted[0] === quoted[1];
}

export function filterActionableReviewNotes(
  plain: string,
  notes: readonly ReviewNote[],
): ActionableReviewNote[] {
  const seen = new Set<string>();
  return notes.filter((candidate): candidate is ActionableReviewNote => {
    if (
      typeof candidate.quote !== "string" ||
      typeof candidate.note !== "string"
    ) {
      return false;
    }
    const quote = normalize(candidate.quote);
    const note = normalize(candidate.note);
    if (!quote || !note || !plain.includes(candidate.quote)) return false;
    if (isNoOpReplacement(note) || normalize(note) === quote) return false;
    const key = `${quote}\u0000${note}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
