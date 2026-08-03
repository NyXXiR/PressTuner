import type { KnowledgeChunkRole } from "@prisma/client";

import { searchKnowledge } from "./knowledgeRetrievalService";

type Search = typeof searchKnowledge;

export async function loadKnowledgeContexts(
  args: { teamId: string; query: string; topK?: number },
  search: Search = searchKnowledge,
) {
  const load = (roles: KnowledgeChunkRole[]) =>
    search({ ...args, roles }).then((result) => result.context);
  const [facts, stylePolicy, styleExamples] = await Promise.all([
    load(["FACT"]),
    load(["STYLE_POLICY"]),
    load(["STYLE_EXAMPLE"]),
  ]);
  return {
    facts,
    stylePolicy,
    styleExamples: styleExamples
      ? [
          "NON-FACTUAL STYLE EXAMPLES: names, titles, dates, quotes, and numbers below are never evidence.",
          styleExamples,
        ].join("\n\n")
      : "",
  };
}
