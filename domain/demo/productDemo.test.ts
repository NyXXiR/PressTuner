import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceDemoStage,
  correctedDemoFindings,
  correctedDemoPressRelease,
  demoDocuments,
  demoEvidenceCandidates,
  demoSourceMap,
  demoStages,
  initialDemoPressRelease,
  initialDemoStage,
  isDemoFinalizable,
  verificationFindings,
} from "./productDemo";

test("the tutorial begins with a flawed draft and advances through four deterministic stages", () => {
  assert.deepEqual(demoStages, ["draft", "evidence", "verification", "complete"]);
  assert.equal(initialDemoStage, "draft");
  assert.ok(initialDemoPressRelease.paragraphs.some((item) => item.includes("32%")));
  assert.ok(initialDemoPressRelease.paragraphs.some((item) => item.includes("업계 최초")));
  assert.equal(advanceDemoStage("draft", verificationFindings), "evidence");
  assert.equal(advanceDemoStage("evidence", verificationFindings), "verification");
  assert.equal(advanceDemoStage("verification", verificationFindings), "verification");
  assert.equal(advanceDemoStage("verification", correctedDemoFindings), "complete");
  assert.equal(advanceDemoStage("complete", correctedDemoFindings), "complete");
});

test("evidence candidates point to exact PDF pages and STYLE cannot support factual claims", () => {
  assert.deepEqual(
    demoDocuments.map(({ role, path, pageCount }) => ({ role, path, pageCount })),
    [
      {
        role: "FACT",
        path: "/samples/press-ai-debugger/basic-multipage-facts.pdf",
        pageCount: 3,
      },
      {
        role: "STYLE",
        path: "/samples/press-ai-debugger/fact-style-guide.pdf",
        pageCount: 1,
      },
    ],
  );

  const factCandidates = demoEvidenceCandidates.filter(
    (candidate) => candidate.documentId === "basic-multipage-facts",
  );
  assert.deepEqual(
    factCandidates.map(({ pageStart, pageEnd }) => [pageStart, pageEnd]),
    [[1, 1], [2, 2], [3, 3]],
  );
  assert.ok(factCandidates.every((candidate) => candidate.canSupportFactualClaim));

  const styleCandidate = demoEvidenceCandidates.find(
    (candidate) => candidate.documentId === "fact-style-guide",
  );
  assert.equal(styleCandidate?.pageStart, 1);
  assert.equal(styleCandidate?.pageEnd, 1);
  assert.equal(styleCandidate?.canSupportFactualClaim, false);
  assert.match(styleCandidate?.exclusionReason ?? "", /사실 근거로 사용할 수 없/);
});

test("verification follows the real finalization gate semantics", () => {
  assert.deepEqual(
    [...new Set(verificationFindings.map((finding) => finding.verdict))].sort(),
    ["BLOCK", "PASS", "WARN"],
  );
  assert.equal(isDemoFinalizable(verificationFindings), false);
  assert.equal(isDemoFinalizable([{ ...verificationFindings[0]!, verdict: "PASS" }]), true);
  assert.equal(isDemoFinalizable([{ ...verificationFindings[0]!, verdict: "WARN" }]), true);
  assert.equal(isDemoFinalizable([{ ...verificationFindings[0]!, verdict: "BLOCK" }]), false);
});

test("the corrected release removes blocked claims and maps every retained fact to a page", () => {
  const corrected = [
    correctedDemoPressRelease.eyebrow,
    correctedDemoPressRelease.title,
    correctedDemoPressRelease.subtitle,
    correctedDemoPressRelease.lead,
    ...correctedDemoPressRelease.paragraphs,
    correctedDemoPressRelease.quote,
    correctedDemoPressRelease.boilerplate,
  ].join("\n");

  assert.match(corrected, /40%/);
  assert.doesNotMatch(corrected, /32%|업계 최초/);
  assert.ok(correctedDemoFindings.every((finding) => finding.verdict === "PASS"));

  const retainedClaimIds = correctedDemoFindings.map((finding) => finding.claimId).sort();
  assert.deepEqual(demoSourceMap.map((entry) => entry.claimId).sort(), retainedClaimIds);
  for (const entry of demoSourceMap) {
    assert.ok(corrected.includes(entry.claim), `source-mapped claim is absent: ${entry.claim}`);
    assert.equal(entry.documentPath, "/samples/press-ai-debugger/basic-multipage-facts.pdf");
    assert.ok(entry.pageStart >= 1 && entry.pageStart <= 3);
    assert.equal(entry.pageEnd, entry.pageStart);
  }
});
