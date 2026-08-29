export type ProductTrack = "press" | "resume";
export const PRODUCT_TRACK_STORAGE_KEY =
  "briefflow:preferred-product-track:v1:browser";

export function productTrackFromPathname(pathname: string): ProductTrack | null {
  if (pathname === "/resume" || pathname.startsWith("/resume/")) {
    return "resume";
  }

  if (pathname === "/press" || pathname.startsWith("/press/")) {
    return "press";
  }

  return null;
}

export function productRootPath(track: ProductTrack): string {
  return track === "resume" ? "/resume" : "/press";
}

export function readPreferredProductTrack(
  storage: Pick<Storage, "getItem">,
): ProductTrack | null {
  try {
    const value = storage.getItem(PRODUCT_TRACK_STORAGE_KEY);

    return value === "press" || value === "resume" ? value : null;
  } catch {
    return null;
  }
}

export function rememberPreferredProductTrack(
  storage: Pick<Storage, "setItem">,
  track: ProductTrack,
): void {
  try {
    storage.setItem(PRODUCT_TRACK_STORAGE_KEY, track);
  } catch {
    // Browsing must continue when storage is unavailable or blocked.
  }
}
