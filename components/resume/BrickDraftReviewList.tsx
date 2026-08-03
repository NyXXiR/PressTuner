"use client";

import { CheckCircle2 } from "lucide-react";

import type { BrickDraftCandidate } from "@/components/resume/brickModalTypes";

type BrickDraftReviewListProps = {
  readonly candidates: readonly BrickDraftCandidate[];
  readonly error: string | null;
  readonly onChange: (items: BrickDraftCandidate[]) => void;
};

function updateCandidate(
  candidates: readonly BrickDraftCandidate[],
  clientId: string,
  patch: Partial<BrickDraftCandidate>,
) {
  return candidates.map((candidate) =>
    candidate.clientId === clientId ? { ...candidate, ...patch } : candidate,
  );
}

export function BrickDraftReviewList({
  candidates,
  error,
  onChange,
}: BrickDraftReviewListProps) {
  const selectedCount = candidates.filter(
    (candidate) => candidate.selected,
  ).length;

  return (
    <div className="space-y-4">
      <div className="border border-ai/25 bg-ai/10 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-bold text-ai">
          <CheckCircle2 className="h-4 w-4" />
          여러 경험 후보를 찾았습니다.
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          저장할 항목을 고르고, 내용을 조금 더 구체적으로 다듬어 저장하세요.
        </p>
      </div>

      {candidates.map((candidate, index) => (
        <section
          key={candidate.clientId}
          className="border border-border bg-background p-4"
        >
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={candidate.selected}
              onChange={(event) =>
                onChange(
                  updateCandidate(candidates, candidate.clientId, {
                    selected: event.target.checked,
                  }),
                )
              }
              className="mt-1 rounded border-border text-primary focus:ring-primary/20"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-muted-foreground">
                후보 {index + 1}
              </span>
              <textarea
                value={candidate.title}
                onChange={(event) =>
                  onChange(
                    updateCandidate(candidates, candidate.clientId, {
                      title: event.target.value,
                    }),
                  )
                }
                rows={2}
                className="mt-1 min-h-11 w-full resize-none border border-border bg-card px-3 py-2 text-sm font-bold leading-5 text-foreground outline-none focus:border-primary"
              />
            </span>
          </label>
          <textarea
            value={candidate.content}
            onChange={(event) =>
              onChange(
                updateCandidate(candidates, candidate.clientId, {
                  content: event.target.value,
                }),
              )
            }
            className="mt-3 min-h-[128px] w-full resize-none border border-border bg-card p-3 text-sm leading-7 text-foreground outline-none focus:border-primary"
          />
          {candidate.tags && candidate.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {candidate.tags.map((tag) => (
                <span
                  key={`${candidate.clientId}-${tag}`}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ))}

      <p className="text-xs font-semibold text-muted-foreground">
        {selectedCount}개 저장 예정
      </p>
      {error ? (
        <p className="text-xs font-semibold text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
