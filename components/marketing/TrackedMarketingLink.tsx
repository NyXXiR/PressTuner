"use client";

import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

import { trackGaEvent } from "@/lib/analytics/ga4";

type TrackedMarketingLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | "href"> & {
    eventName: string;
    eventParams?: Record<string, string | number | boolean | null | undefined>;
    children: ReactNode;
  };

export function TrackedMarketingLink({
  eventName,
  eventParams,
  onClick,
  children,
  ...props
}: TrackedMarketingLinkProps) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        trackGaEvent(eventName, eventParams);
        onClick?.(event);
      }}
    >
      {children}
    </Link>
  );
}
