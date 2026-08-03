import { createHash } from "node:crypto";

import { z } from "zod";

const versionRef = z.object({ version: z.string().min(1) }).strict();

export const agentConfigurationIdentitySchema = z
  .object({
    model: versionRef,
    prompt: versionRef,
    embedding: versionRef,
    chunking: versionRef,
    retrieval: versionRef,
    reranking: versionRef,
    toolset: versionRef,
    runtimePolicy: versionRef,
    evaluator: versionRef,
  })
  .strict();

export type AgentConfigurationIdentity = z.infer<
  typeof agentConfigurationIdentitySchema
>;

function sortForCanonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForCanonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortForCanonicalJson(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortForCanonicalJson(value));
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function identifyAgentConfiguration(input: unknown) {
  const identity = agentConfigurationIdentitySchema.parse(input);
  const contentHash = sha256Canonical(identity);
  return { id: `cfg_${contentHash}`, contentHash, identity } as const;
}
