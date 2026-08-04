import { verifyPressRagArtifacts } from "./press-rag-artifact-verification.mjs";

try {
  const result = await verifyPressRagArtifacts({ root: process.cwd() });
  process.stdout.write(
    `verified ${result.verifiedArtifactCount} Press RAG artifacts and ${result.verifiedConfigurationCount} configurations\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
}
