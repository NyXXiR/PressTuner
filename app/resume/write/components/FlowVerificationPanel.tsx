"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Link2 } from "lucide-react";

import type { FlowQuestion } from "@/domain/resume-writing/flowMachine";
import { FlowOverrideDialog } from "./FlowOverrideDialog";

export function FlowVerificationPanel({
  question,
  onOverride,
}: {
  question: FlowQuestion;
  onOverride: (verificationId: string, reason: string) => Promise<void>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!question.grounding && !question.verification) return null;
  return (
    <section className="mt-4 space-y-3" aria-label="답변 근거와 사실 검증">
      {question.grounding && (
        <div className="border border-border bg-card p-4 text-xs">
          <h3 className="flex items-center gap-2 font-extrabold">
            <Link2 className="h-4 w-4 text-primary" />
            이 답변에 사용한 경력 기억
          </h3>
          {question.grounding.experiences.length > 0 && (
            <ul className="mt-3 space-y-2">
              {question.grounding.experiences.map((experience) => (
                <li key={experience.experienceId}>
                  <b>{experience.title}</b>
                  <span className="ml-2 text-muted-foreground">
                    {[experience.organization, experience.roleTitle]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {question.grounding.facts.length > 0 && (
            <ul className="mt-3 space-y-3">
              {question.grounding.facts.map((fact) => (
                <li key={fact.factId} className="border-t border-border pt-2">
                  <b>{fact.kind}</b>
                  <span className="ml-2">{fact.value}</span>
                  {fact.evidence.map((evidence, index) => (
                    <span
                      key={`${fact.factId}-${index}`}
                      className="mt-1 block text-muted-foreground"
                    >
                      {evidence.documentName}
                      {evidence.pageStart
                        ? ` · ${evidence.pageStart}${
                            evidence.pageEnd &&
                            evidence.pageEnd !== evidence.pageStart
                              ? `–${evidence.pageEnd}`
                              : ""
                          }쪽`
                        : ""}
                      {` · ${evidence.excerpt}`}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
          {question.grounding.experiences.length === 0 &&
            question.grounding.facts.length === 0 && (
              <p className="mt-2 text-muted-foreground">
                생성 당시 근거 기록은 있지만 현재 표시할 상세 정보가 없습니다.
              </p>
            )}
        </div>
      )}
      {question.verification && (
        <div
          className={`border p-4 text-xs ${
            question.verification.result === "BLOCK"
              ? "border-destructive/40 bg-destructive/5"
              : "border-primary/30 bg-primary/5"
          }`}
        >
          <h3 className="flex items-center gap-2 font-extrabold">
            {question.verification.result === "BLOCK" ? (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
            사실 검증 {question.verification.result}
          </h3>
          {question.verification.findings.length > 0 && (
            <ul className="mt-3 space-y-2">
              {question.verification.findings.map((finding) => (
                <li key={finding.id} className="border-t border-border pt-2">
                  <b>
                    {finding.riskCategory} · {finding.type}
                  </b>
                  <span className="mt-1 block">{finding.claim}</span>
                  <span className="mt-1 block text-muted-foreground">
                    {finding.explanation}
                  </span>
                  {(finding.supportingFacts ?? []).map((fact) => (
                    <span
                      key={fact.factId}
                      className="mt-2 block border-l-2 border-primary/30 pl-2"
                    >
                      {fact.experience.title} · {fact.kind} · {fact.value}
                      {fact.evidence.map((evidence, index) => (
                        <span
                          key={`${fact.factId}-evidence-${index}`}
                          className="block text-muted-foreground"
                        >
                          {evidence.documentName}
                          {evidence.pageStart
                            ? ` · ${evidence.pageStart}쪽`
                            : ""}
                          {` · ${evidence.excerpt}`}
                        </span>
                      ))}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
          {question.verification.result === "BLOCK" && (
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="mt-4 h-10 border border-destructive/40 bg-card px-4 font-bold text-destructive"
            >
              확인 후 예외 승인
            </button>
          )}
        </div>
      )}
      <FlowOverrideDialog
        open={dialogOpen}
        busy={busy}
        onClose={() => setDialogOpen(false)}
        onConfirm={async (reason) => {
          if (!question.verification) return;
          setBusy(true);
          try {
            await onOverride(question.verification.id, reason);
            setDialogOpen(false);
          } finally {
            setBusy(false);
          }
        }}
      />
    </section>
  );
}
