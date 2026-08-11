import OpenAI from "openai";

import type { PressRagCompleteJson } from "./pressRagScenarioService";

export class PressRagOpenAiConfigError extends Error {
  readonly code = "PRESS_RAG_OPENAI_UNAVAILABLE";
  readonly status = 503;
}

let client: OpenAI | null = null;

function openAiClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new PressRagOpenAiConfigError();
  return (client ??= new OpenAI({ apiKey, timeout: 45_000, maxRetries: 1 }));
}

export const completePublicPressRagJson: PressRagCompleteJson = async (request) => {
  const model =
    request.kind === "normalization" || request.kind === "draft"
      ? process.env.PT_BRIEF_MODEL || "gpt-4.1-mini"
      : process.env.PT_POLISH_MODEL || "gpt-4.1-mini";
  const completion = await openAiClient().chat.completions.create({
    model,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.prompt },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: request.maxOutputTokens,
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("PRESS_RAG_PROVIDER_EMPTY");
  return JSON.parse(content) as unknown;
};
