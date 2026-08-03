"use client";

import type { BriefEvidenceCandidate } from "@/stores/usePressGeneratorStore";

export function BriefEvidenceCandidates(props: {
  candidates: BriefEvidenceCandidate[];
  onDecision: (
    candidateId: string,
    decision: "ACCEPTED" | "REJECTED",
  ) => Promise<void>;
}) {
  if (props.candidates.length === 0) return null;
  return (
    <section className="border border-border bg-muted/20 p-4">
      <h3 className="text-sm font-bold">팀 문서에서 찾은 근거 제안</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        필요한 근거만 선택하세요. 선택하지 않은 문서 내용은 초안에
        전달되지 않습니다.
      </p>
      <ul className="mt-4 space-y-3">
        {props.candidates.map((candidate) => (
          <li key={candidate.id} className="border border-border bg-card p-3">
            <p className="text-sm">{candidate.content}</p>
            <a
              className="mt-2 inline-block text-xs text-primary underline"
              href={`/api/knowledge/documents/${candidate.documentId}/source#page=${candidate.pageStart}`}
              target="_blank"
              rel="noreferrer"
            >
              {candidate.document.originalName} · p.
              {candidate.pageStart}
              {candidate.pageEnd !== candidate.pageStart
                ? `-${candidate.pageEnd}`
                : ""}
            </a>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void props.onDecision(candidate.id, "ACCEPTED")}
                className={`border px-3 py-1.5 text-xs ${candidate.decision === "ACCEPTED" ? "border-emerald-600 text-emerald-700" : "border-border"}`}
              >
                근거로 사용
              </button>
              <button
                type="button"
                onClick={() => void props.onDecision(candidate.id, "REJECTED")}
                className={`border px-3 py-1.5 text-xs ${candidate.decision === "REJECTED" ? "border-red-500 text-red-600" : "border-border"}`}
              >
                사용 안 함
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
