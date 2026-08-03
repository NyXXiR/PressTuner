"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

type AppModalFrameProps = {
  modal?: boolean;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
};

export function AppModalFrame({
  modal = true,
  children,
  className,
  panelClassName,
}: AppModalFrameProps) {
  if (!modal) {
    return (
      <div className={clsx("px-4 py-6 md:px-6 md:py-8", className)}>
        <div
          className={clsx(
            "mx-auto flex w-full max-w-3xl flex-col overflow-hidden border border-border bg-card shadow-[0_24px_80px_rgba(12,18,28,0.08)]",
            panelClassName,
          )}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "fixed inset-x-0 bottom-0 top-16 z-[60] bg-black/45 px-3 py-3 backdrop-blur-sm sm:px-4 md:py-5",
        className,
      )}
    >
      <div
        className={clsx(
          "mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden border border-border bg-card shadow-[0_24px_80px_rgba(12,18,28,0.16)]",
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
