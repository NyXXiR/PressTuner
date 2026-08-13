import { runAiProcessConsoleProducerWorker } from "../lib/services/ai-process-console/producerWorker";

async function main(): Promise<void> {
  const result = await runAiProcessConsoleProducerWorker();
  console.log(JSON.stringify(result));
  process.exitCode = result.exitCode;
}

void main();
