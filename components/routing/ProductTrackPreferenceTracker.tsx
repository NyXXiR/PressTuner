"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import {
  productTrackFromPathname,
  rememberPreferredProductTrack,
} from "@/lib/productEntryRouting";
import { useMeStore } from "@/stores/useMeStore";

export function ProductTrackPreferenceTracker() {
  const pathname = usePathname() ?? "/";
  const userId = useMeStore((state) => state.me?.userId);

  useEffect(() => {
    const track = productTrackFromPathname(pathname);
    if (!track) return;

    rememberPreferredProductTrack(window.localStorage, track, userId);
  }, [pathname, userId]);

  return null;
}
