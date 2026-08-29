export type ProductTrack = "press" | "resume";
export type ProductEntryReason = "recent-track" | "plan-category";
export type ProductEntryDecision = {
  path: string;
  track: ProductTrack;
  reason: ProductEntryReason;
};

type ProductPlanCategory = "PRESS" | "CAREER" | "STANDARD" | null | undefined;

const PREFERENCE_STORAGE_PREFIX = "briefflow:preferred-product-track:v1";

export function productTrackFromPathname(pathname: string): ProductTrack | null {
  if (pathname === "/resume" || pathname.startsWith("/resume/")) {
    return "resume";
  }

  if (pathname === "/press" || pathname.startsWith("/press/")) {
    return "press";
  }

  return null;
}

export function productEntryPath(track: ProductTrack): string {
  return track === "resume" ? "/resume/dashboard" : "/press/dashboard";
}

export function preferredProductTrackStorageKey(userId?: string | null): string {
  return `${PREFERENCE_STORAGE_PREFIX}:${userId || "browser"}`;
}

export function readPreferredProductTrack(
  storage: Pick<Storage, "getItem">,
  userId?: string | null,
): ProductTrack | null {
  try {
    const userPreference = userId
      ? storage.getItem(preferredProductTrackStorageKey(userId))
      : null;
    const browserPreference = storage.getItem(preferredProductTrackStorageKey());
    const value = userPreference ?? browserPreference;

    return value === "press" || value === "resume" ? value : null;
  } catch {
    return null;
  }
}

export function rememberPreferredProductTrack(
  storage: Pick<Storage, "setItem">,
  track: ProductTrack,
  userId?: string | null,
): void {
  try {
    storage.setItem(preferredProductTrackStorageKey(), track);
    if (userId) {
      storage.setItem(preferredProductTrackStorageKey(userId), track);
    }
  } catch {
    // Browsing must continue when storage is unavailable or blocked.
  }
}

export function resolvePreferredProductEntry(input: {
  storedTrack?: ProductTrack | null;
  planCategory?: ProductPlanCategory;
}): string | null {
  return resolvePreferredProductEntryDecision(input)?.path ?? null;
}

export function resolvePreferredProductEntryDecision(input: {
  storedTrack?: ProductTrack | null;
  planCategory?: ProductPlanCategory;
}): ProductEntryDecision | null {
  if (input.storedTrack) {
    return {
      path: productEntryPath(input.storedTrack),
      track: input.storedTrack,
      reason: "recent-track",
    };
  }

  if (input.planCategory === "CAREER") {
    return {
      path: productEntryPath("resume"),
      track: "resume",
      reason: "plan-category",
    };
  }

  if (input.planCategory === "PRESS") {
    return {
      path: productEntryPath("press"),
      track: "press",
      reason: "plan-category",
    };
  }

  return null;
}
