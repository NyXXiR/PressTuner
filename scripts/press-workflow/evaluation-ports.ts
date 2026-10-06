import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { DOMAIN_PROMPT, type EvaluationPorts, type RagasInput } from "../../lib/services/press-workflow/evaluation/evaluate";

export function callRagas(input: RagasInput, model: string, python: string): ReturnType<EvaluationPorts["ragas"]> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [fileURLToPath(new URL("./ragas/evaluate.py", import.meta.url))], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "", settled = false;
    const finish = (error?: Error, result?: { score: number; usage: unknown }) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (error) { child.kill(); reject(error); } else resolve(result!);
    };
    const timer = setTimeout(() => finish(new Error("TIMEOUT")), 100_000);
    child.stdout.on("data", chunk => { stdout += chunk.toString(); if (stdout.length > 65536) finish(new Error("INVALID_RESULT")); });
    child.stderr.resume(); // Provider and library diagnostics are deliberately not copied into artifacts.
    child.on("error", () => finish(new Error("PROVIDER_ERROR")));
    child.stdin.on("error", () => finish(new Error("PROVIDER_ERROR")));
    child.on("close", () => {
      try { const result = JSON.parse(stdout); if (!result.ok) throw Object.assign(new Error(["TIMEOUT", "NO_CLAIMS", "INVALID_RESULT"].includes(result.reasonCode) ? result.reasonCode : "PROVIDER_ERROR"), { usage: result.usage }); finish(undefined, { score: result.score, usage: result.usage }); }
      catch (error) { finish(error instanceof SyntaxError ? new Error("INVALID_RESULT") : error as Error); }
    });
    child.stdin.end(JSON.stringify({ ...input, model }));
  });
}

export function livePorts(model: string, python: string): EvaluationPorts {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");
  const client = new OpenAI({ maxRetries: 0, timeout: 60_000 });
  return { mode: "LIVE", model, ragas: input => callRagas(input, model, python), judge: async input => {
    const response = await client.chat.completions.create({ model, temperature: 0, max_tokens: 3500, response_format: { type: "json_object" },
      messages: [{ role: "system", content: DOMAIN_PROMPT }, { role: "user", content: JSON.stringify(input) }] });
    const usage = response.usage ? { inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens } : null;
    try { const result = JSON.parse(response.choices[0]?.message?.content ?? "{}"); return { checks: result.checks, usage }; }
    catch { throw Object.assign(new Error("INVALID_RESULT"), { usage }); }
  } };
}
