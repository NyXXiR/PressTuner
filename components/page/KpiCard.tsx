import type { ReactNode } from "react";

export type KpiCardProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  className?: string;
};

export function KpiCard({ label, value, hint, icon, className }: KpiCardProps) {
  return (
    <div
      className={[
        "border border-border bg-card p-5",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground">
          {label}
        </span>
        {icon}
      </div>
      <div className="mt-2 font-mono text-3xl font-extrabold tabular-nums text-foreground">
        {value}
      </div>
      {hint && (
        <p className="mt-2.5 text-[11px] leading-4 text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
