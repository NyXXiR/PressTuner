import { z } from "zod";

const cycleSchema = z
  .object({
    cycleId: z.string().min(1),
    sequence: z.number().int().positive(),
    createdAt: z.string().datetime({ offset: true }),
    datasetId: z.string().min(1),
    regressionDatasetFromCycleId: z.string().min(1).nullable(),
    configurationDiff: z.record(z.string(), z.object({ from: z.string(), to: z.string() }).strict()),
    disposition: z.enum(["PROMOTE", "REJECT", "NOT_EVALUABLE"]),
    artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type ExperimentCycleRecord = z.infer<typeof cycleSchema>;

export function parseCycleHistory(input: unknown): readonly ExperimentCycleRecord[] {
  const cycles = z.array(cycleSchema).parse(input);
  const byId = new Map<string, ExperimentCycleRecord>();
  for (let index = 0; index < cycles.length; index += 1) {
    const cycle = cycles[index];
    if (byId.has(cycle.cycleId)) throw new Error("AGENT_CYCLE_DUPLICATE_ID");
    if (cycle.sequence !== index + 1) throw new Error("AGENT_CYCLE_SEQUENCE_INVALID");
    if (
      cycle.regressionDatasetFromCycleId &&
      !byId.has(cycle.regressionDatasetFromCycleId)
    ) {
      throw new Error("AGENT_CYCLE_REGRESSION_PARENT_UNKNOWN");
    }
    byId.set(cycle.cycleId, cycle);
  }
  return Object.freeze(cycles.map((cycle) => Object.freeze(cycle)));
}
