import "server-only";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { StandardAvailability, StandardInput } from "../../../../domain/press-workflow/evaluation/standard";
import { STANDARD_PROFILE } from "../../../../domain/press-workflow/evaluation/standard";
import type { StandardEvaluationPorts } from "./standard";

export function standardConfiguration() {
  const root = resolve(process.env.PRESS_EVALUATION_ROOT || process.cwd());
  const executable = process.platform === "win32" ? "Scripts/python.exe" : "bin/python";
  return { root, model: process.env.PRESS_EVALUATION_MODEL || STANDARD_PROFILE.inference.defaultModel,
    ragas: process.env.PRESS_RAGAS_PYTHON || resolve(root, ".venv-press-eval", executable),
    deepeval: process.env.PRESS_DEEPEVAL_PYTHON || resolve(root, ".venv-press-deepeval", executable) };
}

export async function standardRuntimeAvailability(): Promise<StandardAvailability> {
  const config = standardConfiguration();
  if (process.env.PRESS_STANDARD_EVALUATION_ENABLED === "false" || (process.env.NODE_ENV === "production" && process.env.PRESS_STANDARD_EVALUATION_ENABLED !== "true"))
    return { available: false, model: config.model, reason: "표준 평가 기능이 활성화되지 않았습니다." };
  if (!process.env.OPENAI_API_KEY) return { available: false, model: config.model, reason: "평가 모델 연결이 설정되지 않았습니다." };
  try {
    await Promise.all([config.ragas, config.deepeval, resolve(config.root, "scripts/press-workflow/ragas/evaluate.py"),
      resolve(config.root, "scripts/press-workflow/deepeval/faithfulness.py"), resolve(config.root, "domain/press-workflow/evaluation/standard-profile.json")].map(p => access(/* turbopackIgnore: true */ p)));
  } catch { return { available: false, model: config.model, reason: "서버에 Ragas·DeepEval 실행 환경을 준비해야 합니다." }; }
  return { available: true, model: config.model, reason: null };
}

function measure(framework: "RAGAS" | "DEEPEVAL", input: StandardInput, model: string) {
  const config = standardConfiguration();
  const payload = JSON.stringify({ model, user_input: input.request, response: input.output, retrieved_contexts: input.contexts });
  if (Buffer.byteLength(payload) > 131072) return Promise.reject(new Error("INVALID_RESULT"));
  return new Promise<unknown>((yes, no) => {
    const ragas = framework === "RAGAS";
    const child = spawn(ragas ? config.ragas : config.deepeval,
      [resolve(config.root, ragas ? "scripts/press-workflow/ragas/evaluate.py" : "scripts/press-workflow/deepeval/faithfulness.py")],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "", settled = false;
    const finish = (error?: Error, result?: unknown) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) { child.kill(); no(error); } else yes(result);
    };
    const timer = setTimeout(() => finish(new Error("TIMEOUT")), ragas ? 100000 : 260000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => { output += chunk; if (Buffer.byteLength(output) > 65536) finish(new Error("INVALID_RESULT")); });
    child.stderr.resume();
    child.on("error", () => finish(new Error("PROVIDER_ERROR")));
    child.stdin.on("error", () => finish(new Error("PROVIDER_ERROR")));
    child.on("close", code => {
      try {
        const result = JSON.parse(output);
        if (code !== 0 || result.ok !== true) {
          const reason = ["TIMEOUT", "NO_CLAIMS", "INVALID_RESULT"].includes(result.reasonCode) ? result.reasonCode : "PROVIDER_ERROR";
          finish(Object.assign(new Error(reason), { usage: result.usage }));
        } else finish(undefined, result);
      } catch { finish(new Error("INVALID_RESULT")); }
    });
    child.stdin.end(payload);
  });
}

export function standardRuntimePorts(model = standardConfiguration().model): StandardEvaluationPorts {
  return { model, measure: (framework, input) => measure(framework, input, model) };
}
