"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * A fallback for keeping a page's server data current: live updates (LiveUpdates, over Supabase Realtime)
 * refresh it as soon as something changes; this also re-fetches every `everyMs` while the tab is visible,
 * and right away when you come back to it, in case the live connection dropped.
 * Scroll position and anything open on the page stay as they are.
 */
export function LiveRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, everyMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, everyMs]);
  return null;
}
