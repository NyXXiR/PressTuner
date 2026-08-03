// lib/fetchWithLoading.ts
import { useUiStore } from "@/stores/useUiStore";

export async function fetchWithLoading(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  const { startLoading, endLoading } = useUiStore.getState();
  startLoading();
  try {
    return await fetch(input, init);
  } finally {
    endLoading();
  }
}
