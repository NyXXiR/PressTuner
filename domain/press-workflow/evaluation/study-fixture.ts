import { hash } from "./contracts";
import type { QualityRun } from "./article-evaluation";

export function fixtureRun(id: string, score = 1, articleId = id): QualityRun {
  const definition = { id: "FACTUAL_SUPPORT", framework: "DEEPEVAL", metric: "GEval", version: "4.2.8", threshold: .8, applicable: true, reason: null };
  const profile = { kind: "GEVAL" as const, model: "fixture", version: "v1", implementationHash: "fixture", metrics: [definition] };
  return { id, articleId, teamId: "team", createdById: "author", kind: "GEVAL", idempotencyKey: id, requestHash: id, fingerprint: id,
    profileHash: hash(profile), profile, status: "COMPLETED", createdAt: "2026-10-12T00:00:00Z", finishedAt: "2026-10-12T00:00:00Z", retryOfId: null,
    snapshot: { articleId, teamId: "team", ownerId: "author", fingerprint: id, reason: null, input: { request: "보도자료", output: `초안 ${id}`, contexts: [`근거 ${articleId}`] }, facts: [{ id: `f-${articleId}`, content: `근거 ${articleId}`, origin: "USER" }], groundingRevision: 1, corpusVersion: 1, generationVersion: "UNKNOWN" },
    results: [{ ...definition, state: "COMPLETED", score, thresholdPassed: score >= .8, elapsedMs: 0, usage: null, reasonCode: null, reason: "hidden automatic rationale" }] };
}
