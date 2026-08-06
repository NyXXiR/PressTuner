"use client";

import type { RagDebuggerDetailResponse } from "@/domain/evaluation/pressAgentRagDebuggerDetails";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string | null => { const bounded = object(value); return typeof bounded?.text === "string" ? `${bounded.text}${bounded.truncated ? "…" : ""}` : null; };

function pageCopy(value: unknown) {
  const pages = object(value); const start = typeof pages?.start === "number" ? pages.start : null; const end = typeof pages?.end === "number" ? pages.end : start;
  return start === null ? "페이지 미상" : start === end ? `${start}쪽` : `${start}–${end}쪽`;
}

function SourceCard({ value }: { value: unknown }) {
  const source = object(value); if (!source) return null;
  const excerpt = text(source.excerpt); const score = typeof source.score === "number" ? source.score.toFixed(3) : null;
  return <article className="rounded-xl border border-border bg-background p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="min-w-0 break-words text-sm">{text(source.documentName) ?? "이름 없는 문서"}</strong><span className="text-xs text-muted-foreground">{pageCopy(source.pages)}{score ? ` · 검색 점수 ${score}` : ""}</span></div>{excerpt ? <blockquote className="mt-2 border-l-2 border-primary/50 pl-3 text-sm leading-6 text-muted-foreground">{excerpt}</blockquote> : null}{source.selectedAsFinalEvidence === true ? <span className="mt-2 inline-block rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-700">최종 근거로 선택됨</span> : null}</article>;
}

function OutputPanel({ title, value }: { title: string; value: unknown }) {
  const output = object(value); if (!output) return <p className="text-sm text-muted-foreground">저장된 출력이 없습니다.</p>;
  return <section className="rounded-xl border border-border bg-background p-3"><h5 className="text-sm font-black">{title}</h5>{text(output.summary) ? <p className="mt-2 text-sm text-muted-foreground">{text(output.summary)}</p> : null}{text(output.answer) ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{text(output.answer)}</p> : null}<p className="mt-2 text-xs text-muted-foreground">답변 유보: {output.cannotAnswer === true ? "예" : "아니요"} · 주장 {list(output.claims).length}개</p></section>;
}

function IntakeDetail({ detail }: { detail: JsonObject }) {
  const preset = object(detail.retrievalPreset);
  return <div className="grid gap-4"><section><h5 className="text-xs font-black text-muted-foreground">실행한 질문</h5><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{text(detail.prompt)}</p></section><section><h5 className="text-xs font-black text-muted-foreground">검색 방식</h5><p className="mt-1 text-sm font-bold">{String(preset?.label ?? "알 수 없음")}</p><p className="mt-1 text-xs text-muted-foreground">{String(preset?.description ?? "")}</p></section><section><h5 className="text-xs font-black text-muted-foreground">이번 실행에 고정한 문서</h5><div className="mt-2 grid gap-2 sm:grid-cols-2">{list(detail.selectedDocuments).map((item, index) => { const document = object(item); return <article key={String(document?.id ?? index)} className="rounded-lg border border-border bg-background p-3"><strong className="break-words text-sm">{text(document?.name)}</strong><p className="mt-1 text-xs text-muted-foreground">{String(document?.pageCount ?? "?")}쪽 · {Number(document?.chunkCount ?? 0)}개 청크</p></article>; })}</div></section></div>;
}

function SourcesDetail({ detail, evidenceOnly = false }: { detail: JsonObject; evidenceOnly?: boolean }) {
  const sources = list(evidenceOnly ? detail.selectedEvidence : detail.sources); const total = evidenceOnly ? detail.selectedEvidenceCount : detail.totalRetrievedCount;
  return <div><p className="mb-3 text-sm"><strong>{evidenceOnly ? "최종 선택 근거" : "검색된 근거"} {Number(total ?? sources.length)}개</strong>{!evidenceOnly && detail.returnedCount !== total ? ` · 화면에는 ${detail.returnedCount}개 표시` : ""}</p><div className="grid gap-3">{sources.length ? sources.map((source, index) => <SourceCard key={String(object(source)?.sourceId ?? index)} value={source} />) : <p className="text-sm text-muted-foreground">해당 근거가 없습니다.</p>}</div></div>;
}

function ResponseDetail({ detail }: { detail: JsonObject }) {
  return <div className="grid gap-4"><OutputPanel title="검증 전 AI 응답" value={detail} /><section><h5 className="text-sm font-black">AI가 응답에서 만든 주장</h5><div className="mt-2 grid gap-3">{list(detail.claims).map((item, index) => { const claim = object(item); return <article key={String(claim?.id ?? index)} className="rounded-xl border border-border bg-background p-3"><p className="text-sm font-bold leading-6">{text(claim?.text)}</p><div className="mt-2 space-y-2">{list(claim?.evidence).map((evidenceValue, evidenceIndex) => { const evidence = object(evidenceValue); return <div key={evidenceIndex} className="rounded-lg bg-muted/50 p-2 text-xs"><p className="font-bold">주장에 연결한 인용문</p><p className="mt-1 leading-5 text-muted-foreground">{text(evidence?.quote)}</p>{evidence?.source ? <div className="mt-2"><SourceCard value={evidence.source} /></div> : <p className="mt-1 text-amber-700">연결된 검색 근거를 찾지 못했습니다.</p>}</div>; })}</div></article>; })}</div></section></div>;
}

