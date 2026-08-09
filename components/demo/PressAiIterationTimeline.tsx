import type { PressAiCheckpointAttempt } from "@/lib/pressAiProcessDebuggerClient";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";

export function PressAiIterationTimeline({ attempt }: { attempt: PressAiCheckpointAttempt }) {
  const repeated = attempt.checkpoints.filter((checkpoint) => checkpoint.iteration > 0 || attempt.checkpoints.filter((item) => item.nodeId === checkpoint.nodeId).length > 1);
  if (!repeated.length) return null;
  return (
    <section className="mb-4 rounded-xl border border-border p-4" aria-labelledby="press-ai-iteration-timeline-heading">
      <h3 id="press-ai-iteration-timeline-heading" className="font-black">반복 실행 기록</h3>
      <ol className="mt-3 grid gap-2">
        {repeated.sort((left, right) => left.sequence - right.sequence).map((checkpoint) => {
          const node = pressCreationProcess.nodes.find((item) => item.id === checkpoint.nodeId);
          return (
            <li key={checkpoint.id} className="rounded border border-border bg-muted/30 p-3 text-sm">
              <details>
                <summary className="cursor-pointer font-bold">반복 {checkpoint.iteration} · {node?.label ?? checkpoint.nodeId}</summary>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-xs">{JSON.stringify(checkpoint.input, null, 2)}</pre>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-xs">{JSON.stringify(checkpoint.output, null, 2)}</pre>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
