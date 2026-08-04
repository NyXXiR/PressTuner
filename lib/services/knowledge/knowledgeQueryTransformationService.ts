import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

import {
  buildKnowledgeQueryPlan,
  type KnowledgeQueryPlan,
} from "@/domain/knowledge/retrievalPipeline";
import type { PressKnowledgeRetrievalConfiguration } from "@/domain/knowledge/retrievalRuntime";

const rewriteSchema = z.object({ query: z.string().min(1).max(500) }).strict();

type ModelUsage = Readonly<{ inputTokens: number; outputTokens: number; costMicros: number }>;
export type KnowledgeQueryRewriter = (query: string) => Promise<string | Readonly<{ query: string; usage: ModelUsage }>>;

async function defaultRewrite(query: string) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.parse({
    model: "gpt-4.1-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Rewrite only the user's knowledge-search query for retrieval. Never add tenant, role, document, authorization, or access-control filters.",
      },
      { role: "user", content: query },
    ],
    response_format: zodResponseFormat(rewriteSchema, "knowledge_query_rewrite"),
  });
  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) throw new Error("KNOWLEDGE_QUERY_REWRITE_EMPTY");
  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;
  return {
    query: parsed.query,
    usage: {
      inputTokens,
      outputTokens,
      costMicros: Math.ceil(inputTokens * 0.4 + outputTokens * 1.6),
    },
  };
}

export async function transformKnowledgeQuery(args: Readonly<{
  query: string;
  configuration: PressKnowledgeRetrievalConfiguration;
  rewrite?: KnowledgeQueryRewriter;
}>): Promise<KnowledgeQueryPlan> {
  if (
    args.configuration.queryTransformation === "DETERMINISTIC_NORMALIZATION" ||
    args.configuration.queryTransformation === "IDENTIFIER_AWARE_NORMALIZATION"
  ) {
    return buildKnowledgeQueryPlan({
      query: args.query,
      mode: args.configuration.queryTransformation,
    });
  }
  const rewritten = await (args.rewrite ?? defaultRewrite)(args.query.trim());
  const rewrittenQuery = typeof rewritten === "string" ? rewritten : rewritten.query;
  return {
    ...buildKnowledgeQueryPlan({
      query: args.query,
    mode: "MODEL_REWRITE",
    rewrittenQuery,
    model: "gpt-4.1-mini",
    }),
    usage: typeof rewritten === "string" ? null : rewritten.usage,
  };
}
