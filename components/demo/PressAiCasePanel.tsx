"use client";

import { useState } from "react";

type Expectation = {
  id: string;
  field: "contains" | "notContains";
  value: string;
  verdict: "WARN" | "BLOCK";
};

export function PressAiCasePanel(props: {
  checkpoints: readonly { id: string; nodeId: string }[];
  busy: boolean;
  onSave: (
    checkpointId: string,
    name: string,
    expectations: Expectation[],
  ) => void;
}) {
  const [checkpointId, setCheckpointId] = useState("");
  const [name, setName] = useState("");
  const [expectations, setExpectations] = useState<Expectation[]>([]);
  const update = (index: number, patch: Partial<Expectation>) =>
    setExpectations((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  const valid = expectations.every(
    (item) => item.id.trim() && item.value.trim(),
  );
  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="font-black">수동 테스트 케이스</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        필수 가드레일은 그대로 두고 이 케이스에서만 확인할 기대값을 추가합니다.
      </p>
      <select
        aria-label="완료 체크포인트"
        value={checkpointId}
        onChange={(event) => setCheckpointId(event.target.value)}
        className="mt-3 min-h-11 w-full rounded border bg-background px-3"
      >
        <option value="">체크포인트 선택</option>
        {props.checkpoints.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nodeId}
          </option>
        ))}
      </select>
      <input
        aria-label="케이스 이름"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="mt-2 min-h-11 w-full rounded border bg-background px-3"
        placeholder="케이스 이름"
      />
      <div className="mt-3 space-y-2">
        {expectations.map((item, index) => (
          <fieldset key={index} className="rounded-lg border p-3">
            <legend className="px-1 text-xs font-bold">
              추가 기대값 {index + 1}
            </legend>
            <input
              aria-label={`기대값 ${index + 1} 이름`}
              value={item.id}
              onChange={(event) => update(index, { id: event.target.value })}
              className="min-h-11 w-full rounded border bg-background px-3"
              placeholder="예: caution-preserved"
            />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <select
                aria-label={`기대값 ${index + 1} 규칙`}
                value={item.field}
                onChange={(event) =>
                  update(index, {
                    field: event.target.value as Expectation["field"],
                  })
                }
                className="min-h-11 rounded border bg-background px-3"
              >
                <option value="contains">포함해야 함</option>
                <option value="notContains">포함하면 안 됨</option>
              </select>
              <select
                aria-label={`기대값 ${index + 1} 실패 판정`}
                value={item.verdict}
                onChange={(event) =>
                  update(index, {
                    verdict: event.target.value as Expectation["verdict"],
                  })
                }
                className="min-h-11 rounded border bg-background px-3"
              >
                <option value="WARN">실패 시 WARN</option>
                <option value="BLOCK">실패 시 BLOCK</option>
              </select>
            </div>
            <input
              aria-label={`기대값 ${index + 1} 내용`}
              value={item.value}
              onChange={(event) => update(index, { value: event.target.value })}
              className="mt-2 min-h-11 w-full rounded border bg-background px-3"
              placeholder="확인할 문구"
            />
            <button
              type="button"
              onClick={() =>
                setExpectations((items) =>
                  items.filter((_, itemIndex) => itemIndex !== index),
                )
              }
              className="mt-2 min-h-11 rounded border px-3 text-xs font-bold"
            >
              기대값 삭제
            </button>
          </fieldset>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          setExpectations((items) => [
            ...items,
            { id: "", field: "contains", value: "", verdict: "WARN" },
          ])
        }
        className="mt-2 min-h-11 rounded border px-3 text-xs font-bold"
      >
        기대값 추가
      </button>
      <button
        type="button"
        disabled={props.busy || !checkpointId || !name.trim() || !valid}
        onClick={() => props.onSave(checkpointId, name, expectations)}
        className="mt-2 min-h-11 w-full rounded border px-4 font-bold disabled:opacity-50"
      >
        이 체크포인트 저장
      </button>
    </section>
  );
}
