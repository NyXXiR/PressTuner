"use client";

import { useEffect } from "react";
import { useMeStore } from "@/stores/useMeStore";

/** 페이지 진입 시 me 정보를 1회 새로고침 */
export function RefreshMeOnMount() {
  useEffect(() => {
    // zustand action은 getState로 안전하게 호출 가능
    useMeStore.getState().fetchMe();
  }, []);

  return null;
}
