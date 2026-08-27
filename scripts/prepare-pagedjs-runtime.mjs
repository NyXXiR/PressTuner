import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pagedEntry = require.resolve("pagedjs");
const source = path.resolve(path.dirname(pagedEntry), "../dist/paged.min.js");
const destination = path.resolve(process.cwd(), "public/vendor/paged.min.js");

await mkdir(path.dirname(destination), { recursive: true });
const vulnerableLayoutMeasurement = "this.parentBounds=this.element.offsetParent.getBoundingClientRect()";
const safeLayoutMeasurement = "this.parentBounds=(this.element.offsetParent||this.element.parentElement).getBoundingClientRect()";
const runtime = await readFile(source, "utf8");
const occurrences = runtime.split(vulnerableLayoutMeasurement).length - 1;

if (occurrences !== 1) {
  throw new Error(`Expected one nullable Paged.js offsetParent measurement, found ${occurrences}`);
}

// Paged.js 0.4.3 assumes page content always has an offsetParent. Hidden or
// transitioning preview hosts can legitimately return null; the direct parent
// is the same .pagedjs_area layout container needed for its gap calculation.
await writeFile(destination, runtime.replace(vulnerableLayoutMeasurement, safeLayoutMeasurement));
