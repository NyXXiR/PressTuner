"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useMeStore } from "@/stores/useMeStore";
import {
  readPreferredProductTrack,
  resolvePreferredProductEntryDecision,
} from "@/lib/productEntryRouting";

type AuthRedirectIfAuthedProps =
  | { redirectTo: string; usePreferredProductEntry?: false }
  | { redirectTo?: never; usePreferredProductEntry: true };

export function AuthRedirectIfAuthed(props: AuthRedirectIfAuthedProps) {
  const router = useRouter();
  const { authStatus, checked, loading, fetchMe, me } = useMeStore();
  const usePreferredProductEntry = props.usePreferredProductEntry === true;
  const fixedRedirectTo = "redirectTo" in props ? props.redirectTo : undefined;
  const routedToRef = useRef<string | null>(null);

  useEffect(() => {
    if (!checked && !loading) fetchMe();
  }, [checked, loading, fetchMe]);

  useEffect(() => {
    if (!checked || authStatus !== "authed") return;

    const storedTrack = usePreferredProductEntry
      ? readPreferredProductTrack(window.localStorage, me?.userId)
      : null;
    const decision = usePreferredProductEntry
      ? resolvePreferredProductEntryDecision({
          storedTrack,
          planCategory: me?.usagePlanCategory,
        })
      : null;
    const redirectTo = decision?.path ?? fixedRedirectTo;

    if (!redirectTo || routedToRef.current === redirectTo) return;
    routedToRef.current = redirectTo;

    window.posthog?.capture?.("product_entry_routed", {
      destination: redirectTo,
      track: decision?.track ?? (redirectTo.startsWith("/resume") ? "resume" : "press"),
      reason: decision?.reason ?? "explicit-product-root",
    });
    router.replace(redirectTo);
  }, [
    authStatus,
    checked,
    fixedRedirectTo,
    me?.usagePlanCategory,
    me?.userId,
    router,
    usePreferredProductEntry,
  ]);

  return null;
}
