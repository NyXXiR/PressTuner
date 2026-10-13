"use client";

import { useEffect, useRef, useState } from "react";
import type { Choice, Exposure, PairVote } from "../../../domain/press-workflow/evaluation/study-contracts";
import { choiceLabels, pairLabels, reviewCard, type Batch, type PairPacket } from "./adapter";

export const buttonClass = "min-h-11 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";
export const primaryClass = `${buttonClass} border-primary bg-primary text-primary-foreground hover:opacity-90`;
const readingColumns = { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))" };

export function ExposureQuestion({ value, onChange, disabled }: { value: Exposure | null; onChange: (value: Exposure) => void; disabled: boolean }) {
  return <fieldset className="rounded-lg border border-border p-3" disabled={disabled}>
    <legend className="px-1 text-sm font-medium">이 원고의 자동 평가나 비교 결과를 전에 보셨나요?</legend>
    <div className="flex flex-wrap gap-2">{([
      ["NONE", "본 적 없어요"], ["SEEN_JUDGE", "본 적 있어요"], ["UNKNOWN", "기억나지 않아요"],
    ] as const).map(([id, label]) => <label key={id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm">
      <input type="radio" name="prior-exposure" checked={value === id} onChange={() => onChange(id)} />{label}
    </label>)}</div>
    <p className="mt-2 text-xs text-muted-foreground">선택은 한 번만 받습니다. 앞서 본 평가가 판단에 영향을 주었는지 구분하기 위한 질문입니다.</p>
  </fieldset>;
}

export function SourceText({ output, facts, request, excerpt }: { output: string; facts: string[]; request: string; excerpt?: string | null }) {
  return <div>
    <details className="mb-3 text-sm"><summary className="cursor-pointer">작성 요청 보기</summary><p className="mt-2 whitespace-pre-wrap break-words">{request}</p></details>
    <div className="grid min-w-0 gap-3" style={readingColumns}>
      <section className="min-w-0 rounded-lg border border-border bg-background p-3">
        <h4 className="mb-2 text-sm font-semibold">검토할 원고</h4>
        {excerpt ? <><p className="mb-2 text-xs text-muted-foreground">자동 설명에 언급된 원고 구간 · 확정된 오류는 아닙니다</p><p aria-label="먼저 확인할 원고 구간" className="whitespace-pre-wrap break-words text-sm leading-7">{excerpt}</p><details className="mt-3 text-sm"><summary className="cursor-pointer">전체 원고 펼치기</summary><div tabIndex={0} aria-label="검토할 원고 전체" className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words leading-7">{output}</div></details></> : <div tabIndex={0} aria-label="검토할 원고 전체" className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm leading-7">{output}</div>}
      </section>
      <section className="min-w-0 rounded-lg border border-border bg-muted/30 p-3">
        <h4 className="mb-2 text-sm font-semibold">작성에 사용한 근거 · {facts.length}개</h4>
        <ul tabIndex={0} aria-label="작성에 사용한 근거 전체" className="max-h-80 space-y-3 overflow-auto text-sm leading-7">{facts.map((fact, i) => <li key={i} className="whitespace-pre-wrap break-words"><span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span>{fact}</li>)}</ul>
        {!facts.length && <p className="text-sm">확인할 근거가 없습니다. 판단하기 어렵다면 보류해 주세요.</p>}
      </section>
    </div>
  </div>;
}

export function ReviewCards({ batch, busy, exposure, setExposure, onChoose }: {
  batch: Batch; busy: boolean; exposure: Exposure | null; setExposure: (value: Exposure) => void;
  onChoose: (item: Batch["items"][number], choice: Choice) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const item = batch.items.find(i => i.id === editing) ?? batch.items.find(i => !i.choice);
  const completed = batch.items.filter(i => i.choice !== null).length;
  const heading = useRef<HTMLHeadingElement>(null);
  // Focus the next question only after this review is mounted by the user's action.
  const previous = useRef(item?.id);
  useEffect(() => { if (previous.current !== item?.id) heading.current?.focus(); previous.current = item?.id; }, [item?.id]);
  const card = item ? reviewCard(batch, item) : null;
  return <section className="mt-4 space-y-4" aria-label="선택형 원고 검토">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span>{batch.purpose === "PRODUCT" ? "원고 검토" : "평가기 검증 · 자동 설명 숨김"}</span>
      <span aria-live="polite">{completed} / {batch.items.length}개 저장</span>
    </div>
    {batch.purpose !== "PRODUCT" && item && <ExposureQuestion value={exposure} onChange={setExposure} disabled={busy} />}
    {card && item ? <div className="space-y-4 rounded-xl border border-border p-4">
      <div><p className="mb-1 text-xs font-medium text-muted-foreground">{card.status}</p>
        <h3 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">{card.title}</h3>
        <p className="mt-2 text-sm leading-6">{card.instruction}</p>
      </div>
      {card.automatic?.reason && <div className="rounded-lg bg-muted/50 p-3 text-sm leading-6"><p className="font-medium">자동 평가가 확인한 내용</p><p className="mt-1 whitespace-pre-wrap break-words">{card.automatic.reason}</p><p className="mt-2 text-xs text-muted-foreground">이 설명에도 오류가 있을 수 있습니다. 아래 근거와 함께 확인해 주세요.</p></div>}
      <SourceText output={card.output} facts={card.facts} request={card.request} excerpt={card.excerpt} />
      <fieldset disabled={busy || (batch.purpose !== "PRODUCT" && exposure === null)}>
        <legend className="mb-2 text-sm font-medium">어떻게 처리할까요?</legend>
        <div className="flex flex-wrap gap-2">{card.choices.map(choice => <button key={choice.value} type="button" aria-pressed={item.choice === choice.value} className={`${buttonClass} aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary`} onClick={async () => { if (await onChoose(item, choice.value)) setEditing(null); }}>{choice.label}</button>)}</div>
      </fieldset>
      <p className="text-xs leading-5 text-muted-foreground">{card.effect} 이유를 작성할 필요는 없습니다.</p>
    </div> : <div className="rounded-lg border border-border bg-muted/30 p-4" role="status"><h3 ref={heading} tabIndex={-1} className="font-semibold outline-none">이번 검토를 마쳤습니다</h3><p className="mt-1 text-sm">선택이 저장됐습니다. 여기서 마쳐도 됩니다.</p></div>}
    {completed > 0 && <details className="text-sm"><summary className="cursor-pointer">저장한 선택 확인·변경 ({completed})</summary><ul className="mt-2 space-y-2">{batch.items.filter(i => i.choice).map(saved => <li key={saved.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2"><span>{reviewCard(batch, saved).title} · {choiceLabels[saved.choice!]}</span><button type="button" className={buttonClass} disabled={busy} onClick={() => setEditing(saved.id)}>선택 변경</button></li>)}</ul></details>}
  </section>;
}

export function PairCard({ pair, busy, exposure, setExposure, onChoose }: {
  pair: PairPacket; busy: boolean; exposure: Exposure | null; setExposure: (value: Exposure) => void;
  onChoose: (choice: PairVote["choice"]) => void;
}) {
  return <section aria-label="두 초안 비교" className="mt-4 space-y-4 rounded-xl border border-border p-4">
    <div><h3 className="text-lg font-semibold">어느 초안이 더 쓰기 좋은가요?</h3><p className="mt-2 text-sm">{pair.criterion}</p><p className="mt-1 text-xs text-muted-foreground">A/B 순서는 무작위입니다. 이 선택은 선호 기록이며 원고 채택이나 교체를 실행하지 않습니다.</p></div>
    <ExposureQuestion value={exposure} onChange={setExposure} disabled={busy} />
    <details className="text-sm"><summary className="cursor-pointer">같은 작성 요청과 근거 확인</summary><p className="mt-2 whitespace-pre-wrap break-words">{pair.request}</p><ul className="mt-2 space-y-2">{pair.facts.map((f, i) => <li key={i} className="whitespace-pre-wrap break-words">{i + 1}. {f}</li>)}</ul></details>
    <div className="grid min-w-0 gap-3" style={readingColumns}>{(["A", "B"] as const).map(side => <section key={side} className="min-w-0 rounded-lg border border-border bg-background p-3"><h4 className="mb-2 font-bold">초안 {side}</h4><div tabIndex={0} aria-label={`초안 ${side} 전체`} className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm leading-7">{pair[side]}</div></section>)}</div>
    <fieldset disabled={busy || exposure === null}><legend className="mb-2 text-sm font-medium">비교 결과 선택</legend><div className="flex flex-wrap gap-2">{(Object.keys(pairLabels) as PairVote["choice"][]).map(choice => <button key={choice} type="button" aria-pressed={pair.choice === choice} className={`${buttonClass} aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary`} onClick={() => onChoose(choice)}>{pairLabels[choice]}</button>)}</div></fieldset>
    {pair.choice && <p role="status" className="text-sm">저장된 선택: {pairLabels[pair.choice as keyof typeof pairLabels]}</p>}
  </section>;
}
