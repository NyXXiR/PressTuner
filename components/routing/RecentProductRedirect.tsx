"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  productRootPath,
  readPreferredProductTrack,
} from "@/lib/productEntryRouting";

export function RecentProductRedirect() {
  const router = useRouter();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (redirectedRef.current) return;

    const track = readPreferredProductTrack(window.localStorage);
    if (!track) return;

    redirectedRef.current = true;
    const destination = productRootPath(track);
    window.posthog?.capture?.("product_entry_routed", {
      destination,
      track,
      reason: "recent-route",
    });
    router.replace(destination);
  }, [router]);

  return null;
}
