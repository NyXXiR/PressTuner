import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const directory = path.join(process.cwd(), "evals/press-rag/improvement");
const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
for (const [name, expected] of Object.entries(manifest.files)) {
  if (!/^[a-z0-9-]+\.json$/.test(name) || name === "manifest.json") throw new Error(`INVALID_ARTIFACT_NAME:${name}`);
  const actual = createHash("sha256").update(await readFile(path.join(directory, name))).digest("hex");
  if (actual !== expected) throw new Error(`PRESS_RAG_ARTIFACT_HASH_MISMATCH:${name}`);
}
process.stdout.write(`verified ${Object.keys(manifest.files).length} Press RAG artifacts\n`);
