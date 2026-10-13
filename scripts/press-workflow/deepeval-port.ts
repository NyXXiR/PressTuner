import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hash } from "../../domain/press-workflow/evaluation/contracts";
import type { DomainInput, EvaluationPorts } from "../../lib/services/press-workflow/evaluation/evaluate";
import rubric from "./deepeval/rubric.json";

export const deepEvalIdentity = { framework: "DEEPEVAL" as const, version: "4.2.8" as const, rubricHash: hash(rubric) };
export function callDeepEval(input: DomainInput, model: string, python: string, options: { scriptPath?: string; criteria?: string[] } = {}): ReturnType<EvaluationPorts["judge"]> {
  const payload = JSON.stringify({ ...input, model, ...(options.criteria ? { criteria: options.criteria } : {}) });
  if (Buffer.byteLength(payload) > 131072) return Promise.reject(new Error("INVALID_RESULT"));
  return new Promise((resolve, reject) => {
    const child = spawn(python, [options.scriptPath ?? fileURLToPath(new URL("./deepeval/evaluate.py", import.meta.url))], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "", settled = false;
    const finish = (error?: Error, result?: { checks: unknown; usage: unknown }) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (error) { child.kill(); reject(error); } else resolve(result!);
    };
    const timer = setTimeout(() => finish(new Error("TIMEOUT")), 330000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; if (Buffer.byteLength(stdout) > 65536) finish(new Error("INVALID_RESULT")); });
    child.stderr.resume();
    child.on("error", () => finish(new Error("PROVIDER_ERROR")));
    child.stdin.on("error", () => finish(new Error("PROVIDER_ERROR")));
    child.on("close", code => {
      try {
        const result = JSON.parse(stdout);
        if (code !== 0 || !result.ok) throw Object.assign(new Error(result.reasonCode === "INVALID_RESULT" ? "INVALID_RESULT" : "PROVIDER_ERROR"), { usage: result.usage });
        finish(undefined, { checks: result.checks, usage: result.usage });
      } catch (error) { finish(error instanceof SyntaxError ? new Error("INVALID_RESULT") : error as Error); }
    });
    child.stdin.end(payload);
  });
}
