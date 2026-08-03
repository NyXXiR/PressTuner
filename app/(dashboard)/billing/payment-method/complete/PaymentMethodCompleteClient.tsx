"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { isPayProvider } from "@/config/billing/options";

function readParam(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim();
  return value ? value : null;
}

export default function PaymentMethodCompleteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "done" | "failed">(
    "loading",
  );
  const [message, setMessage] = useState("결제수단 등록 결과를 확인하고 있습니다.");

  const params = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );
  const product =
    params.get("product") === "PRESS"
      ? "PRESS"
      : params.get("product") === "CAREER"
        ? "CAREER"
        : null;
  const surface =
    product === "CAREER"
      ? "resume"
      : params.get("surface") === "resume"
        ? "resume"
        : "press";
  const myHref = `/my?surface=${surface}`;

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const provider = readParam(params, "provider");
    const billingKey = readParam(params, "billingKey");
    const code = readParam(params, "code") ?? readParam(params, "pgCode");
    const errorMessage =
      readParam(params, "message") ??
      readParam(params, "pgMessage") ??
      code ??
      "결제수단 등록에 실패했습니다.";

    if (
      code ||
      !billingKey ||
      !isPayProvider(provider) ||
      !product
    ) {
      setStatus("failed");
      setMessage(errorMessage);
      return;
    }

    const recoverPastDue = params.get("recover") === "1";

    async function attachPaymentMethod() {
      try {
        const res = await fetch("/api/billing/payment-method/attach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payProvider: provider,
            billingKey,
            recoverPastDue,
            product,
          }),
        });
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.ok) {
          throw new Error(
            json?.message ?? json?.error ?? "PAYMENT_METHOD_ATTACH_FAILED",
          );
        }

        setStatus("done");
        setMessage(
          json?.recovered === true
            ? "결제수단 변경과 구독 복구가 완료되었습니다."
            : "결제수단 변경이 완료되었습니다.",
        );
        window.setTimeout(() => router.replace(myHref), 900);
      } catch (error: any) {
        setStatus("failed");
        setMessage(error?.message ?? "결제수단 변경에 실패했습니다.");
      }
    }

    void attachPaymentMethod();
  }, [myHref, params, router]);

  const Icon =
    status === "loading" ? Loader2 : status === "done" ? CheckCircle2 : XCircle;

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-4 py-10 text-center">
      <Icon
        className={[
          "h-10 w-10",
          status === "loading" ? "animate-spin text-muted-foreground" : "",
          status === "done" ? "text-emerald-500" : "",
          status === "failed" ? "text-red-500" : "",
        ].join(" ")}
      />
      <h1 className="mt-5 text-2xl font-semibold">
        {status === "failed" ? "결제수단 변경 실패" : "결제수단 변경"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      {status === "failed" ? (
        <div className="mt-6 flex gap-2">
          <Link
            href={`/billing/payment-method?surface=${surface}`}
            className="inline-flex h-10 items-center bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            다시 시도
          </Link>
          <Link
            href={myHref}
            className="inline-flex h-10 items-center border border-border px-4 text-sm font-medium"
          >
            마이페이지
          </Link>
        </div>
      ) : null}
    </main>
  );
}
