import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderedPublishedArtifacts } from "@/domain/ai-process-console/v1/publication";

type Options = { check: boolean; outputDir: string };

export function parseArtifactExportArgs(args: readonly string[]): Options {
  let check = false;
  let outputDir = process.cwd();
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--check") check = true;
    else if (value === "--output-dir") {
      const next = args[index + 1];
      if (!next) throw new Error("--output-dir requires a path");
      outputDir = isAbsolute(next) ? next : resolve(process.cwd(), next);
      index += 1;
    } else throw new Error(`Unknown argument: ${value}`);
  }
  return { check, outputDir };
}

export async function exportAiProcessConsoleArtifacts(options: Options): Promise<void> {
  const mismatches: string[] = [];
  for (const [relativePath, expected] of Object.entries(renderedPublishedArtifacts())) {
    const target = join(options.outputDir, relativePath);
    if (options.check) {
      let actual: string | null = null;
      try { actual = await readFile(target, "utf8"); } catch { /* reported as a mismatch */ }
      if (actual !== expected) mismatches.push(relativePath);
    } else {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, expected, "utf8");
    }
  }
  if (mismatches.length > 0) throw new Error(`AI Process Console artifacts are stale or missing: ${mismatches.join(", ")}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  exportAiProcessConsoleArtifacts(parseArtifactExportArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
