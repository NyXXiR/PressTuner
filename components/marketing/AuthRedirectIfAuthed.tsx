"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useMeStore } from "@/stores/useMeStore";

export function AuthRedirectIfAuthed({
  redirectTo,
}: {
  redirectTo: string;
}) {
  const router = useRouter();
  const { authStatus, checked, loading, fetchMe } = useMeStore();

  useEffect(() => {
    if (!checked && !loading) fetchMe();
  }, [checked, loading, fetchMe]);

  useEffect(() => {
    if (checked && authStatus === "authed") router.replace(redirectTo);
  }, [authStatus, checked, redirectTo, router]);

  return null;
}
