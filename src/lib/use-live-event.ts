"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { mergeDuplicateTopics } from "@/lib/topic-groups";
import type { PublicEvent, QuestionGroupRow, QuestionRow } from "@/lib/types";

export type ConnectionState = "connecting" | "live" | "offline";

type Options<TEvent extends PublicEvent> = {
  event: TEvent;
  initialQuestions?: QuestionRow[];
  initialGroups?: QuestionGroupRow[];
  /** Wait for an auth session before subscribing (RLS needs it). */
  enabled?: boolean;
  /**
   * Organizers keep hidden questions in their list. Attendees drop them
   * when the organizer broadcasts a removal (RLS suppresses the UPDATE).
   */
  isOrganizer?: boolean;
};

const REMOVED_EVENT = "question_removed";

export function useLiveEvent<TEvent extends PublicEvent = PublicEvent>({
  event: initialEvent,
  initialQuestions,
  initialGroups,
  enabled = true,
  isOrganizer = false,
}: Options<TEvent>) {
  const supabase = createClient();
  const [event, setEvent] = useState(initialEvent);
  const [questions, setQuestions] = useState<QuestionRow[]>(initialQuestions ?? []);
  const [groups, setGroups] = useState<QuestionGroupRow[]>(initialGroups ?? []);
  const [loading, setLoading] = useState(!initialQuestions);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const hasSubscribedRef = useRef(false);

  const refetch = useCallback(async () => {
    const questionsQuery = supabase
      .from("questions")
      .select("*")
      .eq("event_id", initialEvent.id)
      .order("created_at", { ascending: false })
      .limit(1000);
    const eventQuery = supabase.from("events").select("*").eq("id", initialEvent.id).maybeSingle();
    const groupsQuery = supabase
      .from("question_groups")
      .select("*")
      .eq("event_id", initialEvent.id)
      .order("created_at", { ascending: true });

    const [{ data: q }, { data: e }, groupsResult] = await Promise.all([
      questionsQuery,
      eventQuery,
      groupsQuery,
    ]);
    if (q) setQuestions(q);
    if (e) setEvent(e as unknown as TEvent);
    if (groupsResult.data) setGroups(groupsResult.data);
    setLoading(false);
  }, [supabase, initialEvent.id]);

  const upsert = useCallback((row: QuestionRow) => {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === row.id);
      if (idx === -1) return [row, ...prev];
      const next = prev.slice();
      next[idx] = row;
      return next;
    });
  }, []);

  const patchQuestion = useCallback((id: string, patch: Partial<QuestionRow>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const remove = useCallback((id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const upsertGroup = useCallback((row: QuestionGroupRow) => {
    setGroups((prev) => {
      const idx = prev.findIndex((group) => group.id === row.id);
      if (idx === -1) return [...prev, row];
      const next = prev.slice();
      next[idx] = { ...next[idx], ...row };
      return next;
    });
  }, []);

  const removeGroup = useCallback((id: string) => {
    setGroups((prev) => prev.filter((group) => group.id !== id));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const fetchOnFirstSubscribe = !initialQuestions;

    let channel = supabase
      .channel(`event:${initialEvent.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "questions",
          filter: `event_id=eq.${initialEvent.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as Partial<QuestionRow>).id;
            if (id) remove(id);
          } else {
            upsert(payload.new as QuestionRow);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "events",
          filter: `id=eq.${initialEvent.id}`,
        },
        (payload) => setEvent(payload.new as TEvent),
      )
      .on("broadcast", { event: REMOVED_EVENT }, ({ payload }) => {
        if (!isOrganizer && payload?.id) remove(payload.id as string);
      });

    {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "question_groups",
          filter: `event_id=eq.${initialEvent.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as Partial<QuestionGroupRow>).id;
            if (id) removeGroup(id);
          } else {
            upsertGroup(payload.new as QuestionGroupRow);
          }
        },
      );
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnection("live");
        // Fetch after subscribing so no change slips between the two;
        // on reconnect, catch up on anything missed while offline.
        if (hasSubscribedRef.current || fetchOnFirstSubscribe) void refetch();
        hasSubscribedRef.current = true;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnection("offline");
        if (fetchOnFirstSubscribe && !hasSubscribedRef.current) void refetch();
      }
    });

    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
    // initialQuestions is only used for the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, supabase, initialEvent.id, isOrganizer, refetch, upsert, remove, upsertGroup, removeGroup]);

  const broadcastRemoved = useCallback((id: string) => {
    void channelRef.current?.send({
      type: "broadcast",
      event: REMOVED_EVENT,
      payload: { id },
    });
  }, []);

  const merged = useMemo(() => mergeDuplicateTopics(questions, groups), [questions, groups]);

  return {
    event,
    setEvent,
    questions: merged.questions,
    groups: merged.groups,
    loading,
    connection,
    upsert,
    patchQuestion,
    remove,
    upsertGroup,
    refetch,
    broadcastRemoved,
  };
}
