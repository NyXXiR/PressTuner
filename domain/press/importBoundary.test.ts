import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("domain/press stays free of infrastructure imports", async () => {
  const directory = join(process.cwd(), "domain", "press");
  const files = (await readdir(directory)).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
  );
  const forbidden = [
    "@prisma/client",
    "next/",
    "openai",
    "@/lib/auth",
    "@/domain/quota",
    "@/lib/ops",
    "@/lib/services",
  ];

  for (const file of files) {
    const source = await readFile(join(directory, file), "utf8");
    for (const specifier of forbidden) {
      assert.equal(
        source.includes(specifier),
        false,
        `${file} must not import ${specifier}`,
      );
    }
  }
});
