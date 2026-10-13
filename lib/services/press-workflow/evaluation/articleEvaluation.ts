import { z } from "zod";
import { hash } from "../../../../domain/press-workflow/evaluation/contracts";
import { qualityMetricSchema, qualityRequestSchema, type QualitySnapshot, type QualityKind, type QualityRuntime,
  type MetricDefinition, type QualityMetric, type QualityReservation, type QualityRun, type QualityRunView, type QualityStatus } from "../../../../domain/press-workflow/evaluation/article-evaluation";
import { serviceError } from "../../serviceError";

export type QualityRepository = {
  list(articleId: string): Promise<QualityRun[]>;
  find(articleId: string, id: string): Promise<QualityRun | null>;
  reserve(value: QualityReservation): Promise<{ run: QualityRun; created: boolean }>;
  record(id: string, result: QualityMetric): Promise<void>;
  finish(id: string, status: QualityStatus): Promise<QualityRun>;
};
export type ArticleEvaluationPorts = {
  load(articleId: string, userId: string): Promise<QualitySnapshot>;
  runtime(kind: QualityKind): Promise<QualityRuntime>;
  measure(metric: MetricDefinition, snapshot: QualitySnapshot, profile: QualityRuntime["profile"]): Promise<QualityMetric>;
  repository: QualityRepository;
};
export function qualityRunView(run: QualityRun, snapshot: QualitySnapshot): QualityRunView {
  const { snapshot: saved, idempotencyKey: _key, requestHash: _hash, createdById: _actor, teamId: _team, ...rest } = run;
  void _key; void _hash; void _actor; void _team;
  return { ...rest, output: saved.input.output, contextCount: saved.facts.length, freshness: run.fingerprint === snapshot.fingerprint ? "CURRENT" : "STALE" };
}
export async function readArticleEvaluationHistory(articleId: string, userId: string, ports: ArticleEvaluationPorts) {
  const snapshot = await ports.load(articleId, userId);
  const history = await ports.repository.list(articleId);
  return { snapshot, history: history.map(r => qualityRunView(r, snapshot)) };
}
export async function executeArticleEvaluation(articleId: string, userId: string, requestValue: unknown, ports: ArticleEvaluationPorts): Promise<QualityRunView> {
  const request = qualityRequestSchema.parse(requestValue);
  const snapshot = await ports.load(articleId, userId);
  if (snapshot.reason) throw serviceError(422, "QUALITY_INPUT_UNAVAILABLE", snapshot.reason);
  if (snapshot.input.output !== request.expectedOutput) throw serviceError(409, "DRAFT_CHANGED", "화면의 원고와 저장된 원고가 다릅니다. 저장 후 다시 실행해 주세요.");
  const runtime = await ports.runtime(request.kind), profile = runtime.profile, profileHash = hash(profile);
  let reused: QualityMetric[] = [];
  if (request.retryOfId) {
    const previous = await ports.repository.find(articleId, request.retryOfId);
    if (!previous || previous.status === "RUNNING" || previous.fingerprint !== snapshot.fingerprint || previous.profileHash !== profileHash)
      throw serviceError(409, "RETRY_IDENTITY_MISMATCH", "종료된 평가의 동일 원고·근거·평가 설정에서만 실패 항목을 다시 실행할 수 있습니다.");
    reused = previous.results.filter(r => r.state !== "FAILED").map(r => ({ ...r, reusedFromRunId: previous.id }));
  }
  // A disabled/missing runtime must not reserve a paid attempt. History remains readable.
  if (!runtime.available) throw serviceError(503, "QUALITY_RUNTIME_UNAVAILABLE", runtime.reason ?? "평가 환경을 사용할 수 없습니다.");
  const reservation = await ports.repository.reserve({ articleId, teamId: snapshot.teamId, createdById: userId,
    kind: request.kind, idempotencyKey: request.idempotencyKey, fingerprint: snapshot.fingerprint, profileHash,
    requestHash: hash({ fingerprint: snapshot.fingerprint, profileHash, kind: request.kind, retryOfId: request.retryOfId ?? null }),
    snapshot, profile, results: reused, retryOfId: request.retryOfId ?? null });
  if (!reservation.created) return qualityRunView(reservation.run, await ports.load(articleId, userId));
  const outcomes = await Promise.allSettled(profile.metrics.filter(m => !reused.some(r => r.id === m.id)).map(async metric => {
    let result: QualityMetric;
    const started = performance.now();
    if (!metric.applicable) result = { ...metric, state: "NOT_APPLICABLE", score: null, reasonCode: null, thresholdPassed: null, elapsedMs: 0, usage: null };
    else {
      try {
        result = qualityMetricSchema.parse(await ports.measure(metric, structuredClone(snapshot), structuredClone(profile)));
        if (result.id !== metric.id || result.framework !== metric.framework || result.metric !== metric.metric || result.version !== metric.version || result.threshold !== metric.threshold || result.applicable !== metric.applicable || result.reusedFromRunId)
          throw new Error("INVALID_RESULT");
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const reasonCode = message === "TIMEOUT" || message === "NO_CLAIMS" || message === "INVALID_RESULT" ? message : error instanceof z.ZodError ? "INVALID_RESULT" : "PROVIDER_ERROR";
        const usage = qualityMetricSchema.shape.usage.safeParse((error as { usage?: unknown })?.usage);
        result = { ...metric, state: "FAILED", score: null, reason: null, reasonCode, thresholdPassed: null,
          elapsedMs: performance.now() - started, usage: usage.success ? usage.data : null };
      }
    }
    // Durable per-metric writes survive a later provider error or interrupted request.
    await ports.repository.record(reservation.run.id, result);
    return result;
  }));
  if (outcomes.some(r => r.status === "rejected")) throw serviceError(503, "QUALITY_SAVE_FAILED", "평가 결과 저장을 확인하지 못했습니다. 이력을 새로 확인해 주세요. 같은 요청을 다시 보내도 중복 실행하지 않습니다.");
  const results = [...reused, ...outcomes.flatMap(r => r.status === "fulfilled" ? [r.value] : [])];
  const completed = results.filter(r => r.state === "COMPLETED").length, failed = results.some(r => r.state === "FAILED");
  const run = await ports.repository.finish(reservation.run.id, failed ? completed ? "PARTIAL" : "FAILED" : "COMPLETED");
  // Revoked access never receives saved source text or results after external calls.
  return qualityRunView(run, await ports.load(articleId, userId));
}
