"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { deleteEvent } from "@/app/dashboard/actions";
import { createClient } from "@/lib/supabase/client";
import { explainSchemaError } from "@/lib/schema-hint";
import {
  buildClusterIndex,
  buildTopicGroups,
  similarLiveQuestions,
  type TopicCluster,
} from "@/lib/topic-groups";
import type { EventRow, QuestionGroupRow, QuestionRow, QuestionStatus } from "@/lib/types";
import { useAutoRecluster } from "@/lib/use-auto-recluster";
import { useGroupQuestions } from "@/lib/use-group-questions";
import { useLiveEvent } from "@/lib/use-live-event";
import { sortQuestions, type SortMode } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import {
  ArrowLeftIcon,
  ChatIcon,
  CheckIcon,
  ExternalIcon,
  EyeIcon,
  EyeOffIcon,
  MonitorIcon,
  PinIcon,
  TrashIcon,
  UndoIcon,
} from "./icons";
import { EventQr, useAttendeeUrl } from "./event-qr";
import { QuestionCard, useNow } from "./question-card";
import { TopicBoard } from "./topic-board";
import { TopicMap } from "./topic-map";
import { Badge, Button, ButtonLink, Card, EmptyState, LiveIndicator, SegmentedControl, Spinner } from "./ui";

type Tab = QuestionStatus;
type Board = "map" | "topics" | "queue";

