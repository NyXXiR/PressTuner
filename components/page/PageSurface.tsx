import type { ReactNode } from "react";

export type PageSurfaceProps = {
  children: ReactNode;
  className?: string;
};

export function PageSurface({ children, className }: PageSurfaceProps) {
  return (
    <section
      className={[
        "border border-border bg-card px-5 py-6",
        "sm:px-6 sm:py-8",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </section>
  );
}
