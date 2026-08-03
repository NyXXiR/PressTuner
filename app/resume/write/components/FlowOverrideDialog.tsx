"use client";

import { useState } from "react";

export function FlowOverrideDialog({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg border border-border bg-card p-5 shadow-xl">
        <h3 className="text-lg font-extrabold">차단된 사실을 예외 승인할까요?</h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          근거와 다른 표현을 확인했다는 기록이 남습니다. 구체적인 판단 이유를 적어 주세요.
        </p>
        <textarea
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="mt-4 min-h-28 w-full border border-border bg-background p-3 text-sm outline-none focus:border-primary"
          placeholder="예: 계약서의 최신 수치를 직접 확인했습니다."
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 border border-border px-4 text-xs font-bold"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={busy || !reason.trim()}
            className="h-10 bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-40"
          >
            이유를 기록하고 완료
          </button>
        </div>
      </div>
    </div>
  );
}
