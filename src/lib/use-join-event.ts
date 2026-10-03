"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Ensures an auth session (anonymous if needed) and joins the event by its
 * public code. RLS only exposes event data to joined participants.
 */
export function useJoinEvent(code: string) {
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      let id = data.session?.user.id ?? null;
      if (!id) {
        const { data: anon, error } = await supabase.auth.signInAnonymously();
        if (error || !anon.user) {
          if (!cancelled) setError(error?.message ?? "Could not start a session.");
          return;
        }
        id = anon.user.id;
      }

      const { error: joinError } = await supabase.rpc("join_event", { p_code: code });
      if (cancelled) return;
      if (joinError) setError(joinError.message);
      else setUserId(id);
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  return { userId, error };
}
