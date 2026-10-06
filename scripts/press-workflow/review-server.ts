import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { datasetSchema, evaluationBundleSchema, hash, type Dataset, type EvaluationBundle } from "../../domain/press-workflow/evaluation/contracts";
import { createReviewSession, selectAnswer, sessionSchema, type ReviewSession } from "../../domain/press-workflow/evaluation/quick-review";
import { buildReport } from "../../domain/press-workflow/evaluation/report";
import { reportHtml } from "./evaluation-html";
import { quickReviewHtml } from "./quick-review-html";

const readBounded = async (path: string) => { const bytes = await readFile(path); if (bytes.length > 32 * 1024 * 1024) throw new Error("ARTIFACT_TOO_LARGE"); return JSON.parse(bytes.toString("utf8")); };
async function durableWrite(path: string, value: unknown, exclusive = false) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx");
  try { await file.writeFile(JSON.stringify(value, null, 2)); await file.sync(); } finally { await file.close(); }
  try { if (exclusive) { await link(temporary, path); await unlink(temporary); } else await rename(temporary, path); } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}
export async function startReviewServer(options: { dataset: Dataset; batch: EvaluationBundle; imported?: unknown; dir: string; port?: number; budget?: number }) {
  const dataset = datasetSchema.parse(options.dataset), batch = evaluationBundleSchema.parse(options.batch), dir = resolve(options.dir);
  await mkdir(dir, { recursive: true });
  const lockPath = join(dir, "server.lock");
  try { const previous = JSON.parse(await readFile(lockPath, "utf8"));
    if (!Number.isInteger(previous.pid) || previous.pid <= 0) throw new Error("INVALID_SESSION_LOCK");
    let alive = true;
    try { process.kill(previous.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false; else throw error; }
    if (alive) throw new Error("SESSION_ALREADY_OPEN");
    await unlink(lockPath);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const lock = await open(lockPath, "wx"); await lock.writeFile(JSON.stringify({ pid: process.pid })); await lock.close();
  let session: ReviewSession;
  const snapshotPath = (revision: number) => join(dir, `revision-${String(revision).padStart(6, "0")}.json`);
  const snapshot = async (s: ReviewSession) => {
    const report = buildReport(dataset, batch, s.packet);
    await durableWrite(snapshotPath(s.revision), { session: s, report, summary: report.summary }, true);
    return report;
  };
  try {
    const snapshots = (await readdir(dir)).filter(name => /^revision-\d{6}\.json$/.test(name)).sort();
    if (snapshots.length) {
      session = sessionSchema.parse((await readBounded(join(dir, snapshots.at(-1)!))).session);
      if (session.packet.artifactHash !== hash(batch) || session.packet.datasetHash !== hash(dataset)) throw new Error("SESSION_ARTIFACT_MISMATCH");
      buildReport(dataset, batch, session.packet);
    } else {
      session = createReviewSession(dataset, batch, options.imported, options.budget ?? 2, randomUUID());
      await snapshot(session);
    }
  } catch (error) { await unlink(lockPath); throw error; }
  // Rebuild the stable Console projection from the authoritative revision on every restart.
  try { await durableWrite(join(dir, "console-summary.json"), buildReport(dataset, batch, session.packet).summary); }
  catch (error) { await unlink(lockPath); throw error; }
  const token = randomBytes(32).toString("hex");
  let origin = "", pending = Promise.resolve();
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (code: number, type: string, value: string) => { res.writeHead(code, { "Content-Type": `${type}; charset=utf-8` }); res.end(value); };
    if (req.headers.host !== new URL(origin).host) { send(403, "text/plain", "Invalid host"); return; }
    if (req.method === "GET") {
      if (req.url === "/") send(200, "text/html", quickReviewHtml(session, token));
      else if (req.url === "/report") send(200, "text/html", reportHtml(batch, buildReport(dataset, batch, session.packet)));
      else if (req.url === "/summary") send(200, "application/json", JSON.stringify(buildReport(dataset, batch, session.packet).summary));
      else send(404, "text/plain", "Not found");
      return;
    }
    if (req.method !== "POST" || req.url !== "/selection") { send(404, "text/plain", "Not found"); return; }
    if (req.headers.origin !== origin || req.headers["x-review-token"] !== token || !req.headers["content-type"]?.startsWith("application/json")) { send(403, "text/plain", "Invalid request origin"); return; }
    try {
      let body = "";
      for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 4096) { send(413, "text/plain", "Request too large"); return; } }
      const input: unknown = JSON.parse(body);
      // One durable revision at a time. Failed writes never change the in-memory answers.
      pending = pending.then(async () => {
        try {
          const next = selectAnswer(session, input), report = await snapshot(next);
          session = next;
          let summaryUpdated = true;
          try { await durableWrite(join(dir, "console-summary.json"), report.summary); } catch { summaryUpdated = false; }
          send(200, "application/json", JSON.stringify({ revision: next.revision, labelledCount: report.review.labelledCount, summaryUpdated }));
        } catch (error) { send(error instanceof Error && error.message === "STALE_REVIEW_REVISION" ? 409 : 400, "text/plain", "Selection not saved"); }
      });
      await pending;
    } catch { send(400, "text/plain", "Invalid selection"); }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000;
  try { await new Promise<void>((yes, no) => { server.once("error", no); server.listen(options.port ?? 8765, "127.0.0.1", () => yes()); }); }
  catch (error) { await unlink(lockPath); throw error; }
  const address = server.address(); if (!address || typeof address === "string") throw new Error("INVALID_LISTEN_ADDRESS");
  origin = `http://127.0.0.1:${address.port}`;
  return { url: origin, token, session: () => session, close: async () => { await pending; await new Promise<void>((yes, no) => server.close(e => e ? no(e) : yes())); await unlink(lockPath); } };
}

async function main() {
  const args = process.argv.slice(2), values: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) { if (!["--input", "--dataset", "--review", "--dir", "--port", "--budget"].includes(args[i]) || !args[i + 1]) throw new Error("INVALID_ARGUMENTS"); values[args[i]] = args[i + 1]; }
  if (!values["--input"] || !values["--dir"]) throw new Error("Usage: review-server --input EVALUATION --dir NEW_OR_EXISTING_SESSION [--review HUMAN_JSON] [--port 8765] [--budget 2]");
  const port = Number(values["--port"] ?? 8765); if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("INVALID_PORT");
  const running = await startReviewServer({ dataset: datasetSchema.parse(await readBounded(values["--dataset"] ?? "evals/press-workflow/dual/v1/dataset.json")),
    batch: evaluationBundleSchema.parse(await readBounded(values["--input"])), imported: values["--review"] ? await readBounded(values["--review"]) : undefined,
    dir: values["--dir"], port, budget: Number(values["--budget"] ?? 2) });
  console.log(`Selection review: ${running.url}\nAnalysis: ${running.url}/report\nDurable session: ${resolve(values["--dir"])}`);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void running.close().then(() => process.exit(0)); });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error instanceof Error ? error.message : "Review server failed"); process.exitCode = 1; });
