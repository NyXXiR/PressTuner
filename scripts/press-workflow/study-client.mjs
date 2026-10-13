// Backend operator client. Session cookie comes from the environment, never argv.
import { readFile, writeFile } from "node:fs/promises";
const [command, studyId, argument, out] = process.argv.slice(2);
if (!["report", "command", "regression"].includes(command) || !studyId || !out) throw new Error("Usage: study-client.mjs report STUDY - NEW_FILE | command STUDY BODY_FILE NEW_FILE | regression STUDY EXPERIMENT NEW_FILE");
const base = new URL(process.env.PRESS_QUALITY_BASE_URL || "http://localhost:3003");
if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) throw new Error("HTTPS_OR_LOCALHOST_REQUIRED");
const cookie = process.env.PRESS_QUALITY_SESSION_COOKIE; if (!cookie) throw new Error("PRESS_QUALITY_SESSION_COOKIE_REQUIRED");
// Reserve before a possibly paid command. Never overwrite prior evidence.
await writeFile(out, "", { flag: "wx" });
const body = command === "command" ? await readFile(argument, "utf8") : undefined;
const response = await fetch(new URL(`/api/press/quality-studies/${encodeURIComponent(studyId)}${body ? "" : "?view=report"}`, base), {
  method: body ? "POST" : "GET", headers: { Cookie: cookie, Origin: base.origin, "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(420000), redirect: "error",
});
const result = await response.json();
if (!response.ok) throw new Error(`STUDY_API_${response.status}_${result.code || "FAILED"}`);
let payload = result;
if (command === "regression") {
  payload = result.experiments.find(x => x.id === argument)?.regression ?? { state: "UNKNOWN", exitCode: 2, reason: "EXPERIMENT_NOT_FOUND" };
  process.exitCode = payload.exitCode;
}
await writeFile(out, JSON.stringify(payload, null, 2) + "\n");
console.log(`Saved backend result: ${out}`);
