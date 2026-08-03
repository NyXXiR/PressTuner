import Link from "next/link";
import { PageHeader } from "@/components/page/PageHeader";
import { PageCTA } from "@/components/page/PageCTA";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

type RelatedLink = {
  href: string;
  label: string;
};

export type PolicyPageContentProps = {
  eyebrow: string;
  title: string;
  effectiveDate: string;
  children: ReactNode;
  relatedLinks?: RelatedLink[];
};

export function PolicyPageContent({
  eyebrow,
  title,
  effectiveDate,
  children,
  relatedLinks,
}: PolicyPageContentProps) {
  return (
    <div className="w-full">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          eyebrow={eyebrow}
          title={title}
          description={`시행일: ${effectiveDate}`}
        />
        <PageCTA href="/" variant="secondary">
          홈으로
        </PageCTA>
      </header>

      <div className="mt-6 space-y-0 border-t-2 border-foreground">
        {children}
      </div>

      {relatedLinks && relatedLinks.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {relatedLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex h-9 items-center border border-border bg-card px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {link.label}
              <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        © {new Date().getFullYear()} brieFFlow. All rights reserved.
      </p>
    </div>
  );
}

export function PolicySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border py-5 sm:py-6">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
