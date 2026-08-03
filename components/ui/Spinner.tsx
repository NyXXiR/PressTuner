"use client";

import clsx from "clsx";

type Props = {
  size?: "xs" | "sm" | "md";
  className?: string;
};

export default function Spinner({ size = "sm", className }: Props) {
  const sz =
    size === "xs"
      ? "h-3 w-3 border"
      : size === "sm"
      ? "h-4 w-4 border-2"
      : "h-5 w-5 border-2";

  return (
    <span
      className={clsx(
        "inline-block animate-spin rounded-full border-current border-t-transparent",
        sz,
        className
      )}
      aria-hidden="true"
    />
  );
}
