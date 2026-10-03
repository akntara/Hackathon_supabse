"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { QuestionRow } from "@/lib/types";

const QUIET_MS = 4000;

/**
 * Re-clusters the event's topics after new questions arrive. Waits until no new
 * question has come in for a few seconds, runs one pass at a time, and runs
 * again afterwards if more questions arrived during a pass.
 */
export function useAutoRecluster({
  eventId,
  questions,
  refetch,
}: {
  eventId: string;
  questions: QuestionRow[];
  refetch: () => Promise<void>;
}) {
  const [reclustering, setReclustering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const known = useRef<Set<string> | null>(null);
  const timer = useRef<number | null>(null);
  const running = useRef(false);
  const dirty = useRef(false);
  const refetchRef = useRef(refetch);
  useLayoutEffect(() => {
    refetchRef.current = refetch;
  });

  const run = useCallback(async () => {
    if (running.current) {
      dirty.current = true;
      return;
    }
    running.current = true;
    setReclustering(true);
    try {
      do {
        dirty.current = false;
        try {
          const res = await fetch("/api/topics/recluster", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId }),
          });
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          setError(res.ok ? null : payload.error || "Could not re-cluster topics.");
          await refetchRef.current();
        } catch {
          setError("Could not reach the clustering service.");
        }
      } while (dirty.current);
    } finally {
      running.current = false;
      setReclustering(false);
    }
  }, [eventId]);

  useEffect(() => {
    const ids = questions.map((q) => q.id);
    if (known.current === null) {
      known.current = new Set(ids);
      return;
    }
    const seen = known.current;
    const fresh = ids.filter((id) => !seen.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => seen.add(id));

    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void run();
    }, QUIET_MS);
  }, [questions, run]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  return { reclustering, error };
}
