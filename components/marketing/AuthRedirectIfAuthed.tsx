"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useMeStore } from "@/stores/useMeStore";

export function AuthRedirectIfAuthed({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const { authStatus, checked, loading, fetchMe } = useMeStore();
  const routedToRef = useRef<string | null>(null);

  useEffect(() => {
    if (!checked && !loading) fetchMe();
  }, [checked, loading, fetchMe]);

  useEffect(() => {
    if (!checked || authStatus !== "authed") return;

    if (!redirectTo || routedToRef.current === redirectTo) return;
    routedToRef.current = redirectTo;

    window.posthog?.capture?.("product_entry_routed", {
      destination: redirectTo,
      track: redirectTo.startsWith("/resume") ? "resume" : "press",
      reason: "explicit-product-root",
    });
    router.replace(redirectTo);
  }, [authStatus, checked, redirectTo, router]);

  return null;
}
