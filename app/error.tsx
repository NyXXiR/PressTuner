"use client";

import { useEffect } from "react";
import { AppErrorState } from "@/components/layout/AppErrorState";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AppErrorState
      statusCode="500"
      title="문제를 처리하지 못했습니다"
      description="일시적인 오류로 요청을 완료하지 못했습니다. 다시 시도해도 같은 화면이 보이면 문의 페이지로 상황을 알려주세요."
      reset={reset}
      digest={error.digest}
    />
  );
}
