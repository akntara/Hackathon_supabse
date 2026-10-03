"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestQuestionGroup } from "@/lib/group-question-client";
import type { QuestionGroupRow, QuestionRow } from "@/lib/types";

const RECENT_MS = 2 * 60 * 1000;

/**
 * Groups questions that were just created. Older ungrouped questions wait for
 * an explicit pass so opening the dashboard does not embed the whole history.
 */
export function useGroupQuestions({
  questions,
  eventId,
  patchQuestion,
  upsertGroup,
}: {
  questions: QuestionRow[];
  eventId: string;
  patchQuestion: (id: string, patch: Partial<QuestionRow>) => void;
  upsertGroup: (group: QuestionGroupRow) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [grouping, setGrouping] = useState(false);
  const questionsRef = useRef(questions);
  questionsRef.current = questions;
  const attempted = useRef(new Set<string>());
  const queue = useRef<string[]>([]);
  const pumping = useRef(false);
  const patchRef = useRef(patchQuestion);
  const upsertRef = useRef(upsertGroup);
  patchRef.current = patchQuestion;
  upsertRef.current = upsertGroup;

  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    setGrouping(true);
    try {
      while (queue.current.length > 0) {
        const id = queue.current.shift();
        if (!id || attempted.current.has(id)) continue;
        const current = questionsRef.current.find((question) => question.id === id);
        if (!current || current.group_id) {
          attempted.current.add(id);
          continue;
        }
        attempted.current.add(id);
        const result = await requestQuestionGroup(id);
        if (!result.ok) {
          setError(result.error);
          continue;
        }
        setError(null);
        const now = new Date().toISOString();
        upsertRef.current({
          id: result.groupId,
          event_id: eventId,
          name: result.name,
          kind: "ai",
          position: 0,
          created_at: now,
          updated_at: now,
        });
        patchRef.current(id, { group_id: result.groupId });
      }
    } finally {
      pumping.current = false;
      setGrouping(false);
      if (queue.current.length > 0) void pump();
    }
  }, [eventId]);

  const enqueue = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        if (!attempted.current.has(id) && !queue.current.includes(id)) queue.current.push(id);
      }
      void pump();
    },
    [pump],
  );

  useEffect(() => {
    const recent = questions
      .filter((question) => {
        if (question.group_id || attempted.current.has(question.id)) return false;
        return Date.now() - new Date(question.created_at).getTime() < RECENT_MS;
      })
      .map((question) => question.id);
    if (recent.length > 0) enqueue(recent);
  }, [questions, enqueue]);

  const groupUngrouped = useCallback(() => {
    const ids = questionsRef.current.filter((question) => !question.group_id).map((question) => question.id);
    for (const id of ids) attempted.current.delete(id);
    enqueue(ids);
  }, [enqueue]);

  const ungroupedCount = questions.filter((question) => !question.group_id).length;

  return { error, grouping, ungroupedCount, groupUngrouped };
}