function VerificationDetail({ detail }: { detail: JsonObject }) {
  return <div><p className={`mb-3 rounded-lg p-3 text-sm font-black ${detail.overallResult === "PASS" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-800"}`}>전체 검증: {detail.overallResult === "PASS" ? "통과" : "확인 필요"}</p><div className="grid gap-3">{list(detail.claims).map((item, index) => { const claim = object(item); const supported = claim?.status === "SUPPORTED"; return <article key={String(claim?.id ?? index)} className={`rounded-xl border p-3 ${supported ? "border-emerald-500/35 bg-emerald-500/5" : "border-amber-500/45 bg-amber-500/5"}`}><div className="flex items-start justify-between gap-3"><p className="text-sm font-bold leading-6">{text(claim?.text)}</p><span className="shrink-0 text-xs font-black">{supported ? "근거 확인" : "미통과"}</span></div>{list(claim?.reasons).length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">{list(claim?.reasons).map((reasonValue, reasonIndex) => <li key={reasonIndex}>{String(object(reasonValue)?.label ?? "알 수 없는 검증 사유입니다.")}</li>)}</ul> : null}{list(claim?.spans).length ? <div className="mt-3 space-y-2">{list(claim?.spans).map((spanValue, spanIndex) => { const span = object(spanValue); return <blockquote key={spanIndex} className="rounded-lg border-l-2 border-primary/50 bg-background p-3 text-xs leading-5"><strong>{text(span?.documentName) ?? "문서"} · {pageCopy(span?.pages)}</strong><p className="mt-1 text-muted-foreground">{text(span?.quote) ?? "검증 범위 없음"}</p></blockquote>; })}</div> : null}</article>; })}</div></div>;
}

function FallbackDetail({ detail }: { detail: JsonObject }) {
  const reason = object(detail.reason); const modeCopy: Record<string, string> = { EXTRACTIVE: "근거 문장으로 다시 작성", ABSTENTION: "답변 유보", RECOVERY: "근거가 있어 답변 복구", NORMALIZATION: "불완전한 유보 응답 정리" };
  return <div><p className="rounded-lg bg-amber-500/10 p-3 text-sm"><strong>{modeCopy[String(detail.mode)] ?? "안전 대체"}</strong><span className="mt-1 block text-amber-800">{String(reason?.label ?? "안전한 결과로 교체했습니다.")}</span></p><div className="mt-3 grid gap-3 lg:grid-cols-2"><OutputPanel title="교체되기 전 AI 응답" value={detail.originalOutput} /><OutputPanel title="사용자에게 전달한 최종 응답" value={detail.finalOutput} /></div></div>;
}

function TerminalDetail({ detail }: { detail: JsonObject }) {
  return <div><p className="mb-3 rounded-lg bg-primary/10 p-3 text-sm font-black">최종 판정: {detail.result === "CANNOT_ANSWER" ? "근거 부족으로 답변 유보" : "답변 완료"}</p><OutputPanel title="최종 응답" value={detail} /><p className="mt-2 text-xs text-muted-foreground">최종 인용 근거 {Number(detail.finalEvidenceCount ?? 0)}개</p></div>;
}

export function PressRagLiveStageDetail({ response, loading, error, onRetry }: { response: RagDebuggerDetailResponse | null; loading: boolean; error: string | null; onRetry: () => void }) {
  if (loading) return <p className="mt-3 text-sm text-muted-foreground">저장된 단계 상세를 불러오는 중입니다.</p>;
  if (error) return <p className="mt-3 text-sm text-rose-600">상세 정보를 불러오지 못했습니다. <button type="button" onClick={onRetry} className="font-bold underline">다시 시도</button></p>;
  if (!response) return <p className="mt-3 text-sm text-muted-foreground">실행을 시작하거나 기록을 열면 단계 상세를 확인할 수 있습니다.</p>;
  if (response.availability !== "available" || !response.detail) return <p className="mt-3 rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">{response.message ?? (response.availability === "not_applicable" ? "이 실행에서는 사용되지 않았습니다." : "아직 생성되지 않았습니다.")}</p>;
  const detail = object(response.detail)!;
  return <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3">{response.stageId === "request-intake" ? <IntakeDetail detail={detail} /> : response.stageId === "retrieval-execution" ? <SourcesDetail detail={detail} /> : response.stageId === "evidence-decision" ? <SourcesDetail detail={detail} evidenceOnly /> : response.stageId === "response-behavior" ? <ResponseDetail detail={detail} /> : response.stageId === "verification" ? <VerificationDetail detail={detail} /> : response.stageId === "fallback" ? <FallbackDetail detail={detail} /> : <TerminalDetail detail={detail} />}</div>;
}
