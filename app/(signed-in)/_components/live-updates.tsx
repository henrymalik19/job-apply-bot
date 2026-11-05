"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Live updates over Supabase Realtime (websockets): when one of your notifications arrives or one of your
 * applications changes (the runner, email tracking, prepare), the page's server data is fetched again, a
 * moment later so a burst of changes is one refresh. Each user only receives their own rows.
 *
 * @param token - Your current access token, from the server render (a refresh brings a new one).
 */
export function LiveUpdates({ url, anonKey, token, userId }: { url: string; anonKey: string; token: string; userId: string }) {
  const router = useRouter();
  const client = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    client.current = supabase;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 600);
    };
    supabase.realtime.setAuth(token);
    const channel = supabase
      .channel(`live-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "applications", filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
      client.current = null;
    };
    // The token changes on every refresh; it's handed to the open connection below instead of reconnecting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, anonKey, userId, router]);

  useEffect(() => {
    void client.current?.realtime.setAuth(token);
  }, [token]);

  return null;
}
