import type { ReactNode } from "react";
import Link from "next/link";

export type PageCTAProps = {
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  children: ReactNode;
  className?: string;
};

export function PageCTA({
  href,
  onClick,
  variant = "primary",
  disabled,
  children,
  className,
}: PageCTAProps) {
  const baseClass = [
    "inline-flex h-12 items-center justify-center gap-2 px-6 text-sm font-bold transition-colors",
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : "border border-border bg-card text-foreground hover:bg-muted",
    disabled && "cursor-not-allowed opacity-50",
    className ?? "",
  ].join(" ");

  if (href) {
    return (
      <Link href={href} className={baseClass} onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={baseClass}>
      {children}
    </button>
  );
}

export function PageCTAGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["flex flex-col gap-2 sm:flex-row", className ?? ""].join(" ")}>
      {children}
    </div>
  );
}
