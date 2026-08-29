"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import {
  productTrackFromPathname,
  rememberPreferredProductTrack,
} from "@/lib/productEntryRouting";

export function ProductTrackPreferenceTracker() {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    const track = productTrackFromPathname(pathname);
    if (!track) return;

    rememberPreferredProductTrack(window.localStorage, track);
  }, [pathname]);

  return null;
}
