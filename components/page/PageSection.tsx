import type { ReactNode } from "react";

export type PageSectionProps = {
  children: ReactNode;
  className?: string;
};

export function PageSection({ children, className }: PageSectionProps) {
  return (
    <section
      className={[
        "border border-border bg-card p-5",
        "sm:p-6",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </section>
  );
}
