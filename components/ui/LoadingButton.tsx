"use client";

import clsx from "clsx";
import Spinner from "@/components/ui/Spinner";
import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingText?: string;
  spinnerSize?: "xs" | "sm" | "md";
  spinnerClassName?: string;
};

export default function LoadingButton({
  loading = false,
  loadingText,
  spinnerSize = "sm",
  spinnerClassName,
  className,
  disabled,
  children,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      disabled={isDisabled}
      aria-busy={loading ? "true" : "false"}
      className={clsx(
        // 기본: 버튼이 disable일 때도 커서/opacity 처리
        "inline-flex items-center justify-center gap-2",
        isDisabled && "disabled:opacity-60 disabled:cursor-not-allowed",
        className
      )}
    >
      {loading && (
        <>
          <Spinner size={spinnerSize} className={spinnerClassName} />
          <span>{loadingText ?? children}</span>
        </>
      )}
      {!loading && children}
    </button>
  );
}
