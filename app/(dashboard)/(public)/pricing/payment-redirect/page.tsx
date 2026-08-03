"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function PaymentRedirectInner() {
  const sp = useSearchParams();
  const paymentId = sp.get("paymentId");
  const planId = sp.get("planId") ?? "";
  const code = sp.get("code");
  const message = sp.get("message");
  const [text, setText] = useState("처리 중...");

  useEffect(() => {
    (async () => {
      if (code) {
        setText(`결제 실패: ${message ?? code}`);
        return;
      }
      if (!paymentId) {
        setText("paymentId가 없습니다.");
        return;
      }

      const done = await fetch("/api/billing/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, planId }),
      });

      const doneJson = await done.json().catch(() => null);
      setText(
        doneJson?.ok
          ? "결제 검증 완료!"
          : `검증 실패: ${doneJson?.message ?? doneJson?.error ?? "UNKNOWN"}`
      );
    })();
  }, [paymentId, planId, code, message]);

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-xl font-semibold">결제 결과</h1>
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
    </main>
  );
}

export default function PaymentRedirectPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-lg px-4 py-10">
          <h1 className="text-xl font-semibold">결제 결과</h1>
          <p className="mt-3 text-sm text-muted-foreground">처리 중...</p>
        </main>
      }
    >
      <PaymentRedirectInner />
    </Suspense>
  );
}
