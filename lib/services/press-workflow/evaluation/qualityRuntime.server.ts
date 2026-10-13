import "server-only";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { hash } from "../../../../domain/press-workflow/evaluation/contracts";
import { STANDARD_PROFILE } from "../../../../domain/press-workflow/evaluation/standard";
import { qualityMetricSchema, type QualityKind, type QualityRuntime } from "../../../../domain/press-workflow/evaluation/article-evaluation";
import { callDeepEval } from "../../../../scripts/press-workflow/deepeval-port";
import rubric from "../../../../scripts/press-workflow/deepeval/rubric.json";
import { standardConfiguration, standardRuntimeAvailability, standardRuntimePorts } from "./standardRuntime.server";
import { evaluateStandard } from "./standard";
import type { ArticleEvaluationPorts } from "./articleEvaluation";

const notApplicable: Record<string, string> = {
  REQUIRED_FACTS: "반드시 포함할 사실이 별도 지정되지 않았습니다. 채택한 사실 전체를 필수 항목으로 간주하지 않습니다.",
  STYLE_LEAKAGE: "이 초안의 생성에 사용한 문체 예시 기록이 없습니다.",
  REQUESTED_STYLE: "이 초안에 적용한 문체 요구사항 기록이 없습니다.",
};
export async function qualityRuntime(kind: QualityKind): Promise<QualityRuntime> {
  const config = standardConfiguration();
  const sourceRoot = process.env.PRESS_EVALUATION_ROOT || process.cwd();
  const model = kind === "STANDARD" ? config.model : process.env.PRESS_GEVAL_MODEL || "gpt-4.1-mini";
  const profile: QualityRuntime["profile"] = { kind, model, version: kind === "STANDARD" ? STANDARD_PROFILE.id : "press-article-geval/v1",
    implementationHash: "UNAVAILABLE", configuration: kind === "STANDARD" ? STANDARD_PROFILE : { rubric, inference: { temperature: 0, max_tokens: 1800 }, inputPolicy: "accepted-facts-only/v1" },
    metrics: kind === "STANDARD" ? STANDARD_PROFILE.metrics.map(m => ({ framework: m.framework, metric: m.metric, version: m.version, threshold: m.threshold, id: m.framework, applicable: true, reason: null }))
      : Object.keys(rubric.criteria).map(id => ({ id, framework: "DEEPEVAL", metric: "GEval", version: "4.2.8", threshold: rubric.threshold,
        applicable: !notApplicable[id], reason: notApplicable[id] ?? null })) };
  try {
    // Source files are explicitly included by next.config.ts for deployed hashes.
    const files = ["lib/services/press-workflow/evaluation/articleEvaluation.ts", "lib/services/press-workflow/evaluation/qualityRuntime.server.ts",
      "domain/press-workflow/evaluation/article-evaluation.ts", ...(kind === "STANDARD" ? [
        "lib/services/press-workflow/evaluation/standard.ts", "lib/services/press-workflow/evaluation/standardRuntime.server.ts",
        "scripts/press-workflow/ragas/evaluate.py", "scripts/press-workflow/ragas/requirements-lock.txt",
        "scripts/press-workflow/deepeval/faithfulness.py", "scripts/press-workflow/deepeval/requirements-lock.txt",
      ] : ["scripts/press-workflow/deepeval/evaluate.py", "scripts/press-workflow/deepeval/rubric.json",
        "scripts/press-workflow/deepeval/requirements-lock.txt", "scripts/press-workflow/deepeval-port.ts"])];
    profile.implementationHash = hash(await Promise.all(files.map(async file => {
      const sourcePath = resolve(sourceRoot, file);
      return { file, content: await readFile(/* turbopackIgnore: true */ sourcePath, "utf8") };
    })));
    if (kind === "STANDARD") return { ...await standardRuntimeAvailability(), profile };
    await access(/* turbopackIgnore: true */ config.deepeval);
  } catch { return { available: false, reason: "평가 실행 파일과 Python 환경을 서버에 준비해야 합니다.", profile }; }
  const enabled = process.env.PRESS_STANDARD_EVALUATION_ENABLED !== "false" && (process.env.NODE_ENV !== "production" || process.env.PRESS_STANDARD_EVALUATION_ENABLED === "true");
  return { profile, available: enabled && !!process.env.OPENAI_API_KEY, reason: !enabled ? "평가 기능이 활성화되지 않았습니다." : !process.env.OPENAI_API_KEY ? "평가 모델 연결이 설정되지 않았습니다." : null };
}

export const measureQualityMetric: ArticleEvaluationPorts["measure"] = async (metric, snapshot, profile) => {
  if (profile.kind === "STANDARD") {
    const result = await evaluateStandard(snapshot.input, standardRuntimePorts(profile.model), [metric.id as "RAGAS" | "DEEPEVAL"]);
    return qualityMetricSchema.parse({ ...metric, ...result.results[0] });
  }
  const config = standardConfiguration(), started = performance.now();
  const raw = await callDeepEval({ request: "채택한 사실을 근거로 보도자료 초안의 사실 근거와 과장 표현을 평가합니다.", draft: snapshot.input.output,
    facts: snapshot.facts.map(({ id, content }) => ({ id, content })), requiredFactIds: [], requestedStyle: "", styleExamples: "" }, profile.model, config.deepeval,
    { scriptPath: resolve(config.root, "scripts/press-workflow/deepeval/evaluate.py"), criteria: [metric.id] });
  const parsed = z.object({ checks: z.array(z.object({ criterion: z.string(), judgment: z.enum(["PASS", "FAIL", "UNCERTAIN"]),
    score: z.number().finite().min(0).max(1).optional(), reason: z.string(), errorCode: z.string().optional() })).length(1),
    usage: qualityMetricSchema.shape.usage }).parse(raw);
  const check = parsed.checks[0];
  if (check.criterion !== metric.id) throw Object.assign(new Error("INVALID_RESULT"), { usage: parsed.usage });
  if (check.judgment === "UNCERTAIN") throw Object.assign(new Error(check.errorCode ?? "INVALID_RESULT"), { usage: parsed.usage });
  if (check.score === undefined || (check.score >= metric.threshold! ? "PASS" : "FAIL") !== check.judgment) throw Object.assign(new Error("INVALID_RESULT"), { usage: parsed.usage });
  return qualityMetricSchema.parse({ ...metric, state: "COMPLETED", score: check.score, reason: check.reason, reasonCode: null,
    thresholdPassed: check.score >= metric.threshold!, elapsedMs: performance.now() - started, usage: parsed.usage });
};
