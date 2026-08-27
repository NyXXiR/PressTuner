import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pagedEntry = require.resolve("pagedjs");
const source = path.resolve(path.dirname(pagedEntry), "../dist/paged.min.js");
const destination = path.resolve(process.cwd(), "public/vendor/paged.min.js");

await mkdir(path.dirname(destination), { recursive: true });
await copyFile(source, destination);