export function OrganizerConsole({
  event: initialEvent,
  initialQuestions,
  initialGroups,
  shareOrigin,
}: {
  event: EventRow;
  initialQuestions: QuestionRow[];
  initialGroups: QuestionGroupRow[];
  shareOrigin?: string | null;
}) {
  const supabase = createClient();
  const now = useNow();
  const {
    event,
    setEvent,
    questions,
    groups,
    upsert,
    patchQuestion,
    remove,
    upsertGroup,
    connection,
    broadcastRemoved,
    refetch,
  } = useLiveEvent<EventRow>({
    event: initialEvent,
    initialQuestions,
    initialGroups,
    isOrganizer: true,
  });

  const { error: groupError, grouping, groupUngrouped } = useGroupQuestions({
    questions,
    eventId: event.id,
    patchQuestion,
    upsertGroup,
  });

  const { reclustering, error: reclusterError } = useAutoRecluster({
    eventId: event.id,
    questions,
    refetch,
  });

  const thresholdTimer = useRef<number | null>(null);
  const [board, setBoard] = useState<Board>("map");
  const [tab, setTab] = useState<Tab>("live");
  const [sort, setSort] = useState<SortMode>("top");
  const [busy, setBusy] = useState<string | null>(null);
  const [busyTopic, setBusyTopic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { live: 0, answered: 0, hidden: 0, votes: 0 };
    for (const q of questions) {
      c[q.status]++;
      c.votes += q.upvotes;
    }
    return c;
  }, [questions]);

  const pinned = questions.find((q) => q.is_pinned && q.status === "live");
  const clustered = useMemo(() => buildTopicGroups(questions, groups), [questions, groups]);
  const clusterIndex = useMemo(() => buildClusterIndex(questions, groups), [questions, groups]);
  const pinnedSimilar = useMemo(() => similarLiveQuestions(pinned, questions), [pinned, questions]);
  const togetherIds = useMemo(() => new Set(pinnedSimilar.map((q) => q.id)), [pinnedSimilar]);
  const threshold = Number.isFinite(Number(event.similarity_threshold))
    ? Number(event.similarity_threshold)
    : 0.82;
  const visible = useMemo(
    () =>
      sortQuestions(
        questions.filter((q) => q.status === tab && !q.is_pinned && !togetherIds.has(q.id)),
        sort,
      ),
    [questions, tab, sort, togetherIds],
  );

  const attendeePath = `/e/${event.code}`;
  const attendeeUrl = useAttendeeUrl(event.code, shareOrigin);

  async function updateQuestion(q: QuestionRow, patch: Partial<QuestionRow>) {
    setBusy(q.id);
    setError(null);
    if (patch.is_pinned) {
      questions
        .filter((other) => other.is_pinned && other.id !== q.id)
        .forEach((other) => upsert({ ...other, is_pinned: false }));
    }
    upsert({ ...q, ...patch });

    const { data, error } = await supabase
      .from("questions")
      .update(patch)
      .eq("id", q.id)
      .select("*")
      .single();

    if (error) {
      upsert(q);
      setError(error.message);
    } else {
      upsert(data);
      if (data.status === "hidden") broadcastRemoved(data.id);
    }
    setBusy(null);
  }

  async function takeUpTopic(topic: TopicCluster) {
    const current = topic.live.find((q) => q.is_pinned);
    if (current) return updateQuestion(current, { is_pinned: false });
    if (topic.representative) return updateQuestion(topic.representative, { is_pinned: true });
  }

  async function answerTopic(topic: TopicCluster) {
    const open = topic.live;
    if (open.length === 0) return;
    setBusyTopic(topic.id);
    setError(null);
    open.forEach((q) => upsert({ ...q, status: "answered", is_pinned: false }));

    const { data, error } = await supabase
      .from("questions")
      .update({ status: "answered" })
      .eq("event_id", event.id)
      .in(
        "id",
        open.map((q) => q.id),
      )
      .eq("status", "live")
      .select("*");

    if (error) {
      open.forEach((q) => upsert(q));
      setError(error.message);
    } else {
      data?.forEach((row) => upsert(row));
    }
    setBusyTopic(null);
  }

  async function deleteQuestion(q: QuestionRow) {
    if (!confirm("Delete this question permanently?")) return;
    setBusy(q.id);
    remove(q.id);
    const { error } = await supabase.from("questions").delete().eq("id", q.id);
    if (error) {
      upsert(q);
      setError(error.message);
    } else {
      broadcastRemoved(q.id);
    }
    setBusy(null);
  }

  async function toggleOpen() {
    const next = !event.is_open;
    setEvent({ ...event, is_open: next });
    const { error } = await supabase.from("events").update({ is_open: next }).eq("id", event.id);
    if (error) {
      setEvent({ ...event, is_open: !next });
      setError(error.message);
    }
  }

  function saveThreshold(next: number) {
    const rounded = Math.round(next * 100) / 100;
    setEvent((current) => ({ ...current, similarity_threshold: rounded }));
    if (thresholdTimer.current) window.clearTimeout(thresholdTimer.current);
    thresholdTimer.current = window.setTimeout(() => {
      void supabase
        .from("events")
        .update({ similarity_threshold: rounded })
        .eq("id", event.id)
        .then(({ error: updateError }) => {
          if (updateError) setError(updateError.message);
        });
    }, 400);
  }

  function renderActions(q: QuestionRow) {
    const disabled = busy === q.id;
    return (
      <>
        {q.status === "live" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => updateQuestion(q, { is_pinned: !q.is_pinned })}
          >
            <PinIcon className="size-4" />
            {q.is_pinned ? "Unpin" : "Pin"}
          </Button>
        )}
        {q.status === "live" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => updateQuestion(q, { status: "answered" })}
          >
            <CheckIcon className="size-4" />
            Answered
          </Button>
        )}
        {q.status !== "live" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => updateQuestion(q, { status: "live" })}
          >
            {q.status === "hidden" ? <EyeIcon className="size-4" /> : <UndoIcon className="size-4" />}
            {q.status === "hidden" ? "Restore" : "Reopen"}
          </Button>
        )}
        {q.status !== "hidden" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => updateQuestion(q, { status: "hidden" })}
          >
            <EyeOffIcon className="size-4" />
            Hide
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => deleteQuestion(q)}
          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          aria-label="Delete question"
        >
          <TrashIcon className="size-4" />
        </Button>
      </>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeftIcon className="size-4" /> All events
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{event.title}</h1>
              <LiveIndicator state={connection} />
            </div>
            {event.description && (
              <p className="mt-1 max-w-2xl text-sm text-slate-500">{event.description}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href={`${attendeePath}/present`} target="_blank" variant="secondary">
              <MonitorIcon className="size-4" /> Present
            </ButtonLink>
            <ButtonLink href={attendeePath} target="_blank" variant="secondary">
              <ExternalIcon className="size-4" /> Attendee view
            </ButtonLink>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <Card className="bg-brand relative flex flex-col gap-4 overflow-hidden p-5 text-white ring-0 shadow-xl shadow-fuchsia-500/20 sm:flex-row sm:items-center sm:justify-between">
          <div aria-hidden className="bg-dots absolute inset-0" />
          <div className="relative flex min-w-0 items-center gap-4">
            <EventQr code={event.code} shareOrigin={shareOrigin} size={96} className="p-2" />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-white/70">Scan to ask a question</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-widest">
                {event.code}
              </p>
              <p className="mt-0.5 truncate text-sm text-white/80">
                {attendeeUrl.replace(/^https?:\/\//, "")}
              </p>
            </div>
          </div>
          <div className="relative">
            <CopyButton value={attendeeUrl || attendeePath} />
          </div>
        </Card>

        <Card className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-medium text-slate-900">Accepting questions</p>
            <p className="mt-0.5 text-sm text-slate-500">
              {event.is_open ? "Attendees can submit new questions." : "Submissions are paused."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={event.is_open}
            onClick={toggleOpen}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
              event.is_open ? "bg-linear-to-r from-violet-600 to-fuchsia-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`mt-0.5 inline-block size-5 rounded-full bg-white shadow transition-transform ${
                event.is_open ? "translate-x-5.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </Card>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Live", counts.live],
          ["Answered", counts.answered],
          ["Hidden", counts.hidden],
          ["Upvotes", counts.votes],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <dt className="text-xs font-medium text-slate-500">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</dd>
          </Card>
        ))}
      </dl>

      {(error || groupError || reclusterError) && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {explainSchemaError(error || groupError || reclusterError || "")}
        </p>
      )}

      {pinned && (
        <div className="bg-brand rounded-2xl p-1.5 shadow-xl shadow-fuchsia-500/20">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-1.5 pt-1 text-white">
            <p className="text-xs font-semibold uppercase tracking-wide">Now answering</p>
            {pinnedSimilar.length > 0 && (
              <p className="text-xs text-white/85">
                + {pinnedSimilar.length} similar question{pinnedSimilar.length === 1 ? "" : "s"} answered together
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <QuestionCard question={pinned} now={now} actions={renderActions(pinned)} />
            {pinnedSimilar.map((q) => (
              <QuestionCard key={q.id} question={q} now={now} answeringTogether actions={renderActions(q)} />
            ))}
          </div>
        </div>
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            value={board}
            onChange={setBoard}
            options={[
              { value: "map", label: "Topic map" },
              { value: "topics", label: <TabLabel label="Topics" count={clustered.topics.length} /> },
              { value: "queue", label: <TabLabel label="All questions" count={questions.length} /> },
            ]}
          />
          {board === "queue" ? (
            <SegmentedControl
              value={sort}
              onChange={setSort}
              options={[
                { value: "top", label: "Top" },
                { value: "recent", label: "Recent" },
              ]}
            />
          ) : (
            reclustering && (
              <span className="flex items-center gap-2 text-sm text-slate-500">
                <Spinner className="size-4 text-fuchsia-600" />
                Re-organizing topics
              </span>
            )
          )}
        </div>

        {board === "map" ? (
          <TopicMap
            topics={clustered.topics}
            pendingCount={clustered.pending.length}
            busyTopic={busyTopic}
            onTakeUp={takeUpTopic}
            onAnswerAll={answerTopic}
          />
        ) : board === "topics" ? (
          <div className="space-y-4">
            <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Similarity threshold</p>
                <p className="text-sm text-slate-500">
                  A new question joins an existing topic when its embedding is at least this similar.
                  Otherwise it starts a new topic.
                </p>
              </div>
              <label className="flex items-center gap-3">
                <span className="sr-only">Similarity threshold</span>
                <input
                  type="range"
                  min={0.5}
                  max={0.99}
                  step={0.01}
                  value={Math.min(0.99, Math.max(0.5, threshold))}
                  onChange={(e) => saveThreshold(Number(e.target.value))}
                  className="w-40 accent-fuchsia-600"
                />
                <span className="w-12 text-right font-mono text-sm tabular-nums text-slate-700">
                  {threshold.toFixed(2)}
                </span>
              </label>
            </Card>
            <TopicBoard
              topics={clustered.topics}
              pending={clustered.pending}
              grouping={grouping}
              busyTopic={busyTopic}
              onGroupPending={groupUngrouped}
              onTakeUp={takeUpTopic}
              onAnswerAll={answerTopic}
              renderActions={renderActions}
            />
          </div>
        ) : (
          <>
        <div className="mb-4">
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: "live", label: <TabLabel label="Live" count={counts.live} /> },
              { value: "answered", label: <TabLabel label="Answered" count={counts.answered} /> },
              { value: "hidden", label: <TabLabel label="Hidden" count={counts.hidden} /> },
            ]}
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={<ChatIcon className="size-8" />}
            title={
              tab === "live" ? "No questions yet" : tab === "answered" ? "Nothing answered yet" : "No hidden questions"
            }
            description={
              tab === "live"
                ? "Share the code above. New questions will appear here instantly."
                : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {visible.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                now={now}
                cluster={clusterIndex.get(q.id)}
                answeringTogether={togetherIds.has(q.id)}
                actions={renderActions(q)}
              />
            ))}
          </div>
        )}
          </>
        )}
      </section>

      <Card className="flex flex-col gap-3 border-rose-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">Delete event</p>
          <p className="text-sm text-slate-500">Permanently removes the event and all its questions.</p>
        </div>
        <form
          action={deleteEvent}
          onSubmit={(e) => {
            if (!confirm(`Delete "${event.title}"? This cannot be undone.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={event.id} />
          <Button type="submit" variant="danger">
            <TrashIcon className="size-4" /> Delete event
          </Button>
        </form>
      </Card>
    </div>
  );
}

function TabLabel({ label, count }: { label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <Badge className="px-1.5 py-0 tabular-nums">{count}</Badge>
    </span>
  );
}
